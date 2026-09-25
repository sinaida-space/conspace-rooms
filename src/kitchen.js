import * as THREE from 'three';
import { roundedBox } from './geom.js';
import { CEIL_H } from './world.js';

// rounded edges: radius a third of the thinnest side, capped at 4 cm
const box = (w, h, d) => roundedBox(w, h, d, Math.min(0.04, Math.min(w, h, d) * 0.3));

// ── conspace-rooms · kitchen.js ─────────────────────────────────────────────
// Grandmother's room, the rare secret of the memory zone: a table under an
// oilcloth, two stools, an enamel teapot and a cup, a candelabra, an old
// television glowing red. Unlike the rest of the labyrinth (faked light in
// materials.js) these props are really lit, by one shared light rig that
// follows the nearest room, so the light count never changes and no shader
// recompiles while walking. Soft contact shadows under every object stand in
// for ambient occlusion on the procedural floor, which does not receive
// shadow maps.

// ── canvas textures, generated once and shared by every room ────────────────
let TEX = null;
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function textures() {
  if (TEX) return TEX;
  TEX = {
    // dark varnished wood: wavy grain lines over a brown ground
    wood: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#3a2416'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const y0 = Math.random() * h, amp = 2 + Math.random() * 5, ph = Math.random() * 6;
        g.strokeStyle = `rgba(${Math.random() < 0.5 ? '20,10,5' : '95,60,35'},${0.25 + Math.random() * 0.35})`;
        g.lineWidth = 0.6 + Math.random() * 1.6;
        g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.03 + ph) * amp);
        g.stroke();
      }
    }),
    // oilcloth: teal and cream checks, worn pale where hands rest, fine cracks
    cloth: canvasTex(512, 512, (g, w, h) => {
      const n = 12, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? '#f1eadb' : '#7fa89a'; g.fillRect(i * s, j * s, s, s);
      }
      const wear = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.6);
      wear.addColorStop(0, 'rgba(255,250,235,0.18)'); wear.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = wear; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(40,30,20,0.25)'; g.lineWidth = 0.7;
      for (let k = 0; k < 40; k++) {
        let x = Math.random() * w, y = Math.random() * h;
        g.beginPath(); g.moveTo(x, y);
        for (let q = 0; q < 6; q++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; g.lineTo(x, y); }
        g.stroke();
      }
    }),
    // the television picture: a red forest over a glowing field, scanlines
    screen: canvasTex(256, 192, (g, w, h) => {
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#5a0606'); bg.addColorStop(0.45, '#c01010'); bg.addColorStop(1, '#ff2a1e');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 38; i++) { // tree trunks
        const x = Math.random() * w, tw = 1 + Math.random() * 4;
        g.fillStyle = `rgba(40,0,0,${0.4 + Math.random() * 0.5})`;
        g.fillRect(x, 0, tw, h * (0.45 + Math.random() * 0.1));
      }
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
      const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
    }),
    // porcelain: warm white glaze with a fine crackle, a gold band near the
    // rim, a ring of small cabbage roses, a few chips down to grey body.
    // Mapped around a lathe: u runs around, v runs up the profile.
    porcelain: canvasTex(1024, 256, (g, w, h) => {
      const glaze = g.createLinearGradient(0, 0, 0, h);
      glaze.addColorStop(0, '#f3ecdc'); glaze.addColorStop(1, '#e2d8c2');
      g.fillStyle = glaze; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(120,100,70,0.12)'; g.lineWidth = 0.6;            // crackle
      for (let i = 0; i < 160; i++) { let x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 24; y += (Math.random() - 0.5) * 14; g.lineTo(x, y); } g.stroke(); }
      const gold = (y, t) => { const gg = g.createLinearGradient(0, y - t, 0, y + t); gg.addColorStop(0, '#6e4f18'); gg.addColorStop(0.5, '#e8c46a'); gg.addColorStop(1, '#6e4f18'); g.fillStyle = gg; g.fillRect(0, y - t, w, t * 2); };
      gold(h * 0.08, 5); gold(h * 0.2, 2);                                   // rim bands (top of the lathe is v = 1 → canvas y 0 after flip)
      for (let x = 40; x < w; x += 128) {                                    // roses with two leaves
        const y = h * 0.5;
        g.fillStyle = '#3f6b3a';
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * 22, y + 8, 16, 6, s * 0.5, 0, 7); g.fill(); }
        for (let r = 16; r > 2; r -= 3) { g.fillStyle = r % 2 ? '#a3202a' : '#d24a4f'; g.beginPath(); g.arc(x + (Math.random() - 0.5) * 2, y, r, 0, 7); g.fill(); }
      }
      for (let i = 0; i < 6; i++) { g.fillStyle = '#6d6a64'; const x = Math.random() * w, y = Math.random() < 0.6 ? Math.random() * h * 0.1 : h - Math.random() * 12; g.beginPath(); g.ellipse(x, y, 3 + Math.random() * 6, 2 + Math.random() * 3, 0, 0, 7); g.fill(); }
    }),
    // speaker grille on the television's side panel
    grille: canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = '#1c1915'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a0907';
      for (let y = 4; y < h; y += 5) g.fillRect(4, y, w - 8, 2);
    }),
    // soft black blob: contact shadow / ambient occlusion on the floor and table
    blob: canvasTex(128, 128, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(0,0,0,0.85)'); r.addColorStop(0.5, 'rgba(0,0,0,0.45)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    }),
    // warm yellow halo for the floor candles, so they read against the red carpet
    warm: canvasTex(64, 64, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,236,170,1)'); r.addColorStop(0.25, 'rgba(255,190,90,0.45)'); r.addColorStop(1, 'rgba(255,150,40,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    }),
    // halo around a candle flame
    halo: canvasTex(64, 64, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,120,60,0.9)'); r.addColorStop(0.3, 'rgba(255,40,20,0.35)'); r.addColorStop(1, 'rgba(255,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    }),
  };
  return TEX;
}

// Lathe from a (radius, height) profile — for the teapot, cup, saucer, candle cups.
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// ── build one room's props into `group`, centred on (x, z) ──────────────────
export function buildKitchen(group, x, z) {
  const T = textures();
  const std = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, ...opts });
  const wood = std({ map: T.wood, roughness: 0.55 });
  const cloth = std({ map: T.cloth, roughness: 0.38 });              // oilcloth has a soft sheen
  const enamel = std({ map: T.porcelain, roughness: 0.22 });
  const glazeWhite = std({ color: 0xefe8d8, roughness: 0.2 });
  const enamelRed = std({ color: 0x9a1b1b, roughness: 0.3 });
  const brass = std({ color: 0x6b4a22, roughness: 0.35, metalness: 0.8 });
  const wax = std({ color: 0xe6dac0, roughness: 0.6 });
  const plastic = std({ color: 0x151310, roughness: 0.45 });
  const fabric = std({ color: 0xc08a3e, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x5a2a0c, emissiveIntensity: 0.25 });

  const flames = [], screens = [];
  const add = (geo, mat, px, py, pz, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x + px, py, z + pz);
    m.castShadow = cast; m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // contact shadow: a dark blob lying just above a surface
  const blob = (w, d, px, py, pz, opacity = 0.8) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: T.blob, transparent: true, depthWrite: false, opacity, fog: true }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x + px, py, z + pz);
    m.renderOrder = 1;
    group.add(m);
  };

  // ── table: wooden top and apron, tapered legs, oilcloth with a drape ──
  const TOP = 0.745;
  add(box(1.2, 0.035, 0.8), wood, 0, TOP, 0);
  for (const [w, d, px, pz] of [[1.08, 0.02, 0, -0.36], [1.08, 0.02, 0, 0.36], [0.02, 0.68, -0.56, 0], [0.02, 0.68, 0.56, 0]]) {
    add(box(w, 0.08, d), wood, px, TOP - 0.06, pz); // apron
  }
  for (const [lx, lz] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) {
    add(new THREE.CylinderGeometry(0.03, 0.021, TOP - 0.02, 10), wood, lx, (TOP - 0.02) / 2, lz);
  }
  add(box(1.28, 0.006, 0.88), cloth, 0, TOP + 0.021, 0);
  for (const [w, px, pz, ry] of [[1.28, 0, 0.44, 0], [1.28, 0, -0.44, Math.PI], [0.88, 0.64, 0, Math.PI / 2], [0.88, -0.64, 0, -Math.PI / 2]]) {
    const drape = add(new THREE.PlaneGeometry(w, 0.13), cloth, px, TOP - 0.045, pz);
    drape.rotation.y = ry;
    drape.material = cloth.clone(); drape.material.side = THREE.DoubleSide;
  }
  blob(1.9, 1.4, 0, 0.014, 0, 0.9);

  // ── two stools: bevelled seat, four splayed legs, a stretcher ring ──
  for (const sx of [-0.88, 0.88]) {
    add(new THREE.CylinderGeometry(0.175, 0.165, 0.035, 28), wood, sx, 0.46, 0);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      const leg = add(new THREE.CylinderGeometry(0.014, 0.017, 0.45, 8), wood, sx + Math.cos(a) * 0.1, 0.225, Math.sin(a) * 0.1);
      leg.rotation.set(Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1); // splay outward
    }
    const ring = add(new THREE.TorusGeometry(0.115, 0.008, 6, 24), wood, sx, 0.16, 0);
    ring.rotation.x = Math.PI / 2;
    blob(0.6, 0.6, sx, 0.013, 0, 0.7);
  }

  // ── porcelain teapot: lathe body with a real wall, gold bands and roses, a
  // curved spout, an ear-shaped handle, a lid with a knob ──
  const tp = { x: 0.12, z: 0.05, y: TOP + 0.025 };
  add(lathe([[0, 0], [0.05, 0], [0.058, 0.006], [0.085, 0.02], [0.1, 0.052], [0.098, 0.088], [0.082, 0.114], [0.054, 0.128], [0.046, 0.13], [0.046, 0.136], [0.04, 0.136], [0.04, 0.128], [0, 0.126]], 40), enamel, tp.x, tp.y, tp.z);
  add(lathe([[0, 0.0], [0.043, 0.0], [0.044, 0.004], [0.036, 0.016], [0.018, 0.024], [0.01, 0.026], [0.013, 0.034], [0.01, 0.044], [0, 0.046]], 32), glazeWhite, tp.x, tp.y + 0.134, tp.z);
  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x + tp.x + 0.085, tp.y + 0.04, z + tp.z),
    new THREE.Vector3(x + tp.x + 0.13, tp.y + 0.06, z + tp.z),
    new THREE.Vector3(x + tp.x + 0.16, tp.y + 0.11, z + tp.z),
    new THREE.Vector3(x + tp.x + 0.18, tp.y + 0.145, z + tp.z)]);
  const spout = new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 24, 0.011, 12, false), glazeWhite);
  spout.castShadow = true; group.add(spout);
  const earCurve = (cx, cy, cz, sx, sy) => new THREE.CatmullRomCurve3([   // a D-shaped handle
    new THREE.Vector3(cx, cy + sy, cz), new THREE.Vector3(cx - sx * 0.7, cy + sy * 1.05, cz),
    new THREE.Vector3(cx - sx, cy + sy * 0.3, cz), new THREE.Vector3(cx - sx * 0.8, cy - sy * 0.6, cz),
    new THREE.Vector3(cx, cy - sy * 0.8, cz)]);
  const potHandle = new THREE.Mesh(new THREE.TubeGeometry(earCurve(x + tp.x - 0.095, tp.y + 0.07, z + tp.z, 0.05, 0.04), 32, 0.008, 10, false), glazeWhite);
  potHandle.castShadow = true; group.add(potHandle);
  blob(0.3, 0.3, tp.x, TOP + 0.026, tp.z, 0.6);

  // ── cup on a saucer: a thin porcelain wall with a lip, a foot ring, a well
  // in the saucer, an ear handle ──
  const cp = { x: -0.28, z: 0.2, y: TOP + 0.025 };
  add(lathe([[0, 0], [0.02, 0], [0.024, 0.003], [0.034, 0.004], [0.06, 0.008], [0.072, 0.014], [0.075, 0.017], [0.072, 0.017], [0.058, 0.011], [0.032, 0.008], [0.024, 0.008], [0, 0.007]], 48), enamel, cp.x, cp.y, cp.z);
  add(lathe([[0, 0.008], [0.022, 0.008], [0.024, 0.012], [0.03, 0.016], [0.04, 0.03], [0.045, 0.055], [0.047, 0.073], [0.048, 0.076], [0.046, 0.077], [0.044, 0.074], [0.042, 0.055], [0.037, 0.03], [0.026, 0.018], [0, 0.017]], 48), enamel, cp.x, cp.y, cp.z);
  const cupHandle = new THREE.Mesh(new THREE.TubeGeometry(earCurve(x + cp.x - 0.044, cp.y + 0.048, z + cp.z, 0.022, 0.018), 28, 0.0045, 8, false), glazeWhite);
  cupHandle.castShadow = true; group.add(cupHandle);
  // tea inside, dark and still, catching the light
  const tea = add(new THREE.CircleGeometry(0.041, 32).rotateX(-Math.PI / 2), std({ color: 0x3a1a08, roughness: 0.05 }), cp.x, cp.y + 0.062, cp.z, false);
  tea.castShadow = false;
  blob(0.2, 0.2, cp.x, TOP + 0.026, cp.z, 0.55);

  // ── candelabra: turned brass base and stem, four curved arms, five candles ──
  const cb = { x: -0.3, z: -0.16, y: TOP + 0.025 };
  add(lathe([[0, 0], [0.07, 0], [0.07, 0.01], [0.03, 0.03], [0.015, 0.05], [0, 0.05]]), brass, cb.x, cb.y, cb.z);
  add(new THREE.CylinderGeometry(0.011, 0.014, 0.24, 10), brass, cb.x, cb.y + 0.17, cb.z);
  const cups = [[0, 0, 0.3]];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, ex = Math.cos(a) * 0.11, ez = Math.sin(a) * 0.11;
    const arm = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x + cb.x, cb.y + 0.22, z + cb.z),
      new THREE.Vector3(x + cb.x + ex * 0.9, cb.y + 0.16, z + cb.z + ez * 0.9),
      new THREE.Vector3(x + cb.x + ex, cb.y + 0.25, z + cb.z + ez));
    const m = new THREE.Mesh(new THREE.TubeGeometry(arm, 10, 0.006, 6, false), brass);
    m.castShadow = true; group.add(m);
    cups.push([ex, ez, 0.25]);
  }
  for (const [ex, ez, hy] of cups) {
    add(lathe([[0, 0], [0.02, 0], [0.024, 0.02], [0.02, 0.022], [0, 0.022]], 14), brass, cb.x + ex, cb.y + hy, cb.z + ez);
    const h = 0.12 + Math.random() * 0.05;
    add(new THREE.CylinderGeometry(0.011, 0.012, h, 12), wax, cb.x + ex, cb.y + hy + 0.022 + h / 2, cb.z + ez);
    add(new THREE.SphereGeometry(0.006, 6, 4), wax, cb.x + ex + 0.01, cb.y + hy + 0.022 + h * 0.75, cb.z + ez); // wax drip
    const fy = cb.y + hy + 0.022 + h + 0.018;
    const flame = add(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb070, fog: false }), cb.x + ex, fy, cb.z + ez, false);
    flame.scale.y = 2;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.halo, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.set(0.12, 0.12, 1);
    halo.position.set(x + cb.x + ex, fy, z + cb.z + ez);
    group.add(halo);
    flames.push({ flame, halo });
  }
  blob(0.34, 0.34, cb.x, TOP + 0.026, cb.z, 0.6);

  // ── old television on a low cabinet, antenna, knobs, grille, red picture ──
  const tv = { x: 0, z: 1.9 };
  add(box(0.95, 0.46, 0.46), wood, tv.x, 0.23, tv.z);
  add(box(0.9, 0.02, 0.02), plastic, tv.x, 0.4, tv.z - 0.235);             // cabinet trim
  add(box(0.78, 0.58, 0.5), wood, tv.x, 0.75, tv.z);
  add(box(0.56, 0.46, 0.02), plastic, tv.x - 0.08, 0.76, tv.z - 0.25);     // bezel
  const screen = add(new THREE.PlaneGeometry(0.5, 0.38), new THREE.MeshBasicMaterial({ map: T.screen, fog: false }), tv.x - 0.08, 0.76, tv.z - 0.262, false);
  screen.rotation.y = Math.PI;
  screens.push(screen);
  const grille = add(new THREE.PlaneGeometry(0.12, 0.2), new THREE.MeshStandardMaterial({ map: T.grille, roughness: 0.8 }), tv.x + 0.28, 0.68, tv.z - 0.252, false);
  grille.rotation.y = Math.PI;
  for (const ky of [0.9, 0.83]) {
    const knob = add(new THREE.CylinderGeometry(0.018, 0.02, 0.02, 14), plastic, tv.x + 0.28, ky, tv.z - 0.26);
    knob.rotation.x = Math.PI / 2;
  }
  for (const s of [-1, 1]) {
    const ant = add(new THREE.CylinderGeometry(0.003, 0.003, 0.55, 4), brass, tv.x + s * 0.12, 1.28, tv.z);
    ant.rotation.z = s * -0.45;
  }
  blob(1.3, 0.8, tv.x, 0.013, tv.z, 0.85);

  // ── fabric lampshade low over the table ──
  const shade = add(new THREE.CylinderGeometry(0.16, 0.34, 0.24, 28, 1, true), fabric, 0, 2.2, 0, false);
  shade.receiveShadow = false;
  add(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb070, fog: false }), 0, 2.14, 0, false);
  add(new THREE.CylinderGeometry(0.005, 0.005, CEIL_H - 2.32, 4), plastic, 0, (CEIL_H + 2.32) / 2, 0, false);

  return {
    flames, screens,
    lamp: new THREE.Vector3(x, 2.1, z),
    tv: new THREE.Vector3(x + tv.x - 0.08, 0.76, z + tv.z - 0.5),
  };
}

// ── scattered things along the walls ────────────────────────────────────────
// items: [{ type: 'candle' | 'teapot' | 'cup', x, z, rot }]. One InstancedMesh
// per part per chunk, so a hundred things cost a handful of draw calls.
let SHARED = null;
const CANDLE_TIME = { value: 0 };   // shared clock for every flame and pool

// A flame drawn on a quad that always faces the camera: a white-hot core, a
// teardrop body in the candle's colour, a soft halo; it breathes and gutters
// on its own rhythm (seeded by gl_InstanceID).
const FLAME_VERT = /* glsl */`
uniform float uTime;
varying vec2 vUv; varying vec3 vCol; varying float vFl;
void main(){
  float id = float(gl_InstanceID);
  vFl = 0.82 + 0.12 * sin(uTime * 11.0 + id * 1.7) + 0.06 * sin(uTime * 29.0 + id * 5.3);
  vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 sway = vec2(0.012 * sin(uTime * 3.1 + id), 0.0);
  centre.xy += (position.xy + sway * (position.y + 0.5)) * vec2(1.0, vFl);   // billboard in view space
  gl_Position = projectionMatrix * centre;
  vUv = uv;
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0, 0.8, 0.45);
  #endif
}`;
const FLAME_FRAG = /* glsl */`
varying vec2 vUv; varying vec3 vCol; varying float vFl;
void main(){
  vec2 p = vUv - vec2(0.5, 0.32);
  float teardrop = length(vec2(p.x * 3.2, p.y * (p.y > 0.0 ? 1.4 : 2.6)));   // pointed top, round bottom
  float body = smoothstep(0.34, 0.1, teardrop);
  float core = smoothstep(0.16, 0.0, teardrop + 0.05);
  float halo = smoothstep(0.5, 0.0, length(p * vec2(1.0, 0.8))) * 0.35;
  vec3 col = vCol * (body * 1.4 + halo) + vec3(1.0, 0.97, 0.85) * core;
  float a = clamp(body + halo + core, 0.0, 1.0) * vFl;
  gl_FragColor = vec4(col * vFl, a);
}`;
// The warm pool on the floor, breathing with its flame.
const POOL_VERT = /* glsl */`
uniform float uTime;
varying vec2 vUv; varying vec3 vCol; varying float vFl;
#include <fog_pars_vertex>
void main(){
  float id = float(gl_InstanceID);
  vFl = 0.8 + 0.12 * sin(uTime * 11.0 + id * 1.7) + 0.08 * sin(uTime * 29.0 + id * 5.3);
  vUv = uv;
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0, 0.8, 0.45);
  #endif
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const POOL_FRAG = /* glsl */`
varying vec2 vUv; varying vec3 vCol; varying float vFl;
#include <fog_pars_fragment>
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, r) * smoothstep(1.0, 0.2, r) * 0.45 * vFl;
  gl_FragColor = vec4(vCol * a, a);
  #include <fog_fragment>
}`;

function shared() {
  if (SHARED) return SHARED;
  const enamel = new THREE.MeshBasicMaterial({ color: 0xcfc8b6, fog: true });
  // wax: a slightly tapered stick, lit from the flame at the top and in
  // shadow at the foot (vertex colours, tinted per candle by instance colour)
  const waxGeo = new THREE.CylinderGeometry(0.022, 0.024, 0.16, 12, 4);
  const wc = [], pos = waxGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const k = 0.35 + 0.65 * ((pos.getY(i) + 0.08) / 0.16) ** 1.5; wc.push(k, k, k); }
  waxGeo.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
  const uniforms = { uTime: CANDLE_TIME };
  const poolUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  poolUniforms.uTime = CANDLE_TIME;
  SHARED = {
    saucer: [lathe([[0, 0], [0.06, 0.002], [0.065, 0.012], [0, 0.008]], 16), enamel],
    wax: [waxGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })],
    flame: [new THREE.PlaneGeometry(0.22, 0.32).translate(0, 0.09, 0), new THREE.ShaderMaterial({
      uniforms, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })],
    pool: [new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: poolUniforms, vertexShader: POOL_VERT, fragmentShader: POOL_FRAG, fog: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })],
  };
  return SHARED;
}
export function tickCandles(time) { CANDLE_TIME.value = time; }

export function buildScatter(group, items) {
  const S = shared();
  const parts = {
    candle: [['saucer', 0.01], ['wax', 0.09], ['flame', 0.18], ['pool', 0.016]],
  };
  const counts = {};
  for (const it of items) for (const [name] of parts[it.type]) counts[name] = (counts[name] || 0) + 1;
  const meshes = {}, idx = {};
  for (const name in counts) {
    const [geo, mat] = S[name];
    meshes[name] = new THREE.InstancedMesh(geo, mat, counts[name]);
    meshes[name].frustumCulled = false; // instances spread over the whole chunk
    meshes[name].userData.keep = true;  // geometry and material are shared: never dispose them with a chunk
    idx[name] = 0;
    group.add(meshes[name]);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (const it of items) {
    q.setFromAxisAngle(up, it.rot);
    for (const [name, y] of parts[it.type]) {
      m.compose(new THREE.Vector3(it.x, y, it.z), q, one);
      if (name === 'flame' || name === 'pool') meshes[name].setColorAt(idx[name], it.flame);
      if (name === 'wax') meshes[name].setColorAt(idx[name], it.wax);
      meshes[name].setMatrixAt(idx[name]++, m);
    }
  }
  for (const name in meshes) {
    meshes[name].instanceMatrix.needsUpdate = true;
    if (meshes[name].instanceColor) meshes[name].instanceColor.needsUpdate = true;
  }
  return {
    count: items.length,
    lights: items.map(it => ({ x: it.x, y: 0.28, z: it.z, col: it.flame })), // for the walls to catch
    dispose() { for (const name in meshes) { group.remove(meshes[name]); meshes[name].dispose(); } }, // frees instance buffers only
  };
}

// ── one light rig for all rooms ─────────────────────────────────────────────
export function createKitchenRig(scene, renderer, quality) {
  const shadows = quality.tier > 0;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const lamp = new THREE.PointLight(0xffb468, 0, 7, 2);
  lamp.castShadow = shadows;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.002;
  lamp.shadow.radius = 4;
  const tv = new THREE.PointLight(0xff2418, 0, 4, 2);
  const fill = new THREE.HemisphereLight(0x2d5a3c, 0x240808, 0);   // green half-dark above, red carpet bounce below
  scene.add(lamp, tv, fill);

  return {
    // room: the nearest built room ({ lamp, tv }) or null
    update(room, time) {
      renderer.shadowMap.autoUpdate = shadows && !!room;   // no shadow passes far from any room
      if (!room) { lamp.intensity = tv.intensity = fill.intensity = 0; return; }
      lamp.position.copy(room.lamp);
      tv.position.copy(room.tv);
      lamp.intensity = 5.5 * (0.96 + 0.04 * Math.sin(time * 9.1));
      tv.intensity = 2.2 * (0.8 + 0.2 * Math.random());          // picture flicker
      fill.intensity = 0.55;
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
