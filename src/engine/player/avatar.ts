// Primitive character and petal glider (plan §12.3). Authored facing −Z.

import { CapsuleGeometry, ConeGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry } from 'three';
import { mergeParts } from '../world/primitives.ts';
import type { PlayerState } from './movement.ts';

export class Avatar {
  readonly group = new Group();
  private readonly body: Mesh;
  private readonly glider: Mesh;
  private readonly tilt = new Group();

  constructor() {
    this.group.name = 'avatar';
    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.body = new Mesh(
      mergeParts([
        { geometry: new CapsuleGeometry(0.32, 0.8, 3, 8), color: 0x5b4b8a, position: [0, 0.75, 0] },
        { geometry: new SphereGeometry(0.26, 8, 6), color: 0xf2cfae, position: [0, 1.5, 0] },
        { geometry: new ConeGeometry(0.34, 0.45, 8), color: 0xff8fc8, position: [0, 1.82, 0] },
        { geometry: new SphereGeometry(0.12, 6, 4), color: 0xffe28a, position: [0, 1.25, -0.3] },
      ]),
      material,
    );
    const wing = (side: 1 | -1, color: number) => ({
      geometry: new SphereGeometry(1, 10, 4),
      color,
      position: [side * 1.5, 1.9, 0.2] as [number, number, number],
      rotation: [0, side * 0.3, side * 0.28] as [number, number, number],
      scale: [1.6, 0.14, 0.75] as [number, number, number],
    });
    this.glider = new Mesh(
      mergeParts([
        wing(1, 0xff9bd2),
        wing(-1, 0xff9bd2),
        { geometry: new SphereGeometry(1, 8, 4), color: 0xe7b3ff, position: [1.1, 1.85, 0.9], rotation: [0, 0.9, 0], scale: [0.9, 0.05, 0.4] },
        { geometry: new SphereGeometry(1, 8, 4), color: 0xe7b3ff, position: [-1.1, 1.85, 0.9], rotation: [0, -0.9, 0], scale: [0.9, 0.05, 0.4] },
      ]),
      material,
    );
    this.tilt.add(this.body, this.glider);
    this.tilt.rotation.order = 'YXZ';
    this.group.add(this.tilt);
  }

  update(p: PlayerState, time: number): void {
    const flying = p.mode !== 'walk';
    this.glider.visible = flying;
    const bob = !flying && p.speed > 0.5 ? Math.abs(Math.sin(time * p.speed * 1.4)) * 0.08 : 0;
    this.group.position.set(p.x, p.y + bob, p.z);
    this.tilt.rotation.set(flying ? p.pitch : 0, -p.heading, flying ? p.bank : 0);
  }

  dispose(): void {
    this.body.geometry.dispose();
    this.glider.geometry.dispose();
    (this.body.material as MeshLambertMaterial).dispose();
  }
}
