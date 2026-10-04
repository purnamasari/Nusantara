// Bandung — The Blooming Highlands (GDD §4.1). Landmarks are fictional game locations.
// Anchors are provisional until real elevation lands (plan M9); IDs are stable.

import { geo } from '../../geo/types.ts';
import type { RegionDefinition } from '../types.ts';

export const bandung: RegionDefinition = {
  id: 'bandung',
  name: 'Bandung',
  title: 'The Blooming Highlands',
  playable: true,
  seed: 20261004,
  geo: {
    bounds: { south: -7.15, west: 107.4, north: -6.7, east: 107.85 },
    heightmap: 'regions/bandung/height.u8.bin',
    metadata: 'regions/bandung/height.json',
  },
  world: { size: 2000, gridSize: 256, verticalScale: 0.08, walkBound: 950 },
  terrain: {
    smoothPasses: 2,
    noise: { amplitude: 10, wavelength: 160, octaves: 4, maskLow: 0.08, maskHigh: 0.45, minMask: 0.2 },
    modifiers: [
      { kind: 'flatten', id: 'pad.plaza', at: geo(-6.9367, 107.6115), radius: 34, falloff: 22 },
      { kind: 'flatten', id: 'pad.mother-bloom', at: geo(-6.799, 107.607), radius: 20, falloff: 18 },
      { kind: 'flatten', id: 'pad.greenhouse', at: geo(-6.885, 107.76), radius: 22, falloff: 26 },
      { kind: 'crater', id: 'crater.north', at: geo(-6.759625, 107.61), radius: 55, depth: 14, rimHeight: 6, rimWidth: 0.35 },
      { kind: 'basin', id: 'basin.crystal-lake', at: geo(-6.98125, 107.65875), radius: 60, depth: 6, surfaceOffset: -1.5, shore: 1.6 },
    ],
    edge: { start: 950, depth: -40 },
  },
  biome: {
    terrain: {
      low: 0x86b86a,
      mid: 0x5f9a55,
      high: 0x6f8f62,
      peak: 0x9a8fb4,
      meadowA: 0xeba0cf,
      meadowB: 0xb9a3e6,
      rock: 0x8e8378,
      pad: 0xd4c6b4,
      shore: 0xcfe9ef,
      meadowScale: 140,
      meadowThreshold: 0.3,
    },
    sky: { top: 0x6f8fd8, horizon: 0xf3d6e8, sun: 0xfff1c9, sunDirection: [0.55, 0.32, 0.77] },
    fog: { color: 0xd9cde8, near: 150, far: 1100 },
    light: { hemiSky: 0xdfe6ff, hemiGround: 0x6b5a73, hemiIntensity: 1.6, sun: 0xffe2b8, sunIntensity: 2.2 },
    mist: { color: 0xe6dcef, height: -10, opacity: 0.92 },
    petals: { count: 1500, colors: [0xffa3d4, 0xffd1ea, 0xd9b8ff, 0xfff0a8] },
    flora: [
      {
        species: 'glowFlower', cap: 4000, cell: 14, band: [0, 0.8], maxSlopeDeg: 25, density: 0.75,
        clumpScale: 160, clumpThreshold: -0.1, scale: [0.8, 1.6], sink: 0.05, maxDistance: 250,
        colors: [0xff8fcf, 0xc9a7ff, 0x9ff3ff, 0xffe08a],
      },
      {
        species: 'giantFlower', cap: 1500, cell: 30, band: [0.05, 0.7], maxSlopeDeg: 20, density: 0.6,
        clumpScale: 260, clumpThreshold: 0.05, scale: [5, 11], sink: 0.2, maxDistance: 700,
        colors: [0xff6fb5, 0xd38bff, 0xff9e6b, 0xfff4fb],
      },
      {
        species: 'tree', cap: 2500, cell: 25, band: [0.1, 1], maxSlopeDeg: 30, density: 0.7,
        clumpScale: 300, clumpThreshold: -0.15, scale: [6, 12], sink: 0.3, maxDistance: 900,
        colors: [0x4f8f5a, 0x6aa86b, 0x3f7d6e, 0x8fbf6a],
      },
      {
        species: 'rock', cap: 1200, cell: 35, band: [0, 1], maxSlopeDeg: 45, density: 0.35,
        clumpScale: 120, clumpThreshold: -1, scale: [0.8, 3.5], sink: 0.4, maxDistance: 600,
        colors: [0x9a8f86, 0x8a8299, 0xa39b8a],
      },
      {
        species: 'pillar', cap: 300, cell: 60, band: [0.04, 0.9], maxSlopeDeg: 15, density: 0.35,
        clumpScale: 400, clumpThreshold: 0.05, scale: [0.8, 1.4], sink: 0.3, maxDistance: 900,
        colors: [0xd8cfc0, 0xc2b8a8],
      },
    ],
  },
  // Inspired by Sundanese music of West Java: kacapi (zither), suling (bamboo flute), angklung
  // and degung-style gongs, on a salendro-style pentatonic of roughly equal 240-cent steps.
  // A fantasy interpretation, not a transcription of any tradition.
  audio: {
    style: 'Sundanese-inspired: kacapi, suling, angklung and gongs on a salendro-style pentatonic',
    scaleCents: [0, 240, 480, 720, 960],
    tonicHz: 196,
    tempoBpm: 66,
    cycleBeats: 16,
    mix: { pluck: 0.55, lead: 0.42, ensemble: 0.5, gong: 0.6, pad: 0.16, bell: 0.3 },
    ambience: { wind: 0.5, birdsPerMinute: 14, lakeShimmer: true },
  },
  spawn: { at: geo(-6.941875, 107.6115), heading: 0 },
  landmarks: [
    {
      id: 'bandung.landmark.blooming-highlands',
      name: 'Blooming Highlands',
      kind: 'motherBloom',
      at: geo(-6.799, 107.607),
      discoveryRadius: 120,
      colliders: [{ dx: 0, dz: 0, radius: 3, height: 60 }],
    },
    {
      id: 'bandung.landmark.crystal-lake',
      name: 'Crystal Lake',
      kind: 'crystalLake',
      at: geo(-6.98125, 107.65875),
      discoveryRadius: 140,
      // Ten crystal spires on a 66 m ring (angles 18° + k·36°), rounded to centimetres.
      colliders: [
        { dx: 62.77, dz: 20.39, radius: 1.6, height: 9 },
        { dx: 38.79, dz: 53.4, radius: 1.6, height: 9 },
        { dx: 0, dz: 66, radius: 1.6, height: 9 },
        { dx: -38.79, dz: 53.4, radius: 1.6, height: 9 },
        { dx: -62.77, dz: 20.39, radius: 1.6, height: 9 },
        { dx: -62.77, dz: -20.39, radius: 1.6, height: 9 },
        { dx: -38.79, dz: -53.4, radius: 1.6, height: 9 },
        { dx: 0, dz: -66, radius: 1.6, height: 9 },
        { dx: 38.79, dz: -53.4, radius: 1.6, height: 9 },
        { dx: 62.77, dz: -20.39, radius: 1.6, height: 9 },
      ],
    },
    {
      id: 'bandung.landmark.ancient-greenhouse',
      name: 'Ancient Greenhouse',
      kind: 'ancientGreenhouse',
      at: geo(-6.885, 107.76),
      discoveryRadius: 100,
      // Seven pillars on a 14 m ring; the south (+Z) side is an open doorway.
      colliders: [
        { dx: 14, dz: 0, radius: 0.9, height: 10 },
        { dx: 9.9, dz: 9.9, radius: 0.9, height: 10 },
        { dx: -9.9, dz: 9.9, radius: 0.9, height: 10 },
        { dx: -14, dz: 0, radius: 0.9, height: 10 },
        { dx: -9.9, dz: -9.9, radius: 0.9, height: 10 },
        { dx: 0, dz: -14, radius: 0.9, height: 10 },
        { dx: 9.9, dz: -9.9, radius: 0.9, height: 10 },
      ],
    },
  ],
  collectibleLabel: 'Flora Spirits',
  collectibles: [
    { id: 'bandung.flora.orchid', name: 'Spirit of the Moonlit Orchid', at: geo(-6.799, 107.61015), offsetY: 1.6, color: 0xc58bff },
    { id: 'bandung.flora.lotus', name: 'Spirit of the Crystal Lotus', at: geo(-6.98125, 107.65875), offsetY: 1.6, color: 0x8ff0ff },
    { id: 'bandung.flora.jasmine', name: 'Spirit of the Jasmine Mist', at: geo(-6.885, 107.76), offsetY: 1.6, color: 0xfff6d8 },
    { id: 'bandung.flora.rose', name: 'Spirit of the Rose Dawn', at: geo(-6.74725, 107.61015), offsetY: 1.6, color: 0xff7aa8 },
    { id: 'bandung.flora.hibiscus', name: 'Spirit of the Ember Hibiscus', at: geo(-7.08025, 107.553), offsetY: 1.6, color: 0xff9a5a },
  ],
  portal: {
    id: 'bandung.portal',
    name: 'Petal Gate',
    at: geo(-6.93175, 107.6115),
    leadsTo: ['jakarta'],
    colliders: [
      { dx: -4.2, dz: 0, radius: 0.7, height: 9 },
      { dx: 4.2, dz: 0, radius: 0.7, height: 9 },
    ],
  },
  unlock: { requires: [] },
  // Synthetic stand-in elevation (plan §5.6). Approximates a basin ringed by volcanic highlands;
  // positions and heights are rough placeholders, not survey data.
  synthetic: {
    baseM: 640,
    rimM: 380,
    basin: { at: geo(-6.94, 107.62), radiusKm: 16 },
    noiseM: 45,
    noiseKm: 4,
    bumps: [
      { at: geo(-6.7596, 107.6098), radiusKm: 7, heightM: 1350 },
      { at: geo(-6.775, 107.53), radiusKm: 5, heightM: 1200 },
      { at: geo(-6.82, 107.72), radiusKm: 5.5, heightM: 1350 },
      { at: geo(-6.885, 107.76), radiusKm: 4.5, heightM: 950 },
      { at: geo(-7.13, 107.65), radiusKm: 8, heightM: 1550 },
      { at: geo(-7.1, 107.5), radiusKm: 7, heightM: 1100 },
      { at: geo(-7.12, 107.8), radiusKm: 6, heightM: 1000 },
    ],
  },
};
