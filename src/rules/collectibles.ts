// Collectible interaction rules (plan §12.6). Pure; the engine supplies positions.

export interface Interactable {
  id: string;
  kind: 'collectible' | 'portal';
  x: number;
  y: number;
  z: number;
}

/** Idempotent: collecting an already-collected or unknown ID changes nothing. */
export function collect(
  collected: ReadonlySet<string>,
  id: string,
  validIds: ReadonlySet<string>,
): { collected: ReadonlySet<string>; changed: boolean } {
  if (!validIds.has(id) || collected.has(id)) return { collected, changed: false };
  const next = new Set(collected);
  next.add(id);
  return { collected: next, changed: true };
}

/** Nearest target within `radius` metres, or null when none is in range or interaction is locked. */
export function nearestInteractable(
  x: number,
  y: number,
  z: number,
  targets: readonly Interactable[],
  radius: number,
  locked: boolean,
): Interactable | null {
  if (locked) return null;
  let best: Interactable | null = null;
  let bestD2 = radius * radius;
  for (const t of targets) {
    const dx = t.x - x;
    const dy = t.y - y;
    const dz = t.z - z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = t;
    }
  }
  return best;
}
