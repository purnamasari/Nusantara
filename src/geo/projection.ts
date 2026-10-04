import { geo, worldXZ } from './types.ts';
import type { GeoBounds, GeoPoint, WorldXZ } from './types.ts';

/**
 * Plate carrée normalised to the region bounds (plan §4.2). Linear, arithmetic only.
 *
 *   geo → world : x = (lon − W)/(E − W)·L − L/2,   z = (N − lat)/(N − S)·L − L/2
 *   grid → world: x = −L/2 + c·Δ,                  z = −L/2 + r·Δ,   Δ = L/(G − 1)
 *
 * Grid rows run north → south, columns west → east, pixel-is-point.
 */
export class Projection {
  readonly bounds: GeoBounds;
  /** World size L in game metres (square region). */
  readonly size: number;
  /** Grid samples per side G. */
  readonly gridSize: number;
  /** Sample spacing Δ in game metres. */
  readonly spacing: number;
  readonly half: number;

  constructor(bounds: GeoBounds, size: number, gridSize: number) {
    if (!(bounds.south < bounds.north) || !(bounds.west < bounds.east)) {
      throw new RangeError('invalid bounds: need south < north and west < east');
    }
    if (gridSize < 2) throw new RangeError('gridSize must be at least 2');
    this.bounds = bounds;
    this.size = size;
    this.gridSize = gridSize;
    this.spacing = size / (gridSize - 1);
    this.half = size / 2;
  }

  geoToWorld(p: GeoPoint): WorldXZ {
    const b = this.bounds;
    return worldXZ(
      ((p.lon - b.west) / (b.east - b.west)) * this.size - this.half,
      ((b.north - p.lat) / (b.north - b.south)) * this.size - this.half,
    );
  }

  worldToGeo(x: number, z: number): GeoPoint {
    const b = this.bounds;
    return geo(
      b.north - ((z + this.half) / this.size) * (b.north - b.south),
      b.west + ((x + this.half) / this.size) * (b.east - b.west),
    );
  }

  gridToWorld(r: number, c: number): WorldXZ {
    return worldXZ(-this.half + c * this.spacing, -this.half + r * this.spacing);
  }

  gridToGeo(r: number, c: number): GeoPoint {
    const b = this.bounds;
    const g = this.gridSize - 1;
    return geo(b.north - (r / g) * (b.north - b.south), b.west + (c / g) * (b.east - b.west));
  }
}
