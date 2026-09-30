// ── conspace-rooms · tunnel.js ──────────────────────────────────────────────
// The crossing between stages. Walking through a portal the world is drawn
// in toward the middle of the view, closed over by a tunnel of streaming light
// strands; the flight goes on for a couple of seconds while the colours turn
// from the place being left to the place ahead (the far throat changes first),
// then the throat opens wide and the new stage is standing there.
// One full-screen quad drawn over the finished frame; the shader is closed
// form (a mapped cylinder and three value-noise lookups), no marching, so it
// costs the same on every machine. Idle it draws nothing.
import * as THREE from 'three';

// per stage: the strands, the glow in the throat, the dark between
const PALETTE = [
  { a: [0.30, 0.95, 0.55], b: [0.55, 1.00, 0.85], bg: [0.010, 0.030, 0.022] },   // fear: tube phosphor, sick teal
  { a: [1.00, 0.30, 0.16], b: [1.00, 0.72, 0.36], bg: [0.040, 0.010, 0.006] },   // memory: candle red, lamp amber
  { a: [1.00, 0.90, 0.78], b: [0.86, 0.80, 1.00], bg: [0.180, 0.160, 0.150] },   // light: warm white, lilac shadow
];

const IN = 0.75, HOLD = 1.6, OUT = 0.9;                 // seconds: closing in, the flight, opening out
export const TUNNEL_SWAP = IN + 0.05;                    // the world underneath changes once it is fully hidden

const FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2  uRes;
uniform float uTime;     // seconds since the crossing began
uniform float uClose;    // 0..1: the tunnel closing in from the rim over the world
uniform float uOpen;     // 0..1: the throat opening onto the new stage
uniform float uMix;      // 0..1: from the old stage's colours to the new one's
uniform float uSpeed;    // flight speed (lower with reduced motion)
uniform vec3  uA0, uB0, uBg0, uA1, uB1, uBg1;

// a small 3D value noise: hashed lattice corners, smooth blend
float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  // the throat drifts a little, so the tunnel bends as it is flown
  vec2 axis = vec2(sin(uTime * 0.9) * 0.06, cos(uTime * 0.7) * 0.04) * (1.0 - uOpen);
  vec2 q = p - axis;
  float r = length(q), ang = atan(q.y, q.x);

  // a cylinder seen from inside: depth goes as 1 / radius; the walk moves along it
  float depth = 0.32 / max(r, 0.015);
  float z = depth + uTime * uSpeed;

  // strands: a thin bright band where warped noise crosses its middle,
  // stretched along the tunnel, sampled seamlessly round it by (cos, sin)
  vec3 s = vec3(cos(ang) * 2.2, sin(ang) * 2.2, z * 0.16);
  float warp = noise(s * 1.2 + vec3(0.0, 0.0, uTime * 0.25));
  s.xy += (warp - 0.5) * 0.9;
  float v = noise(s * 2.3) * 0.7 + warp * 0.3;
  float strand = exp(-abs(v - 0.5) * 30.0);
  float fine = exp(-abs(noise(s * 5.1 + 7.0) - 0.5) * 42.0) * 0.5;

  // the colours: the far throat turns to the new stage first, then the walls
  float far = smoothstep(0.9, 5.0, depth);
  float k = clamp(uMix * 1.6 - 0.6 + far * 0.6, 0.0, 1.0);
  vec3 A = mix(uA0, uA1, k), B = mix(uB0, uB1, k), bg = mix(uBg0, uBg1, k);

  float fog = exp(-depth * 0.32);                       // strands dim with depth
  vec3 col = bg + (A * strand + B * fine) * fog * 1.6;
  // the throat's glow: the place ahead, seen at the end
  float throat = exp(-r * 7.0);
  col += mix(uB0, uB1, clamp(uMix * 1.4, 0.0, 1.0)) * throat * 1.4;
  // faint scanlines, so the crossing keeps the television of the rest
  col *= 0.94 + 0.06 * sin(vUv.y * uRes.y * 1.5);

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
  const mat = new THREE.ShaderMaterial({
    fragmentShader: FRAG,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    uniforms, transparent: true, depthTest: false, depthWrite: false,
  });
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const size = new THREE.Vector2();
  let t = -1, swap = null, done = null, frozen = false;

  const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const set = (u, c) => uniforms[u].value.fromArray(c);

  return {
    get active() { return t >= 0; },
    // from, to: stage numbers · onSwap: called once the view is fully covered
    // (change the world there) · onDone: after it has opened again
    start(from, to, onSwap, onDone) {
      if (t >= 0) { const f = swap, g = done; swap = done = null; f?.(); g?.(); }   // one still running ends first
      const a = PALETTE[from] || PALETTE[0], b = PALETTE[to] || PALETTE[0];
      set('uA0', a.a); set('uB0', a.b); set('uBg0', a.bg);
      set('uA1', b.a); set('uB1', b.b); set('uBg1', b.bg);
      uniforms.uSpeed.value = calm.matches ? 1.5 : 5.0;
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
