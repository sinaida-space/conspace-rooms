import * as THREE from 'three';
import { CELL, CEIL_H, isChandelierCell, solidAtGlobal } from './world.js';

// ── conspace-rooms · chandeliers.js ─────────────────────────────────────────
// Grandmother's chandeliers, one to every stretch of corridor in the red
// rooms (world.js isChandelierCell), the only lights there: the ice-glass kind every Soviet flat had, a frosted cylinder with
// the bulb in it, flush on the ceiling, ringed by two tiers of thick
// textured glass slabs of uneven length that catch the light. Built once;
// one instanced draw for the glass and one for the glowing core, moved to
// the fixtures around the visitor as they walk.

const MAX = 48, REACH = 17;   // instances; metres around the visitor

const GLASS_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec3 vN, vW, vL;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = wp.xyz; vL = position;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
// Ice glass: bright where the surface turns away (fresnel), a lumpy
// frozen texture, a warm glow from the bulb inside, and a few glints that
// come and go as the visitor moves.
const GLASS_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
varying vec3 vN, vW, vL;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float ice = n3(vL * 38.0) * 0.5 + n3(vL * 90.0) * 0.3 + n3(vL * vec3(60.0, 9.0, 60.0)) * 0.2;   // frozen, lumpy, streaked downward
  float fres = pow(1.0 - abs(dot(N, V)), 2.0);
  float face = pow(max(dot(N, normalize(vec3(0.3, 0.8, 0.2))), 0.0), 6.0);   // a facet turned to the bulb flares
  vec3 glass = mix(vec3(0.3, 0.26, 0.26), vec3(0.98, 0.93, 0.88), smoothstep(0.25, 0.85, ice));
  vec3 col = glass * (0.35 + 1.1 * fres) + vec3(1.0, 0.62, 0.46) * (0.18 + 0.5 * face);   // the bulb's warmth through it
  float glint = pow(n3(vL * 160.0 + vec3(0.0, 0.0, uTime * 0.2) + cameraPosition * 0.8), 22.0);
  col += vec3(1.0, 0.95, 0.9) * glint * 2.5;
  gl_FragColor = vec4(col, 0.8 + 0.15 * ice);
  #include <fog_fragment>
}`;

// the glass: three tiers of icicle slabs round the core. Each slab is thick
// at the top and thins downward to a ragged, uneven tip; its faces are
// pushed about like melted ice, and the flat facets that leaves catch the
// light like cut glass.
function glassGeometry() {
  const parts = [], rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const lump = (x, y) => Math.sin(x * 91 + y * 37) * 0.5 + Math.sin(x * 23 - y * 61) * 0.5;
  for (const [ring, n, y0, len] of [[0.25, 18, -0.02, 0.2], [0.21, 15, -0.14, 0.22], [0.15, 11, -0.26, 0.2]]) {
    for (let k = 0; k < n; k++) {
      const h = len * (0.7 + rnd() * 0.6), w = 0.05 + rnd() * 0.03, t = 0.018 + rnd() * 0.012, seed = rnd() * 10;
      const g = new THREE.BoxGeometry(w, h, t, 3, 8, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const v = Math.min(1, Math.max(0, (y + h / 2) / h));    // 0 at the tip, 1 at the top
        const taper = 0.45 + 0.55 * Math.pow(v, 0.6);
        x *= taper; z *= 0.5 + 0.5 * v;
        if (v < 0.02) y += (rnd() - 0.2) * h * 0.18;            // a ragged, uneven tip
        x += lump(y * 3 + seed, x * 5) * 0.004;
        z += lump(x * 7 + seed, y * 4) * 0.007;
        p.setXYZ(i, x, y, z);
      }
      const a = k / n * Math.PI * 2 + ring * 3;
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * ring, y0 - h / 2 + (rnd() - 0.5) * 0.05, Math.sin(a) * ring),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.1, -a + Math.PI / 2, (rnd() - 0.5) * 0.1)),
        new THREE.Vector3(1, 1, 1)));
      parts.push(g.toNonIndexed());
    }
  }
  const merged = mergeParts(parts);
  merged.computeVertexNormals();                                 // non-indexed: flat facets, as cut glass
  return merged;
}
// the core: a frosted cylinder with the bulb in it (glass shader, glowing)
function coreGeometry() {
  const g = new THREE.CylinderGeometry(0.13, 0.13, 0.22, 24, 1, true).translate(0, 0.02, 0).toNonIndexed();
  const b = new THREE.CircleGeometry(0.13, 24).rotateX(Math.PI / 2).translate(0, -0.09, 0).toNonIndexed();
  return mergeParts([g, b]);
}
// the brass plate it is screwed to, flush with the ceiling: no rod
function mountGeometry() {
  return mergeParts([new THREE.CylinderGeometry(0.16, 0.15, 0.02, 24).translate(0, 0.14, 0).toNonIndexed()]);
}
function mergeParts(parts) {
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count; g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return m;
}

export function createChandeliers(scene) {
  const glassMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, fog: true, transparent: true, side: THREE.DoubleSide,
  });
  // the frosted core: bright in the middle where the bulb is, dimmer to its rims
  const coreMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), fog: true,
    vertexShader: GLASS_VERT,
    fragmentShader: `#include <common>
#include <fog_pars_fragment>
varying vec3 vN, vW, vL;
void main(){
  float mid = 1.0 - smoothstep(0.0, 0.12, abs(vL.y - 0.02));
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 1.5);
  vec3 col = vec3(1.0, 0.84, 0.7) * (0.55 + 0.6 * mid) * (1.0 - 0.45 * rim);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`,
  });
  const mountMat = new THREE.MeshBasicMaterial({ color: 0x6e5528, fog: true });   // brass in the dark
  const glass = new THREE.InstancedMesh(glassGeometry(), glassMat, MAX);
  const core = new THREE.InstancedMesh(coreGeometry(), coreMat, MAX);
  const mount = new THREE.InstancedMesh(mountGeometry(), mountMat, MAX);
  const all = [glass, core, mount];
  for (const m of all) { m.frustumCulled = false; m.count = 0; m.visible = false; scene.add(m); }
  const SIZE = 0.72;                              // smaller than a real one: the corridors are narrow
  const HANG = CEIL_H - 0.15 * SIZE;              // the plate sits on the ceiling
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(SIZE, SIZE, SIZE), P = new THREE.Vector3();
  let at = null;

  // the fixtures around (x, z): lamp cells that are open floor
  function place(x, z) {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), R = Math.ceil(REACH / CELL);
    let n = 0;
    for (let j = cj - R; j <= cj + R && n < MAX; j++) for (let i = ci - R; i <= ci + R && n < MAX; i++) {
      if (!isChandelierCell(i, j) || solidAtGlobal(i, j)) continue;
      const px = (i + 0.5) * CELL, pz = (j + 0.5) * CELL;
      if (Math.hypot(px - x, pz - z) > REACH) continue;
      Q.setFromAxisAngle(P.set(0, 1, 0), ((i * 73856093) ^ (j * 19349663)) % 628 / 100);   // each turned its own way
      M.compose(P.set(px, HANG, pz), Q, S);
      for (const m of all) m.setMatrixAt(n, M);
      n++;
    }
    for (const m of all) { m.count = n; m.instanceMatrix.needsUpdate = true; }
  }

  return {
    // show: the red rooms are the world now
    update(time, camPos, show) {
      for (const m of all) m.visible = show;
      if (!show) return;
      glassMat.uniforms.uTime.value = time;
      if (!at || Math.hypot(camPos.x - at.x, camPos.z - at.z) > 2.4) { at = { x: camPos.x, z: camPos.z }; place(at.x, at.z); }
    },
    dispose() { for (const m of all) { scene.remove(m); m.geometry.dispose(); } glassMat.dispose(); coreMat.dispose(); mountMat.dispose(); },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
