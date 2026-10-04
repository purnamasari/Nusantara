// Versioned local save (plan §13). `collected` is the only authority for completion/unlock.

import type { RegionId } from '../content/types.ts';

export const SAVE_KEY = 'otherworld.save';
export const BACKUP_KEY = 'otherworld.save.backup';
export const CURRENT_SCHEMA = 1;

export interface SavedPlayer {
  regionId: RegionId;
  x: number;
  y: number;
  z: number;
  headingRad: number;
  mode: 'walk' | 'fly';
}

export interface SaveV1 {
  schemaVersion: 1;
  savedAt: string;
  collected: string[];
  visitedRegions: RegionId[];
  currentRegionId: RegionId;
  player: SavedPlayer | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SaveNotice = 'SAVE_CORRUPT' | 'SAVE_INCOMPATIBLE' | 'SAVE_WRITE_FAILED';

export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** migrations[v] upgrades a v save to v+1. Empty at v1. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export function runMigrations(
  data: Record<string, unknown>,
  migrations: Readonly<Record<number, Migration>>,
  target: number,
): Record<string, unknown> {
  let current = data;
  let v = current.schemaVersion as number;
  while (v < target) {
    const step = migrations[v];
    if (!step) throw new Error(`no migration from schema ${v}`);
    current = step(current);
    const next = current.schemaVersion as number;
    if (next !== v + 1) throw new Error(`migration from ${v} produced schema ${next}`);
    v = next;
  }
  return current;
}

export function createEmptySave(regionId: RegionId): SaveV1 {
  return { schemaVersion: 1, savedAt: '', collected: [], visitedRegions: [], currentRegionId: regionId, player: null };
}

function stringSet(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))];
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Removes duplicates and malformed entries. */
export function normalizeSave(raw: Record<string, unknown>, defaultRegion: RegionId): SaveV1 {
  const p = raw.player as Record<string, unknown> | null | undefined;
  let player: SavedPlayer | null = null;
  if (
    p && typeof p === 'object' && typeof p.regionId === 'string' &&
    finite(p.x) && finite(p.y) && finite(p.z) && finite(p.headingRad) &&
    (p.mode === 'walk' || p.mode === 'fly')
  ) {
    player = { regionId: p.regionId, x: p.x, y: p.y, z: p.z, headingRad: p.headingRad, mode: p.mode };
  }
  return {
    schemaVersion: 1,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
    collected: stringSet(raw.collected),
    visitedRegions: stringSet(raw.visitedRegions),
    currentRegionId: typeof raw.currentRegionId === 'string' && raw.currentRegionId ? raw.currentRegionId : defaultRegion,
    player,
  };
}

export interface LoadResult {
  save: SaveV1;
  notice: SaveNotice | null;
  isNew: boolean;
}

function tryBackup(storage: StorageLike, raw: string): void {
  try {
    storage.setItem(BACKUP_KEY, raw);
  } catch {
    // Backup is best-effort; the notice still tells the player.
  }
}

export function loadSave(storage: StorageLike | null, defaultRegion: RegionId): LoadResult {
  const fresh = (): SaveV1 => createEmptySave(defaultRegion);
  if (!storage) return { save: fresh(), notice: 'SAVE_WRITE_FAILED', isNew: true };
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { save: fresh(), notice: 'SAVE_WRITE_FAILED', isNew: true };
  }
  if (raw === null) return { save: fresh(), notice: null, isNew: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    tryBackup(storage, raw);
    return { save: fresh(), notice: 'SAVE_CORRUPT', isNew: true };
  }
  const data = parsed as Record<string, unknown>;
  const v = data.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    tryBackup(storage, raw);
    return { save: fresh(), notice: 'SAVE_CORRUPT', isNew: true };
  }
  if (v > CURRENT_SCHEMA) {
    tryBackup(storage, raw);
    return { save: fresh(), notice: 'SAVE_INCOMPATIBLE', isNew: true };
  }
  try {
    return { save: normalizeSave(runMigrations(data, MIGRATIONS, CURRENT_SCHEMA), defaultRegion), notice: null, isNew: false };
  } catch {
    tryBackup(storage, raw);
    return { save: fresh(), notice: 'SAVE_CORRUPT', isNew: true };
  }
}

/** Serialises the whole save. Returns false if storage threw (quota, disabled, private mode). */
export function writeSave(storage: StorageLike | null, save: SaveV1, now: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...save, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}
