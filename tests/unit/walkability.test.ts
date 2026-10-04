import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/engine/player/movement.ts';
import type { GeneratedRegion } from '../../src/terrain/generate.ts';
import { bandungRegion } from './helpers.ts';

// Plan §16 M4: the terrain is walkable from spawn to every landmark (and spirit) without a
// slope block. Breadth-first search over a 4 m lattice; a step is allowed when the surface
// under both ends is ≤ 50° and the midpoint is clear of colliders.
const STEP = 4;
const COS_MAX = Math.cos((TUNING.maxSlopeDeg * Math.PI) / 180);

function reachable(g: GeneratedRegion): (x: number, z: number) => boolean {
  const wb = g.def.world.walkBound;
  const n = Math.floor((2 * wb) / STEP) + 1;
  const idx = (x: number, z: number) => Math.round((z + wb) / STEP) * n + Math.round((x + wb) / STEP);
  const pos = (i: number) => ({ x: -wb + (i % n) * STEP, z: -wb + Math.floor(i / n) * STEP });
  const normal = { x: 0, y: 1, z: 0 };
  const walkable = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const p = pos(i);
    g.surface.normal(p.x, p.z, normal);
    const blocked = g.colliders.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.radius + TUNING.radius);
    walkable[i] = normal.y >= COS_MAX && !blocked ? 1 : 0;
  }
  const seen = new Uint8Array(n * n);
  const queue = [idx(g.spawn.x, g.spawn.z)];
  seen[queue[0]!] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const c = i % n;
    const r = Math.floor(i / n);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= n || rr >= n) continue;
      const j = rr * n + cc;
      if (seen[j] || !walkable[j]) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return (x, z) => {
    // Accept the target if any lattice node within 6 m was reached.
    for (let dz = -6; dz <= 6; dz += STEP / 2) {
      for (let dx = -6; dx <= 6; dx += STEP / 2) {
        const i = idx(Math.max(-wb, Math.min(wb, x + dx)), Math.max(-wb, Math.min(wb, z + dz)));
        if (seen[i]) return true;
      }
    }
    return false;
  };
}

describe('walkability from spawn (plan §16 M4)', () => {
  const g = bandungRegion();
  const canReach = reachable(g);

  for (const l of g.landmarks) {
    it(`reaches ${l.name} on foot`, () => expect(canReach(l.x, l.z)).toBe(true));
  }
  for (const c of g.collectibles) {
    it(`reaches ${c.name} on foot`, () => expect(canReach(c.x, c.z)).toBe(true));
  }
  it('reaches the Petal Gate', () => expect(canReach(g.portal.x, g.portal.z)).toBe(true));
});
