import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';
import { roundedBox } from './geom.js';
import { hash2i, mulberry32, CONSPACE_SEED } from './world.js';
import { t } from './i18n.js';
import { memoryShape } from './props.js';

// ── conspace-rooms · drowned.js ─────────────────────────────────────────────
// What fear and memory left on the flooded floor of the acceptance stage: a
// cup on its side, a vinyl record, a drip stand lying down, a photograph, a
// «Электроника» clock stopped at 12:24, a tear-off calendar on the 24th, and
// now and then a letter — once in a while the one with the epigraph, legible
// only once the visitor has stood still long enough for the water to settle.
// Everything here lies flat (< 5 cm), so none of it needs a collision box.
// Placement is a pure function of the chunk and SEED_DROWN, exactly like
// soulpath.js's own scattered things; soulpath calls build() per chunk in
// the acceptance stage and dispose()s it when the stage or the chunk ends.

const SEED_DROWN = CONSPACE_SEED ^ 0xd120;
const STEEL = 0xa9adab;

function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const pick = (list, r) => list[Math.floor(r * list.length) % list.length];

// a vertex-coloured part, rgb + gloss in alpha, same convention as props.js
function put(parts, geo, hex, gloss, m) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const pos = g.attributes.position, cc = new THREE.Color(), col = new Float32Array(pos.count * 4);
  cc.setHex(hex, THREE.LinearSRGBColorSpace);
  for (let i = 0; i < pos.count; i++) col.set([cc.r, cc.g, cc.b, gloss], i * 4);
  if (m) g.applyMatrix4(m);
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  parts.push(g);
}

// ── small shapes, built once and shared by every chunk ──────────────────────
let CUP = null, RECORD = null, DRIP = null;
function cupGeo() {
  if (CUP) return CUP;
  const parts = [];
  put(parts, cyl(0.026, 0.023, 0.05, 14), 0xe9e4d6, 0.55, M(0, 0.026, 0, Math.PI / 2));           // fallen on its side
  put(parts, new THREE.TorusGeometry(0.015, 0.004, 6, 12, Math.PI), 0xe9e4d6, 0.5, M(0.028, 0.026, 0, 0, 0, Math.PI / 2));
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  CUP = geo;
  return CUP;
}
function recordGeo() {
  if (RECORD) return RECORD;
  const parts = [];
  put(parts, cyl(0.145, 0.145, 0.003, 32), 0x0a0a0a, 0.7, M(0, 0.0015, 0));
  put(parts, cyl(0.026, 0.026, 0.004, 20), 0xa8202a, 0.5, M(0, 0.0035, 0));
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  RECORD = geo;
  return RECORD;
}
function dripStandGeo() {
  if (DRIP) return DRIP;
  const parts = [];
  put(parts, cyl(0.008, 0.008, 1.1, 8), STEEL, 0.65, M(0, 0.008, 0, 0, 0, Math.PI / 2));           // the pole, lying down
  put(parts, new THREE.TorusGeometry(0.026, 0.005, 6, 12), STEEL, 0.6, M(0.53, 0.008, 0, 0, Math.PI / 2));  // the hook
  put(parts, roundedBox(0.07, 0.008, 0.12, 0.008), 0xdfe6ea, 0.3, M(0.6, 0.006, 0, 0, 0.2, 0));    // the bag, collapsed
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  DRIP = geo;
  return DRIP;
}

// ── canvas textures ──────────────────────────────────────────────────────────
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// «Электроника»: black-and-silver box, red LED segments stuck at 12:24
function clockTexture() {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#120a0a'; g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#3a3a3a'; g.lineWidth = 2; g.strokeRect(4, 4, 120, 56);
  g.font = '700 34px "Courier New", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff2a1c'; g.shadowBlur = 11;
  g.fillStyle = '#ff2a1c';
  g.fillText('12:24', 64, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function calendarTexture() {
  const [c, g] = canvas(96, 128);
  g.fillStyle = '#e9dfc4'; g.fillRect(0, 0, 96, 128);
  g.fillStyle = '#b3141a'; g.fillRect(0, 0, 96, 13);                     // a thin red top band
  g.fillStyle = '#241a12';
  g.font = '700 54px Georgia, "Times New Roman", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('24', 48, 66);
  g.font = '13px "Courier New", monospace';
  g.fillText(t('drownedMonth'), 48, 108);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// a faded warm-grey photograph, white-bordered, two soft figures never quite
// resolving into faces
function photoTexture() {
  const [c, g] = canvas(96, 72);
  g.fillStyle = '#f1ebdd'; g.fillRect(0, 0, 96, 72);
  const gr = g.createRadialGradient(48, 32, 4, 48, 32, 48);
  gr.addColorStop(0, '#c8b696'); gr.addColorStop(1, '#5a4c3c');
  g.fillStyle = gr; g.fillRect(8, 6, 80, 52);
  g.fillStyle = 'rgba(58, 48, 38, 0.55)';
  g.beginPath(); g.ellipse(38, 40, 8, 18, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(58, 42, 7, 16, 0, 0, 7); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// a folded letter, jittered handwriting on aged paper, the way scrawlTexture
// does it in soulpath.js
function letterTexture(text) {
  const [c, g] = canvas(512, 340);
  g.fillStyle = '#efe6cc'; g.fillRect(0, 0, 512, 340);
  g.fillStyle = 'rgba(38, 30, 18, 0.85)';
  g.font = '26px "Departure Mono", monospace';
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const tt = line ? line + ' ' + w : w;
    if (g.measureText(tt).width > 440 && line) { lines.push(line); line = w; } else line = tt;
  }
  if (line) lines.push(line);
  let y = 56;
  for (const ln of lines) {
    let x = 34;
    for (const ch of ln) {
      const w = g.measureText(ch).width;
      g.save();
      g.translate(x + w / 2, y + (Math.random() - 0.5) * 4);
      g.rotate((Math.random() - 0.5) * 0.1);
      g.fillText(ch, -w / 2, 0);
      g.restore();
      x += w * (0.95 + Math.random() * 0.08);
    }
    y += 42;
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const GENERIC_LETTER = ['…the tram still runs past our window…', '…I kept your scarf, it still smells of you…', '…write when you can, I wait by the door…', '…the frost came early this year…'];

// ── the epigraph letter's shader ─────────────────────────────────────────────
// A single set of uniforms, shared by every epigraph letter: uCalm follows
// window.__app.water.calm (or the stage's own fallback), so the text sharpens
// the moment the visitor stops walking, everywhere at once.
const LETTER_U = { uTime: { value: 0 }, uCalm: { value: 1 } };
const LETTER_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const LETTER_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform float uTime, uCalm;
varying vec2 vUv;
void main(){
  float blur = 1.0 - uCalm;                 // crisp once the water round the visitor has settled
  vec2 ripple = vec2(sin(vUv.y * 30.0 + uTime * 1.6), cos(vUv.x * 26.0 + uTime * 1.3)) * 0.012 * blur;
  vec4 col = vec4(0.0);
  float n = 0.0;
  for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++) {
    vec2 o = vec2(float(dx), float(dy)) * 0.0045 * blur;
    col += texture2D(uMap, vUv + ripple + o);
    n += 1.0;
  }
  gl_FragColor = col / n;
  #include <fog_fragment>
}`;

// ── placing the shapes ───────────────────────────────────────────────────────
function buildClock(group, atmo, p, rot) {
  const out = [];
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.075).rotateX(-Math.PI / 2),
    atmo.prop({ map: clockTexture(), glow: 0.85, rust: 0 }));
  face.position.set(p.x, 0.011, p.z);
  face.rotation.y = rot;
  group.add(face); out.push(face);
  return out;
}

function buildCalendar(group, atmo, p, rot, r) {
  const out = [];
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.095, 0.125).rotateX(-Math.PI / 2),
    atmo.prop({ map: calendarTexture(), rust: 0 }));
  sheet.position.set(p.x, 0.009, p.z);
  sheet.rotation.y = rot;
  group.add(sheet); out.push(sheet);
  const loose = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.05).rotateX(-Math.PI / 2),
    atmo.prop({ color: 0xe9dfc4, rust: 0 }));
  loose.position.set(p.x + 0.1 + r() * 0.04, 0.006, p.z + 0.06 - r() * 0.05);
  loose.rotation.y = r() * Math.PI * 2;
  loose.rotation.z = (r() - 0.5) * 0.3;
  group.add(loose); out.push(loose);
  return out;
}

function buildPhoto(group, atmo, p, rot) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.07).rotateX(-Math.PI / 2),
    atmo.prop({ map: photoTexture(), rust: 0 }));
  m.position.set(p.x, 0.006, p.z);
  m.rotation.y = rot;
  group.add(m);
  return [m];
}

function buildLetter(group, atmo, p, rot, r, epigraph) {
  const text = epigraph ? t('drownedLetter') + '   ' + t('drownedLetterRef') : pick(GENERIC_LETTER, r());
  const tex = letterTexture(text);
  let mat;
  if (epigraph) {
    mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: tex } }]),
      vertexShader: LETTER_VERT, fragmentShader: LETTER_FRAG, fog: true,
    });
    mat.uniforms.uTime = LETTER_U.uTime; mat.uniforms.uCalm = LETTER_U.uCalm;
  } else {
    mat = atmo.prop({ map: tex, rust: 0 });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.25).rotateX(-Math.PI / 2), mat);
  m.position.set(p.x, 0.008, p.z);
  m.rotation.y = rot;
  m.rotation.z = (r() - 0.5) * 0.22;
  group.add(m);
  return [m];
}

export function createDrowned(atmo, quality) {
  const low = quality.tier === 0;
  const mat = atmo.prop({ vertexColors: true, rust: 0.1 });

  return {
    // group: the chunk's group · cx, cz: chunk coords · spots: [{x, z}] open
    // floor cell centres on the corridor lattice, already clear of walls,
    // reserved cells and the hospital's islands (soulpath's _drownSpots)
    build(group, cx, cz, spots) {
      if (!spots.length) return { dispose() {} };
      const r = mulberry32(hash2i(SEED_DROWN, cx, cz));
      const pool = spots.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const used = [];
      const takeSpot = () => {
        for (let k = 0; k < pool.length; k++) {
          const s = pool[k];
          if (used.every(u => Math.hypot(u.x - s.x, u.z - s.z) > 0.9)) { pool.splice(k, 1); used.push(s); return s; }
        }
        return null;
      };
      // 0.3–0.5 m off the corridor's own middle line, so the walk passes beside it
      const settle = s => { const a = r() * Math.PI * 2, d = 0.3 + r() * 0.2; return { x: s.x + Math.cos(a) * d, z: s.z + Math.sin(a) * d }; };

      const created = [];
      const parts = [];

      // clock, calendar, letter: about one chunk in three, independently
      if (r() < 1 / 3) { const s = takeSpot(); if (s) created.push(...buildClock(group, atmo, settle(s), r() * Math.PI * 2)); }
      if (r() < 1 / 3) { const s = takeSpot(); if (s) created.push(...buildCalendar(group, atmo, settle(s), r() * Math.PI * 2, r)); }
      const letterHere = r() < 1 / 3, epigraph = letterHere && r() < 1 / 4;
      if (letterHere) { const s = takeSpot(); if (s) created.push(...buildLetter(group, atmo, settle(s), r() * Math.PI * 2, r, epigraph)); }

      // 2–4 small things a chunk (1–2 on tier 0), the specials above included
      const budget = low ? 1 + Math.round(r()) : 2 + Math.round(r() * 2);
      const kinds = ['cup', 'record', 'dripstand', 'photo', 'nevalyashka', 'slippers', 'jars'];
      for (let n = used.length; n < budget; n++) {
        const s = takeSpot();
        if (!s) break;
        const kind = kinds[Math.floor(r() * kinds.length)];
        const p = settle(s), yaw = r() * Math.PI * 2;
        if (kind === 'cup') parts.push(cupGeo().clone().applyMatrix4(M(p.x, 0.01, p.z, (r() - 0.5) * 0.3, yaw)));
        else if (kind === 'record') parts.push(recordGeo().clone().applyMatrix4(M(p.x, 0.006, p.z, 0, yaw)));
        else if (kind === 'dripstand') parts.push(dripStandGeo().clone().applyMatrix4(M(p.x, 0.01, p.z, 0, yaw)));
        else if (kind === 'photo') created.push(...buildPhoto(group, atmo, p, yaw));
        else parts.push(memoryShape(kind).clone().applyMatrix4(M(p.x, 0.005, p.z, Math.PI / 2 + (r() - 0.5) * 0.2, yaw, (r() - 0.5) * 0.3)));
      }

      if (parts.length) {
        const geo = mergeGeometries(parts);
        for (const g of parts) g.dispose();
        const m = new THREE.Mesh(geo, mat);
        m.userData.keepMaterial = true;               // shared: the chunk disposes only the geometry
        group.add(m);
        created.push(m);
      }

      return {
        dispose() {
          for (const m of created) {
            group.remove(m);
            m.geometry?.dispose();
            if (!m.userData.keepMaterial) {
              m.material.map?.dispose();
              m.material.uniforms?.uMap?.value?.dispose?.();   // each canvas texture is its own, freed with the mesh
              m.material.dispose();                            // the shared uTime/uCalm uniforms are just numbers, fine to keep referencing
            }
          }
        },
      };
    },
    // called once a frame while the acceptance stage is active: water is
    // window.__app.water or the fallback soulpath hands it while that task
    // has not landed yet.
    update(time, water) {
      LETTER_U.uTime.value = time;
      LETTER_U.uCalm.value = water?.calm ?? 1;
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
