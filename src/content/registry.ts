import { bandung } from './regions/bandung.ts';
import type { RegionDefinition, RegionEntry, RegionId } from './types.ts';

/** Jakarta is only a locked-destination preview in the MVP (GDD §12.3). */
const jakartaPreview: RegionEntry = {
  id: 'jakarta',
  name: 'Jakarta',
  title: 'Neon Abyss',
  playable: false,
  unlock: { requires: ['bandung'] },
};

export const REGIONS: readonly RegionEntry[] = [bandung, jakartaPreview];

export const START_REGION_ID: RegionId = 'bandung';

export function findRegion(id: RegionId, regions: readonly RegionEntry[] = REGIONS): RegionEntry | undefined {
  return regions.find((r) => r.id === id);
}

export function getPlayableRegion(id: RegionId, regions: readonly RegionEntry[] = REGIONS): RegionDefinition {
  const r = findRegion(id, regions);
  if (!r || !r.playable) throw new Error(`Region ${id} is not playable`);
  return r;
}
