// Region generation: R1–R6 fields → HeightField/Surface → anchors → R7 validation → colours →
// vegetation placement. Pure and deterministic; timing is injected via `mark` (plan §10.4).

import type { CollectibleDefinition, FloraSpecies, LandmarkDefinition, RegionDefinition, Rgb } from '../content/types.ts';
import type { HeightmapMetadata } from '../heightmap/metadata.ts';
import { GameError } from '../lib/errors.ts';
import { Projection } from '../geo/projection.ts';
import { HeightField } from './heightField.ts';
import { Surface } from './surface.ts';
import { buildTerrainFields } from './pipeline.ts';
import type { Pad, StageMark } from './pipeline.ts';
import { terrainColors } from './biome.ts';
import { placeSpecies } from './placement.ts';
import type { ExclusionCircle, FloraPlacement } from './placement.ts';

export interface WorldCollider {
  owner: string;
  x: number;
  z: number;
  baseY: number;
  radius: number;
  height: number;
}

export interface ResolvedCollectible {
  id: string;
  name: string;
  color: Rgb;
  x: number;
  y: number;
  z: number;
}

export interface ResolvedLandmark {
  id: string;
  name: string;
  kind: LandmarkDefinition['kind'];
  x: number;
  y: number;
  z: number;
  def: LandmarkDefinition;
}

export interface GeneratedRegion {
  def: RegionDefinition;
  projection: Projection;
  field: HeightField;
  surface: Surface;
  baselineNorm: Float32Array;
  colors: Float32Array;
  pads: Pad[];
  spawn: { x: number; y: number; z: number; heading: number };
  portal: { id: string; name: string; x: number; y: number; z: number };
  landmarks: ResolvedLandmark[];
  collectibles: ResolvedCollectible[];
  colliders: WorldCollider[];
  flora: FloraPlacement;
}

/** tan(60°): maximum height step between 4-neighbours is Δ·tan 60° (plan §8.4). */
export const TAN_60 = 1.7320508075688772;
export const MIN_COLLECTIBLE_SPACING = 100;
export const COLLECTIBLE_COLLIDER_CLEARANCE = 3;

function resolveColliders(owner: string, ax: number, az: number, defs: LandmarkDefinition['colliders'], surface: Surface): WorldCollider[] {
  return defs.map((c) => {
    const x = ax + c.dx;
    const z = az + c.dz;
    return { owner, x, z, baseY: surface.height(x, z), radius: c.radius, height: c.height };
  });
}

function resolveCollectible(c: CollectibleDefinition, proj: Projection, surface: Surface): ResolvedCollectible {
  const p = proj.geoToWorld(c.at);
  return { id: c.id, name: c.name, color: c.color, x: p.x, y: surface.height(p.x, p.z) + c.offsetY, z: p.z };
}

/** R7 checks on the heights (continuity, pads). */
export function validateHeights(field: HeightField, pads: readonly Pad[], walkBound: number): string[] {
  const issues: string[] = [];
  const { n, spacing, half } = field;
  const maxStep = spacing * TAN_60;
  let violations = 0;
  for (let r = 0; r < n; r++) {
    const z = -half + r * spacing;
    for (let c = 0; c < n; c++) {
      const x = -half + c * spacing;
      if (Math.abs(x) > walkBound || Math.abs(z) > walkBound) continue;
      const h = field.get(r, c);
      if (c + 1 < n && Math.abs(x + spacing) <= walkBound && Math.abs(field.get(r, c + 1) - h) > maxStep) violations++;
      if (r + 1 < n && Math.abs(z + spacing) <= walkBound && Math.abs(field.get(r + 1, c) - h) > maxStep) violations++;
    }
  }
  if (violations > 0) issues.push(`continuity: ${violations} neighbour steps exceed ${maxStep.toFixed(2)} m (60°)`);
  for (const p of pads) {
    let worst = 0;
    for (let r = 0; r < n; r++) {
      const z = -half + r * spacing;
      for (let c = 0; c < n; c++) {
        const x = -half + c * spacing;
        const dx = x - p.x;
        const dz = z - p.z;
        if (dx * dx + dz * dz <= p.radius * p.radius) worst = Math.max(worst, Math.abs(field.get(r, c) - p.height));
      }
    }
    if (worst > 0.05) issues.push(`pad ${p.id}: height deviates ${worst.toFixed(3)} m (max 0.05)`);
  }
  return issues;
}

export function validatePlacement(g: Omit<GeneratedRegion, 'colors' | 'flora'>): string[] {
  const issues: string[] = [];
  const wb = g.def.world.walkBound;
  const inside = (x: number, z: number) => Math.abs(x) <= wb && Math.abs(z) <= wb;
  if (!inside(g.spawn.x, g.spawn.z)) issues.push('spawn outside the walkable boundary');
  if (!inside(g.portal.x, g.portal.z)) issues.push('portal outside the walkable boundary');
  for (const l of g.landmarks) if (!inside(l.x, l.z)) issues.push(`landmark ${l.id} outside the walkable boundary`);
  const onPad = (x: number, z: number) => g.pads.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 <= p.radius * p.radius);
  if (!onPad(g.spawn.x, g.spawn.z)) issues.push('spawn is not on a flatten pad');
  if (!onPad(g.portal.x, g.portal.z)) issues.push('portal is not on a flatten pad');
  for (const col of g.colliders) {
    const d = Math.hypot(g.spawn.x - col.x, g.spawn.z - col.z);
    if (d < col.radius + 1) issues.push(`spawn is inside collider of ${col.owner}`);
  }
  g.collectibles.forEach((c, i) => {
    if (!inside(c.x, c.z)) issues.push(`collectible ${c.id} outside the walkable boundary`);
    if (c.y - g.surface.height(c.x, c.z) < 0.5) issues.push(`collectible ${c.id} is less than 0.5 m above the surface`);
    for (const col of g.colliders) {
      const gap = Math.hypot(c.x - col.x, c.z - col.z) - col.radius;
      if (gap < COLLECTIBLE_COLLIDER_CLEARANCE) issues.push(`collectible ${c.id} is ${gap.toFixed(2)} m from a collider of ${col.owner}`);
    }
    for (let j = i + 1; j < g.collectibles.length; j++) {
      const o = g.collectibles[j]!;
      const d = Math.hypot(c.x - o.x, c.z - o.z);
      if (d < MIN_COLLECTIBLE_SPACING) issues.push(`collectibles ${c.id} and ${o.id} are only ${d.toFixed(1)} m apart`);
    }
  });
  return issues;
}

export function generateRegion(
  def: RegionDefinition,
  meta: HeightmapMetadata,
  bytes: ArrayBuffer | Uint8Array,
  mark: StageMark = () => {},
): GeneratedRegion {
  if (meta.regionId !== def.id) throw new GameError('HEIGHTMAP_INVALID', `Heightmap is for ${meta.regionId}, not ${def.id}.`);
  const b = def.geo.bounds;
  const mb = meta.bounds;
  if (b.south !== mb.south || b.west !== mb.west || b.north !== mb.north || b.east !== mb.east) {
    throw new GameError('HEIGHTMAP_INVALID', 'Heightmap bounds do not match the region definition.');
  }
  if (meta.grid.width !== def.world.gridSize || meta.grid.height !== def.world.gridSize) {
    throw new GameError('HEIGHTMAP_INVALID', 'Heightmap grid size does not match the region definition.');
  }

  const fields = buildTerrainFields(def, meta, bytes, mark);
  const n = def.world.gridSize;
  const field = new HeightField(fields.heights, n, def.world.size);
  const surface = new Surface(field, fields.lake);
  const proj = new Projection(def.geo.bounds, def.world.size, n);

  // Anchors snap to the final surface.
  const sp = proj.geoToWorld(def.spawn.at);
  const spawn = { x: sp.x, y: surface.height(sp.x, sp.z), z: sp.z, heading: def.spawn.heading };
  const pp = proj.geoToWorld(def.portal.at);
  const portal = { id: def.portal.id, name: def.portal.name, x: pp.x, y: surface.height(pp.x, pp.z), z: pp.z };
  const colliders: WorldCollider[] = [...resolveColliders(def.portal.id, pp.x, pp.z, def.portal.colliders, surface)];
  const landmarks: ResolvedLandmark[] = def.landmarks.map((l) => {
    const p = proj.geoToWorld(l.at);
    colliders.push(...resolveColliders(l.id, p.x, p.z, l.colliders, surface));
    return { id: l.id, name: l.name, kind: l.kind, x: p.x, y: surface.height(p.x, p.z), z: p.z, def: l };
  });
  const collectibles = def.collectibles.map((c) => resolveCollectible(c, proj, surface));
  mark('anchors');

  const partial = { def, projection: proj, field, surface, baselineNorm: fields.baselineNorm, pads: fields.pads, spawn, portal, landmarks, collectibles, colliders };
  const issues = [...validateHeights(field, fields.pads, def.world.walkBound), ...validatePlacement(partial)];
  if (issues.length > 0) {
    throw new GameError('GENERATION_INVALID', `Region ${def.id} failed post-generation validation.`, issues);
  }
  mark('validate');

  const colors = terrainColors(fields.heights, fields.baselineNorm, n, def.world.size, def.biome, def.seed, fields.pads, fields.lake);
  mark('colors');

  const exclusions: ExclusionCircle[] = [
    ...fields.pads.map((p) => ({ x: p.x, z: p.z, radius: p.radius + 2 })),
    ...colliders.map((c) => ({ x: c.x, z: c.z, radius: c.radius + 2 })),
    ...collectibles.map((c) => ({ x: c.x, z: c.z, radius: COLLECTIBLE_COLLIDER_CLEARANCE })),
    { x: spawn.x, z: spawn.z, radius: 4 },
  ];
  // Keep landmark footprints readable.
  for (const l of landmarks) exclusions.push({ x: l.x, z: l.z, radius: l.kind === 'ancientGreenhouse' ? 20 : 8 });
  const ctx = { surface, baselineNorm: fields.baselineNorm, walkBound: def.world.walkBound, exclusions, regionSeed: def.seed };
  const flora = {} as FloraPlacement;
  for (const rule of def.biome.flora) flora[rule.species as FloraSpecies] = placeSpecies(rule, ctx);
  mark('placement');

  return { ...partial, colors, flora };
}
