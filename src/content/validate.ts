// Static region validation (plan §11.5). Reports every issue with a path, not just the first.

import { geoInBounds } from '../geo/types.ts';
import type { GeoBounds, GeoPoint } from '../geo/types.ts';
import type { RegionDefinition, RegionEntry } from './types.ts';

export interface ValidationIssue {
  path: string;
  message: string;
}

export const MAX_FLORA_INSTANCES = 10_000;
export const COLLECTIBLES_PER_REGION = 5;
const MERCATOR_LAT_LIMIT = 85.0511;

/** Approximate real extents (metres) of a bounds box; used for V1 sanity checks only. */
export function realExtentM(b: GeoBounds): { northSouth: number; eastWest: number; anisotropyPct: number } {
  const lat0 = ((b.south + b.north) / 2) * (Math.PI / 180);
  const mPerDegLat = 111132.954 - 559.822 * Math.cos(2 * lat0) + 1.175 * Math.cos(4 * lat0);
  const mPerDegLon = 111412.84 * Math.cos(lat0) - 93.5 * Math.cos(3 * lat0);
  const northSouth = (b.north - b.south) * mPerDegLat;
  const eastWest = (b.east - b.west) * mPerDegLon;
  return { northSouth, eastWest, anisotropyPct: Math.abs(northSouth / eastWest - 1) * 100 };
}

/** V1: bounds sanity. */
export function validateBounds(b: GeoBounds, path = 'geo.bounds'): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!(b.south < b.north)) issues.push({ path, message: 'south must be < north' });
  if (!(b.west < b.east)) issues.push({ path, message: 'west must be < east' });
  if (Math.abs(b.south) >= MERCATOR_LAT_LIMIT || Math.abs(b.north) >= MERCATOR_LAT_LIMIT) {
    issues.push({ path, message: 'latitude outside Web Mercator range' });
  }
  if (issues.length === 0) {
    const ext = realExtentM(b);
    for (const [k, v] of [['northSouth', ext.northSouth], ['eastWest', ext.eastWest]] as const) {
      if (v < 30_000 || v > 80_000) issues.push({ path, message: `${k} extent ${(v / 1000).toFixed(1)} km outside 30–80 km` });
    }
    if (ext.anisotropyPct > 2) issues.push({ path, message: `anisotropy ${ext.anisotropyPct.toFixed(2)}% exceeds 2%` });
  }
  return issues;
}

function checkAnchor(issues: ValidationIssue[], b: GeoBounds, p: GeoPoint, path: string): void {
  if (!geoInBounds(p, b)) issues.push({ path, message: `anchor (${p.lat}, ${p.lon}) is outside the region bounds` });
}

export function validateRegionDefinition(def: RegionDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  if (!/^[a-z]+$/.test(def.id)) add('id', 'must match ^[a-z]+$');
  if (!Number.isInteger(def.seed) || def.seed < 0 || def.seed > 0xffffffff) add('seed', 'must be a uint32');
  issues.push(...validateBounds(def.geo.bounds));

  const w = def.world;
  if (!(w.size > 0)) add('world.size', 'must be > 0');
  if (!Number.isInteger(w.gridSize) || w.gridSize < 2) add('world.gridSize', 'must be an integer ≥ 2');
  if (!(w.verticalScale > 0)) add('world.verticalScale', 'must be > 0');
  if (!(w.walkBound > 0 && w.walkBound < w.size / 2)) add('world.walkBound', 'must be inside the region');

  const t = def.terrain;
  if (!Number.isInteger(t.smoothPasses) || t.smoothPasses < 0) add('terrain.smoothPasses', 'must be a non-negative integer');
  if (!(t.noise.wavelength > 0) || !(t.noise.octaves >= 1) || !(t.noise.amplitude >= 0)) add('terrain.noise', 'invalid parameters');
  if (!(t.edge.start > 0 && t.edge.start <= w.size / 2)) add('terrain.edge.start', 'must be within the region');
  const b = def.geo.bounds;
  const modIds = new Set<string>();
  t.modifiers.forEach((m, i) => {
    const p = `terrain.modifiers[${i}]`;
    if (modIds.has(m.id)) add(`${p}.id`, `duplicate modifier id ${m.id}`);
    modIds.add(m.id);
    checkAnchor(issues, b, m.at, `${p}.at`);
    if (!(m.radius > 0)) add(`${p}.radius`, 'must be > 0');
    if (m.kind === 'flatten' && !(m.falloff > 0)) add(`${p}.falloff`, 'must be > 0');
    if (m.kind === 'crater' && !(m.depth > 0 && m.rimHeight >= 0 && m.rimWidth > 0)) add(p, 'crater parameters invalid');
    if (m.kind === 'basin' && !(m.depth > 0 && m.shore > 1)) add(p, 'basin parameters invalid');
  });

  checkAnchor(issues, b, def.spawn.at, 'spawn.at');
  checkAnchor(issues, b, def.portal.at, 'portal.at');

  if (def.landmarks.length < 3) add('landmarks', 'at least 3 landmarks are required');
  const landmarkIds = new Set<string>();
  def.landmarks.forEach((l, i) => {
    if (landmarkIds.has(l.id)) add(`landmarks[${i}].id`, `duplicate landmark id ${l.id}`);
    landmarkIds.add(l.id);
    if (!l.id.startsWith(`${def.id}.`)) add(`landmarks[${i}].id`, `must start with "${def.id}."`);
    checkAnchor(issues, b, l.at, `landmarks[${i}].at`);
  });

  if (def.collectibles.length !== COLLECTIBLES_PER_REGION) {
    add('collectibles', `exactly ${COLLECTIBLES_PER_REGION} collectibles required (found ${def.collectibles.length})`);
  }
  const idPattern = new RegExp(`^${def.id}\\.[a-z]+\\.[a-z0-9-]+$`);
  const collectibleIds = new Set<string>();
  def.collectibles.forEach((c, i) => {
    if (!idPattern.test(c.id)) add(`collectibles[${i}].id`, `"${c.id}" must match ${idPattern.source}`);
    if (collectibleIds.has(c.id)) add(`collectibles[${i}].id`, `duplicate collectible id ${c.id}`);
    collectibleIds.add(c.id);
    if (!(c.offsetY >= 0.5)) add(`collectibles[${i}].offsetY`, 'must be ≥ 0.5 m');
    checkAnchor(issues, b, c.at, `collectibles[${i}].at`);
  });

  const floraTotal = def.biome.flora.reduce((s, f) => s + f.cap, 0);
  if (floraTotal > MAX_FLORA_INSTANCES) add('biome.flora', `instance caps sum to ${floraTotal} (max ${MAX_FLORA_INSTANCES})`);
  def.biome.flora.forEach((f, i) => {
    if (!(f.cell > 0) || !(f.cap >= 0) || !(f.band[0] <= f.band[1]) || f.colors.length === 0) {
      add(`biome.flora[${i}]`, 'invalid flora rule');
    }
  });
  return issues;
}

/** Registry-wide checks: global ID uniqueness, unlock references, acyclic graph, one start region. */
export function validateRegistry(regions: readonly RegionEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const globalCollectibles = new Map<string, string>();
  for (const r of regions) {
    if (ids.has(r.id)) issues.push({ path: `regions.${r.id}`, message: 'duplicate region id' });
    ids.add(r.id);
    if (r.playable) {
      for (const issue of validateRegionDefinition(r)) issues.push({ path: `regions.${r.id}.${issue.path}`, message: issue.message });
      for (const c of r.collectibles) {
        const owner = globalCollectibles.get(c.id);
        if (owner !== undefined && owner !== r.id) {
          issues.push({ path: `regions.${r.id}.collectibles`, message: `collectible id ${c.id} also used by ${owner}` });
        }
        globalCollectibles.set(c.id, r.id);
      }
    }
  }
  for (const r of regions) {
    for (const req of r.unlock.requires) {
      if (!ids.has(req)) issues.push({ path: `regions.${r.id}.unlock.requires`, message: `unknown region ${req}` });
      const target = regions.find((x) => x.id === req);
      if (target && !target.playable) issues.push({ path: `regions.${r.id}.unlock.requires`, message: `${req} is not playable` });
    }
  }
  const starts = regions.filter((r) => r.unlock.requires.length === 0);
  if (starts.length !== 1) issues.push({ path: 'regions', message: `exactly one start region required (found ${starts.length})` });

  // Cycle detection over unlock.requires edges.
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, trail: string[]): void => {
    const s = state.get(id);
    if (s === 'done') return;
    if (s === 'visiting') {
      issues.push({ path: 'regions', message: `unlock cycle: ${[...trail, id].join(' → ')}` });
      return;
    }
    state.set(id, 'visiting');
    const r = regions.find((x) => x.id === id);
    for (const req of r?.unlock.requires ?? []) visit(req, [...trail, id]);
    state.set(id, 'done');
  };
  for (const r of regions) visit(r.id, []);
  return issues;
}
