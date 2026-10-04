import { describe, expect, it } from 'vitest';
import { bandung } from '../../src/content/regions/bandung.ts';
import { MAX_FLORA_INSTANCES } from '../../src/content/validate.ts';
import { placeSpecies } from '../../src/terrain/placement.ts';
import { bandungRegion } from './helpers.ts';

describe('vegetation placement (plan §9.3)', () => {
  const g = bandungRegion();
  const all = Object.values(g.flora).flat();

  it('respects per-species caps and the 10,000 total', () => {
    for (const rule of bandung.biome.flora) expect(g.flora[rule.species].length).toBeLessThanOrEqual(rule.cap);
    expect(all.length).toBeLessThanOrEqual(MAX_FLORA_INSTANCES);
    expect(all.length).toBeGreaterThan(3000);
  });

  it('keeps every instance out of exclusion zones', () => {
    const lake = g.surface.lake!;
    for (const f of all) {
      expect(Math.abs(f.x)).toBeLessThanOrEqual(bandung.world.walkBound);
      expect(Math.abs(f.z)).toBeLessThanOrEqual(bandung.world.walkBound);
      expect(Math.hypot(f.x - lake.x, f.z - lake.z)).toBeGreaterThanOrEqual(lake.radius + 2);
      for (const p of g.pads) expect(Math.hypot(f.x - p.x, f.z - p.z)).toBeGreaterThanOrEqual(p.radius + 2);
      for (const c of g.colliders) expect(Math.hypot(f.x - c.x, f.z - c.z)).toBeGreaterThanOrEqual(c.radius + 2);
      for (const c of g.collectibles) expect(Math.hypot(f.x - c.x, f.z - c.z)).toBeGreaterThanOrEqual(3);
    }
  });

  it('places instances on the surface (within their sink) and within slope/band limits', () => {
    for (const rule of bandung.biome.flora) {
      for (const f of g.flora[rule.species]) {
        expect(Math.abs(g.surface.height(f.x, f.z) - rule.sink - f.y)).toBeLessThan(1e-3);
        expect(g.surface.normal(f.x, f.z).y).toBeGreaterThanOrEqual(Math.cos((rule.maxSlopeDeg * Math.PI) / 180) - 1e-9);
      }
    }
  });

  it('is order-independent: the cap keeps the lowest hashes', () => {
    const rule = { ...bandung.biome.flora[0]!, cap: 50 };
    const ctx = {
      surface: g.surface,
      baselineNorm: g.baselineNorm,
      walkBound: bandung.world.walkBound,
      exclusions: [],
      regionSeed: bandung.seed,
    };
    const small = placeSpecies(rule, ctx);
    const big = placeSpecies({ ...rule, cap: 100000 }, ctx);
    expect(small).toEqual(big.slice(0, 50));
    for (let i = 1; i < small.length; i++) expect(small[i]!.hash).toBeGreaterThanOrEqual(small[i - 1]!.hash);
  });
});
