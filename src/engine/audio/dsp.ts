// Pure sample synthesis for the procedural soundtrack. No Web Audio types here, so every
// function runs (and is tested) in Node. All output is mono Float32 in [-1, 1].

import { mulberry32 } from '../../lib/rng.ts';
import type { AudioTheme } from '../../content/types.ts';

export function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

/** Frequency of a scale degree; degrees beyond the scale length wrap into higher octaves. */
export function degreeFrequency(theme: Pick<AudioTheme, 'scaleCents' | 'tonicHz'>, degree: number, octave = 0): number {
  const n = theme.scaleCents.length;
  const o = Math.floor(degree / n);
  const d = ((degree % n) + n) % n;
  return theme.tonicHz * Math.pow(2, octave + o) * centsToRatio(theme.scaleCents[d]!);
}

export function peakNormalize(buf: Float32Array, peak = 0.9): Float32Array {
  let max = 0;
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]!));
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < buf.length; i++) buf[i] = buf[i]! * k;
  }
  return buf;
}

function fadeEdges(buf: Float32Array, sr: number, attack: number, release: number): void {
  const a = Math.max(1, Math.floor(attack * sr));
  const r = Math.max(1, Math.floor(release * sr));
  for (let i = 0; i < a && i < buf.length; i++) buf[i] = buf[i]! * (i / a);
  for (let i = 0; i < r && i < buf.length; i++) buf[buf.length - 1 - i] = buf[buf.length - 1 - i]! * (i / r);
}

/**
 * Plucked string (Karplus–Strong with a fractional delay), used for the kacapi zither.
 * Two slightly detuned strings give the shimmer of a doubled course.
 */
export function renderPluck(freq: number, sr: number, seconds: number, brightness = 0.7, t60 = 2.4, seed = 1): Float32Array {
  const len = Math.floor(sr * seconds);
  const out = new Float32Array(len);
  const rand = mulberry32(seed);
  for (const [detune, gain] of [[1, 1], [1.0017, 0.55]] as const) {
    const period = sr / (freq * detune);
    const n = Math.floor(period);
    const a = 1 - (period - n); // y[n] = g·(a·y[n−N] + (1−a)·y[n−N−1]) → delay N + (1 − a)
    const g = Math.pow(10, -3 / (t60 * freq));
    const y = new Float32Array(len);
    let lp = 0;
    let mean = 0;
    for (let i = 0; i <= n && i < len; i++) {
      lp += (rand() * 2 - 1 - lp) * brightness;
      y[i] = lp;
      mean += lp;
    }
    mean /= n + 1;
    for (let i = 0; i <= n && i < len; i++) y[i] = y[i]! - mean;
    for (let i = n + 1; i < len; i++) y[i] = g * (a * y[i - n]! + (1 - a) * y[i - n - 1]!);
    for (let i = 0; i < len; i++) out[i] = out[i]! + y[i]! * gain;
  }
  fadeEdges(out, sr, 0.002, 0.05);
  return peakNormalize(out, 0.9);
}

/** Recurrence sine oscillator: fast and accurate enough for short partials. */
function addDecayingSine(out: Float32Array, sr: number, start: number, freq: number, amp: number, tau: number, maxLen: number): void {
  const w = (2 * Math.PI * freq) / sr;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = -Math.sin(w);
  const decay = Math.exp(-1 / (tau * sr));
  let env = amp;
  const end = Math.min(out.length, start + maxLen);
  for (let i = start; i < end; i++) {
    const s0 = c * s1 - s2;
    s2 = s1;
    s1 = s0;
    out[i] = out[i]! + s0 * env;
    env *= decay;
    if (env < 1e-4) break;
  }
}

/**
 * Angklung: two bamboo tubes an octave apart, shaken so they rattle ~13 times a second.
 */
export function renderAngklung(freq: number, sr: number, seconds: number, seed = 1, shakeHz = 13): Float32Array {
  const len = Math.floor(sr * seconds);
  const out = new Float32Array(len);
  const rand = mulberry32(seed);
  const window = Math.floor(sr * 0.45);
  let t = 0;
  while (t < seconds - 0.05) {
    const start = Math.floor(t * sr);
    const env = Math.min(1, t / 0.04) * Math.min(1, (seconds - t) / 0.35);
    const a = env * (0.7 + 0.3 * rand());
    addDecayingSine(out, sr, start, freq, a, 0.09, window);
    addDecayingSine(out, sr, start, freq * 2, a * 0.55, 0.06, window);
    addDecayingSine(out, sr, start, freq * 3.9, a * 0.12, 0.02, window);
    t += (1 / shakeHz) * (0.9 + 0.2 * rand());
  }
  fadeEdges(out, sr, 0.003, 0.08);
  return peakNormalize(out, 0.85);
}

/**
 * Gong with an inharmonic spectrum and a slow beating ("ombak") between two near-unison
 * fundamentals, plus a soft mallet thump.
 */
export function renderGong(freq: number, sr: number, seconds: number, seed = 1): Float32Array {
  const len = Math.floor(sr * seconds);
  const out = new Float32Array(len);
  const partials: [number, number, number][] = [
    [1, 1, 6],
    [1 + 1.2 / freq, 0.8, 6],
    [2, 0.32, 3],
    [2.76, 0.16, 1.6],
    [4.07, 0.07, 0.8],
    [5.4, 0.035, 0.5],
  ];
  for (const [ratio, amp, t60] of partials) {
    const f = freq * ratio;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const glide = 1 + 0.012 * Math.exp(-t / 0.06);
      out[i] = out[i]! + amp * Math.exp((-6.9 * t) / t60) * Math.sin(2 * Math.PI * f * glide * t);
    }
  }
  const rand = mulberry32(seed);
  let lp = 0;
  const thump = Math.floor(sr * 0.03);
  for (let i = 0; i < thump && i < len; i++) {
    lp += (rand() * 2 - 1 - lp) * 0.08;
    out[i] = out[i]! + lp * 2.5 * (1 - i / thump);
  }
  fadeEdges(out, sr, 0.004, 0.3);
  return peakNormalize(out, 0.9);
}

/** White noise (seeded). */
export function renderNoise(sr: number, seconds: number, seed = 1): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(Math.floor(sr * seconds));
  for (let i = 0; i < out.length; i++) out[i] = rand() * 2 - 1;
  return out;
}

/** Stereo reverb impulse response: exponentially decaying, darkening noise with a pre-delay. */
export function renderImpulseResponse(sr: number, seconds: number, t60: number, seed = 1): [Float32Array, Float32Array] {
  const len = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.015);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < 2; ch++) {
    const rand = mulberry32(seed + ch * 7919);
    const out = new Float32Array(len);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const k = 0.9 - 0.75 * Math.min(1, t / t60); // the tail gets darker
      lp += (rand() * 2 - 1 - lp) * k;
      out[i] = lp * Math.exp((-6.9 * t) / t60);
    }
    channels.push(peakNormalize(out, 0.5));
  }
  return [channels[0]!, channels[1]!];
}

/** Fundamental estimate by autocorrelation (used by tests to check tuning). */
export function estimatePitch(buf: Float32Array, sr: number, minHz = 60, maxHz = 2000, from = 0, size = 4096): number {
  const minLag = Math.floor(sr / maxHz);
  const maxLag = Math.floor(sr / minHz);
  let bestLag = minLag;
  let best = -Infinity;
  const corr = (lag: number) => {
    let s = 0;
    for (let i = from; i < from + size && i + lag < buf.length; i++) s += buf[i]! * buf[i + lag]!;
    return s;
  };
  for (let lag = minLag; lag <= maxLag; lag++) {
    const s = corr(lag);
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  // Parabolic interpolation around the peak.
  const a = corr(bestLag - 1);
  const b = best;
  const c = corr(bestLag + 1);
  const denom = a - 2 * b + c;
  const offset = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return sr / (bestLag + offset);
}
