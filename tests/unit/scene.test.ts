import { describe, expect, it } from 'vitest';
import { InstancedMesh, Mesh } from 'three';
import type { Material, Object3D } from 'three';
import { buildTerrainGeometry } from '../../src/engine/world/terrainMesh.ts';
import { speciesGeometry } from '../../src/engine/world/flora.ts';
import { triangleCount } from '../../src/engine/world/primitives.ts';
import { RegionScene } from '../../src/engine/world/regionScene.ts';
import { bandungRegion } from './helpers.ts';

const TRI_BUDGET = { glowFlower: 24, giantFlower: 120, tree: 80, rock: 20, pillar: 40 } as const;

describe('terrain mesh (plan §7.2, §9.2)', () => {
  const g = bandungRegion();
  const geom = buildTerrainGeometry(g.field, g.colors);

  it('has 65,536 vertices, 130,050 triangles and Uint16 indices', () => {
    expect(geom.getAttribute('position').count).toBe(65536);
    expect(geom.index!.count / 3).toBe(130050);
    expect(geom.index!.array).toBeInstanceOf(Uint16Array);
  });

  it('spans x, z ∈ [−1000, 1000] and uses the authoritative heights', () => {
    const bb = geom.boundingBox!;
    expect(bb.min.x).toBeCloseTo(-1000, 3);
    expect(bb.max.x).toBeCloseTo(1000, 3);
    expect(bb.min.z).toBeCloseTo(-1000, 3);
    expect(bb.max.z).toBeCloseTo(1000, 3);
    const pos = geom.getAttribute('position');
    for (let i = 0; i < pos.count; i += 997) expect(pos.getY(i)).toBe(g.field.heights[i]);
  });

  it('winds triangles [A,C,D] and [A,D,B] facing +Y', () => {
    const idx = geom.index!.array;
    expect([...idx.slice(0, 6)]).toEqual([0, 256, 257, 0, 257, 1]);
  });
});

describe('vegetation geometry budgets (plan §9.3)', () => {
  for (const [species, budget] of Object.entries(TRI_BUDGET)) {
    it(`${species} ≤ ${budget} triangles`, () => {
      expect(triangleCount(speciesGeometry(species as keyof typeof TRI_BUDGET))).toBeLessThanOrEqual(budget);
    });
  }
});

describe('region scene structure (plan §9.4, §16 M7)', () => {
  const scene = new RegionScene(bandungRegion());

  it('uses ≤ 20 unique materials', () => {
    expect(scene.materials().size).toBeLessThanOrEqual(20);
  });

  it('every instanced mesh of a species shares one geometry and one material', () => {
    const bySpecies = new Map<string, { geoms: Set<unknown>; mats: Set<Material> }>();
    scene.flora.group.traverse((o: Object3D) => {
      if (!(o instanceof InstancedMesh)) return;
      const species = o.name.split('.')[1]!;
      const entry = bySpecies.get(species) ?? { geoms: new Set(), mats: new Set() };
      entry.geoms.add(o.geometry);
      entry.mats.add(o.material as Material);
      bySpecies.set(species, entry);
    });
    expect(bySpecies.size).toBe(5);
    for (const [, e] of bySpecies) {
      expect(e.geoms.size).toBe(1);
      expect(e.mats.size).toBe(1);
    }
  });

  it('has no per-instance meshes and at most 80 flora instanced meshes', () => {
    let instanced = 0;
    let plainFloraMeshes = 0;
    scene.flora.group.traverse((o) => {
      if (o instanceof InstancedMesh) instanced++;
      else if (o instanceof Mesh) plainFloraMeshes++;
    });
    expect(instanced).toBeLessThanOrEqual(80);
    expect(plainFloraMeshes).toBe(0);
    expect(scene.flora.instanceCount()).toBe(Object.values(bandungRegion().flora).flat().length);
  });

  it('distance culling hides far cells and shows near ones', () => {
    scene.flora.update(-900, 10, -900);
    const visibleNear = scene.flora.cells.filter((c) => c.mesh.visible).length;
    scene.flora.update(0, 100000, 0);
    const visibleFar = scene.flora.cells.filter((c) => c.mesh.visible).length;
    expect(visibleNear).toBeGreaterThan(0);
    expect(visibleFar).toBe(0);
  });

  it('dispose releases the region root', () => {
    const s2 = new RegionScene(bandungRegion());
    s2.dispose();
    expect(s2.root.children).toHaveLength(0);
  });
});
