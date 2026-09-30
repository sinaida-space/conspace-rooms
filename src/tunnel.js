// ── conspace-rooms · tunnel.js ──────────────────────────────────────────────
// The crossing between stages. Walking through a portal the world is drawn
// in toward the middle of the view, closed over by a tunnel of streaming light
// strands; the flight goes on for a couple of seconds while the colours turn
// from the place being left to the place ahead (the far throat changes first),
// then the throat opens wide and the new stage is standing there.
// Drawn at half size (a quarter of the pixels) and stretched over the finished
// frame: a mapped cylinder and two 2D value-noise lookups, no marching. While
// it covers the whole view the world under it is not drawn at all (covering,
// main.js), which is most of what a crossing saves. Idle it draws nothing.
import * as THREE from 'three';
import { calm } from './calm.js';

// per stage: the strands, the glow in the throat, the dark between
const PALETTE = [
  { a: [0.30, 0.95, 0.55], b: [0.55, 1.00, 0.85], bg: [0.010, 0.030, 0.022] },   // fear: tube phosphor, sick teal
  { a: [1.00, 0.30, 0.16], b: [1.00, 0.72, 0.36], bg: [0.040, 0.010, 0.006] },   // memory: candle red, lamp amber
  { a: [1.00, 0.90, 0.78], b: [0.86, 0.80, 1.00], bg: [0.180, 0.160, 0.150] },   // light: warm white, lilac shadow
];

const IN = 0.75, HOLD = 1.6, OUT = 0.9;                 // seconds: closing in, the flight, opening out
export const TUNNEL_SWAP = IN + 0.05;
export const TUNNEL_TIMES = { inT: IN, hold: HOLD, out: OUT };   // for the crossing's sound (audio.js)                    // the world underneath changes once it is fully hidden

const FRAG = /* glsl */`
precision mediump float;
varying vec2 vUv;
uniform vec2  uRes;
uniform float uTime;     // seconds since the crossing began
uniform float uClose;    // 0..1: the tunnel closing in from the rim over the world
uniform float uOpen;     // 0..1: the throat opening onto the new stage
uniform float uMix;      // 0..1: from the old stage's colours to the new one's
uniform float uSpeed;    // flight speed (lower with reduced motion)
uniform vec3  uA0, uB0, uBg0, uA1, uB1, uBg1;

// a small 2D value noise, periodic in x over ROUND cells so it closes
// seamlessly round the tunnel (x is the angle)
const float ROUND = 16.0;
float hash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, ROUND), x1 = mod(i.x + 1.0, ROUND);
  return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), f.x), mix(hash(vec2(x0, i.y + 1.0)), hash(vec2(x1, i.y + 1.0)), f.x), f.y);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  // the throat drifts a little, so the tunnel bends as it is flown
  vec2 axis = vec2(sin(uTime * 0.9) * 0.06, cos(uTime * 0.7) * 0.04) * (1.0 - uOpen);
  vec2 q = p - axis;
  float r = length(q), turn = atan(q.y, q.x) / 6.2832 + 0.5;   // 0..1 round the tunnel

  // a cylinder seen from inside: depth goes as 1 / radius; the walk moves along it
  float depth = 0.32 / max(r, 0.015);
  float z = depth + uTime * uSpeed;

  // strands: a thin bright band where warped noise crosses its middle,
  // stretched along the tunnel; two lookups, the second bent by the first
  float warp = noise(vec2(turn * ROUND, z * 0.12 + uTime * 0.25));
  float v = noise(vec2(turn * ROUND + (warp - 0.5) * 2.0, z * 0.22)) * 0.7 + warp * 0.3;
  float strand = exp(-abs(v - 0.5) * 30.0);

  // the colours: the far throat turns to the new stage first, then the walls
  float far = smoothstep(0.9, 5.0, depth);
  float k = clamp(uMix * 1.6 - 0.6 + far * 0.6, 0.0, 1.0);
  vec3 A = mix(uA0, uA1, k), bg = mix(uBg0, uBg1, k);

  float fog = exp(-depth * 0.32);                       // strands dim with depth
  vec3 col = bg + A * strand * fog * 1.8;
  // the throat's glow: the place ahead, seen at the end
  float throat = exp(-r * 7.0);
  col += mix(uB0, uB1, clamp(uMix * 1.4, 0.0, 1.0)) * throat * 1.4;

  // coverage: closing in from the rim, then a hole opening from the middle
  float rim = length(p) / (0.5 * length(vec2(uRes.x / uRes.y, 1.0)));   // 1 at the corners
  float cover = smoothstep(1.0 - uClose * 1.15, 1.08 - uClose * 1.15, rim);
  float hole = uOpen * 1.25;
  cover *= smoothstep(hole - 0.12, hole, rim);
  gl_FragColor = vec4(col, cover);
}`;


export function createTunnel(renderer) {
  const uniforms = {
    uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uClose: { value: 0 }, uOpen: { value: 0 }, uMix: { value: 0 }, uSpeed: { value: 1.6 },
  };
  for (const n of ['uA0', 'uB0', 'uBg0', 'uA1', 'uB1', 'uBg1']) uniforms[n] = { value: new THREE.Vector3() };
  const vertexShader = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mat = new THREE.ShaderMaterial({ fragmentShader: FRAG, vertexShader, uniforms, transparent: true, depthTest: false, depthWrite: false });
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  const size = new THREE.Vector2();
  let t = -1, swap = null, done = null, frozen = false;

  const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const set = (u, c) => uniforms[u].value.fromArray(c);

  return {
    get active() { return t >= 0; },
    // the view is fully hidden (the flight): the world need not be drawn
    get covering() { return t >= IN && t < IN + HOLD - 0.1; },   // a frame's step (≤ 0.1 s) short, so the throat never opens on an undrawn frame
    // from, to: stage numbers · onSwap: called once the view is fully covered
    // (change the world there) · onDone: after it has opened again
    start(from, to, onSwap, onDone) {
      if (t >= 0) { const f = swap, g = done; swap = done = null; f?.(); g?.(); }   // one still running ends first
      const a = PALETTE[from] || PALETTE[0], b = PALETTE[to] || PALETTE[0];
      set('uA0', a.a); set('uB0', a.b); set('uBg0', a.bg);
      set('uA1', b.a); set('uB1', b.b); set('uBg1', b.bg);
      uniforms.uSpeed.value = calm.on ? 1.5 : 5.0;
      t = 0; swap = onSwap; done = onDone;
    },
    // checks only: hold the crossing at a moment (seconds), or let it go on (null)
    seek(x) { frozen = x != null; if (frozen) t = x; },
    // after the frame is finished: draws over it while a crossing runs
    render(dt) {
      if (t < 0) return;
      if (!frozen) t += Math.min(dt, 0.1);
      if (swap && t >= TUNNEL_SWAP) { const f = swap; swap = null; f(); }
      const end = IN + HOLD + OUT;
      uniforms.uTime.value = t;
      uniforms.uClose.value = smooth(t / IN);
      uniforms.uOpen.value = smooth((t - IN - HOLD) / OUT);
      uniforms.uMix.value = smooth((t - IN * 0.5) / (HOLD + IN * 0.5));
      renderer.getDrawingBufferSize(size);
      uniforms.uRes.value.copy(size);
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
      renderer.autoClear = auto;
      if (t >= end) { t = -1; const f = done; done = null; f?.(); }
    },
    dispose() { quad.geometry.dispose(); mat.dispose(); },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
