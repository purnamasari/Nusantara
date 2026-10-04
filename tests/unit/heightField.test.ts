import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { HeightField } from '../../src/terrain/heightField.ts';
import { Surface } from '../../src/terrain/surface.ts';
import { buildTerrainGeometry } from '../../src/engine/world/terrainMesh.ts';
import { mulberry32 } from '../../src/lib/rng.ts';

const TAN30 = Math.tan(Math.PI / 6);
const TAN60 = Math.tan(Math.PI / 3);

function planeField(n: number, size: number, fn: (x: number, z: number) => number): HeightField {
  const half = size / 2;
  const sp = size / (n - 1);
  const h = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) h[r * n + c] = fn(-half + c * sp, -half + r * sp);
  return new HeightField(h, n, size);
}

function randomField(n: number, size: number, seed: number): HeightField {
  const rand = mulberry32(seed);
  const h = new Float32Array(n * n);
  for (let i = 0; i < h.length; i++) h[i] = rand() * 20 - 5;
  return new HeightField(h, n, size);
}

const slopeDeg = (f: HeightField, x: number, z: number) => (Math.acos(f.faceNormal(x, z).y) * 180) / Math.PI;

describe('HeightField sampling (plan §7.7)', () => {
  const f = randomField(17, 160, 11);
  const sp = f.spacing;

  it('returns stored heights at every grid vertex, including the four corners', () => {
    for (let r = 0; r < f.n; r++) {
      for (let c = 0; c < f.n; c++) {
        expect(f.sample(-80 + c * sp, -80 + r * sp)).toBeCloseTo(f.get(r, c), 4);
      }
    }
    expect(f.sample(-80, -80)).toBeCloseTo(f.get(0, 0), 5);
    expect(f.sample(80, -80)).toBeCloseTo(f.get(0, 16), 5);
    expect(f.sample(-80, 80)).toBeCloseTo(f.get(16, 0), 5);
    expect(f.sample(80, 80)).toBeCloseTo(f.get(16, 16), 5);
  });

  it('is continuous along edges and across the A–D diagonal', () => {
    const rand = mulberry32(5);
    for (let i = 0; i < 500; i++) {
      const c = Math.floor(rand() * 16);
      const r = Math.floor(rand() * 16);
      const t = rand();
      const x = -80 + (c + t) * sp;
      const z = -80 + (r + t) * sp;
      const eps = 1e-7;
      expect(f.sample(x + eps, z)).toBeCloseTo(f.sample(x - eps, z + eps), 4);
    }
    // East and south edges (u = 1 / v = 1) fall in the last cell.
    expect(f.sample(80, 0)).toBeCloseTo(f.sample(80 - 1e-9, 0), 6);
    expect(f.sample(0, 80)).toBeCloseTo(f.sample(0, 80 - 1e-9), 6);
  });

  it('matches the built mesh (Raycaster against buildTerrainGeometry)', () => {
    const colors = new Float32Array(f.n * f.n * 3).fill(0.5);
    const mesh = new Mesh(buildTerrainGeometry(f, colors), new MeshBasicMaterial());
    const ray = new Raycaster();
    const rand = mulberry32(9);
    for (let i = 0; i < 300; i++) {
      const x = -79.9 + rand() * 159.8;
      const z = -79.9 + rand() * 159.8;
      ray.set(new Vector3(x, 1000, z), new Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0];
      expect(hit).toBeDefined();
      expect(Math.abs(hit!.point.y - f.sample(x, z))).toBeLessThan(1e-3);
    }
  });

  it('reproduces analytic planes and their slopes (30° and 60°)', () => {
    const p30 = planeField(9, 80, (x) => x * TAN30 + 3);
    const p60 = planeField(9, 80, (_x, z) => -z * TAN60);
    for (const [x, z] of [[-30, 10], [0, 0], [17.3, -22.1], [39, 39]]) {
      expect(p30.sample(x!, z!)).toBeCloseTo(x! * TAN30 + 3, 4);
      expect(slopeDeg(p30, x!, z!)).toBeCloseTo(30, 2);
      expect(p60.sample(x!, z!)).toBeCloseTo(-z! * TAN60, 3);
      expect(slopeDeg(p60, x!, z!)).toBeCloseTo(60, 2);
    }
  });

  it('clamps out-of-bounds queries to the edge and reports isInside = false', () => {
    expect(f.sample(5000, 0)).toBeCloseTo(f.sample(80, 0), 6);
    expect(f.sample(-5000, 0)).toBeCloseTo(f.sample(-80, 0), 6);
    expect(f.sample(0, 5000)).toBeCloseTo(f.sample(0, 80), 6);
    expect(f.sample(0, -5000)).toBeCloseTo(f.sample(0, -80), 6);
    expect(f.isInside(5000, 0)).toBe(false);
    expect(f.isInside(0, 0)).toBe(true);
    expect(Number.isNaN(f.sample(NaN, 0))).toBe(true);
  });

  it('uses the lake surface where the walkable disc is above the terrain (plan §7.6)', () => {
    const flat = planeField(9, 80, () => 0);
    const s = new Surface(flat, { x: 0, z: 0, radius: 10, height: 2 });
    expect(s.height(0, 0)).toBe(2);
    expect(s.height(9.9, 0)).toBe(2);
    expect(s.height(10.5, 0)).toBe(0);
    expect(s.normal(0, 0).y).toBe(1);
    expect(s.onLake(1, 1)).toBe(true);
  });
});
