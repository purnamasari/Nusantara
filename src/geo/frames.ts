// Heading convention (plan §4.3): θ in radians, 0 = north (−Z), π/2 = east (+X), clockwise
// seen from above. Forward = (sin θ, 0, −cos θ). three.js rotation.y = −θ. Models face −Z.

import { wrapAngle } from '../lib/math.ts';

export function forwardFromHeading(theta: number): { x: number; z: number } {
  return { x: Math.sin(theta), z: -Math.cos(theta) };
}

/** Right-hand direction for a heading (east when facing north). */
export function rightFromHeading(theta: number): { x: number; z: number } {
  return { x: Math.cos(theta), z: Math.sin(theta) };
}

export function headingFromVector(x: number, z: number): number {
  return wrapAngle(Math.atan2(x, -z));
}

export function rotationYFromHeading(theta: number): number {
  return -theta;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function compassPoint(theta: number): string {
  const idx = Math.round(wrapAngle(theta) / (Math.PI / 4)) % 8;
  return POINTS[idx]!;
}
