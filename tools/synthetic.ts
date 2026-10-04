// Synthetic stand-in elevation (plan §5.6): a basin ringed by bumps, plus seeded fBm.
// Output has the same schema as a real bake, so nothing downstream knows the source.

import { Projection } from '../src/geo/projection.ts';
import type { GeoPoint } from '../src/geo/types.ts';
import type { RegionDefinition } from '../src/content/types.ts';
import { createNoise2D, fbm } from '../src/lib/noise.ts';
import { deriveSeed } from '../src/lib/rng.ts';
import { smoothstep } from '../src/lib/math.ts';

const KM_PER_DEG = 110.6;

function distKm(a: GeoPoint, lat: number, lon: number): number {
  const dLat = (lat - a.lat) * KM_PER_DEG;
  const dLon = (lon - a.lon) * KM_PER_DEG * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function bump(t: number): number {
  if (t >= 1) return 0;
  const k = 1 - t * t;
  return 0.5 * k * k + 0.5 * (1 - t) * (1 - t) * (1 - t);
}

export function syntheticElevation(def: RegionDefinition): Float64Array {
  const s = def.synthetic;
  const n = def.world.gridSize;
  const proj = new Projection(def.geo.bounds, def.world.size, n);
  const noise = createNoise2D(deriveSeed(def.seed, 'synthetic.dem'));
  const out = new Float64Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const g = proj.gridToGeo(r, c);
      const dBasin = distKm(s.basin.at, g.lat, g.lon) / s.basin.radiusKm;
      let e = s.baseM + s.rimM * smoothstep(0.75, 1.3, dBasin);
      for (const b of s.bumps) e += b.heightM * bump(distKm(b.at, g.lat, g.lon) / b.radiusKm);
      const nx = (g.lon * KM_PER_DEG) / s.noiseKm;
      const ny = (g.lat * KM_PER_DEG) / s.noiseKm;
      e += s.noiseM * fbm(noise, nx, ny, 4);
      out[r * n + c] = e;
    }
  }
  return out;
}
