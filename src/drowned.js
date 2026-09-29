import * as THREE from 'three';
import { roundedBox } from './geom.js';
import { hash2i, mulberry32, CONSPACE_SEED } from './world.js';
import { t, getLang } from './i18n.js';
import { record } from './placement.js';

// ── conspace-rooms · drowned.js ─────────────────────────────────────────────
// What fear and memory left on the flooded floor of the acceptance stage: a
// «Электроника» clock stopped at 12:24, a tear-off calendar on the 24th, a
// letter (once in a while the one with the epigraph, legible only once the
// visitor has stood still long enough for the water to settle), a faded
// photograph, a vinyl record. Five hero things, no filler: each gets a real
// canvas-drawn face, a thin bevelled body under it, and a small tilt, as if
// it had actually settled there rather than been dropped by a level editor.
// At most two per chunk (one on tier 0), each on open floor; once in a while
// a letter or photograph is loose on the water instead, turning slowly.
// Placement is a pure function of the chunk and SEED_DROWN, exactly like
// soulpath.js's own scattered things; soulpath calls build() per chunk in
// the acceptance stage and dispose()s it when the stage or the chunk ends.

const SEED_DROWN = CONSPACE_SEED ^ 0xd120;
const pick = (list, r) => list[Math.floor(r * list.length) % list.length];

// ── canvas textures ──────────────────────────────────────────────────────────
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// «Электроника»: black plastic, a silver brand strip, red LED segments stuck
// at 12:24. The canvas keeps the real clock's 0.32 x 0.12 m proportion so the
// digits never stretch; they fill most of the face so 12:24 still reads from
// standing height once the mesh sits underfoot.
function clockTexture() {
  const [c, g] = canvas(160, 60);
  g.fillStyle = '#120a0a'; g.fillRect(0, 0, 160, 60);
  g.strokeStyle = '#3a3a3a'; g.lineWidth = 2; g.strokeRect(4, 4, 152, 52);
  g.font = '700 46px "Courier New", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff2a1c'; g.shadowBlur = 20;
  g.fillStyle = '#ff2a1c';
  g.fillText('12:24', 80, 27);
  g.shadowBlur = 26; g.fillText('12:24', 80, 27); // a second, brighter pass over the first
  g.shadowBlur = 0;
  g.fillStyle = '#c7ccd0';                          // the brand plaque, a silver strip under the display
  g.fillRect(46, 47, 68, 5);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// a tear-off pad: a few page edges under the top sheet, «24» and the month
// printed on it, red top band like the real Soviet ones
function calendarTexture() {
  const [c, g] = canvas(96, 128);
  g.fillStyle = '#e9dfc4'; g.fillRect(0, 0, 96, 128);
  g.fillStyle = '#b3141a'; g.fillRect(0, 0, 96, 13);
  g.strokeStyle = 'rgba(80, 64, 40, 0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(2, 122 - i * 2); g.lineTo(94, 122 - i * 2); g.stroke(); } // the stack, peeking out
  g.fillStyle = '#241a12';
  g.font = '700 54px Georgia, "Times New Roman", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('24', 48, 66);
  g.font = '13px "Courier New", monospace';
  g.fillText(t('drownedMonth'), 48, 108);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// a faded photograph, white-bordered, one of three small procedural scenes —
// never a face resolved close enough to recognise — with two corners
// darkened as if lifting off the paper
function photoTexture(variant) {
  const [c, g] = canvas(96, 72);
  g.fillStyle = '#f1ebdd'; g.fillRect(0, 0, 96, 72);
  const ix = 8, iy = 6, iw = 80, ih = 52;
  if (variant === 0) {                              // a window, warm light beyond it
    const sky = g.createLinearGradient(0, iy, 0, iy + ih);
    sky.addColorStop(0, '#d9c398'); sky.addColorStop(1, '#7c6a4c');
    g.fillStyle = sky; g.fillRect(ix, iy, iw, ih);
    g.strokeStyle = 'rgba(40, 32, 20, 0.55)'; g.lineWidth = 2;
    g.strokeRect(ix + iw * 0.28, iy + ih * 0.12, iw * 0.44, ih * 0.7);
    g.beginPath(); g.moveTo(ix + iw * 0.5, iy + ih * 0.12); g.lineTo(ix + iw * 0.5, iy + ih * 0.82);
    g.moveTo(ix + iw * 0.28, iy + ih * 0.47); g.lineTo(ix + iw * 0.72, iy + ih * 0.47); g.stroke();
    g.fillStyle = 'rgba(255, 238, 190, 0.35)'; g.beginPath(); g.arc(ix + iw * 0.5, iy + ih * 0.35, 10, 0, 7); g.fill();
  } else if (variant === 1) {                       // a figure, soft-edged, no face
    const gr = g.createRadialGradient(ix + iw / 2, iy + ih / 2, 4, ix + iw / 2, iy + ih / 2, 46);
    gr.addColorStop(0, '#c8b696'); gr.addColorStop(1, '#5a4c3c');
    g.fillStyle = gr; g.fillRect(ix, iy, iw, ih);
    g.fillStyle = 'rgba(50, 42, 32, 0.6)';
    g.beginPath(); g.ellipse(ix + iw * 0.5, iy + ih * 0.62, 9, 20, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(ix + iw * 0.5, iy + ih * 0.28, 6, 7, 0, 0, 7); g.fill();
  } else {                                          // a seaside horizon
    const sky = g.createLinearGradient(0, iy, 0, iy + ih * 0.55);
    sky.addColorStop(0, '#e7d2ab'); sky.addColorStop(1, '#c9ad82');
    g.fillStyle = sky; g.fillRect(ix, iy, iw, ih * 0.55);
    const sea = g.createLinearGradient(0, iy + ih * 0.55, 0, iy + ih);
    sea.addColorStop(0, '#6c7462'); sea.addColorStop(1, '#333c30');
    g.fillStyle = sea; g.fillRect(ix, iy + ih * 0.55, iw, ih * 0.45);
    g.fillStyle = 'rgba(255, 242, 214, 0.4)'; g.beginPath(); g.arc(ix + iw * 0.7, iy + ih * 0.5, 6, 0, 7); g.fill();
  }
  g.fillStyle = 'rgba(30, 22, 14, 0.35)';           // two corners lifting off the paper
  g.beginPath(); g.moveTo(ix, iy); g.lineTo(ix + 10, iy); g.lineTo(ix, iy + 10); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(ix + iw, iy + ih); g.lineTo(ix + iw - 10, iy + ih); g.lineTo(ix + iw, iy + ih - 10); g.closePath(); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// concentric grooves (thin alternating rings), a soft sheen off to one side,
// a red label with a spindle hole — the «vinyl record» as one drawn disc,
// so no UV surprises from a real cylinder cap
function recordTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, 256, 256);
  const cx = 128, cy = 128;
  // bold alternating bands, not a subtle stroke: a groove has to read from a
  // metre away in the flood's soft light, not just up close
  for (let rad = 38; rad <= 123; rad += 2.6) {
    const band = Math.floor((rad - 38) / 2.6) % 3;
    g.strokeStyle = band === 0 ? 'rgba(132, 134, 140, 0.95)' : band === 1 ? 'rgba(58, 58, 62, 0.9)' : 'rgba(14, 14, 16, 0.9)';
    g.lineWidth = 2.2;
    g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke();
  }
  const sheen = g.createRadialGradient(cx - 34, cy - 34, 4, cx, cy, 124);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.18)'); sheen.addColorStop(0.4, 'rgba(255, 255, 255, 0.03)'); sheen.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = sheen; g.beginPath(); g.arc(cx, cy, 124, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#a8202a'; g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0, 0, 0, 0.25)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#e9dfc4'; g.font = '9px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(getLang() === 'ru' ? 'МЕЛОДИЯ' : 'MELODIYA', cx, cy - 6);
  g.fillText('33', cx, cy + 8);
  g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// a folded letter, jittered handwriting on aged paper, two crease shadows
// where it was folded in thirds
function letterTexture(text) {
  const [c, g] = canvas(512, 340);
  g.fillStyle = '#efe6cc'; g.fillRect(0, 0, 512, 340);
  g.fillStyle = 'rgba(20, 15, 8, 0.12)';
  g.fillRect(0, 340 / 3 - 2, 512, 4);
  g.fillRect(0, 340 * 2 / 3 - 2, 512, 4);
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

// ── the letters' shader ──────────────────────────────────────────────────────
// A single set of uniforms shared by every epigraph letter: uCalm follows
// window.__app.water.calm (or the stage's own fallback), so the text sharpens
// the moment the visitor stops walking, everywhere at once. An ordinary
// letter reuses the same ripple-and-blur shader but at a fixed, permanent
// uCalm — never sharp, never quite legible: the soft wet translucency of
// paper that has been sitting in the flood a while.
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
function letterMaterial(tex, epigraph) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: tex }, uTime: LETTER_U.uTime, uCalm: { value: epigraph ? 1 : 0.55 } }]),
    vertexShader: LETTER_VERT, fragmentShader: LETTER_FRAG, fog: true,
  });
  if (epigraph) mat.uniforms.uCalm = LETTER_U.uCalm;  // this one alone follows the visitor's stillness
  return mat;
}

// ── building the five hero things ────────────────────────────────────────────
// Each returns { meshes, floater }: meshes go straight into the chunk's
// dispose list, floater (letters and photographs only, and only sometimes)
// is { mesh, x, z, seed } for update() to carry on the water surface.

function buildClock(group, atmo, p, rot, r) {
  const tiltX = (r() - 0.5) * 0.05, tiltZ = (r() - 0.5) * 0.05;
  const base = new THREE.Mesh(roundedBox(0.34, 0.018, 0.14, 0.012, 1), atmo.prop({ color: 0x171311, rust: 0.12 }));
  base.position.set(p.x, 0.009, p.z);
  base.rotation.set(tiltX, rot, tiltZ);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.12).rotateX(-Math.PI / 2),
    atmo.prop({ map: clockTexture(), glow: 0.95, rust: 0 }));
  face.position.set(p.x, 0.019, p.z);
  face.rotation.set(tiltX, rot, tiltZ);
  group.add(base, face);
  return { meshes: [base, face], floater: null };
}

function buildCalendar(group, atmo, p, rot, r) {
  const tiltX = (r() - 0.5) * 0.04, tiltZ = (r() - 0.5) * 0.06;
  const base = new THREE.Mesh(roundedBox(0.105, 0.022, 0.135, 0.008, 1), atmo.prop({ color: 0xdccfa8, rust: 0.12 }));
  base.position.set(p.x, 0.011, p.z);
  base.rotation.set(tiltX, rot, tiltZ);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.095, 0.125).rotateX(-Math.PI / 2),
    atmo.prop({ map: calendarTexture(), rust: 0 }));
  sheet.position.set(p.x, 0.023, p.z);
  sheet.rotation.set(tiltX, rot, tiltZ);
  const loose = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.05).rotateX(-Math.PI / 2),
    atmo.prop({ color: 0xe9dfc4, rust: 0.08 }));
  loose.position.set(p.x + Math.cos(rot) * 0.09 + r() * 0.03, 0.006, p.z + Math.sin(rot) * 0.09 - r() * 0.03);
  loose.rotation.y = r() * Math.PI * 2;
  loose.rotation.z = (r() - 0.5) * 0.35;
  group.add(base, sheet, loose);
  return { meshes: [base, sheet, loose], floater: null };
}

function buildRecord(group, atmo, p, rot, r) {
  const tilt = (r() - 0.5) * 0.06;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.148, 0.146, 0.005, 28), atmo.prop({ color: 0x0a0a0a, rust: 0.08 }));
  rim.position.set(p.x, 0.0025, p.z);
  rim.rotation.z = tilt;
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.145, 40).rotateX(-Math.PI / 2),
    atmo.prop({ map: recordTexture(), rust: 0 }));
  top.position.set(p.x, 0.006, p.z);
  top.rotation.y = rot; top.rotation.z = tilt;
  group.add(rim, top);
  return { meshes: [rim, top], floater: null };
}

function buildPhoto(group, atmo, p, rot, r, floating) {
  const tex = photoTexture(Math.floor(r() * 3));
  const meshes = [];
  if (!floating) {
    const base = new THREE.Mesh(roundedBox(0.105, 0.006, 0.082, 0.006, 1), atmo.prop({ color: 0xe9dfc4, rust: 0.1 }));
    base.position.set(p.x, 0.006, p.z);
    base.rotation.set((r() - 0.5) * 0.05, rot, (r() - 0.5) * 0.06);
    group.add(base); meshes.push(base);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.07).rotateX(-Math.PI / 2),
    atmo.prop({ map: tex, rust: floating ? 0 : 0.05 }));
  m.rotation.y = rot;
  let floater = null;
  if (floating) {
    m.position.set(p.x, 0.02, p.z);
    floater = { mesh: m, x: p.x, z: p.z, seed: r() * 10 };
  } else {
    m.position.set(p.x, 0.012, p.z);
    m.rotation.z = (r() - 0.5) * 0.05;
  }
  group.add(m); meshes.push(m);
  return { meshes, floater };
}

function buildLetter(group, atmo, p, rot, r, epigraph, floating) {
  const text = epigraph ? t('drownedLetter') + '   ' + t('drownedLetterRef') : pick(GENERIC_LETTER, r());
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.21).rotateX(-Math.PI / 2), letterMaterial(letterTexture(text), epigraph));
  m.rotation.y = rot;
  let floater = null;
  if (floating) {
    m.position.set(p.x, 0.02, p.z);
    floater = { mesh: m, x: p.x, z: p.z, seed: r() * 10 };
  } else {
    m.position.set(p.x, 0.007, p.z);
    m.rotation.z = (r() - 0.5) * 0.2;
    m.rotation.x = (r() - 0.5) * 0.04;
  }
  group.add(m);
  return { meshes: [m], floater };
}

export function createDrowned(atmo, quality) {
  const low = quality.tier === 0;
  const floaters = [];   // { mesh, x, z, seed }, across every chunk currently built

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
      const myFloaters = [];
      const place = (kind, build) => {
        const s = takeSpot();
        if (!s) return;
        const at = settle(s);
        const out = build(at, r() * Math.PI * 2);
        record({ kind: 'drowned ' + kind, x: at.x, z: at.z, y: 0.1, mount: out.floater ? 'air' : 'floor', ok: true, why: out.floater ? 'floats by design' : 'lies on the floor by design', parent: group });
        created.push(...out.meshes);
        if (out.floater) { floaters.push(out.floater); myFloaters.push(out.floater); }
      };

      // two hero things a chunk (one on tier 0), each on its own patch of open floor
      const budget = low ? 1 : 2;
      for (let n = 0; n < budget; n++) {
        const kind = pick(['clock', 'calendar', 'letter', 'photo', 'record'], r());
        if (kind === 'clock') place('clock', (p, rot) => buildClock(group, atmo, p, rot, r));
        else if (kind === 'calendar') place('calendar', (p, rot) => buildCalendar(group, atmo, p, rot, r));
        else if (kind === 'record') place('record', (p, rot) => buildRecord(group, atmo, p, rot, r));
        else if (kind === 'letter') place('letter', (p, rot) => buildLetter(group, atmo, p, rot, r, r() < 1 / 6, false));
        else place('photo', (p, rot) => buildPhoto(group, atmo, p, rot, r, false));
      }

      // once in a while, a letter or photograph never made it to the floor at all
      if (r() < 0.22) {
        if (r() < 0.5) place('letter', (p, rot) => buildLetter(group, atmo, p, rot, r, false, true));
        else place('photo', (p, rot) => buildPhoto(group, atmo, p, rot, r, true));
      }

      return {
        dispose() {
          for (const m of created) {
            group.remove(m);
            m.geometry?.dispose();
            m.material.uniforms?.uMap?.value?.dispose?.();
            m.material.dispose();
          }
          for (const f of myFloaters) { const i = floaters.indexOf(f); if (i >= 0) floaters.splice(i, 1); }
        },
      };
    },
    // called once a frame while the acceptance stage is active: water is
    // window.__app.water or the fallback soulpath hands it while that task
    // has not landed yet.
    update(time, water) {
      LETTER_U.uTime.value = time;
      LETTER_U.uCalm.value = water?.calm ?? 1;
      for (const f of floaters) {
        const wy = water?.heightAt ? water.heightAt(f.x, f.z) : null;
        f.mesh.position.y = (wy ?? 0.012) + 0.005;
        f.mesh.rotation.y = f.seed + time * 0.06;
      }
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
