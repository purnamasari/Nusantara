// Third-person orbit camera maths (plan §12.5). No three.js; the controller copies the result.

import { clamp, dampFactor, DEG } from '../../lib/math.ts';
import type { Mode } from '../player/movement.ts';
import type { SurfaceQuery } from '../player/movement.ts';

export const CAMERA = {
  walkArm: 6,
  flyArm: 12,
  walkTargetHeight: 1.6,
  flyTargetHeight: 1.0,
  clearance: 0.5,
  smoothTau: 0.1,
  walkPitchMin: -70 * DEG,
  walkPitchMax: 60 * DEG,
  flyPitchMin: -60 * DEG,
  flyPitchMax: 60 * DEG,
  fovBase: 60,
  fovMax: 72,
} as const;

export interface CameraState {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  arm: number;
  fov: number;
  initialised: boolean;
}

export function createCameraState(): CameraState {
  return { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, arm: CAMERA.walkArm, fov: CAMERA.fovBase, initialised: false };
}

export function clampPitch(pitch: number, mode: Mode): number {
  const flying = mode !== 'walk';
  return clamp(pitch, flying ? CAMERA.flyPitchMin : CAMERA.walkPitchMin, flying ? CAMERA.flyPitchMax : CAMERA.walkPitchMax);
}

/**
 * Updates the camera to orbit the player at (yaw, pitch). The arm shortens until four samples
 * along it clear the surface, and the final position is clamped above the surface.
 */
export function updateCamera(
  cam: CameraState,
  player: { x: number; y: number; z: number; mode: Mode; speed: number },
  yaw: number,
  pitch: number,
  surface: SurfaceQuery,
  dt: number,
): void {
  const flying = player.mode !== 'walk';
  const targetY = player.y + (flying ? CAMERA.flyTargetHeight : CAMERA.walkTargetHeight);
  const k = cam.initialised ? dampFactor(dt, CAMERA.smoothTau) : 1;
  cam.tx += (player.x - cam.tx) * k;
  cam.ty += (targetY - cam.ty) * k;
  cam.tz += (player.z - cam.tz) * k;

  const cp = Math.cos(pitch);
  const dx = Math.sin(yaw) * cp;
  const dy = Math.sin(pitch);
  const dz = -Math.cos(yaw) * cp;
  const desired: number = flying ? CAMERA.flyArm : CAMERA.walkArm;

  let allowed = desired;
  for (let i = 1; i <= 4; i++) {
    const f = i / 4;
    const px = cam.tx - dx * desired * f;
    const py = cam.ty - dy * desired * f;
    const pz = cam.tz - dz * desired * f;
    if (py < surface.height(px, pz) + CAMERA.clearance) {
      allowed = Math.max(desired * 0.15, desired * (f - 0.25));
      break;
    }
  }
  if (!cam.initialised) cam.arm = allowed;
  else cam.arm += (allowed - cam.arm) * dampFactor(dt, allowed < cam.arm ? 0.03 : 0.3);

  cam.x = cam.tx - dx * cam.arm;
  cam.y = cam.ty - dy * cam.arm;
  cam.z = cam.tz - dz * cam.arm;
  const floor = surface.height(cam.x, cam.z) + CAMERA.clearance;
  if (cam.y < floor) cam.y = floor;

  const fovTarget = flying ? CAMERA.fovBase + (CAMERA.fovMax - CAMERA.fovBase) * clamp(player.speed / 60, 0, 1) : CAMERA.fovBase;
  cam.fov += (fovTarget - cam.fov) * (cam.initialised ? dampFactor(dt, 0.3) : 1);
  cam.initialised = true;
}
