import type { Rgb } from '../content/types.ts';

export function rgbToTuple(hex: Rgb): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
