// Flora Spirits (plan §9.4): instanced cores, glow points and fog-exempt light pillars.
// Three draw calls for all five. Collected spirits are hidden (scale 0 / size 0).

import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4,
  MeshBasicMaterial, Points, Quaternion, ShaderMaterial, Vector3, Euler,
} from 'three';
import type { ResolvedCollectible } from '../../terrain/generate.ts';
import { linearColor } from './primitives.ts';

const GLOW_VERTEX = /* glsl */ `
attribute vec3 color;
attribute float aVisible;
uniform float uScale;
varying vec3 vColor;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vFade = 1.0 - smoothstep(120.0, 260.0, d);
  gl_PointSize = aVisible * uScale * 4.5 / max(d, 0.5);
  vColor = color;
}`;

const GLOW_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c) * 4.0;
  if (r > 1.0) discard;
  float a = (1.0 - r) * (1.0 - r) * vFade;
  gl_FragColor = vec4(vColor * a, a);
  #include <colorspace_fragment>
}`;

export class Spirits {
  readonly group = new Group();
  readonly cores: InstancedMesh;
  readonly pillars: InstancedMesh;
  readonly glow: Points;
  private readonly glowMaterial: ShaderMaterial;
  private readonly visible: Float32Array;
  private readonly items: readonly ResolvedCollectible[];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly v = new Vector3();
  private readonly s = new Vector3();

  constructor(items: readonly ResolvedCollectible[]) {
    this.items = items;
    this.group.name = 'spirits';
    const n = items.length;
    this.cores = new InstancedMesh(new IcosahedronGeometry(0.45, 0), new MeshBasicMaterial({ color: 0xffffff }), n);
    this.cores.name = 'spirit-cores';
    const pillarGeom = new CylinderGeometry(0.25, 0.7, 140, 6, 1, true);
    pillarGeom.translate(0, 70, 0);
    this.pillars = new InstancedMesh(
      pillarGeom,
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, blending: AdditiveBlending, depthWrite: false, fog: false }),
      n,
    );
    this.pillars.name = 'spirit-pillars';
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    this.visible = new Float32Array(n).fill(1);
    items.forEach((it, i) => {
      const c = linearColor(it.color);
      this.cores.setColorAt(i, c);
      this.pillars.setColorAt(i, c);
      positions.set([it.x, it.y, it.z], i * 3);
      colors.set([c.r, c.g, c.b], i * 3);
    });
    const gg = new BufferGeometry();
    gg.setAttribute('position', new BufferAttribute(positions, 3));
    gg.setAttribute('color', new BufferAttribute(colors, 3));
    gg.setAttribute('aVisible', new BufferAttribute(this.visible, 1));
    this.glowMaterial = new ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.glow = new Points(gg, this.glowMaterial);
    this.glow.name = 'spirit-glow';
    this.glow.frustumCulled = false;
    this.cores.frustumCulled = false;
    this.pillars.frustumCulled = false;
    this.group.add(this.pillars, this.cores, this.glow);
    this.update(0, 600);
  }

  setCollected(collected: ReadonlySet<string>): void {
    this.items.forEach((it, i) => {
      this.visible[i] = collected.has(it.id) ? 0 : 1;
    });
    (this.glow.geometry.getAttribute('aVisible') as BufferAttribute).needsUpdate = true;
  }

  update(time: number, viewportHeight: number): void {
    this.items.forEach((it, i) => {
      const on = this.visible[i]! > 0;
      const bob = Math.sin(time * 1.6 + i * 1.3) * 0.25;
      this.q.setFromEuler(this.e.set(time * 0.7 + i, time * 1.1 + i * 2, 0));
      this.m.compose(this.v.set(it.x, it.y + bob, it.z), this.q, this.s.setScalar(on ? 1 : 0));
      this.cores.setMatrixAt(i, this.m);
      this.m.compose(this.v.set(it.x, it.y - 1.6, it.z), this.q.identity(), this.s.setScalar(on ? 1 : 0));
      this.pillars.setMatrixAt(i, this.m);
    });
    this.cores.instanceMatrix.needsUpdate = true;
    this.pillars.instanceMatrix.needsUpdate = true;
    this.glowMaterial.uniforms.uScale!.value = viewportHeight;
  }
}
