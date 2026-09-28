import * as THREE from 'three';
import { CEIL_H, CELL, solidAtGlobal } from './world.js';

// ── conspace-rooms · water.js ───────────────────────────────────────────────
// In the acceptance stage the floor goes under water. Puddles first, ankle
// deep once every work has been seen; the whole sheet breathes with a slow
// tide. The surface is never still: a broad swell with fine wind ripples
// crossing it, rings from footsteps and from drops off the ceiling. Looking
// down it is clear and the stone wobbles beneath it (the floor shader does
// that, see materials.js); toward the horizon it turns into a mirror. On the
// high tier the mirror is a real one, a half resolution pass; elsewhere it is
// the pearl of the fog and soft streaks of the lamps. The caustics the water
// throws on walls, floor and ceiling live in materials.js, driven by uWater
// (set here through atmo.setWater).

const TIDE_PERIOD = 10;        // seconds per breath of the tide
const RIPPLES = 12;            // rings alive at once (ring buffer)
const RING_SPEED = 0.6;        // m/s the ring front travels
const PLANE = 60;              // metres of water plane around the visitor

// Shared by the water and the floor under it.
// The puddle mask: two octaves of value noise on an integer hash (so the
// shader and heightAt() agree), quintic between lattice points so no cell
// corner ever shows, the second octave turned, the whole field bent by a
// slow warp so the rims wander like spilt water. The wet threshold falls
// with progress, which the shaders read back from level / accept; the rims
// creep a little in and out with the tide.
export const WATER_GLSL = /* glsl */`
float waterHash(vec2 c){
  highp uvec2 q = uvec2(ivec2(c));   // highp: a 16-bit int would wrap the hash on some phones
  highp uint h = q.x * 1597334677u ^ q.y * 3812015801u;
  h = (h ^ (h >> 16)) * 2246822519u;
  h ^= h >> 13;
  return float(h >> 8) / 16777216.0;
}
// value noise, quintic fade; .x value, .yz its gradient
vec3 waterNoised(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = waterHash(i), b = waterHash(i + vec2(1.0, 0.0));
  float c = waterHash(i + vec2(0.0, 1.0)), d = waterHash(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * (vec2(k1, k2) + k4 * u.yx));
}
float waterNoise(vec2 xz){
  vec2 q = vec2(0.87 * xz.x - 0.5 * xz.y, 0.5 * xz.x + 0.87 * xz.y) * 0.3;   // turned 30°: no rim runs along the walls
  q += (vec2(waterNoised(q * 0.45 + 3.7).x, waterNoised(q * 0.45 + 11.3).x) - 0.5) * 2.6;   // the slow warp
  vec2 r = vec2(0.8 * q.x + 0.6 * q.y, -0.6 * q.x + 0.8 * q.y) * 2.3 + 17.0;
  return waterNoised(q).x * 0.65 + waterNoised(r).x * 0.35;
}
// progress 0..1 recovered from the level (0.03 at entry, 0.15 at the end)
float waterThreshold(vec4 w){
  float prog = clamp((w.x / max(w.y, 1e-3) - 0.03) / 0.12, 0.0, 1.0);
  return mix(0.62, -0.1, prog);
}
float waterMask(vec2 xz, vec4 w){               // 1 under standing water, 0 on dry stone
  float thr = waterThreshold(w);
  return smoothstep(thr, thr + 0.05, waterNoise(xz));
}
float waterDamp(vec2 xz, vec4 w){               // a little wider: the damp round every puddle
  float thr = waterThreshold(w);
  return smoothstep(thr - 0.07, thr + 0.01, waterNoise(xz));
}
// Slope of the surface (dh/dx, dh/dz): a broad slow swell and, over it, fine
// wind ripples from scrolling noise, each octave turned and drifting its own
// way. oct 0: the swell only (the floor on the low tier). calm (w) quiets it,
// never to glass.
vec2 waterWaves(vec2 p, float t, float calm, int oct){
  vec2 g = vec2(0.8, 0.6) * 0.012 * cos(dot(vec2(0.8, 0.6), p) * 1.3 + t * 0.7)
         + vec2(-0.6, 0.8) * 0.009 * cos(dot(vec2(-0.6, 0.8), p) * 1.9 + t * 0.9);
  g *= 1.0 - 0.8 * calm;
  if (oct < 1) return g;
  vec2 wind = waterNoised(p * 4.0 + vec2(t * 0.9, t * 0.35)).yz * 4.0 * 0.0045;
  // turned 53°: the gradient comes back through the transpose
  vec2 q = vec2(0.6 * p.x - 0.8 * p.y, 0.8 * p.x + 0.6 * p.y);
  vec2 n2 = waterNoised(q * 9.0 - vec2(t * 1.4, -t * 0.8)).yz;
  wind += vec2(0.6 * n2.x + 0.8 * n2.y, -0.8 * n2.x + 0.6 * n2.y) * 9.0 * 0.0016;
  if (oct > 2) {
    vec2 s = vec2(-0.28 * p.x + 0.96 * p.y, -0.96 * p.x - 0.28 * p.y);
    vec2 n3 = waterNoised(s * 19.0 + vec2(t * 2.1, t * 1.2)).yz;
    wind += vec2(-0.28 * n3.x - 0.96 * n3.y, 0.96 * n3.x - 0.28 * n3.y) * 19.0 * 0.0006;
  }
  return g + wind * (1.0 - 0.6 * calm);
}
`;

// the same mask in JS (Math.imul wraps like uint multiplication)
function waterHash(ix, iz) {
  let h = (Math.imul(ix, 1597334677) ^ Math.imul(iz, 3812015801 | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519 | 0) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return (h >>> 8) / 16777216;
}
function waterNoise1(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = waterHash(ix, iz), b = waterHash(ix + 1, iz), c = waterHash(ix, iz + 1), d = waterHash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function waterNoise(x, z) {
  let qx = (0.87 * x - 0.5 * z) * 0.3, qz = (0.5 * x + 0.87 * z) * 0.3;
  const wx = waterNoise1(qx * 0.45 + 3.7, qz * 0.45 + 3.7) - 0.5, wz = waterNoise1(qx * 0.45 + 11.3, qz * 0.45 + 11.3) - 0.5;
  qx += wx * 2.6; qz += wz * 2.6;
  const rx = (0.8 * qx + 0.6 * qz) * 2.3 + 17, rz = (-0.6 * qx + 0.8 * qz) * 2.3 + 17;
  return waterNoise1(qx, qz) * 0.65 + waterNoise1(rx, rz) * 0.35;
}
const smooth = x => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
uniform mat4 uTexMatrix;
varying vec3 vWorldPos;
varying vec4 vMirror;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vMirror = uTexMatrix * wp;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform vec4  uWater;              // level (a tenth of the tide), accept, phase, calm: as the world shaders get it
uniform float uTime;
uniform int   uTier;
uniform vec4  uRipples[${RIPPLES}];   // x, z, start time, strength
uniform vec3  uFinale;             // rose arch xz, 1 when it stands: the water round it goes still
uniform vec4  uHaze[6];            // the fixtures in sight (materials.js): xz of each panel, w = strength
uniform sampler2D uMirror;
uniform float uMirrorOn;
varying vec3 vWorldPos;
varying vec4 vMirror;
${WATER_GLSL}

#define PEARL vec3(1.0, 0.93, 0.86)     // the lamps, as the water gives them back: warm pearl
#define PANEL_Y ${(CEIL_H - 0.05).toFixed(2)}

// Rings: a soft packet of a few crests round the front, gaussian in profile,
// widening and fading as it travels. Returns the slope it adds.
vec2 rings(vec2 p){
  vec2 r = vec2(0.0);
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 rp = uRipples[i];
    float age = uTime - rp.z;
    if (rp.w <= 0.0 || age < 0.0 || age > 3.5) continue;
    vec2 d = p - rp.xy;
    float dist = length(d);
    float sig = 0.07 + 0.08 * age;
    float x = dist - age * ${RING_SPEED.toFixed(2)};
    if (abs(x) > sig * 3.0) continue;
    float env = exp(-x * x / (2.0 * sig * sig));
    const float K = 40.0;                                   // ~16 cm between crests
    float amp = rp.w * 0.0022 * exp(-age * 1.1) / sqrt(1.0 + dist * 2.0);
    float dh = amp * env * (-K * sin(K * x) - x / (sig * sig) * cos(K * x));
    r += d / max(dist, 1e-3) * dh * smoothstep(0.0, 0.1, dist);
  }
  return r;
}

// bright things mirrored stay soft: luminance eases toward a cap
vec3 softCap(vec3 c, float cap){
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  float knee = cap * 0.6;
  if (l <= knee) return c;
  return c * (knee + (cap - knee) * (1.0 - exp(-(l - knee) / (cap - knee)))) / l;
}

void main(){
  vec2 p = vWorldPos.xz;
  float thr = waterThreshold(uWater);
  float n = waterNoise(p);
  if (n < thr - 0.012) discard;
  float water = smoothstep(thr, thr + 0.05, n);
  float mx = (n - thr - 0.003) / 0.0025;
  float meniscus = exp(-mx * mx);   // a hairline of light where the water meets the stone

  float still = uFinale.z > 0.5 ? smoothstep(4.0, 6.0, distance(p, uFinale.xy)) : 1.0;   // the mirror under the arch is still
  vec2 s = (waterWaves(p, uWater.z, uWater.w, uTier > 0 ? 3 : 1) + rings(p) * (1.0 - 0.5 * uWater.w)) * still;
  vec3 N = normalize(vec3(-s.x, 1.0, -s.y));
  vec3 V = normalize(cameraPosition - vWorldPos);
  float cosT = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);          // Schlick: clear looking down, a mirror toward the horizon

  #ifdef USE_FOG
    vec3 fogC = fogColor;
  #else
    vec3 fogC = vec3(0.84, 0.8, 0.78);
  #endif

  // what the surface mirrors
  vec3 R = reflect(-V, N);
  vec3 refl;
  if (uMirrorOn > 0.5) {
    vec4 mc = vMirror;
    mc.xy += s * 0.9 * mc.w;                                // ripples bend the mirror
    refl = texture2DProj(uMirror, mc).rgb;
  } else {
    // fake: the pearl of the fog, a touch brighter looking up, and each lamp
    // in sight a soft upright streak, the way a panel stretches on moving water
    refl = fogC * mix(0.98, 1.1, clamp(R.y, 0.0, 1.0));
    vec3 I = normalize(-V + vec3(s.x, 0.0, s.y) * 2.0);
    for (int i = 0; i < 6; i++) {
      if (uHaze[i].w <= 0.0) continue;
      vec3 D = normalize(vec3(uHaze[i].x, 2.0 * uWater.x - PANEL_Y, uHaze[i].z) - cameraPosition);   // the panel seen below the surface
      vec3 e = I - D;
      float eh = dot(e, normalize(cross(D, vec3(0.0, 1.0, 0.0)))), ev = e.y;
      refl += PEARL * min(uHaze[i].w, 1.0) * 0.3 * exp(-eh * eh * 700.0 - ev * ev * 25.0);
    }
  }
  refl = softCap(refl, 0.7);

  // glitter: the fine ripples catch the panels overhead in many small sparks,
  // a broken streak rather than one disc
  vec3 spark = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    if (uHaze[i].w <= 0.0) continue;
    vec3 L = normalize(vec3(uHaze[i].x, PANEL_Y, uHaze[i].z) - vWorldPos);
    spark += PEARL * min(uHaze[i].w, 1.0) * pow(max(dot(N, normalize(L + V)), 0.0), 1400.0);
  }
  // only the facets turned just so flash: two turned noises multiplied, so
  // the sparks are small and ragged, never a grid of squares
  vec2 g1 = vec2(0.8 * p.x + 0.6 * p.y, -0.6 * p.x + 0.8 * p.y) * 38.0 + vec2(uWater.z * 3.0, -uWater.z * 2.0);
  vec2 g2 = vec2(0.26 * p.x - 0.97 * p.y, 0.97 * p.x + 0.26 * p.y) * 45.0 - vec2(uWater.z * 2.2, uWater.z * 2.7);
  float glit = waterNoised(g1).x * waterNoised(g2).x;
  spark = softCap(spark * smoothstep(0.3, 0.75, glit) * 2.0, 0.3);

  // body: clear at the rim, the faintest aqua pearl where it is deeper
  float absorb = 1.0 - exp(-uWater.x * water * 12.0);
  vec3 bodyCol = fogC * vec3(0.93, 1.02, 1.0);
  float aBody = water * absorb * 0.22;
  float aRefl = F * water * (1.0 - aBody);
  float aRim = meniscus * 0.14;
  float a = aBody + aRefl + aRim * (1.0 - aBody - aRefl);
  vec3 col = bodyCol * aBody + refl * aRefl + (fogC * 1.08 + 0.06) * aRim * (1.0 - aBody - aRefl) + spark * water;   // premultiplied: the floor keeps (1 − a)
  col += fogC * water * clamp(dot(s, vec2(0.6, 0.8)) * 1.6, -0.08, 0.08);   // slopes catch the light on one side: the surface shimmers, rings read even looking straight down
  a *= uWater.y; col *= uWater.y;

  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogF = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    col = mix(col, fogColor * a, fogF);
  #endif
  gl_FragColor = vec4(col, a);
}
`;

export function createWater({ scene, renderer, camera, quality, stage, atmo }) {
  const uniforms = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
    uWater: { value: new THREE.Vector4() },
    uTime: { value: 0 },
    uTier: { value: quality.tier },
    uRipples: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
    uFinale: { value: new THREE.Vector3() },
    uHaze: atmo?.haze ?? { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -100, 0, 0)) },   // shared with the world
    uMirror: { value: null },
    uMirrorOn: { value: 0 },
    uTexMatrix: { value: new THREE.Matrix4() },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, premultipliedAlpha: true, depthWrite: false, fog: true,
  });
  const geo = new THREE.PlaneGeometry(PLANE, PLANE, 2, 2).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;          // first of the see-through things: dust and petals draw over it
  mesh.visible = false;
  scene.add(mesh);

  // a falling drop: a thin sprite from the ceiling to the surface
  const drop = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xf4ebe6, transparent: true, opacity: 0.75, depthWrite: false, fog: true }));
  drop.scale.set(0.012, 0.09, 1);
  drop.visible = false;
  scene.add(drop);
  let dropT = -1, dropX = 0, dropZ = 0, nextDrip = 3 + Math.random() * 3;

  // mirror (tier 2 only)
  let rt = null;
  const mirrorCam = new THREE.PerspectiveCamera();
  const size = new THREE.Vector2();
  const tmpV = new THREE.Vector3(), tmpT = new THREE.Vector3(), tmpUp = new THREE.Vector3();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const dropMirror = () => {
    if (rt) { rt.dispose(); rt = null; }
    uniforms.uMirror.value = null;
    uniforms.uMirrorOn.value = 0;
  };

  let head = 0, phase = 0, stillFor = 0, prog = 0;
  const api = {
    level: 0, tide: 0, calm: 0,
    heightAt(x, z) {
      if (api.level <= 0.001) return null;
      const w = uniforms.uWater.value;
      const p = Math.max(0, Math.min(1, (w.x / Math.max(w.y, 1e-3) - 0.03) / 0.12));
      const thr = 0.62 + (-0.1 - 0.62) * p;
      return waterNoise(x, z) > thr + 0.025 ? api.level : null;   // the middle of the rim
    },
    addRipple(x, z, strength = 1) {
      if (!mesh.visible) return;
      uniforms.uRipples.value[head].set(x, z, uniforms.uTime.value, Math.max(0, Math.min(1.5, strength)));
      head = (head + 1) % RIPPLES;
    },

    update(dt, elapsed, player, soul, audio) {
      const accept = stage.weights().accept;
      api.tide = Math.sin(elapsed * Math.PI * 2 / TIDE_PERIOD);
      const target = soul && soul.total ? soul.seen.size / soul.total : 0;
      prog += (target - prog) * Math.min(1, dt * 0.5);          // a newly seen work raises the water slowly
      const base = accept < 0.001 ? 0 : (0.03 + 0.12 * smooth(prog)) * accept;
      api.level = base + 0.02 * api.tide * accept;
      // the shaders get the level with a tenth of the tide: the whole tide would
      // swallow the entry puddles every other breath; this way the rims only creep
      const shaderLevel = base + 0.002 * api.tide * accept;
      // calm: stand still ~2 s and the surface settles; walking breaks it quickly
      const speed = player ? player.vel.length() : 0;
      stillFor = speed < 0.05 ? stillFor + dt : 0;
      api.calm = stillFor > 0 ? Math.min(1, api.calm + dt / 2) : Math.max(0, api.calm - dt * 2.5);
      phase += dt * (1 - 0.6 * api.calm);                        // waves and caustics slow down on still water

      uniforms.uWater.value.set(shaderLevel, accept, phase, api.calm);
      uniforms.uTime.value = elapsed;
      uniforms.uTier.value = quality.tier;
      atmo?.setWater?.(shaderLevel, accept, phase, api.calm);
      audio?.setWater?.({ level: api.level, tide: api.tide, calm: api.calm });

      mesh.visible = accept >= 0.001;
      if (!mesh.visible) { drop.visible = false; dropT = -1; if (rt) dropMirror(); return; }
      mesh.position.set(Math.round(camera.position.x), api.level, Math.round(camera.position.z));
      const f = soul?.finale?.spot;
      if (f) uniforms.uFinale.value.set(f.x, f.z, 1); else uniforms.uFinale.value.z = 0;

      // drips: only in the stage itself, only once there is water to land in
      if (dropT >= 0) {
        dropT += dt / 0.6;
        const y = CEIL_H - 0.05 - (CEIL_H - api.level) * dropT * dropT;   // falling, accelerating
        drop.position.set(dropX, y, dropZ);
        if (dropT >= 1) {
          drop.visible = false; dropT = -1;
          api.addRipple(dropX, dropZ, 0.6);
          const dx = dropX - camera.position.x, dz = dropZ - camera.position.z, dist = Math.hypot(dx, dz);
          audio?.drip?.(dx / (dist || 1), dz / (dist || 1), dist);
        }
      } else if (stage.stage === 2 && api.level > 0.01 && (nextDrip -= dt) <= 0) {
        nextDrip = 2.5 + Math.random() * 3.5;
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
          const x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
          if (solidAtGlobal(Math.floor(x / CELL), Math.floor(z / CELL)) || api.heightAt(x, z) === null) continue;
          dropX = x; dropZ = z; dropT = 0;
          drop.position.set(x, CEIL_H - 0.05, z);
          drop.visible = true;
          break;
        }
      }
    },

    // the planar mirror, rendered just before the frame itself
    beforeRender() {
      if (quality.tier < 2 || !mesh.visible) { if (rt) dropMirror(); return; }
      renderer.getDrawingBufferSize(size);
      const w = Math.max(1, Math.floor(size.x / 2)), h = Math.max(1, Math.floor(size.y / 2));
      if (!rt) {
        rt = new THREE.WebGLRenderTarget(w, h);
        rt.texture.colorSpace = THREE.SRGBColorSpace;
        rt.texture.generateMipmaps = false;
      } else if (rt.width !== w || rt.height !== h) rt.setSize(w, h);

      // the camera reflected across y = level
      const L = api.level;
      camera.updateMatrixWorld();
      tmpV.setFromMatrixPosition(camera.matrixWorld);
      mirrorCam.position.set(tmpV.x, 2 * L - tmpV.y, tmpV.z);
      camera.getWorldDirection(tmpT).add(tmpV);
      tmpT.y = 2 * L - tmpT.y;
      tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      tmpUp.y = -tmpUp.y;
      mirrorCam.up.copy(tmpUp);
      mirrorCam.lookAt(tmpT);
      mirrorCam.near = camera.near; mirrorCam.far = camera.far;
      mirrorCam.aspect = camera.aspect; mirrorCam.fov = camera.fov;
      mirrorCam.layers.mask = camera.layers.mask;
      mirrorCam.updateProjectionMatrix();
      mirrorCam.updateMatrixWorld();
      uniforms.uTexMatrix.value.copy(bias).multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);

      // oblique near plane on the surface: nothing below the water renders into the mirror
      plane.set(tmpV.set(0, 1, 0), -L).applyMatrix4(mirrorCam.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const P = mirrorCam.projectionMatrix.elements;
      q.set((Math.sign(clip.x) + P[8]) / P[0], (Math.sign(clip.y) + P[9]) / P[5], -1, (1 + P[10]) / P[14]);
      clip.multiplyScalar(2 / clip.dot(q));
      P[2] = clip.x; P[6] = clip.y; P[10] = clip.z + 1 - 0.003; P[14] = clip.w;
      mirrorCam.projectionMatrixInverse.copy(mirrorCam.projectionMatrix).invert();

      const prevTarget = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate;
      mesh.visible = false; uniforms.uMirrorOn.value = 0;
      renderer.shadowMap.autoUpdate = false;                   // the shadows of this frame come with the main pass
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, mirrorCam);
      renderer.setRenderTarget(prevTarget);
      renderer.shadowMap.autoUpdate = prevShadow;
      mesh.visible = true;
      uniforms.uMirror.value = rt.texture;
      uniforms.uMirrorOn.value = 1;
    },

    dispose() {
      dropMirror();
      scene.remove(mesh, drop);
      geo.dispose(); mat.dispose(); drop.material.dispose();
    },
  };
  return api;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
