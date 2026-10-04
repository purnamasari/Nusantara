// Integer hashing. Pure 32-bit integer arithmetic only, so results are identical in every
// JavaScript engine (plan §8.1).

function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** MurmurHash3-style hash of a list of integers (non-integers are truncated with `| 0`). */
export function hash32(...values: number[]): number {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < values.length; i++) {
    let k = values[i]! | 0;
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= values.length;
  return fmix32(h);
}

/** Maps a uint32 hash to [0, 1). */
export function hashToUnit(h: number): number {
  return (h >>> 0) / 4294967296;
}

/** FNV-1a over the UTF-16 code units of a string. */
export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** FNV-1a over raw bytes; returned as 8 hex digits. Used for golden hashes (plan §8.2). */
export function fnv1aBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function hashTypedArray(array: Float32Array | Float64Array | Uint8Array | Uint16Array): string {
  return fnv1aBytes(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
}
