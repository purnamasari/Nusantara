// Procedural soundtrack, ambience and effects (Web Audio; no audio files).
//
// Graph:  voices → music / sfx / ambience buses → master → limiter → speakers
//         each bus also feeds a shared reverb (generated impulse response).
// Music comes from the seeded Composer, scheduled ahead of time on the audio clock.

import type { AudioTheme } from '../../content/types.ts';
import { mulberry32 } from '../../lib/rng.ts';
import { clamp } from '../../lib/math.ts';
import { Composer } from './composer.ts';
import type { NoteEvent } from './composer.ts';
import { degreeFrequency, renderAngklung, renderGong, renderImpulseResponse, renderNoise, renderPluck } from './dsp.ts';

export type SurfaceKind = 'grass' | 'stone' | 'crystal';

export interface AudioFrame {
  /** True while gameplay is live (not paused, not in a menu). */
  active: boolean;
  flying: boolean;
  grounded: boolean;
  altitude: number;
  speed: number;
  surface: SurfaceKind;
  x: number;
  z: number;
  yaw: number;
  spirit: { x: number; z: number; degree: number } | null;
  lake: { x: number; z: number; radius: number } | null;
  complete: boolean;
}

export interface AudioVolumes {
  music: number;
  sfx: number;
}

const LOOKAHEAD = 0.3;
const TICK_MS = 50;
const SYNTH_RATE = 32000;

interface Pad {
  oscs: OscillatorNode[];
  filter: BiquadFilterNode;
  gain: GainNode;
  degree: number;
}

export class AudioEngine {
  private ctx: BaseAudioContext | null = null;
  private offline = false;
  private master!: GainNode;
  private musicBus!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private musicDuck!: GainNode;
  private sfxBus!: GainNode;
  private ambienceBus!: GainNode;
  private reverbIn!: GainNode;
  private theme: AudioTheme | null = null;
  private composer: Composer | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private prewarm: (() => void)[] = [];
  private noise: AudioBuffer | null = null;
  private nextTickTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pad: Pad | null = null;
  private wind: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private hum: { a: OscillatorNode; b: OscillatorNode; gain: GainNode; pan: StereoPannerNode } | null = null;
  private frame: AudioFrame | null = null;
  private stepAccum = 0;
  private stepSide = 1;
  private nextBirdAt = 0;
  private nextShimmerAt = 0;
  private lastLead = { end: -1, freq: 0 };
  private rand = mulberry32(99);
  private volumes: AudioVolumes = { music: 0.7, sfx: 0.8 };
  private ducked = false;
  scheduledNotes = 0;

  get running(): boolean {
    return this.ctx !== null && (this.offline || this.ctx.state === 'running');
  }

  /**
   * Must be called from a user gesture (browsers only allow sound after interaction).
   * Passing an OfflineAudioContext renders without real-time playback (used for previews).
   */
  init(offline?: OfflineAudioContext): void {
    if (this.ctx) {
      this.resume();
      return;
    }
    try {
      let ctx: BaseAudioContext;
      if (offline) {
        ctx = offline;
        this.offline = true;
      } else {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor({ latencyHint: 'interactive' });
      }
      this.ctx = ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 6;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      limiter.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(limiter);

      const reverb = ctx.createConvolver();
      const [l, r] = renderImpulseResponse(ctx.sampleRate, 2.6, 2.4, 11);
      const ir = ctx.createBuffer(2, l.length, ctx.sampleRate);
      ir.copyToChannel(l as Float32Array<ArrayBuffer>, 0);
      ir.copyToChannel(r as Float32Array<ArrayBuffer>, 1);
      reverb.buffer = ir;
      this.reverbIn = ctx.createGain();
      this.reverbIn.gain.value = 0.6;
      this.reverbIn.connect(reverb).connect(this.master);

      this.musicDuck = ctx.createGain();
      this.musicDuck.connect(this.master);
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 18000;
      this.musicFilter.connect(this.musicDuck);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.musicFilter);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.ambienceBus = ctx.createGain();
      this.ambienceBus.connect(this.master);
      for (const [bus, wet] of [[this.musicFilter, 0.4], [this.sfxBus, 0.25], [this.ambienceBus, 0.3]] as const) {
        const send = ctx.createGain();
        send.gain.value = wet;
        bus.connect(send).connect(this.reverbIn);
      }

      const noise = renderNoise(SYNTH_RATE, 3, 5);
      const noiseR = renderNoise(SYNTH_RATE, 3, 6);
      this.noise = ctx.createBuffer(2, noise.length, SYNTH_RATE);
      this.noise.copyToChannel(noise as Float32Array<ArrayBuffer>, 0);
      this.noise.copyToChannel(noiseR as Float32Array<ArrayBuffer>, 1);
      this.applyVolumes();
      this.resume();
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(v: AudioVolumes): void {
    this.volumes = { music: clamp(v.music, 0, 1), sfx: clamp(v.sfx, 0, 1) };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.ambienceBus.gain.setTargetAtTime(this.volumes.sfx * (this.ducked ? 0.35 : 1), t, 0.1);
  }

  /** Loads a region's audio theme and starts its music and ambience. */
  setTheme(theme: AudioTheme, seed: number): void {
    this.theme = theme;
    this.composer = new Composer(theme, seed);
    this.rand = mulberry32(seed ^ 0x5bd1e995);
    const ctx = this.ctx;
    if (!ctx) return;
    this.stopContinuous();
    // Pre-render the most common instrument notes a few per tick, so playback never stalls.
    const n = theme.scaleCents.length;
    this.prewarm = [];
    for (let d = 0; d < n; d++) this.prewarm.push(() => this.pluckBuffer(degreeFrequency(theme, d, -1)));
    for (let d = 0; d < 2 * n; d++) this.prewarm.push(() => this.pluckBuffer(degreeFrequency(theme, d, 0)));
    for (let d = 0; d < n; d++) this.prewarm.push(() => this.angklungBuffer(degreeFrequency(theme, d, 0)));
    this.prewarm.push(() => this.gongBuffer(degreeFrequency(theme, 0, -2)));
    for (let d = 0; d < n; d++) this.prewarm.push(() => this.gongBuffer(degreeFrequency(theme, d, -1)));
    for (let d = 0; d < n; d++) this.prewarm.push(() => this.angklungBuffer(degreeFrequency(theme, d, 1)));
    this.startContinuous();
    this.nextTickTime = ctx.currentTime + 0.2;
    this.nextBirdAt = ctx.currentTime + 3;
    if (!this.timer && !this.offline) this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  suspend(): void {
    if (this.ctx instanceof AudioContext) void this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (this.ctx instanceof AudioContext) void this.ctx.resume().catch(() => {});
  }

  // ------------------------------------------------------------- buffers

  private cached(key: string, make: () => AudioBuffer): AudioBuffer {
    let b = this.buffers.get(key);
    if (!b) {
      b = make();
      this.buffers.set(key, b);
    }
    return b;
  }

  private toBuffer(data: Float32Array, rate: number): AudioBuffer {
    const b = this.ctx!.createBuffer(1, data.length, rate);
    b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    return b;
  }

  private pluckBuffer(freq: number): AudioBuffer {
    return this.cached(`pluck:${freq.toFixed(2)}`, () => this.toBuffer(renderPluck(freq, SYNTH_RATE, 2.6, 0.72, 2.4, Math.round(freq)), SYNTH_RATE));
  }

  private angklungBuffer(freq: number): AudioBuffer {
    return this.cached(`angklung:${freq.toFixed(2)}`, () => this.toBuffer(renderAngklung(freq, SYNTH_RATE, 1.5, Math.round(freq)), SYNTH_RATE));
  }

  private gongBuffer(freq: number): AudioBuffer {
    return this.cached(`gong:${freq.toFixed(2)}`, () => this.toBuffer(renderGong(freq, 24000, 5, Math.round(freq)), 24000));
  }

  // ------------------------------------------------------------- primitive voices

  private play(buf: AudioBuffer, time: number, gain: number, pan: number, bus: AudioNode, filterHz = 0): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    let head: AudioNode = src;
    if (filterHz > 0) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterHz;
      head = src.connect(f);
    }
    head.connect(g).connect(p).connect(bus);
    src.start(Math.max(time, ctx.currentTime));
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      p.disconnect();
    };
  }

  private tone(time: number, freq: number, duration: number, gain: number, pan: number, bus: AudioNode, type: OscillatorType = 'sine', endFreq = 0): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (endFreq > 0) osc.frequency.exponentialRampToValueAtTime(endFreq, time + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 1e-4), time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    osc.connect(g).connect(p).connect(bus);
    osc.start(time);
    osc.stop(time + duration + 0.05);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
      p.disconnect();
    };
  }

  private bell(time: number, freq: number, gain: number, pan: number, bus: AudioNode): void {
    this.tone(time, freq, 1.6, gain, pan, bus);
    this.tone(time, freq * 2.76, 0.7, gain * 0.35, pan, bus);
    this.tone(time, freq * 5.4, 0.25, gain * 0.12, pan, bus);
  }

  /** Filtered noise burst; `fromHz`→`toHz` sweeps the band. */
  private noiseBurst(time: number, duration: number, gain: number, fromHz: number, toHz: number, type: BiquadFilterType, pan: number, bus: AudioNode, q = 0.9): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(fromHz, time);
    if (toHz !== fromHz) f.frequency.exponentialRampToValueAtTime(toHz, time + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 1e-4), time + Math.min(0.02, duration / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    src.connect(f).connect(g).connect(p).connect(bus);
    src.start(time, this.rand() * 2);
    src.stop(time + duration + 0.05);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
      p.disconnect();
    };
  }

  /** Suling (bamboo flute): sine + soft upper partial + breath, delayed vibrato, legato slides. */
  private suling(time: number, freq: number, duration: number, gain: number): void {
    const ctx = this.ctx!;
    const from = Math.abs(time - this.lastLead.end) < 0.15 && this.lastLead.freq > 0 ? this.lastLead.freq : 0;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    b.type = 'triangle';
    for (const [osc, mult] of [[a, 1], [b, 2]] as const) {
      if (from) {
        osc.frequency.setValueAtTime(from * mult, time);
        osc.frequency.exponentialRampToValueAtTime(freq * mult, time + 0.07);
      } else {
        osc.frequency.setValueAtTime(freq * mult * 0.985, time);
        osc.frequency.exponentialRampToValueAtTime(freq * mult, time + 0.05);
      }
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, time);
    depth.gain.linearRampToValueAtTime(freq * 0.007, time + Math.min(0.45, duration * 0.6));
    lfo.connect(depth);
    depth.connect(a.frequency);
    const bGain = ctx.createGain();
    bGain.gain.value = 0.1;
    const env = ctx.createGain();
    const end = time + duration;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(Math.max(gain, 1e-4), time + 0.08);
    env.gain.setTargetAtTime(gain * 0.8, time + 0.1, duration * 0.4);
    env.gain.setTargetAtTime(0.0001, end - 0.05, 0.07);
    a.connect(env);
    b.connect(bGain).connect(env);
    if (this.noise) {
      const breath = ctx.createBufferSource();
      breath.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq * 2;
      bp.Q.value = 1.4;
      const bg = ctx.createGain();
      bg.gain.value = 0.35;
      breath.connect(bp).connect(bg).connect(env);
      breath.start(time, this.rand() * 2);
      breath.stop(end + 0.4);
    }
    const p = ctx.createStereoPanner();
    p.pan.value = 0.18;
    env.connect(p).connect(this.musicBus);
    for (const o of [a, b, lfo]) {
      o.start(time);
      o.stop(end + 0.4);
    }
    a.onended = () => {
      for (const node of [a, b, lfo, depth, bGain, env, p]) node.disconnect();
    };
    this.lastLead = { end, freq };
  }

  // ------------------------------------------------------------- music

  private freq(e: Pick<NoteEvent, 'degree' | 'octave'>): number {
    return degreeFrequency(this.theme!, e.degree, e.octave);
  }

  private scheduleEvent(e: NoteEvent, time: number, eighth: number): void {
    const theme = this.theme!;
    const mix = theme.mix;
    const f = this.freq(e);
    this.scheduledNotes++;
    switch (e.instrument) {
      case 'pluck': {
        const pan = e.octave < 0 ? -0.25 : 0.05 + (this.rand() - 0.5) * 0.3;
        this.play(this.pluckBuffer(f), time, e.velocity * mix.pluck * 0.55, pan, this.musicBus);
        break;
      }
      case 'lead':
        this.suling(time, f, e.length * eighth, e.velocity * mix.lead * 0.3);
        break;
      case 'ensemble':
        this.play(this.angklungBuffer(f), time, e.velocity * mix.ensemble * 0.55, (this.rand() - 0.5) * 0.7, this.musicBus);
        break;
      case 'gong':
        this.play(this.gongBuffer(f), time, e.velocity * mix.gong * 0.7, 0, this.musicBus);
        break;
      case 'kempul':
        this.play(this.gongBuffer(f), time, e.velocity * mix.gong * 0.45, -0.1, this.musicBus);
        break;
      case 'bell':
        this.bell(time, f, e.velocity * mix.bell * 0.25, (this.rand() - 0.5) * 0.9, this.musicBus);
        break;
    }
  }

  private schedule(horizon?: number): void {
    const ctx = this.ctx;
    const theme = this.theme;
    const composer = this.composer;
    if (!ctx || !theme || !composer || !this.running) return;
    const job = this.prewarm.shift();
    if (job) job();
    const eighth = 60 / theme.tempoBpm / 2;
    if (this.nextTickTime < ctx.currentTime - 0.5) this.nextTickTime = ctx.currentTime + 0.05;
    const f = this.frame;
    const music = { flying: f?.flying ?? false, complete: f?.complete ?? false, calm: !(f?.active ?? false) };
    const until = horizon ?? ctx.currentTime + LOOKAHEAD;
    while (this.nextTickTime < until) {
      const bass = composer.bassDegree;
      for (const e of composer.tick(music)) this.scheduleEvent(e, this.nextTickTime + e.at * eighth, eighth);
      if (composer.bassDegree !== bass) this.retunePad(composer.bassDegree, this.nextTickTime);
      this.nextTickTime += eighth;
    }
  }

  // ------------------------------------------------------------- continuous layers

  private startContinuous(): void {
    const ctx = this.ctx!;
    const theme = this.theme!;
    // Pad drone on the bass root and the near-fifth above it.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(theme.mix.pad * 0.22, ctx.currentTime, 3);
    filter.connect(gain).connect(this.musicBus);
    const oscs: OscillatorNode[] = [];
    for (const [deg, detune] of [[0, -6], [0, 6], [3, -4], [3, 5]] as const) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = degreeFrequency(theme, deg, -1);
      o.detune.value = detune;
      o.connect(filter);
      o.start();
      oscs.push(o);
    }
    this.pad = { oscs, filter, gain, degree: 0 };

    // Wind: stereo noise through a moving band-pass.
    if (this.noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const wf = ctx.createBiquadFilter();
      wf.type = 'bandpass';
      wf.Q.value = 0.6;
      wf.frequency.value = 400;
      const wg = ctx.createGain();
      wg.gain.value = 0;
      src.connect(wf).connect(wg).connect(this.ambienceBus);
      src.start();
      this.wind = { src, gain: wg, filter: wf };
    }

    // Spirit hum: the nearest uncollected spirit sings its scale degree.
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    const trem = ctx.createGain();
    trem.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.5;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.25;
    lfo.connect(lfoDepth).connect(trem.gain);
    const hg = ctx.createGain();
    hg.gain.value = 0;
    const pan = ctx.createStereoPanner();
    a.connect(trem);
    const bg = ctx.createGain();
    bg.gain.value = 0.4;
    b.connect(bg).connect(trem);
    trem.connect(hg).connect(pan).connect(this.ambienceBus);
    for (const o of [a, b, lfo]) o.start();
    this.hum = { a, b, gain: hg, pan };
  }

  private stopContinuous(): void {
    for (const o of this.pad?.oscs ?? []) o.stop();
    this.pad = null;
    if (this.wind) {
      this.wind.src.stop();
      this.wind.gain.disconnect();
    }
    this.wind = null;
    if (this.hum) {
      this.hum.a.stop();
      this.hum.b.stop();
      this.hum.gain.disconnect();
    }
    this.hum = null;
  }

  private retunePad(degree: number, time: number): void {
    const pad = this.pad;
    const theme = this.theme;
    if (!pad || !theme) return;
    pad.degree = degree;
    pad.oscs.forEach((o, i) => {
      const d = i < 2 ? degree : degree + 3;
      o.frequency.setTargetAtTime(degreeFrequency(theme, d, -1), time, 1.2);
    });
  }

  // ------------------------------------------------------------- per-frame ambience

  /** Offline previews: schedules all music up to `seconds` on the context clock. */
  scheduleUntil(seconds: number): void {
    this.schedule(seconds);
  }

  update(frame: AudioFrame, dt: number): void {
    this.frame = frame;
    const ctx = this.ctx;
    const theme = this.theme;
    if (!ctx || !theme || !this.running) return;
    const t = ctx.currentTime;

    const duck = !frame.active;
    if (duck !== this.ducked) {
      this.ducked = duck;
      this.musicFilter.frequency.setTargetAtTime(duck ? 900 : 18000, t, 0.15);
      this.musicDuck.gain.setTargetAtTime(duck ? 0.55 : 1, t, 0.15);
      this.applyVolumes();
    }
    if (this.pad) this.pad.filter.frequency.setTargetAtTime(frame.flying ? 1500 : 650, t, 1.5);

    if (this.wind) {
      const speedK = clamp(frame.speed / 60, 0, 1);
      const altK = clamp(frame.altitude / 150, 0, 1);
      const level = theme.ambience.wind * (0.05 + (frame.flying ? 0.32 : 0.06) * speedK + 0.08 * altK);
      this.wind.gain.gain.setTargetAtTime(level, t, 0.4);
      this.wind.filter.frequency.setTargetAtTime(300 + 22 * frame.speed + 140 * Math.sin(t * 0.13), t, 0.3);
    }

    if (this.hum) {
      const s = frame.spirit;
      if (s && frame.active) {
        const dx = s.x - frame.x;
        const dz = s.z - frame.z;
        const d = Math.hypot(dx, dz);
        const k = clamp(1 - d / 150, 0, 1);
        const f = degreeFrequency(theme, s.degree, 1);
        this.hum.a.frequency.setTargetAtTime(f, t, 0.2);
        this.hum.b.frequency.setTargetAtTime(f * 2 + 0.7, t, 0.2);
        this.hum.gain.gain.setTargetAtTime(0.14 * k * k, t, 0.25);
        const bearing = Math.atan2(dx, -dz);
        this.hum.pan.pan.setTargetAtTime(clamp(Math.sin(bearing - frame.yaw), -1, 1) * 0.8, t, 0.15);
      } else {
        this.hum.gain.gain.setTargetAtTime(0, t, 0.3);
      }
    }

    if (!frame.active) return;

    // Footsteps.
    if (frame.grounded && !frame.flying && frame.speed > 0.6) {
      this.stepAccum += frame.speed * dt;
      const stride = frame.speed > 8 ? 1.6 : 1.25;
      if (this.stepAccum >= stride) {
        this.stepAccum -= stride;
        this.stepSide = -this.stepSide;
        this.footstep(frame.surface, this.stepSide * 0.12);
      }
    } else {
      this.stepAccum = 0;
    }

    // Birds, mostly near the ground.
    const birdRate = (theme.ambience.birdsPerMinute / 60) * (frame.altitude < 40 ? 1 : 0.25) * (frame.flying ? 0.6 : 1);
    if (birdRate > 0 && t >= this.nextBirdAt) {
      this.birdCall(t + 0.02);
      this.nextBirdAt = t + -Math.log(1 - this.rand() * 0.999) / birdRate;
    }

    // Crystal chimes near the lake.
    const lake = frame.lake;
    if (theme.ambience.lakeShimmer && lake) {
      const dx = lake.x - frame.x;
      const dz = lake.z - frame.z;
      const d = Math.hypot(dx, dz);
      const k = clamp(1 - (d - lake.radius) / 200, 0, 1);
      if (k > 0 && t >= this.nextShimmerAt) {
        const deg = Math.floor(this.rand() * theme.scaleCents.length);
        const pan = clamp(Math.sin(Math.atan2(dx, -dz) - frame.yaw), -1, 1) * 0.7;
        this.bell(t + 0.02, degreeFrequency(theme, deg, 2), 0.035 * k, pan, this.ambienceBus);
        this.nextShimmerAt = t + 0.6 + this.rand() * 2.5 / (0.3 + k);
      }
    }
  }

  private footstep(surface: SurfaceKind, pan: number): void {
    const t = this.ctx!.currentTime + 0.01;
    const bus = this.sfxBus;
    const r = this.rand();
    if (surface === 'crystal') {
      this.tone(t, 3600 + r * 1400, 0.16, 0.05, pan, bus);
      this.tone(t, (3600 + r * 1400) * 1.5, 0.1, 0.025, pan, bus);
      this.noiseBurst(t, 0.03, 0.05, 5000, 5000, 'highpass', pan, bus);
    } else if (surface === 'stone') {
      this.noiseBurst(t, 0.035, 0.09, 2600, 2600, 'highpass', pan, bus);
      this.tone(t, 140, 0.07, 0.12, pan, bus, 'sine', 70);
    } else {
      this.noiseBurst(t, 0.08, 0.12, 1300 + r * 600, 900, 'bandpass', pan, bus, 0.8);
    }
  }

  private birdCall(time: number): void {
    const bus = this.ambienceBus;
    const pan = (this.rand() - 0.5) * 1.6;
    const species = Math.floor(this.rand() * 3);
    const base = 2400 + this.rand() * 2000;
    if (species === 0) {
      const n = 3 + Math.floor(this.rand() * 3);
      for (let i = 0; i < n; i++) this.tone(time + i * 0.11, base, 0.07, 0.045, pan, bus, 'sine', base * 0.72);
    } else if (species === 1) {
      this.tone(time, base * 0.8, 0.2, 0.05, pan, bus, 'sine', base * 1.15);
      this.tone(time + 0.32, base * 0.95, 0.22, 0.045, pan, bus, 'sine', base * 1.3);
    } else {
      for (let i = 0; i < 8; i++) this.tone(time + i * 0.055, base * 1.25 * (1 + (i % 2) * 0.06), 0.035, 0.03, pan, bus);
    }
  }

  // ------------------------------------------------------------- effects

  private now(): number {
    return this.ctx ? this.ctx.currentTime + 0.02 : 0;
  }

  /** A spirit is collected: its own note on angklung, then an arpeggio that climbs with progress. */
  collect(degree: number, count: number): void {
    if (!this.running || !this.theme) return;
    const t = this.now();
    const th = this.theme;
    this.play(this.angklungBuffer(degreeFrequency(th, degree, 1)), t, 0.55, 0, this.sfxBus);
    for (let i = 0; i <= count; i++) this.play(this.pluckBuffer(degreeFrequency(th, i, 1)), t + 0.12 + i * 0.085, 0.4, -0.2 + i * 0.1, this.sfxBus);
    this.bell(t + 0.2 + count * 0.085, degreeFrequency(th, degree, 2), 0.12, 0, this.sfxBus);
  }

  /** All five spirits: gong, then the whole scale cascades on angklung. */
  restored(): void {
    if (!this.running || !this.theme) return;
    const t = this.now() + 0.6;
    const th = this.theme;
    this.play(this.gongBuffer(degreeFrequency(th, 0, -2)), t, 0.7, 0, this.sfxBus);
    const n = th.scaleCents.length;
    for (let i = 0; i < 2 * n; i++) this.play(this.angklungBuffer(degreeFrequency(th, i, 0)), t + 0.35 + i * 0.13, 0.4, -0.5 + i / (2 * n), this.sfxBus);
    for (const d of [0, 2, 4]) this.bell(t + 0.4 + 2 * n * 0.13, degreeFrequency(th, d, 2), 0.09, 0, this.sfxBus);
  }

  sealed(): void {
    if (!this.running || !this.theme) return;
    const t = this.now();
    const th = this.theme;
    this.play(this.gongBuffer(degreeFrequency(th, 3, -1)), t, 0.45, 0, this.sfxBus, 500);
    this.play(this.pluckBuffer(degreeFrequency(th, 3, 0)), t + 0.05, 0.35, 0.1, this.sfxBus);
    this.play(this.pluckBuffer(degreeFrequency(th, 1, 0)), t + 0.28, 0.35, -0.1, this.sfxBus);
  }

  gateOpen(): void {
    if (!this.running || !this.theme) return;
    const t = this.now();
    for (const d of [0, 2, 4]) this.play(this.angklungBuffer(degreeFrequency(this.theme, d, 1)), t, 0.35, (d - 2) * 0.25, this.sfxBus);
    this.bell(t + 0.1, degreeFrequency(this.theme, 0, 2), 0.1, 0, this.sfxBus);
  }

  takeoff(): void {
    if (!this.running || !this.theme) return;
    const t = this.now();
    this.noiseBurst(t, 0.6, 0.22, 300, 2200, 'bandpass', 0, this.sfxBus, 0.7);
    [0, 2, 4].forEach((d, i) => this.play(this.pluckBuffer(degreeFrequency(this.theme!, d, 1)), t + i * 0.06, 0.25, 0, this.sfxBus));
  }

  landing(): void {
    if (!this.running) return;
    const t = this.now();
    this.noiseBurst(t, 0.5, 0.18, 1800, 260, 'bandpass', 0, this.sfxBus, 0.7);
  }

  jump(): void {
    if (!this.running) return;
    this.noiseBurst(this.now(), 0.16, 0.08, 900, 1700, 'bandpass', 0, this.sfxBus);
  }

  land(strength: number): void {
    if (!this.running) return;
    const t = this.now();
    this.tone(t, 95, 0.2, 0.35 * clamp(strength, 0.2, 1), 0, this.sfxBus, 'sine', 45);
    this.noiseBurst(t, 0.1, 0.1 * clamp(strength, 0.2, 1), 1200, 700, 'bandpass', 0, this.sfxBus);
  }

  // ------------------------------------------------------------- diagnostics

  debugState(): { state: string; scheduledNotes: number; ducked: boolean; volumes: AudioVolumes; position: { cycle: number; step: number } | null; buffers: number } {
    return {
      state: this.ctx?.state ?? 'none',
      scheduledNotes: this.scheduledNotes,
      ducked: this.ducked,
      volumes: { ...this.volumes },
      position: this.composer?.position ?? null,
      buffers: this.buffers.size,
    };
  }
}
