import { describe, expect, it } from 'vitest';
import { bandung } from '../../src/content/regions/bandung.ts';
import { validateRegionDefinition } from '../../src/content/validate.ts';
import { Composer } from '../../src/engine/audio/composer.ts';
import type { MusicContext, NoteEvent } from '../../src/engine/audio/composer.ts';
import {
  centsToRatio, degreeFrequency, estimatePitch, renderAngklung, renderGong, renderImpulseResponse, renderNoise, renderPluck,
} from '../../src/engine/audio/dsp.ts';

const theme = bandung.audio;
const SR = 32000;
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const rms = (b: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += b[i]! * b[i]!;
  return Math.sqrt(s / (to - from));
};
const finiteAndBounded = (b: Float32Array) => b.every((v) => Number.isFinite(v) && Math.abs(v) <= 1);

describe('tuning', () => {
  it('maps degrees and octaves onto the salendro-style scale', () => {
    expect(centsToRatio(1200)).toBeCloseTo(2, 12);
    expect(degreeFrequency(theme, 0)).toBeCloseTo(196, 9);
    expect(degreeFrequency(theme, 0, 1)).toBeCloseTo(392, 9);
    expect(degreeFrequency(theme, 5)).toBeCloseTo(392, 9); // wraps into the next octave
    expect(cents(degreeFrequency(theme, 1), 196)).toBeCloseTo(240, 6);
    expect(cents(degreeFrequency(theme, 3), 196)).toBeCloseTo(720, 6);
    expect(degreeFrequency(theme, -1)).toBeCloseTo(196 / 2 * centsToRatio(960), 9);
  });
});

describe('instrument synthesis (pure DSP)', () => {
  it('kacapi plucks are in tune (±20 cents), bounded and decaying', () => {
    for (const f of [98, 196, 330.6, 523.2, 880]) {
      const b = renderPluck(f, SR, 2.6, 0.72, 2.4, 3);
      expect(b.length).toBe(Math.floor(SR * 2.6));
      expect(finiteAndBounded(b)).toBe(true);
      const est = estimatePitch(b, SR, 60, 2000, Math.floor(SR * 0.1), 4096);
      expect(Math.abs(cents(est, f)), `pluck ${f} Hz estimated ${est.toFixed(1)}`).toBeLessThan(20);
      expect(rms(b, b.length - SR * 0.3, b.length)).toBeLessThan(rms(b, 0, SR * 0.3) * 0.3);
    }
  });

  it('angklung notes sound at their fundamental and fade out', () => {
    const f = degreeFrequency(theme, 2);
    const b = renderAngklung(f, SR, 1.5, 4);
    expect(finiteAndBounded(b)).toBe(true);
    const est = estimatePitch(b, SR, 100, 1500, Math.floor(SR * 0.3), 4096);
    expect(Math.abs(cents(est, f))).toBeLessThan(30);
    expect(Math.abs(b[b.length - 1]!)).toBeLessThan(0.01);
  });

  it('gongs, noise and the reverb impulse response are well-formed', () => {
    const g = renderGong(49, 24000, 5, 2);
    expect(finiteAndBounded(g)).toBe(true);
    expect(rms(g, g.length - 24000, g.length)).toBeLessThan(rms(g, 0, 24000));
    const n = renderNoise(SR, 1, 1);
    expect(n.length).toBe(SR);
    expect(finiteAndBounded(n)).toBe(true);
    const [l, r] = renderImpulseResponse(48000, 2.6, 2.4, 1);
    expect(l.length).toBe(r.length);
    expect(finiteAndBounded(l) && finiteAndBounded(r)).toBe(true);
    expect(rms(l, l.length - 4800, l.length)).toBeLessThan(rms(l, 720, 5520) * 0.1);
  });

  it('is deterministic for a seed', () => {
    expect(renderPluck(196, SR, 0.5, 0.7, 2, 9)).toEqual(renderPluck(196, SR, 0.5, 0.7, 2, 9));
  });
});

function run(composer: Composer, cycles: number, ctx: MusicContext): NoteEvent[][] {
  const out: NoteEvent[][] = [];
  for (let i = 0; i < cycles * composer.stepsPerCycle; i++) out.push(composer.tick(ctx));
  return out;
}

describe('composer (plan: Sundanese-inspired generative music)', () => {
  const walking = { flying: false, complete: false, calm: false };
  const L = theme.cycleBeats * 2;

  it('is deterministic for a seed', () => {
    expect(run(new Composer(theme, 7), 4, walking)).toEqual(run(new Composer(theme, 7), 4, walking));
    expect(run(new Composer(theme, 7), 4, walking)).not.toEqual(run(new Composer(theme, 8), 4, walking));
  });

  it('marks every cycle with a gong at the start and a kempul in the middle', () => {
    const steps = run(new Composer(theme, 1), 8, walking);
    steps.forEach((events, i) => {
      const hasGong = events.some((e) => e.instrument === 'gong');
      const hasKempul = events.some((e) => e.instrument === 'kempul');
      expect(hasGong).toBe(i % L === 0);
      expect(hasKempul).toBe(i % L === L / 2);
    });
  });

  it('keeps every note in the scale and in a comfortable range (40–2600 Hz)', () => {
    for (const ctx of [walking, { ...walking, flying: true }, { ...walking, complete: true }]) {
      for (const e of run(new Composer(theme, 3), 12, ctx).flat()) {
        expect(Number.isInteger(e.degree)).toBe(true);
        const f = degreeFrequency(theme, e.degree, e.octave);
        expect(f).toBeGreaterThanOrEqual(40);
        expect(f).toBeLessThanOrEqual(2600);
        expect(e.velocity).toBeGreaterThan(0);
        expect(e.velocity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('thins the kacapi while flying and drops the flute and angklung while paused', () => {
    const plucks = (ctx: MusicContext) => run(new Composer(theme, 5), 20, ctx).flat().filter((e) => e.instrument === 'pluck').length;
    expect(plucks({ ...walking, flying: true })).toBeLessThan(plucks(walking) * 0.8);
    const calm = run(new Composer(theme, 5), 20, { ...walking, calm: true }).flat();
    expect(calm.some((e) => e.instrument === 'lead' || e.instrument === 'ensemble')).toBe(false);
  });

  it('celebrates a restored region: angklung every cycle and bells', () => {
    const steps = run(new Composer(theme, 6), 6, { ...walking, complete: true });
    for (let c = 0; c < 6; c++) {
      const cycle = steps.slice(c * L, (c + 1) * L).flat();
      expect(cycle.some((e) => e.instrument === 'ensemble')).toBe(true);
    }
    expect(steps.flat().some((e) => e.instrument === 'bell')).toBe(true);
  });

  it('suling phrases end on a stable degree', () => {
    const n = theme.scaleCents.length;
    const steps = run(new Composer(theme, 2), 30, walking);
    for (let c = 0; c < 30; c++) {
      const leads = steps.slice(c * L, (c + 1) * L).flat().filter((e) => e.instrument === 'lead');
      if (leads.length > 0) expect([n, n + 3]).toContain(leads[leads.length - 1]!.degree);
    }
  });
});

describe('audio theme validation', () => {
  it('accepts Bandung and rejects a broken scale or tempo', () => {
    expect(validateRegionDefinition(bandung)).toEqual([]);
    const bad = { ...bandung, audio: { ...bandung.audio, scaleCents: [100, 50], tempoBpm: 500 } };
    const paths = validateRegionDefinition(bad).map((i) => i.path);
    expect(paths).toContain('audio.scaleCents');
    expect(paths).toContain('audio.tempoBpm');
  });
});
