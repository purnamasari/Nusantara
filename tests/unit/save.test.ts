import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, CURRENT_SCHEMA, loadSave, normalizeSave, runMigrations, SAVE_KEY, writeSave } from '../../src/rules/save.ts';
import type { Migration, StorageLike } from '../../src/rules/save.ts';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  failWrites = false;
  failReads = false;
  getItem(k: string) {
    if (this.failReads) throw new Error('SecurityError');
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
}

describe('save data v1 (plan §13)', () => {
  it('starts fresh when nothing is stored', () => {
    const r = loadSave(new MemoryStorage(), 'bandung');
    expect(r).toMatchObject({ isNew: true, notice: null });
    expect(r.save.collected).toEqual([]);
  });

  it('round-trips and removes duplicates', () => {
    const s = new MemoryStorage();
    const save = loadSave(s, 'bandung').save;
    save.collected = ['bandung.flora.rose', 'bandung.flora.rose', 'bandung.flora.lotus'];
    save.visitedRegions = ['bandung'];
    save.player = { regionId: 'bandung', x: 1, y: 2, z: 3, headingRad: 0.5, mode: 'fly' };
    expect(writeSave(s, save, '2026-10-04T00:00:00Z')).toBe(true);
    const back = loadSave(s, 'bandung');
    expect(back.isNew).toBe(false);
    expect(back.save.collected).toEqual(['bandung.flora.rose', 'bandung.flora.lotus']);
    expect(back.save.player).toEqual(save.player);
    expect(back.save.savedAt).toBe('2026-10-04T00:00:00Z');
  });

  it('corrupt JSON is backed up and replaced with a fresh save (SAVE_CORRUPT)', () => {
    const s = new MemoryStorage();
    s.data.set(SAVE_KEY, '{not json');
    const r = loadSave(s, 'bandung');
    expect(r.notice).toBe('SAVE_CORRUPT');
    expect(r.save.collected).toEqual([]);
    expect(s.data.get(BACKUP_KEY)).toBe('{not json');
    s.data.set(SAVE_KEY, JSON.stringify({ collected: [] }));
    expect(loadSave(s, 'bandung').notice).toBe('SAVE_CORRUPT');
  });

  it('a newer schemaVersion is backed up, never silently overwritten (SAVE_INCOMPATIBLE)', () => {
    const s = new MemoryStorage();
    const raw = JSON.stringify({ schemaVersion: CURRENT_SCHEMA + 1, collected: ['x'] });
    s.data.set(SAVE_KEY, raw);
    const r = loadSave(s, 'bandung');
    expect(r.notice).toBe('SAVE_INCOMPATIBLE');
    expect(s.data.get(BACKUP_KEY)).toBe(raw);
  });

  it('storage failures do not throw (SAVE_WRITE_FAILED)', () => {
    const s = new MemoryStorage();
    s.failReads = true;
    expect(loadSave(s, 'bandung').notice).toBe('SAVE_WRITE_FAILED');
    const w = new MemoryStorage();
    w.failWrites = true;
    expect(writeSave(w, loadSave(new MemoryStorage(), 'bandung').save, 'now')).toBe(false);
    expect(loadSave(null, 'bandung').notice).toBe('SAVE_WRITE_FAILED');
  });

  it('drops malformed fields', () => {
    const s = normalizeSave({ schemaVersion: 1, collected: ['a', 3, null, 'a'], player: { x: NaN, y: 0, z: 0 } }, 'bandung');
    expect(s.collected).toEqual(['a']);
    expect(s.player).toBeNull();
    expect(s.currentRegionId).toBe('bandung');
  });

  it('migration framework runs ordered steps and rejects gaps', () => {
    const migrations: Record<number, Migration> = {
      1: (d) => ({ ...d, schemaVersion: 2, discoveredLandmarks: [] }),
      2: (d) => ({ ...d, schemaVersion: 3, explored: {} }),
    };
    const out = runMigrations({ schemaVersion: 1, collected: ['a'] }, migrations, 3);
    expect(out).toEqual({ schemaVersion: 3, collected: ['a'], discoveredLandmarks: [], explored: {} });
    expect(() => runMigrations({ schemaVersion: 1 }, { 1: (d) => ({ ...d, schemaVersion: 3 }) }, 3)).toThrow();
    expect(() => runMigrations({ schemaVersion: 1 }, {}, 2)).toThrow();
  });
});
