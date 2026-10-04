// The Petal Gate (plan §12.6): stone ring + swirl disc. Dormant until the region is complete.

import { CircleGeometry, CylinderGeometry, DoubleSide, Group, Mesh, ShaderMaterial, TorusGeometry } from 'three';
import type { Material } from 'three';
import type { WorldCollider } from '../../terrain/generate.ts';
import { mergeParts } from './primitives.ts';
import type { Part } from './primitives.ts';

const SWIRL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SWIRL_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uActive;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float a = atan(p.y, p.x);
  float swirl = sin(a * 5.0 + r * 9.0 - uTime * (0.6 + 2.4 * uActive)) * 0.5 + 0.5;
  vec3 dormant = vec3(0.28, 0.2, 0.4);
  vec3 awake = mix(vec3(1.0, 0.45, 0.75), vec3(1.0, 0.86, 0.45), swirl);
  vec3 col = mix(dormant + swirl * 0.06, awake, uActive);
  float alpha = mix(0.35, 0.92, uActive) * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(col * (0.7 + 0.5 * (1.0 - r)), alpha);
  #include <colorspace_fragment>
}`;

export class PortalVisual {
  readonly group = new Group();
  private readonly swirl: ShaderMaterial;
  private active = 0;
  private target = 0;

  constructor(portal: { id: string; x: number; y: number; z: number }, colliders: readonly WorldCollider[], stoneMaterial: Material) {
    this.group.name = portal.id;
    const posts = colliders.filter((c) => c.owner === portal.id);
    const parts: Part[] = [
      { geometry: new TorusGeometry(4.2, 0.55, 8, 24), color: 0xd9cbb7, position: [0, 4.9, 0] },
      { geometry: new CylinderGeometry(6, 6.6, 0.5, 16), color: 0xbfae98, position: [0, 0, 0] },
    ];
    for (const p of posts) {
      parts.push({ geometry: new CylinderGeometry(p.radius * 0.9, p.radius, 4.6, 6), color: 0xcdbfa9, position: [p.x - portal.x, 2.3, p.z - portal.z] });
    }
    const stone = new Mesh(mergeParts(parts), stoneMaterial);
    this.swirl = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uActive: { value: 0 } },
      vertexShader: SWIRL_VERTEX,
      fragmentShader: SWIRL_FRAGMENT,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });
    const disc = new Mesh(new CircleGeometry(3.7, 40), this.swirl);
    disc.position.y = 4.9;
    disc.name = 'portal-swirl';
    this.group.add(stone, disc);
    this.group.position.set(portal.x, portal.y - 0.2, portal.z);
  }

  setActive(active: boolean, immediate = false): void {
    this.target = active ? 1 : 0;
    if (immediate) this.active = this.target;
  }

  update(time: number, dt: number): void {
    this.active += (this.target - this.active) * Math.min(1, dt * 1.5);
    this.swirl.uniforms.uTime!.value = time;
    this.swirl.uniforms.uActive!.value = this.active;
  }
}
