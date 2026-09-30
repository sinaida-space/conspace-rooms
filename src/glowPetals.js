import * as THREE from 'three';

// ── conspace-rooms · glowPetals.js ─────────────────────────────────────────
// The light's way-marks. Where the fear scratched red arrows, the flooded
// rooms of acceptance float rose petals that glow from inside, cold pink,
// the way sea sparkle glows: a few at a time, riding the water from each
// mark toward the work still unseen, fading in and out as they go.
// A thin smoke lies over the water around the visitor.
//
// Two instanced draws (petals, their glow on the water) and two smoke
// sheets. The CPU only writes the matrices of the petals in use.

const PER_MARK = 3;            // petals riding off each mark
const RIDE = 2.4;              // metres a petal travels before it fades
const RIDE_TIME = 16;          // seconds for that ride
const PETAL = 0.15;            // petal length, metres: larger than life, so it reads from afar
const HALO = 0.9;              // its glow on the water, metres across
const SMOKE_SIZE = 40;         // metres, the sheet that follows the visitor
const SMOKE_LAYERS = [0.1, 0.32];   // heights over the water

const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

// ── petal ──────────────────────────────────────────────────────────────────
const PETAL_VERT = /* glsl */`
uniform float uTime;
attribute float aFade;        // 0..1: along its ride and with its mark
attribute float aSeed;
varying vec2 vUv;
varying float vFade, vSeed;
#include <fog_pars_vertex>
void main(){
  vUv = uv; vFade = aFade; vSeed = aSeed;
  vec3 p = position;
  p.y += 0.22 * dot(p.xz, p.xz);                        // cupped, like a real petal
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const PETAL_FRAG = /* glsl */`
uniform float uTime;
varying vec2 vUv;
varying float vFade, vSeed;
#include <fog_pars_fragment>
void main(){
  vec2 p = vUv - 0.5;
  // a rounded teardrop: wide at the outer edge (+y), narrowing to the base
  float w = mix(0.18, 0.46, smoothstep(-0.5, 0.25, p.y));
  float r = abs(p.x) / w + max(0.0, -p.y - 0.3) * 1.5;
  float notch = smoothstep(0.06, 0.0, abs(p.x)) * smoothstep(0.34, 0.5, p.y);   // the heart-shaped dent
  float body = smoothstep(1.0, 0.82, r) * smoothstep(0.5, 0.44, p.y + notch * 0.08);
  if (body * vFade < 0.02) discard;
  // the glow breathes, and a slow wave of it runs from base to edge
  float breath = 0.7 + 0.3 * sin(uTime * 1.3 + vSeed * 6.2832);
  float wave = 0.5 + 0.5 * sin(p.y * 9.0 - uTime * 2.2 + vSeed * 12.0);
  float rim = smoothstep(0.55, 1.0, r) + smoothstep(0.3, 0.5, p.y) * 0.6;
  float vein = smoothstep(0.03, 0.0, abs(p.x + sin(p.y * 7.0) * 0.015)) * 0.25;
  vec3 core = vec3(0.86, 0.14, 0.26);                   // the red of the corner rose and the tunnel
  vec3 lit  = vec3(1.00, 0.52, 0.58);                   // the light it gives, warmer toward the rim
  vec3 col = mix(core, lit, clamp(rim * 0.8 + wave * 0.35 + vein, 0.0, 1.0));
  col *= 0.9 + 0.8 * breath;                            // over 1 on the edges, so the bloom catches it
  gl_FragColor = vec4(col, body * vFade);
  #include <fog_fragment>
}`;

// ── its glow on the water ─────────────────────────────────────────────────
const HALO_VERT = /* glsl */`
attribute float aFade;
varying vec2 vUv;
varying float vFade;
#include <fog_pars_vertex>
void main(){
  vUv = uv; vFade = aFade;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const HALO_FRAG = /* glsl */`
uniform float uTime;
varying vec2 vUv;
varying float vFade;
#include <fog_pars_fragment>
void main(){
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 1.8) * 0.42 * vFade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(1.0, 0.36, 0.44, a);
  #include <fog_fragment>
}`;

// ── smoke over the water ──────────────────────────────────────────────────
const SMOKE_VERT = /* glsl */`
varying vec3 vWorld;
#include <fog_pars_vertex>
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SMOKE_FRAG = /* glsl */`
uniform float uTime, uLayer, uOn;
uniform vec3 uCenter;
varying vec3 vWorld;
#include <fog_pars_fragment>
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){                                      // three octaves are plenty for smoke this thin
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 3; k++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
void main(){
  // noise pinned to the world, so the sheet can follow the visitor unseen
  vec2 q = vWorld.xz * 0.32 + vec2(uTime * 0.035, uTime * 0.02) + uLayer * 7.3;
  q += vec2(fbm(q * 0.7 + uTime * 0.02), fbm(q * 0.7 - uTime * 0.015)) * 1.2;   // it curls on itself
  float dens = smoothstep(0.42, 0.78, fbm(q));
  float nearCam = smoothstep(0.6, 2.6, distance(vWorld, cameraPosition));        // never a flat sheet in the face
  float edge = 1.0 - smoothstep(${(SMOKE_SIZE * 0.3).toFixed(1)}, ${(SMOKE_SIZE * 0.48).toFixed(1)}, distance(vWorld.xz, uCenter.xz));
  float a = dens * nearCam * edge * mix(0.34, 0.22, uLayer) * uOn;
  if (a < 0.003) discard;
  gl_FragColor = vec4(0.95, 0.95, 0.98, a);             // pearl, the colour of the light's fog
  #include <fog_fragment>
}`;

export function createGlowPetals(scene) {
  const N = 28 * PER_MARK;                              // enough for the whole mark pool

  const petalGeo = new THREE.PlaneGeometry(1, 1, 6, 6).rotateX(-Math.PI / 2);
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  const seed = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  petalGeo.setAttribute('aFade', fade);
  petalGeo.setAttribute('aSeed', seed);
  const petalMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, ...fogUniforms() },
    vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  const petals = new THREE.InstancedMesh(petalGeo, petalMat, N);
  petals.frustumCulled = false; petals.renderOrder = 3; petals.visible = false;
  scene.add(petals);

  const haloGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  haloGeo.setAttribute('aFade', fade);                  // shares the petals' fade
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, ...fogUniforms() },
    vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
    transparent: true, depthWrite: false, fog: true,
  });
  const halos = new THREE.InstancedMesh(haloGeo, haloMat, N);
  halos.frustumCulled = false; halos.renderOrder = 2; halos.visible = false;
  scene.add(halos);

  const smokeGeo = new THREE.PlaneGeometry(SMOKE_SIZE, SMOKE_SIZE).rotateX(-Math.PI / 2);
  const smoke = SMOKE_LAYERS.map((h, i) => {
    const m = new THREE.Mesh(smokeGeo, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLayer: { value: i }, uOn: { value: 0 }, uCenter: { value: new THREE.Vector3() }, ...fogUniforms() },
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    }));
    m.frustumCulled = false; m.renderOrder = 4 + i; m.visible = false;
    m.userData.h = h;
    scene.add(m);
    return m;
  });

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(),
    V = new THREE.Vector3(), S = new THREE.Vector3(), SH = new THREE.Vector3(HALO, HALO, HALO);
  let smokeOn = 0;

  return {
    // marks: the soul path's pool; on: acceptance; player: {x, y} on the floor plan
    // obstacles: [{ x, z, r }] things standing in the water; a petal that
    // would ride into one is carried round its edge instead
    // trail: the petals without the smoke, on the dry floor of fear and of
    // grandmother's rooms, riding the same way the marks point (#53)
    update(dt, time, marks, water, on, player, obstacles = [], trail = false) {
      petalMat.uniforms.uTime.value = time;
      haloMat.uniforms.uTime.value = time;
      petals.visible = halos.visible = on || trail;
      smokeOn += ((on ? 1 : 0) - smokeOn) * Math.min(1, dt * 0.5);   // the smoke gathers and clears slowly
      for (const s of smoke) {
        s.visible = smokeOn > 0.01;
        if (!s.visible) continue;
        const u = s.material.uniforms;
        u.uTime.value = time; u.uOn.value = smokeOn;
        s.position.set(player.x, (water.level ?? 0.1) + s.userData.h, player.y);
        u.uCenter.value.copy(s.position);
      }
      if (!on && !trail) return;
      let n = 0;
      for (const m of marks) {
        if (!m.visible) continue;
        const o = m.material.opacity;
        const nx = Math.sin(m.rotation.y), nz = Math.cos(m.rotation.y);   // off the wall, into the corridor
        const sg = Math.sign(m.scale.x) || 1;
        const ax = nz * sg, az = -nx * sg;                                 // the way to go
        const ms = (m.position.x * 7.1 + m.position.z * 3.7) % 1;
        for (let k = 0; k < PER_MARK && n < fade.count; k++) {
          const i = n;
          seed.array[i] = (ms * 13.7 + k * 0.37) % 1;                       // its own, whichever slot it lands in
          const u = (time / RIDE_TIME + ms + k / PER_MARK) % 1;           // riding on, then again
          const off = 0.45 + 0.22 * k + 0.06 * Math.sin(time * 0.4 + k * 2.1 + ms * 6.28);
          let x = m.position.x + nx * off + ax * (u - 0.2) * RIDE;
          let z = m.position.z + nz * off + az * (u - 0.2) * RIDE;
          for (const o of obstacles) {                                      // round, never through
            const ex = x - o.x, ez = z - o.z, d = Math.hypot(ex, ez), keep = o.r + PETAL * 0.9;
            if (d < keep) { const k = keep / (d || 1e-3); x = o.x + (d ? ex : nx) * k; z = o.z + (d ? ez : nz) * k; }
          }
          const wy = on ? water.heightAt(x, z) : 0;                          // no water yet: the floor
          if (wy == null) continue;                                         // no water under it here
          const f = o * Math.sin(u * Math.PI);
          const bob = Math.sin(time * 1.6 + seed.array[i] * 20) * 0.004;
          E.set(Math.sin(time * 0.9 + k) * 0.08, time * 0.12 * (k - 1 || 0.6) + seed.array[i] * 6.28, Math.cos(time * 0.8 + k) * 0.06);
          Q.setFromEuler(E);
          const sz = PETAL * (0.8 + 0.4 * seed.array[i]);
          M.compose(V.set(x, wy + 0.02 + bob, z), Q, S.set(sz * 0.8, sz, sz));
          petals.setMatrixAt(i, M);
          M.compose(V.set(x, wy + 0.01, z), Q.identity(), SH);
          halos.setMatrixAt(i, M);
          fade.array[i] = f;
          n++;
        }
      }
      for (let i = n; i < fade.count; i++) fade.array[i] = 0;
      petals.count = halos.count = n;
      petals.instanceMatrix.needsUpdate = halos.instanceMatrix.needsUpdate = true;
      fade.needsUpdate = seed.needsUpdate = true;
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
