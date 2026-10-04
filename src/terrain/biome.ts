// Terrain vertex colours from biome bands (height, slope, meadow noise). sRGB, 0–1 floats.

import type { BiomeDefinition } from '../content/types.ts';
import { createNoise2D } from '../lib/noise.ts';
import { deriveSeed } from '../lib/rng.ts';
import { hash32, hashToUnit } from '../lib/hash.ts';
import { smoothstep } from '../lib/math.ts';
import { rgbToTuple } from './colors.ts';
import type { Pad } from './pipeline.ts';
import type { LakeDisc } from './surface.ts';

type Tuple = [number, number, number];

function mix(out: Tuple, a: Tuple, b: Tuple, t: number): Tuple {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

export function terrainColors(
  heights: Float32Array,
  baselineNorm: Float32Array,
  n: number,
  size: number,
  biome: BiomeDefinition,
  seed: number,
  pads: readonly Pad[],
  lake: LakeDisc | null,
): Float32Array {
  const t = biome.terrain;
  const low = rgbToTuple(t.low);
  const mid = rgbToTuple(t.mid);
  const high = rgbToTuple(t.high);
  const peak = rgbToTuple(t.peak);
  const meadowA = rgbToTuple(t.meadowA);
  const meadowB = rgbToTuple(t.meadowB);
  const rock = rgbToTuple(t.rock);
  const pad = rgbToTuple(t.pad);
  const shore = rgbToTuple(t.shore);
  const meadowNoise = createNoise2D(deriveSeed(seed, 'terrain.meadow'));
  const meadowTint = createNoise2D(deriveSeed(seed, 'terrain.meadowTint'));
  const half = size / 2;
  const spacing = size / (n - 1);
  const out = new Float32Array(n * n * 3);
  const c: Tuple = [0, 0, 0];
  const m: Tuple = [0, 0, 0];
  const invMeadow = 1 / t.meadowScale;

  for (let r = 0; r < n; r++) {
    const z = -half + r * spacing;
    for (let col = 0; col < n; col++) {
      const i = r * n + col;
      const x = -half + col * spacing;
      const bn = baselineNorm[i]!;

      // Height bands.
      if (bn < 0.35) mix(c, low, mid, bn / 0.35);
      else if (bn < 0.7) mix(c, mid, high, (bn - 0.35) / 0.35);
      else mix(c, high, peak, Math.min(1, (bn - 0.7) / 0.3));

      // Slope from central differences of the final heights.
      const hl = heights[r * n + (col > 0 ? col - 1 : col)]!;
      const hr = heights[r * n + (col < n - 1 ? col + 1 : col)]!;
      const hu = heights[(r > 0 ? r - 1 : r) * n + col]!;
      const hd = heights[(r < n - 1 ? r + 1 : r) * n + col]!;
      const gx = (hr - hl) / (2 * spacing);
      const gz = (hd - hu) / (2 * spacing);
      const g2 = gx * gx + gz * gz;

      // Flower meadows on gentle, lower ground.
      const mv = meadowNoise(x * invMeadow, z * invMeadow);
      const wMeadow =
        smoothstep(t.meadowThreshold, t.meadowThreshold + 0.25, mv) *
        (1 - smoothstep(0.5, 0.68, bn)) *
        (1 - smoothstep(0.08, 0.35, g2));
      if (wMeadow > 0) {
        mix(m, meadowA, meadowB, smoothstep(-0.35, 0.35, meadowTint(x * invMeadow * 0.5, z * invMeadow * 0.5)));
        mix(c, c, m, wMeadow * 0.85);
      }

      // Rock on steep ground.
      mix(c, c, rock, smoothstep(0.45, 1.3, g2));

      // Paved pads and lake shores.
      for (const p of pads) {
        const dx = x - p.x;
        const dz = z - p.z;
        const d2 = dx * dx + dz * dz;
        const outer = p.radius + 3;
        if (d2 < outer * outer) {
          const inner = p.radius * 0.85;
          mix(c, c, pad, 1 - smoothstep(inner * inner, outer * outer, d2));
        }
      }
      if (lake) {
        const dx = x - lake.x;
        const dz = z - lake.z;
        const d2 = dx * dx + dz * dz;
        const outer = lake.radius * 1.3;
        if (d2 < outer * outer) mix(c, c, shore, 1 - smoothstep(lake.radius * lake.radius, outer * outer, d2));
      }

      // Tiny per-sample brightness variation for a hand-painted feel.
      const jitter = 0.96 + 0.08 * hashToUnit(hash32(seed, r, col));
      out[i * 3] = Math.min(1, c[0] * jitter);
      out[i * 3 + 1] = Math.min(1, c[1] * jitter);
      out[i * 3 + 2] = Math.min(1, c[2] * jitter);
    }
  }
  return out;
}
