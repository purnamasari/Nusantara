import { describe, expect, it } from 'vitest';
import { REGIONS } from '../../src/content/registry.ts';
import { bandung } from '../../src/content/regions/bandung.ts';
import { collect, nearestInteractable } from '../../src/rules/collectibles.ts';
import { isComplete, isUnlocked, regionProgress, regionStatus, teleportOptions } from '../../src/rules/progression.ts';

const ids = bandung.collectibles.map((c) => c.id);
const valid = new Set(ids);
const jakarta = REGIONS.find((r) => r.id === 'jakarta')!;

describe('collectibles (plan §12.6)', () => {
  it('collecting is idempotent and ignores unknown ids', () => {
    let s: ReadonlySet<string> = new Set();
    let r = collect(s, ids[0]!, valid);
    expect(r.changed).toBe(true);
    s = r.collected;
    r = collect(s, ids[0]!, valid);
    expect(r.changed).toBe(false);
    expect(r.collected.size).toBe(1);
    r = collect(s, 'bandung.flora.unknown', valid);
    expect(r.changed).toBe(false);
  });

  it('only the nearest target in range is offered, and nothing while locked', () => {
    const targets = [
      { id: 'a', kind: 'collectible' as const, x: 3, y: 0, z: 0 },
      { id: 'b', kind: 'collectible' as const, x: 1, y: 0, z: 0 },
      { id: 'far', kind: 'collectible' as const, x: 50, y: 0, z: 0 },
    ];
    expect(nearestInteractable(0, 0, 0, targets, 5, false)?.id).toBe('b');
    expect(nearestInteractable(0, 0, 0, targets, 5, true)).toBeNull();
    expect(nearestInteractable(40, 0, 0, targets, 5, false)).toBeNull();
  });
});

describe('progression is derived from collected ids (plan §13.2)', () => {
  it('4 / 5 keeps the portal inactive and Jakarta locked', () => {
    const four = new Set(ids.slice(0, 4));
    expect(regionProgress(bandung, four)).toEqual({ count: 4, total: 5 });
    expect(isComplete(bandung, four)).toBe(false);
    expect(isUnlocked(jakarta, REGIONS, four)).toBe(false);
    expect(regionStatus(jakarta, REGIONS, four, new Set())).toBe('locked');
  });

  it('5 / 5 completes Bandung and unlocks the Jakarta preview, in any order', () => {
    const shuffled = new Set([ids[3]!, ids[0]!, ids[4]!, ids[1]!, ids[2]!]);
    expect(isComplete(bandung, shuffled)).toBe(true);
    expect(isUnlocked(jakarta, REGIONS, shuffled)).toBe(true);
    expect(regionStatus(jakarta, REGIONS, shuffled, new Set())).toBe('unlocked');
    expect(regionStatus(bandung, REGIONS, shuffled, new Set(['bandung']))).toBe('completed');
  });

  it('unknown ids are ignored and a preview region can never complete', () => {
    const s = new Set([...ids.slice(0, 4), 'bandung.flora.ghost', 'jakarta.data.one']);
    expect(regionProgress(bandung, s).count).toBe(4);
    expect(isComplete(jakarta, new Set(['anything']))).toBe(false);
  });

  it('status precedence: completed > visited > unlocked > locked', () => {
    expect(regionStatus(bandung, REGIONS, new Set(), new Set())).toBe('unlocked');
    expect(regionStatus(bandung, REGIONS, new Set(), new Set(['bandung']))).toBe('visited');
    expect(regionStatus(bandung, REGIONS, new Set(ids), new Set(['bandung']))).toBe('completed');
  });

  it('teleport options: Bandung is current; Jakarta locked, then unlocked but not available', () => {
    const before = teleportOptions(REGIONS, new Set(), new Set(['bandung']), 'bandung');
    expect(before.find((o) => o.id === 'bandung')).toMatchObject({ current: true, available: false, status: 'visited' });
    expect(before.find((o) => o.id === 'jakarta')).toMatchObject({ status: 'locked', available: false });
    const after = teleportOptions(REGIONS, new Set(ids), new Set(['bandung']), 'bandung');
    expect(after.find((o) => o.id === 'bandung')!.status).toBe('completed');
    expect(after.find((o) => o.id === 'jakarta')).toMatchObject({ status: 'unlocked', available: false, note: 'Not yet available in this build' });
  });
});
