// Bake a region heightmap (plan §6). Dev-only; never imported by src/.
//
//   node tools/bake-region.ts bandung --synthetic   synthetic stand-in (M1–M8)
//   node tools/bake-region.ts bandung               real Terrarium data — gated (plan §6.5)

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { getPlayableRegion } from '../src/content/registry.ts';
import { realExtentM, validateRegistry } from '../src/content/validate.ts';
import { REGIONS } from '../src/content/registry.ts';
import { decodeToMetres, encodeHeights } from '../src/heightmap/codec.ts';
import type { HeightmapMetadata } from '../src/heightmap/metadata.ts';
import { Projection } from '../src/geo/projection.ts';
import type { RegionDefinition } from '../src/content/types.ts';
import { syntheticElevation } from './synthetic.ts';
import { quantizationFailures, quantizationReport } from './quantization.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOL_VERSION = 1;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function writePreview(def: RegionDefinition, metres: Float64Array, min: number, max: number, path: string): void {
  const n = def.world.gridSize;
  const png = new PNG({ width: n, height: n });
  for (let i = 0; i < n * n; i++) {
    const v = Math.round(((metres[i]! - min) / (max - min)) * 255);
    png.data[i * 4] = v;
    png.data[i * 4 + 1] = v;
    png.data[i * 4 + 2] = v;
    png.data[i * 4 + 3] = 255;
  }
  const put = (r: number, c: number, rgb: [number, number, number]) => {
    if (r < 0 || c < 0 || r >= n || c >= n) return;
    const o = (r * n + c) * 4;
    png.data[o] = rgb[0];
    png.data[o + 1] = rgb[1];
    png.data[o + 2] = rgb[2];
  };
  // North marker: red triangle at the top centre (row 0 = north).
  for (let r = 0; r < 10; r++) for (let c = -r; c <= r; c++) put(r, n / 2 + c, [230, 40, 40]);
  const proj = new Projection(def.geo.bounds, def.world.size, n);
  const cross = (lat: number, lon: number, rgb: [number, number, number]) => {
    const w = proj.geoToWorld({ lat, lon } as never);
    const c = Math.round((w.x + proj.half) / proj.spacing);
    const r = Math.round((w.z + proj.half) / proj.spacing);
    for (let k = -3; k <= 3; k++) {
      put(r + k, c, rgb);
      put(r, c + k, rgb);
    }
  };
  for (const l of def.landmarks) cross(l.at.lat, l.at.lon, [255, 210, 40]);
  for (const c of def.collectibles) cross(c.at.lat, c.at.lon, [230, 60, 220]);
  cross(def.spawn.at.lat, def.spawn.at.lon, [40, 220, 80]);
  cross(def.portal.at.lat, def.portal.at.lon, [40, 200, 230]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

function main(): void {
  const args = process.argv.slice(2);
  const id = args.find((a) => !a.startsWith('--'));
  const synthetic = args.includes('--synthetic');
  if (!id) {
    console.error('usage: node tools/bake-region.ts <regionId> [--synthetic]');
    process.exit(1);
  }
  const issues = validateRegistry(REGIONS);
  if (issues.length > 0) {
    for (const i of issues) console.error(`CONFIG_INVALID ${i.path}: ${i.message}`);
    process.exit(1);
  }
  const def = getPlayableRegion(id);
  if (!synthetic) {
    console.error(
      'Real-data baking is gated until the data-licensing sign-off is recorded (plan §6.5, decision D1).\n' +
        'Use --synthetic for now.',
    );
    process.exit(2);
  }

  const n = def.world.gridSize;
  const metres = syntheticElevation(def);
  let min = Infinity;
  let max = -Infinity;
  for (const e of metres) {
    if (!Number.isFinite(e)) throw new Error('non-finite elevation');
    if (e < min) min = e;
    if (e > max) max = e;
  }
  // Round the range to centimetres so the metadata is exact and readable.
  min = Math.floor(min * 100) / 100;
  max = Math.ceil(max * 100) / 100;

  const bytes = encodeHeights(metres, min, max, 'uint8');
  const ext = realExtentM(def.geo.bounds);
  const fileName = 'height.u8.bin';
  const meta: HeightmapMetadata = {
    schemaVersion: 1,
    regionId: def.id,
    source: {
      kind: 'synthetic',
      zoom: null,
      tiles: [],
      syntheticSeed: def.seed,
      note: 'Synthetic stand-in terrain generated from the region config (plan §5.6). Not survey data.',
    },
    bounds: { ...def.geo.bounds },
    grid: { width: n, height: n, registration: 'pixel-is-point', rowOrder: 'north-to-south', colOrder: 'west-to-east' },
    encoding: { format: 'uint8', minElevationM: min, maxElevationM: max, decode: 'min + v / 255 * (max - min)' },
    resampling: { method: 'none (generated directly on the grid)', sourceCrs: null, targetGrid: 'plate-carree-normalised-to-bounds' },
    file: { name: fileName, bytes: bytes.byteLength, sha256: sha256(bytes) },
    realExtentM: {
      northSouth: Math.round(ext.northSouth),
      eastWest: Math.round(ext.eastWest),
      anisotropyPct: Math.round(ext.anisotropyPct * 1000) / 1000,
    },
    quantization: { stepM: 0, maxErrGameM: 0, rmsErrGameM: 0, terraceCellsPct: 0 },
    bake: { toolVersion: TOOL_VERSION, node: process.version, bakedAt: new Date().toISOString() },
  };
  const decoded = decodeToMetres(bytes, meta);
  const spacing = def.world.size / (n - 1);
  const q = quantizationReport(metres, decoded, min, max, 255, n, spacing, def.world.verticalScale, def.terrain.smoothPasses);
  const round = (v: number) => Math.round(v * 10000) / 10000;
  meta.quantization = {
    stepM: round(q.stepM),
    maxErrGameM: round(q.maxErrGameM),
    rmsErrGameM: round(q.rmsErrGameM),
    terraceCellsPct: round(q.terraceCellsPct),
  };

  const outDir = join(ROOT, 'public', 'regions', def.id);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, fileName), bytes);
  writeFileSync(join(outDir, 'height.json'), `${JSON.stringify(meta, null, 2)}\n`);
  writePreview(def, decoded, min, max, join(ROOT, 'tools', 'out', `${def.id}-preview.png`));

  console.log(`Baked ${def.id} (synthetic): ${n}×${n}, ${bytes.byteLength} B, elevation ${min}–${max} m`);
  console.log(`Quantisation: step ${q.stepM.toFixed(2)} m, max ${q.maxErrGameM.toFixed(3)} m, RMS ${q.rmsErrGameM.toFixed(3)} m, terraced ${q.terraceCellsPct.toFixed(2)}%`);
  const fails = quantizationFailures(q, def.world.verticalScale, def.terrain.smoothPasses);
  if (fails.length > 0) console.warn(`Quantisation criteria (§5.4) suggest 16-bit: ${fails.join('; ')}`);
  console.log(`Preview: tools/out/${def.id}-preview.png`);
}

main();
