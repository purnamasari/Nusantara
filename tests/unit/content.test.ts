import { describe, expect, it } from 'vitest';
import { REGIONS } from '../../src/content/registry.ts';
import { bandung } from '../../src/content/regions/bandung.ts';
import { validateRegionDefinition, validateRegistry } from '../../src/content/validate.ts';
import type { RegionEntry } from '../../src/content/types.ts';
import { geo } from '../../src/geo/types.ts';

describe('region configuration validation (plan §11.5)', () => {
  it('the shipped registry is valid', () => {
    expect(validateRegistry(REGIONS)).toEqual([]);
  });

  it('Bandung has exactly 5 uniquely-identified, correctly-prefixed collectibles and ≥ 3 landmarks', () => {
    expect(bandung.collectibles).toHaveLength(5);
    expect(new Set(bandung.collectibles.map((c) => c.id)).size).toBe(5);
    for (const c of bandung.collectibles) expect(c.id).toMatch(/^bandung\.[a-z]+\.[a-z0-9-]+$/);
    expect(bandung.landmarks.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects 4 collectibles', () => {
    const issues = validateRegionDefinition({ ...bandung, collectibles: bandung.collectibles.slice(0, 4) });
    expect(issues.some((i) => i.path === 'collectibles')).toBe(true);
  });

  it('rejects duplicate and wrongly-prefixed collectible ids', () => {
    const dup = [...bandung.collectibles.slice(0, 4), { ...bandung.collectibles[0]! }];
    expect(validateRegionDefinition({ ...bandung, collectibles: dup }).some((i) => i.message.includes('duplicate'))).toBe(true);
    const wrong = [{ ...bandung.collectibles[0]!, id: 'jakarta.data.one' }, ...bandung.collectibles.slice(1)];
    expect(validateRegionDefinition({ ...bandung, collectibles: wrong }).some((i) => i.path === 'collectibles[0].id')).toBe(true);
  });

  it('rejects anchors outside the bounds', () => {
    const out = [{ ...bandung.collectibles[0]!, at: geo(-5, 107.5) }, ...bandung.collectibles.slice(1)];
    expect(validateRegionDefinition({ ...bandung, collectibles: out }).some((i) => i.path === 'collectibles[0].at')).toBe(true);
    expect(validateRegionDefinition({ ...bandung, spawn: { at: geo(-8, 107.5), heading: 0 } }).some((i) => i.path === 'spawn.at')).toBe(true);
  });

  it('rejects unlock cycles, unknown references and multiple start regions', () => {
    const a: RegionEntry = { id: 'alpha', name: 'A', title: 'A', playable: false, unlock: { requires: ['beta'] } };
    const b: RegionEntry = { id: 'beta', name: 'B', title: 'B', playable: false, unlock: { requires: ['alpha'] } };
    const issues = validateRegistry([bandung, a, b]);
    expect(issues.some((i) => i.message.includes('cycle'))).toBe(true);
    const unknown: RegionEntry = { id: 'gamma', name: 'G', title: 'G', playable: false, unlock: { requires: ['nowhere'] } };
    expect(validateRegistry([bandung, unknown]).some((i) => i.message.includes('unknown region'))).toBe(true);
    const second: RegionEntry = { id: 'delta', name: 'D', title: 'D', playable: false, unlock: { requires: [] } };
    expect(validateRegistry([bandung, second]).some((i) => i.message.includes('exactly one start region'))).toBe(true);
  });

  it('rejects flora caps above 10,000 in total', () => {
    const flora = bandung.biome.flora.map((f) => ({ ...f, cap: 5000 }));
    expect(validateRegionDefinition({ ...bandung, biome: { ...bandung.biome, flora } }).some((i) => i.path === 'biome.flora')).toBe(true);
  });
});
