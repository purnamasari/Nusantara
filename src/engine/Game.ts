// Composition root of the imperative engine (plan §11). React only sees the UI store.

import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { REGIONS, START_REGION_ID, getPlayableRegion } from '../content/registry.ts';
import type { RegionDefinition } from '../content/types.ts';
import { validateRegistry } from '../content/validate.ts';
import { GameError, toGameError } from '../lib/errors.ts';
import { hashTypedArray } from '../lib/hash.ts';
import { DEG, wrapAngle } from '../lib/math.ts';
import { compassPoint } from '../geo/frames.ts';
import type { Store } from '../bridge/store.ts';
import type { DebugInfo, GameCommands, MovementMode, SpiritSlot, Toast, UiState } from '../bridge/uiState.ts';
import { collect, nearestInteractable } from '../rules/collectibles.ts';
import type { Interactable } from '../rules/collectibles.ts';
import { isComplete, regionProgress, teleportOptions } from '../rules/progression.ts';
import type { SaveNotice } from '../rules/save.ts';
import { generateRegion } from '../terrain/generate.ts';
import type { GeneratedRegion } from '../terrain/generate.ts';
import type { HeightmapMetadata } from '../heightmap/metadata.ts';
import { Input } from './input.ts';
import { createPlayer, isTransition, NO_INPUT, stepPlayer, TUNING } from './player/movement.ts';
import type { MovementWorld, PlayerState } from './player/movement.ts';
import { Avatar } from './player/avatar.ts';
import { clampPitch, createCameraState, updateCamera } from './camera/cameraRig.ts';
import { RegionScene } from './world/regionScene.ts';
import { fetchRegionData } from './regionLoader.ts';
import { ProgressManager, browserStorage } from './progressManager.ts';
import { Sfx } from './audio/sfx.ts';
import { benchmarkPoses } from './poses.ts';
import type { Pose } from './poses.ts';

const MOUSE_SENSITIVITY = 0.0022;
const MAX_FRAME_DT = 0.25;
const MAX_SUBSTEPS = 5;
export const INTERACT_RADIUS = 5;
const TOAST_SECONDS = 4.5;
const SAVE_INTERVAL = 10;

interface ActiveRegion {
  def: RegionDefinition;
  gen: GeneratedRegion;
  scene: RegionScene;
  world: MovementWorld;
  validIds: Set<string>;
  meta: HeightmapMetadata;
  bytes: ArrayBuffer;
}

export interface RenderInfo {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

const NOTICE_TEXT: Record<SaveNotice, string> = {
  SAVE_CORRUPT: "Saved progress couldn't be read and was backed up; starting fresh.",
  SAVE_INCOMPATIBLE: 'Saved progress is from a newer version and was backed up; starting fresh.',
  SAVE_WRITE_FAILED: "Progress can't be saved in this browser session.",
};

export function createRenderer(host: HTMLElement): WebGLRenderer {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
  if (!context) throw new GameError('WEBGL2_UNAVAILABLE', 'This browser or device cannot run WebGL 2.');
  const renderer = new WebGLRenderer({ canvas, context, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = false;
  host.appendChild(canvas);
  return renderer;
}

export class Game implements GameCommands {
  private readonly store: Store<UiState>;
  private readonly host: HTMLElement;
  private readonly baseUrl: string;
  private renderer: WebGLRenderer | null = null;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(60, 1, 0.1, 6000);
  private input: Input | null = null;
  private region: ActiveRegion | null = null;
  private player: PlayerState = createPlayer(0, 0, 0, 0);
  private readonly look = { yaw: 0, pitch: -0.25 };
  private readonly cam = createCameraState();
  private readonly avatar = new Avatar();
  private readonly progress: ProgressManager;
  private readonly sfx = new Sfx();
  private toasts: Toast[] = [];
  private readonly toastExpiry = new Map<number, number>();
  private toastSeq = 0;
  private time = 0;
  private lastFrame = 0;
  private debugVisible = false;
  private debugAccum = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private saveTimer = 0;
  private lastSaved = { x: 0, z: 0 };
  private pendingToggle = false;
  private poseOverride: Pose | null = null;
  private poses: Pose[] = [];
  private spirits: SpiritSlot[] = [];
  private frameWaiters: (() => void)[] = [];
  private loadingRegion = false;
  lastInfo: RenderInfo = { calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 };
  /** Bound command object for the UI (safe to destructure). */
  readonly commands: GameCommands = {
    start: () => this.start(),
    resume: () => this.resume(),
    closeMenu: () => this.closeMenu(),
    teleport: (id: string) => this.teleport(id),
    retry: () => this.retry(),
  };

  constructor(store: Store<UiState>, host: HTMLElement, baseUrl: string) {
    this.store = store;
    this.host = host;
    this.baseUrl = baseUrl;
    this.progress = new ProgressManager(browserStorage(), START_REGION_ID);
    this.progress.onNotice = (n) => this.toast(NOTICE_TEXT[n], 'warning');
    this.scene.add(this.avatar.group);
  }

  // ---------------------------------------------------------------- lifecycle

  boot(): void {
    try {
      const issues = validateRegistry(REGIONS);
      if (issues.length > 0) {
        throw new GameError('CONFIG_INVALID', 'Region configuration is invalid.', issues.map((i) => `${i.path}: ${i.message}`));
      }
      this.renderer = createRenderer(this.host);
      this.input = new Input(this.renderer.domElement, (locked) => this.onLockChange(locked));
      this.resize();
      window.addEventListener('resize', () => this.resize());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.saveNow();
      });
      window.addEventListener('pagehide', () => this.saveNow());
      const hasSave = !this.progress.isNew && (this.progress.collected.size > 0 || this.progress.save.player !== null);
      this.store.set({ screen: 'start', hasSave });
      this.lastFrame = performance.now();
      this.renderer.setAnimationLoop((t) => this.frame(t));
    } catch (err) {
      this.fail(err);
    }
  }

  private fail(err: unknown): void {
    const e = toGameError(err);
    console.error(`[${e.code}] ${e.message}`, e.details);
    this.input?.exitLock();
    this.store.set({ screen: 'error', error: { code: e.code, message: e.message, details: e.details } });
  }

  private resize(): void {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth || window.innerWidth);
    const h = Math.max(1, this.host.clientHeight || window.innerHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- commands (UI → engine)

  start(): void {
    const s = this.store.getSnapshot().screen;
    if (s !== 'start') return;
    this.sfx.init();
    this.input?.requestLock();
    void this.loadRegion(this.progress.save.currentRegionId || START_REGION_ID).then(() => {
      const bench = new URLSearchParams(window.location.search).get('bench');
      if (bench === 'gen') void this.runGenerationBench();
      else if (bench === 'frame') void this.runFrameBench();
    });
  }

  resume(): void {
    const s = this.store.getSnapshot().screen;
    if (s !== 'paused') return;
    this.input?.requestLock();
    this.store.set({ screen: 'playing' });
  }

  closeMenu(): void {
    if (this.store.getSnapshot().screen === 'menu') this.store.set({ screen: 'paused' });
  }

  teleport(regionId: string): void {
    const r = this.region;
    if (!r) return;
    const opt = teleportOptions(REGIONS, this.progress.collected, this.progress.visited, r.def.id).find((o) => o.id === regionId);
    if (!opt) return;
    if (opt.current) {
      this.toast(`You are already in ${opt.name}.`, 'info');
      return;
    }
    if (!opt.available) {
      this.toast(`${opt.name}: ${opt.note}.`, 'info');
      return;
    }
    void this.loadRegion(regionId);
  }

  retry(): void {
    window.location.reload();
  }

  private onLockChange(locked: boolean): void {
    const s = this.store.getSnapshot().screen;
    if (locked && s === 'paused') this.store.set({ screen: 'playing' });
    else if (!locked && s === 'playing') this.store.set({ screen: 'paused' });
  }

  // ---------------------------------------------------------------- region loading

  private async yieldFrame(): Promise<void> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  async loadRegion(id: string): Promise<void> {
    if (this.loadingRegion) return;
    this.loadingRegion = true;
    try {
      const def = getPlayableRegion(id);
      this.store.set({ screen: 'loading', loadingStage: 'Fetching terrain…' });
      const { meta, bytes } = await fetchRegionData(def, this.baseUrl);
      this.store.set({ loadingStage: `Shaping ${def.title}…` });
      await this.yieldFrame();
      const gen = generateRegion(def, meta, bytes);
      this.store.set({ loadingStage: 'Growing flowers…' });
      await this.yieldFrame();
      this.mountRegion(def, gen, meta, bytes);
      this.renderer?.compile(this.scene, this.camera);
      this.store.set({ screen: 'playing', loadingStage: '' });
    } catch (err) {
      this.fail(err);
    } finally {
      this.loadingRegion = false;
    }
  }

  private mountRegion(def: RegionDefinition, gen: GeneratedRegion, meta: HeightmapMetadata, bytes: ArrayBuffer): void {
    this.unmountRegion();
    const scene = new RegionScene(gen);
    this.scene.add(scene.root);
    this.scene.fog = scene.atmosphere.fog;
    this.scene.background = scene.atmosphere.background;
    const world: MovementWorld = {
      surface: gen.surface,
      colliders: gen.colliders,
      bound: def.world.walkBound,
      ceiling: gen.field.maxHeight + 200,
    };
    this.region = { def, gen, scene, world, validIds: new Set(def.collectibles.map((c) => c.id)), meta, bytes };
    this.poses = benchmarkPoses(gen);
    scene.spirits.setCollected(this.progress.collected);
    const complete = isComplete(def, this.progress.collected);
    scene.portal.setActive(complete, true);
    this.placePlayer(def, gen);
    this.progress.visit(def.id);
    this.refreshProgressUi();
    this.store.set({ regionName: def.name, regionTitle: def.title, collectibleLabel: def.collectibleLabel });
  }

  private unmountRegion(): void {
    if (!this.region) return;
    this.region.scene.dispose();
    this.scene.fog = null;
    this.scene.background = null;
    this.region = null;
  }

  private positionIsValid(gen: GeneratedRegion, x: number, y: number, z: number): boolean {
    const wb = gen.def.world.walkBound;
    if (![x, y, z].every(Number.isFinite)) return false;
    if (Math.abs(x) > wb || Math.abs(z) > wb) return false;
    if (y < gen.surface.height(x, z) - 1e-3) return false;
    return gen.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.radius + 0.4 || y > c.baseY + c.height);
  }

  private placePlayer(def: RegionDefinition, gen: GeneratedRegion): void {
    const sp = this.progress.save.player;
    if (sp && sp.regionId === def.id && this.positionIsValid(gen, sp.x, sp.y, sp.z)) {
      const ground = gen.surface.height(sp.x, sp.z);
      const y = sp.mode === 'fly' ? Math.max(sp.y, ground + 2) : ground;
      this.player = createPlayer(sp.x, y, sp.z, sp.headingRad, sp.mode);
      this.look.yaw = sp.headingRad;
    } else {
      this.player = createPlayer(gen.spawn.x, gen.spawn.y, gen.spawn.z, gen.spawn.heading);
      this.look.yaw = gen.spawn.heading;
    }
    this.look.pitch = -0.25;
    this.cam.initialised = false;
    this.lastSaved = { x: this.player.x, z: this.player.z };
  }

  // ---------------------------------------------------------------- gameplay

  private interactables(): Interactable[] {
    const r = this.region;
    if (!r) return [];
    const list: Interactable[] = r.gen.collectibles
      .filter((c) => !this.progress.collected.has(c.id))
      .map((c) => ({ id: c.id, kind: 'collectible' as const, x: c.x, y: c.y, z: c.z }));
    list.push({ id: r.gen.portal.id, kind: 'portal', x: r.gen.portal.x, y: r.gen.portal.y + 1, z: r.gen.portal.z });
    return list;
  }

  private currentTarget(): Interactable | null {
    const p = this.player;
    return nearestInteractable(p.x, p.y + 1, p.z, this.interactables(), INTERACT_RADIUS, p.interactionLock > 0);
  }

  /** E key. Respects the transition interaction lock (plan §12.4). */
  interact(): void {
    const r = this.region;
    if (!r) return;
    const target = this.currentTarget();
    if (!target) return;
    if (target.kind === 'collectible') {
      const res = collect(this.progress.collected, target.id, r.validIds);
      if (!res.changed) return;
      this.progress.collect(target.id);
      r.scene.spirits.setCollected(this.progress.collected);
      this.sfx.chime();
      const def = r.def.collectibles.find((c) => c.id === target.id)!;
      const { count, total } = regionProgress(r.def, this.progress.collected);
      this.toast(`${def.name} collected — ${count} / ${total}`, 'success');
      if (count === total) {
        r.scene.portal.setActive(true);
        this.sfx.fanfare();
        this.toast(`${r.def.name} restored — the ${r.def.portal.name} awakens!`, 'success');
      }
      this.refreshProgressUi();
      return;
    }
    if (isComplete(r.def, this.progress.collected)) {
      this.openMenu();
    } else {
      const { count, total } = regionProgress(r.def, this.progress.collected);
      this.sfx.sealed();
      this.toast(`The ${r.def.portal.name} is sealed — ${count} / ${total} ${r.def.collectibleLabel}`, 'info');
    }
  }

  private openMenu(): void {
    this.input?.exitLock();
    this.refreshProgressUi();
    this.store.set({ screen: 'menu' });
  }

  private refreshProgressUi(): void {
    const r = this.region;
    if (!r) return;
    const { count, total } = regionProgress(r.def, this.progress.collected);
    this.spirits = r.def.collectibles.map((c) => ({
      id: c.id,
      name: c.name,
      color: `#${c.color.toString(16).padStart(6, '0')}`,
      collected: this.progress.collected.has(c.id),
    }));
    this.store.set({
      collected: count,
      total,
      spirits: this.spirits,
      portalActive: isComplete(r.def, this.progress.collected),
      teleport: teleportOptions(REGIONS, this.progress.collected, this.progress.visited, r.def.id),
    });
  }

  private toast(text: string, tone: Toast['tone']): void {
    const id = ++this.toastSeq;
    this.toastExpiry.set(id, this.time + TOAST_SECONDS);
    this.toasts = [...this.toasts.slice(-3), { id, text, tone }];
    this.store.set({ toasts: this.toasts });
  }

  private saveNow(): void {
    const r = this.region;
    if (r) {
      const p = this.player;
      const mode = p.mode === 'fly' || p.mode === 'landing' || p.mode === 'takeoff' ? 'fly' : 'walk';
      this.progress.setPlayer({ regionId: r.def.id, x: p.x, y: p.y, z: p.z, headingRad: p.heading, mode });
      this.lastSaved = { x: p.x, z: p.z };
    }
    this.progress.persist();
  }

  // ---------------------------------------------------------------- frame loop

  private frame(now: number): void {
    const dt = Math.min(MAX_FRAME_DT, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.time += dt;
    const input = this.input;
    const renderer = this.renderer;
    if (!input || !renderer) return;
    const screen = this.store.getSnapshot().screen;
    const r = this.region;

    if (input.wasPressed('F3') || input.wasPressed('Backquote')) {
      this.debugVisible = !this.debugVisible;
      if (!this.debugVisible) this.store.set({ debug: null });
    }

    if (r && (screen === 'playing' || screen === 'paused' || screen === 'menu')) {
      const playing = screen === 'playing';
      input.active = playing;
      const mouse = input.consumeMouse();
      if (playing) {
        this.look.yaw = wrapAngle(this.look.yaw + mouse.dx * MOUSE_SENSITIVITY);
        this.look.pitch -= mouse.dy * MOUSE_SENSITIVITY;
      }
      this.look.pitch = clampPitch(this.look.pitch, this.player.mode);
      const prevMode = this.player.mode;
      const move = playing
        ? {
            forward: (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0),
            right: (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0),
            ascend: input.isDown('Space'),
            descend: input.isDown('KeyC'),
            sprint: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
            jump: input.wasPressed('Space'),
            toggleMode: input.wasPressed('KeyF') || this.pendingToggle,
            yaw: this.look.yaw,
            pitch: this.look.pitch,
          }
        : { ...NO_INPUT, toggleMode: this.pendingToggle, yaw: this.look.yaw, pitch: this.look.pitch };
      this.pendingToggle = false;
      // Substep so slow frames (down to ~4 fps) still simulate in real time; edge-triggered
      // inputs (jump, mode toggle) apply on the first substep only.
      const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / TUNING.maxDt)));
      for (let i = 0; i < substeps; i++) {
        stepPlayer(this.player, i === 0 ? move : { ...move, jump: false, toggleMode: false }, r.world, dt / substeps);
      }
      if (prevMode !== this.player.mode && isTransition(this.player.mode)) this.sfx.whoosh(this.player.mode === 'takeoff');
      if (playing && input.wasPressed('KeyE')) this.interact();

      if (this.poseOverride) {
        const p = this.poseOverride;
        this.camera.position.set(...p.position);
        this.camera.lookAt(...p.target);
        this.camera.fov = 60;
      } else {
        updateCamera(this.cam, this.player, this.look.yaw, this.look.pitch, r.gen.surface, dt);
        this.camera.position.set(this.cam.x, this.cam.y, this.cam.z);
        this.camera.lookAt(this.cam.tx, this.cam.ty, this.cam.tz);
        this.camera.fov = this.cam.fov;
      }
      this.camera.updateProjectionMatrix();
      this.avatar.group.visible = !this.poseOverride;
      this.avatar.update(this.player, this.time);
      const vh = renderer.domElement.height;
      const cp = this.camera.position;
      r.scene.update(this.time, dt, cp.x, cp.y, cp.z, vh, r.gen.surface.height(cp.x, cp.z));

      this.saveTimer += dt;
      if (this.saveTimer >= SAVE_INTERVAL) {
        this.saveTimer = 0;
        if (Math.hypot(this.player.x - this.lastSaved.x, this.player.z - this.lastSaved.z) > 5) this.saveNow();
      }
    }
    if (screen === 'menu' && input.wasPressed('Escape')) this.closeMenu();
    input.endFrame();

    // Expire toasts.
    if (this.toasts.some((t) => (this.toastExpiry.get(t.id) ?? 0) <= this.time)) {
      this.toasts = this.toasts.filter((t) => (this.toastExpiry.get(t.id) ?? 0) > this.time);
      this.store.set({ toasts: this.toasts });
    }

    renderer.render(this.scene, this.camera);
    const info = renderer.info;
    this.lastInfo = {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
    };
    this.publishFrame(dt);
    const waiters = this.frameWaiters;
    this.frameWaiters = [];
    for (const w of waiters) w();
  }

  private publishFrame(dt: number): void {
    const r = this.region;
    let prompt: string | null = null;
    if (r && this.store.getSnapshot().screen === 'playing') {
      const t = this.currentTarget();
      if (t?.kind === 'collectible') {
        const name = r.def.collectibles.find((c) => c.id === t.id)?.name ?? 'spirit';
        prompt = `E — Collect the ${name}`;
      } else if (t?.kind === 'portal') {
        const { count, total } = regionProgress(r.def, this.progress.collected);
        prompt = count === total ? `E — Enter the ${r.def.portal.name}` : `E — ${r.def.portal.name} (sealed: ${count} / ${total})`;
      }
    }
    const headingDeg = Math.round(wrapAngle(this.look.yaw) / DEG) % 360;
    const compass = `${compassPoint(headingDeg * DEG)} ${String(headingDeg).padStart(3, '0')}°`;
    const partial: Partial<UiState> = { mode: this.player.mode as MovementMode, prompt, headingDeg, compass };

    this.fpsFrames++;
    this.fpsTime += dt;
    this.debugAccum += dt;
    if (this.debugVisible && this.debugAccum >= 0.25) {
      this.debugAccum = 0;
      const geo = r ? r.gen.projection.worldToGeo(Math.max(-1000, Math.min(1000, this.player.x)), Math.max(-1000, Math.min(1000, this.player.z))) : null;
      const debug: DebugInfo = {
        fps: this.fpsTime > 0 ? Math.round(this.fpsFrames / this.fpsTime) : 0,
        frameMs: this.fpsFrames > 0 ? Math.round((this.fpsTime / this.fpsFrames) * 10000) / 10 : 0,
        calls: this.lastInfo.calls,
        triangles: this.lastInfo.triangles,
        geometries: this.lastInfo.geometries,
        textures: this.lastInfo.textures,
        x: Math.round(this.player.x * 10) / 10,
        y: Math.round(this.player.y * 10) / 10,
        z: Math.round(this.player.z * 10) / 10,
        lat: geo ? Math.round(geo.lat * 1e5) / 1e5 : 0,
        lon: geo ? Math.round(geo.lon * 1e5) / 1e5 : 0,
        headingDeg,
      };
      partial.debug = debug;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.store.set(partial);
  }

  // ---------------------------------------------------------------- benchmarks (plan §10.4–10.5)

  private async runGenerationBench(): Promise<void> {
    const r = this.region;
    const renderer = this.renderer;
    if (!r || !renderer) return;
    const runs: Record<string, number>[] = [];
    for (let run = 0; run < 11; run++) {
      const stages: Record<string, number> = {};
      let last = performance.now();
      const t0 = last;
      const mark = (stage: string) => {
        const now = performance.now();
        stages[stage] = now - last;
        last = now;
      };
      const gen = generateRegion(r.def, r.meta, r.bytes, mark);
      stages.generation = performance.now() - t0;
      const b0 = performance.now();
      const scene = new RegionScene(gen);
      stages.build = performance.now() - b0;
      const tmp = new Scene();
      tmp.add(scene.root);
      const u0 = performance.now();
      renderer.render(tmp, this.camera);
      stages.firstRender = performance.now() - u0;
      scene.dispose();
      stages.total = performance.now() - t0;
      if (run > 0) runs.push(stages);
      await this.yieldFrame();
    }
    const stat = (k: string) => {
      const v = runs.map((x) => x[k] ?? 0).sort((a, b) => a - b);
      return { median: v[Math.floor(v.length / 2)]!, p95: v[Math.min(v.length - 1, Math.ceil(v.length * 0.95) - 1)]! };
    };
    const keys = Object.keys(runs[0] ?? {});
    const result = {
      kind: 'generation',
      userAgent: navigator.userAgent,
      runs: runs.length,
      stages: Object.fromEntries(keys.map((k) => [k, stat(k)])),
    };
    (window as unknown as { otherworldBench?: unknown }).otherworldBench = result;
    console.log('[bench:gen]', JSON.stringify(result, null, 2));
  }

  private async runFrameBench(): Promise<void> {
    if (!this.region) return;
    const poses = this.poses;
    const duration = 60;
    const warmup = 5;
    const deltas: number[] = [];
    let maxCalls = 0;
    let maxTriangles = 0;
    const start = performance.now();
    let prev = start;
    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = performance.now();
        const t = (now - start) / 1000;
        if (t >= duration) {
          resolve();
          return;
        }
        const seg = (t / duration) * (poses.length - 1);
        const i = Math.min(poses.length - 2, Math.floor(seg));
        const f = seg - i;
        const e = f * f * (3 - 2 * f);
        const a = poses[i]!;
        const b = poses[i + 1]!;
        const mix = (u: [number, number, number], v: [number, number, number]) => u.map((x, k) => x + (v[k]! - x) * e) as [number, number, number];
        this.poseOverride = { name: 'path', position: mix(a.position, b.position), target: mix(a.target, b.target) };
        if (t > warmup) {
          deltas.push(now - prev);
          maxCalls = Math.max(maxCalls, this.lastInfo.calls);
          maxTriangles = Math.max(maxTriangles, this.lastInfo.triangles);
        }
        prev = now;
        this.frameWaiters.push(tick);
      };
      this.frameWaiters.push(tick);
    });
    this.poseOverride = null;
    const sorted = [...deltas].sort((x, y) => x - y);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const result = {
      kind: 'frame',
      userAgent: navigator.userAgent,
      frames: deltas.length,
      medianMs: Math.round(q(0.5) * 100) / 100,
      p95Ms: Math.round(q(0.95) * 100) / 100,
      maxCalls,
      maxTriangles,
      heapMB: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null,
      pixelRatio: this.renderer?.getPixelRatio(),
    };
    (window as unknown as { otherworldBench?: unknown }).otherworldBench = result;
    console.log('[bench:frame]', JSON.stringify(result, null, 2));
  }

  // ---------------------------------------------------------------- test API (exposed only by testHooks.ts)

  testApi() {
    return {
      getState: () => {
        const r = this.region;
        return {
          screen: this.store.getSnapshot().screen,
          regionId: r?.def.id ?? null,
          mode: this.player.mode,
          collected: [...this.progress.collected],
          portalActive: r ? isComplete(r.def, this.progress.collected) : false,
          player: { x: this.player.x, y: this.player.y, z: this.player.z, interactionLock: this.player.interactionLock },
          surfaceY: r ? r.gen.surface.height(this.player.x, this.player.z) : null,
          collectibles: r ? r.gen.collectibles.map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z })) : [],
          portal: r ? { x: r.gen.portal.x, y: r.gen.portal.y, z: r.gen.portal.z } : null,
          spawn: r ? r.gen.spawn : null,
          floraInstances: r ? r.scene.flora.instanceCount() : 0,
          materials: r ? r.scene.materials().size : 0,
          poses: this.poses.map((p) => p.name),
        };
      },
      warpTo: (target: string | { x: number; z: number }) => {
        const r = this.region;
        if (!r) throw new Error('no region');
        let x: number;
        let z: number;
        if (typeof target === 'string') {
          if (target === 'portal') {
            x = r.gen.portal.x;
            z = r.gen.portal.z + 3;
          } else if (target === 'spawn') {
            x = r.gen.spawn.x;
            z = r.gen.spawn.z;
          } else {
            const c = r.gen.collectibles.find((i) => i.id === target);
            if (!c) throw new Error(`unknown target ${target}`);
            x = c.x;
            z = c.z;
          }
        } else {
          x = target.x;
          z = target.z;
        }
        this.player = createPlayer(x, r.gen.surface.height(x, z), z, this.look.yaw);
        this.cam.initialised = false;
      },
      interact: () => this.interact(),
      toggleMode: () => {
        this.pendingToggle = true;
      },
      reloadRegion: async () => {
        const r = this.region;
        if (!r) return;
        const gen = generateRegion(r.def, r.meta, r.bytes);
        this.mountRegion(r.def, gen, r.meta, r.bytes);
        this.renderer?.compile(this.scene, this.camera);
      },
      heightfieldHash: () => (this.region ? hashTypedArray(this.region.gen.field.heights) : null),
      rendererInfo: () => ({ ...this.lastInfo }),
      setPose: (n: number | null) => {
        this.poseOverride = n === null ? null : (this.poses[n] ?? null);
      },
      nextFrame: () => new Promise<void>((resolve) => this.frameWaiters.push(resolve)),
      saveNow: () => this.saveNow(),
      setLook: (yaw: number, pitch: number) => {
        this.look.yaw = wrapAngle(yaw);
        this.look.pitch = pitch;
      },
    };
  }
}

export type TestApi = ReturnType<Game['testApi']>;
