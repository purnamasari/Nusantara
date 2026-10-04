// Heightmap metadata schema (plan §5.2): everything needed to rebuild the baseline.

import type { GeoBounds } from '../geo/types.ts';

export type HeightmapFormat = 'uint8' | 'uint16';

export interface TileProvenance {
  z: number;
  x: number;
  y: number;
  bytes: number;
  sha256: string;
  lastModified: string | null;
  imagerySources: string | null;
}

export interface HeightmapMetadata {
  schemaVersion: 1;
  regionId: string;
  source: {
    kind: 'terrarium' | 'synthetic';
    zoom: number | null;
    tiles: TileProvenance[];
    syntheticSeed: number | null;
    note: string;
  };
  bounds: GeoBounds;
  grid: {
    width: number;
    height: number;
    registration: 'pixel-is-point';
    rowOrder: 'north-to-south';
    colOrder: 'west-to-east';
  };
  encoding: {
    format: HeightmapFormat;
    minElevationM: number;
    maxElevationM: number;
    decode: string;
  };
  resampling: { method: string; sourceCrs: string | null; targetGrid: string };
  file: { name: string; bytes: number; sha256: string };
  realExtentM: { northSouth: number; eastWest: number; anisotropyPct: number };
  quantization: {
    stepM: number;
    maxErrGameM: number;
    rmsErrGameM: number;
    terraceCellsPct: number;
  };
  bake: { toolVersion: number; node: string; bakedAt: string };
}

export function bytesPerSample(format: HeightmapFormat): number {
  return format === 'uint8' ? 1 : 2;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Structural validation; returns a list of problems (empty when valid). */
export function validateMetadata(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null) return ['metadata is not an object'];
  const m = value as Partial<HeightmapMetadata>;
  if (m.schemaVersion !== 1) errors.push(`schemaVersion must be 1 (got ${String(m.schemaVersion)})`);
  if (typeof m.regionId !== 'string' || m.regionId === '') errors.push('regionId missing');
  const b = m.bounds;
  if (!b || ![b.south, b.west, b.north, b.east].every(isFiniteNumber)) errors.push('bounds missing or non-numeric');
  else if (!(b.south < b.north && b.west < b.east)) errors.push('bounds not ordered (south < north, west < east)');
  const g = m.grid;
  if (!g || !Number.isInteger(g.width) || !Number.isInteger(g.height) || g.width < 2 || g.height < 2) {
    errors.push('grid width/height invalid');
  } else {
    if (g.registration !== 'pixel-is-point') errors.push('grid.registration must be pixel-is-point');
    if (g.rowOrder !== 'north-to-south') errors.push('grid.rowOrder must be north-to-south');
    if (g.colOrder !== 'west-to-east') errors.push('grid.colOrder must be west-to-east');
  }
  const e = m.encoding;
  if (!e || (e.format !== 'uint8' && e.format !== 'uint16')) errors.push('encoding.format must be uint8 or uint16');
  else if (!isFiniteNumber(e.minElevationM) || !isFiniteNumber(e.maxElevationM) || !(e.maxElevationM > e.minElevationM)) {
    errors.push('encoding min/max elevation invalid');
  }
  const f = m.file;
  if (!f || typeof f.name !== 'string' || !Number.isInteger(f.bytes)) errors.push('file entry invalid');
  else if (g && e && (e.format === 'uint8' || e.format === 'uint16') && f.bytes !== g.width * g.height * bytesPerSample(e.format)) {
    errors.push(`file.bytes ${f.bytes} does not match grid × sample size`);
  }
  if (!m.source || (m.source.kind !== 'terrarium' && m.source.kind !== 'synthetic')) errors.push('source.kind invalid');
  return errors;
}
