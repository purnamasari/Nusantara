// Deterministic, order-independent vegetation placement (plan §9.3).

import type { FloraRule, FloraSpecies } from '../content/types.ts';
import { createNoise2D } from '../lib/noise.ts';
import { deriveSeed } from '../lib/rng.ts';
import { hash32, hashToUnit } from '../lib/hash.ts';
import { sampleTriangulated } from './heightField.ts';
import type { Surface } from './surface.ts';

export interface PlacedInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  colorIndex: number;
  hash: number;
}

export interface ExclusionCircle {
  x: number;
  z: number;
  radius: number;
}

export interface PlacementContext {
  surface: Surface;
  baselineNorm: Float32Array;
  walkBound: number;
  exclusions: readonly ExclusionCircle[];
  regionSeed: number;
}

export function placeSpecies(rule: FloraRule, ctx: PlacementContext): PlacedInstance[] {
  const streamSeed = deriveSeed(ctx.regionSeed, `flora.${rule.species}`);
  const clump = createNoise2D(deriveSeed(ctx.regionSeed, `flora.${rule.species}.clump`));
  const field = ctx.surface.field;
  const cosMax = Math.cos((rule.maxSlopeDeg * Math.PI) / 180);
  const count = Math.floor((2 * ctx.walkBound) / rule.cell);
  const invClump = 1 / rule.clumpScale;
  const normal = { x: 0, y: 1, z: 0 };
  const lake = ctx.surface.lake;
  const candidates: PlacedInstance[] = [];

  for (let j = 0; j < count; j++) {
    for (let i = 0; i < count; i++) {
      const base = hash32(streamSeed, i, j);
      if (hashToUnit(hash32(base, 3)) >= rule.density) continue;
      const x = -ctx.walkBound + (i + 0.1 + 0.8 * hashToUnit(hash32(base, 1))) * rule.cell;
      const z = -ctx.walkBound + (j + 0.1 + 0.8 * hashToUnit(hash32(base, 2))) * rule.cell;

      const bn = sampleTriangulated(ctx.baselineNorm, field.n, field.spacing, field.half, x, z);
      if (bn < rule.band[0] || bn > rule.band[1]) continue;
      if (rule.clumpThreshold > -1 && clump(x * invClump, z * invClump) <= rule.clumpThreshold) continue;
      if (lake) {
        const dx = x - lake.x;
        const dz = z - lake.z;
        const rr = lake.radius + 2;
        if (dx * dx + dz * dz < rr * rr) continue;
      }
      let excluded = false;
      for (const e of ctx.exclusions) {
        const dx = x - e.x;
        const dz = z - e.z;
        if (dx * dx + dz * dz < e.radius * e.radius) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;
      ctx.surface.normal(x, z, normal);
      if (normal.y < cosMax) continue;

      const scale = rule.scale[0] + (rule.scale[1] - rule.scale[0]) * hashToUnit(hash32(base, 4));
      candidates.push({
        x,
        y: ctx.surface.height(x, z) - rule.sink,
        z,
        scale,
        yaw: hashToUnit(hash32(base, 5)) * Math.PI * 2,
        colorIndex: Math.floor(hashToUnit(hash32(base, 6)) * rule.colors.length),
        hash: base,
      });
    }
  }
  // Cap by keeping the lowest hashes: independent of iteration order.
  candidates.sort((a, b) => a.hash - b.hash || a.x - b.x || a.z - b.z);
  return candidates.length > rule.cap ? candidates.slice(0, rule.cap) : candidates;
}

export type FloraPlacement = Record<FloraSpecies, PlacedInstance[]>;

export function flattenPlacement(p: Partial<FloraPlacement>): Float32Array {
  const species: FloraSpecies[] = ['glowFlower', 'giantFlower', 'tree', 'rock', 'pillar'];
  const total = species.reduce((s, k) => s + (p[k]?.length ?? 0), 0);
  const out = new Float32Array(total * 5);
  let o = 0;
  for (const k of species) {
    for (const inst of p[k] ?? []) {
      out[o++] = inst.x;
      out[o++] = inst.y;
      out[o++] = inst.z;
      out[o++] = inst.scale;
      out[o++] = inst.yaw;
    }
  }
  return out;
}
