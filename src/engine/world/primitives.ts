// Builds small low-poly meshes by merging three.js primitives with baked vertex colours.

import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, SRGBColorSpace, Vector3 } from 'three';

export interface Part {
  geometry: BufferGeometry;
  color: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

const tmpColor = new Color();

/** Linear-space colour from an sRGB hex value. */
export function linearColor(hex: number): Color {
  return new Color().setHex(hex, SRGBColorSpace);
}

export function partMatrix(p: Part): Matrix4 {
  const m = new Matrix4();
  const q = new Quaternion();
  if (p.rotation) q.setFromEuler(new Euler(p.rotation[0], p.rotation[1], p.rotation[2]));
  m.compose(new Vector3(...(p.position ?? [0, 0, 0])), q, new Vector3(...(p.scale ?? [1, 1, 1])));
  return m;
}

/** Merges parts into one non-indexed geometry with position, normal and colour attributes. */
export function mergeParts(parts: readonly Part[]): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  for (const p of parts) {
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
    g.applyMatrix4(partMatrix(p));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    tmpColor.setHex(p.color, SRGBColorSpace);
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
    }
    g.dispose();
    p.geometry.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  out.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  out.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

export function triangleCount(g: BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}
