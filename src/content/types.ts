// Data-driven region definitions (GDD §9.3, plan §5.5 / §11.5). Data only; no behaviour.

import type { GeoBounds, GeoPoint } from '../geo/types.ts';

export type RegionId = string;
/** sRGB colour as 0xRRGGBB. */
export type Rgb = number;

export type TerrainModifier =
  | { kind: 'flatten'; id: string; at: GeoPoint; radius: number; falloff: number }
  | { kind: 'crater'; id: string; at: GeoPoint; radius: number; depth: number; rimHeight: number; rimWidth: number }
  | { kind: 'basin'; id: string; at: GeoPoint; radius: number; depth: number; surfaceOffset: number; shore: number }
  | { kind: 'raise'; id: string; at: GeoPoint; radius: number; height: number };

export type FloraSpecies = 'glowFlower' | 'giantFlower' | 'tree' | 'rock' | 'pillar';

export interface FloraRule {
  species: FloraSpecies;
  /** Maximum instances kept (lowest hashes win). */
  cap: number;
  /** Placement lattice spacing in metres. */
  cell: number;
  /** Allowed normalised baseline height range b̂. */
  band: readonly [number, number];
  maxSlopeDeg: number;
  /** Acceptance probability per surviving candidate. */
  density: number;
  /** Wavelength (m) of the clump mask noise. */
  clumpScale: number;
  /** Candidates survive where the mask noise exceeds this value (−1 … 1). */
  clumpThreshold: number;
  scale: readonly [number, number];
  /** How far instances are sunk into the ground (m). */
  sink: number;
  /** Visibility distance (m) used by per-cell distance culling. */
  maxDistance: number;
  colors: readonly Rgb[];
}

/** Vertical cylinder collider, positioned relative to its owner's anchor (world metres). */
export interface ColliderDef {
  dx: number;
  dz: number;
  radius: number;
  height: number;
}

export interface LandmarkDefinition {
  id: string;
  name: string;
  kind: 'motherBloom' | 'crystalLake' | 'ancientGreenhouse';
  at: GeoPoint;
  discoveryRadius: number;
  colliders: readonly ColliderDef[];
}

export interface CollectibleDefinition {
  id: string;
  name: string;
  at: GeoPoint;
  /** Height above the walkable surface (m). */
  offsetY: number;
  color: Rgb;
}

export interface BiomeDefinition {
  terrain: {
    low: Rgb;
    mid: Rgb;
    high: Rgb;
    peak: Rgb;
    meadowA: Rgb;
    meadowB: Rgb;
    rock: Rgb;
    pad: Rgb;
    shore: Rgb;
    meadowScale: number;
    meadowThreshold: number;
  };
  sky: { top: Rgb; horizon: Rgb; sun: Rgb; sunDirection: readonly [number, number, number] };
  fog: { color: Rgb; near: number; far: number };
  light: { hemiSky: Rgb; hemiGround: Rgb; hemiIntensity: number; sun: Rgb; sunIntensity: number };
  mist: { color: Rgb; height: number; opacity: number };
  petals: { count: number; colors: readonly Rgb[] };
  flora: readonly FloraRule[];
}

/** Parameters for the synthetic stand-in elevation model (plan §5.6). Metres / kilometres. */
export interface SyntheticDem {
  baseM: number;
  rimM: number;
  basin: { at: GeoPoint; radiusKm: number };
  noiseM: number;
  noiseKm: number;
  bumps: readonly { at: GeoPoint; radiusKm: number; heightM: number }[];
}

/** Procedural audio theme for a region (all sound is synthesised; no audio files). */
export interface AudioTheme {
  /** Human-readable description of the musical inspiration. */
  style: string;
  /** One octave of scale degrees, in cents above the tonic (first entry 0). */
  scaleCents: readonly number[];
  tonicHz: number;
  tempoBpm: number;
  /** Beats per cycle; a low gong marks the start of each cycle. */
  cycleBeats: number;
  /** Mix levels 0–1 per musical layer. */
  mix: { pluck: number; lead: number; ensemble: number; gong: number; pad: number; bell: number };
  ambience: { wind: number; birdsPerMinute: number; lakeShimmer: boolean };
}

export interface PortalDefinition {
  id: string;
  name: string;
  at: GeoPoint;
  leadsTo: readonly RegionId[];
  colliders: readonly ColliderDef[];
}

export interface RegionDefinition {
  id: RegionId;
  name: string;
  title: string;
  playable: true;
  seed: number;
  geo: { bounds: GeoBounds; heightmap: string; metadata: string };
  world: { size: number; gridSize: number; verticalScale: number; walkBound: number };
  terrain: {
    smoothPasses: number;
    noise: { amplitude: number; wavelength: number; octaves: number; maskLow: number; maskHigh: number; minMask: number };
    modifiers: readonly TerrainModifier[];
    edge: { start: number; depth: number };
  };
  biome: BiomeDefinition;
  audio: AudioTheme;
  spawn: { at: GeoPoint; heading: number };
  landmarks: readonly LandmarkDefinition[];
  collectibleLabel: string;
  collectibles: readonly CollectibleDefinition[];
  portal: PortalDefinition;
  unlock: { requires: readonly RegionId[] };
  synthetic: SyntheticDem;
}

/** A region listed in the Teleport menu but not playable in this build (GDD §12.3). */
export interface RegionPreview {
  id: RegionId;
  name: string;
  title: string;
  playable: false;
  unlock: { requires: readonly RegionId[] };
}

export type RegionEntry = RegionDefinition | RegionPreview;
