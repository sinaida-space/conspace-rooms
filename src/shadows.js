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
// A footprint: { x, z, w, d, rot, k } (rot as ward.js orientedBox: local X
// is w; k darkness, 1 by default).

const VERT = /* glsl */`
attribute vec2 aLocal;        // metres from the footprint's centre, in its own frame
attribute vec3 aHalf;         // half width, half depth, darkness
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
varying vec2 vLocal;
varying vec3 vHalf;
varying float vDist;
void main(){
  vec2 q = abs(vLocal) - vHalf.xy;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);     // rounded-rectangle distance
  float core = 1.0 - smoothstep(-0.06, 0.05, sd);                // dense right under it
  float soft = 1.0 - smoothstep(-0.1, 0.34, sd);                 // and a wide soft falloff
  float k = (0.38 * core + 0.42 * soft) * vHalf.z * (1.0 - smoothstep(12.0, 24.0, vDist));
  gl_FragColor = vec4(vec3(1.0 - k), 1.0);                       // multiplied into the floor
}`;

let material = null;
function shadowMaterial() {
  return material ??= new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
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
  for (const f of list) {
    // away from the nearest fixture: the further off it, the longer the shadow
    const lx = (lampLineNear(f.x / CELL) + 0.5) * CELL, lz = (lampLineNear(f.z / CELL) + 0.5) * CELL;
    let ax = f.x - lx, az = f.z - lz;
    const far = Math.hypot(ax, az);
    if (far > 1e-3) { ax /= far; az /= far; }
    const push = Math.min(0.22, far * 0.08);
    const cx = f.x + ax * push, cz = f.z + az * push;
    const c = Math.cos(f.rot), s = Math.sin(f.rot);
    const hw = f.w / 2 + 0.04, hd = f.d / 2 + 0.04, m = 0.36;
    const base = pos.length / 3;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lu = u * (hw + m), lv = v * (hd + m);
      pos.push(cx + lu * c + lv * s, 0.006, cz - lu * s + lv * c);
      local.push(lu, lv);
      half.push(hw, hd, f.k ?? 1);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
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
