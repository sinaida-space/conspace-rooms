import * as THREE from 'three';
import { CELL, CHUNK, CEIL_H, CONSPACE_SEED, solidAtGlobal, chunkRooms, hash2i, mulberry32 } from './world.js';
import { zoneWeights, ORIGIN, ZONE } from './zones.js';
import { t } from './i18n.js';
import { EYE_HEIGHT } from './player.js';
import { buildKitchen, createKitchenRig, buildScatter, tickCandles } from './kitchen.js';
import { baroqueFrame } from './frames.js';
import { buildDoorway } from './doorway.js';

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
//   portals         shimmering doorways further out; walking through one moves
//                   the whole world to the next stage (fear → memory → light).
//                   Nothing else changes the stage.
//   souls           in grandmother's room three lights drift: the soul of
//                   someone close (gold), of a child (green), of a grown-up
//                   (deep red). Walk into one and it scatters; its question
//                   types itself on the television and across the screen.
//   posters         old terminal printouts pinned to corridor walls, each
//                   asking one question
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
const SEED_PORTAL = CONSPACE_SEED ^ 0x9047;
const SEED_SCATTER = CONSPACE_SEED ^ 0x5ca7;
const SEED_POSTER = CONSPACE_SEED ^ 0x7057;
const SOUL_COLORS = [0xffd27a, 0x5dff8a, 0xd0202a]; // someone close · a child · a grown-up

// Portals of one chunk as a pure function, so any chunk can ask where the
// nearest portal is without that chunk being built.
function portalPlan(cx, cz) {
  const out = [];
  const rp = mulberry32(hash2i(SEED_PORTAL, cx, cz));
  for (const edge of ['west', 'north']) {
    const band = rp() < 0.5 ? 4 : 10, roll = rp();
    const mx = edge === 'west' ? cx * CHUNK * CELL : (cx * CHUNK + band + 1) * CELL;
    const mz = edge === 'west' ? (cz * CHUNK + band + 1) * CELL : cz * CHUNK * CELL;
    const d = Math.hypot(mx - ORIGIN.x, mz - ORIGIN.z);
    const target = d >= ZONE.ACC_A ? 2 : d >= ZONE.MEM_A ? 1 : 0;
    if (!target || roll > 0.4) continue;
    out.push({ edge, band, target, x: mx, z: mz });
  }
  return out;
}

// Grandmother's room of one chunk (or null), as a pure function: a big enough
// room, one chunk in seven, deep in the memory ring.
function kitchenPlan(cx, cz) {
  const room = chunkRooms(cx, cz).find(r => r.x1 - r.x0 >= 4 && r.y1 - r.y0 >= 4);
  if (!room || hash2i(SEED_KITCHEN, cx, cz) % 5 !== 0) return null;
  const x = (cx * CHUNK + (room.x0 + room.x1 + 1) / 2) * CELL;
  const z = (cz * CHUNK + (room.y0 + room.y1 + 1) / 2) * CELL;
  if (zoneWeights(x, z).memory <= 0.3) return null;   // from ~55 m out, just past the first portals
  return {
    x, z,
    minX: (cx * CHUNK + room.x0) * CELL, maxX: (cx * CHUNK + room.x1 + 1) * CELL,
    minZ: (cz * CHUNK + room.y0) * CELL, maxZ: (cz * CHUNK + room.y1 + 1) * CELL,
  };
}

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

let GLOW = null;
function glowTexture() {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  GLOW = new THREE.CanvasTexture(c);
  return GLOW;
}

// A question printed like an old terminal screen dump and pinned to the wall:
// phosphor text on black, a double-line box, a file path header, a prompt,
// tape on the corners, the print faded and scuffed.
const PHOSPHOR = ['#39ff6a', '#ffb347', '#dfe8d8'];
function posterTexture(text, n, stage) {
  const W = 480, H = 640, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), ink = PHOSPHOR[stage] || PHOSPHOR[0];
  g.fillStyle = '#040806'; g.fillRect(0, 0, W, H);
  g.fillStyle = ink; g.strokeStyle = ink; g.shadowColor = ink; g.shadowBlur = 6;
  g.lineWidth = 3; g.strokeRect(22, 22, W - 44, H - 44);
  g.lineWidth = 1.5; g.strokeRect(32, 32, W - 64, H - 64);
  g.font = '18px "Departure Mono", monospace';
  g.fillText(`C:\\CONSPACE\\SOULS\\Q_${String(n).padStart(2, '0')}.TXT`, 48, 70);
  g.fillRect(48, 84, W - 96, 2);
  g.font = '30px "Departure Mono", monospace';
  const words = text.split(' '); let line = '', y = 150;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > W - 110 && line) { g.fillText(line, 48, y); line = w; y += 44; }
    else line = test;
  }
  g.fillText(line, 48, y);
  g.font = '18px "Departure Mono", monospace';
  g.fillText('> _', 48, H - 70);
  g.fillText('[ ENTER ]', W - 170, H - 70);
  g.shadowBlur = 0;
  for (let yy = 0; yy < H; yy += 3) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, yy, W, 1); } // scanlines of the print
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  const fade = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(20,14,6,0.55)');
  g.fillStyle = fade; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(214,200,160,0.75)';             // tape on the corners
  for (const [tx, ty, r] of [[30, 12, -0.4], [W - 30, 12, 0.4]]) { g.save(); g.translate(tx, ty); g.rotate(r); g.fillRect(-36, -10, 72, 20); g.restore(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

// ── SoulPath ────────────────────────────────────────────────────────────────
export class SoulPath {
  constructor({ scene, world, player, camera, artworks, audio, post, quality, renderer, stage }) {
    Object.assign(this, { scene, world, player, camera, artworks, audio, post, quality, stage });
    this._lastStage = stage.stage;
    this._prevPos = { x: player.pos.x, z: player.pos.y };
    this.kitchenRig = createKitchenRig(scene, renderer, quality);
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
    this._soulIdx = [0, 0, 0];            // next question per soul

    // doors take part in collision: wrap World's wall query once
    const orig = world.wallSegmentsNear.bind(world);
    world.wallSegmentsNear = (x, z) => {
      const segs = orig(x, z);
      for (const d of this._doorsNear(x, z)) { segs.push(...d.walls); if (!d.open) segs.push(d.seg); }
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
        if (o.userData.keep) return;                  // shared scatter geometry and materials
        o.geometry?.dispose();
        if (o.material && o.material !== this.markMat && !o.userData.keepMaterial) { o.material.map?.dispose(); o.material.dispose(); }
      });
      this.chunkStuff.delete(key);
    }
  }

  _buildChunk(cx, cz) {
    const group = new THREE.Group();
    group.name = 'soul_' + cx + '_' + cz;
    this.scene.add(group);
    const stuff = { group, writings: [], doors: [], kitchen: null, portals: [] };

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
        const zone = this.stage.weights();
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

    // ── portals: out past the fear zone, some crossings carry a doorway into
    // the next stage. Deterministic per edge, so they are always where they were.
    const usedEdges = new Set();
    for (const pp of portalPlan(cx, cz)) {
      stuff.portals.push(this._makePortal(group, cx, cz, pp.edge, pp.band, pp.target));
      usedEdges.add(pp.edge);
    }

    // ── posters: one terminal printout on some chunks, beside (never over) a work
    const rpo = mulberry32(hash2i(SEED_POSTER, cx, cz));
    stuff.posters = [];
    if (rpo() < 0.45) {
      const long = this.world.getWallSlots(cx, cz).filter(sl => sl.length >= 4);
      if (long.length) {
        const sl = long[Math.floor(rpo() * long.length)];
        const off = (rpo() < 0.5 ? -1 : 1) * (sl.length * CELL / 2 - 0.7);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.04), new THREE.MeshBasicMaterial({ fog: true }));
        mesh.position.set(
          sl.position.x + sl.normal.x * 0.013 + (sl.normal.x === 0 ? off : 0), 1.6,
          sl.position.z + sl.normal.z * 0.013 + (sl.normal.z === 0 ? off : 0));
        mesh.rotation.set(0, Math.atan2(sl.normal.x, sl.normal.z), (rpo() - 0.5) * 0.05); // pinned a little crooked
        group.add(mesh);
        const p = { mesh, q: Math.floor(rpo() * 1000) };
        this._printPoster(p);
        stuff.posters.push(p);
      }
    }

    // ── scattered things: candles, teapots, cups. The closer the portal into
    // the next stage, the more of them, so they thicken into a trail.
    stuff.scatter = this._buildScatter(group, cx, cz);

    // ── presence doors on this chunk's west and north edge crossings.
    // Never in the spawn chunk, so nobody starts boxed in.
    if (!(cx === 0 && cz === 0)) {
      const rd = mulberry32(hash2i(SEED_DOOR, cx, cz));
      for (const edge of ['west', 'north']) {
        const band = rd() < 0.5 ? 4 : 10;
        if (rd() > 0.26 || usedEdges.has(edge)) continue; // about one crossing in four
        const key = `${cx}:${cz}:${edge}`;
        if (this.doorsOpen.has(key)) continue;
        stuff.doors.push(this._makeDoor(group, cx, cz, edge, band, key));
      }
    }

    // ── grandmother's room: rare, only deep in the memory ring
    const kp = kitchenPlan(cx, cz);
    if (kp) {
      const kg = new THREE.Group();                   // only exists in the memory stage
      group.add(kg);
      stuff.kitchen = { ...kp, group: kg, room: buildKitchen(kg, kp.x, kp.z) };
      stuff.kitchen.wisps = SOUL_COLORS.map((color, cat) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        }));
        sprite.scale.set(0.35, 0.35, 1);
        kg.add(sprite);
        // a faint tail of smaller lights that lag behind, so it reads as alive
        const tail = [0.6, 0.42, 0.28].map(k => {
          const tsp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: k,
          }));
          tsp.scale.set(0.35 * k, 0.35 * k, 1);
          kg.add(tsp);
          return tsp;
        });
        const w = { sprite, tail, cat, gone: false, back: 0, seed: Math.random() * 10, pull: new THREE.Vector3() };
        this._placeWisp(w, stuff.kitchen);
        return w;
      });
    }
    return stuff;
  }

  _printPoster(p) {
    const list = t('posterQuestions');
    const i = p.q % list.length;
    const old = p.mesh.material.map;
    p.mesh.material.map = posterTexture(list[i], i + 1, this.stage.stage);
    p.mesh.material.needsUpdate = true;
    old?.dispose();
  }

  // Somewhere inside the room, at chest height, away from the walls.
  _placeWisp(w, k) {
    const m = 0.8;
    w.home = new THREE.Vector3(
      k.minX + m + Math.random() * Math.max(0.1, k.maxX - k.minX - 2 * m),
      1.2 + Math.random() * 0.6,
      k.minZ + m + Math.random() * Math.max(0.1, k.maxZ - k.minZ - 2 * m));
    w.sprite.position.copy(w.home);
  }

  // A soul scattered: its question types itself on the television and across
  // the screen, under a whisper.
  _askSoul(cat, room) {
    const qs = t('soulQuestions')[cat];
    const text = qs[this._soulIdx[cat]++ % qs.length];
    const label = t('soulLabels')[cat];
    this.audio?.whisper?.();
    // on the television: black screen, phosphor text
    for (const sc of room.screens) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 384;
      const g = c.getContext('2d');
      g.fillStyle = '#050000'; g.fillRect(0, 0, 512, 384);
      g.fillStyle = '#ff3a2a'; g.font = '26px "Departure Mono", monospace';
      const words = text.split(' '); let line = '', y = 110;
      for (const w of words) { const tt = line ? line + ' ' + w : w; if (g.measureText(tt).width > 440 && line) { g.fillText(line, 36, y); line = w; y += 36; } else line = tt; }
      g.fillText(line, 36, y);
      for (let yy = 0; yy < 384; yy += 3) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, yy, 512, 1); }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const prev = sc.material.map;
      sc.material.map = tex; sc.material.needsUpdate = true;
      setTimeout(() => { sc.material.map = prev; sc.material.needsUpdate = true; tex.dispose(); }, 12000);
    }
    this._say(label, text);
  }

  // A line typed across the lower screen, then gone.
  _say(label, text) {
    document.getElementById('soul-q')?.remove();
    const el = document.createElement('div');
    el.id = 'soul-q';
    el.innerHTML = `<p class="sq-label"></p><p class="sq-text"></p>`;
    el.querySelector('.sq-label').textContent = label;
    document.body.appendChild(el);
    const tEl = el.querySelector('.sq-text');
    let i = 0;
    const type = setInterval(() => { tEl.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(type); }, 45);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 1200); }, 11000);
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
    // The corridor crosses the edge through cells band, band+1 (2.4 m wide):
    // it gets closed by a piece of wall with a real door in it.
    const span = 2 * CELL, west = edge === 'west';
    const x = west ? cx * CHUNK * CELL : (cx * CHUNK + band) * CELL + span / 2;
    const z = west ? (cz * CHUNK + band) * CELL + span / 2 : cz * CHUNK * CELL;
    const d = buildDoorway(span, this.world.mat.wall, this.stage.stage, t('doorWait'));
    d.group.position.set(x, 0, z);
    d.group.rotation.y = west ? Math.PI / 2 : 0;
    group.add(d.group);
    // collision: the two wall pieces always, the door gap while closed
    const segAlong = (u0, u1) => west
      ? { a: { x, z: z + u0 }, b: { x, z: z + u1 }, nx: 1, nz: 0 }
      : { a: { x: x + u0, z }, b: { x: x + u1, z }, nx: 0, nz: 1 };
    const walls = [segAlong(-span / 2, -d.gap / 2), segAlong(d.gap / 2, span / 2)];
    const seg = segAlong(-d.gap / 2, d.gap / 2);
    const routeSeg = segAlong(-span / 2, span / 2);   // path-finding treats the closed crossing as shut
    return { key, pivot: d.pivot, leaf: d.door, walls, seg, routeSeg, x, z, waitT: 0, lift: 0, open: false };
  }


  // A doorway of light across a 2.4 m corridor crossing: a baroque frame
  // and a shimmering veil in the colours of the stage it leads to.
  _makePortal(group, cx, cz, edge, band, target) {
    const span = 2 * CELL;
    const west = edge === 'west';
    const x = west ? cx * CHUNK * CELL : (cx * CHUNK + band) * CELL + span / 2;
    const z = west ? (cz * CHUNK + band) * CELL + span / 2 : cz * CHUNK * CELL;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = west ? Math.PI / 2 : 0;
    // a walk-through baroque picture frame, gilt scratched down to the bole
    const openW = span - 0.6, openH = CEIL_H - 0.72;
    g.add(baroqueFrame(openW, openH, 0.3));
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(openW, openH - 0.06), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uFade: { value: 1 },
        uA: { value: new THREE.Color(target === 2 ? 0xfff6e0 : 0x9b0f14) },
        uB: { value: new THREE.Color(target === 2 ? 0xbfd6c8 : 0x1f6b3a) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime, uFade; uniform vec3 uA, uB; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          // two layers of slow noise flowing upward, bright at the core, fading to the frame
          float a = n(vUv * vec2(4.0, 7.0) + vec2(0.0, -uTime * 0.35));
          float b = n(vUv * vec2(9.0, 3.0) + vec2(uTime * 0.2, -uTime * 0.6));
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
          vec3 c = mix(uB, uA, a) * (0.35 + 0.65 * b);
          gl_FragColor = vec4(c * edge * uFade * 1.8, edge * 0.9 * uFade);
        }`,
    }));
    veil.position.set(0, 0.06 + openH / 2, 0);
    g.add(veil);
    group.add(g);
    return { x, z, west, span: openW, target, veil, group: g };
  }

  // Walking through a portal: the side of its plane the visitor is on flips
  // while they are inside its span.
  _checkPortals(prev, cur) {
    for (const st of this.chunkStuff.values()) for (const p of st.portals) {
      if (Math.abs(p.x - cur.x) > 3 || Math.abs(p.z - cur.z) > 3) continue;
      const a0 = p.west ? prev.x - p.x : prev.z - p.z, a1 = p.west ? cur.x - p.x : cur.z - p.z;
      const along = p.west ? cur.z - p.z : cur.x - p.x;
      if (!p.group.visible) continue;
      if (Math.sign(a0) !== Math.sign(a1) && Math.abs(along) < p.span / 2 && this.stage.go(p.target)) {
        this.post?.burst(1.6);
        this.audio?.chime();
      }
    }
  }

  // Distance from (x, z) to the nearest portal leading past the current stage,
  // searched over the chunks around, built or not.
  _nextPortals(cx, cz) {
    const out = [];
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      for (const p of portalPlan(cx + dx, cz + dz)) if (p.target === this.stage.stage + 1) out.push(p);
    }
    return out;
  }

  // Candles along the walls are the map. Their colour tells how close you are:
  //   fear stage     the flame reddens toward a portal into the red rooms
  //   memory stage   the flame turns yellow toward the next portal, and the
  //                  wax itself reddens toward grandmother's room
  //   light stage    pale, nothing left to find
  _buildScatter(group, cx, cz) {
    const st = this.stage.stage;
    const rnd = mulberry32(hash2i(SEED_SCATTER ^ (st * 7919), cx, cz));
    const portals = this._nextPortals(cx, cz);
    const kitchens = [];
    if (st === 1) for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) { const k = kitchenPlan(cx + dx, cz + dz); if (k) kitchens.push(k); }
    const seekRoom = st === 1 && !this.visitedRoom;   // red rooms: first the room, then the way on
    const near = (list, x, z) => { let d = Infinity; for (const p of list) d = Math.min(d, Math.hypot(p.x - x, p.z - z)); return d; };
    const prox = d => { const k = Math.max(0, Math.min(1, 1 - d / 45)); return k * k * (3 - 2 * k); };
    const YELLOW = new THREE.Color(0xffd27a), RED = new THREE.Color(0xff2a14), PALE_WAX = new THREE.Color(0xe6dac0), RED_WAX = new THREE.Color(0x8e1216);
    const items = [];
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const gi = cx * CHUNK + i, gj = cz * CHUNK + j;
      if (solidAtGlobal(gi, gj)) continue;
      const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([di, dj]) => solidAtGlobal(gi + di, gj + dj));
      const r = rnd();
      if (!side) continue;                              // only along walls, so paths stay clear
      const x = centreOf(gi) + side[0] * 0.36 + (rnd() - 0.5) * 0.3;
      const z = centreOf(gj) + side[1] * 0.36 + (rnd() - 0.5) * 0.3;
      const pp = seekRoom ? 0 : prox(near(portals, x, z));
      const pk = st === 1 ? Math.max(0, Math.min(1, 1 - near(kitchens, x, z) / 70)) : 0;
      if (r > 0.035 + 0.05 * Math.max(pp, pk)) continue;
      const flame = st === 0 ? YELLOW.clone().lerp(RED, pp)
        : seekRoom ? YELLOW.clone().lerp(RED, pk)        // before the room: everything reddens toward it
          : st === 1 ? RED.clone().lerp(YELLOW, pp)      // after: the flame yellows toward the way into the light
            : new THREE.Color(0xfff4dc);
      const wax = st === 1 ? PALE_WAX.clone().lerp(RED_WAX, pk) : PALE_WAX.clone();
      items.push({ type: 'candle', x, z, rot: rnd() * 6.28, flame, wax });
    }
    return buildScatter(group, items);
  }

  // After a stage change the trail must lead to the next portal: rebuild it.
  _rebuildScatter() {
    for (const [key, st] of this.chunkStuff) {
      st.scatter?.dispose();
      const [cx, cz] = key.split(':').map(Number);
      st.scatter = this._buildScatter(st.group, cx, cz);
    }
  }

  _doorsNear(x, z) {
    const out = [];
    for (const stuff of this.chunkStuff.values()) {
      for (const d of stuff.doors) if (Math.abs(d.x - x) < 4 && Math.abs(d.z - z) < 4) out.push(d);
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
      if (i !== ni && Math.abs(mx - d.routeSeg.a.x) < 1e-3 && d.routeSeg.a.x === d.routeSeg.b.x
        && centreOf(j) > d.routeSeg.a.z && centreOf(j) < d.routeSeg.b.z) return true;
      if (j !== nj && Math.abs(mz - d.routeSeg.a.z) < 1e-3 && d.routeSeg.a.z === d.routeSeg.b.z
        && centreOf(i) > d.routeSeg.a.x && centreOf(i) < d.routeSeg.b.x) return true;
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
    const memoryStage = this.stage.stage === 1;   // grandmother's room only exists here
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
        if (d.lift < 1) {                             // swing open on the hinges, slowing at the end
          d.lift = Math.min(1, d.lift + dt / 1.8);
          d.pivot.rotation.y = -1.75 * (1 - (1 - d.lift) ** 3);
        }
        continue;
      }
      const near = Math.hypot(d.x - P.pos.x, d.z - P.pos.y) < 2.8;
      d.waitT = near && speed < 0.08 && !P.locked ? d.waitT + dt : Math.max(0, d.waitT - dt * 2);
      const glow = 0.8 + 0.2 * Math.min(1, d.waitT / DOOR_WAIT);
      d.leaf.material.color.setScalar(glow);
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
      if (k && memoryStage && P.pos.x > k.minX && P.pos.x < k.maxX && P.pos.y > k.minZ && P.pos.y < k.maxZ) inKitchen = true;
    }
    if (inKitchen !== this._inKitchen) {
      this._inKitchen = inKitchen;
      this.audio?.hush(inKitchen);
      if (inKitchen && !this._roomHinted) {
        this._roomHinted = true; this.visitedRoom = true;
        this._say(t('roomLabel'), t('roomHint'));
        this._rebuildScatter();                       // candles now point to the way out into the light
      }
    }

    // secret: a minute of stillness in acceptance hangs a nineteenth frame
    if (!this.nineteenth && zone.accept > 0.7 && speed < 0.05 && !P.locked) this._stillT += dt;
    else this._stillT = 0;
    if (this._stillT > STILL_FOR_19) this._hangNineteenth(time);
    if (this.nineteenth) {
      this.nineteenth.canvas.material.opacity = 0.55 + 0.25 * Math.sin(time * 0.8);
    }

    // portals: cross-check, animate the veils, dim the ones already used
    const cur = { x: P.pos.x, z: P.pos.y };
    this._checkPortals(this._prevPos, cur);
    this._prevPos = cur;
    for (const st of this.chunkStuff.values()) for (const p of st.portals) {
      // only the portal into the very next stage exists; the way into the
      // light opens only after grandmother's room has been found
      const live = p.target === this.stage.stage + 1 && (p.target !== 2 || this.visitedRoom);
      p.group.visible = live;
      p.veil.material.uniforms.uTime.value = time;
    }
    if (this.stage.stage !== this._lastStage) { // the world changed: rewrite the walls in its hand
      this._lastStage = this.stage.stage;
      const target = { fear: +(this.stage.stage === 0), memory: +(this.stage.stage === 1), accept: +(this.stage.stage === 2) };
      for (const st of this.chunkStuff.values()) for (const w of st.writings) { w.zone = target; this._writeOn(w); }
      for (const st of this.chunkStuff.values()) for (const p of st.posters || []) this._printPoster(p);
      this._rebuildScatter();
    }

    // grandmother's room: light the nearest one, let candles and picture breathe
    let room = null, rd = 14;
    for (const st of this.chunkStuff.values()) {
      const k = st.kitchen;
      if (!k) continue;
      k.group.visible = memoryStage;
      if (!memoryStage) continue;
      const d = Math.hypot(k.x - P.pos.x, k.z - P.pos.y);
      if (d < rd) { rd = d; room = k.room; }
    }
    this.kitchenRig.update(room, time);
    // the souls in the room drift, and scatter when walked into
    for (const st of this.chunkStuff.values()) {
      const k = st.kitchen;
      if (!k || !memoryStage || !k.wisps) continue;
      for (const w of k.wisps) {
        if (w.gone) {
          for (const tsp of w.tail) tsp.visible = false;
          w.sprite.material.opacity = Math.max(0, w.sprite.material.opacity - dt);
          w.sprite.scale.multiplyScalar(1 + dt * 1.5);
          if (time > w.back) { w.gone = false; this._placeWisp(w, k); w.sprite.scale.set(0.35, 0.35, 1); }
          continue;
        }
        w.sprite.material.opacity = Math.min(1, w.sprite.material.opacity + dt * 0.5);
        // a still visitor draws the nearest soul in, slowly; moving lets it drift home
        const dxp = P.pos.x - w.home.x, dzp = P.pos.y - w.home.z, dp = Math.hypot(dxp, dzp);
        const drawn = speed < 0.1 && dp < 5 ? Math.min(1, w.pull.x + dt * 0.12) : Math.max(0, w.pull.x - dt * 0.2);
        w.pull.x = drawn;
        const b = Math.sin(time * 0.9 + w.seed);
        w.sprite.position.set(
          w.home.x + dxp * drawn * 0.85 + Math.sin(time * 0.4 + w.seed) * 0.25,
          w.home.y + b * 0.12,
          w.home.z + dzp * drawn * 0.85 + Math.cos(time * 0.35 + w.seed) * 0.25);
        let lead = w.sprite.position;
        for (const tsp of w.tail) { tsp.position.lerp(lead, Math.min(1, dt * 4)); tsp.visible = true; lead = tsp.position; }
        const s2 = 0.32 + 0.05 * Math.sin(time * 3 + w.seed);
        w.sprite.scale.set(s2, s2, 1);
        if (Math.hypot(w.sprite.position.x - P.pos.x, w.sprite.position.z - P.pos.y) < 1.1) {
          w.gone = true; w.back = time + 20;
          this._askSoul(w.cat, k.room);
        }
      }
    }
    if (room) {
      for (const { flame, halo } of room.flames.concat(room.trail || [])) {
        const f = 1.7 + Math.sin(time * 13 + flame.id) * 0.25 + Math.random() * 0.2;
        flame.scale.set(1, f, 1);
        halo.material.opacity = 0.7 + Math.random() * 0.3;
      }
      for (const sc of room.screens) sc.material.color.setScalar(0.8 + 0.2 * Math.random());
    }

    // candles: flames breathe; the 8 nearest light the walls
    tickCandles(time);
    this._candleT = (this._candleT || 0) - dt;
    if (this._candleT <= 0) {
      this._candleT = 0.25;
      const all = [];
      for (const st2 of this.chunkStuff.values()) for (const c of st2.scatter?.lights || []) {
        const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.y);
        if (d < 14) all.push([d, c]);
      }
      all.sort((a, b) => a[0] - b[0]);
      this._nearCandles = all.slice(0, 8).map(e => e[1]);
    }
    window.__app?.atmo?.setCandles(this._nearCandles || [], time);

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
    // at a work (within 3.5 m, in sight, or inspecting it): its own sound world
    let at = this.artworks.inspecting;
    if (!at) {
      let bd = 3.5;
      for (const a of this.artworks.active) {
        const d = Math.hypot(a.centerWorld.x - P.pos.x, a.centerWorld.z - P.pos.y);
        if (d < bd && this._lineOfSight(P.pos.x, P.pos.y, a.centerWorld.x + a.normal.x * 0.3, a.centerWorld.z + a.normal.z * 0.3)) { bd = d; at = a; }
      }
    }
    this.audio.nearWork?.(at ? parseInt(at.art.id, 10) - 1 : null);
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
