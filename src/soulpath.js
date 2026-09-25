import * as THREE from 'three';
import { CELL, CHUNK, CEIL_H, CONSPACE_SEED, solidAtGlobal, chunkRooms, hash2i, mulberry32 } from './world.js';
import { zoneWeights, ORIGIN } from './zones.js';
import { t } from './i18n.js';
import { EYE_HEIGHT } from './player.js';

// ── conspace-rooms · soulpath.js ────────────────────────────────────────────
// Everything that makes the labyrinth respond to the visitor on the way from
// fear to acceptance. All state lives in memory only and is gone on reload.
//
//   red scratches   the only red in the world: a few scratch marks on the
//                   walls at hand height, slanted the way to go, leading to the
//                   nearest SOULS piece not yet seen, and once all nearby ones
//                   are seen, onward, away from where you started
//   wall writings   scrawled at a child's height, one per some chunks, voiced
//                   by the zone; turn around and some of them have changed
//   presence doors  a few corridor crossings are shut; stand still in front of
//                   one for a few seconds and it lifts
//   secrets         walk backwards long enough and you shrink to a child's
//                   height; grandmother's kitchen hides in the memory zone; in
//                   acceptance, a minute of stillness hangs a nineteenth frame
//
// Integration: new SoulPath({...}) once the world exists, then update() every
// frame after player/artworks updates.

const MARK_COLOR = 0xb3141a;
const MARK_Y = 1.1;              // hand height, metres
const ROUTE_CELLS = 30;          // how much of the route gets marks (~36 m)
const MARK_EVERY = 2;            // cells between marks
const MARK_POOL = 14;
const REPATH_EVERY = 0.4;        // seconds
const SEEN_DIST = 3.2;           // metres: an artwork this close and in view counts as seen

const WRITING_Y = 0.72;          // child's height
const DOOR_WAIT = 3.0;           // seconds of stillness that open a door
const CHILD_AFTER = 30;          // seconds of walking backwards
const CHILD_EYE = 0.98;
const STILL_FOR_19 = 60;         // seconds of stillness in acceptance

const SEED_WRITING = CONSPACE_SEED ^ 0x77a1;
const SEED_DOOR = CONSPACE_SEED ^ 0x0d00;
const SEED_KITCHEN = CONSPACE_SEED ^ 0x4b17;

// ── small helpers ───────────────────────────────────────────────────────────
const cellOf = v => Math.floor(v / CELL);
const centreOf = g => (g + 0.5) * CELL;

function pick(list, r) { return list[Math.floor(r * list.length) % list.length]; }

// Chalk / pencil scrawl on a transparent canvas: each letter jittered and
// tilted a little, the stroke roughened, so it reads as written by hand.
function scrawlTexture(text, zone) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  const ink = zone.memory > 0.5 ? 'rgba(40,30,22,0.85)'        // pencil on wallpaper
    : zone.accept > 0.5 ? 'rgba(90,96,88,0.7)'                 // faint graphite on pale plaster
      : 'rgba(225,232,220,0.8)';                               // chalk on green paint
  ctx.fillStyle = ink;
  ctx.font = '34px "Departure Mono", monospace';
  ctx.textBaseline = 'middle';
  let x = 14;
  for (const ch of text) {
    const w = ctx.measureText(ch).width;
    ctx.save();
    ctx.translate(x + w / 2, 48 + (Math.random() - 0.5) * 7);
    ctx.rotate((Math.random() - 0.5) * 0.22);
    ctx.fillText(ch, -w / 2, 0);
    ctx.restore();
    x += w * (0.92 + Math.random() * 0.14);
    if (x > c.width - 30) break;
  }
  // rub some of it away
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function doorTexture(text, zone) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 340;
  const ctx = c.getContext('2d');
  // painted hospital door, varnished flat door, or a pale veil
  const base = zone.memory > 0.5 ? '#7a5534' : zone.accept > 0.5 ? '#d4d7ce' : '#4f8069';
  ctx.fillStyle = base; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, c.width - 48, 130); ctx.strokeRect(24, 180, c.width - 48, 136);
  for (let i = 0; i < 900; i++) { // wear
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  }
  ctx.fillStyle = zone.accept > 0.5 ? 'rgba(40,44,40,0.8)' : 'rgba(230,236,226,0.85)';
  ctx.font = '22px "Departure Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, c.width / 2, 168);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function placardTexture(lines) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4efe6'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#c9c0ac'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
  ctx.textAlign = 'center'; ctx.fillStyle = '#171512';
  ctx.font = '700 24px "Departure Mono", monospace'; ctx.fillText(lines[0], c.width / 2, 54);
  ctx.font = '400 30px "Departure Mono", monospace'; ctx.fillText(lines[1], c.width / 2, 116);
  ctx.fillStyle = '#8a8171'; ctx.font = '400 17px "Departure Mono", monospace'; ctx.fillText(lines[2], c.width / 2, c.height - 28);
  return new THREE.CanvasTexture(c);
}

// Three or four thin scratches, slanted up and to the right, as if a nail was
// dragged along the plaster in the direction of travel.
function scratchTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  const n = 3 + Math.floor(Math.random() * 2);
  for (let k = 0; k < n; k++) {
    const y0 = 40 + k * 16 + Math.random() * 6;
    const len = 150 + Math.random() * 70;
    ctx.lineWidth = 2 + Math.random() * 2.5;
    ctx.globalAlpha = 0.6 + Math.random() * 0.4;
    ctx.beginPath();
    let x = 20 + Math.random() * 16, y = y0 + 18;
    ctx.moveTo(x, y);
    while (x < 20 + len) { // jagged: many tiny segments with jitter
      x += 6 + Math.random() * 6;
      y -= 1.4 + (Math.random() - 0.5) * 2.2;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── SoulPath ────────────────────────────────────────────────────────────────
export class SoulPath {
  constructor({ scene, world, player, camera, artworks, audio, post, quality }) {
    Object.assign(this, { scene, world, player, camera, artworks, audio, post, quality });
    this.seen = new Set();          // art ids seen this visit
    this.chunkStuff = new Map();    // chunk key -> { group, writings[], doors[], kitchen }
    this.doorsOpen = new Set();     // door keys opened this visit
    this.textures = [];

    // red scratches: a small pool of wall decals, re-placed along the route
    this.markMat = new THREE.MeshBasicMaterial({
      map: scratchTexture(), color: MARK_COLOR, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, fog: true,
    });
    this.marks = Array.from({ length: MARK_POOL }, () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), this.markMat);
      m.visible = false;
      scene.add(m);
      return m;
    });
    this._repathT = 0;
    this._pathKey = '';

    // turn-around detection (yaw history over the last ~1.5 s)
    this._yawHist = [];

    // secrets
    this._backT = 0; this._fwdT = 0; this.child = false;
    this._stillT = 0; this.nineteenth = null;
    this._inKitchen = false;
    this._flames = []; this._screens = [];

    // doors take part in collision: wrap World's wall query once
    const orig = world.wallSegmentsNear.bind(world);
    world.wallSegmentsNear = (x, z) => {
      const segs = orig(x, z);
      for (const d of this._closedDoorsNear(x, z)) segs.push(d.seg);
      return segs;
    };
  }

  // ── chunk lifecycle (mirrors World) ────────────────────────────────────
  _sync() {
    for (const key of this.world.chunks.keys()) {
      if (!this.chunkStuff.has(key)) {
        const [cx, cz] = key.split(':').map(Number);
        this.chunkStuff.set(key, this._buildChunk(cx, cz));
      }
    }
    for (const [key, stuff] of this.chunkStuff) {
      if (this.world.chunks.has(key)) continue;
      this.scene.remove(stuff.group);
      stuff.group.traverse(o => {
        o.geometry?.dispose();
        if (o.material && o.material !== this.markMat) { o.material.map?.dispose(); o.material.dispose(); }
      });
      this.chunkStuff.delete(key);
    }
  }

  _buildChunk(cx, cz) {
    const group = new THREE.Group();
    group.name = 'soul_' + cx + '_' + cz;
    this.scene.add(group);
    const stuff = { group, writings: [], doors: [], kitchen: null };

    // ── writings: about half the chunks get one, on a deterministic wall run
    const rw = mulberry32(hash2i(SEED_WRITING, cx, cz));
    if (rw() < 0.55) {
      const slots = this.world.getWallSlots(cx, cz).filter(s => s.length >= 2);
      if (slots.length) {
        const slot = slots[Math.floor(rw() * slots.length)];
        const along = (rw() - 0.5) * (slot.length - 1.6) * CELL; // slide along the run
        const pos = new THREE.Vector3(
          slot.position.x + slot.normal.x * 0.012 + (slot.normal.x === 0 ? along : 0),
          WRITING_Y,
          slot.position.z + slot.normal.z * 0.012 + (slot.normal.z === 0 ? along : 0));
        const zone = zoneWeights(pos.x, pos.z);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28),
          new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
        mesh.position.copy(pos);
        mesh.rotation.y = Math.atan2(slot.normal.x, slot.normal.z);
        group.add(mesh);
        const w = { mesh, zone, seed: rw(), behindT: 0 };
        this._writeOn(w);
        stuff.writings.push(w);
      }
    }

    // ── presence doors on this chunk's west and north edge crossings.
    // Never in the spawn chunk, so nobody starts boxed in.
    if (!(cx === 0 && cz === 0)) {
      const rd = mulberry32(hash2i(SEED_DOOR, cx, cz));
      for (const edge of ['west', 'north']) {
        const band = rd() < 0.5 ? 4 : 10;
        if (rd() > 0.16) continue;              // about one crossing in six
        const key = `${cx}:${cz}:${edge}`;
        if (this.doorsOpen.has(key)) continue;
        stuff.doors.push(this._makeDoor(group, cx, cz, edge, band, key));
      }
    }

    // ── grandmother's kitchen: rare, only deep in the memory zone
    const rooms = chunkRooms(cx, cz);
    const room = rooms.find(r => r.x1 - r.x0 >= 4 && r.y1 - r.y0 >= 4);
    if (room && hash2i(SEED_KITCHEN, cx, cz) % 13 === 0) {
      const x = (cx * CHUNK + (room.x0 + room.x1 + 1) / 2) * CELL;
      const z = (cz * CHUNK + (room.y0 + room.y1 + 1) / 2) * CELL;
      if (zoneWeights(x, z).memory > 0.8) {
        stuff.kitchen = {
          x, z,
          minX: (cx * CHUNK + room.x0) * CELL, maxX: (cx * CHUNK + room.x1 + 1) * CELL,
          minZ: (cz * CHUNK + room.y0) * CELL, maxZ: (cz * CHUNK + room.y1 + 1) * CELL,
        };
        this._makeKitchen(group, x, z);
      }
    }
    return stuff;
  }

  _writeOn(w) {
    const listKey = w.zone.accept > 0.5 ? 'wallAccept' : w.zone.memory > 0.5 ? 'wallMemory' : 'wallFear';
    const text = pick(t(listKey), w.seed);
    const old = w.mesh.material.map;
    w.mesh.material.map = scrawlTexture(text, w.zone);
    w.mesh.material.needsUpdate = true;
    old?.dispose();
  }

  _makeDoor(group, cx, cz, edge, band, key) {
    // The corridor crosses the edge through cells band, band+1 (2.4 m wide).
    const span = 2 * CELL;
    let x, z, rotY, seg;
    if (edge === 'west') {
      x = cx * CHUNK * CELL; z = (cz * CHUNK + band) * CELL + span / 2; rotY = Math.PI / 2;
      seg = { a: { x, z: z - span / 2 }, b: { x, z: z + span / 2 }, nx: 1, nz: 0 };
    } else {
      x = (cx * CHUNK + band) * CELL + span / 2; z = cz * CHUNK * CELL; rotY = 0;
      seg = { a: { x: x - span / 2, z }, b: { x: x + span / 2, z }, nx: 0, nz: 1 };
    }
    const zone = zoneWeights(x, z);
    const tex = doorTexture(t('doorWait'), zone);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(span, CEIL_H, 0.08),
      new THREE.MeshBasicMaterial({ map: tex, color: 0x9a9a9a }));
    mesh.position.set(x, CEIL_H / 2, z);
    mesh.rotation.y = rotY;
    group.add(mesh);
    return { key, mesh, seg, x, z, waitT: 0, lift: 0, open: false };
  }

  _makeKitchen(group, x, z) {
    const M = (color) => new THREE.MeshBasicMaterial({ color, fog: true });
    const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x + px, py, z + pz); group.add(m); return m; };
    const wood = M(0x5a3b22), woodDark = M(0x3b2616);
    // table with an oilcloth: a checked canvas, the kind every kitchen had
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#e8e2d2' : '#5f8a86'; ctx.fillRect(i * 16, j * 16, 16, 16);
    }
    const cloth = new THREE.CanvasTexture(c); cloth.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.BoxGeometry(1.2, 0.04, 0.8), new THREE.MeshBasicMaterial({ map: cloth, fog: true }), 0, 0.76, 0);
    for (const [lx, lz] of [[-0.54, -0.34], [0.54, -0.34], [-0.54, 0.34], [0.54, 0.34]]) {
      add(new THREE.BoxGeometry(0.05, 0.74, 0.05), woodDark, lx, 0.37, lz);
    }
    for (const sx of [-0.85, 0.85]) { // two stools
      add(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 16), wood, sx, 0.46, 0);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.44, 6), woodDark, sx, 0.22, 0);
    }
    // teapot and a cup
    const enamel = M(0xd9d2c0);
    add(new THREE.SphereGeometry(0.11, 16, 12), enamel, 0.1, 0.87, 0).scale.set(1, 0.8, 1);
    const spout = add(new THREE.CylinderGeometry(0.012, 0.022, 0.13, 8), enamel, 0.22, 0.9, 0);
    spout.rotation.z = -0.9;
    add(new THREE.SphereGeometry(0.03, 8, 6), M(0x7a2f1e), 0.1, 0.96, 0);
    add(new THREE.CylinderGeometry(0.04, 0.035, 0.08, 12), M(0xe9e4d6), -0.25, 0.82, 0.12);
    // a candelabra on the table: five candles, flames flicker in update()
    add(new THREE.CylinderGeometry(0.012, 0.03, 0.26, 8), M(0x2a2119), -0.3, 0.91, -0.15);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2, cxk = -0.3 + Math.cos(a) * (k ? 0.09 : 0), czk = -0.15 + Math.sin(a) * (k ? 0.09 : 0);
      const hk = k ? 0.16 : 0.2;
      add(new THREE.CylinderGeometry(0.011, 0.011, hk, 8), M(0xe8dcc4), cxk, 1.04 + hk / 2, czk);
      const flame = add(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a1c, fog: false }), cxk, 1.06 + hk, czk);
      flame.scale.y = 1.8;
      this._flames.push(flame);
    }
    // an old television against the room, its screen a red glow
    add(new THREE.BoxGeometry(0.9, 0.5, 0.45), woodDark, 0, 0.25, 1.9);
    add(new THREE.BoxGeometry(0.72, 0.56, 0.5), M(0x16130f), 0, 0.78, 1.9);
    const screen = add(new THREE.PlaneGeometry(0.5, 0.38), new THREE.MeshBasicMaterial({ color: 0xff1e1e, fog: false }), -0.06, 0.8, 1.64);
    screen.rotation.y = Math.PI;
    this._screens.push(screen);
    // a fabric lampshade low over the table, glowing warm
    const shade = add(new THREE.ConeGeometry(0.34, 0.26, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xc99a4a, side: THREE.DoubleSide, fog: true }), 0, 2.2, 0);
    shade.rotation.x = 0;
    add(new THREE.SphereGeometry(0.07, 12, 8), M(0xfff1c8), 0, 2.08, 0);
    add(new THREE.CylinderGeometry(0.006, 0.006, CEIL_H - 2.3, 4), woodDark, 0, (CEIL_H + 2.3) / 2, 0);
    // a warm pool of light on the floor under the table
    const g = document.createElement('canvas'); g.width = g.height = 128;
    const gctx = g.getContext('2d');
    const grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,200,120,0.55)'); grad.addColorStop(1, 'rgba(255,200,120,0)');
    gctx.fillStyle = grad; gctx.fillRect(0, 0, 128, 128);
    const pool = add(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(g), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), 0, 0.012, 0);
    pool.rotation.x = -Math.PI / 2;
  }

  _closedDoorsNear(x, z) {
    const out = [];
    for (const stuff of this.chunkStuff.values()) {
      for (const d of stuff.doors) {
        if (!d.open && Math.abs(d.x - x) < 4 && Math.abs(d.z - z) < 4) out.push(d);
      }
    }
    return out;
  }

  // ── route for the red scratches: breadth-first over open cells ─────────
  _route(goalFn, fromGi, fromGj, maxNodes = 7000) {
    const key = (i, j) => i + ',' + j;
    const prev = new Map([[key(fromGi, fromGj), null]]);
    const q = [[fromGi, fromGj]];
    let best = null, bestScore = -Infinity;
    for (let head = 0; head < q.length && head < maxNodes; head++) {
      const [i, j] = q[head];
      const s = goalFn(i, j);
      if (s === Infinity) { best = [i, j]; break; }
      if (s > bestScore) { bestScore = s; best = [i, j]; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, k = key(ni, nj);
        if (prev.has(k) || solidAtGlobal(ni, nj)) continue;
        if (this._doorBlocks(i, j, ni, nj)) continue;
        prev.set(k, [i, j]);
        q.push([ni, nj]);
      }
    }
    if (!best) return [];
    const path = [];
    for (let c = best; c; c = prev.get(key(c[0], c[1]))) path.push(c);
    return path.reverse();
  }

  // a closed door sits on a chunk edge between two cells
  _doorBlocks(i, j, ni, nj) {
    for (const stuff of this.chunkStuff.values()) for (const d of stuff.doors) {
      if (d.open) continue;
      const mx = (Math.max(i, ni)) * CELL, mz = (Math.max(j, nj)) * CELL;
      if (i !== ni && Math.abs(mx - d.seg.a.x) < 1e-3 && d.seg.a.x === d.seg.b.x
        && centreOf(j) > d.seg.a.z && centreOf(j) < d.seg.b.z) return true;
      if (j !== nj && Math.abs(mz - d.seg.a.z) < 1e-3 && d.seg.a.z === d.seg.b.z
        && centreOf(i) > d.seg.a.x && centreOf(i) < d.seg.b.x) return true;
    }
    return false;
  }

  _updateMarks() {
    const p = this.player.pos;
    const gi = cellOf(p.x), gj = cellOf(p.y);
    // target: nearest artwork not yet seen; else onward, away from spawn
    let target = null, td = Infinity;
    for (const a of this.artworks.active) {
      if (this.seen.has(a.art.id)) continue;
      const d = Math.hypot(a.centerWorld.x - p.x, a.centerWorld.z - p.y);
      if (d < td) { td = d; target = a; }
    }
    let goalFn, goalKey;
    if (target) {
      const tx = cellOf(target.centerWorld.x + target.normal.x * 0.9);
      const tz = cellOf(target.centerWorld.z + target.normal.z * 0.9);
      goalFn = (i, j) => (i === tx && j === tz ? Infinity : -Math.hypot(i - tx, j - tz));
      goalKey = `a${tx},${tz}`;
    } else {
      // no unseen work in reach: lead outward, toward acceptance
      const lim = 40;
      goalFn = (i, j) => (Math.abs(i - gi) > lim || Math.abs(j - gj) > lim ? -Infinity
        : Math.hypot(centreOf(i) - ORIGIN.x, centreOf(j) - ORIGIN.z));
      goalKey = 'out';
    }
    const pathKey = `${gi},${gj}:${goalKey}:${this.doorsOpen.size}`;
    if (pathKey === this._pathKey) return;
    this._pathKey = pathKey;

    const cells = this._route(goalFn, gi, gj).slice(0, ROUTE_CELLS);
    this.marks.forEach(m => { m.visible = false; });
    let used = 0;
    for (let k = 2; k < cells.length - 1 && used < this.marks.length; k += MARK_EVERY) {
      const [i, j] = cells[k], [ni, nj] = cells[k + 1];
      const di = ni - i, dj = nj - j;
      // a wall beside this step: left or right of the direction of travel
      const sides = di !== 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      const side = sides.find(([si, sj]) => solidAtGlobal(i + si, j + sj));
      if (!side) continue;
      const [si, sj] = side;
      const nx = -si, nz = -sj;                         // wall normal, into the corridor
      const m = this.marks[used++];
      m.position.set(
        si ? (si > 0 ? (i + 1) * CELL : i * CELL) + nx * 0.013 : centreOf(i),
        MARK_Y + (k % 2) * 0.12,
        sj ? (sj > 0 ? (j + 1) * CELL : j * CELL) + nz * 0.013 : centreOf(j));
      m.rotation.set(0, Math.atan2(nx, nz), 0);
      // plane's local +x in world is (nz, -nx); mirror so the slant points onward
      m.scale.x = di * nz - dj * nx >= 0 ? 1 : -1;
      m.visible = true;
    }
  }

  // ── per-frame ───────────────────────────────────────────────────────────
  update(dt, time, zone) {
    this._sync();
    const P = this.player, cam = this.camera;
    const speed = P.vel.length();
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);

    // seen: close enough and roughly in front
    for (const a of this.artworks.active) {
      const dx = a.centerWorld.x - P.pos.x, dz = a.centerWorld.z - P.pos.y;
      const d = Math.hypot(dx, dz);
      if (d < SEEN_DIST && (fx * dx + fz * dz) / (d || 1) > 0.5) this.seen.add(a.art.id);
    }
    if (this.artworks.inspecting) this.seen.add(this.artworks.inspecting.art.id);

    this._repathT -= dt;
    if (this._repathT <= 0) { this._repathT = REPATH_EVERY; this._updateMarks(); }

    // turn-around: more than ~145° of turning inside 1.5 s
    this._yawHist.push([time, P.yaw]);
    while (this._yawHist.length && time - this._yawHist[0][0] > 1.5) this._yawHist.shift();
    const turned = Math.abs(P.yaw - this._yawHist[0][1]);
    if (turned > 2.5 && !this._turning) {
      this._turning = true;
      this.post?.burst(0.9);
      // whatever was behind you may not be what it was
      for (const s of this.chunkStuff.values()) for (const w of s.writings) {
        if (w.behindT > 0.8 && Math.random() < 0.6) { w.seed = Math.random(); this._writeOn(w); }
      }
    } else if (turned < 1.0) this._turning = false;
    // track how long each writing has been out of sight behind you
    for (const s of this.chunkStuff.values()) for (const w of s.writings) {
      const dx = w.mesh.position.x - cam.position.x, dz = w.mesh.position.z - cam.position.z;
      const d = Math.hypot(dx, dz);
      w.behindT = d < 14 && (fx * dx + fz * dz) / (d || 1) < -0.2 ? w.behindT + dt : 0;
    }

    // presence doors: stand still close to one and it lifts into the ceiling
    for (const s of this.chunkStuff.values()) for (const d of s.doors) {
      if (d.open) {
        if (d.lift < 1) {
          d.lift = Math.min(1, d.lift + dt / 1.6);
          d.mesh.position.y = CEIL_H / 2 + d.lift * (CEIL_H - 0.05);
        }
        continue;
      }
      const near = Math.hypot(d.x - P.pos.x, d.z - P.pos.y) < 2.8;
      d.waitT = near && speed < 0.08 && !P.locked ? d.waitT + dt : Math.max(0, d.waitT - dt * 2);
      const glow = 0.8 + 0.2 * Math.min(1, d.waitT / DOOR_WAIT);
      d.mesh.material.color.setScalar(glow);
      if (d.waitT >= DOOR_WAIT) {
        d.open = true;
        this.doorsOpen.add(d.key);
        this.audio?.chime();
      }
    }

    // secret: walk backwards for 30 s and you are small again
    if (P.intent < 0) { this._backT += dt; this._fwdT = 0; }
    else if (P.intent > 0) { this._fwdT += dt; this._backT = 0; }
    if (!this.child && this._backT > CHILD_AFTER) { this.child = true; P.eyeTarget = CHILD_EYE; this.audio?.chime(); }
    if (this.child && this._fwdT > 25) { this.child = false; P.eyeTarget = EYE_HEIGHT; }

    // secret: grandmother's kitchen is quiet
    let inKitchen = false;
    for (const s of this.chunkStuff.values()) {
      const k = s.kitchen;
      if (k && P.pos.x > k.minX && P.pos.x < k.maxX && P.pos.y > k.minZ && P.pos.y < k.maxZ) inKitchen = true;
    }
    if (inKitchen !== this._inKitchen) { this._inKitchen = inKitchen; this.audio?.hush(inKitchen); }

    // secret: a minute of stillness in acceptance hangs a nineteenth frame
    if (!this.nineteenth && zone.accept > 0.7 && speed < 0.05 && !P.locked) this._stillT += dt;
    else this._stillT = 0;
    if (this._stillT > STILL_FOR_19) this._hangNineteenth(time);
    if (this.nineteenth) {
      this.nineteenth.canvas.material.opacity = 0.55 + 0.25 * Math.sin(time * 0.8);
    }

    // candle flames and the television breathe
    for (const f of this._flames) {
      if (!f.parent) continue;
      f.scale.set(1, 1.6 + Math.sin(time * 13 + f.id) * 0.3 + Math.random() * 0.2, 1);
    }
    for (const sc of this._screens) {
      if (!sc.parent) continue;
      sc.material.color.setRGB(0.85 + 0.15 * Math.sin(time * 7.3 + sc.id) * Math.random(), 0.1, 0.1);
    }
    this._flames = this._flames.filter(f => f.parent?.parent); // drop ones whose chunk was disposed
    this._screens = this._screens.filter(sc => sc.parent?.parent);

    // voices of the works nearby
    this._updateVoices(zone);
  }

  // Find the wall straight ahead and hang an empty frame on it.
  _hangNineteenth() {
    const P = this.player;
    // straight ahead if there is a wall there, otherwise the nearest one to the side
    for (const off of [0, 0.4, -0.4, 0.9, -0.9, 1.57, -1.57, 3.14]) {
      if (this._hangAt(P.yaw + off)) return;
    }
    this._stillT = 0; // nothing to hang it on; try again after another minute
  }

  _hangAt(yaw) {
    const P = this.player;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let pi = cellOf(P.pos.x), pj = cellOf(P.pos.y);
    for (let s = 0.2; s < 9; s += 0.1) {
      const x = P.pos.x + fx * s, z = P.pos.y + fz * s;
      const gi = cellOf(x), gj = cellOf(z);
      if (solidAtGlobal(gi, gj)) {
        // face normal points back into the open cell we came from
        const nx = gi !== pi ? Math.sign(pi - gi) : 0, nz = gj !== pj ? Math.sign(pj - gj) : 0;
        const wx = nx ? (nx > 0 ? (gi + 1) * CELL : gi * CELL) : x;
        const wz = nz ? (nz > 0 ? (gj + 1) * CELL : gj * CELL) : z;
        const g = new THREE.Group();
        g.position.set(wx + nx * 0.012, 1.55, wz + nz * 0.012);
        g.rotation.y = Math.atan2(nx, nz);
        const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.45),
          new THREE.MeshBasicMaterial({ color: 0xf6f7ef, transparent: true, opacity: 0.6, fog: false }));
        g.add(canvas);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.57, 0.05), new THREE.MeshBasicMaterial({ color: 0x3b2c17 }));
        frame.position.z = -0.03;
        g.add(frame);
        const plac = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2),
          new THREE.MeshBasicMaterial({ map: placardTexture(['UVALISS', t('youLabel'), 'SOULS · 19']) }));
        plac.position.set(0.55 + 0.06 + 0.1 + 0.17, -0.2, 0.002);
        g.add(plac);
        this.scene.add(g);
        this.nineteenth = { group: g, canvas };
        this.audio?.chime();
        return true;
      }
      pi = gi; pj = gj;
    }
    return false;
  }

  _updateVoices(zone) {
    if (!this.audio?.setArtVoices) return;
    const P = this.player;
    const near = this.artworks.active
      .map(a => ({ a, d: Math.hypot(a.centerWorld.x - P.pos.x, a.centerWorld.z - P.pos.y) }))
      .filter(o => o.d < 30)
      .sort((u, v) => u.d - v.d)
      .slice(0, 4)
      .map(({ a }) => ({
        key: a.chunkKey + ':' + a.art.id,
        index: parseInt(a.art.id, 10) - 1,
        x: a.centerWorld.x, z: a.centerWorld.z,
        seen: this.seen.has(a.art.id),
        occluded: !this._lineOfSight(P.pos.x, P.pos.y, a.centerWorld.x + a.normal.x * 0.3, a.centerWorld.z + a.normal.z * 0.3),
      }));
    this.audio.setArtVoices({ x: P.pos.x, z: P.pos.y, yaw: P.yaw }, near);
    this.audio.setZone?.(zone);
  }

  _lineOfSight(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.4);
    for (let k = 1; k < n; k++) {
      const x = x0 + (x1 - x0) * (k / n), z = z0 + (z1 - z0) * (k / n);
      if (solidAtGlobal(cellOf(x), cellOf(z))) return false;
    }
    return true;
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
