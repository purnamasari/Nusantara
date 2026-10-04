import { fnv1a, hash32 } from './hash.ts';

/** Small, fast, seeded PRNG returning values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seed for a named stream (e.g. "terrain.fbm", "flora.tree"). Each consumer gets its own
 * stream so adding or changing one consumer never shifts another's numbers (plan §8.1).
 */
export function deriveSeed(regionSeed: number, streamName: string): number {
  return hash32(regionSeed, fnv1a(streamName));
}
