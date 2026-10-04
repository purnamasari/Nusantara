// Terrain mesh from the authoritative HeightField (plan §7.2, §9.2): one draw call,
// 65,536 vertices, 130,050 triangles, Uint16 indices, split [A,C,D] + [A,D,B].

import { BufferAttribute, BufferGeometry, Color, Mesh, SRGBColorSpace } from 'three';
import type { Material } from 'three';
import type { HeightField } from '../../terrain/heightField.ts';

export function buildTerrainGeometry(field: HeightField, srgbColors: Float32Array): BufferGeometry {
  const { n, spacing, half, heights } = field;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const c = new Color();
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      const i = r * n + col;
      positions[i * 3] = -half + col * spacing;
      positions[i * 3 + 1] = heights[i]!;
      positions[i * 3 + 2] = -half + r * spacing;
      c.setRGB(srgbColors[i * 3]!, srgbColors[i * 3 + 1]!, srgbColors[i * 3 + 2]!, SRGBColorSpace);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }
  const cells = n - 1;
  const IndexArray = n * n - 1 <= 65535 ? Uint16Array : Uint32Array;
  const index = new IndexArray(cells * cells * 6);
  let o = 0;
  for (let r = 0; r < cells; r++) {
    for (let col = 0; col < cells; col++) {
      const a = r * n + col;
      const b = a + 1;
      const cc = a + n;
      const d = cc + 1;
      index[o++] = a;
      index[o++] = cc;
      index[o++] = d;
      index[o++] = a;
      index[o++] = d;
      index[o++] = b;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export function buildTerrainMesh(field: HeightField, srgbColors: Float32Array, material: Material): Mesh {
  const mesh = new Mesh(buildTerrainGeometry(field, srgbColors), material);
  mesh.name = 'terrain';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
