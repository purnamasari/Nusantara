// Web Mercator (EPSG:3857) slippy-tile maths for the bake tool (dev-only, plan §6).
// Global pixel coordinates: tile × tileSize + pixel; pixel (i, j) covers [i, i+1).

import type { GeoBounds } from '../../src/geo/types.ts';

export const TILE_SIZE = 256;
export const MAX_MERCATOR_LAT = 85.0511287798066;

export function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

export function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * 2 ** z;
}

export function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

export function tileYToLat(y: number, z: number): number {
  const n = Math.PI * (1 - (2 * y) / 2 ** z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

/** Geographic bounds of tile (x, y) at zoom z. */
export function tileBounds(x: number, y: number, z: number): GeoBounds {
  return { west: tileXToLon(x, z), east: tileXToLon(x + 1, z), north: tileYToLat(y, z), south: tileYToLat(y + 1, z) };
}

export interface TileRange {
  z: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Tiles covering the bounds expanded by `marginPx` source pixels (for bilinear neighbours). */
export function tileRangeForBounds(b: GeoBounds, z: number, marginPx = 1): TileRange {
  const m = marginPx / TILE_SIZE;
  return {
    z,
    x0: Math.floor(lonToTileX(b.west, z) - m),
    x1: Math.floor(lonToTileX(b.east, z) + m),
    y0: Math.floor(latToTileY(b.north, z) - m),
    y1: Math.floor(latToTileY(b.south, z) + m),
  };
}

export function tileCount(r: TileRange): number {
  return (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
}

/** V2: the union of the range's tile bounds contains the region bounds plus the margin. */
export function rangeCovers(r: TileRange, b: GeoBounds, marginPx = 1): boolean {
  const union: GeoBounds = {
    west: tileXToLon(r.x0, r.z),
    east: tileXToLon(r.x1 + 1, r.z),
    north: tileYToLat(r.y0, r.z),
    south: tileYToLat(r.y1 + 1, r.z),
  };
  const m = marginPx / TILE_SIZE;
  return (
    lonToTileX(b.west, r.z) - m >= lonToTileX(union.west, r.z) &&
    lonToTileX(b.east, r.z) + m <= lonToTileX(union.east, r.z) &&
    latToTileY(b.north, r.z) - m >= latToTileY(union.north, r.z) &&
    latToTileY(b.south, r.z) + m <= latToTileY(union.south, r.z)
  );
}
