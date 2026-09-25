import * as THREE from 'three';
import { CEIL_H, CELL, lampLineNear } from './world.js';
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
//   MEMORY     grandmother's flat at night: dark green foliage wallpaper with
//              oxblood roses, a red ornamental carpet, red lamp glow in a
//              green half-dark
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
#define LIGHT_MEM  vec3(1.00, 0.16, 0.10)   // red lamp / candle glow
#define FILL_MEM   vec3(0.10, 0.26, 0.14)   // the green half-dark around it
#define LIGHT_ACC  vec3(0.92, 0.90, 0.84)

uniform float uTime;
uniform int   uTier;
uniform vec2  uFlickerTile;
uniform float uFlickerAmt;
uniform vec3  uTrail[4];   // xz of recent footsteps + strength (0..1)
uniform vec3  uZone;      // stage weights (fear, memory, acceptance), set by the portal crossings

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

// Zone weights (fear, memory, acceptance), summing to 1. The whole world shows
// the stage the visitor has reached through the portals; xz is kept so a
// spatial variation can come back later without touching the callers.
vec3 zoneWeights(vec2 xz){ return uZone; }
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
      float fl = 1.0;
      if (abs(cellL.x - uFlickerTile.x) < 0.5 && abs(cellL.y - uFlickerTile.y) < 0.5) fl = uFlickerAmt;
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
      float fl = 1.0;
      if (abs(cellL.x - uFlickerTile.x) < 0.5 && abs(cellL.y - uFlickerTile.y) < 0.5) fl = uFlickerAmt;
      vec3 H = normalize(L + V);
      acc += lightCol * atten * fl * pow(max(dot(N, H), 0.0), shin) * step(0.0, dot(N, L));
    }
  }
  return acc;
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
      float fl = 1.0;
      if (abs(cellL.x - uFlickerTile.x) < 0.5 && abs(cellL.y - uFlickerTile.y) < 0.5) fl = uFlickerAmt;
      vec3 c = lightCol * atten * fl;
      float nl = dot(N, L);
      diff += c * (max(nl, 0.0) * 0.7 + 0.3);
      spec += c * pow(max(dot(N, normalize(L + V)), 0.0), shin) * step(0.0, nl);
    }
  }
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
  white *= 1.0 - 0.5 * smoothstep(0.01, 0.0, crackN) * smoothstep(0.4, 0.65, vnoise(vec2(h, y) * 0.5));
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
// A real repeat: 0.53 m strips, half-drop, each tile a cabbage rose with four
// leaves and a sprig between. Ink sits slightly raised (embossed print), the
// paper has fibre, strips meet in a seam that lifts a little, the red plate
// is a hair out of register, and the whole sheet is sun-faded at the top.
float leafSDF(vec2 p, float ang){
  float c = cos(ang), s = sin(ang);
  p = mat2(c, -s, s, c) * p;
  p.x -= 0.075;
  return length(p * vec2(1.0, 2.6)) - 0.07;             // an elongated oval
}
// returns x: rose mask, y: leaf mask, z: leaf vein, w: petal shading
vec4 wallpaperMotif(vec2 q){
  vec2 cell = vec2(q.x / 0.53, q.y / 0.6);
  cell.y += 0.5 * mod(floor(cell.x), 2.0);              // half-drop repeat
  vec2 f = (fract(cell) - 0.5) * vec2(0.53, 0.6);       // metres inside the tile
  float r = length(f), a = atan(f.y, f.x);
  // rose: petals as rings wobbling with angle, shaded darker toward the heart
  float petals = sin(a * 5.0 + r * 55.0) * 0.5 + 0.5;
  float rose = smoothstep(0.085, 0.078, r + 0.012 * sin(a * 7.0));
  // four leaves on the diagonals, plus a small sprig in the tile corner
  float leaf = 1e3; float vein = 0.0;
  for (int k = 0; k < 4; k++) {
    float ang = 0.785 + float(k) * 1.5708;
    float d = leafSDF(f, ang);
    leaf = min(leaf, d);
    vec2 pr = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * f;
    vein = max(vein, smoothstep(0.004, 0.0, abs(pr.y)) * step(0.02, pr.x) * step(pr.x, 0.14));
  }
  vec2 fc = f - vec2(0.265, 0.3) * sign(f);
  leaf = min(leaf, length(fc * vec2(1.0, 1.8)) - 0.03);
  float leafMask = smoothstep(0.004, -0.004, leaf) * (1.0 - rose);
  return vec4(rose, leafMask, vein * leafMask, petals);
}
float memoryHeight(float h, float y){
  vec4 m = wallpaperMotif(vec2(h, y));
  return 0.6 * max(m.x, m.y) + 0.05 * vnoise(vec2(h, y) * 180.0); // raised ink + paper tooth
}
vec3 memoryWall(float h, float y, int oct, out float gloss){
  vec2 q = vec2(h, y);
  vec3 ground = vec3(0.045, 0.12, 0.07);
  float fibre = vnoise(q * vec2(90.0, 260.0)) * 0.5 + vnoise(q * 400.0) * 0.5;
  vec3 col = ground * (0.85 + 0.3 * fibre);
  vec4 m = wallpaperMotif(q);
  vec3 leafC = mix(vec3(0.10, 0.27, 0.14), vec3(0.20, 0.42, 0.24), fbm(q * 14.0, 2));
  col = mix(col, leafC, m.y);
  col = mix(col, vec3(0.06, 0.16, 0.08), m.z);           // leaf veins
  vec4 mr = wallpaperMotif(q + vec2(0.0025, -0.002));    // red plate slightly out of register
  vec3 roseC = mix(vec3(0.20, 0.02, 0.03), vec3(0.46, 0.05, 0.07), mr.w);
  col = mix(col, roseC, mr.x);
  // strip seams: a hairline shadow and a lifted edge catching light
  float sx = fract(h / 0.53);
  col *= 1.0 - 0.35 * smoothstep(0.004, 0.0, sx);
  col += 0.03 * smoothstep(0.012, 0.004, sx);
  col *= mix(0.9, 1.08, smoothstep(0.3, 2.6, y));        // sun-faded toward the top
  col *= 0.85 + 0.2 * fbm(q * 0.7, oct);                 // uneven ageing
  if (y < 0.12) col = vec3(0.06, 0.05, 0.04);            // dark skirting board
  gloss = 0.35 + 0.4 * max(m.x, m.y);                    // satin paper, ink a touch shinier
  return col;
}

// ── ACCEPTANCE: pale plaster ────────────────────────────────────────────────
float acceptHeight(float h, float y){ return 0.3 * vnoise(vec2(h, y) * 6.0); }
vec3 acceptWall(float h, float y, int oct, out float gloss){
  gloss = 0.12;
  return vec3(0.74, 0.74, 0.70) * (0.85 + 0.2 * fbm(vec2(h, y) * 0.9, oct));
}

float wallHeight(float h, float y, vec3 z){
  float v = 0.0;
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

  // ACCEPTANCE: the wall dissolves into lace; holes open where a slow noise
  // field drops under the zone weight and the light behind shows through.
  float lace = 0.0;
  if (z.z > 0.01) {
    float holes = fbm(vec2(h, y) * 0.9 + vec2(uTime * 0.015, 0.0), 3);
    float cut = z.z * 0.5 - 0.1;
    if (holes < cut) discard;
    lace = smoothstep(cut + 0.06, cut, holes);
  }

  vec3 col = vec3(0.0);
  float gloss = 0.0, g;
  if (z.x > 0.001) { col += z.x * fearWall(h, y, oct, g); gloss += z.x * g; }
  if (z.y > 0.001) { col += z.y * memoryWall(h, y, oct, g); gloss += z.y * g; }
  if (z.z > 0.001) { col += z.z * acceptWall(h, y, oct, g); gloss += z.z * g; }

  // bump: tilt the normal along the height field (embossed print, brush
  // ridges, plaster), so highlights break up the way they do on a real wall
  vec3 T = alongZ ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 Nb = N;
  if (uTier > 1) {                                      // relief only on the high tier
    float e = 0.004, h0 = wallHeight(h, y, z);
    float du = (wallHeight(h + e, y, z) - h0) / e, dv = (wallHeight(h, y + e, z) - h0) / e;
    Nb = normalize(N - (T * du + vec3(0.0, 1.0, 0.0) * dv) * 0.006);
  }

  // corners where wall meets floor and ceiling collect shadow; the edge of
  // the grime is ragged, and damp runs down from the top in streaks, so the
  // junction never reads as a ruler-straight line
  float rag = (vnoise(vec2(h * 2.2, 3.0)) - 0.5) * 0.35 + (vnoise(vec2(h * 14.0, 1.0)) - 0.5) * 0.06;
  float topGrime = smoothstep(PANEL_Y - 0.55 + rag, PANEL_Y - 0.02, y);
  float streak = smoothstep(0.62, 0.8, vnoise(vec2(h * 5.0, 0.0))) * smoothstep(PANEL_Y - 1.4 + rag * 2.0, PANEL_Y, y);
  float footRag = (vnoise(vec2(h * 2.6, 7.0)) - 0.5) * 0.18;
  float ao = mix(0.5, 1.0, smoothstep(0.0, 0.45 + footRag, y)) * (1.0 - 0.45 * topGrime) * (1.0 - 0.25 * streak);
  col = mix(col, col * vec3(0.85, 0.8, 0.66), topGrime * 0.6 + streak * 0.4);     // yellow-brown damp

  vec3 L = zoneLight(z);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float shin = mix(18.0, 60.0, z.x);                    // oil paint is tight, paper broad
  vec3 dSum, sSum;
  fixtureLightSpec(vWorldPos, Nb, V, L, shin, dSum, sSum);
  vec3 diffuse = col * (dSum + 0.04 * L + z.y * FILL_MEM * 1.6) * ao;
  vec3 spec = sSum * gloss * mix(0.25, 0.9, z.x) * ao;
  vec3 lit = rolloff(diffuse + spec);
  lit += z.z * (0.06 + 0.7 * lace) * LIGHT_ACC * 0.5;  // acceptance walls glow from inside, brightest at the lace rims
  gl_FragColor = vec4(lit, 1.0);
  #include <fog_fragment>
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

// MEMORY: a wall-to-wall red ornamental carpet, one medallion every 2.4 m.
vec3 memoryFloor(vec2 p, int oct){
  vec2 t = fract(p / 2.4) - 0.5;
  float edge = max(abs(t.x), abs(t.y));
  vec3 red = vec3(0.26, 0.03, 0.04), cream = vec3(0.50, 0.44, 0.40), dark = vec3(0.07, 0.02, 0.03);
  vec3 col = mix(red, dark, smoothstep(0.30, 0.50, edge) * 0.6);   // darker between medallions
  float r = length(t), ang = atan(t.y, t.x);
  float med = smoothstep(0.02, 0.0, abs(r - 0.18 - 0.05 * sin(ang * 8.0)));   // arabesque medallion
  med += smoothstep(0.015, 0.0, abs(r - 0.30 - 0.03 * cos(ang * 12.0)));
  col = mix(col, cream, clamp(med, 0.0, 1.0) * 0.8);
  vec2 g = fract(t * 9.0 + 0.5) - 0.5;                             // small motifs in the field
  col = mix(col, cream * 0.7, smoothstep(0.12, 0.05, abs(g.x) + abs(g.y)) * step(0.34, r) * step(r, 0.42));
  col *= 0.8 + 0.3 * vnoise(p * 80.0);                             // wool pile
  col *= 0.85 + 0.2 * fbm(p * 0.5, oct);                           // wear
  return col;
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
  col *= mix(mix(0.55, 1.0, smoothstep(0.42, 0.30, max(g.x, g.y))), 1.0, z.z + z.y); // carpet hides the seams

  vec3 L = zoneLight(z);
  col *= pow(vAO, 1.6);                                 // shadow and dust gathered at the walls
  vec3 lit = rolloff(col * (fixtureLight(vWorldPos, N, L) + 0.04 * L + z.y * FILL_MEM * 1.2));
  lit += z.z * 0.05 * LIGHT_ACC;
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

// MEMORY: a fabric pendant shade seen from below: dark rim, glowing inside,
// a small hot bulb at the centre.
vec4 pendant(vec2 m){
  float r = length(m);
  if (r > 0.3) return vec4(0.0);
  float rim = smoothstep(0.26, 0.28, r);
  float inside = smoothstep(0.26, 0.04, r);
  float bulb = smoothstep(0.075, 0.03, r);
  return vec4(vec3(0.05, 0.02, 0.02), mix(0.25 + 0.5 * inside, 0.05, rim) + bulb);
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
  vec3 matteAcc  = vec3(0.92, 0.92, 0.89);
  vec3 matte = (matteFear * z.x + matteMem * z.y + matteAcc * z.z) * ceilingAge(p, oct);
  matte = mix(matte * vec3(0.8, 0.74, 0.62), matte, pow(vAO, 0.7));   // yellowed soot toward the walls
  matte *= pow(vAO, 1.8);                                             // corner shadow

  vec3 L = zoneLight(z);
  vec3 lit = rolloff(matte * (0.12 * L + fixtureLight(vWorldPos, vec3(0.0, -1.0, 0.0), L) * 0.5));
  lit += z.z * 0.08 * LIGHT_ACC;
  // the ceiling around the nearest fixture catches its light (measured to
  // that fixture, not to this cell, so the glow is round, never a square)
  float bx, bz;
  int ix = nearestLine(p.x / ${CELL.toFixed(2)}, bx), iz = nearestLine(p.y / ${CELL.toFixed(2)}, bz);
  vec2 lampC = (vec2(bx + LINES[ix], bz + LINES[iz]) + 0.5) * ${CELL.toFixed(2)};
  vec2 dl = p - lampC;
  lit += L * exp(-dot(dl, dl) * 1.6) * 0.18 * fl * boost;

  vec4 fx = vec4(0.0);
  if (on > 0.5) {
    if (z.x > 0.001) fx += z.x * troffer(m);
    if (z.y > 0.001) fx += z.y * pendant(m);
    if (z.z > 0.001) fx += z.z * frosted(m);
  }
  float body = step(0.001, fx.r + fx.g + fx.b + fx.a);
  vec3 col = mix(lit, fx.rgb * (0.3 + 0.7 * L), body * 0.9);  // housing / shade
  col += L * 2.4 * fx.a * fl * boost;                          // emitted light
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
    uZone: { value: new THREE.Vector3(1, 0, 0) },
  };

  const mk = (fragmentShader) => new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), shared),
    vertexShader: VERT,
    fragmentShader,
    fog: true,
    side: THREE.DoubleSide,
  });

  const materials = { wall: mk(FRAG_WALL), floor: mk(FRAG_FLOOR), ceil: mk(FRAG_CEIL) };
  materials.ceil.vertexShader = VERT_CEIL;
  materials.floor.vertexShader = VERT_FLOOR;

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
      if (zone) shared.uZone.value.set(zone.fear, zone.memory, zone.accept);

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
          const tx = lampLineNear(camPos.x / CELL, Math.round(rand(-1.4, 1.4)));
          const tz = lampLineNear(camPos.z / CELL, Math.round(rand(-1.4, 1.4)));
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
