// The three Bandung landmarks (GDD §4.1; fictional). Visual colliders match the content
// collider definitions exactly (plan §12.7).

import {
  BufferGeometry, ConeGeometry, CylinderGeometry, DoubleSide, EdgesGeometry, Group, IcosahedronGeometry,
  InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, SphereGeometry,
  BufferAttribute, Quaternion, Vector3, RingGeometry, Color, SRGBColorSpace,
} from 'three';
import type { Material } from 'three';
import { hash32, hashToUnit } from '../../lib/hash.ts';
import type { ResolvedLandmark, WorldCollider } from '../../terrain/generate.ts';
import type { LakeDisc } from '../../terrain/surface.ts';
import { linearColor, mergeParts } from './primitives.ts';
import type { Part } from './primitives.ts';

function motherBloom(l: ResolvedLandmark, shared: Material): Group {
  const g = new Group();
  g.name = l.id;
  const stemParts: Part[] = [
    { geometry: new CylinderGeometry(1.6, 2.6, 60, 8, 1, true), color: 0x4c8a4f, position: [0, 30, 0] },
    { geometry: new SphereGeometry(1, 8, 4), color: 0x5fa257, position: [6, 2.5, 0], rotation: [0, 0, -0.4], scale: [8, 0.8, 3] },
    { geometry: new SphereGeometry(1, 8, 4), color: 0x5fa257, position: [-4, 3.5, 4.5], rotation: [0, 2.2, -0.4], scale: [7, 0.8, 3] },
    { geometry: new SphereGeometry(1, 8, 4), color: 0x6cb060, position: [-3, 4.5, -5], rotation: [0, -2.1, -0.5], scale: [7, 0.8, 2.6] },
  ];
  const stem = new Mesh(mergeParts(stemParts), shared);
  const petals: Part[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    petals.push({
      geometry: new SphereGeometry(1, 8, 4),
      color: k % 2 === 0 ? 0xff8fc8 : 0xe9a6ff,
      position: [Math.cos(a) * 11, 61 + 3, Math.sin(a) * 11],
      rotation: [0, -a, 0.45],
      scale: [13, 1.6, 5.5],
    });
  }
  const petalMesh = new Mesh(
    mergeParts(petals),
    new MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: linearColor(0x3a1838), fog: false }),
  );
  const core = new Mesh(new IcosahedronGeometry(5.5, 1), new MeshBasicMaterial({ color: linearColor(0xffe48f), fog: false }));
  core.position.y = 63;
  g.add(stem, petalMesh, core);
  g.position.set(l.x, l.y - 0.5, l.z);
  return g;
}

function crystalLake(l: ResolvedLandmark, lake: LakeDisc | null, colliders: readonly WorldCollider[]): Group {
  const g = new Group();
  g.name = l.id;
  if (lake) {
    // Faceted crystal: each triangle gets a deterministic tint around pale cyan.
    const ring = new RingGeometry(0, lake.radius, 32, 6).toNonIndexed();
    const count = ring.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    const tint = new Color();
    for (let t = 0; t < count / 3; t++) {
      const k = hashToUnit(hash32(7, t));
      tint.setRGB(0.68 + 0.18 * k, 0.88 + 0.1 * k, 0.95 + 0.05 * k, SRGBColorSpace);
      for (let v = 0; v < 3; v++) colors.set([tint.r, tint.g, tint.b], (t * 3 + v) * 3);
    }
    ring.setAttribute('color', new BufferAttribute(colors, 3));
    const disc = new Mesh(
      ring,
      new MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: linearColor(0x24506a) }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(lake.x, lake.height, lake.z);
    disc.name = 'crystal-lake-surface';
    g.add(disc);
  }
  const mine = colliders.filter((c) => c.owner === l.id);
  if (mine.length > 0) {
    const spire = new ConeGeometry(1.6, 9, 6, 1);
    spire.translate(0, 4.5, 0);
    const mesh = new InstancedMesh(spire, new MeshLambertMaterial({ color: linearColor(0x9fe9ff), emissive: linearColor(0x2a7a9a), flatShading: true }), mine.length);
    const m = new Matrix4();
    mine.forEach((c, i) => {
      const s = 0.85 + ((i * 37) % 10) / 30;
      m.compose(new Vector3(c.x, c.baseY - 0.5, c.z), new Quaternion(), new Vector3(1, s, 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.computeBoundingSphere();
    mesh.name = 'crystal-spires';
    g.add(mesh);
  }
  return g;
}

function greenhouse(l: ResolvedLandmark, colliders: readonly WorldCollider[], shared: Material): Group {
  const g = new Group();
  g.name = l.id;
  const mine = colliders.filter((c) => c.owner === l.id);
  const pillarParts: Part[] = mine.map((c) => ({
    geometry: new CylinderGeometry(c.radius * 0.9, c.radius, c.height, 6),
    color: 0xd9cfbf,
    position: [c.x - l.x, c.height / 2 - 0.3, c.z - l.z] as [number, number, number],
  }));
  pillarParts.push({ geometry: new CylinderGeometry(15.5, 16, 0.6, 24), color: 0xc9bca8, position: [0, 0, 0] });
  const pillars = new Mesh(mergeParts(pillarParts), shared);

  const domeGeom = new SphereGeometry(14.5, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  const frame = new LineSegments(new EdgesGeometry(domeGeom, 1), new LineBasicMaterial({ color: linearColor(0x8a6e4b) }));
  frame.position.y = 9.6;
  // Glass panels with deterministic gaps ("broken" panes).
  const glassSrc = domeGeom.toNonIndexed();
  const pos = glassSrc.getAttribute('position');
  const kept: number[] = [];
  for (let t = 0; t < pos.count / 3; t++) {
    if (t % 5 === 2 || t % 7 === 4) continue;
    for (let v = 0; v < 3; v++) kept.push(pos.getX(t * 3 + v), pos.getY(t * 3 + v), pos.getZ(t * 3 + v));
  }
  const glassGeom = new BufferGeometry();
  glassGeom.setAttribute('position', new BufferAttribute(new Float32Array(kept), 3));
  glassGeom.computeVertexNormals();
  const glass = new Mesh(
    glassGeom,
    new MeshLambertMaterial({ color: linearColor(0xcff5e4), transparent: true, opacity: 0.28, side: DoubleSide, depthWrite: false }),
  );
  glass.position.y = 9.6;
  glassSrc.dispose();
  domeGeom.dispose();
  g.add(pillars, frame, glass);
  g.position.set(l.x, l.y, l.z);
  return g;
}

export function buildLandmarks(
  landmarks: readonly ResolvedLandmark[],
  lake: LakeDisc | null,
  colliders: readonly WorldCollider[],
  shared: Material,
): Group {
  const root = new Group();
  root.name = 'landmarks';
  for (const l of landmarks) {
    if (l.kind === 'motherBloom') root.add(motherBloom(l, shared));
    else if (l.kind === 'crystalLake') root.add(crystalLake(l, lake, colliders));
    else root.add(greenhouse(l, colliders, shared));
  }
  return root;
}
