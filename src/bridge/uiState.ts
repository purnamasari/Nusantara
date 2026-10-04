import type { TeleportOption } from '../rules/progression.ts';

export type Screen = 'boot' | 'start' | 'loading' | 'playing' | 'paused' | 'menu' | 'error';
export type MovementMode = 'walk' | 'fly' | 'takeoff' | 'landing';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'warning';
}

export interface DebugInfo {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  x: number;
  y: number;
  z: number;
  lat: number;
  lon: number;
  headingDeg: number;
}

export interface SpiritSlot {
  id: string;
  name: string;
  color: string;
  collected: boolean;
}

export interface UiState {
  screen: Screen;
  hasSave: boolean;
  loadingStage: string;
  regionName: string;
  regionTitle: string;
  collectibleLabel: string;
  mode: MovementMode;
  spirits: readonly SpiritSlot[];
  collected: number;
  total: number;
  prompt: string | null;
  portalActive: boolean;
  headingDeg: number;
  /** Compass label, e.g. "NE 045°" (computed by the engine). */
  compass: string;
  toasts: readonly Toast[];
  teleport: readonly TeleportOption[];
  error: { code: string; message: string; details: readonly string[] } | null;
  debug: DebugInfo | null;
  credits: string;
  /** Volume, 0–100. */
  musicVolume: number;
  sfxVolume: number;
}

export const initialUiState: UiState = {
  screen: 'boot',
  hasSave: false,
  loadingStage: '',
  regionName: '',
  regionTitle: '',
  collectibleLabel: '',
  mode: 'walk',
  spirits: [],
  collected: 0,
  total: 0,
  prompt: null,
  portalActive: false,
  headingDeg: 0,
  compass: 'N 000°',
  toasts: [],
  teleport: [],
  error: null,
  debug: null,
  credits: '',
  musicVolume: 70,
  sfxVolume: 80,
};

/** Commands the UI may send to the engine. The UI never touches three.js. */
export interface GameCommands {
  start(): void;
  resume(): void;
  closeMenu(): void;
  teleport(regionId: string): void;
  retry(): void;
  setVolume(channel: 'music' | 'sfx', value: number): void;
}
