// Sky dome, fog, lights, mist sea and drifting petals (plan §9.1, §9.4). No textures.

import {
  BackSide, BufferAttribute, BufferGeometry, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh,
  MeshBasicMaterial, NormalBlending, PlaneGeometry, Points, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import type { BiomeDefinition } from '../../content/types.ts';
import { mulberry32 } from '../../lib/rng.ts';
import { deriveSeed } from '../../lib/rng.ts';
import { linearColor } from './primitives.ts';

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, h));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSun * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const PETAL_VERTEX = /* glsl */ `
uniform vec3 uCam;
uniform float uTime;
uniform vec3 uBox;
uniform float uScale;
attribute vec3 aOffset;
attribute vec3 color;
varying vec3 vColor;
varying float vFade;
void main() {
  vec3 drift = vec3(sin(uTime * 0.21 + aOffset.y * 9.0) * 3.0 + uTime * 1.6, -uTime * 0.7, cos(uTime * 0.17 + aOffset.x * 7.0) * 3.0 + uTime * 0.9);
  vec3 p = aOffset * uBox + drift;
  vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec4 mv = modelViewMatrix * vec4(uCam + rel, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  vFade = 1.0 - smoothstep(30.0, 75.0, length(rel));
  gl_PointSize = uScale * 0.35 / max(dist, 0.5);
  vColor = color;
}`;

const PETAL_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25) discard;
  gl_FragColor = vec4(vColor, (1.0 - r * 4.0) * 0.85 * vFade);
  #include <colorspace_fragment>
}`;

export class Atmosphere {
  readonly group = new Group();
  readonly fog: Fog;
  readonly sky: Mesh;
  readonly petals: Points;
  readonly mist: Mesh;
  readonly background: Color;
  private readonly petalMaterial: ShaderMaterial;
  private readonly fogNear: number;
  private readonly fogFar: number;

  constructor(biome: BiomeDefinition, seed: number) {
    this.fogNear = biome.fog.near;
    this.fogFar = biome.fog.far;
    this.group.name = 'atmosphere';
    this.background = linearColor(biome.fog.color);
    this.fog = new Fog(linearColor(biome.fog.color), biome.fog.near, biome.fog.far);

    const sunDir = new Vector3(...biome.sky.sunDirection).normalize();
    const skyMat = new ShaderMaterial({
      uniforms: {
        uTop: { value: linearColor(biome.sky.top) },
        uHorizon: { value: linearColor(biome.sky.horizon) },
        uSun: { value: linearColor(biome.sky.sun) },
        uSunDir: { value: sunDir },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new Mesh(new SphereGeometry(4000, 32, 16), skyMat);
    this.sky.name = 'sky';
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    const hemi = new HemisphereLight(linearColor(biome.light.hemiSky), linearColor(biome.light.hemiGround), biome.light.hemiIntensity);
    const sun = new DirectionalLight(linearColor(biome.light.sun), biome.light.sunIntensity);
    sun.position.copy(sunDir).multiplyScalar(500);
    this.group.add(hemi, sun);

    this.mist = new Mesh(
      new PlaneGeometry(12000, 12000),
      new MeshBasicMaterial({ color: linearColor(biome.mist.color), transparent: true, opacity: biome.mist.opacity, depthWrite: false }),
    );
    this.mist.name = 'mist';
    this.mist.rotation.x = -Math.PI / 2;
    this.mist.position.y = biome.mist.height;
    this.group.add(this.mist);

    const count = biome.petals.count;
    const rand = mulberry32(deriveSeed(seed, 'fx.petals'));
    const offsets = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = biome.petals.colors.map((c) => linearColor(c));
    for (let i = 0; i < count; i++) {
      offsets[i * 3] = rand();
      offsets[i * 3 + 1] = rand();
      offsets[i * 3 + 2] = rand();
      const c = palette[Math.floor(rand() * palette.length)]!;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const pg = new BufferGeometry();
    pg.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    pg.setAttribute('aOffset', new BufferAttribute(offsets, 3));
    pg.setAttribute('color', new BufferAttribute(colors, 3));
    this.petalMaterial = new ShaderMaterial({
      uniforms: {
        uCam: { value: new Vector3() },
        uTime: { value: 0 },
        uBox: { value: new Vector3(160, 60, 160) },
        uScale: { value: 600 },
      },
      vertexShader: PETAL_VERTEX,
      fragmentShader: PETAL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    this.petals = new Points(pg, this.petalMaterial);
    this.petals.name = 'petals';
    this.petals.frustumCulled = false;
    this.group.add(this.petals);
  }

  update(time: number, camX: number, camY: number, camZ: number, viewportHeight: number, groundY: number): void {
    // Thin the fog with altitude so aerial views read the landscape (ground level keeps the mist).
    const altitude = Math.max(0, camY - groundY);
    const k = Math.min(1, altitude / 400);
    this.fog.near = this.fogNear + k * 350;
    this.fog.far = this.fogFar + k * 1500;
    this.sky.position.set(camX, camY, camZ);
    this.mist.position.x = camX;
    this.mist.position.z = camZ;
    const u = this.petalMaterial.uniforms;
    (u.uCam!.value as Vector3).set(camX, camY, camZ);
    u.uTime!.value = time;
    u.uScale!.value = viewportHeight;
  }
}
