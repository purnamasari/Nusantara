// Scripted camera poses for the frame benchmark and the CI render-count checks (plan §10.5).

import type { GeneratedRegion } from '../terrain/generate.ts';

export interface Pose {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}

/** Centre of the 100 m bin holding the most glow flowers. */
function densestGlowCell(g: GeneratedRegion): { x: number; z: number } {
  const bins = new Map<string, number>();
  let best = { x: 0, z: 0 };
  let bestCount = -1;
  for (const f of g.flora.glowFlower ?? []) {
    const bx = Math.floor(f.x / 100);
    const bz = Math.floor(f.z / 100);
    const key = `${bx},${bz}`;
    const n = (bins.get(key) ?? 0) + 1;
    bins.set(key, n);
    if (n > bestCount) {
      bestCount = n;
      best = { x: bx * 100 + 50, z: bz * 100 + 50 };
    }
  }
  return best;
}

export function benchmarkPoses(g: GeneratedRegion): Pose[] {
  const h = (x: number, z: number) => g.surface.height(x, z);
  const s = g.spawn;
  const d = densestGlowCell(g);
  const lake = g.surface.lake ?? { x: 0, z: 0, height: 0, radius: 50 };
  const bloom = g.landmarks.find((l) => l.kind === 'motherBloom') ?? g.landmarks[0]!;
  return [
    { name: 'spawn', position: [s.x, s.y + 3, s.z + 8], target: [g.portal.x, g.portal.y + 3, g.portal.z] },
    { name: 'densest-glow-low', position: [d.x, h(d.x, d.z + 30) + 15, d.z + 30], target: [d.x, h(d.x, d.z), d.z] },
    { name: 'petal-volume', position: [d.x + 40, h(d.x + 40, d.z) + 6, d.z], target: [d.x - 40, h(d.x - 40, d.z) + 4, d.z] },
    { name: 'crystal-lake-hover', position: [lake.x, lake.height + 12, lake.z + 40], target: [lake.x, lake.height, lake.z] },
    { name: 'mother-bloom-circle', position: [bloom.x + 60, bloom.y + 40, bloom.z], target: [bloom.x, bloom.y + 30, bloom.z] },
    { name: 'high-overview', position: [0, g.field.maxHeight + 350, 900], target: [0, 0, 0] },
  ];
}

/** The five key poses checked in CI (the petal pose duplicates the densest-cell view). */
export const CI_POSE_INDICES = [0, 1, 3, 4, 5] as const;
