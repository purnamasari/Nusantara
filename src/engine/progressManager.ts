// Glue between the save rules and the running game (plan §13.4).

import type { RegionId } from '../content/types.ts';
import { loadSave, writeSave } from '../rules/save.ts';
import type { SavedPlayer, SaveNotice, SaveV1, StorageLike } from '../rules/save.ts';

export function browserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

export class ProgressManager {
  save: SaveV1;
  collected: Set<string>;
  visited: Set<RegionId>;
  isNew = true;
  private readonly storage: StorageLike | null;
  private writeFailedReported = false;
  /** Called once with a notice code for the player. */
  onNotice: (notice: SaveNotice) => void = () => {};

  constructor(storage: StorageLike | null, defaultRegion: RegionId) {
    this.storage = storage;
    const r = loadSave(storage, defaultRegion);
    this.save = r.save;
    this.isNew = r.isNew;
    this.collected = new Set(r.save.collected);
    this.visited = new Set(r.save.visitedRegions);
    if (r.notice) queueMicrotask(() => this.report(r.notice!));
  }

  private report(notice: SaveNotice): void {
    if (notice === 'SAVE_WRITE_FAILED') {
      if (this.writeFailedReported) return;
      this.writeFailedReported = true;
    }
    this.onNotice(notice);
  }

  collect(id: string): void {
    this.collected.add(id);
    this.persist();
  }

  visit(regionId: RegionId): void {
    this.save.currentRegionId = regionId;
    if (!this.visited.has(regionId)) {
      this.visited.add(regionId);
      this.persist();
    }
  }

  setPlayer(p: SavedPlayer): void {
    this.save.player = p;
  }

  persist(): boolean {
    this.save.collected = [...this.collected];
    this.save.visitedRegions = [...this.visited];
    const ok = writeSave(this.storage, this.save, new Date().toISOString());
    if (!ok) this.report('SAVE_WRITE_FAILED');
    return ok;
  }
}
