import * as THREE from 'three';
import { CEIL_H } from './world.js';

// ── conspace-rooms · dust.js ────────────────────────────────────────────────
// Dust hanging in the light. A box of points follows the camera and wraps
// around it, so the count never grows. Each mote is bright only inside the
// cone under a ceiling fixture (fixtures sit on a 4.8 m lattice, same as
// materials.js), which turns the lamps into visible beams.

const BOX = new THREE.Vector3(16, CEIL_H, 16);

const VERT = /* glsl */`
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform float uPx;           // point size scale (pixel ratio aware)
attribute float aSeed;
const float LINES[9] = float[9](-5.0, -2.0, 1.0, 5.0, 8.0, 11.0, 14.0, 17.0, 21.0);
varying float vBright;
void main(){
  // slow drift, each mote on its own path, wrapped into a box around the camera
  vec3 p = position + vec3(sin(uTime * 0.07 + aSeed * 6.3) * 0.6, -uTime * 0.035 * (0.5 + aSeed), cos(uTime * 0.05 + aSeed * 4.1) * 0.6);
  p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
  p.y = mod(p.y, uBox.y);
  // brightness: inside a beam under the nearest fixture (same lamp lines as
  // world.js / materials.js), fading with depth
  vec2 cl = p.xz / 1.2, base = floor(cl / 16.0) * 16.0, lc = cl - base, best = vec2(1e9), near = vec2(0.0);
  for (int i = 0; i < 9; i++) {
    float L = LINES[i] + 0.5;
    if (abs(L - lc.x) < best.x) { best.x = abs(L - lc.x); near.x = L; }
    if (abs(L - lc.y) < best.y) { best.y = abs(L - lc.y); near.y = L; }
  }
  vec2 f = (lc - near) * 1.2;
  float beamR = mix(0.35, 1.3, 1.0 - p.y / uBox.y);          // cone widens toward the floor
  vBright = smoothstep(beamR, beamR * 0.4, length(f)) * (0.35 + 0.65 * aSeed);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPx * (1.0 + aSeed) * 18.0 / max(0.5, -mv.z);
  vBright *= smoothstep(14.0, 4.0, -mv.z);                   // only near motes
}`;

const FRAG = /* glsl */`
uniform vec3 uColor;
varying float vBright;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c)) * vBright;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

export function createDust(scene, quality) {
  const n = [260, 700, 1100][quality.tier] ?? 700;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = Math.random() * BOX.x;
    pos[i * 3 + 1] = Math.random() * BOX.y;
    pos[i * 3 + 2] = Math.random() * BOX.z;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = {
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX },
    uPx: { value: Math.min(2, devicePixelRatio || 1) }, uColor: { value: new THREE.Color(0xdfe8dd) },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; // positions are computed on the GPU around the camera
  scene.add(points);

  return {
    // lightHex: current zone light colour, as a THREE.Color
    update(t, camPos, light) {
      uniforms.uTime.value = t;
      uniforms.uCam.value.copy(camPos);
      if (light) uniforms.uColor.value.copy(light).multiplyScalar(0.55);
    },
    dispose() { scene.remove(points); geo.dispose(); mat.dispose(); },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
