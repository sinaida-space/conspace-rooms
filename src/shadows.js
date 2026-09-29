import * as THREE from 'three';
import { CELL, lampLineNear } from './world.js';

// ── conspace-rooms · shadows.js ─────────────────────────────────────────────
// Contact shadows for the things standing on the floor. The light here is
// faked (materials.js), so nothing casts a real shadow: each thing gets a
// soft dark footprint instead, a rounded rectangle a little larger than its
// base, pushed and stretched away from the nearest ceiling fixture the way
// its shadow would fall. All of a chunk's footprints are one mesh that
// multiplies the floor under it, so a chunk pays one draw call.
//
// A footprint: { x, z, w, d, rot, k, h } (rot as ward.js orientedBox: local
// X is w; k darkness, 1 by default; h height in metres). Beside the contact
// shade every thing with a height casts a shadow along the floor, away from
// the fixture, as long as similar triangles make it: h · far / (lamp − h).

const VERT = /* glsl */`
attribute vec2 aLocal;        // metres from the footprint's centre, in its own frame
attribute vec3 aHalf;         // half width, half depth, darkness (negative: a cast shadow, fading along its length)
varying vec2 vLocal;
varying vec3 vHalf;
varying float vDist;
void main(){
  vLocal = aLocal; vHalf = aHalf;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDist = distance(wp.xyz, cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
uniform float fogDensity;
uniform float uLight;         // 0 in the dark stages, 1 in the light: shade there is pale lilac, never black
varying vec2 vLocal;
varying vec3 vHalf;
varying float vDist;
void main(){
  vec2 q = abs(vLocal) - vHalf.xy;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);     // rounded-rectangle distance
  float core = 1.0 - smoothstep(-0.06, 0.05, sd);                // dense right under it
  float soft = 1.0 - smoothstep(-0.1, 0.34, sd);                 // and a wide soft falloff
  float k = (0.5 * core + 0.4 * soft) * vHalf.z;
  if (vHalf.z < 0.0) {                                             // cast: dense at the foot, thinning and blurring away
    float along = clamp(vLocal.y / max(vHalf.y, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
    float wide = 1.0 - smoothstep(-0.02, 0.1 + 0.2 * along, sd);
    k = -vHalf.z * wide * mix(0.72, 0.1, along);
  }
  k *= 1.0 - smoothstep(12.0, 24.0, vDist);
  float fogged = 1.0 - exp(-fogDensity * fogDensity * vDist * vDist);   // the scene's exp2 fog: a shadow goes where its thing goes,
  k *= 1.0 - fogged;                                               // never a dark patch left in the white haze of the light
  vec3 full = mix(vec3(0.0), vec3(0.66, 0.62, 0.72), uLight);    // what the densest shade multiplies the floor to
  gl_FragColor = vec4(mix(vec3(1.0), full, clamp(k, 0.0, 1.0)), 1.0);   // multiplied into the floor
}`;

let material = null;
const light = { value: 0 };
// how far into the light the walk is (0..1), shared by every footprint
export function setShadowLight(v) { light.value = v; }
function shadowMaterial() {
  return material ??= new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uLight: light },   // three keeps fogDensity current
    fog: true,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
  });
}

// One mesh of footprints, or null for an empty list.
export function contactShadows(list) {
  if (!list.length) return null;
  const pos = [], local = [], half = [], idx = [];
  const quad = (cx, cz, c, s, hw, hd, m, k) => {
    const base = pos.length / 3;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lu = u * (hw + m), lv = v * (hd + m);
      pos.push(cx + lu * c + lv * s, 0.006, cz - lu * s + lv * c);
      local.push(lu, lv);
      half.push(hw, hd, k);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  for (const f0 of list) {
    const f = { ...f0, w: f0.w || f0.d || 0.3, d: f0.d || f0.w || 0.3 };   // some small things only know their depth
    // away from the nearest fixture
    const lx = (lampLineNear(f.x / CELL) + 0.5) * CELL, lz = (lampLineNear(f.z / CELL) + 0.5) * CELL;
    let ax = f.x - lx, az = f.z - lz;
    const far = Math.hypot(ax, az);
    if (far > 1e-3) { ax /= far; az /= far; } else { ax = 0; az = 1; }
    const push = Math.min(0.12, far * 0.05);
    const c = Math.cos(f.rot), s = Math.sin(f.rot);
    quad(f.x + ax * push, f.z + az * push, c, s, f.w / 2 + 0.04, f.d / 2 + 0.04, 0.36, f.k ?? 1);
    // the cast shadow: a strip from the foot away from the lamp, frame turned
    // so that its local +v runs away from the light
    const h = f.h || 0;
    if (h > 0.15 && far > 0.3) {
      const len = Math.min(1.8, h * far / Math.max(0.6, 3.1 - h));
      const hw = Math.max(f.w, f.d) * 0.42, hl = len / 2;
      const rot = Math.atan2(ax, az);                              // local +v (z) along (ax, az)
      quad(f.x + ax * hl, f.z + az * hl, Math.cos(rot), Math.sin(rot), hw, hl, 0.25, -(f.k ?? 1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aLocal', new THREE.Float32BufferAttribute(local, 2));
  g.setAttribute('aHalf', new THREE.Float32BufferAttribute(half, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, shadowMaterial());
  mesh.userData.keepMaterial = true;   // shared: disposal frees only the geometry
  mesh.renderOrder = 1;                // after the floor, before the things themselves
  return mesh;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
