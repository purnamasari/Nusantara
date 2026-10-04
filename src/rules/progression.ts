// Region status is derived from collected IDs, never stored (plan §13.2).

import type { RegionDefinition, RegionEntry, RegionId } from '../content/types.ts';

export type RegionStatus = 'locked' | 'unlocked' | 'visited' | 'completed';

export function regionProgress(region: RegionDefinition, collected: ReadonlySet<string>): { count: number; total: number } {
  let count = 0;
  for (const c of region.collectibles) if (collected.has(c.id)) count++;
  return { count, total: region.collectibles.length };
}

export function isComplete(region: RegionEntry, collected: ReadonlySet<string>): boolean {
  if (!region.playable || region.collectibles.length === 0) return false;
  return region.collectibles.every((c) => collected.has(c.id));
}

export function isUnlocked(region: RegionEntry, regions: readonly RegionEntry[], collected: ReadonlySet<string>): boolean {
  return region.unlock.requires.every((id) => {
    const req = regions.find((r) => r.id === id);
    return req !== undefined && isComplete(req, collected);
  });
}

/** Display status, precedence completed > visited > unlocked > locked. */
export function regionStatus(
  region: RegionEntry,
  regions: readonly RegionEntry[],
  collected: ReadonlySet<string>,
  visited: ReadonlySet<RegionId>,
): RegionStatus {
  if (isComplete(region, collected)) return 'completed';
  const unlocked = isUnlocked(region, regions, collected);
  if (unlocked && visited.has(region.id)) return 'visited';
  return unlocked ? 'unlocked' : 'locked';
}

export interface TeleportOption {
  id: RegionId;
  name: string;
  title: string;
  status: RegionStatus;
  current: boolean;
  available: boolean;
  note: string;
}

export function teleportOptions(
  regions: readonly RegionEntry[],
  collected: ReadonlySet<string>,
  visited: ReadonlySet<RegionId>,
  currentId: RegionId,
): TeleportOption[] {
  return regions.map((r) => {
    const status = regionStatus(r, regions, collected, visited);
    const current = r.id === currentId;
    const unlocked = status !== 'locked';
    let note: string;
    if (current) note = 'You are here';
    else if (!unlocked) {
      const names = r.unlock.requires.map((id) => regions.find((x) => x.id === id)?.name ?? id);
      note = `Restore ${names.join(', ')} to unlock`;
    } else if (!r.playable) note = 'Not yet available in this build';
    else note = 'Ready to travel';
    return { id: r.id, name: r.name, title: r.title, status, current, available: unlocked && r.playable && !current, note };
  });
}
