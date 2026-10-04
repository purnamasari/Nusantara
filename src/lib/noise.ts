import { mulberry32 } from './rng.ts';

// Seeded 2D simplex noise (after Stefan Gustavson's public-domain reference).
// Uses only + − × ÷ and floor with precomputed constants, so it is bit-identical across
// JavaScript engines (plan §8.3).

const F2 = 0.3660254037844386; // 0.5 * (sqrt(3) - 1)
const G2 = 0.21132486540518713; // (3 - sqrt(3)) / 6
const GX = [1, -1, 1, -1, 1, -1, 0, 0];
const GY = [1, 1, -1, -1, 0, 0, 1, -1];

export type Noise2D = (x: number, y: number) => number;

/** Returns a noise function with output roughly in [-1, 1]. */
export function createNoise2D(seed: number): Noise2D {
  const rand = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = p[i]!;
    p[i] = p[j]!;
    p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]!;

  return (xin: number, yin: number): number => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const g = perm[ii + perm[jj]!]! & 7;
      t0 *= t0;
      n0 = t0 * t0 * (GX[g]! * x0 + GY[g]! * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const g = perm[ii + i1 + perm[jj + j1]!]! & 7;
      t1 *= t1;
      n1 = t1 * t1 * (GX[g]! * x1 + GY[g]! * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const g = perm[ii + 1 + perm[jj + 1]!]! & 7;
      t2 *= t2;
      n2 = t2 * t2 * (GX[g]! * x2 + GY[g]! * y2);
    }
    return 70 * (n0 + n1 + n2);
  };
}

/** Fractal Brownian motion: octaves of noise at doubling frequency, normalised to ~[-1, 1]. */
export function fbm(noise: Noise2D, x: number, y: number, octaves: number, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}
