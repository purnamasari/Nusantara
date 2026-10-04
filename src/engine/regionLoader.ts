// Fetches a region's heightmap files (no third-party runtime dependency; plan §0.1).

import type { RegionDefinition } from '../content/types.ts';
import { validateMetadata } from '../heightmap/metadata.ts';
import type { HeightmapMetadata } from '../heightmap/metadata.ts';
import { GameError } from '../lib/errors.ts';

export interface RegionData {
  meta: HeightmapMetadata;
  bytes: ArrayBuffer;
}

async function fetchOk(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch (err) {
    throw new GameError('HEIGHTMAP_FETCH_FAILED', `Could not download ${url}.`, [String(err)]);
  }
  if (!res.ok) throw new GameError('HEIGHTMAP_FETCH_FAILED', `Could not download ${url} (HTTP ${res.status}).`);
  return res;
}

export async function fetchRegionData(def: RegionDefinition, baseUrl: string): Promise<RegionData> {
  const metaRes = await fetchOk(baseUrl + def.geo.metadata);
  let meta: unknown;
  try {
    meta = await metaRes.json();
  } catch {
    throw new GameError('HEIGHTMAP_INVALID', 'Heightmap metadata is not valid JSON.');
  }
  const problems = validateMetadata(meta);
  if (problems.length > 0) throw new GameError('HEIGHTMAP_INVALID', 'Heightmap metadata is invalid.', problems);
  const binRes = await fetchOk(baseUrl + def.geo.heightmap);
  const bytes = await binRes.arrayBuffer();
  const m = meta as HeightmapMetadata;
  if (bytes.byteLength !== m.file.bytes) {
    throw new GameError('HEIGHTMAP_INVALID', `Heightmap has ${bytes.byteLength} bytes; metadata says ${m.file.bytes}.`);
  }
  return { meta: m, bytes };
}
