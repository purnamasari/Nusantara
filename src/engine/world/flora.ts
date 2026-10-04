// Instanced vegetation (plan §9.3): one shared geometry + material per species, one
// InstancedMesh per (500 m cell, species), frustum culling by bounding sphere and per-cell
// distance culling. No per-instance materials or meshes.

import {
  BufferGeometry, CylinderGeometry, IcosahedronGeometry, InstancedMesh, Matrix4,
  MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, Quaternion, Vector3, BoxGeometry, Group,
} from 'three';
import type { Material } from 'three';
import type { FloraRule, FloraSpecies } from '../../content/types.ts';
import type { PlacedInstance, FloraPlacement } from '../../terrain/placement.ts';
import { linearColor, mergeParts } from './primitives.ts';
import type { Part } from './primitives.ts';

export const CELL_SIZE = 500;
export const CELLS_PER_SIDE = 4;

function rockGeometry(): BufferGeometry {
  const g = new IcosahedronGeometry(0.5, 0);
  const pos = g.getAttribute('position');
  // Fixed per-vertex jitter so the shared rock looks hewn (deterministic, not seeded per instance).
  const jitter = [0.92, 1.08, 0.97, 1.12, 0.88, 1.03, 0.95, 1.1, 0.9, 1.05, 0.99, 1.06];
  const keyed = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!keyed.has(key)) keyed.set(key, jitter[keyed.size % jitter.length]!);
    const k = keyed.get(key)!;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.7, pos.getZ(i) * k);
  }
  return g;
}

export function speciesGeometry(species: FloraSpecies): BufferGeometry {
  const parts: Part[] = [];
  switch (species) {
    case 'glowFlower':
      parts.push({ geometry: new CylinderGeometry(0.035, 0.05, 0.6, 3, 1, true), color: 0x3f6f45, position: [0, 0.3, 0] });
      parts.push({ geometry: new OctahedronGeometry(0.2, 0), color: 0xffffff, position: [0, 0.68, 0], scale: [1, 0.8, 1] });
      break;
    case 'giantFlower': {
      parts.push({ geometry: new CylinderGeometry(0.07, 0.12, 1, 5, 1, true), color: 0x4f8a4a, position: [0, 0.5, 0] });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        parts.push({
          geometry: new OctahedronGeometry(1, 0),
          color: 0xffffff,
          position: [Math.cos(a) * 0.3, 1.02, Math.sin(a) * 0.3],
          rotation: [0, -a, 0.35],
          scale: [0.32, 0.05, 0.15],
        });
      }
      parts.push({ geometry: new IcosahedronGeometry(0.14, 0), color: 0xffe28a, position: [0, 1.06, 0] });
      parts.push({ geometry: new OctahedronGeometry(1, 0), color: 0x5fa257, position: [0.16, 0.3, 0], rotation: [0, 0, -0.6], scale: [0.22, 0.03, 0.08] });
      parts.push({ geometry: new OctahedronGeometry(1, 0), color: 0x5fa257, position: [-0.14, 0.45, 0.05], rotation: [0, 0.4, 0.6], scale: [0.2, 0.03, 0.08] });
      break;
    }
    case 'tree':
      parts.push({ geometry: new CylinderGeometry(0.05, 0.09, 0.5, 5, 1, true), color: 0x8a6a52, position: [0, 0.25, 0] });
      parts.push({ geometry: new IcosahedronGeometry(0.32, 0), color: 0xffffff, position: [0, 0.68, 0] });
      parts.push({ geometry: new IcosahedronGeometry(0.22, 0), color: 0xf0fff0, position: [0.13, 0.86, 0.05] });
      parts.push({ geometry: new IcosahedronGeometry(0.2, 0), color: 0xe6f7e6, position: [-0.15, 0.78, -0.08] });
      break;
    case 'rock':
      parts.push({ geometry: rockGeometry(), color: 0xffffff, position: [0, 0.15, 0] });
      break;
    case 'pillar':
      parts.push({ geometry: new CylinderGeometry(0.32, 0.4, 3, 6, 1, false), color: 0xffffff, position: [0, 1.5, 0] });
      parts.push({ geometry: new BoxGeometry(1, 0.3, 1), color: 0xf2ece2, position: [0, 3.1, 0] });
      break;
  }
  return mergeParts(parts);
}

/** Glow flowers are unlit; giant flowers glow faintly; the rest share the region's Lambert material. */
export function speciesMaterial(species: FloraSpecies, shared: Material): Material {
  if (species === 'glowFlower') return new MeshBasicMaterial({ vertexColors: true });
  if (species === 'giantFlower') {
    return new MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: linearColor(0x2a1630) });
  }
  return shared;
}

interface CellMesh {
  mesh: InstancedMesh;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  maxDistance: number;
}

export class FloraLayer {
  readonly group = new Group();
  readonly cells: CellMesh[] = [];
  readonly geometries = new Map<FloraSpecies, BufferGeometry>();
  readonly materials = new Map<FloraSpecies, Material>();

  constructor(placement: FloraPlacement, rules: readonly FloraRule[], half: number, shared: Material) {
    this.group.name = 'flora';
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const pos = new Vector3();
    const scl = new Vector3();
    for (const rule of rules) {
      const instances = placement[rule.species] ?? [];
      if (instances.length === 0) continue;
      const geometry = speciesGeometry(rule.species);
      const material = speciesMaterial(rule.species, shared);
      this.geometries.set(rule.species, geometry);
      this.materials.set(rule.species, material);
      const colors = rule.colors.map((c) => linearColor(c));
      const buckets = new Map<number, PlacedInstance[]>();
      for (const inst of instances) {
        const cx = Math.min(CELLS_PER_SIDE - 1, Math.max(0, Math.floor((inst.x + half) / CELL_SIZE)));
        const cz = Math.min(CELLS_PER_SIDE - 1, Math.max(0, Math.floor((inst.z + half) / CELL_SIZE)));
        const key = cz * CELLS_PER_SIDE + cx;
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push(inst);
      }
      geometry.computeBoundingBox();
      const topY = geometry.boundingBox!.max.y;
      for (const [key, list] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
        const mesh = new InstancedMesh(geometry, material, list.length);
        mesh.name = `flora.${rule.species}.${key}`;
        let maxY = -Infinity;
        list.forEach((inst, i) => {
          q.setFromAxisAngle(up, inst.yaw);
          m.compose(pos.set(inst.x, inst.y, inst.z), q, scl.set(inst.scale, inst.scale, inst.scale));
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, colors[inst.colorIndex % colors.length]!);
          maxY = Math.max(maxY, inst.y + topY * inst.scale);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
        mesh.matrixAutoUpdate = false;
        const cx = key % CELLS_PER_SIDE;
        const cz = Math.floor(key / CELLS_PER_SIDE);
        this.cells.push({
          mesh,
          minX: -half + cx * CELL_SIZE,
          maxX: -half + (cx + 1) * CELL_SIZE,
          minZ: -half + cz * CELL_SIZE,
          maxZ: -half + (cz + 1) * CELL_SIZE,
          maxY,
          maxDistance: rule.maxDistance,
        });
        this.group.add(mesh);
      }
    }
  }

  /** Per-cell distance culling (plan §9.3). */
  update(cx: number, cy: number, cz: number): void {
    for (const c of this.cells) {
      const dx = Math.max(c.minX - cx, 0, cx - c.maxX);
      const dz = Math.max(c.minZ - cz, 0, cz - c.maxZ);
      const dy = Math.max(0, cy - c.maxY);
      c.mesh.visible = dx * dx + dy * dy + dz * dz <= c.maxDistance * c.maxDistance;
    }
  }

  instanceCount(): number {
    return this.cells.reduce((s, c) => s + c.mesh.count, 0);
  }
}
