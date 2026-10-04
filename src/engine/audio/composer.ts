// Generative music in a Sundanese-inspired idiom (pure, seeded, testable).
//
// Time advances in eighth notes. A cycle of `cycleBeats` beats opens with a low gong; a
// smaller gong lands mid-cycle (colotomic structure, as in gamelan). Over this:
//   pluck    – kacapi: bass on even eighths, a wandering melody on odd eighths
//   lead     – suling: occasional phrases that settle on stable degrees
//   ensemble – angklung: interlocking figures near the end of a cycle
//   bell     – high chimes once the region is restored
// The mix thins out while flying (airier) and while paused.

import { mulberry32 } from '../../lib/rng.ts';
import type { AudioTheme } from '../../content/types.ts';

export type Instrument = 'pluck' | 'lead' | 'ensemble' | 'gong' | 'kempul' | 'bell';

export interface NoteEvent {
  instrument: Instrument;
  /** Scale degree; values ≥ scale length continue into higher octaves. */
  degree: number;
  octave: number;
  /** Offset from this tick, in eighth notes. */
  at: number;
  /** Length in eighth notes. */
  length: number;
  velocity: number;
}

export interface MusicContext {
  flying: boolean;
  complete: boolean;
  calm: boolean;
}

/** Bass roots, one per four-cycle section. */
const BASS_PROGRESSION = [0, 3, 1, 4, 0, 2, 3, 0];

export class Composer {
  readonly stepsPerCycle: number;
  readonly scaleLength: number;
  private readonly rand: () => number;
  private step = 0;
  private cycle = 0;
  private walker: number;
  private leadQueue = new Map<number, NoteEvent[]>();
  bassDegree = 0;

  constructor(theme: Pick<AudioTheme, 'cycleBeats' | 'scaleCents'>, seed: number) {
    this.stepsPerCycle = theme.cycleBeats * 2;
    this.scaleLength = theme.scaleCents.length;
    this.rand = mulberry32(seed);
    this.walker = this.scaleLength;
  }

  get position(): { cycle: number; step: number } {
    return { cycle: this.cycle, step: this.step };
  }

  private chance(p: number): boolean {
    return this.rand() < p;
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rand() * items.length)]!;
  }

  private planLeadPhrase(ctx: MusicContext): void {
    const n = this.scaleLength;
    const count = 3 + Math.floor(this.rand() * 4);
    let degree = n + Math.floor(this.rand() * n);
    let step = 2;
    const limit = this.stepsPerCycle - 6;
    for (let i = 0; i < count && step < limit; i++) {
      const last = i === count - 1 || step + 6 >= limit;
      if (last) degree = this.pick([n, n + 3]);
      const length = last ? 6 : this.pick([2, 3, 4, 4, 6]);
      const event: NoteEvent = { instrument: 'lead', degree, octave: 1, at: 0, length, velocity: 0.55 + 0.25 * this.rand() };
      const list = this.leadQueue.get(step) ?? [];
      list.push(event);
      this.leadQueue.set(step, list);
      step += length;
      degree = Math.max(n - 1, Math.min(2 * n + 2, degree + this.pick([-2, -1, -1, 1, 1, 2])));
      if (last) break;
    }
    void ctx;
  }

  /** Events starting within the current eighth note; then advances one eighth. */
  tick(ctx: MusicContext): NoteEvent[] {
    const out: NoteEvent[] = [];
    const s = this.step;
    const L = this.stepsPerCycle;
    const n = this.scaleLength;

    if (s === 0) {
      this.bassDegree = BASS_PROGRESSION[Math.floor(this.cycle / 4) % BASS_PROGRESSION.length]!;
      out.push({ instrument: 'gong', degree: 0, octave: -2, at: 0, length: L, velocity: 0.85 });
      this.leadQueue.clear();
      const leadChance = ctx.calm ? 0 : ctx.complete ? 0.7 : ctx.flying ? 0.85 : 0.55;
      if (this.chance(leadChance)) this.planLeadPhrase(ctx);
      if (ctx.complete) {
        for (const d of [0, 2, 4]) out.push({ instrument: 'ensemble', degree: d, octave: 0, at: 0, length: 4, velocity: 0.35 });
      }
    }
    if (s === L / 2) out.push({ instrument: 'kempul', degree: this.bassDegree, octave: -1, at: 0, length: L / 2, velocity: 0.5 });

    // Kacapi.
    const density = (ctx.flying ? 0.5 : 1) * (ctx.calm ? 0.5 : 1);
    if (s % 2 === 0) {
      if (this.chance(0.85 * density + (ctx.flying ? 0.1 : 0))) {
        out.push({ instrument: 'pluck', degree: this.bassDegree, octave: -1, at: 0, length: 4, velocity: 0.5 + 0.15 * this.rand() });
      }
    } else if (this.chance(0.7 * density)) {
      this.walker = Math.max(0, Math.min(2 * n - 1, this.walker + this.pick([-2, -1, -1, 0, 1, 1, 2])));
      out.push({ instrument: 'pluck', degree: this.walker, octave: 0, at: 0, length: 3, velocity: 0.35 + 0.2 * this.rand() });
      if (this.chance(0.12)) {
        out.push({ instrument: 'pluck', degree: this.walker + 1, octave: 0, at: 0.5, length: 1, velocity: 0.25 });
      }
    }

    // Suling.
    out.push(...(this.leadQueue.get(s) ?? []));

    // Angklung figure near the end of the cycle.
    if (s === L - 8 && !ctx.calm && this.chance(ctx.complete ? 1 : ctx.flying ? 0.3 : 0.45)) {
      const b = this.bassDegree;
      [b, b + 2, b + 1, b + 3].forEach((d, i) => {
        out.push({ instrument: 'ensemble', degree: d, octave: 0, at: i * 2, length: 2, velocity: 0.4 });
      });
    }

    // Bells once the valley is restored.
    if (ctx.complete && s % 2 === 1 && this.chance(0.15)) {
      out.push({ instrument: 'bell', degree: Math.floor(this.rand() * n), octave: 2, at: 0, length: 4, velocity: 0.3 });
    }

    this.step = (s + 1) % L;
    if (this.step === 0) this.cycle++;
    return out;
  }
}
