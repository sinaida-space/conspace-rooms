import * as THREE from 'three';
import { CELL, CHUNK, CEIL_H, CONSPACE_SEED, solidAtGlobal, chunkRooms, hash2i, mulberry32 } from './world.js';
import { zoneWeights, ORIGIN, ZONE } from './zones.js';
import { t } from './i18n.js';
import { EYE_HEIGHT } from './player.js';
import { buildKitchen, buildCandleTrail, createKitchenRig, buildScatter } from './kitchen.js';
import { baroqueFrame } from './frames.js';

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
        if (o.userData.keep) return;                  // shared scatter geometry and materials
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

    // ── scattered things: candles, teapots, cups. The closer the portal into
    // the next stage, the more of them, so they thicken into a trail.
    stuff.scatter = this._buildScatter(group, cx, cz);

    // ── presence doors on this chunk's west and north edge crossings.
    // Never in the spawn chunk, so nobody starts boxed in.
    if (!(cx === 0 && cz === 0)) {
      const rd = mulberry32(hash2i(SEED_DOOR, cx, cz));
      for (const edge of ['west', 'north']) {
        const band = rd() < 0.5 ? 4 : 10;
        if (rd() > 0.16 || usedEdges.has(edge)) continue; // about one crossing in six
        const key = `${cx}:${cz}:${edge}`;
        if (this.doorsOpen.has(key)) continue;
        stuff.doors.push(this._makeDoor(group, cx, cz, edge, band, key));
      }
    }

    // ── grandmother's kitchen: rare, only deep in the memory zone
    const rooms = chunkRooms(cx, cz);
    const room = rooms.find(r => r.x1 - r.x0 >= 4 && r.y1 - r.y0 >= 4);
    if (room && hash2i(SEED_KITCHEN, cx, cz) % 7 === 0) {
      const x = (cx * CHUNK + (room.x0 + room.x1 + 1) / 2) * CELL;
      const z = (cz * CHUNK + (room.y0 + room.y1 + 1) / 2) * CELL;
      if (zoneWeights(x, z).memory > 0.8) {
        stuff.kitchen = {
          x, z,
          minX: (cx * CHUNK + room.x0) * CELL, maxX: (cx * CHUNK + room.x1 + 1) * CELL,
          minZ: (cz * CHUNK + room.y0) * CELL, maxZ: (cz * CHUNK + room.y1 + 1) * CELL,
        };
        const kg = new THREE.Group();                 // only exists in the memory stage
        group.add(kg);
        stuff.kitchen.group = kg;
        stuff.kitchen.room = buildKitchen(kg, x, z);
        stuff.kitchen.room.trail = buildCandleTrail(kg, this._candleTrails(stuff.kitchen));
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
    const zone = this.stage.weights();
    const tex = doorTexture(t('doorWait'), zone);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(span, CEIL_H, 0.08),
      new THREE.MeshBasicMaterial({ map: tex, color: 0x9a9a9a }));
    mesh.position.set(x, CEIL_H / 2, z);
    mesh.rotation.y = rotY;
    group.add(mesh);
    return { key, mesh, seg, x, z, waitT: 0, lift: 0, open: false };
  }

  // Three candle trails leading out of a room, as far apart as possible: a
  // breadth-first walk from the room over open cells, the three farthest
  // well-separated ends, and a candle every few cells on the way back in,
  // set beside the wall so the corridor stays clear.
  _candleTrails(k) {
    const gi0 = cellOf(k.x), gj0 = cellOf(k.z);
    const key = (i, j) => i + ',' + j;
    const prev = new Map([[key(gi0, gj0), null]]), depth = new Map([[key(gi0, gj0), 0]]);
    const q = [[gi0, gj0]];
    for (let h = 0; h < q.length && h < 4000; h++) {
      const [i, j] = q[h], d = depth.get(key(i, j));
      if (d >= 30) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, kk = key(ni, nj);
        if (prev.has(kk) || solidAtGlobal(ni, nj)) continue;
        prev.set(kk, [i, j]); depth.set(kk, d + 1); q.push([ni, nj]);
      }
    }
    const far = q.filter(([i, j]) => depth.get(key(i, j)) >= 18);
    const ends = [];
    for (let n = 0; n < 3 && far.length; n++) {
      let best = null, bestScore = -1;
      for (const c of far) {
        const sep = ends.length ? Math.min(...ends.map(e => Math.hypot(e[0] - c[0], e[1] - c[1]))) : 0;
        const score = depth.get(key(c[0], c[1])) + sep * 2;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (!best || (ends.length && bestScore < 30)) break;
      ends.push(best);
    }
    const inRoom = (x, z) => x > k.minX && x < k.maxX && z > k.minZ && z < k.maxZ;
    const points = [], used = new Set();
    for (const end of ends) {
      const path = [];
      for (let c = end; c; c = prev.get(key(c[0], c[1]))) path.push(c);
      for (let n = 3; n < path.length; n += 4) {
        const [i, j] = path[n];
        if (used.has(key(i, j))) continue;
        used.add(key(i, j));
        let x = centreOf(i), z = centreOf(j);
        if (inRoom(x, z)) continue;
        // nudge toward a neighbouring wall
        const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([di, dj]) => solidAtGlobal(i + di, j + dj));
        if (side) { x += side[0] * 0.38; z += side[1] * 0.38; }
        points.push({ x, z });
      }
    }
    return points;
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
    return { x, z, west, span: openW, target, veil };
  }

  // Walking through a portal: the side of its plane the visitor is on flips
  // while they are inside its span.
  _checkPortals(prev, cur) {
    for (const st of this.chunkStuff.values()) for (const p of st.portals) {
      if (Math.abs(p.x - cur.x) > 3 || Math.abs(p.z - cur.z) > 3) continue;
      const a0 = p.west ? prev.x - p.x : prev.z - p.z, a1 = p.west ? cur.x - p.x : cur.z - p.z;
      const along = p.west ? cur.z - p.z : cur.x - p.x;
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

  _buildScatter(group, cx, cz) {
    const rnd = mulberry32(hash2i(SEED_SCATTER ^ (this.stage.stage * 7919), cx, cz));
    const items = [], portals = this._nextPortals(cx, cz);
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const gi = cx * CHUNK + i, gj = cz * CHUNK + j;
      if (solidAtGlobal(gi, gj)) continue;
      const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([di, dj]) => solidAtGlobal(gi + di, gj + dj));
      const r = rnd();
      if (!side) continue;                              // only along walls, so paths stay clear
      const x = centreOf(gi) + side[0] * 0.36 + (rnd() - 0.5) * 0.3;
      const z = centreOf(gj) + side[1] * 0.36 + (rnd() - 0.5) * 0.3;
      let d = Infinity;
      for (const pp of portals) d = Math.min(d, Math.hypot(pp.x - x, pp.z - z));
      // a few far away, thick within ~10 m of the portal
      const p = d === Infinity ? 0.012 : Math.max(0.012, Math.min(0.55, 0.55 * (1 - d / 40) ** 2));
      if (r > p) continue;
      const k = rnd();
      items.push({ type: k < 0.55 ? 'candle' : k < 0.8 ? 'teapot' : 'cup', x, z, rot: rnd() * 6.28 });
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
      if (k && memoryStage && P.pos.x > k.minX && P.pos.x < k.maxX && P.pos.y > k.minZ && P.pos.y < k.maxZ) inKitchen = true;
    }
    if (inKitchen !== this._inKitchen) { this._inKitchen = inKitchen; this.audio?.hush(inKitchen); }

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
      p.veil.material.uniforms.uTime.value = time;
      p.veil.material.uniforms.uFade.value = p.target > this.stage.stage ? 1 : 0.2;
    }
    if (this.stage.stage !== this._lastStage) { // the world changed: rewrite the walls in its hand
      this._lastStage = this.stage.stage;
      const target = { fear: +(this.stage.stage === 0), memory: +(this.stage.stage === 1), accept: +(this.stage.stage === 2) };
      for (const st of this.chunkStuff.values()) for (const w of st.writings) { w.zone = target; this._writeOn(w); }
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
    if (room) {
      for (const { flame, halo } of room.flames.concat(room.trail || [])) {
        const f = 1.7 + Math.sin(time * 13 + flame.id) * 0.25 + Math.random() * 0.2;
        flame.scale.set(1, f, 1);
        halo.material.opacity = 0.7 + Math.random() * 0.3;
      }
      for (const sc of room.screens) sc.material.color.setScalar(0.8 + 0.2 * Math.random());
    }

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
