import * as THREE from 'three';
import { CELL, CEIL_H, isLampCell, solidAtGlobal } from './world.js';

// ── conspace-rooms · chandeliers.js ─────────────────────────────────────────
// Grandmother's chandeliers, one under every ceiling fixture of the red
// rooms: the ice-glass kind every Soviet flat had, a frosted cylinder with
// the bulb in it, hung on a short rod, ringed by two tiers of thick
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
  float ice = n3(vL * 38.0) * 0.6 + n3(vL * 90.0) * 0.4;          // frozen, lumpy
  float fres = pow(1.0 - abs(dot(N, V)), 2.0);
  vec3 glass = mix(vec3(0.48, 0.42, 0.4), vec3(0.98, 0.93, 0.88), ice);
  vec3 col = glass * (0.45 + 0.9 * fres) + vec3(1.0, 0.62, 0.46) * 0.28;   // the bulb's warmth through it
  float glint = pow(n3(vL * 160.0 + vec3(0.0, 0.0, uTime * 0.2) + cameraPosition * 0.8), 22.0);
  col += vec3(1.0, 0.95, 0.9) * glint * 2.5;
  gl_FragColor = vec4(col, 0.8 + 0.15 * ice);
  #include <fog_fragment>
}`;

// the glass: two tiers of slabs round the core, each slab a little lumpy
function glassGeometry() {
  const parts = [], rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (const [ring, n, y0, len] of [[0.25, 16, -0.05, 0.24], [0.19, 13, -0.22, 0.22]]) {
    for (let k = 0; k < n; k++) {
      const h = len * (0.75 + rnd() * 0.5), w = 0.055 + rnd() * 0.025;
      const g = new THREE.BoxGeometry(w, h, 0.02, 2, 5, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rnd() - 0.5) * 0.008, p.getY(i) + (rnd() - 0.5) * 0.012, p.getZ(i) + (rnd() - 0.5) * 0.006);
      const a = k / n * Math.PI * 2 + (ring < 0.2 ? 0.2 : 0);
      g.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * ring, y0 - h / 2 + (rnd() - 0.5) * 0.04, Math.sin(a) * ring),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, (rnd() - 0.5) * 0.08)),
        new THREE.Vector3(1, 1, 1)));
      parts.push(g.toNonIndexed());
    }
  }
  const merged = mergeParts(parts);
  merged.computeVertexNormals();
  return merged;
}
// the core: the frosted cylinder, its rod and the cup at the ceiling
function coreGeometry() {
  const parts = [
    new THREE.CylinderGeometry(0.15, 0.15, 0.24, 20, 1, true).translate(0, 0.02, 0),
    new THREE.CircleGeometry(0.15, 20).rotateX(Math.PI / 2).translate(0, -0.1, 0),
    new THREE.CylinderGeometry(0.008, 0.008, 0.42, 6).translate(0, 0.35, 0),
    new THREE.CylinderGeometry(0.05, 0.07, 0.03, 16).translate(0, 0.56, 0),
  ].map(g => g.index ? g.toNonIndexed() : g);
  return mergeParts(parts);
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
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffe2cc, fog: true });   // lit from within
  const glass = new THREE.InstancedMesh(glassGeometry(), glassMat, MAX);
  const core = new THREE.InstancedMesh(coreGeometry(), coreMat, MAX);
  for (const m of [glass, core]) { m.frustumCulled = false; m.count = 0; m.visible = false; scene.add(m); }
  const HANG = CEIL_H - 0.62;                     // the core's centre: the cup sits on the ceiling
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
  let at = null;

  // the fixtures around (x, z): lamp cells that are open floor
  function place(x, z) {
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), R = Math.ceil(REACH / CELL);
    let n = 0;
    for (let j = cj - R; j <= cj + R && n < MAX; j++) for (let i = ci - R; i <= ci + R && n < MAX; i++) {
      if (!isLampCell(i, j) || solidAtGlobal(i, j)) continue;
      const px = (i + 0.5) * CELL, pz = (j + 0.5) * CELL;
      if (Math.hypot(px - x, pz - z) > REACH) continue;
      Q.setFromAxisAngle(P.set(0, 1, 0), ((i * 73856093) ^ (j * 19349663)) % 628 / 100);   // each turned its own way
      M.compose(P.set(px, HANG, pz), Q, S);
      glass.setMatrixAt(n, M); core.setMatrixAt(n, M);
      n++;
    }
    glass.count = core.count = n;
    glass.instanceMatrix.needsUpdate = core.instanceMatrix.needsUpdate = true;
  }

  return {
    // show: the red rooms are the world now
    update(time, camPos, show) {
      glass.visible = core.visible = show;
      if (!show) return;
      glassMat.uniforms.uTime.value = time;
      if (!at || Math.hypot(camPos.x - at.x, camPos.z - at.z) > 2.4) { at = { x: camPos.x, z: camPos.z }; place(at.x, at.z); }
    },
    dispose() { for (const m of [glass, core]) { scene.remove(m); m.geometry.dispose(); } glassMat.dispose(); coreMat.dispose(); },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
