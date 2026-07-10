import * as THREE from 'three';
import { CEIL_H } from './world.js';

// ── conspace-rooms · materials.js ───────────────────────────────────────────
// Procedural shader materials for the decayed-gallery labyrinth. No texture
// files — everything is fBm/analytic GLSL keyed to *world* position, so surfaces
// are seamless across the streamed chunk boundaries (world.js gives every open
// cell global coords; two chunks that meet share the same field).
//
// Lighting is faked, not lit: no scene lights touch these materials. Ceiling
// fluorescent panels sit on a global 4.8m lattice; wall/floor fragments sum the
// distance falloff of the nearest 3×3 panels. One panel flickers now and then.
//
// Integration: World takes opts.materials and hangs these on its three shared
// material slots (wall/floor/ceiling) — geometry is untouched.

const SPACING = 4.8;                    // metres between fluorescent panels (= 4 cells)
const LIGHT_HEX = 0xdfe8dd;             // greenish-cold fluorescent white

// ── shared GLSL ─────────────────────────────────────────────────────────────
// value-noise fBm with a dynamic octave count (tier 0 runs cheaper), plus the
// analytic panel-light integrator. Injected into all three fragment shaders.
const LIB = /* glsl */`
#define SPACING ${SPACING.toFixed(3)}
#define PANEL_Y ${CEIL_H.toFixed(3)}

uniform float uTime;
uniform int   uTier;
uniform vec3  uLight;
uniform vec2  uFlickerTile;
uniform float uFlickerAmt;

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
// thin band around y = c, width w (moulding / rail lines)
float band(float y, float c, float w){ return smoothstep(w, 0.0, abs(y - c)); }

// summed illumination at P (normal N) from the 3×3 nearest ceiling panels.
vec3 panelLight(vec3 P, vec3 N){
  vec3 acc = vec3(0.0);
  vec2 base = floor(P.xz / SPACING);
  for (int dz = -1; dz <= 1; dz++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 tile = base + vec2(float(dx), float(dz));
      vec2 pc = (tile + 0.5) * SPACING;               // panel centre (xz)
      vec3 L = vec3(pc.x, PANEL_Y, pc.y) - P;
      float dist = length(L);
      float atten = 1.0 / (1.0 + 0.16 * dist + 0.10 * dist * dist);
      float ndl = max(dot(N, L / max(dist, 1e-3)), 0.0);
      ndl = ndl * 0.7 + 0.3;                           // soft wrap so walls aren't black
      float fl = 1.0;
      if (abs(tile.x - uFlickerTile.x) < 0.5 && abs(tile.y - uFlickerTile.y) < 0.5) fl = uFlickerAmt;
      acc += uLight * atten * ndl * fl;
    }
  }
  return acc;
}
// gentle filmic rolloff so panel pools don't clip to flat white
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

// ── wall: layered plaster + wainscot + moulding ─────────────────────────────
const FRAG_WALL = /* glsl */`
#include <common>
#include <fog_pars_fragment>
${LIB}
void main(){
  vec3 N = normalize(vNormal);
  // map onto the wall plane: horizontal axis is whichever of x/z the wall runs
  // along, vertical axis is world Y. Continuous across chunks.
  float h = abs(N.x) > abs(N.z) ? vWorldPos.z : vWorldPos.x;
  float y = vWorldPos.y;
  int oct = uTier > 0 ? 5 : 3;

  // plaster: broad tone + fine tooth
  float plaster = fbm(vec2(h, y) * 1.6, oct);
  float tooth   = fbm(vec2(h, y) * 7.5, uTier > 0 ? 3 : 2);
  float patch   = fbm(vec2(h, y) * 0.32 + 11.0, 3);   // one low-freq field → stain + peel

  vec3 sage = vec3(0.55, 0.60, 0.53);
  vec3 col = sage * (0.72 + 0.5 * plaster);
  col *= 0.92 + 0.10 * tooth;

  // brown water stains
  float stain = smoothstep(0.55, 0.82, patch);
  col = mix(col, vec3(0.30, 0.28, 0.22), stain * 0.55);
  // peeled plaster revealing darker substrate
  float peel = smoothstep(0.30, 0.16, patch);
  col = mix(col, vec3(0.42, 0.38, 0.32), peel * 0.5);

  // dark wainscot below 1.0m with vertical panel grooves
  if (y < 1.0) {
    col = mix(col, vec3(0.19, 0.16, 0.14), 0.85);
    float groove = smoothstep(0.03, 0.0, abs(fract(h / 0.6) - 0.5) - 0.44);
    col *= 1.0 - 0.45 * groove;
  }
  col *= 1.0 - 0.55 * band(y, 1.0, 0.03);              // wainscot cap rail shadow
  col = mix(col, col * 1.35, band(y, 2.6, 0.035));     // moulding highlight at 2.6m
  col *= 1.0 - 0.30 * band(y, 2.55, 0.014);            // its lower shadow
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.5, y));      // grime pooling at the base

  vec3 lit = rolloff(col * (panelLight(vWorldPos, N) + 0.04 * uLight));
  gl_FragColor = vec4(lit, 1.0);
  #include <fog_fragment>
}
`;

// ── floor: worn parquet + edge grime ────────────────────────────────────────
const FRAG_FLOOR = /* glsl */`
#include <common>
#include <fog_pars_fragment>
${LIB}
void main(){
  vec3 N = vec3(0.0, 1.0, 0.0);
  vec2 p = vWorldPos.xz;
  int oct = uTier > 0 ? 4 : 2;

  // parquet: 1.2m blocks, grain direction alternating in a checker
  vec2 cell = floor(p / 1.2);
  bool flip = mod(cell.x + cell.y, 2.0) > 0.5;
  vec2 lp = flip ? p.yx : p.xy;
  float grain = fbm(vec2(lp.x * 2.2, lp.y * 22.0), oct);
  vec3 wood = mix(vec3(0.27, 0.19, 0.12), vec3(0.18, 0.13, 0.08), grain);

  // plank seams every 0.6m + block seams every 1.2m
  float ps = fract(lp.x / 0.6);
  wood *= 1.0 - 0.5 * smoothstep(0.04, 0.0, min(ps, 1.0 - ps));
  vec2 bs = fract(p / 1.2);
  float bseam = min(min(bs.x, 1.0 - bs.x), min(bs.y, 1.0 - bs.y));
  wood *= 1.0 - 0.35 * smoothstep(0.03, 0.0, bseam);

  // grime creeps in along the 1.2m grid lines (where walls stand)
  vec2 g = abs(fract(p / 1.2) - 0.5);
  float edge = max(g.x, g.y);
  wood *= mix(0.55, 1.0, smoothstep(0.42, 0.30, edge));
  wood *= 0.85 + 0.15 * fbm(p * 0.6 + 5.0, 3);         // broad dirt mottling

  vec3 lit = rolloff(wood * (panelLight(vWorldPos, N) + 0.04 * uLight));
  gl_FragColor = vec4(lit, 1.0);
  #include <fog_fragment>
}
`;

// ── ceiling: matte off-white + emissive fluorescent panels ──────────────────
const FRAG_CEIL = /* glsl */`
#include <common>
#include <fog_pars_fragment>
${LIB}
void main(){
  vec2 p = vWorldPos.xz;
  int oct = uTier > 0 ? 3 : 2;

  vec2 tile = floor(p / SPACING);
  vec2 f = fract(p / SPACING) - 0.5;                    // -0.5..0.5 within a tile
  vec2 half = 0.5 * vec2(1.6, 0.45) / SPACING;          // panel footprint (m → tile units)
  float inPanel = step(abs(f.x), half.x) * step(abs(f.y), half.y);
  float diffuser = 0.6 + 0.4 * smoothstep(half.y, 0.0, abs(f.y)); // tube striping

  float fl = 1.0;
  if (abs(tile.x - uFlickerTile.x) < 0.5 && abs(tile.y - uFlickerTile.y) < 0.5) fl = uFlickerAmt;

  vec3 matte = vec3(0.66, 0.68, 0.64) * (0.85 + 0.15 * fbm(p * 3.0, oct));
  vec3 lit = rolloff(matte * (0.12 * uLight + panelLight(vWorldPos, vec3(0.0, -1.0, 0.0)) * 0.5));
  vec3 emis = uLight * (2.4 * diffuser) * fl;

  vec3 col = mix(lit, emis, inPanel);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

// ── factory ─────────────────────────────────────────────────────────────────
function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

export function createMaterials(quality) {
  // one shared uniform set — update once, all three materials follow
  const shared = {
    uTime: { value: 0 },
    uTier: { value: quality.tier },
    uLight: { value: new THREE.Color(LIGHT_HEX) },
    uFlickerTile: { value: new THREE.Vector2(1e5, 1e5) }, // off-grid = nothing flickering
    uFlickerAmt: { value: 1 },
  };

  const mk = (fragmentShader) => new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), shared),
    vertexShader: VERT,
    fragmentShader,
    fog: true,
    side: THREE.DoubleSide,
  });

  const materials = { wall: mk(FRAG_WALL), floor: mk(FRAG_FLOOR), ceil: mk(FRAG_CEIL) };

  // rare single-panel flicker: idle 20–60s, then a short irregular stutter
  let idle = rand(20, 60);
  let active = 0;

  return {
    materials,
    // camPos: THREE.Vector3 of the viewer, so the flicker lands on a panel nearby
    update(dt, t, camPos) {
      shared.uTime.value = t;
      shared.uTier.value = quality.tier;

      if (active > 0) {
        active -= dt;
        // irregular fluorescent stutter (two beating sines → hard dips)
        const s = Math.sin(t * 41.0) * Math.sin(t * 19.0);
        shared.uFlickerAmt.value = s > 0.15 ? 0.12 : 1.0;
        if (active <= 0) {
          shared.uFlickerAmt.value = 1;
          shared.uFlickerTile.value.set(1e5, 1e5);
          idle = rand(20, 60);
        }
      } else {
        idle -= dt;
        if (idle <= 0) {
          const tx = Math.round(camPos.x / SPACING) + Math.round(rand(-1.4, 1.4));
          const tz = Math.round(camPos.z / SPACING) + Math.round(rand(-1.4, 1.4));
          shared.uFlickerTile.value.set(tx, tz);
          active = rand(0.4, 1.1);
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
