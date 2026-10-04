import { describe, expect, it } from 'vitest';
import { createPlayer, NO_INPUT, stepPlayer, TUNING } from '../../src/engine/player/movement.ts';
import type { MoveInput, MovementWorld, PlayerState } from '../../src/engine/player/movement.ts';
import { createCameraState, updateCamera, CAMERA, clampPitch } from '../../src/engine/camera/cameraRig.ts';
import { HeightField } from '../../src/terrain/heightField.ts';
import { Surface } from '../../src/terrain/surface.ts';
import { mulberry32 } from '../../src/lib/rng.ts';
import { bandungRegion } from './helpers.ts';

const g = bandungRegion();
const world: MovementWorld = {
  surface: g.surface,
  colliders: g.colliders,
  bound: g.def.world.walkBound,
  ceiling: g.field.maxHeight + 200,
};

function randomInput(rand: () => number, yaw: number): MoveInput {
  return {
    forward: Math.round(rand() * 2 - 1),
    right: Math.round(rand() * 2 - 1),
    ascend: rand() < 0.3,
    descend: rand() < 0.3,
    sprint: rand() < 0.4,
    jump: rand() < 0.1,
    toggleMode: false,
    yaw,
    pitch: (rand() * 2 - 1) * 1.0,
  };
}

function finite(p: PlayerState): boolean {
  return [p.x, p.y, p.z, p.vx, p.vy, p.vz].every(Number.isFinite);
}

describe('walking invariants (plan §16 M2)', () => {
  it('1,000 seeded starts × 600 frames never go below the surface or outside ±950 m', () => {
    const rand = mulberry32(2024);
    const cam = createCameraState();
    let camViolations = 0;
    for (let run = 0; run < 1000; run++) {
      const x = (rand() * 2 - 1) * 940;
      const z = (rand() * 2 - 1) * 940;
      const p = createPlayer(x, g.surface.height(x, z), z, 0);
      let yaw = rand() * Math.PI * 2;
      let pitch = -0.2;
      let input = randomInput(rand, yaw);
      cam.initialised = false;
      for (let f = 0; f < 600; f++) {
        if (f % 20 === 0) {
          yaw += (rand() - 0.5) * 2;
          pitch = clampPitch((rand() * 2 - 1) * 1.4, 'walk');
          input = randomInput(rand, yaw);
        }
        const dt = 1 / 144 + rand() * (1 / 30 - 1 / 144);
        stepPlayer(p, { ...input, jump: input.jump && f % 20 === 0 }, world, dt);
        if (!finite(p)) throw new Error(`NaN at run ${run} frame ${f}`);
        const s = g.surface.height(p.x, p.z);
        if (p.y < s - 1e-3) throw new Error(`below surface at run ${run} frame ${f}: ${p.y} < ${s}`);
        if (Math.abs(p.x) > world.bound + 1e-6 || Math.abs(p.z) > world.bound + 1e-6) throw new Error(`out of bounds at run ${run}`);
        updateCamera(cam, p, yaw, pitch, g.surface, dt);
        if (cam.y < g.surface.height(cam.x, cam.z) + CAMERA.clearance - 1e-6) camViolations++;
      }
    }
    expect(camViolations).toBe(0);
  });
});

describe('flying invariants (plan §16 M3)', () => {
  it('1,000 seeded flights × 600 frames keep ≥ 2 m clearance, stay under the ceiling and in bounds', () => {
    const rand = mulberry32(77);
    for (let run = 0; run < 1000; run++) {
      const x = (rand() * 2 - 1) * 940;
      const z = (rand() * 2 - 1) * 940;
      const p = createPlayer(x, g.surface.height(x, z) + 2 + rand() * 150, z, 0, 'fly');
      let yaw = rand() * Math.PI * 2;
      let input = randomInput(rand, yaw);
      for (let f = 0; f < 600; f++) {
        if (f % 15 === 0) {
          yaw += (rand() - 0.5) * 1.5;
          input = randomInput(rand, yaw);
        }
        stepPlayer(p, input, world, 1 / 144 + rand() * (1 / 30 - 1 / 144));
        if (!finite(p)) throw new Error(`NaN at run ${run}`);
        const s = g.surface.height(p.x, p.z);
        if (p.y < s + TUNING.minClearance - 1e-3) throw new Error(`clearance violated at run ${run} frame ${f}`);
        if (p.y > world.ceiling + 1e-6) throw new Error(`above ceiling at run ${run}`);
        if (Math.abs(p.x) > world.bound + 1e-6 || Math.abs(p.z) > world.bound + 1e-6) throw new Error('out of bounds');
      }
    }
  });
});

function rampWorld(deg: number): MovementWorld {
  const n = 41;
  const size = 400;
  const half = size / 2;
  const sp = size / (n - 1);
  const t = Math.tan((deg * Math.PI) / 180);
  const h = new Float32Array(n * n);
  // Uphill toward the north (−Z).
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) h[r * n + c] = -(-half + r * sp) * t + 500;
  return { surface: new Surface(new HeightField(h, n, size), null), colliders: [], bound: 190, ceiling: 5000 };
}

describe('slope limit', () => {
  const walkNorth = (w: MovementWorld) => {
    const p = createPlayer(0, w.surface.height(0, 100), 100, 0);
    for (let i = 0; i < 180; i++) stepPlayer(p, { ...NO_INPUT, forward: 1, yaw: 0 }, w, 1 / 60);
    return 100 - p.z;
  };
  it('cannot walk up a 60° ramp', () => expect(walkNorth(rampWorld(60))).toBeLessThan(0.5));
  it('can walk up a 30° ramp', () => expect(walkNorth(rampWorld(30))).toBeGreaterThan(5));
});

describe('mode transitions (plan §12.4)', () => {
  const flat = rampWorld(0);

  it('takeoff ends ≥ 3 m above the surface and locks interaction during and 0.5 s after', () => {
    const p = createPlayer(0, flat.surface.height(0, 0), 0, 0);
    stepPlayer(p, { ...NO_INPUT, toggleMode: true }, flat, 1 / 60);
    expect(p.mode).toBe('takeoff');
    expect(p.interactionLock).toBeGreaterThan(0);
    let t = 1 / 60;
    while (p.mode === 'takeoff') {
      stepPlayer(p, NO_INPUT, flat, 1 / 60);
      t += 1 / 60;
      expect(p.interactionLock).toBeGreaterThan(0);
    }
    expect(p.mode).toBe('fly');
    expect(p.y - flat.surface.height(p.x, p.z)).toBeGreaterThanOrEqual(3);
    expect(t).toBeLessThan(0.5);
    for (let i = 0; i < 25; i++) stepPlayer(p, NO_INPUT, flat, 1 / 60);
    expect(p.interactionLock).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) stepPlayer(p, NO_INPUT, flat, 1 / 60);
    expect(p.interactionLock).toBe(0);
  });

  it('landing from the ceiling ends grounded within 6 s', () => {
    const w = world;
    const x = -60;
    const z = 75;
    const p = createPlayer(x, w.ceiling, z, 0, 'fly');
    stepPlayer(p, { ...NO_INPUT, toggleMode: true }, w, 1 / 60);
    expect(p.mode).toBe('landing');
    let t = 0;
    while (p.mode === 'landing' && t < 10) {
      stepPlayer(p, NO_INPUT, w, 1 / 60);
      t += 1 / 60;
      expect(p.interactionLock).toBeGreaterThan(0);
    }
    expect(p.mode).toBe('walk');
    expect(t).toBeLessThanOrEqual(6);
    expect(Math.abs(p.y - w.surface.height(p.x, p.z))).toBeLessThan(1e-3);
    expect(p.interactionLock).toBeCloseTo(TUNING.lockAfter, 5);
  });

  it('pressing F every frame for 300 frames stays valid', () => {
    const p = createPlayer(-60, g.surface.height(-60, 75), 75, 0);
    for (let i = 0; i < 300; i++) {
      stepPlayer(p, { ...NO_INPUT, toggleMode: true, forward: 1 }, world, 1 / 60);
      expect(finite(p)).toBe(true);
      expect(p.y).toBeGreaterThanOrEqual(g.surface.height(p.x, p.z) - 1e-3);
      expect(['walk', 'fly', 'takeoff', 'landing']).toContain(p.mode);
    }
  });

  it('colliders push the player out (Mother Bloom stem)', () => {
    const stem = g.colliders.find((c) => c.owner === 'bandung.landmark.blooming-highlands')!;
    const p = createPlayer(stem.x, g.surface.height(stem.x, stem.z), stem.z + 0.1, 0);
    stepPlayer(p, NO_INPUT, world, 1 / 60);
    expect(Math.hypot(p.x - stem.x, p.z - stem.z)).toBeGreaterThanOrEqual(stem.radius + TUNING.radius - 1e-6);
  });
});
