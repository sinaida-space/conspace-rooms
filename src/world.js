import * as THREE from 'three';

// ── conspace-rooms · world.js ──────────────────────────────────────────────
// Deterministic, infinite room-and-corridor labyrinth.
//
// Everything a chunk contains is a pure function of hash(seed, cx, cz), so
// revisiting a chunk regenerates it byte-for-byte. Generation + collision math
// live here and use no WebGL — only the geometry builders touch THREE, and
// BufferGeometry is plain arrays, so this module is importable/testable in node.
//
// Grid: cell = 1.2m. Chunk = 16×16 cells (19.2m). Corridors are 2 cells wide
// (2.4m); rooms are 4–9 cells; ceiling 3.2m. Connectivity is guaranteed by a
// fixed lattice of corridors that always opens edge cells {4,5,10,11} — so cells
// 4 and 11 on every shared edge are open and adjacent chunks always stitch.

export const CONSPACE_SEED = 20260709;   // global seed constant
export const CELL = 1.2;                 // metres per grid cell
export const CHUNK = 16;                 // cells per chunk edge
export const CHUNK_M = CELL * CHUNK;     // 19.2m
export const CEIL_H = 3.2;               // ceiling height

// Corridor lattice offsets. Two 2-wide bands per axis. {4,5} and {10,11} keep
// the required crossing cells 4 and 11 open on every edge.
const BAND = new Set([4, 5, 10, 11]);

// ── deterministic hashing ───────────────────────────────────────────────────
function hash2i(seed, x, y) {
  let h = seed | 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h ^ (y | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// mulberry32 — small deterministic PRNG seeded from a chunk hash
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── room layout (cached per chunk) ──────────────────────────────────────────
const _roomCache = new Map();

function clampi(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Rooms for a chunk. Each room is a rectangle in local cell coords, always
// straddling a lattice band (so it connects to the corridor network) and always
// inside [0,15]. Pure function of the chunk hash.
export function chunkRooms(cx, cz) {
  const key = cx + ':' + cz;
  let rooms = _roomCache.get(key);
  if (rooms) return rooms;

  const rand = mulberry32(hash2i(CONSPACE_SEED, cx, cz));
  const n = 1 + Math.floor(rand() * 3); // 1..3 rooms
  rooms = [];
  for (let k = 0; k < n; k++) {
    const w = 4 + Math.floor(rand() * 6);  // 4..9 cells (~4.8–10.8m)
    const h = 4 + Math.floor(rand() * 6);
    const bc = rand() < 0.5 ? 4 : 10;      // vertical band to straddle
    const br = rand() < 0.5 ? 4 : 10;      // horizontal band to straddle
    // origin range that keeps the band column/row inside the room and the room
    // inside the chunk
    const xLo = Math.max(bc - w + 1, 0), xHi = Math.min(bc, CHUNK - w);
    const yLo = Math.max(br - h + 1, 0), yHi = Math.min(br, CHUNK - h);
    const x0 = clampi(xLo + Math.floor(rand() * (xHi - xLo + 1)), 0, CHUNK - w);
    const y0 = clampi(yLo + Math.floor(rand() * (yHi - yLo + 1)), 0, CHUNK - h);
    rooms.push({ x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 });
  }
  _roomCache.set(key, rooms);
  return rooms;
}

// ── cell solidity ───────────────────────────────────────────────────────────
// true = solid wall, false = open (walkable). Local cell (i,j) within chunk.
export function cellSolidLocal(cx, cz, i, j) {
  if (BAND.has(i) || BAND.has(j)) return false; // corridor lattice
  const rooms = chunkRooms(cx, cz);
  for (let r = 0; r < rooms.length; r++) {
    const rm = rooms[r];
    if (i >= rm.x0 && i <= rm.x1 && j >= rm.y0 && j <= rm.y1) return false;
  }
  return true;
}

// Solidity by global cell index — normalises across chunk boundaries so wall
// faces and collision stitch seamlessly between chunks.
export function solidAtGlobal(gi, gj) {
  const cx = Math.floor(gi / CHUNK), cz = Math.floor(gj / CHUNK);
  return cellSolidLocal(cx, cz, gi - cx * CHUNK, gj - cz * CHUNK);
}

function worldToCell(x, z) {
  return { gi: Math.floor(x / CELL), gj: Math.floor(z / CELL) };
}

// ── geometry helpers (plain arrays; node-safe) ──────────────────────────────
function pushQuad(pos, nrm, a, b, c, d, nx, ny, nz) {
  // two triangles a-b-c, a-c-d
  pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
           a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  for (let i = 0; i < 6; i++) nrm.push(nx, ny, nz);
}

function buildGeometry(pos, nrm) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  g.computeBoundingSphere();
  return g;
}

// ── World ───────────────────────────────────────────────────────────────────
export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.buildRadius = opts.buildRadius ?? 2;
    this.disposeRadius = opts.disposeRadius ?? (this.buildRadius + 1);
    this.chunks = new Map(); // key "cx:cz" -> THREE.Group
    this._cx = null; this._cz = null;

    // Shared placeholder materials (distinct colours, flat lambert). Shared
    // across chunks so per-chunk disposal only frees geometry — materials and
    // geometry count both stay bounded as chunks churn. Aesthetic pass is #3.
    this.mat = {
      wall: new THREE.MeshLambertMaterial({ color: 0x8b93a3, side: THREE.DoubleSide }),
      floor: new THREE.MeshLambertMaterial({ color: 0x53585f, side: THREE.DoubleSide }),
      ceil: new THREE.MeshLambertMaterial({ color: 0x393c42, side: THREE.DoubleSide }),
    };
  }

  // Stream chunks around a world position. Build within buildRadius, dispose
  // beyond disposeRadius. Keeps geometry count flat over time.
  update(x, z) {
    const pcx = Math.floor(x / CHUNK_M), pcz = Math.floor(z / CHUNK_M);
    if (pcx === this._cx && pcz === this._cz && this.chunks.size) return;
    this._cx = pcx; this._cz = pcz;

    for (let dz = -this.buildRadius; dz <= this.buildRadius; dz++) {
      for (let dx = -this.buildRadius; dx <= this.buildRadius; dx++) {
        const cx = pcx + dx, cz = pcz + dz, key = cx + ':' + cz;
        if (!this.chunks.has(key)) this.chunks.set(key, this._buildChunk(cx, cz));
      }
    }
    for (const [key, group] of this.chunks) {
      const [cx, cz] = key.split(':').map(Number);
      if (Math.abs(cx - pcx) > this.disposeRadius || Math.abs(cz - pcz) > this.disposeRadius) {
        this._disposeChunk(key, group);
      }
    }
  }

  _buildChunk(cx, cz) {
    const wp = [], wn = [], fp = [], fn = [], cp = [], cn = [];
    const gi0 = cx * CHUNK, gj0 = cz * CHUNK;
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        if (cellSolidLocal(cx, cz, i, j)) continue; // only open cells get faces
        const gi = gi0 + i, gj = gj0 + j;
        const x0 = gi * CELL, x1 = x0 + CELL;
        const z0 = gj * CELL, z1 = z0 + CELL;
        // floor (y=0) + ceiling (y=CEIL_H)
        pushQuad(fp, fn, [x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], 0, 1, 0);
        pushQuad(cp, cn, [x0, CEIL_H, z1], [x1, CEIL_H, z1], [x1, CEIL_H, z0], [x0, CEIL_H, z0], 0, -1, 0);
        // walls where a neighbour is solid (queried globally → seamless)
        if (solidAtGlobal(gi + 1, gj)) // +X face
          pushQuad(wp, wn, [x1, 0, z0], [x1, 0, z1], [x1, CEIL_H, z1], [x1, CEIL_H, z0], -1, 0, 0);
        if (solidAtGlobal(gi - 1, gj)) // -X face
          pushQuad(wp, wn, [x0, 0, z1], [x0, 0, z0], [x0, CEIL_H, z0], [x0, CEIL_H, z1], 1, 0, 0);
        if (solidAtGlobal(gi, gj + 1)) // +Z face
          pushQuad(wp, wn, [x1, 0, z1], [x0, 0, z1], [x0, CEIL_H, z1], [x1, CEIL_H, z1], 0, 0, -1);
        if (solidAtGlobal(gi, gj - 1)) // -Z face
          pushQuad(wp, wn, [x0, 0, z0], [x1, 0, z0], [x1, CEIL_H, z0], [x0, CEIL_H, z0], 0, 0, 1);
      }
    }
    const group = new THREE.Group();
    group.name = 'chunk_' + cx + '_' + cz;
    if (fp.length) group.add(new THREE.Mesh(buildGeometry(fp, fn), this.mat.floor));
    if (cp.length) group.add(new THREE.Mesh(buildGeometry(cp, cn), this.mat.ceil));
    if (wp.length) group.add(new THREE.Mesh(buildGeometry(wp, wn), this.mat.wall));
    this.scene.add(group);
    return group;
  }

  _disposeChunk(key, group) {
    this.scene.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); // materials shared → keep
    this.chunks.delete(key);
  }

  // ── queries ────────────────────────────────────────────────────────────────
  isWalkable(x, z) {
    const { gi, gj } = worldToCell(x, z);
    return !solidAtGlobal(gi, gj);
  }

  // Axis-aligned wall segments (in world XZ) near a point, for collision. Each:
  // { a:{x,z}, b:{x,z}, nx, nz } with (nx,nz) pointing into the open cell.
  wallSegmentsNear(x, z) {
    const { gi, gj } = worldToCell(x, z);
    const segs = [];
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ci = gi + di, cj = gj + dj;
        if (solidAtGlobal(ci, cj)) continue; // walls belong to open cells
        const x0 = ci * CELL, x1 = x0 + CELL, z0 = cj * CELL, z1 = z0 + CELL;
        if (solidAtGlobal(ci + 1, cj)) segs.push({ a: { x: x1, z: z0 }, b: { x: x1, z: z1 }, nx: -1, nz: 0 });
        if (solidAtGlobal(ci - 1, cj)) segs.push({ a: { x: x0, z: z0 }, b: { x: x0, z: z1 }, nx: 1, nz: 0 });
        if (solidAtGlobal(ci, cj + 1)) segs.push({ a: { x: x0, z: z1 }, b: { x: x1, z: z1 }, nx: 0, nz: -1 });
        if (solidAtGlobal(ci, cj - 1)) segs.push({ a: { x: x0, z: z0 }, b: { x: x1, z: z0 }, nx: 0, nz: 1 });
      }
    }
    return segs;
  }

  // Straight wall runs ≥2 cells for artwork placement (#4). Deterministic.
  // Returns [{ position:{x,y,z}, normal:{x,y,z}, cellKey, length }]. position is
  // the run's mid-point on the wall face at mid-height; normal faces the open
  // space (where a viewer stands).
  getWallSlots(cx, cz) {
    const slots = [];
    const gi0 = cx * CHUNK, gj0 = cz * CHUNK;
    const y = CEIL_H / 2;
    // Vertical faces (+X / -X): scan each column, walk down j.
    for (const [dir, nx] of [['+X', -1], ['-X', 1]]) {
      for (let i = 0; i < CHUNK; i++) {
        let run = 0;
        for (let j = 0; j <= CHUNK; j++) {
          const gi = gi0 + i, gj = gj0 + j;
          const open = j < CHUNK && !solidAtGlobal(gi, gj);
          const faced = open && solidAtGlobal(gi + (nx < 0 ? 1 : -1), gj);
          if (faced) { run++; continue; }
          if (run >= 2) {
            const js = j - run;
            const wx = (nx < 0 ? (gi0 + i + 1) : (gi0 + i)) * CELL;
            const cz0 = (gj0 + js) * CELL, cz1 = (gj0 + j) * CELL;
            slots.push({
              position: { x: wx, y, z: (cz0 + cz1) / 2 },
              normal: { x: nx, y: 0, z: 0 },
              cellKey: cx + ':' + cz + ':' + dir + ':' + i + '_' + js + ':' + run,
              length: run,
            });
          }
          run = 0;
        }
      }
    }
    // Horizontal faces (+Z / -Z): scan each row, walk across i.
    for (const [dir, nz] of [['+Z', -1], ['-Z', 1]]) {
      for (let j = 0; j < CHUNK; j++) {
        let run = 0;
        for (let i = 0; i <= CHUNK; i++) {
          const gi = gi0 + i, gj = gj0 + j;
          const open = i < CHUNK && !solidAtGlobal(gi, gj);
          const faced = open && solidAtGlobal(gi, gj + (nz < 0 ? 1 : -1));
          if (faced) { run++; continue; }
          if (run >= 2) {
            const is = i - run;
            const wz = (nz < 0 ? (gj0 + j + 1) : (gj0 + j)) * CELL;
            const cx0 = (gi0 + is) * CELL, cx1 = (gi0 + i) * CELL;
            slots.push({
              position: { x: (cx0 + cx1) / 2, y, z: wz },
              normal: { x: 0, y: 0, z: nz },
              cellKey: cx + ':' + cz + ':' + dir + ':' + is + '_' + j + ':' + run,
              length: run,
            });
          }
          run = 0;
        }
      }
    }
    return slots;
  }
}
