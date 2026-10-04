import { describe, expect, it } from 'vitest';
import { decodeTerrarium, decodeTerrariumPixels } from '../../tools/gis/terrarium.ts';
import { latToTileY, lonToTileX, rangeCovers, tileBounds, tileCount, tileRangeForBounds, tileXToLon, tileYToLat, TILE_SIZE } from '../../tools/gis/mercator.ts';
import { Mosaic, resampleToGrid } from '../../tools/gis/mosaic.ts';
import { bandung } from '../../src/content/regions/bandung.ts';
import { validateBounds } from '../../src/content/validate.ts';
import { buildTerrainFields } from '../../src/terrain/pipeline.ts';
import { HeightField } from '../../src/terrain/heightField.ts';
import { encodeHeights } from '../../src/heightmap/codec.ts';
import { buildTerrainGeometry } from '../../src/engine/world/terrainMesh.ts';
import { fixtureMeta, plainFixtureRegion } from './helpers.ts';

describe('Terrarium decoding (V4)', () => {
  it('decodes fixture pixels exactly', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(128, 1, 0)).toBe(1);
    expect(decodeTerrarium(128, 0, 128)).toBe(0.5);
    expect(decodeTerrarium(127, 255, 0)).toBe(-1);
    expect(decodeTerrarium(136, 8, 0)).toBe(2056);
    const px = decodeTerrariumPixels(new Uint8Array([128, 0, 0, 255, 136, 8, 0, 255]), 2, 1, 4);
    expect([...px]).toEqual([0, 2056]);
  });
});

describe('Web Mercator tile maths (V2, V5)', () => {
  it('round-trips lat/lon through tile coordinates within 1e-9°', () => {
    for (const [lat, lon] of [[-6.7, 107.4], [-7.15, 107.85], [0, 0], [60, -120]]) {
      expect(tileYToLat(latToTileY(lat!, 10), 10)).toBeCloseTo(lat!, 9);
      expect(tileXToLon(lonToTileX(lon!, 10), 10)).toBeCloseTo(lon!, 9);
    }
  });

  it('puts (−6.70, 107.40) at z10 in tile (817, 531)', () => {
    expect(Math.floor(lonToTileX(107.4, 10))).toBe(817);
    expect(Math.floor(latToTileY(-6.7, 10))).toBe(531);
  });

  it('computes Bandung coverage: 4 tiles (x 817–818, y 531–532) that contain the bounds', () => {
    const r = tileRangeForBounds(bandung.geo.bounds, 10);
    expect(r).toEqual({ z: 10, x0: 817, x1: 818, y0: 531, y1: 532 });
    expect(tileCount(r)).toBe(4);
    expect(rangeCovers(r, bandung.geo.bounds)).toBe(true);
    expect(rangeCovers({ ...r, x1: 817 }, bandung.geo.bounds)).toBe(false);
    const tb = tileBounds(817, 531, 10);
    expect(tb.north).toBeGreaterThan(tb.south);
  });

  it('validates Bandung bounds (V1)', () => {
    expect(validateBounds(bandung.geo.bounds)).toEqual([]);
    expect(validateBounds({ south: -7, north: -6.9, west: 107, east: 107.1 }).length).toBeGreaterThan(0);
    expect(validateBounds({ south: -7, north: -6.5, west: 107, east: 107.9 }).some((i) => i.message.includes('anisotropy'))).toBe(true);
  });
});

describe('mosaic resampling (V6)', () => {
  it('reproduces a linear ramp exactly, including across tile seams', () => {
    const range = { z: 10, x0: 817, x1: 818, y0: 531, y1: 532 };
    const ramp = (gx: number, gy: number) => 0.25 * gx - 0.5 * gy + 1000;
    const mosaic = new Mosaic(range, (tx, ty) => {
      const t = new Float64Array(TILE_SIZE * TILE_SIZE);
      for (let j = 0; j < TILE_SIZE; j++) {
        for (let i = 0; i < TILE_SIZE; i++) t[j * TILE_SIZE + i] = ramp(tx * TILE_SIZE + i + 0.5, ty * TILE_SIZE + j + 0.5);
      }
      return t;
    });
    // Points straddling the seam between tile columns 817 and 818.
    for (const gx of [818 * 256 - 0.75, 818 * 256, 818 * 256 + 0.6]) {
      for (const gy of [531 * 256 + 10.3, 532 * 256 + 0.2]) {
        expect(mosaic.sample(gx, gy)).toBeCloseTo(ramp(gx, gy), 6);
      }
    }
    const grid = resampleToGrid(mosaic, bandung.geo.bounds, 16);
    const lat = bandung.geo.bounds.north;
    const lon = bandung.geo.bounds.west;
    expect(grid[0]).toBeCloseTo(ramp(lonToTileX(lon, 10) * 256, latToTileY(lat, 10) * 256), 6);
  });
});

describe('orientation and dimensions through the full pipeline (V8, V11)', () => {
  it('a fixture maximum in the north-east ends up at x > 0, z < 0 in heightfield and mesh', () => {
    const n = 33;
    const def = plainFixtureRegion(n);
    const metres = new Float64Array(n * n);
    // Single peak at grid (r = 6, c = 26): row 6 is near the north edge, column 26 near the east.
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) metres[r * n + c] = 100 - Math.hypot(r - 6, c - 26) * 2;
    const bytes = encodeHeights(metres, 0, 100, 'uint8');
    const fields = buildTerrainFields(def, fixtureMeta(def, n, 0, 100), bytes);
    const field = new HeightField(fields.heights, n, def.world.size);
    let best = { r: 0, c: 0, h: -Infinity };
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (field.get(r, c) > best.h) best = { r, c, h: field.get(r, c) };
    const x = -field.half + best.c * field.spacing;
    const z = -field.half + best.r * field.spacing;
    expect(x).toBeGreaterThan(0);
    expect(z).toBeLessThan(0);

    const geom = buildTerrainGeometry(field, new Float32Array(n * n * 3));
    const pos = geom.getAttribute('position');
    let top = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > pos.getY(top)) top = i;
    expect(pos.getX(top)).toBeGreaterThan(0);
    expect(pos.getZ(top)).toBeLessThan(0);
  });
});
