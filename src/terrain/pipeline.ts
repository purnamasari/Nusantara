// Reconstruction pipeline R1–R6 (plan §5.5). Height-path code uses only arithmetic and
// polynomial falloffs (no sin/cos/exp/pow) so Node and browsers agree bit-for-bit (plan §8.3).

import { decodeToMetres } from '../heightmap/codec.ts';
import type { HeightmapMetadata } from '../heightmap/metadata.ts';
import { createNoise2D, fbm } from '../lib/noise.ts';
import { deriveSeed } from '../lib/rng.ts';
import { smoothstep } from '../lib/math.ts';
import { Projection } from '../geo/projection.ts';
import type { RegionDefinition, TerrainModifier } from '../content/types.ts';
import { sampleTriangulated } from './heightField.ts';
import type { LakeDisc } from './surface.ts';

export interface Pad {
  id: string;
  x: number;
  z: number;
  radius: number;
  height: number;
}

export interface TerrainFields {
  /** Final heights after R6, row-major north → south, west → east. */
  heights: Float32Array;
  /** Normalised smoothed baseline b̂ ∈ [0, 1], used for biome bands and placement. */
  baselineNorm: Float32Array;
  pads: Pad[];
  lake: LakeDisc | null;
}

export type StageMark = (stage: string) => void;

/** R3: one separable binomial [1 2 1]/4 pass with clamped (replicated) edges. */
export function smoothPass(a: Float64Array, n: number, tmp: Float64Array): void {
  for (let r = 0; r < n; r++) {
    const row = r * n;
    for (let c = 0; c < n; c++) {
      const l = c > 0 ? c - 1 : 0;
      const rr = c < n - 1 ? c + 1 : n - 1;
      tmp[row + c] = (a[row + l]! + 2 * a[row + c]! + a[row + rr]!) * 0.25;
    }
  }
  for (let r = 0; r < n; r++) {
    const up = (r > 0 ? r - 1 : 0) * n;
    const dn = (r < n - 1 ? r + 1 : n - 1) * n;
    const row = r * n;
    for (let c = 0; c < n; c++) {
      a[row + c] = (tmp[up + c]! + 2 * tmp[row + c]! + tmp[dn + c]!) * 0.25;
    }
  }
}

interface GridInfo {
  n: number;
  spacing: number;
  half: number;
}

/** Calls fn(index, x, z, d²) for every sample within `reach` metres (box) of (cx, cz). */
function forEachNear(g: GridInfo, cx: number, cz: number, reach: number, fn: (i: number, d2: number) => void): void {
  const c0 = Math.max(0, Math.floor((cx - reach + g.half) / g.spacing));
  const c1 = Math.min(g.n - 1, Math.ceil((cx + reach + g.half) / g.spacing));
  const r0 = Math.max(0, Math.floor((cz - reach + g.half) / g.spacing));
  const r1 = Math.min(g.n - 1, Math.ceil((cz + reach + g.half) / g.spacing));
  for (let r = r0; r <= r1; r++) {
    const z = -g.half + r * g.spacing;
    for (let c = c0; c <= c1; c++) {
      const x = -g.half + c * g.spacing;
      const dx = x - cx;
      const dz = z - cz;
      fn(r * g.n + c, dx * dx + dz * dz);
    }
  }
}

/** R5: applies one authored modifier in place. Returns pad/lake records it creates. */
export function applyModifier(
  h: Float64Array,
  g: GridInfo,
  m: TerrainModifier,
  proj: Projection,
  pads: Pad[],
): LakeDisc | null {
  const p = proj.geoToWorld(m.at);
  const r = m.radius;
  const r2 = r * r;
  switch (m.kind) {
    case 'flatten': {
      const target = sampleTriangulated(h, g.n, g.spacing, g.half, p.x, p.z);
      const ro = r + m.falloff;
      const ro2 = ro * ro;
      forEachNear(g, p.x, p.z, ro, (i, d2) => {
        if (d2 >= ro2) return;
        const w = d2 <= r2 ? 1 : 1 - smoothstep(0, 1, (d2 - r2) / (ro2 - r2));
        h[i] = h[i]! + (target - h[i]!) * w;
      });
      pads.push({ id: m.id, x: p.x, z: p.z, radius: r, height: target });
      return null;
    }
    case 'crater': {
      const reach = r * (1 + m.rimWidth);
      forEachNear(g, p.x, p.z, reach, (i, d2) => {
        const s = d2 / r2;
        if (s < 1) {
          const k = 1 - s;
          h[i] = h[i]! - m.depth * k * k;
        }
        const u = (s - 1) / m.rimWidth;
        if (u > -1 && u < 1) {
          const k = 1 - u * u;
          h[i] = h[i]! + m.rimHeight * k * k;
        }
      });
      return null;
    }
    case 'basin': {
      const level = sampleTriangulated(h, g.n, g.spacing, g.half, p.x, p.z) + m.surfaceOffset;
      const floorTop = level - 0.3;
      const shore2 = m.shore * m.shore;
      forEachNear(g, p.x, p.z, r * m.shore, (i, d2) => {
        const s = d2 / r2;
        if (s < 1) {
          const k = 1 - s;
          const carved = floorTop - m.depth * k * k;
          if (carved < h[i]!) h[i] = carved;
        } else if (s < shore2) {
          const t = smoothstep(0, 1, (s - 1) / (shore2 - 1));
          const bank = floorTop + (h[i]! - floorTop) * t;
          if (bank < h[i]!) h[i] = bank;
        }
      });
      return { x: p.x, z: p.z, radius: r, height: level };
    }
    case 'raise': {
      forEachNear(g, p.x, p.z, r, (i, d2) => {
        const s = d2 / r2;
        if (s < 1) {
          const k = 1 - s;
          h[i] = h[i]! + m.height * k * k;
        }
      });
      return null;
    }
  }
}

/** Runs R1–R6 and returns the final terrain fields. */
export function buildTerrainFields(
  def: RegionDefinition,
  meta: HeightmapMetadata,
  bytes: ArrayBuffer | Uint8Array,
  mark: StageMark = () => {},
): TerrainFields {
  const n = meta.grid.width;
  const g: GridInfo = { n, spacing: def.world.size / (n - 1), half: def.world.size / 2 };
  const proj = new Projection(def.geo.bounds, def.world.size, n);

  // R1 decode
  const metres = decodeToMetres(bytes, meta);
  mark('decode');

  // R2 baseline in game metres; lowest encoded sample sits at y = 0.
  const min = meta.encoding.minElevationM;
  const vs = def.world.verticalScale;
  const h = new Float64Array(n * n);
  for (let i = 0; i < h.length; i++) h[i] = (metres[i]! - min) * vs;
  mark('baseline');

  // R3 smoothing
  const tmp = new Float64Array(n * n);
  for (let p = 0; p < def.terrain.smoothPasses; p++) smoothPass(h, n, tmp);
  let bMin = Infinity;
  let bMax = -Infinity;
  for (let i = 0; i < h.length; i++) {
    if (h[i]! < bMin) bMin = h[i]!;
    if (h[i]! > bMax) bMax = h[i]!;
  }
  const baselineNorm = new Float32Array(n * n);
  const span = bMax - bMin > 0 ? bMax - bMin : 1;
  for (let i = 0; i < h.length; i++) baselineNorm[i] = (h[i]! - bMin) / span;
  mark('smooth');

  // R4 fantasy noise, masked by the baseline (more on highlands, little on the basin floor).
  const nz = def.terrain.noise;
  const noise = createNoise2D(deriveSeed(def.seed, 'terrain.fbm'));
  const invL = 1 / nz.wavelength;
  for (let r = 0; r < n; r++) {
    const z = -g.half + r * g.spacing;
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      const x = -g.half + c * g.spacing;
      const mask = nz.minMask + (1 - nz.minMask) * smoothstep(nz.maskLow, nz.maskHigh, baselineNorm[i]!);
      h[i] = h[i]! + fbm(noise, x * invL, z * invL, nz.octaves) * nz.amplitude * mask;
    }
  }
  mark('noise');

  // R5 authored modifiers in declaration order.
  const pads: Pad[] = [];
  let lake: LakeDisc | null = null;
  for (const m of def.terrain.modifiers) {
    const created = applyModifier(h, g, m, proj, pads);
    if (created) lake = created;
  }
  mark('modifiers');

  // R6 edge falloff into the mist sea.
  const { start, depth } = def.terrain.edge;
  const band = g.half - start;
  for (let r = 0; r < n; r++) {
    const z = -g.half + r * g.spacing;
    const az = z < 0 ? -z : z;
    for (let c = 0; c < n; c++) {
      const x = -g.half + c * g.spacing;
      const ax = x < 0 ? -x : x;
      const e = ax > az ? ax : az;
      if (e > start) {
        const i = r * n + c;
        const t = smoothstep(0, 1, (e - start) / band);
        h[i] = h[i]! + (depth - h[i]!) * t;
      }
    }
  }
  mark('edge');

  const heights = new Float32Array(n * n);
  for (let i = 0; i < h.length; i++) heights[i] = h[i]!;
  return { heights, baselineNorm, pads, lake };
}
