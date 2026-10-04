import { describe, expect, it } from 'vitest';
import { bandung } from '../../src/content/regions/bandung.ts';
import { generateRegion, TAN_60, validateHeights, validatePlacement } from '../../src/terrain/generate.ts';
import { buildTerrainFields } from '../../src/terrain/pipeline.ts';
import { flattenPlacement } from '../../src/terrain/placement.ts';
import { hashTypedArray } from '../../src/lib/hash.ts';
import { GameError } from '../../src/lib/errors.ts';
import { bandungRegion, loadBandungData } from './helpers.ts';
import { GOLDEN_BANDUNG } from './golden.ts';

describe('deterministic generation (plan §8.2)', () => {
  const { meta, bytes } = loadBandungData();

  it('produces the golden heightfield, colours and flora', () => {
    const g = bandungRegion();
    expect(hashTypedArray(g.field.heights)).toBe(GOLDEN_BANDUNG.heights);
    expect(hashTypedArray(g.colors)).toBe(GOLDEN_BANDUNG.colors);
    expect(hashTypedArray(flattenPlacement(g.flora))).toBe(GOLDEN_BANDUNG.flora);
  });

  it('two independent runs are byte-identical', () => {
    const a = generateRegion(bandung, meta, bytes);
    const b = generateRegion(bandung, meta, bytes);
    expect(hashTypedArray(a.field.heights)).toBe(hashTypedArray(b.field.heights));
    expect(hashTypedArray(flattenPlacement(a.flora))).toBe(hashTypedArray(flattenPlacement(b.flora)));
  });

  it('changing the region seed changes noise; flora streams do not affect heights', () => {
    const reseeded = buildTerrainFields({ ...bandung, seed: bandung.seed + 1 }, meta, bytes);
    expect(hashTypedArray(reseeded.heights)).not.toBe(GOLDEN_BANDUNG.heights);
    const refloraed = buildTerrainFields(
      { ...bandung, biome: { ...bandung.biome, flora: bandung.biome.flora.map((f) => ({ ...f, density: f.density / 2 })) } },
      meta,
      bytes,
    );
    expect(hashTypedArray(refloraed.heights)).toBe(GOLDEN_BANDUNG.heights);
  });

  it('rejects a heightmap for another region or with other bounds', () => {
    expect(() => generateRegion(bandung, { ...meta, regionId: 'jakarta' }, bytes)).toThrow(GameError);
    expect(() => generateRegion(bandung, { ...meta, bounds: { ...meta.bounds, north: -6.6 } }, bytes)).toThrow(GameError);
  });
});

describe('post-generation validation (plan §8.4)', () => {
  const g = bandungRegion();

  it('heights are continuous (≤ 60°) inside the walkable area, and pads are flat', () => {
    expect(validateHeights(g.field, g.pads, bandung.world.walkBound)).toEqual([]);
    const { n, spacing, half } = g.field;
    let worst = 0;
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const x = -half + c * spacing;
        const z = -half + r * spacing;
        if (Math.abs(x) > 950 - spacing || Math.abs(z) > 950 - spacing) continue;
        worst = Math.max(worst, Math.abs(g.field.get(r, c + 1) - g.field.get(r, c)), Math.abs(g.field.get(r + 1, c) - g.field.get(r, c)));
      }
    }
    expect(worst).toBeLessThanOrEqual(spacing * TAN_60);
    for (const p of g.pads) {
      expect(g.field.faceNormal(p.x, p.z).y).toBeGreaterThan(Math.cos((2 * Math.PI) / 180));
    }
  });

  it('terrain inside the Crystal Lake disc is below the walkable crystal surface', () => {
    const lake = g.surface.lake!;
    expect(lake).not.toBeNull();
    for (let a = 0; a < 32; a++) {
      for (const f of [0, 0.3, 0.6, 0.95]) {
        const x = lake.x + Math.cos(a) * lake.radius * f;
        const z = lake.z + Math.sin(a) * lake.radius * f;
        expect(g.field.sample(x, z)).toBeLessThan(lake.height);
        expect(g.surface.height(x, z)).toBe(lake.height);
      }
    }
  });

  it('anchors pass placement validation', () => {
    expect(validatePlacement(g)).toEqual([]);
    expect(g.collectibles).toHaveLength(5);
    for (const c of g.collectibles) expect(c.y - g.surface.height(c.x, c.z)).toBeGreaterThanOrEqual(0.5);
  });

  it('flags problems: a collectible moved next to a collider, spawn off a pad', () => {
    const bloom = g.colliders.find((c) => c.owner === 'bandung.landmark.blooming-highlands')!;
    const moved = { ...g, collectibles: [{ ...g.collectibles[0]!, x: bloom.x + bloom.radius + 1, z: bloom.z }, ...g.collectibles.slice(1)] };
    expect(validatePlacement(moved).some((m) => m.includes('collider'))).toBe(true);
    const offPad = { ...g, spawn: { ...g.spawn, x: 300, z: 300 } };
    expect(validatePlacement(offPad).some((m) => m.includes('flatten pad'))).toBe(true);
  });

  it('a modifier that breaks continuity makes generation fail with GENERATION_INVALID', () => {
    const { meta, bytes } = loadBandungData();
    const broken = {
      ...bandung,
      terrain: {
        ...bandung.terrain,
        modifiers: [...bandung.terrain.modifiers, { kind: 'raise' as const, id: 'spike', at: bandung.landmarks[0]!.at, radius: 9, height: 80 }],
      },
    };
    try {
      generateRegion(broken, meta, bytes);
      expect.unreachable();
    } catch (e) {
      expect((e as GameError).code).toBe('GENERATION_INVALID');
    }
  });
});
