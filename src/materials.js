import * as THREE from 'three';
import { sketchParam } from './device.js';
import { CEIL_H, CELL, lampLineNear, solidAtGlobal, isChandelierCell } from './world.js';
import { ZONE, ORIGIN } from './zones.js';
import { wallpaperCanvas } from './wallpaper.js';
import { WATER_GLSL, WAVE_GLSL } from './water.js';

// ── conspace-rooms · materials.js ───────────────────────────────────────────
// Procedural shader materials for the labyrinth. No texture files: everything
// is fBm/analytic GLSL keyed to *world* position, so surfaces stay seamless
// across streamed chunk boundaries.
//
// "Путь души" (see zones.js): every fragment works out how far it is from the
// spawn point and blends three looks:
//   FEAR       Soviet-hospital corridor: whitewash over glossy green oil paint,
//              chipped, damp creeping up from the floor; linoleum; cold tubes
//   MEMORY     grandmother's flat at night: dark green foliage wallpaper with
//              oxblood roses, a red ornamental carpet, red lamp glow in a
//              green half-dark
//   ACCEPTANCE walls gone soft as cloud in a milky fog
// Only the zones with weight > 0 are evaluated, so a fragment pays for one
// look almost everywhere and for two only inside a blend band.
//
// Lighting is faked, not lit: fixtures sit on a global 4.8 m lattice and each
// fragment sums the falloff of the nearest 3×3. Lamps near the visitor's
// recent footsteps glow brighter and fade behind them (uTrail).

const SPACING = 4.8; // metres between ceiling fixtures (= 4 cells)
const WALL_N = 64;   // cells per side of the wall-distance field around the visitor (77 m)

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
#define LIGHT_MEM  vec3(1.00, 0.16, 0.10)   // red lamp / candle glow
#define FILL_MEM   vec3(0.10, 0.26, 0.14)   // the green half-dark around it
#define FILL_ACC   vec3(0.29, 0.27, 0.31)   // morning light all round in the light stage, lilac where it is softest
#define LIGHT_ACC  vec3(1.00, 0.90, 0.80)   // pale morning light, apricot where it falls

uniform float uTime;
uniform int   uTier;
uniform vec2  uFlickerTile;
uniform float uFlickerAmt;
uniform vec3  uTrail[4];   // xz of recent footsteps + strength (0..1)
uniform vec3  uZone;      // stage weights (fear, memory, acceptance), set by the portal crossings
uniform vec4  uCandle[8];     // the 8 candles nearest the visitor: xyz, w = flickering intensity
uniform vec3  uCandleCol[8];  // their flame colours
uniform sampler2D uWallDist; // distance to the nearest wall, one texel per cell around the visitor (see wallField)
uniform vec2  uWallO;         // cell index of texel 0
uniform sampler2D uWallpaper; // grandmother's wallpaper, one repeat (wallpaper.js)
uniform vec4 uNook;           // grandmother's room nearby: minX, minZ, maxX, maxZ (off: far away)
uniform vec4  uHaze[6];       // the fixtures in sight of the visitor: xyz centre of the glow, w = strength (flicker included)
uniform vec4  uWater;         // level, accept, time, calm (water.js); accept 0 outside the light stage
uniform float uProgress;      // works seen, 0..1 eased (water.js): the light stage whitens with it
uniform int   uFogTop;        // acceptance: the walls rise into fog instead of meeting a ceiling, ?fogtop=1|2|3
uniform int   uClouds;        // acceptance ceiling sketches, ?clouds=1|2|3 (0: the plaster with frosted panels)
uniform float uVanish;
uniform vec2  uDbg;           // ?dbg: x 1 turns the walls' damp streaks off (debug.js)        // the finale: 0 whole, 1 the walls, ceiling and things are gone into the haze

varying vec3 vWorldPos;
varying vec3 vNormal;

// Lamp lines, in cells within a 16-cell chunk (world.js LAMP_LINES), padded
// with the neighbours from the chunks on either side.
const float LINES[9] = float[9](-5.0, -2.0, 1.0, 5.0, 8.0, 11.0, 14.0, 17.0, 21.0);
// index into LINES of the lamp line nearest to cell coordinate c (1..7)
int nearestLine(float c, out float base){
  base = floor(c / 16.0) * 16.0;
  float lc = c - base, bd = 1e9; int best = 2;
  for (int i = 1; i < 8; i++) { float d = abs(LINES[i] + 0.5 - lc); if (d < bd) { bd = d; best = i; } }
  return best;
}

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// The finale: walls, ceiling and things come apart in soft patches, lower
// first, the gaps filling with the pearl haze. true: this fragment is gone.
float vanishK(vec3 P);
bool vanished(vec3 P){
  if (uVanish <= 0.0) return false;
  return vanishK(P) < uVanish * 1.25 - 0.12;
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// ACCEPTANCE, the walls stand twice as high and lose themselves in fog
// instead of meeting a ceiling (sketches, ?fogtop=1|2|3):
// 1 a plain soft fade into the fog colour
// 2 the fade line breathes: slow drifting wisps eat into the top of the wall
// 3 the fog above is lit from within, warm and brighter toward the top
float topFogK(vec3 P){
  if (uFogTop == 1) return smoothstep(2.4, 5.4, P.y);
  if (uFogTop == 2) {
    vec2 w = P.xz * 0.35 + vec2(uTime * 0.03, -uTime * 0.02) + P.y * 0.25;
    float n = vnoise(w) * 0.6 + vnoise(w * 2.3 + 5.0) * 0.4;
    return smoothstep(1.4, 4.4, P.y + (n - 0.5) * 3.4);   // tongues of fog reach far down the wall
  }
  return smoothstep(2.0, 5.6, P.y);
}
vec3 topFogCol(vec3 P){
  vec3 c = fogColor;
  if (uFogTop == 2) c *= 0.86 + 0.28 * vnoise(P.xz * 0.5 + P.y * 0.6 + vec2(uTime * 0.03, 0.0));   // billows, lighter and darker
  if (uFogTop == 3) c = mix(fogColor, vec3(1.0, 0.95, 0.86) * 1.12, smoothstep(2.6, 6.2, P.y));
  return c;
}
float vanishK(vec3 P){
  float n = vnoise(P.xz * 0.9 + vec2(P.y * 0.7, -P.y * 0.4)) * 0.65 + vnoise(P.xz * 3.1 - P.y) * 0.35;
  return n * 0.85 + P.y / 3.2 * 0.15;                // the tops hold a moment longer than the feet
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
${WATER_GLSL}
${WAVE_GLSL}
// Light thrown up by rippling water: two warped sine lattices sliding past
// each other, their zero lines min-combined into a bright network.
float causticLayer(vec2 p, float t){
  vec2 q = p + 0.55 * vec2(sin(p.y * 1.3 + t * 0.8) + 0.5 * sin(p.x * 0.73 - t * 0.37), cos(p.x * 1.1 - t * 0.6) + 0.5 * cos(p.y * 0.61 + t * 0.29));
  return abs(sin(q.x * 2.4 + t * 0.3) + sin(q.y * 2.1 - t * 0.4)) * 0.5;   // 0 on the lines
}
float caustic(vec2 p, float t, int oct){
  float d = causticLayer(p, t);
  if (oct > 1) d = min(d, causticLayer(mat2(0.8, 0.6, -0.6, 0.8) * p * 1.37 + vec2(3.1, 1.7), -t * 1.1));   // the second net turned, so no lattice shows
  float c = smoothstep(0.3, 0.0, d);
  return c * c * (1.0 - 0.5 * uWater.w);                  // still water throws a quieter net
}
// thin band around y = c, width w (rails, paint lines)
float band(float y, float c, float w){ return smoothstep(w, 0.0, abs(y - c)); }

// Zone weights (fear, memory, acceptance), summing to 1. The whole world shows
// the stage the visitor has reached through the portals; xz is kept so a
// spatial variation can come back later without touching the callers.
vec3 zoneWeights(vec2 xz){ return uZone; }
vec3 zoneLight(vec3 z){ return LIGHT_FEAR * z.x + LIGHT_MEM * z.y + LIGHT_ACC * z.z; }

// Extra brightness a fixture gets from footsteps that passed under it.
// In the red rooms only the chandeliers light (world.js isChandelierCell):
// they burn brighter, every other fixture is all but out.
float chandelierK(vec2 cell){
  float a = mod(cell.x, 16.0), b = mod(cell.y, 16.0);
  bool ca = abs(a - 5.0) < 0.5 || abs(a - 11.0) < 0.5, cb = abs(b - 5.0) < 0.5 || abs(b - 11.0) < 0.5;
  bool ma = abs(a - 8.0) < 0.5 || abs(a - 1.0) < 0.5, mb = abs(b - 8.0) < 0.5 || abs(b - 1.0) < 0.5;
  return mix(1.0, (ca && mb) || (cb && ma) ? 1.15 : 0.45, uZone.y);   // the red half-dark it always had, a little more round a chandelier
}
float trailBoost(vec2 pc){
  float b = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 d = pc - uTrail[i].xy;
    b += uTrail[i].z * exp(-dot(d, d) * 0.12);
  }
  return b;
}

// Signed distance to the nearest wall in metres (negative inside one),
// bilinear between cell centres, so it is smooth and its zero sits on the
// wall faces. Out of the field: open floor.
float wallDist(vec2 xz){
  vec2 uv = (xz / ${CELL.toFixed(2)} - uWallO) / ${WALL_N}.0;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 3.0;
  return texture2D(uWallDist, uv).r * 4.8 - 1.2;
}
// How much of a fixture P sees past the walls: sphere-traced across the
// floor plan toward the lamp (walls run floor to ceiling, so the plan is
// enough), with the soft-shadow estimate that turns a near miss into a
// penumbra. The panel is an area light, so the shadow edge stays soft.
float lampVis(vec3 P, vec3 N, vec2 lamp){
  if (uTier == 0) return 1.0;
  vec2 o = P.xz + N.xz * 0.05, d = lamp - o;
  float len = length(d);
  if (len < 0.5) return 1.0;
  d /= len;
  float res = 1.0, t = 0.3;
  // penumbra: crisp in the hospital, wide and soft in the light, where a hard
  // edge across an open hall reads as a painted stripe
  float soft = mix(3.0, 0.9, zoneWeights(P.xz).z);
  int steps = 8;                     // the same on both upper tiers: when the governor steps down, the light must not change (#43)
  for (int i = 0; i < 10; i++) {
    if (i >= steps || t > len - 0.3) break;
    float h = wallDist(o + d * t);
    res = min(res, soft * h / t);
    if (res < 0.0) return 0.0;
    t += max(h, 0.2);
  }
  return smoothstep(0.0, 1.0, res);
}
// Open floor around P: 0 hard against a wall, 1 a metre clear.
float openness(vec2 xz){ return smoothstep(0.0, 1.0, wallDist(xz)); }

// The 3×3 nearest fixtures around P: centre of each lamp cell, in metres.
// Summed diffuse illumination at P (normal N).
vec3 fixtureLight(vec3 P, vec3 N, vec3 lightCol){
  vec3 acc = vec3(0.0);
  float bx, bz;
  int ix = nearestLine(P.x / ${CELL.toFixed(2)}, bx), iz = nearestLine(P.z / ${CELL.toFixed(2)}, bz);
  for (int dz = -1; dz <= 1; dz++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 cellL = vec2(bx + LINES[ix + dx], bz + LINES[iz + dz]);
      vec2 pc = (cellL + 0.5) * ${CELL.toFixed(2)};
      vec3 L = vec3(pc.x, PANEL_Y, pc.y) - P;
      float dist = length(L);
      float atten = 1.0 / (1.0 + 0.16 * dist + 0.10 * dist * dist);
      float ndl = max(dot(N, L / max(dist, 1e-3)), 0.0) * 0.7 + 0.3; // soft wrap
      float fl = lampVis(P, N, pc) * chandelierK(cellL);
      if (abs(cellL.x - uFlickerTile.x) < 0.5 && abs(cellL.y - uFlickerTile.y) < 0.5) fl *= uFlickerAmt;
      acc += lightCol * atten * ndl * fl;             // footstep boost lives on the fixtures themselves (ceiling)
    }
  }
  return acc;
}
// Specular highlights from the same fixtures (Blinn-Phong). V points to the
// eye; shin is the material's tightness, so glossy oil paint gets sharp
// streaks of reflected tube and satin wallpaper a soft sheen.
vec3 fixtureSpec(vec3 P, vec3 N, vec3 V, vec3 lightCol, float shin){
  vec3 acc = vec3(0.0);
  float bx, bz;
  int ix = nearestLine(P.x / ${CELL.toFixed(2)}, bx), iz = nearestLine(P.z / ${CELL.toFixed(2)}, bz);
  for (int dz = -1; dz <= 1; dz++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 cellL = vec2(bx + LINES[ix + dx], bz + LINES[iz + dz]);
      vec2 pc = (cellL + 0.5) * ${CELL.toFixed(2)};
      vec3 L = vec3(pc.x, PANEL_Y - 0.05, pc.y) - P;
      float dist = length(L);
      L /= max(dist, 1e-3);
      float atten = 1.0 / (1.0 + 0.16 * dist + 0.10 * dist * dist);
      float fl = lampVis(P, N, pc) * chandelierK(cellL);
      if (abs(cellL.x - uFlickerTile.x) < 0.5 && abs(cellL.y - uFlickerTile.y) < 0.5) fl *= uFlickerAmt;
      vec3 H = normalize(L + V);
      acc += lightCol * atten * fl * pow(max(dot(N, H), 0.0), shin) * step(0.0, dot(N, L));
    }
  }
  return acc;
}
// Warm, trembling light of the nearest candles on whatever surface is near
// them: short reach, soft wrap, so a wall glows beside a candle and the
// glow dies within a metre or two.
vec3 candleLight(vec3 P, vec3 N){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float w = uCandle[i].w;
    if (w <= 0.0) continue;
    vec3 L = uCandle[i].xyz - P;
    float d2 = dot(L, L);
    float ndl = max(dot(N, L * inversesqrt(d2 + 1e-4)), 0.0) * 0.8 + 0.2;
    // in the light stage a flame's colour thins to a warm pearl: an orange glow
    // on wet dark stone read as rust in the narrow flooded corridors
    vec3 cc = mix(uCandleCol[i], vec3(dot(uCandleCol[i], vec3(0.33))) * vec3(1.0, 0.93, 0.86), 0.75 * uZone.z);
    acc += cc * w * ndl / (1.0 + d2 * 2.5);
  }
  return acc * (1.0 - 0.7 * uZone.z);               // on pale cloud a flame's glow would blow out
}

// Crystal throws the light about: round each chandelier the walls, floor
// and ceiling are strewn with small bright flecks, a little prismatic,
// thinning with distance and stopped by walls like the light itself.
vec3 crystalFlecks(vec3 P, vec3 N){
  if (uZone.y < 0.01) return vec3(0.0);
  vec3 acc = vec3(0.0);
  float bx, bz;
  int ix = nearestLine(P.x / ${CELL.toFixed(2)}, bx), iz = nearestLine(P.z / ${CELL.toFixed(2)}, bz);
  for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++) {
    vec2 cellL = vec2(bx + LINES[ix + dx], bz + LINES[iz + dz]);
    if (chandelierK(cellL) < 1.0) continue;                         // only a chandelier scatters
    vec2 pc = (cellL + 0.5) * ${CELL.toFixed(2)};
    vec3 L = P - vec3(pc.x, PANEL_Y - 0.2, pc.y);
    float d = length(L);
    vec3 dir = L / max(d, 1e-3);
    vec2 sph = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0))) * 30.0;   // even in every direction: dots, not streaks
    float fleck = pow(vnoise(sph + cellL * 3.7), 34.0);            // few, and small
    vec3 tint = mix(vec3(1.0, 0.66, 0.4), vec3(1.0, 0.84, 0.6), vnoise(vec2(atan(dir.z, dir.x) * 5.0, dir.y * 9.0)));   // warm, candle-gold
    acc += tint * fleck * 1.1 / (1.0 + d * d * 0.6) * max(dot(N, -dir), 0.0) * lampVis(P, N, pc);
  }
  return acc * uZone.y;
}

// Diffuse and specular from the same 3×3 fixtures in one pass (walls need
// both; sharing the lamp search and attenuation halves the cost).
void fixtureLightSpec(vec3 P, vec3 N, vec3 V, vec3 lightCol, float shin, out vec3 diff, out vec3 spec){
  diff = vec3(0.0); spec = vec3(0.0);
  float bx, bz;
  int ix = nearestLine(P.x / ${CELL.toFixed(2)}, bx), iz = nearestLine(P.z / ${CELL.toFixed(2)}, bz);
  for (int dz = -1; dz <= 1; dz++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 cellL = vec2(bx + LINES[ix + dx], bz + LINES[iz + dz]);
      vec2 pc = (cellL + 0.5) * ${CELL.toFixed(2)};
      vec3 L = vec3(pc.x, PANEL_Y - 0.05, pc.y) - P;
      float dist = length(L);
      L /= max(dist, 1e-3);
      float atten = 1.0 / (1.0 + 0.16 * dist + 0.10 * dist * dist);
      float fl = lampVis(P, N, pc) * chandelierK(cellL);
      if (abs(cellL.x - uFlickerTile.x) < 0.5 && abs(cellL.y - uFlickerTile.y) < 0.5) fl *= uFlickerAmt;
      vec3 c = lightCol * atten * fl;
      float nl = dot(N, L);
      diff += c * (max(nl, 0.0) * 0.7 + 0.3);
      spec += c * pow(max(dot(N, normalize(L + V)), 0.0), shin) * step(0.0, nl);
    }
  }
}

// Light scattered in the air under the fixtures in sight: the glow of each
// is an upright ellipsoid hanging from the panel, integrated in closed form
// along the ray from the eye to this fragment, so every surface behind a
// lamp shows the haze in front of it. Six atans per fragment, no marching.
vec3 hazeGlow(vec3 P, vec3 lightCol){
  const vec3 S = vec3(1.5, 0.55, 1.5);                // taller than wide: a column of light
  vec3 rd = P - cameraPosition;
  float len = length(rd);
  vec3 d = rd * S;
  float A = dot(d, d), acc = 0.0;
  for (int i = 0; i < 6; i++) {
    float w = uHaze[i].w;
    if (w <= 0.0) continue;
    vec3 a = (cameraPosition - uHaze[i].xyz) * S;
    float B = 2.0 * dot(a, d), C = dot(a, a) + 0.3;   // + softness, so the core never burns
    float D = sqrt(max(4.0 * A * C - B * B, 1e-6));
    acc += w * 2.0 / D * (atan((2.0 * A + B) / D) - atan(B / D));
  }
  // saturates instead of piling up (standing inside a column must not white
  // the screen out), and the pale last stage, already full of light, gets little
  float k = uZone.x + uZone.y + 0.3 * uZone.z;
  return lightCol * (1.0 - exp(-acc * len * 0.07)) * 0.3 * k;
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
varying float vU;
varying vec2 vCorner;

// Soft corners: an inner corner gathers a wide soft shadow, an outer corner's
// edge catches a thin line of light, as if the plaster were rounded over.
float cornerShade(float d, float kind){
  if (kind < -0.5) return 1.0 - 0.5 * exp(-d * 4.5);
  if (kind > 0.5) return 1.0 + 0.14 * exp(-d * 16.0) - 0.08 * exp(-d * 5.0) * (1.0 - exp(-d * 16.0));
  return 1.0;
}

// ── FEAR: Soviet hospital wall ──────────────────────────────────────────────
// Whitewash above, glossy green oil paint below a hand-painted line at 1.5 m,
// brush strokes you can see in the gloss, chips, damp rising from the floor.
float fearHeight(float h, float y){                     // brush ridges, lumpy plaster above
  return y < 1.5 ? 0.5 * vnoise(vec2(h * 1.5, y * 28.0))
                 : 0.35 * vnoise(vec2(h, y) * 9.0) + 0.9 * vnoise(vec2(h, y) * 1.3);
}
vec3 fearWall(float h, float y, int oct, out float gloss){
  float n = fbm(vec2(h, y) * 1.6, oct);
  vec3 white = vec3(0.70, 0.73, 0.68) * (0.78 + 0.34 * n + 0.06 * vnoise(vec2(h, y) * 30.0));
  float crackN = abs(vnoise(vec2(h, y) * 1.6 + 2.0) - 0.5);           // hairline cracks in the plaster
  white *= 1.0 - 0.45 * smoothstep(0.005, 0.0, crackN) * smoothstep(0.4, 0.65, vnoise(vec2(h, y) * 0.5));
  float edge = 1.5 + (fbm(vec2(h * 3.0, 0.0), 3) - 0.5) * 0.06;
  vec3 paint = vec3(0.13, 0.30, 0.23) * (0.88 + 0.16 * fbm(vec2(h, y) * 4.0, 2));
  float chip = smoothstep(0.70, 0.76, fbm(vec2(h, y) * 5.0 + 3.0, 3));
  bool lower = y < edge;
  vec3 col = lower ? mix(paint, white * 0.8, chip) : white;
  col *= 1.0 - 0.55 * band(y, edge, 0.012);
  float damp = smoothstep(0.55, 0.85, fbm(vec2(h * 0.5, y * 0.8) + 7.0, 3)) * smoothstep(1.4, 0.0, y);
  col = mix(col, vec3(0.26, 0.24, 0.17), damp * 0.6);
  gloss = lower ? (1.0 - chip) * (1.0 - damp * 0.7) : 0.08;
  return col;
}

// ── MEMORY: printed wallpaper ───────────────────────────────────────────────
// Alisa's grandmother's wallpaper (wallpaper.js): a gilt ogee trellis of
// cartouches, a bouquet of roses in each, vensels where they meet, on the
// deep green of these rooms. Drawn once to a canvas, one repeat 0.64 × 0.8 m.
// On the wall the paper gets its body: fibre, ink sitting raised, strip
// seams, the green faded toward the top and aged unevenly.
#define PAPER_W 0.64
#define PAPER_H 0.8
vec3 paper(vec2 q){ return texture2D(uWallpaper, vec2(q.x / PAPER_W, q.y / PAPER_H)).rgb; }
float memoryHeight(float h, float y){
  vec3 c = paper(vec2(h, y));
  float ink = smoothstep(0.02, 0.12, abs(dot(c - vec3(0.039, 0.231, 0.192), vec3(0.4, 0.4, 0.2))));
  return 0.6 * ink + 0.05 * vnoise(vec2(h, y) * 180.0);   // raised ink + paper tooth
}
vec3 memoryWall(float h, float y, int oct, out float gloss){
  vec2 q = vec2(h, y);
  vec3 col = paper(q);
  float ink = smoothstep(0.02, 0.12, abs(dot(col - vec3(0.039, 0.231, 0.192), vec3(0.4, 0.4, 0.2))));
  float fibre = vnoise(q * vec2(90.0, 260.0)) * 0.5 + vnoise(q * 400.0) * 0.5;
  col *= 0.86 + 0.28 * fibre;
  // strip seams: a hairline shadow and a lifted edge catching light
  float sx = fract(h / PAPER_W);
  col *= 1.0 - 0.35 * smoothstep(0.004, 0.0, sx);
  col += 0.03 * smoothstep(0.012, 0.004, sx);
  col *= mix(0.9, 1.08, smoothstep(0.3, 2.6, y));        // sun-faded toward the top
  col *= 0.85 + 0.2 * fbm(q * 0.7, oct);                 // uneven ageing
  if (y < 0.12) col = vec3(0.06, 0.05, 0.04);            // dark skirting board
  gloss = 0.35 + 0.4 * ink;                              // satin paper, gilt and ink a touch shinier
  return col;
}

// ── ACCEPTANCE: cloud ───────────────────────────────────────────────────────
// No plaster left: a slow billowing mass, domain-warped fBm drifting and
// breathing, milk with a drop of rose on the crowns of the billows and soft
// lilac in their folds, a mother-of-pearl play across them. Low contrast, no
// edges, no shine, so it never reads as a pattern.
float cloud(float h, float y, int oct){
  float t = uTime * 0.018;
  vec2 q = vec2(h, y * 1.3) * 0.5;
  vec2 warp = vec2(fbm(q * 1.6 + vec2(t, 3.1), 3), fbm(q * 1.6 - vec2(2.7, t), 3));
  return fbm(q + warp * 1.4 + vec2(t * 0.6, -t * 0.3), oct);
}
float acceptHeight(float h, float y){ return 0.0; }   // the billows are shaded in colour: a relief would cost three more clouds
vec3 acceptWall(float h, float y, int oct, out float gloss){
  gloss = 0.0;
  float c = cloud(h, y, oct);
  float crown = smoothstep(0.32, 0.66, c);
  // at the portal a little darker and more lilac; with every work found the
  // crowns go to milk and the lilac keeps only to the folds
  vec3 fold = mix(vec3(0.53, 0.46, 0.60), vec3(0.78, 0.74, 0.84), uProgress);
  vec3 top  = mix(vec3(0.80, 0.71, 0.72), vec3(1.00, 0.97, 0.95), uProgress);
  vec3 col = mix(fold, top, crown);
  col += 0.03 * vec3(sin(c * 11.0), sin(c * 11.0 + 2.1), sin(c * 11.0 + 4.2)) * crown;   // nacre: the hue slides a little over the billows
  return col * (0.97 + 0.06 * vnoise(vec2(h, y) * 3.0 + uTime * 0.05));
}

float wallHeight(float h, float y, vec3 z){
  float v = 0.16 * vnoise(vec2(h, y) * 48.0) + 0.08 * vnoise(vec2(h, y) * 130.0);   // sand in the plaster, under every finish
  if (z.x > 0.001) v += z.x * fearHeight(h, y);
  if (z.y > 0.001) v += z.y * memoryHeight(h, y);
  if (z.z > 0.001) v += z.z * acceptHeight(h, y);
  return v;
}

void main(){
  vec3 N = normalize(vNormal);
  bool alongZ = abs(N.x) > abs(N.z);
  float h = alongZ ? vWorldPos.z : vWorldPos.x;        // horizontal wall coordinate
  float y = vWorldPos.y;
  int oct = uTier > 0 ? 5 : 3;
  vec3 z = zoneWeights(vWorldPos.xz);

  vec3 col = vec3(0.0);
  float gloss = 0.0, g;
  if (z.x > 0.001) { col += z.x * fearWall(h, y, oct, g); gloss += z.x * g; }
  if (z.y > 0.001) {
    vec3 mw = memoryWall(h, y, oct, g);
    // in grandmother's room the red of the bouquets gives way to smoke: the
    // print's red goes back to the green, and pale veils drift over the paper
    vec2 nk = vWorldPos.xz;
    float inNook = step(uNook.x - 0.2, nk.x) * step(nk.x, uNook.z + 0.2) * step(uNook.y - 0.2, nk.y) * step(nk.y, uNook.w + 0.2);
    if (inNook > 0.5) {
      float red = smoothstep(0.05, 0.2, mw.r - max(mw.g, mw.b));
      mw = mix(mw, vec3(0.05, 0.17, 0.14) * (0.9 + 0.2 * fbm(vec2(h, y) * 3.0, 3)), red);
      float veil = fbm(vec2(h * 0.9 + uTime * 0.03, y * 1.4 - uTime * 0.05), oct);
      veil = smoothstep(0.45, 0.85, veil) * smoothstep(0.3, 1.4, y);
      mw = mix(mw, vec3(0.42, 0.44, 0.43), veil * 0.45);
    }
    col += z.y * mw; gloss += z.y * g;
  }
  if (z.z > 0.001) { col += z.z * acceptWall(h, y, oct, g); gloss += z.z * g; }

  // bump: tilt the normal along the height field (embossed print, brush
  // ridges, plaster), so highlights break up the way they do on a real wall
  vec3 T = alongZ ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 Nb = N;
  if (uTier > 0) {                                      // relief on the mid and high tiers
    float e = 0.003, h0 = wallHeight(h, y, z);
    float du = (wallHeight(h + e, y, z) - h0) / e, dv = (wallHeight(h, y + e, z) - h0) / e;
    Nb = normalize(N - (T * du + vec3(0.0, 1.0, 0.0) * dv) * 0.008);
  }
  // grain in the colour too, so the wall is rough on every tier: fine sand,
  // small pits where the plaster blew, faint trowel drags
  float sand = vnoise(vec2(h, y) * 90.0);
  float pit = smoothstep(0.83, 0.9, vnoise(vec2(h, y) * 38.0 + 11.0));
  float drag = vnoise(vec2(h * 3.0, y * 40.0));
  col *= mix((0.94 + 0.1 * sand) * (1.0 - 0.12 * pit) * (0.975 + 0.04 * drag), 1.0, z.z);   // cloud has no sand
  gloss *= 0.75 + 0.35 * sand;                          // paint lies unevenly: the shine breaks up

  // corners where wall meets floor and ceiling collect shadow; the edge of
  // the grime is ragged, and damp runs down from the top in streaks, so the
  // junction never reads as a ruler-straight line
  float rag = (vnoise(vec2(h * 2.2, 3.0)) - 0.5) * 0.35 + (vnoise(vec2(h * 14.0, 1.0)) - 0.5) * 0.06;
  float topGrime = smoothstep(PANEL_Y - 0.55 + rag, PANEL_Y - 0.02, y);
  float streak = smoothstep(0.62, 0.8, vnoise(vec2(h * 5.0, 0.0))) * smoothstep(PANEL_Y - 1.4 + rag * 2.0, PANEL_Y, y) * (1.0 - uDbg.x);
  float footRag = (vnoise(vec2(h * 2.6, 7.0)) - 0.5) * 0.18;
  float ao = mix(0.5, 1.0, smoothstep(0.0, 0.45 + footRag, y)) * (1.0 - 0.45 * topGrime) * (1.0 - 0.25 * streak);
  ao *= cornerShade(vU * ${CELL.toFixed(2)}, vCorner.x) * cornerShade((1.0 - vU) * ${CELL.toFixed(2)}, vCorner.y);
  col = mix(col, col * vec3(0.85, 0.8, 0.66), (topGrime * 0.6 + streak * 0.4) * (1.0 - z.z));     // yellow-brown damp

  vec3 L = zoneLight(z);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float shin = mix(18.0, 60.0, z.x);                    // oil paint is tight, paper broad
  vec3 dSum, sSum;
  fixtureLightSpec(vWorldPos, Nb, V, L, shin, dSum, sSum);
  vec3 cl = candleLight(vWorldPos, Nb);
  float open = openness(vWorldPos.xz + N.xz * 1.2);    // a wall facing a hall gets more bounce than one in a slot
  vec3 diffuse = col * (dSum + 0.04 * L * (0.5 + open) + z.y * FILL_MEM * 1.6 + z.z * FILL_ACC * (1.0 + 0.7 * uProgress) + cl) * ao;   // more morning light with every work found
  vec3 spec = sSum * gloss * mix(0.25, 0.9, z.x) * ao;
  vec3 lit = rolloff(diffuse + spec + cl * 0.05 * ao); // a little warm haze on the plaster right by a flame
  lit += z.z * 0.03 * LIGHT_ACC;                       // a little light from inside the cloud
  lit += hazeGlow(vWorldPos, L) + crystalFlecks(vWorldPos, Nb);
  // the water's light on the lower wall: strongest just above the surface,
  // gone by about 1.2 m; only where the floor in front of it is wet
  if (uWater.y > 0.001) {
    float above = max(y - uWater.x, 0.0);
    float k = smoothstep(1.2, 0.0, above);
    if (k > 0.0) {
      float wet = waterDamp(vWorldPos.xz + N.xz * 0.4, uWater);
      float c = uTier > 0
        ? min(waveCaustic(vec2(h, above * 0.6) * 0.3, uWater.z) * 0.06, 0.14)   // the same ripples as the water, larger and softer up the wall
        : caustic(vec2(h * 2.6, above * 4.0 - uWater.z * 0.3), uWater.z, 1) * 0.1;
      lit += LIGHT_ACC * c * k * k * wet * uWater.y;
    }
  }
  if (uFogTop > 0 && z.z > 0.001) lit = mix(lit, topFogCol(vWorldPos), topFogK(vWorldPos) * z.z);
  if (vanished(vWorldPos)) discard;
  gl_FragColor = vec4(lit, 1.0);
  #include <fog_fragment>
  if (uVanish > 0.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, uVanish * 0.75);   // what is left pales into the haze
}
`;

// Wall vertex shader: passes where along the face we are (0 left edge, 1
// right edge) and what each edge meets (world.js edgeType).
const VERT_WALL = /* glsl */`
#include <common>
#include <fog_pars_vertex>
uniform vec3 uZone;
attribute float aU;
attribute vec2 aCorner;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vU;
varying vec2 vCorner;
void main(){
  vU = aU; vCorner = aCorner;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y *= 1.0 + uZone.z;                              // the light stage: walls twice as high, the ceiling lifted with them
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// Floor vertex shader: passes the corner occlusion from world.js.
const VERT_FLOOR = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute float aAO;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vAO;
void main(){
  vAO = aAO;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// ── floor ───────────────────────────────────────────────────────────────────
const FRAG_FLOOR = /* glsl */`
#include <common>
#include <fog_pars_fragment>
${LIB}
varying float vAO;

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

// MEMORY: Soviet herringbone parquet, wide planks 11 × 44 cm. The pattern is a
// lattice with steps (4, 4) and (1, −1) plank widths holding one flat and
// one upright plank; each point finds its plank among the nearest
// cells. Every plank its own tone of honey and walnut, grain along it,
// dark seams, varnish worn where feet go.
vec3 memoryFloor(vec2 p, int oct){
  const float PW = 0.11, PL = 4.0;                 // wide planks: 11 × 44 cm
  vec2 q = p / PW;
  vec2 e1 = vec2(PL, PL), e2 = vec2(1.0, -1.0);
  float a = floor((q.x + q.y) / (2.0 * PL)), b = floor((q.x - q.y) * 0.5);
  vec2 id = vec2(0.0), loc = vec2(0.0);
  for (int i = -1; i <= 1; i++) for (int j = -2; j <= 2; j++) {   // an upright plank reaches PL/2 cells along e2
    vec2 cell = vec2(a + float(i), b + float(j));
    vec2 r = q - cell.x * e1 - cell.y * e2;
    if (r.x >= 0.0 && r.x < PL && r.y >= 0.0 && r.y < 1.0) { id = cell; loc = r; }
    if (r.x >= PL - 1.0 && r.x < PL && r.y >= 1.0 && r.y < PL + 1.0) { id = cell + 0.5; loc = vec2(r.y - 1.0, r.x - PL + 1.0); }
  }
  float h = hash21(id * 1.73 + 0.31), h2 = hash21(id * 5.1 + 2.7);
  vec3 wood = mix(vec3(0.12, 0.08, 0.04), vec3(0.22, 0.16, 0.08), h);   // ochre and olive oak, darkened by the night
  wood = mix(wood, vec3(0.22, 0.19, 0.13), step(0.86, h2) * 0.6);   // a replaced plank, greyer, never matched   // old varnish, darkened
  float grain = vnoise(vec2(loc.x * 2.2 + h * 20.0, loc.y * 16.0 + h * 7.0));
  wood *= 0.8 + 0.32 * grain;
  wood *= 0.93 + 0.07 * sin(loc.y * 22.0 + grain * 7.0);            // the rings, running along the plank
  float seam = smoothstep(0.0, 0.07, loc.y) * smoothstep(1.0, 0.93, loc.y) * smoothstep(0.0, 0.03, loc.x) * smoothstep(PL, PL - 0.03, loc.x);
  float gapW = 0.05 + 0.08 * h2;                                  // seams opened unevenly, dirt in them
  seam = smoothstep(0.0, gapW, loc.y) * smoothstep(1.0, 1.0 - gapW, loc.y) * smoothstep(0.0, 0.03 + 0.05 * h, loc.x) * smoothstep(PL, PL - 0.03 - 0.05 * h, loc.x);
  wood *= mix(0.22, 1.0, seam);
  wood *= 0.9 + 0.1 * smoothstep(0.35, 0.0, loc.y) * step(0.7, h);   // a lifted edge catching the light
  // wear: varnish gone grey in the walked middle, scratches, stains
  float worn = smoothstep(0.4, 0.7, fbm(p * 0.35 + 3.0, oct));
  wood = mix(wood, wood * 0.7 + vec3(0.07, 0.065, 0.055), worn * 0.8);     // varnish gone, the wood greyed
  float rub = smoothstep(0.55, 0.9, vnoise(vec2(loc.x * 0.8 + h * 13.0, loc.y * 3.0)));   // pale rubbed streaks along the plank
  wood += vec3(0.05, 0.04, 0.025) * rub * (0.4 + worn);
  float grime = smoothstep(0.5, 0.8, fbm(p * 1.3 + 17.0, 3));             // dark dirt ground in, in blotches
  wood *= 1.0 - 0.45 * grime;
  float scratch = smoothstep(0.965, 1.0, vnoise(vec2(p.x * 3.0 + p.y * 40.0, p.y * 2.0)));
  scratch += smoothstep(0.97, 1.0, vnoise(vec2(p.x * 45.0 - p.y * 8.0, p.x * 1.5)));
  wood += vec3(0.06, 0.05, 0.035) * scratch;
  float stain = smoothstep(0.62, 0.7, fbm(p * 0.8 + 11.0, 3));
  wood *= 1.0 - 0.35 * stain;
  wood *= 0.8 + 0.3 * fbm(p * 0.55, oct);                         // waxed unevenly
  return wood;
}

// ACCEPTANCE: pale limestone slabs, milk-rose with apricot drifts, faint
// lilac veins and fine grain: enough detail for the water to bend.
vec3 acceptFloor(vec2 p, int oct){
  vec3 stone = mix(vec3(0.66, 0.58, 0.56), vec3(0.70, 0.62, 0.54), fbm(p * 0.23 + 5.0, 2));
  stone *= 0.85 + 0.2 * fbm(p * 0.5, oct);
  float vein = smoothstep(0.035, 0.0, abs(fbm(p * 0.9 + 2.0, oct) - 0.5));
  stone = mix(stone, stone * vec3(0.9, 0.86, 0.94), vein * 0.35);
  stone *= 0.95 + 0.08 * vnoise(p * 34.0);
  vec2 sl = abs(fract(p / 0.6) - 0.5);                  // slab joints, hairline
  stone *= 1.0 - 0.12 * smoothstep(0.485, 0.5, max(sl.x, sl.y));
  stone *= mix(vec3(0.86, 0.84, 0.9), vec3(1.1, 1.08, 1.07), uProgress);   // whiter with every work found
  return stone;
}

void main(){
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec2 p = vWorldPos.xz;
  int oct = uTier > 0 ? 4 : 2;
  vec3 z = zoneWeights(p);

  // under water the stone is seen through the moving surface: its pattern
  // wobbles with the waves (refraction without a scene texture), it goes
  // darker and a little cooler, and a thin wet halo rings each puddle
  vec2 pw = p;
  float under = 0.0, halo = 0.0;
  if (uWater.y > 0.001) {
    float thr = waterThreshold(uWater), wn = waterNoise(p);
    under = smoothstep(thr, thr + 0.05, wn);
    halo = smoothstep(thr - 0.025, thr - 0.002, wn) * (1.0 - under);
    if (under > 0.0 && uTier == 0) pw += waterWaves(p, uWater.z, uWater.w, 0) * uWater.x * under * 7.0;   // tiers 1-2: the water refracts the floor itself
  }

  vec3 col = vec3(0.0);
  if (z.x > 0.001) col += z.x * fearFloor(p, oct);
  if (z.y > 0.001) col += z.y * memoryFloor(p, oct);
  if (z.z > 0.001) col += z.z * acceptFloor(pw, oct);

  // grime creeps in along the 1.2 m grid lines (where walls stand), less so in the light
  vec2 g = abs(fract(p / 1.2) - 0.5);
  col *= mix(mix(0.55, 1.0, smoothstep(0.42, 0.30, max(g.x, g.y))), 1.0, z.z + z.y); // the parquet has seams of its own

  vec3 L = zoneLight(z);
  col *= pow(vAO, mix(1.6, 0.8, z.z));                 // shadow and dust gathered at the walls (the light stage has little dust)
  float open = openness(p);
  col *= mix(mix(0.5, 0.8, z.z), 1.0, smoothstep(0.0, 0.55, wallDist(p)));   // contact shadow: the floor darkens into every wall foot, softly in the light
  vec3 clf = candleLight(vWorldPos, N);
  vec3 lit = rolloff(col * (fixtureLight(vWorldPos, N, L) + 0.04 * L * (0.5 + open) + z.y * FILL_MEM * 1.2 + z.z * FILL_ACC * 0.8 * (1.0 + 0.9 * uProgress) + clf) + clf * 0.04);
  lit += z.z * 0.05 * LIGHT_ACC;
  lit += hazeGlow(vWorldPos, L) + crystalFlecks(vWorldPos, N);
  if (uWater.y > 0.001) {
    float wa = uWater.y;
    lit *= mix(vec3(1.0), uTier > 0 ? vec3(0.95, 0.95, 0.97) : vec3(0.9, 0.89, 0.93), under * wa) * (1.0 - 0.1 * halo * wa);   // tiers 1-2: the water's own depth does the rest
    if (uTier > 0 && under > 0.0) lit += LIGHT_ACC * min(waveCaustic(p * 0.6, uWater.z) * 0.035, 0.09) * under * wa;   // a caustic net on the stone under the water
  }
  gl_FragColor = vec4(lit, 1.0);
  #include <fog_fragment>
}
`;

// ── ceiling ─────────────────────────────────────────────────────────────────
// Ceiling vertex shader: passes aLamp, 1 where this cell's lattice fixture fits
// between walls (world.js lampFits), 0 where it would be cut by one.
const VERT_CEIL = /* glsl */`
#include <common>
#include <fog_pars_vertex>
uniform vec3 uZone;
attribute float aLamp;
attribute float aAO;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vLamp;
varying float vAO;
void main(){
  vLamp = aLamp;
  vAO = aAO;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y *= 1.0 + uZone.z;                              // the light stage: walls twice as high, the ceiling lifted with them
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG_CEIL = /* glsl */`
#include <common>
#include <fog_pars_fragment>
${LIB}
varying float vLamp;
varying float vAO;

// Old ceiling plaster: uneven trowel marks, hairline cracks, brown rings of
// old leaks, soot creeping in from the walls. Returns a multiplier.
float ceilingAge(vec2 p, int oct){
  float trowel = 0.9 + 0.12 * fbm(p * vec2(0.7, 2.3), oct) + 0.05 * vnoise(p * 25.0);
  float crackN = abs(vnoise(p * 1.8 + 4.0) - 0.5);
  float crack = smoothstep(0.012, 0.0, crackN) * smoothstep(0.35, 0.6, vnoise(p * 0.4 + 9.0));
  float leak = fbm(p * 0.35 + 21.0, 2);
  float ring = band(leak, 0.62, 0.012) * 0.6 + smoothstep(0.6, 0.7, leak) * 0.25;
  return trowel * (1.0 - 0.45 * crack) * (1.0 - ring);
}

// FEAR: a recessed fluorescent troffer. Grey metal housing, a darker inner
// lip, two tubes with hot cores, faint louvre slats across them.
vec4 troffer(vec2 m){
  vec2 a = abs(m);
  float housing = step(a.x, 0.52) * step(a.y, 0.26);
  if (housing < 0.5) return vec4(0.0);
  float inner = step(a.x, 0.47) * step(a.y, 0.21);
  vec3 metal = vec3(0.42, 0.44, 0.42) * (0.8 + 0.2 * smoothstep(0.52, 0.4, a.x));
  float tubes = 0.0;
  for (int k = -1; k <= 1; k += 2) {
    float d = abs(m.y - float(k) * 0.09);
    tubes += smoothstep(0.04, 0.0, d) * step(a.x, 0.45);   // tube body
  }
  float louvre = 0.85 + 0.15 * step(0.5, fract(m.x * 6.0));   // slats
  float glow = inner * (0.35 + 0.65 * clamp(tubes, 0.0, 1.0)) * louvre;
  return vec4(mix(metal * 0.5, metal, 1.0 - inner), glow);
}

// ACCEPTANCE, sketches: the ceiling is weather instead of plaster.
// 1 a low cloud ceiling, thick and soft, drifting; the lamps glow inside it
// 2 smoke hanging under a ceiling you can barely see, slow curls
// 3 an open sky of warm-lit cumulus, peach at the edges, lilac in the gaps
vec3 cloudCeiling(vec2 p, float t, int mode){
  vec2 q = p * 0.11 + vec2(t * 0.012, t * 0.007);
  vec2 warp = vec2(fbm(q * 1.3 + 7.0, 3), fbm(q * 1.3 - 3.0, 3)) - 0.5;
  if (mode == 1) {
    float d = fbm(q + warp * 0.8, 4);
    float lit = fbm(q * 2.1 + warp + vec2(t * 0.01, 0.0), 3);
    vec3 shade = mix(vec3(0.58, 0.54, 0.66), vec3(0.94, 0.88, 0.90), smoothstep(0.3, 0.72, d));   // lilac hollows, milky heads
    return mix(shade, vec3(1.0, 0.95, 0.9), smoothstep(0.55, 0.85, lit) * 0.7);
  } else if (mode == 2) {
    vec2 r = p * 0.35 + vec2(t * 0.03, -t * 0.02);
    float curl = fbm(r + 2.5 * vec2(fbm(r + vec2(t * 0.02, 0.0), 3), fbm(r - vec2(0.0, t * 0.025), 3)), 4);
    float wisp = smoothstep(0.42, 0.72, curl);
    vec3 far = vec3(0.42, 0.39, 0.46);                  // the ceiling itself, dim behind the smoke
    return mix(far, vec3(0.93, 0.88, 0.88), wisp * 0.9) * (0.9 + 0.2 * curl);
  }
  float puff = fbm(q * 0.9 + warp * 1.2, 4);
  float cover = smoothstep(0.45, 0.62, puff);
  float rim = smoothstep(0.45, 0.52, puff) - smoothstep(0.52, 0.66, puff);   // the edge catches the low sun
  vec3 sky = mix(vec3(0.55, 0.60, 0.80), vec3(0.86, 0.68, 0.66), 0.35 + 0.35 * sin(p.x * 0.03 + p.y * 0.02));
  vec3 cloud = mix(vec3(0.72, 0.66, 0.74), vec3(0.95, 0.9, 0.86), smoothstep(0.55, 0.8, puff));
  return (mix(sky, cloud, cover) + vec3(1.0, 0.72, 0.45) * rim * 0.3) * 0.9;
}

// ACCEPTANCE: a square frosted panel flush with the ceiling, soft edges.
vec4 frosted(vec2 m){
  vec2 a = abs(m);
  float e = max(a.x, a.y);
  if (e > 0.5) return vec4(0.0);
  return vec4(vec3(0.8), 0.55 + 0.45 * smoothstep(0.48, 0.15, e));
}

void main(){
  vec2 p = vWorldPos.xz;
  int oct = uTier > 0 ? 3 : 2;
  vec3 z = zoneWeights(p);

  vec2 cellC = floor(p / ${CELL.toFixed(2)});
  vec2 m = (fract(p / ${CELL.toFixed(2)}) - 0.5) * ${CELL.toFixed(2)}; // metres from this cell's centre
  float fl = 1.0;
  if (abs(cellC.x - uFlickerTile.x) < 0.5 && abs(cellC.y - uFlickerTile.y) < 0.5) fl = uFlickerAmt;
  float boost = 1.0 + 0.6 * trailBoost((cellC + 0.5) * ${CELL.toFixed(2)});
  float on = step(0.5, vLamp);                          // this cell holds a fixture

  vec3 matteFear = vec3(0.66, 0.68, 0.64);
  vec3 matteMem  = vec3(0.07, 0.07, 0.06);              // smoke-darkened ceiling
  vec3 matteAcc  = mix(vec3(0.8, 0.75, 0.78), vec3(1.0, 0.97, 0.95), uProgress);   // milk with a drop of rose, whiter with progress
  vec3 matte = (matteFear * z.x + matteMem * z.y + matteAcc * z.z) * ceilingAge(p, oct);
  matte = mix(matte * vec3(0.8, 0.74, 0.62), matte, pow(vAO, 0.7));   // yellowed soot toward the walls
  matte *= pow(vAO, 1.8);                                             // corner shadow

  vec3 L = zoneLight(z);
  vec3 lit = rolloff(matte * (0.12 * L + fixtureLight(vWorldPos, vec3(0.0, -1.0, 0.0), L) * 0.5 + z.z * FILL_ACC * 0.85 * (1.0 + 0.9 * uProgress)));
  lit += z.z * 0.08 * LIGHT_ACC;
  // the ceiling around the nearest fixture catches its light (measured to
  // that fixture, not to this cell, so the glow is round, never a square)
  float bx, bz;
  int ix = nearestLine(p.x / ${CELL.toFixed(2)}, bx), iz = nearestLine(p.y / ${CELL.toFixed(2)}, bz);
  vec2 lampC = (vec2(bx + LINES[ix], bz + LINES[iz]) + 0.5) * ${CELL.toFixed(2)};
  vec2 dl = p - lampC;
  float flL = 1.0;                                      // the halo dims with its own lamp, not with this cell
  if (abs(bx + LINES[ix] - uFlickerTile.x) < 0.5 && abs(bz + LINES[iz] - uFlickerTile.y) < 0.5) flL = uFlickerAmt;
  lit += L * exp(-dot(dl, dl) * 1.6) * 0.18 * flL * boost * chandelierK(vec2(bx + LINES[ix], bz + LINES[iz]));

  vec4 fx = vec4(0.0);
  if (on > 0.5) {
    if (z.x > 0.02) fx += z.x * troffer(m);          // a trace of fear left in the light must not draw a dark housing
    // MEMORY: no disc painted here; a real chandelier hangs below (chandeliers.js)
    if (z.z > 0.001 && uClouds == 0 && uFogTop == 0) fx += z.z * frosted(m);
  }
  if (uClouds > 0 && z.z > 0.001 && uFogTop == 0) {
    // the weather replaces the plaster; where a lamp was, a warm glow inside it
    vec3 sky = cloudCeiling(p, uTime, uClouds) * mix(0.92, 1.08, uProgress);
    float glow = exp(-dot(dl, dl) * 0.9) * (uClouds == 3 ? 0.12 : 0.35);   // measured to the nearest lamp: round, never a cell's square
    lit = mix(lit, sky + vec3(1.0, 0.86, 0.66) * glow, z.z);
  }
  float body = step(0.001, fx.r + fx.g + fx.b + fx.a);
  vec3 col = mix(lit, fx.rgb * (0.3 + 0.7 * L), body * 0.9);  // housing / shade
  col += L * 2.4 * fx.a * fl * boost;                          // emitted light
  col += hazeGlow(vWorldPos, L) + crystalFlecks(vWorldPos, vec3(0.0, -1.0, 0.0));
  if (uWater.y > 0.001 && uTier > 0)                    // far fainter and wider, from the water below
    col += LIGHT_ACC * min(waveCaustic(p * 0.3, uWater.z * 0.7) * 0.035, 0.07) * waterDamp(p, uWater) * uWater.y;
  if (uFogTop > 0 && z.z > 0.001) col = mix(col, topFogCol(vWorldPos), z.z);   // no ceiling to see: only fog
  if (vanished(vWorldPos)) discard;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
  if (uVanish > 0.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, uVanish * 0.75);   // what is left pales into the haze
}
`;

// ── props ───────────────────────────────────────────────────────────────────
// Things standing in the corridors (ward.js) are lit by the same faked
// fixtures and candles as the walls, so they sit in the light instead of
// glowing on their own. Colour comes from a map, vertex colours (alpha is
// gloss) and instance colours, whichever the geometry carries.
const VERT_PROP = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv0;
varying vec4 vCol;
uniform float uCloth;
uniform vec4  uWater;         // level, accept, time, calm
void main(){
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * p;
  if (uCloth > 0.5 && uWater.y > 0.001) {
    // the hem stands in the water: it sways a little with the current,
    // the lowest edge most, nothing above a hand's width over the surface
    vec3 wn = normalize(mat3(modelMatrix) * n);
    float k = smoothstep(uWater.x + 0.22, 0.0, wp.y) * uWater.y;
    float t = uWater.z;
    float sway = sin(t * 1.1 + wp.x * 3.1 + wp.z * 2.3) + 0.5 * sin(t * 1.9 - wp.x * 5.0 + wp.z * 4.2);
    wp.xz += normalize(wn.xz + 1e-4) * sway * 0.022 * k;
  }
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  vUv0 = uv;
  vCol = vec4(1.0, 1.0, 1.0, 0.3);
  #if defined( USE_COLOR_ALPHA )
    vCol = color;
  #elif defined( USE_COLOR )
    vCol.rgb = color;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vCol.rgb *= instanceColor;
  #endif
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const FRAG_PROP = /* glsl */`
#include <common>
#include <fog_pars_fragment>
${LIB}
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3  uColor;
uniform float uGlow;       // light of its own (a lamp lens), trembling
uniform float uSeed;
uniform float uRust;       // how much time has eaten it: rust, streaks, scratches, grime
uniform float uCloth;      // 1: a linen dust sheet (the light's furniture), lit like cloth
uniform sampler2D uClothMap, uClothNor;   // Poly Haven rough_linen (CC0): the weave, and its normals
varying vec2 vUv0;
varying vec4 vCol;
// The weave projected from three sides and blended by the facing, so the
// merged, unwrapped furniture needs no uvs. Returns the brightness of the
// thread; bends n by the weave's normal map (whiteout blend).
float linen(vec3 p, inout vec3 n){
  const float S = 2.4;                                  // one tile of the weave: about 40 cm
  vec3 w = pow(abs(n), vec3(4.0)); w /= dot(w, vec3(1.0));
  vec2 ux = p.zy * S, uy = p.xz * S, uz = p.xy * S;
  float g = texture2D(uClothMap, ux).r * w.x + texture2D(uClothMap, uy).r * w.y + texture2D(uClothMap, uz).r * w.z;
  vec3 tx = texture2D(uClothNor, ux).xyz * 2.0 - 1.0, ty = texture2D(uClothNor, uy).xyz * 2.0 - 1.0, tz = texture2D(uClothNor, uz).xyz * 2.0 - 1.0;
  vec3 nx = vec3(tx.xy + n.zy, abs(tx.z) * n.x), ny = vec3(ty.xy + n.xz, abs(ty.z) * n.y), nz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  n = normalize(mix(n, normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z), 0.7));
  return g;
}
void main(){
  vec3 z = uZone;
  vec3 L = zoneLight(z);
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 base = uColor * vCol.rgb;
  float weave = 0.5;
  if (uCloth > 0.5) weave = linen(vWorldPos, N);
  float alpha = 1.0;
  if (uHasMap > 0.5) { vec4 tx = texture2D(uMap, vUv0); base *= tx.rgb; alpha = tx.a; }
  if (alpha < 0.5) discard;
  float rusted = 0.0;
  if (uRust > 0.0) {
    // project along the surface's own facing so patches never smear
    vec3 an = abs(N);
    vec2 q = an.y > max(an.x, an.z) ? vWorldPos.xz : (an.x > an.z ? vWorldPos.zy : vWorldPos.xy);
    float n = fbm(q * 7.0, 4), fine = vnoise(q * 38.0);
    float low = 1.0 - smoothstep(0.0, 1.2, vWorldPos.y);                  // rust gathers low down, where the damp is
    float metal = mix(0.2, 1.0, smoothstep(0.1, 0.4, vCol.a));             // cloth and paper (no gloss) only stain
    rusted = smoothstep(0.54 - 0.2 * low, 0.8, n + fine * 0.12) * uRust * metal;
    vec3 rustCol = mix(vec3(0.28, 0.12, 0.05), vec3(0.56, 0.28, 0.1), fine);
    base = mix(base, rustCol, rusted * 0.85);
    float streak = smoothstep(0.72, 0.95, vnoise(vec2(q.x * 24.0, q.y * 1.4))) * uRust * 0.5 * metal;   // running down
    base = mix(base, base * 0.55 + vec3(0.07, 0.03, 0.0), streak);
    float scratch = smoothstep(0.93, 0.99, vnoise(vec2(q.x * 60.0 + q.y * 8.0, q.y * 3.0)));   // worn bright
    base += vec3(0.1) * scratch * uRust * (1.0 - rusted);
    base *= 1.0 - 0.28 * uRust * smoothstep(0.4, 0.8, fbm(q * 2.3 + 7.0, 3));                  // grime
  }
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 d, s;
  fixtureLightSpec(vWorldPos, N, V, L, 48.0, d, s);
  vec3 cl = candleLight(vWorldPos, N) * 0.4;          // a flame beside a thing warms it, it must not make it a beacon
  float ao = mix(0.5, 1.0, smoothstep(0.0, 0.3, vWorldPos.y));    // contact shade on the floor
  vec3 lit = base * (d + 0.05 * L + z.y * FILL_MEM * 1.4 + cl) * ao + s * vCol.a * ao * (1.0 - rusted);   // rust has no shine
  if (uCloth > 0.5) {
    // linen in the light: white sky from above, the lilac of the walls and
    // the water bounced up from below, a soft sheen where it turns away,
    // the weave read as a slight grain, never grey
    float up = 0.5 + 0.5 * N.y;
    vec3 amb = mix(vec3(0.66, 0.62, 0.72), vec3(1.02, 1.0, 0.98), up * up);
    float wrap = clamp((dot(N, normalize(vec3(0.35, 0.9, 0.25))) + 0.5) / 1.5, 0.0, 1.0);   // a broad soft key from the high windows
    float sheen = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    float lo = mix(0.72, 1.0, smoothstep(0.0, 0.45, vWorldPos.y));                        // the hem sits in the floor's shade
    vec3 cloth = base * mix(0.9, 1.06, weave);
    float wet = smoothstep(uWater.x + 0.1, uWater.x - 0.02, vWorldPos.y) * uWater.y;   // the hem soaked, darker, the lilac of the room through it
    cloth = mix(cloth, cloth * vec3(0.74, 0.72, 0.8), wet);
    lit = cloth * (amb * (0.55 + 0.45 * wrap) + d * 0.25) * lo + sheen * 0.16 * vec3(1.0, 0.96, 0.97) * lo;
  }
  if (uGlow > 0.0) {
    float fl = step(0.12, vnoise(vec2(uTime * 7.0, uSeed)));        // now and then it dies for a blink
    lit += base * uGlow * (0.75 + 0.25 * fl);
  }
  if (vanished(vWorldPos)) discard;
  gl_FragColor = vec4(rolloff(lit) + hazeGlow(vWorldPos, L), 1.0);
  #include <fog_fragment>
  if (uVanish > 0.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, uVanish * 0.75);   // what is left pales into the haze
}
`;

// ── factory ─────────────────────────────────────────────────────────────────
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

const HAZE_N = 6;
const HAZE_Y = CEIL_H - 0.95;   // centre of the glow: it hangs from the panel down to about shoulder height

// Is the open floor between two points free of walls? Marched on the cell
// grid in 0.3 m steps: good enough for a glow, cheap enough for every frame.
function clearLine(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.3);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (solidAtGlobal(Math.floor((x0 + (x1 - x0) * t) / CELL), Math.floor((z0 + (z1 - z0) * t) / CELL))) return false;
  }
  return true;
}

const TRAIL_N = 4;
const TRAIL_EVERY = 2.4;   // metres walked between trail samples
const TRAIL_FADE = 0;      // strength lost per second: none, so the light is even from the first step and does not sink while standing (#43)

// The wall-distance field: for each cell around the visitor, the distance
// from its centre to the nearest wall face (negative inside a wall), packed
// into a byte as (d + 1.2) / 4.8. Walls stand still, so it is rebuilt only
// when the visitor has walked a quarter of the way to its edge.
function fillWallField(data, gi0, gj0) {
  const N = WALL_N, R = 3, M = N + 2 * R;
  const solid = new Uint8Array(M * M);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) solid[j * M + i] = solidAtGlobal(gi0 - R + i, gj0 - R + j) ? 1 : 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const me = solid[(j + R) * M + i + R];
    let best = R * CELL;
    for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) {
      if (solid[(j + R + b) * M + i + R + a] === me) continue;
      // centre of this cell to the nearest point of that cell's square
      const dx = Math.max(0, Math.abs(a) - 0.5) * CELL, dz = Math.max(0, Math.abs(b) - 0.5) * CELL;
      best = Math.min(best, Math.hypot(dx, dz));
    }
    const d = me ? -best : best;
    data[(j * N + i) * 4] = Math.max(0, Math.min(255, Math.round((d + 1.2) / 4.8 * 255)));
  }
}

export function createMaterials(quality) {
  const wallTex = new THREE.DataTexture(new Uint8Array(WALL_N * WALL_N * 4), WALL_N, WALL_N, THREE.RGBAFormat);
  wallTex.magFilter = wallTex.minFilter = THREE.LinearFilter;
  wallTex.generateMipmaps = false;
  let fieldAt = null;
  const paperTex = new THREE.CanvasTexture(wallpaperCanvas());
  const blankWaves = new THREE.DataTexture(new Uint8Array([128, 128, 128, 0]), 1, 1, THREE.RGBAFormat);
  blankWaves.needsUpdate = true;
  paperTex.wrapS = paperTex.wrapT = THREE.RepeatWrapping;
  paperTex.anisotropy = 8;
  // one shared uniform set: update once, all three materials follow
  const shared = {
    uTime: { value: 0 },
    uTier: { value: quality.tier },
    uFlickerTile: { value: new THREE.Vector2(1e5, 1e5) }, // off-grid = nothing flickering
    uFlickerAmt: { value: 1 },
    uTrail: { value: Array.from({ length: TRAIL_N }, () => new THREE.Vector3(1e5, 1e5, 0)) },
    uZone: { value: new THREE.Vector3(1, 0, 0) },
    uCandle: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -100, 0, 0)) },
    uCandleCol: { value: Array.from({ length: 8 }, () => new THREE.Color(0, 0, 0)) },
    uHaze: { value: Array.from({ length: HAZE_N }, () => new THREE.Vector4(0, -100, 0, 0)) },
    uWallDist: { value: wallTex },
    uWallO: { value: new THREE.Vector2(-1e4, -1e4) },
    uWallpaper: { value: paperTex },
    uNook: { value: new THREE.Vector4(1e5, 1e5, 1e5, 1e5) },
    uWater: { value: new THREE.Vector4(0, 0, 0, 0) },
    uProgress: { value: 0 },
    uVanish: { value: 0 },
    uFogTop: { value: +(sketchParam('fogtop') ?? 2) },   // tongues of fog; ?fogtop=0|1|3 the other sketches
    uClouds: { value: +(sketchParam('clouds') || 0) },   // sketches: ?clouds=1|2|3
    uDbg: { value: new THREE.Vector2() },
    uWaveTex: { value: blankWaves },   // water.js bakes the real ripples on tiers 1-2
  };
  const hazeSeen = new Map();   // lamp cell key -> smoothed visibility, so a glow fades in as a corner opens

  const mk = (fragmentShader) => new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), shared),
    vertexShader: VERT,
    fragmentShader,
    fog: true,
    side: THREE.DoubleSide,
  });

  const materials = { wall: mk(FRAG_WALL), floor: mk(FRAG_FLOOR), ceil: mk(FRAG_CEIL) };
  materials.ceil.vertexShader = VERT_CEIL;
  materials.wall.vertexShader = VERT_WALL;
  materials.floor.vertexShader = VERT_FLOOR;

  // Flicker: a fixture near the visitor stutters, only when the event
  // director asks (#43, events.js: one event every 20-40 s), never in the
  // light. shiver: the candles' flames shudder together for a moment.
  let pending = 0, active = 0, shiver = 0;
  // footstep trail: a ring buffer of the last few places walked through
  let trailHead = 0, sinceSample = 0;
  const lastPos = new THREE.Vector2(1e5, 1e5);

  // A material for props: { map, color, vertexColors, glow, seed }. Shares the
  // world's uniforms, so fixtures, candles, flicker and stage reach it too.
  const prop = ({ map = null, color = 0xffffff, vertexColors = false, glow = 0, seed = 0, rust = 0.8, cloth = null } = {}) => new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), shared, {
      uMap: { value: map }, uHasMap: { value: map ? 1 : 0 }, uColor: { value: new THREE.Color(color) },
      uGlow: { value: glow }, uSeed: { value: seed }, uRust: { value: rust },
      uCloth: { value: cloth ? 1 : 0 }, uClothMap: { value: cloth?.map ?? null }, uClothNor: { value: cloth?.normal ?? null },
    }),
    vertexShader: VERT_PROP,
    fragmentShader: FRAG_PROP,
    vertexColors,
    fog: true,
    side: THREE.DoubleSide,
  });

  return {
    materials,
    prop,
    haze: shared.uHaze,   // the fixtures in sight, for the water's glints (water.js)
    candles: shared.uCandle, candleCol: shared.uCandleCol,   // the flames nearest the visitor, for their streaks on the water
    // water.js, every frame: level (m), accept weight, caustic time, calm, progress
    setWater(level, accept, time, calm, progress = 0) { shared.uWater.value.set(level, accept, time, calm); shared.uProgress.value = progress; },
    setWaveTex(tex) { shared.uWaveTex.value = tex; },
    setVanish(v) { shared.uVanish.value = v; },
    // the event director (events.js): a fixture near the visitor stutters (strength ~1), the candles shudder (seconds)
    flicker(strength = 1) { pending = strength; },
    shiverCandles(seconds = 1.5) { shiver = seconds; },
    dbg: shared.uDbg.value,   // debug.js   // the finale (soulpath.js)
    // camPos: viewer position; zone: zoneWeights() at the viewer
    update(dt, t, camPos, zone) {
      shared.uTime.value = t;
      shared.uTier.value = quality.tier;
      const ci = Math.floor(camPos.x / CELL), cj = Math.floor(camPos.z / CELL);
      if (!fieldAt || Math.abs(ci - fieldAt[0]) > WALL_N / 4 || Math.abs(cj - fieldAt[1]) > WALL_N / 4) {
        fieldAt = [ci, cj];
        fillWallField(wallTex.image.data, ci - WALL_N / 2, cj - WALL_N / 2);
        wallTex.needsUpdate = true;
        shared.uWallO.value.set(ci - WALL_N / 2, cj - WALL_N / 2);
      }
      if (zone) shared.uZone.value.set(zone.fear, zone.memory, zone.accept);

      // footsteps light the lamps above them, then fade
      if (lastPos.x > 1e4) for (const s of shared.uTrail.value) s.set(camPos.x, camPos.z, 1);   // lit where the visitor starts, before a step
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
        }
      } else if (pending > 0) {
        const tx = lampLineNear(camPos.x / CELL, Math.round(rand(-1.4, 1.4)));
        const tz = lampLineNear(camPos.z / CELL, Math.round(rand(-1.4, 1.4)));
        shared.uFlickerTile.value.set(tx, tz);
        active = rand(0.6, 1.3) * (0.6 + fear) * pending;
        pending = 0;
      }
      shiver = Math.max(0, shiver - dt);
      // the fixtures whose haze the visitor can see
      const cand = [];
      for (let kx = -2; kx <= 2; kx++) for (let kz = -2; kz <= 2; kz++) {
        const gi = lampLineNear(camPos.x / CELL, kx), gj = lampLineNear(camPos.z / CELL, kz);
        if (solidAtGlobal(gi, gj)) continue;
        const x = (gi + 0.5) * CELL, zz = (gj + 0.5) * CELL, key = gi + ':' + gj;
        const d = Math.hypot(x - camPos.x, zz - camPos.z);
        if (d > 13 || cand.some(c => c.key === key)) continue;
        const target = clearLine(camPos.x, camPos.z, x, zz) ? 1 : 0;
        const v = (hazeSeen.get(key) ?? target) + (target - (hazeSeen.get(key) ?? target)) * Math.min(1, dt * 4);
        hazeSeen.set(key, v);
        cand.push({ key, gi, gj, x, z: zz, v, d });
      }
      if (hazeSeen.size > 80) for (const k of hazeSeen.keys()) if (!cand.some(c => c.key === k)) hazeSeen.delete(k);
      cand.sort((a, b) => b.v / (1 + b.d) - a.v / (1 + a.d));
      const ft = shared.uFlickerTile.value, famt = shared.uFlickerAmt.value;
      for (let i = 0; i < HAZE_N; i++) {
        const c = cand[i];
        if (!c || c.v < 0.01) { shared.uHaze.value[i].w = 0; continue; }
        const fl = (c.gi === ft.x && c.gj === ft.y ? famt : 1) * (1 + (zone ? zone.memory : 0) * (isChandelierCell(c.gi, c.gj) ? 0.15 : -0.55));   // the red rooms glow only round a chandelier
        const near = Math.min(1, Math.max(0.1, (c.d - 0.6) / 2.4));   // the column you stand in is air all round you, not a glow ahead
        shared.uHaze.value[i].set(c.x, HAZE_Y, c.z, c.v * fl * near * Math.min(1, (13 - c.d) / 3));
      }
    },
    // lights: [{ x, y, z, col }] nearest first; each gets its own flicker
    // grandmother's room nearest the visitor ({ minX, minZ, maxX, maxZ }) or null
    setNook(r) { shared.uNook.value.set(r ? r.minX : 1e5, r ? r.minZ : 1e5, r ? r.maxX : 1e5, r ? r.maxZ : 1e5); },
    setCandles(lights, t) {
      for (let i = 0; i < 8; i++) {
        const c = lights[i];
        if (!c) { shared.uCandle.value[i].w = 0; continue; }
        let fl = 0.8 + 0.12 * Math.sin(t * 11 + i * 1.7) + 0.08 * Math.sin(t * 29 + i * 5.3);
        if (shiver > 0) fl *= 1 - Math.min(1, shiver) * (0.45 + 0.35 * Math.sin(t * 37 + i * 2.3));   // a draught through every flame
        shared.uCandle.value[i].set(c.x, c.y, c.z, 3.2 * fl);
        shared.uCandleCol.value[i].copy(c.col);
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
