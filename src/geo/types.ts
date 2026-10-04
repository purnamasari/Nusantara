// Geo, grid and world spaces are kept apart with branded types (plan §4.1).
// Only src/geo/projection.ts converts between them.

declare const geoBrand: unique symbol;
declare const worldBrand: unique symbol;

/** WGS84 latitude/longitude in degrees. Never used directly as three.js coordinates. */
export type GeoPoint = { readonly lat: number; readonly lon: number; readonly [geoBrand]: true };

/** Horizontal world position in game metres: +X = east, −Z = north. */
export type WorldXZ = { readonly x: number; readonly z: number; readonly [worldBrand]: true };

export interface GeoBounds {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

export function geo(lat: number, lon: number): GeoPoint {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new RangeError(`latitude out of range: ${lat}`);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new RangeError(`longitude out of range: ${lon}`);
  return { lat, lon } as GeoPoint;
}

export function worldXZ(x: number, z: number): WorldXZ {
  return { x, z } as WorldXZ;
}

export function geoInBounds(p: GeoPoint, b: GeoBounds): boolean {
  return p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east;
}
