// Builds every three.js object for a generated region. Needs no renderer, so material and
// geometry structure can be tested in Node (plan §16 M7).

import { Group, MeshLambertMaterial } from 'three';
import type { Material, Object3D, BufferGeometry } from 'three';
import type { GeneratedRegion } from '../../terrain/generate.ts';
import { buildTerrainMesh } from './terrainMesh.ts';
import { FloraLayer } from './flora.ts';
import { Atmosphere } from './atmosphere.ts';
import { buildLandmarks } from './landmarks.ts';
import { PortalVisual } from './portal.ts';
import { Spirits } from './spirits.ts';

export class RegionScene {
  readonly root = new Group();
  readonly atmosphere: Atmosphere;
  readonly flora: FloraLayer;
  readonly spirits: Spirits;
  readonly portal: PortalVisual;

  constructor(g: GeneratedRegion) {
    this.root.name = `region.${g.def.id}`;
    // One vertex-coloured Lambert material shared by terrain, most flora, stone and stems.
    const shared = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.atmosphere = new Atmosphere(g.def.biome, g.def.seed);
    this.flora = new FloraLayer(g.flora, g.def.biome.flora, g.def.world.size / 2, shared);
    this.spirits = new Spirits(g.collectibles);
    this.portal = new PortalVisual(g.portal, g.colliders, shared);
    this.root.add(
      this.atmosphere.group,
      buildTerrainMesh(g.field, g.colors, shared),
      this.flora.group,
      buildLandmarks(g.landmarks, g.surface.lake, g.colliders, shared),
      this.portal.group,
      this.spirits.group,
    );
  }

  update(time: number, dt: number, camX: number, camY: number, camZ: number, viewportHeight: number, groundY: number): void {
    this.atmosphere.update(time, camX, camY, camZ, viewportHeight, groundY);
    this.flora.update(camX, camY, camZ);
    this.spirits.update(time, viewportHeight);
    this.portal.update(time, dt);
  }

  /** Unique materials in the region (plan §9.4 target ≤ 20). */
  materials(): Set<Material> {
    const out = new Set<Material>();
    this.root.traverse((o: Object3D) => {
      const m = (o as { material?: Material | Material[] }).material;
      if (Array.isArray(m)) m.forEach((x) => out.add(x));
      else if (m) out.add(m);
    });
    return out;
  }

  geometries(): Set<BufferGeometry> {
    const out = new Set<BufferGeometry>();
    this.root.traverse((o: Object3D) => {
      const g = (o as { geometry?: BufferGeometry }).geometry;
      if (g) out.add(g);
    });
    return out;
  }

  /** Releases every geometry and material once (shared ones are deduplicated). */
  dispose(): void {
    for (const g of this.geometries()) g.dispose();
    for (const m of this.materials()) m.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
