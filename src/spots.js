import * as THREE from 'three';
import { CEIL_H } from './world.js';

// ── conspace-rooms · spots.js ───────────────────────────────────────────────
// Paint in the air, after UVALISS's newer works: blots of gold, cream and
// rose drifting through every corridor like a slow fog. Each one is drawn
// procedurally on a camera-facing quad: a blob with a ragged, noise-bitten
// edge, a darker dried rim where the pigment pooled, a few satellite
// speckles, sometimes just a soft round bokeh. They live in a box that
// follows the camera and wraps around it, so their number never grows.

const BOX = new THREE.Vector3(18, CEIL_H, 18);

const VERT = /* glsl */`
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
attribute vec4 aSeed;          // x,y,z: random, w: size
varying vec2 vUv;
varying vec4 vSeed;
varying float vFade;
void main(){
  vSeed = aSeed;
  // slow drift on its own path, wrapped into the box around the camera
  vec3 p = instanceMatrix[3].xyz;
  p += vec3(sin(uTime * 0.05 + aSeed.x * 6.3), sin(uTime * 0.07 + aSeed.y * 5.1) * 0.15, cos(uTime * 0.04 + aSeed.z * 4.7)) * 0.9;
  p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
  p.y = 0.2 + mod(p.y, uBox.y - 0.4);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  vFade = smoothstep(0.4, 1.2, dist) * smoothstep(9.0, 4.0, dist); // never in your face, gone in the distance
  float rot = aSeed.x * 6.28 + uTime * 0.03 * (aSeed.y - 0.5);
  vec2 q = position.xy;
  q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * q;
  mv.xy += q * aSeed.w;
  gl_Position = projectionMatrix * mv;
  vUv = uv;
}`;

const FRAG = /* glsl */`
uniform vec3 uTint;
varying vec2 vUv;
varying vec4 vSeed;
varying float vFade;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  vec2 o = vSeed.xy * 17.0;
  float kind = vSeed.z;                     // < 0.3 soft bokeh, else a paint blot
  float r = length(p);
  // pigment palette from the works: gold, cream, dusty rose, a little sage
  vec3 gold = vec3(0.86, 0.72, 0.38), cream = vec3(0.95, 0.9, 0.74), rose = vec3(0.86, 0.5, 0.58), sage = vec3(0.62, 0.72, 0.58);
  vec3 col = kind < 0.55 ? mix(gold, cream, vSeed.y) : kind < 0.85 ? mix(rose, cream, vSeed.x * 0.6) : sage;
  float a;
  if (kind < 0.3) {
    a = smoothstep(1.0, 0.55, r) * 0.55;             // bokeh: soft disc, slightly brighter rim
    a += smoothstep(0.08, 0.0, abs(r - 0.82)) * 0.15;
  } else {
    // blot: an edge bitten by two octaves of noise, a darker pooled rim
    float edge = 0.62 + 0.22 * n(p * 2.2 + o) + 0.1 * n(p * 6.0 + o);
    float body = smoothstep(edge, edge - 0.08, r);
    float rim = smoothstep(0.1, 0.0, abs(r - edge + 0.05)) * body;
    // satellite speckles around it
    float sp = 0.0;
    for (int k = 0; k < 4; k++) {
      vec2 c = vec2(h(o + float(k)), h(o + float(k) + 9.1)) * 1.6 - 0.8;
      float rr = 0.05 + 0.08 * h(o + float(k) * 3.3);
      sp = max(sp, smoothstep(rr, rr * 0.6, length(p - c * 1.1)));
    }
    float grain = 0.8 + 0.4 * n(p * 18.0 + o);      // pigment grain
    a = max(body * (0.5 + 0.2 * grain), sp * 0.55);
    col *= 1.0 - rim * 0.35;
  }
  a *= vFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col * uTint, a);
}`;

export function createSpots(scene, quality) {
  const n = [70, 150, 220][quality.tier] ?? 150;
  const geo = new THREE.PlaneGeometry(1, 1);
  const seeds = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const big = Math.random() < 0.15;
    seeds.set([Math.random(), Math.random(), Math.random(), big ? 0.35 + Math.random() * 0.4 : 0.06 + Math.random() * 0.2], i * 4);
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  const uniforms = {
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX }, uTint: { value: new THREE.Color(1, 1, 1) },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    m.makeTranslation(Math.random() * BOX.x, Math.random() * BOX.y, Math.random() * BOX.z);
    mesh.setMatrixAt(i, m);
  }
  mesh.frustumCulled = false;   // positions are wrapped on the GPU around the camera
  mesh.renderOrder = 2;
  scene.add(mesh);
  return {
    // tint: the zone's light, so the paint sits in each world's air
    update(t, camPos, tint) {
      uniforms.uTime.value = t;
      uniforms.uCam.value.copy(camPos);
      if (tint) uniforms.uTint.value.copy(tint).lerp(new THREE.Color(1, 1, 1), 0.6);
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
