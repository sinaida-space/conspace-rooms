import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/GLTFLoader.js';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';
import { CELL, CHUNK, CEIL_H, CONSPACE_SEED, solidAtGlobal, hash2i, mulberry32, isLampCell } from './world.js';
import { ORIGIN } from './zones.js';
import { roundedBox } from './geom.js';

// ── conspace-rooms · ward.js ────────────────────────────────────────────────
// What the hospital left behind. In the fear stage a few rooms hold a small
// abandoned island: one piece of furniture against a wall (an iron bed, a
// couch, a wheelchair, a folding screen, a drip stand) with a handful of small
// things dropped around it: pill bottles, a blister, ampoules, a syringe, a
// bandage unrolling, an enamel kidney tray or bedpan, a stethoscope, a rubber
// hot-water bottle, papers, an X-ray. Sometimes an operating lamp hangs over
// it, sometimes an enamel plaque names the room.
//
// Rules that keep it quiet and clean:
//   · about one chunk in four gets an island, and never near the spawn
//   · islands live in rooms only, never on the corridor lattice, so paths,
//     presence doors and portals stay clear
//   · they keep off walls that carry a work, a poster or a writing, and one
//     cell of air in front of them
//   · every thing owns its cell: nothing overlaps anything, and the candles
//     skip those cells too
//   · the bed and the wheelchair are CC0 models from Poly Haven
//     (assets/models); everything else is drawn here
//
// Placement is a pure function of the chunk and the visit's seed.

const SEED_WARD = CONSPACE_SEED ^ 0x3a2d;
const BAND = new Set([4, 5, 10, 11]);
const lc = v => ((v % CHUNK) + CHUNK) % CHUNK;
const onBand = (gi, gj) => BAND.has(lc(gi)) || BAND.has(lc(gj));
const centre = g => (g + 0.5) * CELL;
export const cellKey = (gi, gj) => gi + ',' + gj;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ── what is reserved: cells in front of works, posters and writings ─────────
// The open cells along a wall run (world.getWallSlots) plus one cell of air.
export function reserveSlot(set, slot, depth = 2) {
  const { position: p, normal: n, length } = slot;
  for (let k = 0; k < length; k++) for (let d = 0; d < depth; d++) {
    if (n.x !== 0) {
      const gi = Math.floor((p.x + n.x * CELL * (0.5 + d)) / CELL);
      const gj = Math.round((p.z - length * CELL / 2) / CELL) + k;
      set.add(cellKey(gi, gj));
    } else {
      const gj = Math.floor((p.z + n.z * CELL * (0.5 + d)) / CELL);
      const gi = Math.round((p.x - length * CELL / 2) / CELL) + k;
      set.add(cellKey(gi, gj));
    }
  }
}
// Every cell whose centre lies within r metres of a point.
export function reserveAround(set, x, z, r) {
  const g0 = Math.floor((x - r) / CELL), g1 = Math.floor((x + r) / CELL);
  const h0 = Math.floor((z - r) / CELL), h1 = Math.floor((z + r) / CELL);
  for (let gj = h0; gj <= h1; gj++) for (let gi = g0; gi <= g1; gi++)
    if (Math.hypot(centre(gi) - x, centre(gj) - z) < r) set.add(cellKey(gi, gj));
}

// ── the plan ────────────────────────────────────────────────────────────────
const ANCHORS = [                     // cells along the wall, depth from the wall (m), weight
  { type: 'bed', cells: 2, depth: 0.92, w: 3, model: true },
  { type: 'gurney', cells: 2, depth: 0.64, w: 2.5 },
  { type: 'screen', cells: 2, depth: 0.42, w: 2 },
  { type: 'wheelchair', cells: 1, depth: 0.84, w: 2, model: true },
  { type: 'drip', cells: 1, depth: 0.5, w: 1.5 },
];
const SMALL = ['pills', 'pills', 'blister', 'ampoules', 'syringe', 'bandage', 'tray', 'stethoscope', 'bedpan', 'hotwater', 'stool', 'history', 'history', 'xray'];
const SIGNS = ['ПРОЦЕДУРНАЯ', 'ПЕРЕВЯЗОЧНАЯ', 'ПОСТ', 'ИЗОЛЯТОР', 'ПРИЁМНЫЙ ПОКОЙ', 'НЕ ВХОДИТЬ', '+'];

export function wardPlan(cx, cz, reserved, withModels = true) {
  const r = mulberry32(hash2i(SEED_WARD, cx, cz));
  if (r() > 0.25) return null;
  const free = (gi, gj) => lc(gi) === gi - cx * CHUNK && lc(gj) === gj - cz * CHUNK   // inside this chunk
    && !solidAtGlobal(gi, gj) && !onBand(gi, gj) && !reserved.has(cellKey(gi, gj));

  // sites: a free cell with a wall on one side; two-cell sites continue along it
  const sites = [];
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    const gi = cx * CHUNK + i, gj = cz * CHUNK + j;
    if (!free(gi, gj)) continue;
    if (Math.hypot(centre(gi) - ORIGIN.x, centre(gj) - ORIGIN.z) < 6) continue;
    for (const [di, dj] of DIRS) {
      if (!solidAtGlobal(gi + di, gj + dj)) continue;
      const ai = dj !== 0 ? 1 : 0, aj = di !== 0 ? 1 : 0;           // along the wall
      const two = free(gi + ai, gj + aj) && solidAtGlobal(gi + ai + di, gj + aj + dj);
      sites.push({ gi, gj, di, dj, ai, aj, two });
    }
  }
  if (!sites.length) return null;

  const kinds = ANCHORS.filter(a => withModels || !a.model);
  let total = kinds.reduce((s, a) => s + a.w, 0), roll = r() * total, kind = kinds[0];
  for (const a of kinds) { if ((roll -= a.w) <= 0) { kind = a; break; } }
  let pool = sites.filter(s => kind.cells === 1 || s.two);
  if (!pool.length) { kind = kinds.find(a => a.cells === 1); pool = sites; }
  const s = pool[Math.floor(r() * pool.length)];

  const cells = new Set([cellKey(s.gi, s.gj)]);
  let cxm = centre(s.gi), czm = centre(s.gj);
  if (kind.cells === 2) {
    cells.add(cellKey(s.gi + s.ai, s.gj + s.aj));
    cxm += s.ai * CELL / 2; czm += s.aj * CELL / 2;
  }
  const nx = -s.di, nz = -s.dj;                                       // into the room
  const wallX = cxm + s.di * CELL / 2, wallZ = czm + s.dj * CELL / 2;
  const off = kind.depth / 2 + 0.06;
  const wobble = kind.type === 'wheelchair' ? (r() - 0.5) * 0.6 : kind.type === 'drip' ? r() * 6.28 : 0;
  const anchor = {
    type: kind.type, x: wallX + nx * off, z: wallZ + nz * off,
    rot: Math.atan2(nx, nz) + wobble, flip: r() < 0.5,
  };
  if (kind.type === 'wheelchair') {              // turned a little: keep the cells beside it clear
    cells.add(cellKey(s.gi + s.ai, s.gj + s.aj)); cells.add(cellKey(s.gi - s.ai, s.gj - s.aj));
  }

  // small things in free cells around it, one per cell
  const near = [];
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const gi = s.gi + di, gj = s.gj + dj;
    if (free(gi, gj) && !cells.has(cellKey(gi, gj))) near.push([gi, gj]);
  }
  for (let k = near.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [near[k], near[m]] = [near[m], near[k]]; }
  const items = [];
  const n = Math.min(near.length, 3 + Math.floor(r() * 3));
  for (let k = 0; k < n; k++) {
    const [gi, gj] = near[k];
    cells.add(cellKey(gi, gj));
    items.push({ type: SMALL[Math.floor(r() * SMALL.length)], x: centre(gi) + (r() - 0.5) * 0.4, z: centre(gj) + (r() - 0.5) * 0.4, rot: r() * 6.28, v: r() });
  }

  // an enamel plaque above it, on its own wall
  const sign = r() < 0.5 ? {
    text: SIGNS[Math.floor(r() * SIGNS.length)],
    x: wallX + nx * 0.012, z: wallZ + nz * 0.012, rot: Math.atan2(nx, nz), tilt: (r() - 0.5) * 0.08,
  } : null;

  // an operating lamp over it: head over the anchor, mount further into the room
  let lamp = null;
  if (kind.type !== 'wheelchair' && r() < 0.45) {
    const hx = anchor.x + nx * 0.25, hz = anchor.z + nz * 0.25;
    const mx = hx + nx * 0.45, mz = hz + nz * 0.45;
    const clear = (x, z) => {
      const gi = Math.floor(x / CELL), gj = Math.floor(z / CELL);
      if (solidAtGlobal(gi, gj)) return false;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (isLampCell(gi + a, gj + b)) return false;
      return true;
    };
    if (clear(hx, hz) && clear(mx, mz)) lamp = { x: mx, z: mz, rot: Math.atan2(-nz, nx) + Math.PI, seed: r() * 100 };
  }

  // the furniture takes part in collision: an oriented box
  const dims = { bed: [2.0, 0.92], gurney: [1.9, 0.64], screen: [1.35, 0.4], wheelchair: [1.05, 0.8], drip: [0.36, 0.36] }[kind.type];
  const boxes = [orientedBox(anchor.x, anchor.z, dims[0], dims[1], anchor.rot)];

  return { anchor, items, sign, lamp, cells, boxes };
}

// Four wall segments around a w×d rectangle turned by rot (local X is w).
function orientedBox(x, z, w, d, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (u, v) => ({ x: x + u * c + v * s, z: z - u * s + v * c });
  const a = P(-w / 2, -d / 2), b = P(w / 2, -d / 2), e = P(w / 2, d / 2), f = P(-w / 2, d / 2);
  const seg = (p, q) => { const mx = (p.x + q.x) / 2 - x, mz = (p.z + q.z) / 2 - z, l = Math.hypot(mx, mz) || 1; return { a: p, b: q, nx: mx / l, nz: mz / l }; };
  return { x, z, r: Math.hypot(w, d) / 2, segs: [seg(a, b), seg(b, e), seg(e, f), seg(f, a)] };
}

// ── drawing kit: every part carries its colour and gloss in vertex colours ──
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function part(geo, hex, gloss, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  const c = new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    // wear: a faint grime that varies over the surface, darker low down
    const h = Math.sin(pos.getX(i) * 91.7 + pos.getY(i) * 47.3 + pos.getZ(i) * 13.1) * 0.5 + 0.5;
    const k = 0.84 + 0.16 * h;
    col.set([c.r * k, c.g * k, c.b * k, gloss], i * 4);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  return g;
}
// place a list of parts: turn about Y, then move
function place(list, x, y, z, ry = 0, rx = 0, rz = 0) {
  _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(1, 1, 1));
  for (const g of list) g.applyMatrix4(_m);
  return list;
}
const cyl = (r0, r1, h, seg = 12) => new THREE.CylinderGeometry(r0, r1, h, seg);
const tube = (pts, r, seg = 24) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, 6, false);

const ENAMEL = 0xdcd8cb, ENAMEL_RIM = 0x2b3a66, STEEL = 0xa9adab, CHROME = 0xc9cccb, RUBBER = 0x1d1c1b;

const SMALL_DRAW = {
  // a brown pharmacy bottle, often knocked over, pills spilled
  pills(v) {
    const out = [part(cyl(0.022, 0.022, 0.07), 0x4a2610, 0.9, 0, 0.035), part(cyl(0.024, 0.024, 0.018), 0xd8d4c8, 0.3, 0, 0.079)];
    if (v < 0.6) place(out, 0, 0.022, 0, 0, 0, Math.PI / 2 - 0.035);
    for (let k = 0; k < 5; k++) out.push(part(new THREE.SphereGeometry(0.006, 6, 4), 0xe4e1d6, 0.2, 0.07 + k * 0.022, 0.003, Math.sin(k * 2.3) * 0.04, 0, 0, 0, 1, 0.45, 1));
    return out;
  },
  blister() {
    const out = [part(new THREE.BoxGeometry(0.1, 0.002, 0.048), 0xb7b8b2, 0.9, 0, 0.001)];
    for (let a = 0; a < 5; a++) for (let b = 0; b < 2; b++)
      if ((a * 3 + b) % 7 !== 3) out.push(part(new THREE.SphereGeometry(0.007, 8, 4, 0, 6.29, 0, 1.57), 0xe7e7df, 0.9, -0.036 + a * 0.018, 0.002, -0.011 + b * 0.022, 0, 0, 0, 1, 0.6, 1));
    return out;
  },
  ampoules() {
    const prof = [[0, 0], [0.006, 0.001], [0.006, 0.034], [0.0026, 0.041], [0.0024, 0.047], [0.004, 0.052], [0, 0.056]].map(([a, b]) => new THREE.Vector2(a, b));
    return [0, 1, 2].map(k => part(new THREE.LatheGeometry(prof, 8), 0x9a6a24, 1.0, k * 0.03, 0.006, k * 0.012, 0, k * 0.4, Math.PI / 2));
  },
  syringe() {
    return place([
      part(cyl(0.0075, 0.0075, 0.08, 10), 0xdde1da, 0.7, 0, 0, 0, 0, 0, Math.PI / 2),
      part(new THREE.BoxGeometry(0.06, 0.004, 0.004), 0xcfd3cc, 0.5, -0.06, 0),
      part(cyl(0.011, 0.011, 0.003, 10), 0xcfd3cc, 0.5, -0.09, 0, 0, 0, 0, Math.PI / 2),
      part(cyl(0.002, 0.004, 0.012, 6), 0xbfc4bd, 0.6, 0.046, 0, 0, 0, 0, -Math.PI / 2),
      part(cyl(0.0006, 0.0006, 0.035, 4), 0x9a9a98, 1.0, 0.07, 0, 0, 0, 0, Math.PI / 2),
    ], 0, 0.0076, 0);
  },
  // a roll, and its tail unwinding across the floor
  bandage(v) {
    const tail = new THREE.PlaneGeometry(0.55, 0.055, 16, 1);
    const p = tail.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.max(0, Math.sin(p.getX(i) * 22 + v * 9) * 0.004));
    return [
      part(cyl(0.03, 0.03, 0.06, 14), 0xe2dbc8, 0.05, -0.3, 0.03, 0, Math.PI / 2, 0, 0),
      part(tail, 0xd6ccb4, 0.05, 0, 0.002, 0, -Math.PI / 2),
    ];
  },
  // an enamel kidney dish with its blue rim
  tray() {
    const pts = [];
    for (let k = 0; k < 40; k++) {
      const a = k / 40 * Math.PI * 2, x = 0.13 * Math.cos(a);
      pts.push(new THREE.Vector2(x, 0.068 * Math.sin(a) - (Math.sin(a) > 0 ? 0.036 * Math.exp(-((x / 0.07) ** 2)) : 0)));
    }
    const body = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.022, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 4 });
    const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(v => new THREE.Vector3(v.x, v.y, 0)), true), 60, 0.004, 5, true);
    return [part(body, ENAMEL, 0.7, 0, 0.004, 0, -Math.PI / 2), part(rim, ENAMEL_RIM, 0.7, 0, 0.03, 0, -Math.PI / 2)];
  },
  stethoscope(v) {
    const s = v < 0.5 ? 1 : -1;
    return [
      part(cyl(0.022, 0.022, 0.012, 16), CHROME, 1.0, 0, 0.006),
      part(cyl(0.019, 0.019, 0.002, 16), 0xe0e3df, 0.8, 0, 0.013),
      part(tube([[0.02, 0.006, 0], [0.14, 0.006, 0.06 * s], [0.24, 0.006, -0.05 * s], [0.33, 0.006, 0.03 * s], [0.4, 0.006, 0]], 0.005, 32), RUBBER, 0.4),
      part(tube([[0.4, 0.006, 0], [0.47, 0.006, 0.05], [0.56, 0.006, 0.09]], 0.003, 10), CHROME, 1.0),
      part(tube([[0.4, 0.006, 0], [0.47, 0.006, -0.04], [0.56, 0.006, -0.08]], 0.003, 10), CHROME, 1.0),
      part(new THREE.SphereGeometry(0.008, 8, 6), RUBBER, 0.3, 0.565, 0.008, 0.092),
      part(new THREE.SphereGeometry(0.008, 8, 6), RUBBER, 0.3, 0.565, 0.008, -0.082),
    ];
  },
  bedpan() {
    return [
      part(cyl(0.14, 0.12, 0.06, 22), ENAMEL, 0.6, 0, 0.03, 0, 0, 0, 0, 1, 1, 1.45),
      part(new THREE.TorusGeometry(0.14, 0.008, 6, 28), ENAMEL_RIM, 0.6, 0, 0.06, 0, Math.PI / 2, 0, 0, 1, 1, 1.45),
      part(new THREE.BoxGeometry(0.05, 0.022, 0.16), ENAMEL, 0.6, 0, 0.03, 0.26),
    ];
  },
  hotwater() {
    return [
      part(roundedBox(0.2, 0.03, 0.29, 0.012), 0x3a2a25, 0.45, 0, 0.015),
      part(cyl(0.018, 0.02, 0.04, 10), 0x3a2a25, 0.45, 0, 0.015, 0.16, Math.PI / 2),
      part(cyl(0.02, 0.02, 0.018, 10), RUBBER, 0.3, 0, 0.015, 0.188, Math.PI / 2),
    ];
  },
  stool() {
    const out = [part(cyl(0.16, 0.16, 0.03, 18), ENAMEL, 0.5, 0, 0.47), part(new THREE.TorusGeometry(0.15, 0.007, 5, 20), STEEL, 0.8, 0, 0.16, 0, Math.PI / 2)];
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI * 2;
      out.push(part(cyl(0.011, 0.011, 0.48, 6), STEEL, 0.8, Math.cos(a) * 0.14, 0.235, Math.sin(a) * 0.14, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12));
    }
    return out;
  },
};

const ANCHOR_DRAW = {
  // Soviet examination couch: white tube frame, brown leatherette, raised head
  gurney() {
    const out = [];
    for (const x of [-0.85, 0.85]) for (const z of [-0.26, 0.26]) out.push(part(cyl(0.016, 0.016, 0.6, 8), ENAMEL, 0.5, x, 0.3, z));
    for (const z of [-0.28, 0.28]) out.push(part(new THREE.BoxGeometry(1.9, 0.04, 0.03), ENAMEL, 0.5, 0, 0.6, z));
    for (const x of [-0.85, 0.85]) out.push(part(new THREE.BoxGeometry(0.03, 0.03, 0.56), ENAMEL, 0.5, x, 0.6, 0));
    out.push(part(new THREE.BoxGeometry(1.7, 0.02, 0.02), STEEL, 0.7, 0, 0.14, 0.26), part(new THREE.BoxGeometry(1.7, 0.02, 0.02), STEEL, 0.7, 0, 0.14, -0.26));
    out.push(part(roundedBox(1.3, 0.08, 0.6, 0.025), 0x4a2e24, 0.45, -0.28, 0.66));
    out.push(part(roundedBox(0.56, 0.08, 0.6, 0.025), 0x4a2e24, 0.45, 0.63, 0.73, 0, 0, 0, 0.3));
    return out;
  },
  // three-leaf screen, the cloth yellowed
  screen() {
    const out = [];
    const leaf = (x, z, ry) => {
      const l = [
        part(cyl(0.011, 0.011, 1.7, 6), ENAMEL, 0.5, -0.24, 0.9), part(cyl(0.011, 0.011, 1.7, 6), ENAMEL, 0.5, 0.24, 0.9),
        part(new THREE.BoxGeometry(0.48, 0.02, 0.02), ENAMEL, 0.5, 0, 1.74), part(new THREE.BoxGeometry(0.48, 0.02, 0.02), ENAMEL, 0.5, 0, 0.36),
        part(new THREE.PlaneGeometry(0.46, 1.34, 1, 6), 0xcbc3a8, 0.03, 0, 1.05),
        part(new THREE.SphereGeometry(0.025, 8, 6), RUBBER, 0.3, -0.24, 0.025), part(new THREE.SphereGeometry(0.025, 8, 6), RUBBER, 0.3, 0.24, 0.025),
      ];
      out.push(...place(l, x, 0, z, ry));
    };
    leaf(-0.46, 0.08, 0.45); leaf(0, -0.04, 0); leaf(0.46, 0.08, -0.45);
    return out;
  },
  // drip stand with a glass bottle hung upside down and its line trailing
  drip() {
    const out = [part(cyl(0.011, 0.011, 1.86, 8), CHROME, 0.9, 0, 0.95)];
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2;
      out.push(part(new THREE.BoxGeometry(0.26, 0.02, 0.025), STEEL, 0.7, Math.cos(a) * 0.13, 0.05, -Math.sin(a) * 0.13, 0, a, 0));
      out.push(part(new THREE.SphereGeometry(0.02, 8, 6), RUBBER, 0.3, Math.cos(a) * 0.25, 0.02, -Math.sin(a) * 0.25));
    }
    out.push(part(new THREE.TorusGeometry(0.04, 0.004, 5, 10, Math.PI), CHROME, 0.9, 0.04, 1.86), part(new THREE.TorusGeometry(0.04, 0.004, 5, 10, Math.PI), CHROME, 0.9, -0.04, 1.86, 0, 0, Math.PI));
    out.push(part(cyl(0.04, 0.04, 0.15, 14), 0x8fa39b, 1.0, 0.08, 1.66), part(cyl(0.012, 0.03, 0.04, 10), 0x8fa39b, 1.0, 0.08, 1.565), part(cyl(0.013, 0.013, 0.02, 8), 0x3b2f2b, 0.3, 0.08, 1.535));
    out.push(part(tube([[0.08, 1.525, 0], [0.12, 1.2, 0.05], [0.1, 0.7, 0.12], [0.2, 0.25, 0.2], [0.34, 0.004, 0.16], [0.5, 0.004, 0.05]], 0.003, 40), 0xcdd2c8, 0.6));
    return out;
  },
};

// Operating lamp: mount at the ceiling (origin), arm down and out, head along -X.
function lampParts() {
  const prof = [[0.001, 0.12], [0.1, 0.115], [0.22, 0.09], [0.32, 0.045], [0.38, 0.0], [0.372, -0.018]].map(([a, b]) => new THREE.Vector2(a, b));
  const body = [
    part(cyl(0.1, 0.1, 0.03, 18), ENAMEL, 0.5, 0, -0.015),
    part(cyl(0.022, 0.022, 0.55, 8), STEEL, 0.8, 0, -0.3),
    part(new THREE.SphereGeometry(0.038, 10, 8), STEEL, 0.8, 0, -0.58),
    part(cyl(0.018, 0.018, 0.5, 8), STEEL, 0.8, -0.2, -0.72, 0, 0, 0, -1.0),
    part(new THREE.SphereGeometry(0.03, 10, 8), STEEL, 0.8, -0.42, -0.87),
    part(new THREE.LatheGeometry(prof, 28), 0xd3d2c8, 0.6, -0.45, -1.02, 0, 0, 0, 0.3),
  ];
  const lens = [];
  const ring = [[0, 0], ...Array.from({ length: 6 }, (_, k) => [Math.cos(k / 6 * 6.283) * 0.21, Math.sin(k / 6 * 6.283) * 0.21])];
  for (const [a, b] of ring) {
    const g = part(new THREE.CircleGeometry(0.07, 16), 0xffffff, 0, a, -0.012, b, Math.PI / 2);
    place([g], -0.45, -1.02, 0, 0, 0, 0.3);
    lens.push(g);
  }
  return { body, lens };
}

// ── paper and enamel: canvases drawn once ──────────────────────────────────
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function speckle(g, w, h, n, rgba) { for (let i = 0; i < n; i++) { g.fillStyle = rgba(Math.random()); g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } }

function historyTexture() {
  const [c, g] = canvas(256, 362);
  g.fillStyle = '#d5cbad'; g.fillRect(0, 0, 256, 362);
  speckle(g, 256, 362, 900, a => `rgba(90,70,40,${a * 0.12})`);
  const edge = g.createRadialGradient(128, 181, 90, 128, 181, 240); edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(110,80,40,0.35)');
  g.fillStyle = edge; g.fillRect(0, 0, 256, 362);
  g.fillStyle = '#2b2a2a'; g.font = '600 15px "Times New Roman", serif'; g.textAlign = 'center';
  g.fillText('ИСТОРИЯ БОЛЕЗНИ', 128, 34); g.font = '12px "Times New Roman", serif';
  g.fillText('№ ' + (1000 + Math.floor(Math.random() * 8999)), 128, 52);
  g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 1;
  for (let y = 78; y < 340; y += 17) { g.beginPath(); g.moveTo(18, y); g.lineTo(238, y); g.stroke(); }
  g.strokeStyle = 'rgba(52,56,120,0.8)'; g.lineWidth = 1.2;            // handwriting in violet ink
  for (let y = 74; y < 300; y += 17) {
    let x = 22 + Math.random() * 10; const end = 120 + Math.random() * 110;
    g.beginPath(); g.moveTo(x, y);
    while (x < end) { x += 3 + Math.random() * 4; g.lineTo(x, y - Math.random() * 7); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(60,70,150,0.45)'; g.lineWidth = 2.5;            // a faded round stamp
  g.beginPath(); g.arc(190, 318, 26, 0, 6.3); g.stroke(); g.beginPath(); g.arc(190, 318, 19, 0, 6.3); g.stroke();
  return new THREE.CanvasTexture(c);
}
function xrayTexture() {
  const [c, g] = canvas(256, 320);
  g.fillStyle = '#0a1316'; g.fillRect(0, 0, 256, 320);
  g.shadowColor = 'rgba(170,200,205,0.9)'; g.shadowBlur = 10;
  g.strokeStyle = 'rgba(160,186,190,0.55)'; g.lineWidth = 7;
  for (let k = 0; k < 9; k++) {                                          // ribs
    const y = 58 + k * 23;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 8, y); g.bezierCurveTo(128 + s * 70, y - 22, 128 + s * 108, y + 10, 128 + s * 92, y + 38); g.stroke(); }
  }
  g.lineWidth = 16; g.strokeStyle = 'rgba(180,205,208,0.6)';              // spine
  g.beginPath(); g.moveTo(128, 30); g.lineTo(128, 300); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(60, 50); g.quadraticCurveTo(128, 20, 196, 50); g.stroke(); // collarbones
  g.shadowBlur = 0; g.fillStyle = 'rgba(210,225,225,0.8)'; g.font = '16px monospace'; g.fillText('L', 20, 300);
  return new THREE.CanvasTexture(c);
}
function signTexture(text) {
  const cross = text === '+';
  const [c, g] = cross ? canvas(128, 128) : canvas(512, 128);
  const w = c.width, h = c.height;
  g.fillStyle = '#e6e2d5'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#1f2c58'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
  if (cross) { g.fillStyle = '#8a3b2f'; g.fillRect(50, 26, 28, 76); g.fillRect(26, 50, 76, 28); }   // an old, faded cross
  else {
    g.fillStyle = '#1f2c58'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 64; do { g.font = `700 ${size}px "Arial Narrow", Arial, sans-serif`; size -= 2; } while (g.measureText(text).width > w - 60);
    g.fillText(text, w / 2, h / 2 + 3);
  }
  for (let i = 0; i < 9; i++) {                                           // chips down to black iron, rust around them
    const x = Math.random() * w, y = Math.random() < 0.5 ? Math.random() * 16 : h - Math.random() * 16, r = 2 + Math.random() * 6;
    g.fillStyle = 'rgba(120,70,40,0.5)'; g.beginPath(); g.arc(x, y, r * 1.6, 0, 7); g.fill();
    g.fillStyle = '#1b1a18'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  for (const [x, y] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]]) { g.fillStyle = '#6f6a60'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  return new THREE.CanvasTexture(c);
}

// ── the kit: materials, models, and building one chunk's island ────────────
export function createWardKit(atmo, quality) {
  const bodyMat = atmo.prop({ vertexColors: true });
  const lensMats = new Map();
  const texMats = new Map();
  const texMat = (key, make) => {
    let m = texMats.get(key);
    if (!m) {
      m = atmo.prop({ map: make() });
      m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
      texMats.set(key, m);
    }
    return m;
  };

  // the two models load once; tier 0 draws a couch and a drip stand instead
  const withModels = quality.tier > 0;
  const models = withModels ? loadModels(atmo) : Promise.resolve(null);
  let ready = null;
  models.then(m => { ready = m; }).catch(e => console.warn('[ward] models did not load; beds and wheelchairs are left out', e));

  return {
    withModels,
    build(group, plan) {
      const geos = [];
      const { anchor } = plan;
      if (ANCHOR_DRAW[anchor.type]) geos.push(...place(ANCHOR_DRAW[anchor.type](), anchor.x, 0, anchor.z, anchor.rot));
      for (const it of plan.items) {
        if (it.type === 'history' || it.type === 'xray') {
          const xr = it.type === 'xray';
          const variant = Math.floor(it.v * 2);
          const mat = texMat(it.type + variant, xr ? xrayTexture : historyTexture);
          const geo = new THREE.PlaneGeometry(xr ? 0.35 : 0.21, xr ? 0.43 : 0.297, 3, 3);
          const p = geo.attributes.position;
          for (let i = 0; i < p.count; i++) p.setZ(i, (Math.abs(p.getX(i)) + Math.abs(p.getY(i))) * 0.02 * it.v); // a little curl at the corners
          const mesh = new THREE.Mesh(geo, mat);
          mesh.rotation.set(-Math.PI / 2, 0, 0); mesh.rotateZ(it.rot);
          mesh.position.set(it.x, 0.003, it.z);
          mesh.userData.keepMaterial = true;
          group.add(mesh);
          continue;
        }
        geos.push(...place(SMALL_DRAW[it.type](it.v), it.x, 0, it.z, it.rot));
      }
      if (plan.lamp) {
        const { body, lens } = lampParts();
        geos.push(...place(body, plan.lamp.x, CEIL_H, plan.lamp.z, plan.lamp.rot));
        place(lens, plan.lamp.x, CEIL_H, plan.lamp.z, plan.lamp.rot);
        const seed = Math.floor(plan.lamp.seed);
        let lm = lensMats.get(seed % 4);
        if (!lm) { lm = atmo.prop({ color: 0xdce8ec, glow: 0.9, seed: seed % 4 * 17.3 }); lensMats.set(seed % 4, lm); }
        const mesh = new THREE.Mesh(mergeGeometries(lens), lm);
        mesh.userData.keepMaterial = true;
        group.add(mesh);
      }
      if (plan.sign) {
        const s = plan.sign, cross = s.text === '+';
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cross ? 0.24 : 0.72, cross ? 0.24 : 0.18), texMat('sign:' + s.text, () => signTexture(s.text)));
        mesh.position.set(s.x, 1.98, s.z);
        mesh.rotation.set(0, s.rot, s.tilt);
        mesh.userData.keepMaterial = true;
        group.add(mesh);
      }
      if (geos.length) {
        const mesh = new THREE.Mesh(mergeGeometries(geos), bodyMat);
        for (const g of geos) g.dispose();
        mesh.userData.keepMaterial = true;
        group.add(mesh);
      }
      // models: bed and wheelchair, added whenever they have arrived
      if (anchor.type === 'bed' || anchor.type === 'wheelchair') {
        const add = m => {
          if (!m || group.userData.gone) return;
          const src = m[anchor.type];
          const mesh = new THREE.Mesh(src.geometry, src.material);
          mesh.position.set(anchor.x, 0, anchor.z);
          mesh.rotation.y = anchor.rot + (anchor.flip ? Math.PI : 0);
          mesh.userData.keep = true;                   // shared by every island
          group.add(mesh);
        };
        if (ready) add(ready); else models.then(add).catch(() => {});
      }
    },
  };
}

// Load both models, bake their node transforms, stand them on the floor with
// the long side along local X, and light them like everything else.
async function loadModels(atmo) {
  const loader = new GLTFLoader();
  const one = async (name) => {
    const gltf = await loader.loadAsync(`assets/models/${name}.glb`);
    gltf.scene.updateMatrixWorld(true);
    let src = null;
    gltf.scene.traverse(o => { if (!src && o.isMesh) src = o; });
    const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
    for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    geo.computeBoundingBox();
    let b = geo.boundingBox, sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
    if (sz > sx) { geo.rotateY(Math.PI / 2); geo.computeBoundingBox(); b = geo.boundingBox; }
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    const map = src.material.map;
    if (map) { map.colorSpace = THREE.NoColorSpace; map.needsUpdate = true; }
    return { geometry: geo, material: atmo.prop({ map }) };
  };
  const [bed, wheelchair] = await Promise.all([one('old_bed_frame'), one('wheelchair_01')]);
  return { bed, wheelchair };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
