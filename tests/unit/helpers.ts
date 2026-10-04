import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bandung } from '../../src/content/regions/bandung.ts';
import type { RegionDefinition } from '../../src/content/types.ts';
import type { HeightmapMetadata } from '../../src/heightmap/metadata.ts';
import { generateRegion } from '../../src/terrain/generate.ts';
import type { GeneratedRegion } from '../../src/terrain/generate.ts';

export const ROOT = join(import.meta.dirname, '..', '..');

export function loadBandungData(): { meta: HeightmapMetadata; bytes: Uint8Array } {
  const dir = join(ROOT, 'public', 'regions', 'bandung');
  return {
    meta: JSON.parse(readFileSync(join(dir, 'height.json'), 'utf8')) as HeightmapMetadata,
    bytes: new Uint8Array(readFileSync(join(dir, 'height.u8.bin'))),
  };
}

let cached: GeneratedRegion | null = null;
export function bandungRegion(): GeneratedRegion {
  if (!cached) {
    const { meta, bytes } = loadBandungData();
    cached = generateRegion(bandung, meta, bytes);
  }
  return cached;
}

/** Deep-ish clone of a region definition with overrides (for invalid-config tests). */
export function cloneRegion(overrides: Partial<RegionDefinition> = {}): RegionDefinition {
  return { ...bandung, ...overrides };
}

/** Metadata for an in-memory fixture grid. */
export function fixtureMeta(def: RegionDefinition, n: number, min: number, max: number): HeightmapMetadata {
  return {
    schemaVersion: 1,
    regionId: def.id,
    source: { kind: 'synthetic', zoom: null, tiles: [], syntheticSeed: 1, note: 'fixture' },
    bounds: { ...def.geo.bounds },
    grid: { width: n, height: n, registration: 'pixel-is-point', rowOrder: 'north-to-south', colOrder: 'west-to-east' },
    encoding: { format: 'uint8', minElevationM: min, maxElevationM: max, decode: 'min + v / 255 * (max - min)' },
    resampling: { method: 'none', sourceCrs: null, targetGrid: 'plate-carree-normalised-to-bounds' },
    file: { name: 'fixture.bin', bytes: n * n, sha256: '' },
    realExtentM: { northSouth: 0, eastWest: 0, anisotropyPct: 0 },
    quantization: { stepM: 0, maxErrGameM: 0, rmsErrGameM: 0, terraceCellsPct: 0 },
    bake: { toolVersion: 1, node: 'test', bakedAt: '' },
  };
}

/** Region definition stripped of fantasy transforms, for fixture grids of size n. */
export function plainFixtureRegion(n: number): RegionDefinition {
  return {
    ...bandung,
    world: { ...bandung.world, gridSize: n },
    terrain: {
      smoothPasses: 0,
      noise: { ...bandung.terrain.noise, amplitude: 0 },
      modifiers: [],
      edge: { start: bandung.world.size / 2, depth: 0 },
    },
  };
}
