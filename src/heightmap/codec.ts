// Heightmap codec shared by the bake tool (Node) and the runtime (browser), so encoding and
// decoding are symmetric and tested once (plan §5.1, §11.2).

import { GameError } from '../lib/errors.ts';
import { bytesPerSample } from './metadata.ts';
import type { HeightmapFormat, HeightmapMetadata } from './metadata.ts';

function levels(format: HeightmapFormat): number {
  return format === 'uint8' ? 255 : 65535;
}

/** Quantises metres to integers over [min, max]. Returns raw little-endian bytes. */
export function encodeHeights(
  metres: ArrayLike<number>,
  min: number,
  max: number,
  format: HeightmapFormat,
): Uint8Array {
  const n = metres.length;
  const q = levels(format);
  const range = max - min;
  const out = new Uint8Array(n * bytesPerSample(format));
  const view = new DataView(out.buffer);
  for (let i = 0; i < n; i++) {
    const t = range > 0 ? (metres[i]! - min) / range : 0;
    const v = Math.round(Math.min(1, Math.max(0, t)) * q);
    if (format === 'uint8') out[i] = v;
    else view.setUint16(i * 2, v, true);
  }
  return out;
}

/** Raw integer samples (no scaling). Throws HEIGHTMAP_INVALID on a length mismatch. */
export function readSamples(buffer: ArrayBuffer | Uint8Array, meta: HeightmapMetadata): Uint16Array | Uint8Array {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const count = meta.grid.width * meta.grid.height;
  const expected = count * bytesPerSample(meta.encoding.format);
  if (bytes.byteLength !== expected) {
    throw new GameError('HEIGHTMAP_INVALID', `Heightmap has ${bytes.byteLength} bytes, expected ${expected}.`);
  }
  if (meta.encoding.format === 'uint8') return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Uint16Array(count);
  for (let i = 0; i < count; i++) out[i] = view.getUint16(i * 2, true);
  return out;
}

/** R1: decode to metres, e = min + v / levels · (max − min). */
export function decodeToMetres(buffer: ArrayBuffer | Uint8Array, meta: HeightmapMetadata): Float64Array {
  const samples = readSamples(buffer, meta);
  const q = levels(meta.encoding.format);
  const min = meta.encoding.minElevationM;
  const range = meta.encoding.maxElevationM - min;
  const out = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = min + (samples[i]! / q) * range;
  return out;
}
