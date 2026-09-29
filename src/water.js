import * as THREE from 'three';
import { CEIL_H, CELL, solidAtGlobal } from './world.js';

// ── conspace-rooms · water.js ───────────────────────────────────────────────
// In the acceptance stage the floor goes under water. Puddles first, ankle
// deep once every work has been seen; the whole sheet breathes with a slow
// tide. The surface is never still: a broad swell with fine wind ripples
// crossing it, rings from footsteps and from drops off the ceiling. Looking
// down it is clear, toward the horizon it turns into a mirror. On tiers 1-2
// it is real water: the frame is drawn first without it, and the water bends
// that picture (refraction), dims it by the depth it looks through
// (Beer-Lambert) and lays the lamps and candles on it in streaks; its surface
// is a baked ripple field scrolled in two layers. On the high tier the mirror
// is a real one, a half resolution pass; elsewhere it is the pearl above. On
// tier 0 the cheap water stays (the floor shader wobbles the stone under
// it). The caustics the water
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

// ── the ripple field ────────────────────────────────────────────────────────
// A tileable height field baked once: many directional waves on whole
// numbers of cycles per tile (so it wraps), amplitude falling with frequency,
// leaning along x (the wind down the corridors), random phases. Stored per
// texel: slope x and z (normalised by 4 × their rms, so the shader scales
// them to any steepness), height, and the caustic the field would throw:
// light focused by the curvature, 1 / |det(I + d·Hessian)|.
export const WATER_LAYER = 5;    // the water plane renders on its own layer (the split pass in post.js)
const WAVE_N = 90;
const WAVES = (() => {
  let seed = 1224;
  const rnd = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const list = [];
  while (list.length < WAVE_N) {
    const kx = Math.round((rnd() * 2 - 1) * 24), kz = Math.round((rnd() * 2 - 1) * 24);
    const k = Math.hypot(kx, kz);
    if (k < 3 || k > 24) continue;
    const along = Math.abs(kx) / k;
    list.push({ kx, kz, a: Math.pow(k, -1.7) * (0.4 + 0.6 * along * along), ph: rnd() * Math.PI * 2 });
  }
  let s2 = 0, h2 = 0;
  for (const w of list) { s2 += (w.a * 2 * Math.PI * Math.hypot(w.kx, w.kz)) ** 2 / 2; h2 += w.a * w.a / 2; }
  return { list, slopeRms: Math.sqrt(s2), hRms: Math.sqrt(h2) };
})();

function bakeWaves(N) {
  const { list, slopeRms, hRms } = WAVES;
  const sx = new Float32Array(N * N), sz = new Float32Array(N * N), h = new Float32Array(N * N);
  const cx = new Float32Array(N), cz = new Float32Array(N);
  for (const w of list) {
    for (let i = 0; i < N; i++) { cx[i] = 2 * Math.PI * w.kx * i / N; cz[i] = 2 * Math.PI * w.kz * i / N; }
    const gx = w.a * 2 * Math.PI * w.kx, gz = w.a * 2 * Math.PI * w.kz;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const ph = cx[i] + cz[j] + w.ph, c = Math.cos(ph), o = j * N + i;
      h[o] += w.a * Math.sin(ph); sx[o] += gx * c; sz[o] += gz * c;
    }
  }
  // curvature by central differences of the slopes (wrapping), then focusing
  const at = (a, i, j) => a[((j + N) % N) * N + ((i + N) % N)];
  const hxx = new Float32Array(N * N), hzz = new Float32Array(N * N), hxz = new Float32Array(N * N);
  let cr = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = j * N + i;
    hxx[o] = (at(sx, i + 1, j) - at(sx, i - 1, j)) * N / 2;
    hzz[o] = (at(sz, i, j + 1) - at(sz, i, j - 1)) * N / 2;
    hxz[o] = (at(sx, i, j + 1) - at(sx, i, j - 1)) * N / 2;
    cr += hxx[o] * hxx[o] + hzz[o] * hzz[o];
  }
  const d = 0.3 / Math.sqrt(cr / (2 * N * N));   // how far the light travels before it lands: sharp lines, few blow-outs
  const data = new Uint8Array(N * N * 4), enc = v => Math.max(0, Math.min(255, Math.round(128 + v * 127)));
  for (let o = 0; o < N * N; o++) {
    const det = (1 - d * hxx[o]) * (1 - d * hzz[o]) - d * d * hxz[o] * hxz[o];
    const focus = Math.min(4, 1 / Math.max(Math.abs(det), 0.25));
    data[o * 4] = enc(sx[o] / (4 * slopeRms));
    data[o * 4 + 1] = enc(sz[o] / (4 * slopeRms));
    data[o * 4 + 2] = enc(h[o] / (3 * hRms));
    data[o * 4 + 3] = Math.round(focus / 4 * 255);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// Two layers of the baked field, scrolled with the wind at different scales
// and speeds, the second turned. Shared with materials.js, whose caustics
// move with the same ripples. t is the water's phase (uWater.z).
export const WAVE_GLSL = /* glsl */`
uniform sampler2D uWaveTex;   // baked ripples (water.js): rg slope, b height, a caustic
const mat2 WAVE_TURN = mat2(0.82, 0.57, -0.57, 0.82);
vec2 waveUV1(vec2 p, float t){ return p / 2.6 + vec2(0.019, 0.003) * t; }
vec2 waveUV2(vec2 p, float t){ return WAVE_TURN * p / 0.85 + vec2(-0.041, 0.018) * t; }
// slope of the ripples (dh/dx, dh/dz): about 0.03 rms long, 0.018 short
vec2 waveSlope(vec2 p, float t){
  vec2 a = texture2D(uWaveTex, waveUV1(p, t)).rg * 2.0 - 1.0;
  vec2 b = texture2D(uWaveTex, waveUV2(p, t)).rg * 2.0 - 1.0;
  return a * 0.12 + (b * WAVE_TURN) * 0.072;   // the turned layer's slope comes back through the transpose
}
float waveHeight(vec2 p, float t){
  return texture2D(uWaveTex, waveUV1(p, t)).b + texture2D(uWaveTex, waveUV2(p, t) * 1.7).b - 1.0;
}
// light the ripples focus on whatever it lands on: a bright net, 0 between
float waveCaustic(vec2 p, float t){
  float a = texture2D(uWaveTex, waveUV1(p, t)).a * 4.0, b = texture2D(uWaveTex, waveUV2(p, t)).a * 4.0;
  return max(a * b - 0.75, 0.0) * (1.0 - 0.5 * uWater.w);
}
`;

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

const RINGS_GLSL = /* glsl */`
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

`;

// Tier 0: the cheap water, drawn with the scene, no extra targets.
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

${RINGS_GLSL}
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

// Tiers 1-2: real water. Drawn alone into its own target after the scene
// (post.js), with the scene's colour and depth to read from.
const VERT_REAL = /* glsl */`
#include <common>
#include <fog_pars_vertex>
uniform mat4 uTexMatrix;
varying vec3 vWorldPos;
varying vec3 vView;
varying vec4 vMirror;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vMirror = uTexMatrix * wp;
  vec4 mvPosition = viewMatrix * wp;
  vView = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG_REAL = /* glsl */`
#include <common>
#include <packing>
#include <fog_pars_fragment>
uniform vec4  uWater;              // level (a tenth of the tide), accept, phase, calm
uniform float uTime;
uniform vec4  uRipples[${RIPPLES}];
uniform vec3  uFinale;
uniform vec4  uHaze[6];            // the fixtures in sight: xz of each panel, w = strength
uniform vec4  uCandle[8];          // the candles nearest the visitor: xyz, w = flickering intensity
uniform vec3  uCandleCol[8];
uniform sampler2D uMirror;
uniform float uMirrorOn;
uniform sampler2D uScene;          // the frame without the water
uniform sampler2D uDepth;          // and its depth
uniform vec2  uRes;
uniform vec2  uNearFar;
varying vec3 vWorldPos;
varying vec3 vView;
varying vec4 vMirror;
${WATER_GLSL}
${WAVE_GLSL}
${RINGS_GLSL}

#define PEARL vec3(1.0, 0.93, 0.86)
#define PANEL_Y ${(CEIL_H - 0.05).toFixed(2)}
#define ABSORB vec3(2.4, 1.15, 1.0)   // per metre: red goes first, so depth turns a faint aqua pearl

float sceneZ(vec2 uv){ return perspectiveDepthToViewZ(texture2D(uDepth, uv).r, uNearFar.x, uNearFar.y); }

// A light seen in rippled water is a streak running toward the eye: tight
// across the plane through the eye and the light, loose along it.
float streak(vec3 R, vec3 lpos, float tight, float loose){
  vec3 L = normalize(lpos - vWorldPos);
  vec3 toL = vec3(lpos.x - cameraPosition.x, 0.0, lpos.z - cameraPosition.z);
  vec3 side = dot(toL, toL) > 1e-4 ? normalize(cross(toL, vec3(0.0, 1.0, 0.0))) : vec3(1.0, 0.0, 0.0);
  vec3 e = R - L;
  float eh = dot(e, side);
  vec3 ev = e - side * eh;
  return exp(-eh * eh * tight - dot(ev, ev) * loose);
}

void main(){
  vec2 p = vWorldPos.xz;
  float thr = waterThreshold(uWater);
  float n = waterNoise(p);
  if (n < thr - 0.012) discard;
  float water = smoothstep(thr, thr + 0.05, n);
  float mx = (n - thr - 0.003) / 0.0025;
  float meniscus = exp(-mx * mx);

  // what stands in front of the water hides it (no depth buffer here: tested by hand)
  vec2 uv = gl_FragCoord.xy / uRes;
  float wz = vView.z, sz = sceneZ(uv);
  if (sz > wz + 0.003) discard;
  float rayK = length(vView) / max(-wz, 1e-3);
  float path = (wz - sz) * rayK;                           // metres of water the eye looks through

  float calm = uWater.w;
  float still = uFinale.z > 0.5 ? smoothstep(4.0, 6.0, distance(p, uFinale.xy)) : 1.0;
  vec2 s = (waveSlope(p, uWater.z) * (1.0 - 0.6 * calm) + waterWaves(p, uWater.z, calm, 0) + rings(p) * 1.8 * (1.0 - 0.5 * calm)) * still;   // rings stand out of the ripples
  vec3 N = normalize(vec3(-s.x, 1.0, -s.y));
  vec3 V = normalize(cameraPosition - vWorldPos);
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

  #ifdef USE_FOG
    vec3 fogC = fogColor;
    #ifdef FOG_EXP2
      float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogF = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #else
    vec3 fogC = vec3(0.84, 0.8, 0.78);
    float fogF = 0.0;
  #endif

  // refraction: the picture behind bends with the surface, more the deeper it is
  vec2 bend = (viewMatrix * vec4(-s.x, 0.0, -s.y, 0.0)).xy;
  vec2 uvR = uv + bend * 1.3 * clamp(path, 0.02, 0.4);
  float szR = sceneZ(uvR);
  if (szR > wz) { uvR = uv; szR = sz; }                    // bent onto something above the water: keep it straight
  float pathR = max((wz - szR) * rayK, 0.0);
  vec3 behind = texture2D(uScene, uvR).rgb;
  vec3 T = exp(-ABSORB * pathR);
  vec3 body = behind * T + fogC * vec3(0.95, 1.03, 1.02) * (1.0 - T);   // Beer-Lambert, the lost light turned pale aqua pearl

  // reflection: the real mirror on tier 2, the pearl above elsewhere
  vec3 R = reflect(-V, N);
  vec3 refl;
  if (uMirrorOn > 0.5) {
    vec4 mc = vMirror;
    mc.xy += s * 0.9 * mc.w;
    refl = softCap(texture2DProj(uMirror, mc).rgb, 0.95);   // the pale walls come back whole, only the panels are held down
  } else {
    refl = fogC * mix(1.0, 1.12, clamp(R.y, 0.0, 1.0));
  }

  // light on the water: lamps in pearl, candles in their own warm flame,
  // each a streak toward the eye, broken where the ripples turn away
  float broken = 0.25 + 0.75 * smoothstep(0.4, 0.75, waveHeight(p * 1.9, uWater.z * 1.6) * 0.5 + 0.5);
  vec3 lights = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    if (uHaze[i].w <= 0.0) continue;
    lights += PEARL * min(uHaze[i].w, 1.0) * streak(R, vec3(uHaze[i].x, PANEL_Y, uHaze[i].z), 1600.0, 16.0);
  }
  for (int i = 0; i < 8; i++) {
    if (uCandle[i].w <= 0.0) continue;
    lights += uCandleCol[i] * min(uCandle[i].w / 3.2, 1.0) * streak(R, uCandle[i].xyz, 2600.0, 26.0) * 0.8;
  }
  lights = softCap(lights * broken * (0.35 + 0.65 * F / (F + 0.1)), 0.5) * (1.0 - fogF);

  vec3 col = mix(body, refl, F) + lights;
  float shore = smoothstep(0.0, 0.012, path);             // where the water thins onto something, it fades out
  float a = water * shore * uWater.y;
  col *= a;
  col += (fogC * 1.08 + 0.05) * meniscus * 0.12 * uWater.y * (1.0 - fogF);   // the hairline at the rim
  a = max(a, meniscus * 0.12 * uWater.y);
  gl_FragColor = vec4(col, a);                             // premultiplied: post.js lays it over the frame
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
    uWaveTex: { value: null },
    uCandle: atmo?.candles ?? { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -100, 0, 0)) },
    uCandleCol: atmo?.candleCol ?? { value: Array.from({ length: 8 }, () => new THREE.Color()) },
    uScene: { value: null },
    uDepth: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNearFar: { value: new THREE.Vector2(0.1, 100) },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, premultipliedAlpha: true, depthWrite: false, fog: true,
  });
  const matReal = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT_REAL, fragmentShader: FRAG_REAL,
    transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false, fog: true,
  });
  const geo = new THREE.PlaneGeometry(PLANE, PLANE, 2, 2).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.layers.set(WATER_LAYER);
  camera.layers.enable(WATER_LAYER);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;          // first of the see-through things: dust and petals draw over it
  mesh.visible = false;
  scene.add(mesh);

  // falling drops: thin sprites from the ceiling to the surface, a few in the
  // air at once, so the light stage keeps raining softly all round
  const DROPS = 6;
  const dropMat = new THREE.SpriteMaterial({ color: 0xf4ebe6, transparent: true, opacity: 0.75, depthWrite: false, fog: true });
  const drops = Array.from({ length: DROPS }, () => {
    const s = new THREE.Sprite(dropMat);
    s.scale.set(0.012, 0.09, 1);
    s.visible = false;
    scene.add(s);
    return { s, t: -1, x: 0, z: 0 };
  });
  let nextDrip = 1 + Math.random();

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

  // real water (tiers 1-2): its own target, and the baked ripples
  let rtW = null, waveTex = null;
  const clearCol = new THREE.Color();
  const dropSplit = () => { if (rtW) { rtW.dispose(); rtW = null; } };

  let head = 0, phase = 0, stillFor = 0, prog = 0;
  let walked = 0, lastX = null, lastZ = 0;   // metres walked in the light: the puddles join up under the feet within ~10 steps
  const COVER_WALK = 7;
  const api = {
    level: 0, tide: 0, calm: 0, progress: 0,
    // post.js asks each frame whether to draw the frame in two passes
    get refracting() { return mesh.visible && quality.tier >= 1 && quality.p.post; },
    // the frame without the water into rt (colour + depth), then the water
    // alone into its own target, reading them; returns that target's texture
    renderSplit(scn, cam, rt) {
      const mask = cam.layers.mask;
      cam.layers.disable(WATER_LAYER);
      renderer.setRenderTarget(rt);
      renderer.render(scn, cam);
      if (!rtW) {
        rtW = new THREE.WebGLRenderTarget(rt.width, rt.height, { depthBuffer: false });
        rtW.texture.colorSpace = THREE.SRGBColorSpace;
      } else if (rtW.width !== rt.width || rtW.height !== rt.height) rtW.setSize(rt.width, rt.height);
      uniforms.uScene.value = rt.texture;
      uniforms.uDepth.value = rt.depthTexture;
      uniforms.uRes.value.set(rt.width, rt.height);
      uniforms.uNearFar.value.set(cam.near, cam.far);
      cam.layers.set(WATER_LAYER);
      const prevShadow = renderer.shadowMap.autoUpdate, prevAlpha = renderer.getClearAlpha();
      renderer.getClearColor(clearCol);
      renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(rtW);
      renderer.render(scn, cam);
      renderer.setClearColor(clearCol, prevAlpha);
      renderer.shadowMap.autoUpdate = prevShadow;
      cam.layers.mask = mask;
      return rtW.texture;
    },
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
      if (accept < 0.001 || !player) { walked = 0; lastX = null; }
      else {
        if (lastX !== null && accept > 0.5) walked += Math.min(1, Math.hypot(player.pos.x - lastX, player.pos.y - lastZ));
        lastX = player.pos.x; lastZ = player.pos.y;
      }
      // the floor is all water once the visitor has walked a little way into it;
      // the works seen still bring it higher toward the same full depth
      const cover = Math.max(prog, Math.min(1, walked / COVER_WALK));
      const base = accept < 0.001 ? 0 : (0.03 + 0.12 * smooth(cover)) * accept;
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
      api.progress = prog;
      atmo?.setWater?.(shaderLevel, accept, phase, api.calm, prog);
      // the ripples are baked once, the first time a tier that uses them runs
      if (quality.tier >= 1 && !waveTex) {
        waveTex = bakeWaves(quality.tier >= 2 ? 256 : 128);
        uniforms.uWaveTex.value = waveTex;
        atmo?.setWaveTex?.(waveTex);
      }
      mesh.material = quality.tier >= 1 && quality.p.post ? matReal : mat;
      if (!(quality.tier >= 1 && quality.p.post)) dropSplit();
      audio?.setWater?.({ level: api.level, tide: api.tide, calm: api.calm });

      mesh.visible = accept >= 0.001;
      if (!mesh.visible) { for (const d of drops) { d.s.visible = false; d.t = -1; } if (rt) dropMirror(); return; }
      mesh.position.set(Math.round(camera.position.x), api.level, Math.round(camera.position.z));
      const f = soul?.finale?.spot;
      if (f) uniforms.uFinale.value.set(f.x, f.z, 1); else uniforms.uFinale.value.z = 0;

      // drips: only in the stage itself, only once there is water to land in
      for (const d of drops) {
        if (d.t < 0) continue;
        d.t += dt / 0.6;
        d.s.position.set(d.x, CEIL_H - 0.05 - (CEIL_H - api.level) * d.t * d.t, d.z);   // falling, accelerating
        if (d.t >= 1) {
          d.s.visible = false; d.t = -1;
          api.addRipple(d.x, d.z, 0.6);
          const dx = d.x - camera.position.x, dz = d.z - camera.position.z, dist = Math.hypot(dx, dz);
          audio?.drip?.(dx / (dist || 1), dz / (dist || 1), dist);
        }
      }
      if (stage.stage === 2 && api.level > 0.01 && (nextDrip -= dt) <= 0) {
        nextDrip = 0.5 + Math.random() * 1.1;
        const d = drops.find(q => q.t < 0);
        for (let k = 0; d && k < 6; k++) {
          const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 8;
          const x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
          if (solidAtGlobal(Math.floor(x / CELL), Math.floor(z / CELL)) || api.heightAt(x, z) === null) continue;
          d.x = x; d.z = z; d.t = 0;
          d.s.position.set(x, CEIL_H - 0.05, z);
          d.s.visible = true;
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
      mirrorCam.near = camera.near; mirrorCam.far = camera.far * 4;   // the oblique near plane tilts the far one: push it out so the corridor's end is not cut
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
      dropMirror(); dropSplit();
      scene.remove(mesh);
      geo.dispose(); mat.dispose(); matReal.dispose(); dropMat.dispose(); for (const d of drops) scene.remove(d.s);
      waveTex?.dispose();
    },
  };
  return api;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
