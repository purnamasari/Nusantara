// Stitches decoded tiles into one array and resamples it onto the region grid (plan §6.2).

import { Projection } from '../../src/geo/projection.ts';
import type { GeoBounds } from '../../src/geo/types.ts';
import { TILE_SIZE, latToTileY, lonToTileX } from './mercator.ts';
import type { TileRange } from './mercator.ts';

export class Mosaic {
  readonly range: TileRange;
  readonly width: number;
  readonly height: number;
  readonly data: Float64Array;

  constructor(range: TileRange, getTile: (x: number, y: number) => Float64Array) {
    this.range = range;
    const cols = range.x1 - range.x0 + 1;
    const rows = range.y1 - range.y0 + 1;
    this.width = cols * TILE_SIZE;
    this.height = rows * TILE_SIZE;
    this.data = new Float64Array(this.width * this.height);
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const tile = getTile(range.x0 + tx, range.y0 + ty);
        if (tile.length !== TILE_SIZE * TILE_SIZE) throw new Error(`tile ${tx},${ty} has wrong size`);
        for (let j = 0; j < TILE_SIZE; j++) {
          const dst = (ty * TILE_SIZE + j) * this.width + tx * TILE_SIZE;
          this.data.set(tile.subarray(j * TILE_SIZE, (j + 1) * TILE_SIZE), dst);
        }
      }
    }
  }

  /**
   * Bilinear sample at global pixel coordinates (gx, gy). Pixel values represent pixel
   * centres at (i + 0.5, j + 0.5).
   */
  sample(gx: number, gy: number): number {
    const lx = gx - this.range.x0 * TILE_SIZE - 0.5;
    const ly = gy - this.range.y0 * TILE_SIZE - 0.5;
    const x0 = Math.floor(lx);
    const y0 = Math.floor(ly);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= this.width || y0 + 1 >= this.height) {
      throw new RangeError(`sample (${gx}, ${gy}) outside mosaic`);
    }
    const fx = lx - x0;
    const fy = ly - y0;
    const i = y0 * this.width + x0;
    const a = this.data[i]!;
    const b = this.data[i + 1]!;
    const c = this.data[i + this.width]!;
    const d = this.data[i + this.width + 1]!;
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }
}

/** Resamples the mosaic onto an n×n pixel-is-point grid over the bounds (north row first). */
export function resampleToGrid(mosaic: Mosaic, bounds: GeoBounds, n: number): Float64Array {
  const proj = new Projection(bounds, 1, n);
  const z = mosaic.range.z;
  const out = new Float64Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const g = proj.gridToGeo(r, c);
      out[r * n + c] = mosaic.sample(lonToTileX(g.lon, z) * TILE_SIZE, latToTileY(g.lat, z) * TILE_SIZE);
    }
  }
  return out;
}
