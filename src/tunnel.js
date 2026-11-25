// ── conspace-rooms · tunnel.js ──────────────────────────────────────────────
// The crossing between stages: a veil of fog. Walking
// through a portal the fog thickens round the visitor until the walls melt
// into it; while it is thickest the stage changes (its colours blend in
// zones.js, its things are rebuilt unseen), then the fog thins and the new
// stage stands where the old walls were. The walk never stops.
// Two parts: `fog`, a multiplier main.js puts on the scene's fog density, and
// a thin wash in the fog's own colour drawn over the finished frame, so the
// post's glow and the sprites that ignore fog soften too. The walls and their
// pattern stay in sight the whole time; nothing goes black.
// The API (start, seek, render, active) is shared with the crossing's sound
// (audio.js) and the checks (tests/portal.mjs).
import * as THREE from 'three';
import { calm } from './calm.js';

const IN = 1.3, HOLD = 0.7, OUT = 1.9;                  // seconds: the fog gathering, standing thickest, thinning
const FOG_PEAK = 2.6;                                   // fog density × this at its thickest: the walls soften, their pattern still shows
const WASH_PEAK = 0.34;                                 // the wash's opacity at its thickest: a haze, never a cover
// the glow inside the veil, by the stage being entered: so it reads as fog, not as a fade to black
const TINT = [[0.16, 0.30, 0.21], [0.42, 0.13, 0.08], [0.88, 0.83, 0.80]];   // fear: phosphor haze, memory: candle smoke, light: milk
const TINT_MIX = 0.6;                                   // how far the fog's own colour turns to the tint at the thickest
export const TUNNEL_SWAP = IN;                          // the world underneath changes at the thickest
export const TUNNEL_TIMES = { inT: IN, hold: HOLD, out: OUT };   // for the crossing's sound (audio.js)

const FRAG = /* glsl */`
precision mediump float;
varying vec2 vUv;
uniform vec3  uColor;    // the fog's colour this frame
uniform float uWash;     // 0..1: how much of the view the fog has taken
uniform float uTime;
// one cheap value noise, so the fog breathes instead of lying flat
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vUv - 0.5;
  float edge = smoothstep(0.15, 0.75, length(p));                     // the rim goes first, the middle last
  float drift = noise(vUv * 3.0 + vec2(uTime * 0.25, -uTime * 0.15));   // slow banks of fog
  float a = uWash * (0.7 + 0.3 * edge) * (0.85 + 0.3 * drift);
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
}`;
const vertexShader = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export function createTunnel(renderer) {
  const uniforms = { uColor: { value: new THREE.Color() }, uWash: { value: 0 }, uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ fragmentShader: FRAG, vertexShader, uniforms, transparent: true, depthTest: false, depthWrite: false });
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  let t = -1, swap = null, done = null, frozen = false, k = 0;
  const tint = new THREE.Color();

  const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  // 0..1: how thick the veil is at time x into the crossing
  const thickness = x => x < IN ? smooth(x / IN) : x < IN + HOLD ? 1 : 1 - smooth((x - IN - HOLD) / OUT);

  return {
    get active() { return t >= 0; },
    // the view is never hidden whole: the world is always drawn
    get covering() { return false; },
    // the fog stands thickest: heavy work (shaders, canvases) may run now
    get thick() { return t >= IN * 0.8 && t < IN + HOLD; },
    // multiplier on the scene's fog density (main.js)
    get fog() { return 1 + (FOG_PEAK - 1) * k; },
    // the scene's fog colour turns toward the tint while the veil stands, so
    // far walls melt into a lit haze, never into black (main.js)
    tintFog(color) { if (k > 0) color.lerp(tint, TINT_MIX * k); },
    // from, to: stage numbers · onSwap: called at the thickest (change the
    // world there) · onDone: once the fog has thinned again
    start(from, to, onSwap, onDone) {
      if (t >= 0) { const f = swap, g = done; swap = done = null; f?.(); g?.(); }   // one still running ends first
      t = 0; swap = onSwap; done = onDone;
      tint.fromArray(TINT[to] || TINT[0]);
    },
    // checks only: hold the crossing at a moment (seconds), or let it go on (null)
    seek(x) { frozen = x != null; if (frozen) t = x; },
    // after the frame is finished: the wash over it while a crossing runs;
    // color: the scene's fog colour this frame
    render(dt, color) {
      if (t < 0) { k = 0; return; }
      if (!frozen) t += Math.min(dt, 0.1);
      if (swap && t >= TUNNEL_SWAP) { const f = swap; swap = null; f(); }
      k = thickness(t);
      uniforms.uTime.value = t;
      uniforms.uWash.value = WASH_PEAK * k * (calm.on ? 0.9 : 1);
      if (color) uniforms.uColor.value.copy(color);          // already tinted by tintFog
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
      renderer.autoClear = auto;
      if (t >= IN + HOLD + OUT) { t = -1; k = 0; const f = done; done = null; f?.(); }
    },
    dispose() { quad.geometry.dispose(); mat.dispose(); },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
