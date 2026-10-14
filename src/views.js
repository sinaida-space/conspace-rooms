// ── conspace-rooms · views.js ───────────────────────────────────────────────
// What is out the windows: ninety pictures (assets/windows/NN.webp, 1024 px on
// the long side). Flowers behind frosted glass for the light's windows, the
// night blocks of flats for grandmother's room, and the darkest, reddest and
// greenest of the blocks for the hospital's few windows, gone grey with dirt.
// Each kind is dealt from its own deck, shuffled once a visit: nothing comes
// twice until the deck runs out.
//
// A window pane is drawn by viewMaterial(): the picture cut to the pane's
// shape (aOff picks which part of it, so windows along one wall look onto
// different parts of one view), a little parallax as the visitor walks past
// (the view is further off than the glass), and the lights out there
// breathing a little: one texture read and one value noise a pixel.
// Pictures are fetched when a pane first wants them and shared between panes.
import * as THREE from 'three';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const FEAR = [34, 46, 47, 48, 53, 56, 75, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90];
export const VIEWS = {
  light: range(1, 33),                                              // flowers behind frosted glass
  fear: FEAR,
  home: range(34, 90).filter(n => !FEAR.includes(n)),               // grandmother's window: the blocks across the yard, lit
};

// the visit's decks: shuffled when the page opens. At most LIVE pictures of
// a kind are held at once (a 1024 px picture is ~5 MB on the GPU): past that,
// a new window looks out on one already here, far enough off not to be noticed.
const LIVE = 6;
const decks = {}, last = {};
export function nextView(kind) {
  const live = [...cache.keys()].filter(n => VIEWS[kind].includes(n));
  if (live.length >= LIVE) return live[Math.floor(Math.random() * live.length)];
  if (!decks[kind]?.length) {
    const d = [...VIEWS[kind]];
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    if (d[d.length - 1] === last[kind]) [d[0], d[d.length - 1]] = [d[d.length - 1], d[0]];
    decks[kind] = d;
  }
  return (last[kind] = decks[kind].pop());
}

// ── the pictures, shared, freed when the last pane lets go ──────────────────
const cache = new Map();   // n → { tex, aspect, users, ready }
function take(n, onReady) {
  let e = cache.get(n);
  if (!e) {
    e = { tex: new THREE.Texture(), aspect: 1, users: 0, ready: false, waiting: [] };
    cache.set(n, e);
    fetch(`assets/windows/${String(n).padStart(2, '0')}.webp`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then(b => createImageBitmap(b, { imageOrientation: 'flipY' }))   // decoded off the main thread, turned as the GPU wants it
      .then(bmp => {
        Object.assign(e.tex, { image: bmp, flipY: false, colorSpace: THREE.NoColorSpace, anisotropy: 4, generateMipmaps: true });
        e.tex.minFilter = THREE.LinearMipmapLinearFilter;
        e.tex.needsUpdate = true;
        e.aspect = bmp.width / bmp.height;
        e.ready = true;
        for (const f of e.waiting.splice(0)) f(e);
      })
      .catch(() => {});                                  // no picture: the pane stays dim glass
  }
  e.users++;
  if (e.ready) onReady(e); else e.waiting.push(onReady);
  return () => {
    if (--e.users > 0) return;
    cache.delete(n);
    e.tex.image?.close?.();
    e.tex.dispose();
  };
}

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute vec3 aTan;      // along the pane, horizontal, in the mesh's own space
attribute float aOff;     // 0..1: which part of the picture this pane shows
varying vec2 vUv;
varying vec2 vPar;
varying float vOff;
void main(){
  vUv = uv; vOff = aOff;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // parallax: the view seen past the glass shifts against it as the eye moves
  vec3 t = normalize(mat3(modelMatrix) * aTan), v = wp.xyz - cameraPosition, n = cross(t, vec3(0.0, 1.0, 0.0));
  vPar = vec2(dot(v, t), v.y) / max(abs(dot(v, n)), 0.4);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform float uHas;        // 0 until the picture has come
uniform float uImg;        // the picture's width / height
uniform float uPane;       // the pane's width / height
uniform float uTime;
uniform float uDirt;       // 0 clean .. 1 the hospital's grey, dirty glass
uniform vec3  uGlass;      // what the pane shows before the picture comes
varying vec2 vUv;
varying vec2 vPar;
varying float vOff;
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main(){
  // cover the pane: the picture cut to its shape, 0.86 of it so parallax has room
  vec2 s = uImg > uPane ? vec2(uPane / uImg, 1.0) : vec2(1.0, uImg / uPane);
  s *= 0.86;
  vec2 o = (1.0 - s) * vec2(vOff, 0.5);
  vec2 uv = clamp(o + vUv * s + vPar * 0.035, 0.002, 0.998);
  vec3 col = texture2D(uMap, uv).rgb;
  // the lights out there breathe: the bright parts brighten and dim, slowly, each its own way
  float n = vnoise(uv * 14.0 + vec2(uTime * 0.21, -uTime * 0.13));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col *= 1.0 + (n - 0.5) * 0.22 * smoothstep(0.35, 0.8, lum);
  // dirt: grey and dim, with smears where the rag never reached
  vec3 grey = vec3(lum) * vec3(0.52, 0.55, 0.53);
  col = mix(col, grey * (0.75 + 0.5 * n), uDirt * 0.7) * (1.0 - uDirt * 0.35);
  gl_FragColor = vec4(mix(uGlass, col, uHas), 1.0);
  #include <fog_fragment>
}`;

// One pane material showing picture n. uTime is shared by passing it in.
// Disposing the material (or material.userData.release()) lets the picture go.
export function viewMaterial(n, { pane = 0.69, dirt = 0, time, fog = true, glass = 0x1a1d22 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uMap: { value: null }, uHas: { value: 0 }, uImg: { value: 1 }, uPane: { value: pane }, uTime: { value: 0 },
      uDirt: { value: dirt }, uGlass: { value: new THREE.Color(glass) },
    }]),
    vertexShader: VERT, fragmentShader: FRAG, fog,
  });
  if (time) m.uniforms.uTime = time;
  const release = take(n, e => { m.uniforms.uMap.value = e.tex; m.uniforms.uImg.value = e.aspect; m.uniforms.uHas.value = 1; });
  let held = true;
  m.addEventListener('dispose', () => { if (held) { held = false; release(); } });   // however the material goes, the picture is let go once
  m.userData.view = n;
  m.userData.release = () => m.dispose();
  return m;
}

// The attributes a pane's geometry needs: its direction along the wall and
// which part of the picture it shows.
export function paneAttributes(geo, tx, tz, off) {
  const n = geo.attributes.position.count;
  geo.setAttribute('aTan', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [tx, 0, tz]).flat(), 3));
  geo.setAttribute('aOff', new THREE.Float32BufferAttribute(new Array(n).fill(off), 1));
  return geo;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
