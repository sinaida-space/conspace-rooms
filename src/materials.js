import * as THREE from 'three';
import { CEIL_H } from './world.js';
import { ZONE, ORIGIN } from './zones.js';

// ── conspace-rooms · materials.js ───────────────────────────────────────────
// Procedural shader materials for the labyrinth. No texture files: everything
// is fBm/analytic GLSL keyed to *world* position, so surfaces stay seamless
// across streamed chunk boundaries.
//
// "Путь души" (see zones.js): every fragment works out how far it is from the
// spawn point and blends three looks:
//   FEAR       Soviet-hospital corridor: whitewash over glossy green oil paint,
//              chipped, damp creeping up from the floor; linoleum; cold tubes
//   MEMORY     grandmother's flat: half-drop rosette wallpaper, a rug hung on
//              some walls, parquet, round warm lampshades
//   ACCEPTANCE pale walls that thin into lace and let the light through
// Only the zones with weight > 0 are evaluated, so a fragment pays for one
// look almost everywhere and for two only inside a blend band.
//
// Lighting is faked, not lit: fixtures sit on a global 4.8 m lattice and each
// fragment sums the falloff of the nearest 3×3. Lamps near the visitor's
// recent footsteps glow brighter and fade behind them (uTrail).

const SPACING = 4.8; // metres between ceiling fixtures (= 4 cells)

// ── shared GLSL ─────────────────────────────────────────────────────────────
const LIB = /* glsl */`
#define SPACING ${SPACING.toFixed(3)}
#define PANEL_Y ${CEIL_H.toFixed(3)}
#define MEM_A ${ZONE.MEM_A.toFixed(1)}
#define MEM_B ${ZONE.MEM_B.toFixed(1)}
#define ACC_A ${ZONE.ACC_A.toFixed(1)}
#define ACC_B ${ZONE.ACC_B.toFixed(1)}
#define ORIGIN vec2(${ORIGIN.x.toFixed(2)}, ${ORIGIN.z.toFixed(2)})

// zone light colours: cold tube, warm tungsten lampshade, soft daylight
#define LIGHT_FEAR vec3(0.84, 0.91, 0.86)
#define LIGHT_MEM  vec3(1.05, 0.80, 0.52)
#define LIGHT_ACC  vec3(0.92, 0.90, 0.84)

uniform float uTime;
uniform int   uTier;
uniform vec2  uFlickerTile;
uniform float uFlickerAmt;
uniform vec3  uTrail[4];   // xz of recent footsteps + strength (0..1)

varying vec3 vWorldPos;
varying vec3 vNormal;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, int oct){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p *= 2.02; a *= 0.5;
  }
  return s;
}
// thin band around y = c, width w (rails, paint lines)
float band(float y, float c, float w){ return smoothstep(w, 0.0, abs(y - c)); }

// Zone weights (fear, memory, acceptance), summing to 1. The boundary is
// warped by low-frequency noise so a zone edge never reads as a circle.
vec3 zoneWeights(vec2 xz){
  float d = length(xz - ORIGIN) + (vnoise(xz * 0.025) - 0.5) * 24.0;
  float m = smoothstep(MEM_A, MEM_B, d);
  float a = smoothstep(ACC_A, ACC_B, d);
  return vec3(1.0 - m, m * (1.0 - a), a);
}
vec3 zoneLight(vec3 z){ return LIGHT_FEAR * z.x + LIGHT_MEM * z.y + LIGHT_ACC * z.z; }

// Extra brightness a fixture gets from footsteps that passed under it.
float trailBoost(vec2 pc){
  float b = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 d = pc - uTrail[i].xy;
    b += uTrail[i].z * exp(-dot(d, d) * 0.12);
  }
  return b;
}

// Summed illumination at P (normal N) from the 3×3 nearest fixtures.
vec3 fixtureLight(vec3 P, vec3 N, vec3 lightCol){
  vec3 acc = vec3(0.0);
  vec2 base = floor(P.xz / SPACING);
  for (int dz = -1; dz <= 1; dz++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 tile = base + vec2(float(dx), float(dz));
      vec2 pc = (tile + 0.5) * SPACING;                 // fixture centre (xz)
      vec3 L = vec3(pc.x, PANEL_Y, pc.y) - P;
      float dist = length(L);
      float atten = 1.0 / (1.0 + 0.16 * dist + 0.10 * dist * dist);
      float ndl = max(dot(N, L / max(dist, 1e-3)), 0.0) * 0.7 + 0.3; // soft wrap
      float fl = 1.0;
      if (abs(tile.x - uFlickerTile.x) < 0.5 && abs(tile.y - uFlickerTile.y) < 0.5) fl = uFlickerAmt;
      float boost = 1.0 + 0.6 * trailBoost(pc);
      acc += lightCol * atten * ndl * fl * boost;
    }
  }
  return acc;
}
// gentle filmic rolloff so light pools don't clip to flat white
vec3 rolloff(vec3 c){ return c / (c + vec3(0.75)) * 1.45; }
`;

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorldPos;
varying vec3 vNormal;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// ── walls ───────────────────────────────────────────────────────────────────
const FRAG_WALL = /* glsl */`
#include <common>
#include <fog_pars_fragment>
${LIB}

// FEAR: whitewash above, glossy hospital-green oil paint below 1.5 m with a
// wobbly hand-painted edge, chips where paint flaked off, damp rising.
vec3 fearWall(float h, float y, int oct){
  float n = fbm(vec2(h, y) * 1.6, oct);
  vec3 white = vec3(0.70, 0.73, 0.68) * (0.80 + 0.35 * n);
  float edge = 1.5 + (fbm(vec2(h * 3.0, 0.0), 3) - 0.5) * 0.06;
  vec3 paint = vec3(0.15, 0.32, 0.25) * (0.85 + 0.2 * fbm(vec2(h, y) * 4.0, 2));
  float gloss = 0.08 * smoothstep(0.6, 1.0, fbm(vec2(h * 0.7, y * 3.0), 2));  // streaky sheen
  paint += gloss;
  float chip = smoothstep(0.70, 0.76, fbm(vec2(h, y) * 5.0 + 3.0, 3));
  paint = mix(paint, white * 0.8, chip);
  vec3 col = y < edge ? paint : white;
  col *= 1.0 - 0.55 * band(y, edge, 0.012);           // dark painted border line
  float damp = smoothstep(0.55, 0.85, fbm(vec2(h * 0.5, y * 0.8) + 7.0, 3)) * smoothstep(1.4, 0.0, y);
  col = mix(col, vec3(0.26, 0.24, 0.17), damp * 0.6);
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.4, y));      // grime pooling at the base
  return col;
}

// A rug hung on the wall, the way every Soviet flat had one. Returns alpha in w.
vec4 rug(vec2 q){
  // q: -1..1 across the rug
  float r = max(abs(q.x), abs(q.y));
  if (r > 1.0) return vec4(0.0);
  vec3 field = vec3(0.13, 0.15, 0.22);                 // deep indigo ground
  vec3 ochre = vec3(0.50, 0.37, 0.17);
  vec3 teal  = vec3(0.18, 0.31, 0.29);
  vec3 col = field;
  vec2 g = fract(q * vec2(7.0, 5.0)) - 0.5;            // small repeating rhombs
  col = mix(col, ochre * 0.7, step(abs(g.x) + abs(g.y), 0.22));
  float dia = abs(q.x) * 0.75 + abs(q.y);              // central medallion
  col = mix(col, teal, step(dia, 0.55));
  col = mix(col, ochre, step(dia, 0.38) - step(dia, 0.30));
  col = mix(col, field, step(dia, 0.18));
  col = mix(col, ochre, step(0.80, r) - step(0.88, r)); // double border
  col = mix(col, teal, step(0.92, r));
  return vec4(col, 1.0);
}

// MEMORY: faded ochre wallpaper with a half-drop rosette repeat, strip seams,
// a wooden skirting board and, on some walls, a rug.
vec3 memoryWall(float h, float y, float wallKey, int oct){
  vec2 cell = vec2(h / 0.53, y / 0.62);
  cell.y += 0.5 * mod(floor(cell.x), 2.0);             // half-drop, like real wallpaper
  vec2 f = fract(cell) - 0.5;
  f.x *= 1.15;
  float r = length(f);
  float petals = abs(sin(atan(f.y, f.x) * 4.0));       // four-petal rosette
  float motif = smoothstep(0.025, 0.0, abs(r - (0.17 + 0.07 * petals)));
  motif = max(motif, smoothstep(0.045, 0.0, r - 0.035));
  vec3 col = vec3(0.60, 0.49, 0.33);
  col = mix(col, vec3(0.43, 0.31, 0.19), motif * 0.6);
  float seam = smoothstep(0.012, 0.0, abs(fract(h / 0.53)));
  col *= 1.0 - 0.18 * seam;
  col *= 0.82 + 0.28 * fbm(vec2(h, y) * 0.8, oct);     // sun-bleached, uneven
  if (y < 0.12) col = vec3(0.30, 0.20, 0.12) * (0.8 + 0.3 * fbm(vec2(h * 6.0, y * 20.0), 2));

  // one rug per 4.8 m span, on roughly a third of the spans
  float span = floor(h / 4.8);
  if (hash21(vec2(span, wallKey) + 3.7) > 0.66) {
    vec2 q = vec2(h - (span + 0.5) * 4.8, y - 1.62) / vec2(1.05, 0.72);
    vec4 rg = rug(q);
    float wool = 0.85 + 0.25 * vnoise(vec2(h, y) * 60.0);
    col = mix(col, rg.rgb * wool, rg.w);
  }
  return col;
}

// ACCEPTANCE: pale, almost white plaster.
vec3 acceptWall(float h, float y, int oct){
  return vec3(0.74, 0.74, 0.70) * (0.85 + 0.2 * fbm(vec2(h, y) * 0.9, oct));
}

void main(){
  vec3 N = normalize(vNormal);
  bool alongZ = abs(N.x) > abs(N.z);
  float h = alongZ ? vWorldPos.z : vWorldPos.x;        // horizontal wall coordinate
  float wallKey = floor((alongZ ? vWorldPos.x : vWorldPos.z) * 0.83) + (alongZ ? 0.0 : 91.0);
  float y = vWorldPos.y;
  int oct = uTier > 0 ? 5 : 3;
  vec3 z = zoneWeights(vWorldPos.xz);

  // ACCEPTANCE: the wall dissolves into lace. Holes open where a slow noise
  // field drops under the zone weight; the light behind shows through.
  float lace = 0.0;
  if (z.z > 0.01) {
    float holes = fbm(vec2(h, y) * 0.9 + vec2(uTime * 0.015, 0.0), 3);
    float cut = z.z * 0.5 - 0.1;
    if (holes < cut) discard;
    lace = smoothstep(cut + 0.06, cut, holes);          // glowing rim around each hole
  }

  vec3 col = vec3(0.0);
  if (z.x > 0.001) col += z.x * fearWall(h, y, oct);
  if (z.y > 0.001) col += z.y * memoryWall(h, y, wallKey, oct);
  if (z.z > 0.001) col += z.z * acceptWall(h, y, oct);

  vec3 L = zoneLight(z);
  vec3 lit = rolloff(col * (fixtureLight(vWorldPos, N, L) + 0.04 * L));
  lit += z.z * (0.06 + 0.7 * lace) * LIGHT_ACC * 0.5;  // acceptance walls glow from inside, brightest at the lace rims
  gl_FragColor = vec4(lit, 1.0);
  #include <fog_fragment>
}
`;

// ── floor ───────────────────────────────────────────────────────────────────
const FRAG_FLOOR = /* glsl */`
#include <common>
#include <fog_pars_fragment>
${LIB}

// FEAR: speckled grey-green linoleum, sheet seams, a paler worn track.
vec3 fearFloor(vec2 p, int oct){
  vec3 base = vec3(0.26, 0.29, 0.26) * (0.85 + 0.3 * fbm(p * 0.7, oct));
  float speck = step(0.93, hash21(floor(p * 18.0)));
  base = mix(base, vec3(0.45, 0.47, 0.42), speck * 0.5);
  float seam = smoothstep(0.015, 0.0, abs(fract(p.x / 2.0) - 0.5) - 0.485);
  base *= 1.0 - 0.3 * seam;
  float worn = smoothstep(0.35, 0.0, abs(fract(p.x / 2.4) - 0.5)) * smoothstep(0.35, 0.0, abs(fract(p.y / 2.4) - 0.5));
  return base * (1.0 + 0.18 * worn);
}

// MEMORY: worn parquet, 1.2 m blocks, grain direction alternating (basket weave).
vec3 memoryFloor(vec2 p, int oct){
  vec2 cell = floor(p / 1.2);
  bool flip = mod(cell.x + cell.y, 2.0) > 0.5;
  vec2 lp = flip ? p.yx : p.xy;
  float grain = fbm(vec2(lp.x * 2.2, lp.y * 22.0), oct);
  vec3 wood = mix(vec3(0.34, 0.22, 0.12), vec3(0.22, 0.14, 0.08), grain);
  float ps = fract(lp.x / 0.3);                          // narrow planks
  wood *= 1.0 - 0.45 * smoothstep(0.05, 0.0, min(ps, 1.0 - ps));
  vec2 bs = fract(p / 1.2);
  float bseam = min(min(bs.x, 1.0 - bs.x), min(bs.y, 1.0 - bs.y));
  wood *= 1.0 - 0.35 * smoothstep(0.03, 0.0, bseam);
  wood *= 0.85 + 0.15 * fbm(p * 0.6 + 5.0, 3);
  return wood;
}

// ACCEPTANCE: pale limestone.
vec3 acceptFloor(vec2 p, int oct){
  return vec3(0.62, 0.61, 0.57) * (0.85 + 0.2 * fbm(p * 0.5, oct));
}

void main(){
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec2 p = vWorldPos.xz;
  int oct = uTier > 0 ? 4 : 2;
  vec3 z = zoneWeights(p);

  vec3 col = vec3(0.0);
  if (z.x > 0.001) col += z.x * fearFloor(p, oct);
  if (z.y > 0.001) col += z.y * memoryFloor(p, oct);
  if (z.z > 0.001) col += z.z * acceptFloor(p, oct);

  // grime creeps in along the 1.2 m grid lines (where walls stand), less so in the light
  vec2 g = abs(fract(p / 1.2) - 0.5);
  col *= mix(mix(0.55, 1.0, smoothstep(0.42, 0.30, max(g.x, g.y))), 1.0, z.z);

  vec3 L = zoneLight(z);
  vec3 lit = rolloff(col * (fixtureLight(vWorldPos, N, L) + 0.04 * L));
  lit += z.z * 0.05 * LIGHT_ACC;
  gl_FragColor = vec4(lit, 1.0);
  #include <fog_fragment>
}
`;

// ── ceiling ─────────────────────────────────────────────────────────────────
const FRAG_CEIL = /* glsl */`
#include <common>
#include <fog_pars_fragment>
${LIB}
void main(){
  vec2 p = vWorldPos.xz;
  int oct = uTier > 0 ? 3 : 2;
  vec3 z = zoneWeights(p);

  vec2 tile = floor(p / SPACING);
  vec2 f = fract(p / SPACING) - 0.5;                    // -0.5..0.5 within a tile
  float fl = 1.0;
  if (abs(tile.x - uFlickerTile.x) < 0.5 && abs(tile.y - uFlickerTile.y) < 0.5) fl = uFlickerAmt;
  float boost = 1.0 + 0.6 * trailBoost((tile + 0.5) * SPACING);

  // FEAR fixture: long fluorescent tube panel with diffuser striping
  vec2 panelHalf = 0.5 * vec2(1.6, 0.45) / SPACING;
  float tube = step(abs(f.x), panelHalf.x) * step(abs(f.y), panelHalf.y);
  tube *= 0.6 + 0.4 * smoothstep(panelHalf.y, 0.0, abs(f.y));
  // MEMORY fixture: round fabric lampshade seen from below, warm core and rim
  float r = length(f * SPACING);
  float shade = smoothstep(0.42, 0.40, r) * (0.55 + 0.45 * smoothstep(0.40, 0.05, r));
  shade += 0.35 * band(r, 0.41, 0.02);
  // ACCEPTANCE: a wide soft skylight
  float sky = smoothstep(0.45, 0.15, max(abs(f.x), abs(f.y)));
  float fixture = z.x * tube + z.y * shade + z.z * sky;

  vec3 matteFear = vec3(0.66, 0.68, 0.64);
  vec3 matteMem  = vec3(0.70, 0.64, 0.55);              // yellowed whitewash
  vec3 matteAcc  = vec3(0.92, 0.92, 0.89);
  vec3 matte = (matteFear * z.x + matteMem * z.y + matteAcc * z.z) * (0.85 + 0.15 * fbm(p * 3.0, oct));
  float rosette = z.y * band(r, 0.75, 0.03) * 0.25;     // plaster ceiling rose around each lamp
  matte *= 1.0 - rosette;

  vec3 L = zoneLight(z);
  vec3 lit = rolloff(matte * (0.12 * L + fixtureLight(vWorldPos, vec3(0.0, -1.0, 0.0), L) * 0.5));
  lit += z.z * 0.08 * LIGHT_ACC;
  vec3 emis = L * 2.4 * fl * boost;
  vec3 col = mix(lit, emis, clamp(fixture, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

// ── factory ─────────────────────────────────────────────────────────────────
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

const TRAIL_N = 4;
const TRAIL_EVERY = 2.4;   // metres walked between trail samples
const TRAIL_FADE = 0.12;   // strength lost per second

export function createMaterials(quality) {
  // one shared uniform set: update once, all three materials follow
  const shared = {
    uTime: { value: 0 },
    uTier: { value: quality.tier },
    uFlickerTile: { value: new THREE.Vector2(1e5, 1e5) }, // off-grid = nothing flickering
    uFlickerAmt: { value: 1 },
    uTrail: { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector3(1e5, 1e5, 0)) },
  };

  const mk = (fragmentShader) => new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), shared),
    vertexShader: VERT,
    fragmentShader,
    fog: true,
    side: THREE.DoubleSide,
  });

  const materials = { wall: mk(FRAG_WALL), floor: mk(FRAG_FLOOR), ceil: mk(FRAG_CEIL) };

  // Flicker: a fixture near the visitor stutters now and then. How often
  // depends on the zone: constant unease in FEAR, rare in MEMORY, never in
  // ACCEPTANCE (caller passes the zone weights).
  let idle = rand(4, 10);
  let active = 0;
  // footstep trail: a ring buffer of the last few places walked through
  let trailHead = 0, sinceSample = 0;
  const lastPos = new THREE.Vector2(1e5, 1e5);

  return {
    materials,
    // camPos: viewer position; zone: zoneWeights() at the viewer
    update(dt, t, camPos, zone) {
      shared.uTime.value = t;
      shared.uTier.value = quality.tier;

      // footsteps light the lamps above them, then fade
      const moved = lastPos.x > 1e4 ? 0 : Math.hypot(camPos.x - lastPos.x, camPos.z - lastPos.y);
      lastPos.set(camPos.x, camPos.z);
      sinceSample += moved;
      const trail = shared.uTrail.value;
      for (const s of trail) s.z = Math.max(0, s.z - dt * TRAIL_FADE);
      if (sinceSample > TRAIL_EVERY) {
        sinceSample = 0;
        trail[trailHead].set(camPos.x, camPos.z, 1);
        trailHead = (trailHead + 1) % TRAIL_N;
      }

      const fear = zone ? zone.fear : 1;
      if (active > 0) {
        active -= dt;
        const s = Math.sin(t * 41.0) * Math.sin(t * 19.0); // two beating sines → hard dips
        shared.uFlickerAmt.value = s > 0.15 ? 0.12 : 1.0;
        if (active <= 0) {
          shared.uFlickerAmt.value = 1;
          shared.uFlickerTile.value.set(1e5, 1e5);
          idle = fear > 0.5 ? rand(4, 12) : rand(30, 70);
        }
      } else {
        idle -= dt;
        if (idle <= 0 && (zone ? zone.accept < 0.5 : true)) {
          const tx = Math.floor(camPos.x / SPACING) + Math.round(rand(-1.4, 1.4));
          const tz = Math.floor(camPos.z / SPACING) + Math.round(rand(-1.4, 1.4));
          shared.uFlickerTile.value.set(tx, tz);
          active = rand(0.4, 1.1) * (0.6 + fear);
        } else if (idle <= 0) {
          idle = rand(20, 40);
        }
      }
    },
    dispose() {
      materials.wall.dispose();
      materials.floor.dispose();
      materials.ceil.dispose();
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
