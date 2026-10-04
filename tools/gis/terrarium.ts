// Terrarium PNG decoding (Tilezen formats.md): elevation = (R·256 + G + B/256) − 32768 metres.

export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Decodes RGBA (4 bytes per pixel) or RGB (3 bytes per pixel) image data to metres. */
export function decodeTerrariumPixels(data: Uint8Array, width: number, height: number, channels: 3 | 4): Float64Array {
  const out = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    out[i] = decodeTerrarium(data[o]!, data[o + 1]!, data[o + 2]!);
  }
  return out;
}
