import { describe, expect, it } from 'vitest';
import { fnv1a, hash32, hashToUnit, hashTypedArray } from '../../src/lib/hash.ts';
import { deriveSeed, mulberry32 } from '../../src/lib/rng.ts';
import { createNoise2D, fbm } from '../../src/lib/noise.ts';
import { angleDelta, smoothstep, wrapAngle } from '../../src/lib/math.ts';

describe('hash / rng / noise (plan §8.1)', () => {
  it('hash32 is deterministic and sensitive to every input', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(1, 2, 4));
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
    expect(hash32(-5, 7)).toBeGreaterThanOrEqual(0);
    expect(hashToUnit(0xffffffff)).toBeLessThan(1);
  });

  it('golden values are pinned (an RNG change changes the world; bump generatorVersion)', () => {
    expect(hash32(20261004, 0, 0)).toBe(GOLDEN.hash32);
    expect(fnv1a('terrain.fbm')).toBe(GOLDEN.fnv);
    const r = mulberry32(42);
    expect([r(), r(), r()].map((v) => Math.round(v * 1e9))).toEqual(GOLDEN.mulberry);
    const n = createNoise2D(7);
    expect(Math.round(n(0.37, -1.25) * 1e9)).toBe(GOLDEN.noise);
  });

  it('named streams are isolated', () => {
    const a = deriveSeed(1, 'flora.tree');
    const b = deriveSeed(1, 'flora.rock');
    expect(a).not.toBe(b);
    expect(deriveSeed(1, 'flora.tree')).toBe(a);
    expect(deriveSeed(2, 'flora.tree')).not.toBe(a);
  });

  it('noise is bounded and fbm is normalised', () => {
    const n = createNoise2D(123);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 20000; i++) {
      const v = fbm(n, i * 0.137, i * 0.071, 4);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThanOrEqual(-1.01);
    expect(max).toBeLessThanOrEqual(1.01);
    expect(max - min).toBeGreaterThan(0.8);
  });

  it('typed-array hashing is byte-exact', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 3.0000002]);
    expect(hashTypedArray(a)).toBe(hashTypedArray(new Float32Array([1, 2, 3])));
    expect(hashTypedArray(a)).not.toBe(hashTypedArray(b));
  });

  it('math helpers', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
  });
});

// Recorded from this implementation (golden values; see plan §8.2).
const GOLDEN = {
  hash32: 3718718789,
  fnv: 3242888295,
  mulberry: [601103752, 448290559, 852465793],
  noise: -289995514,
};
