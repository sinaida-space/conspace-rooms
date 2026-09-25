import * as THREE from 'three';
import { CEIL_H, CELL, solidAtGlobal } from './world.js';

// ── conspace-rooms · spots.js ───────────────────────────────────────────────
// Paint in the air, after UVALISS's newer works: faint blots drifting through
// every corridor, barely there, just enough to thicken the air. Each one is
// drawn procedurally on a camera-facing quad (a blob with a ragged edge, a
// pooled rim, a few speckles, or a soft bokeh disc) and takes the colour of
// the light of the room you are in.
//
// Motion runs on the CPU so every blot can see the walls: it fades out as it
// nears one and is gone before it could cut into the plaster.

const BOX = { x: 18, y: CEIL_H, z: 18 };

const VERT = /* glsl */`
attribute vec4 aSeed;          // x,y,z: random, w: size in metres
attribute float aVis;          // 0..1, set per frame: distance fade and wall fade
varying vec2 vUv;
varying vec4 vSeed;
varying float vVis;
uniform float uTime;
void main(){
  vSeed = aSeed; vVis = aVis; vUv = uv;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float rot = aSeed.x * 6.28 + uTime * 0.03 * (aSeed.y - 0.5);
  mv.xy += mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * position.xy * aSeed.w; // billboard
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform vec3 uTint;
varying vec2 vUv;
varying vec4 vSeed;
varying float vVis;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){
  if (vVis < 0.01) discard;
  vec2 p = (vUv - 0.5) * 2.0;
  vec2 o = vSeed.xy * 17.0;
  float r = length(p), a;
  if (vSeed.z < 0.35) {
    a = smoothstep(1.0, 0.5, r) * 0.8;                          // soft bokeh
  } else {
    float edge = 0.62 + 0.22 * n(p * 2.2 + o) + 0.1 * n(p * 6.0 + o); // blot with a bitten edge
    float body = smoothstep(edge, edge - 0.12, r);
    float sp = 0.0;
    for (int k = 0; k < 3; k++) {
      vec2 c = vec2(h(o + float(k)), h(o + float(k) + 9.1)) * 1.6 - 0.8;
      float rr = 0.05 + 0.07 * h(o + float(k) * 3.3);
      sp = max(sp, smoothstep(rr, rr * 0.5, length(p - c * 1.1)));
    }
    a = max(body * (0.7 + 0.3 * n(p * 16.0 + o)), sp * 0.7);
  }
  // barely there: the room's own light, a touch brighter, very transparent
  a *= 0.09 * vVis;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uTint * (0.9 + 0.3 * vSeed.y), a);
}`;

const wrap = (v, c, size) => ((((v - c + size / 2) % size) + size) % size) + c - size / 2;

// distance from (x, z) to the nearest wall, looking at the 3×3 cells around
function wallDist(x, z) {
  const gi = Math.floor(x / CELL), gj = Math.floor(z / CELL);
  let d = Infinity;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (!solidAtGlobal(gi + di, gj + dj)) continue;
    const x0 = (gi + di) * CELL, z0 = (gj + dj) * CELL;
    const dx = Math.max(x0 - x, 0, x - (x0 + CELL)), dz = Math.max(z0 - z, 0, z - (z0 + CELL));
    d = Math.min(d, Math.hypot(dx, dz));
  }
  return d;
}

export function createSpots(scene, quality) {
  const n = [50, 110, 160][quality.tier] ?? 110;
  const geo = new THREE.PlaneGeometry(1, 1);
  const seeds = new Float32Array(n * 4), vis = new Float32Array(n);
  const base = [];
  for (let i = 0; i < n; i++) {
    const big = Math.random() < 0.12;
    seeds.set([Math.random(), Math.random(), Math.random(), big ? 0.3 + Math.random() * 0.25 : 0.05 + Math.random() * 0.15], i * 4);
    base.push([Math.random() * BOX.x, 0.3 + Math.random() * (BOX.y - 0.6), Math.random() * BOX.z]);
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  const visAttr = new THREE.InstancedBufferAttribute(vis, 1);
  visAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aVis', visAttr);
  const uniforms = { uTint: { value: new THREE.Color(1, 1, 1) }, uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  const m = new THREE.Matrix4();

  return {
    // tint: the light of the zone you stand in
    update(t, camPos, tint) {
      uniforms.uTime.value = t;
      if (tint) uniforms.uTint.value.copy(tint);
      for (let i = 0; i < n; i++) {
        const s = seeds[i * 4 + 3], sx = seeds[i * 4], sy = seeds[i * 4 + 1], sz = seeds[i * 4 + 2];
        const [bx, by, bz] = base[i];
        const x = wrap(bx + Math.sin(t * 0.05 + sx * 6.3) * 0.9, camPos.x, BOX.x);
        const z = wrap(bz + Math.cos(t * 0.04 + sz * 4.7) * 0.9, camPos.z, BOX.z);
        const y = by + Math.sin(t * 0.07 + sy * 5.1) * 0.15;
        // fade near walls (gone before the quad could touch one) and near/far from the eye
        const wd = wallDist(x, z);
        const wallFade = Math.min(1, Math.max(0, (wd - s * 0.6) / (s * 0.6 + 0.1)));
        const d = Math.hypot(x - camPos.x, z - camPos.z);
        const eyeFade = Math.min(1, Math.max(0, (d - 0.6) / 0.8)) * Math.min(1, Math.max(0, (9 - d) / 4));
        const ceilFade = Math.min(1, Math.max(0, (CEIL_H - y - s * 0.5) / 0.2)) * Math.min(1, Math.max(0, (y - s * 0.5) / 0.2));
        vis[i] = wallFade * eyeFade * ceilFade;
        m.makeTranslation(x, y, z);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      visAttr.needsUpdate = true;
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
