// The single authoritative terrain surface (plan §7). The same Float32 values become mesh
// vertex heights, and every height/slope query reads them with the mesh's own triangle split.
//
// Cell (r, c) corners:  A = (r, c) NW   B = (r, c+1) NE   C = (r+1, c) SW   D = (r+1, c+1) SE
// Diagonal A–D; triangles [A, C, D] (u ≤ v) and [A, D, B] (u > v).

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

interface CellLocation {
  i: number;
  n: number;
  u: number;
  v: number;
}

function locate(n: number, spacing: number, half: number, x: number, z: number, out: CellLocation): CellLocation {
  const cx = x < -half ? -half : x > half ? half : x;
  const cz = z < -half ? -half : z > half ? half : z;
  const gx = (cx + half) / spacing;
  const gz = (cz + half) / spacing;
  let c = Math.floor(gx);
  let r = Math.floor(gz);
  if (c > n - 2) c = n - 2;
  if (r > n - 2) r = n - 2;
  if (c < 0) c = 0;
  if (r < 0) r = 0;
  out.i = r * n + c;
  out.n = n;
  out.u = gx - c;
  out.v = gz - r;
  return out;
}

const scratch: CellLocation = { i: 0, n: 0, u: 0, v: 0 };

/** Triangle-split interpolation (plan §7.3) on any row-major n×n grid. Clamps to the bounds. */
export function sampleTriangulated(
  heights: ArrayLike<number>,
  n: number,
  spacing: number,
  half: number,
  x: number,
  z: number,
): number {
  const { i, u, v } = locate(n, spacing, half, x, z, scratch);
  const hA = heights[i]!;
  const hB = heights[i + 1]!;
  const hC = heights[i + n]!;
  const hD = heights[i + n + 1]!;
  if (u <= v) return hA + (hD - hC) * u + (hC - hA) * v;
  return hA + (hB - hA) * u + (hD - hB) * v;
}

export class HeightField {
  readonly n: number;
  readonly size: number;
  readonly spacing: number;
  readonly half: number;
  readonly heights: Float32Array;
  readonly minHeight: number;
  readonly maxHeight: number;

  constructor(heights: Float32Array, n: number, size: number) {
    if (heights.length !== n * n) throw new RangeError(`heights length ${heights.length} != ${n}²`);
    this.n = n;
    this.size = size;
    this.half = size / 2;
    this.spacing = size / (n - 1);
    this.heights = heights;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < heights.length; i++) {
      const h = heights[i]!;
      if (h < min) min = h;
      if (h > max) max = h;
    }
    this.minHeight = min;
    this.maxHeight = max;
  }

  get(r: number, c: number): number {
    return this.heights[r * this.n + c]!;
  }

  isInside(x: number, z: number): boolean {
    return x >= -this.half && x <= this.half && z >= -this.half && z <= this.half;
  }

  /** Height at (x, z), clamped to the region. Non-finite input returns NaN. */
  sample(x: number, z: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return NaN;
    return sampleTriangulated(this.heights, this.n, this.spacing, this.half, x, z);
  }

  /** Unit face normal of the triangle containing (x, z) (plan §7.5). */
  faceNormal(x: number, z: number, out: Vec3Like = { x: 0, y: 1, z: 0 }): Vec3Like {
    const { i, u, v } = locate(this.n, this.spacing, this.half, x, z, scratch);
    const h = this.heights;
    const n = this.n;
    const hA = h[i]!;
    const hB = h[i + 1]!;
    const hC = h[i + n]!;
    const hD = h[i + n + 1]!;
    let dx: number;
    let dz: number;
    if (u <= v) {
      dx = (hD - hC) / this.spacing;
      dz = (hC - hA) / this.spacing;
    } else {
      dx = (hB - hA) / this.spacing;
      dz = (hD - hB) / this.spacing;
    }
    const len = Math.sqrt(dx * dx + 1 + dz * dz);
    out.x = -dx / len;
    out.y = 1 / len;
    out.z = -dz / len;
    return out;
  }
}
