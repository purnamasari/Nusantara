// Walking, flying and mode transitions (plan §12.2–12.4). Pure TypeScript with no three.js,
// so the invariant simulations run in Node. All tuning numbers are TARGETs.

import { angleDelta, clamp, dampFactor, DEG, smoothstep } from '../../lib/math.ts';
import { forwardFromHeading, headingFromVector, rightFromHeading } from '../../geo/frames.ts';
import type { Vec3Like } from '../../terrain/heightField.ts';

export interface SurfaceQuery {
  height(x: number, z: number): number;
  normal(x: number, z: number, out?: Vec3Like): Vec3Like;
}

export interface CylinderCollider {
  x: number;
  z: number;
  baseY: number;
  radius: number;
  height: number;
}

export interface MovementWorld {
  surface: SurfaceQuery;
  colliders: readonly CylinderCollider[];
  /** Walkable / flyable half-extent (±bound in x and z). */
  bound: number;
  ceiling: number;
}

export interface MoveInput {
  forward: number;
  right: number;
  ascend: boolean;
  descend: boolean;
  sprint: boolean;
  jump: boolean;
  toggleMode: boolean;
  yaw: number;
  pitch: number;
}

export type Mode = 'walk' | 'fly' | 'takeoff' | 'landing';

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  mode: Mode;
  grounded: boolean;
  heading: number;
  pitch: number;
  bank: number;
  transitionT: number;
  transitionFrom: number;
  interactionLock: number;
  speed: number;
}

export const TUNING = {
  walkSpeed: 6,
  sprintSpeed: 11,
  walkTau: 0.12,
  jumpSpeed: 7,
  gravity: 25,
  maxSlopeDeg: 50,
  snapDistance: 0.5,
  radius: 0.4,
  height: 1.8,
  cruise: 25,
  boost: 60,
  flyAccelTau: 0.6,
  flyDecelTau: 1.0,
  flyBrakeTau: 0.3,
  verticalSpeed: 12,
  strafeSpeed: 12,
  maxPitch: 60 * DEG,
  minClearance: 2,
  maxBank: 30 * DEG,
  takeoffDuration: 0.4,
  takeoffHeight: 4,
  landMin: 15,
  landMax: 80,
  lockAfter: 0.5,
  edgeSoftBand: 30,
  maxDt: 0.05,
} as const;

const COS_MAX_SLOPE = Math.cos(TUNING.maxSlopeDeg * DEG);
const LOCK_DURING_LANDING = 1e6;

export const NO_INPUT: MoveInput = {
  forward: 0,
  right: 0,
  ascend: false,
  descend: false,
  sprint: false,
  jump: false,
  toggleMode: false,
  yaw: 0,
  pitch: 0,
};

export function createPlayer(x: number, y: number, z: number, heading: number, mode: 'walk' | 'fly' = 'walk'): PlayerState {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, mode, grounded: mode === 'walk', heading, pitch: 0, bank: 0,
    transitionT: 0, transitionFrom: y, interactionLock: 0, speed: 0,
  };
}

const n0: Vec3Like = { x: 0, y: 1, z: 0 };

/** Removes the uphill velocity component when the ground at (x, z) is steeper than the limit. */
function blockSteep(s: PlayerState, surface: SurfaceQuery, x: number, z: number): void {
  surface.normal(x, z, n0);
  if (n0.y >= COS_MAX_SLOPE) return;
  const hx = -n0.x;
  const hz = -n0.z;
  const len = Math.hypot(hx, hz);
  if (len < 1e-9) return;
  const ux = hx / len;
  const uz = hz / len;
  const dot = s.vx * ux + s.vz * uz;
  if (dot > 0) {
    s.vx -= dot * ux;
    s.vz -= dot * uz;
  }
}

export function resolveColliders(s: PlayerState, colliders: readonly CylinderCollider[]): void {
  for (const c of colliders) {
    if (s.y > c.baseY + c.height || s.y + TUNING.height < c.baseY - 0.5) continue;
    const dx = s.x - c.x;
    const dz = s.z - c.z;
    const min = c.radius + TUNING.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) continue;
    let d = Math.sqrt(d2);
    let nx = 1;
    let nz = 0;
    if (d > 1e-6) {
      nx = dx / d;
      nz = dz / d;
    } else {
      d = 0;
    }
    s.x = c.x + nx * min;
    s.z = c.z + nz * min;
    const into = s.vx * nx + s.vz * nz;
    if (into < 0) {
      s.vx -= into * nx;
      s.vz -= into * nz;
    }
  }
}

function applyBounds(s: PlayerState, bound: number, dt: number): void {
  const soft = bound - TUNING.edgeSoftBand;
  for (const axis of ['x', 'z'] as const) {
    const v = axis === 'x' ? 'vx' : 'vz';
    const p = s[axis];
    if (Math.abs(p) > soft) {
      // Soft push back toward the centre, then a hard limit.
      const over = (Math.abs(p) - soft) / TUNING.edgeSoftBand;
      s[v] -= Math.sign(p) * over * 40 * dt;
    }
    if (p > bound) {
      s[axis] = bound;
      if (s[v] > 0) s[v] = 0;
    } else if (p < -bound) {
      s[axis] = -bound;
      if (s[v] < 0) s[v] = 0;
    }
  }
}

function stepWalk(s: PlayerState, input: MoveInput, w: MovementWorld, dt: number): void {
  const f = forwardFromHeading(input.yaw);
  const r = rightFromHeading(input.yaw);
  let wx = f.x * input.forward + r.x * input.right;
  let wz = f.z * input.forward + r.z * input.right;
  const len = Math.hypot(wx, wz);
  if (len > 1) {
    wx /= len;
    wz /= len;
  }
  const speed = input.sprint ? TUNING.sprintSpeed : TUNING.walkSpeed;
  const k = dampFactor(dt, TUNING.walkTau);
  s.vx += (wx * speed - s.vx) * k;
  s.vz += (wz * speed - s.vz) * k;

  blockSteep(s, w.surface, s.x, s.z);
  blockSteep(s, w.surface, s.x + s.vx * dt, s.z + s.vz * dt);
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  resolveColliders(s, w.colliders);
  applyBounds(s, w.bound, dt);

  const wasGrounded = s.grounded;
  if (s.grounded && input.jump) {
    s.vy = TUNING.jumpSpeed;
    s.grounded = false;
  }
  s.vy -= TUNING.gravity * dt;
  s.y += s.vy * dt;
  const ground = w.surface.height(s.x, s.z);
  if (s.y <= ground) {
    s.y = ground;
    s.vy = 0;
    s.grounded = true;
  } else if (wasGrounded && !input.jump && s.vy <= 0 && s.y - ground <= TUNING.snapDistance) {
    s.y = ground;
    s.vy = 0;
    s.grounded = true;
  } else {
    s.grounded = false;
  }

  const hs = Math.hypot(s.vx, s.vz);
  if (hs > 0.5) s.heading += angleDelta(s.heading, headingFromVector(s.vx, s.vz)) * dampFactor(dt, 0.08);
  s.pitch = 0;
  s.bank = 0;
  s.speed = hs;
}

function stepFly(s: PlayerState, input: MoveInput, w: MovementWorld, dt: number): void {
  const yawRate = angleDelta(s.heading, input.yaw) / Math.max(dt, 1e-4);
  s.heading = input.yaw;
  s.pitch = clamp(input.pitch, -TUNING.maxPitch, TUNING.maxPitch);
  const bankTarget = clamp(-yawRate * 0.25, -TUNING.maxBank, TUNING.maxBank);
  s.bank += (bankTarget - s.bank) * dampFactor(dt, 0.15);

  const cp = Math.cos(s.pitch);
  const dx = Math.sin(s.heading) * cp;
  const dy = Math.sin(s.pitch);
  const dz = -Math.cos(s.heading) * cp;
  const r = rightFromHeading(s.heading);
  const fwd = input.forward > 0 ? (input.sprint ? TUNING.boost : TUNING.cruise) * input.forward : 0;
  const vertical = (input.ascend ? TUNING.verticalSpeed : 0) - (input.descend ? TUNING.verticalSpeed : 0);
  const strafe = input.right * TUNING.strafeSpeed;
  const tx = dx * fwd + r.x * strafe;
  const ty = dy * fwd + vertical;
  const tz = dz * fwd + r.z * strafe;
  const targetSpeed = Math.hypot(tx, ty, tz);
  const current = Math.hypot(s.vx, s.vy, s.vz);
  const tau = input.forward < 0 ? TUNING.flyBrakeTau : targetSpeed > current ? TUNING.flyAccelTau : TUNING.flyDecelTau;
  const k = dampFactor(dt, tau);
  s.vx += (tx - s.vx) * k;
  s.vy += (ty - s.vy) * k;
  s.vz += (tz - s.vz) * k;

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
  resolveColliders(s, w.colliders);
  applyBounds(s, w.bound, dt);
  const minY = w.surface.height(s.x, s.z) + TUNING.minClearance;
  if (s.y < minY) {
    s.y = minY;
    if (s.vy < 0) s.vy = 0;
  }
  if (s.y > w.ceiling) {
    s.y = w.ceiling;
    if (s.vy > 0) s.vy = 0;
  }
  s.grounded = false;
  s.speed = Math.hypot(s.vx, s.vy, s.vz);
}

function stepTakeoff(s: PlayerState, w: MovementWorld, dt: number): void {
  s.transitionT += dt;
  const k = dampFactor(dt, 0.3);
  s.vx -= s.vx * k;
  s.vz -= s.vz * k;
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  resolveColliders(s, w.colliders);
  applyBounds(s, w.bound, dt);
  const target = w.surface.height(s.x, s.z) + TUNING.takeoffHeight;
  const t = smoothstep(0, 1, s.transitionT / TUNING.takeoffDuration);
  s.y = s.transitionFrom + (target - s.transitionFrom) * t;
  s.vy = 0;
  s.grounded = false;
  if (s.transitionT >= TUNING.takeoffDuration) {
    s.y = Math.max(s.y, target);
    s.mode = 'fly';
    s.interactionLock = TUNING.lockAfter;
  }
}

function stepLanding(s: PlayerState, input: MoveInput, w: MovementWorld, dt: number): void {
  // Limited horizontal control while descending.
  const f = forwardFromHeading(input.yaw);
  const r = rightFromHeading(input.yaw);
  const tx = (f.x * input.forward + r.x * input.right) * 6;
  const tz = (f.z * input.forward + r.z * input.right) * 6;
  const k = dampFactor(dt, 0.4);
  s.vx += (tx - s.vx) * k;
  s.vz += (tz - s.vz) * k;
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  resolveColliders(s, w.colliders);
  applyBounds(s, w.bound, dt);
  const ground = w.surface.height(s.x, s.z);
  const above = s.y - ground;
  s.vy = -clamp(2 * above, TUNING.landMin, TUNING.landMax);
  s.y += s.vy * dt;
  s.pitch -= s.pitch * dampFactor(dt, 0.2);
  s.bank -= s.bank * dampFactor(dt, 0.2);
  if (s.y - ground <= 0.05) {
    s.y = ground;
    s.vy = 0;
    s.mode = 'walk';
    s.grounded = true;
    s.pitch = 0;
    s.bank = 0;
    s.interactionLock = TUNING.lockAfter;
  }
}

/** Advances the player by one (clamped) time step. Enforces y ≥ surface every step. */
export function stepPlayer(s: PlayerState, input: MoveInput, w: MovementWorld, rawDt: number): void {
  const dt = Math.min(Math.max(rawDt, 0), TUNING.maxDt);
  if (s.interactionLock > 0 && s.interactionLock < LOCK_DURING_LANDING) {
    s.interactionLock = Math.max(0, s.interactionLock - dt);
  }
  if (input.toggleMode) {
    if (s.mode === 'walk') {
      s.mode = 'takeoff';
      s.transitionT = 0;
      s.transitionFrom = s.y;
      s.interactionLock = TUNING.takeoffDuration + TUNING.lockAfter;
    } else if (s.mode === 'fly') {
      s.mode = 'landing';
      s.interactionLock = LOCK_DURING_LANDING;
    }
  }
  switch (s.mode) {
    case 'walk':
      stepWalk(s, input, w, dt);
      break;
    case 'fly':
      stepFly(s, input, w, dt);
      break;
    case 'takeoff':
      stepTakeoff(s, w, dt);
      break;
    case 'landing':
      stepLanding(s, input, w, dt);
      break;
  }
  // Invariant (plan §12.4): never below the walkable surface.
  const ground = w.surface.height(s.x, s.z);
  if (s.y < ground) s.y = ground;
}

export function isTransition(mode: Mode): boolean {
  return mode === 'takeoff' || mode === 'landing';
}
