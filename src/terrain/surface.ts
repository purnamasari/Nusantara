// Walkable surface = terrain heightfield plus flat walkable discs (the Crystal Lake, plan §7.6).

import { HeightField } from './heightField.ts';
import type { Vec3Like } from './heightField.ts';

export interface LakeDisc {
  x: number;
  z: number;
  radius: number;
  height: number;
}

export class Surface {
  readonly field: HeightField;
  readonly lake: LakeDisc | null;

  constructor(field: HeightField, lake: LakeDisc | null) {
    this.field = field;
    this.lake = lake;
  }

  private onLakeDisc(x: number, z: number): boolean {
    const l = this.lake;
    if (!l) return false;
    const dx = x - l.x;
    const dz = z - l.z;
    return dx * dx + dz * dz <= l.radius * l.radius;
  }

  height(x: number, z: number): number {
    const t = this.field.sample(x, z);
    if (this.lake && this.onLakeDisc(x, z) && this.lake.height > t) return this.lake.height;
    return t;
  }

  onLake(x: number, z: number): boolean {
    return this.lake !== null && this.onLakeDisc(x, z) && this.lake.height >= this.field.sample(x, z);
  }

  normal(x: number, z: number, out: Vec3Like = { x: 0, y: 1, z: 0 }): Vec3Like {
    if (this.onLake(x, z)) {
      out.x = 0;
      out.y = 1;
      out.z = 0;
      return out;
    }
    return this.field.faceNormal(x, z, out);
  }
}
