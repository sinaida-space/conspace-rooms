import * as THREE from 'three';
import { CONSPACE_SEED, solidAtGlobal, CELL, CHUNK, CHUNK_M, chunkRooms, wallSlots } from './world.js';
import { t, getLang } from './i18n.js';

// ── conspace-rooms · artworks.js ────────────────────────────────────────────
// The 18 SOULS pieces by UVALISS, hung framed on labyrinth walls with English
// placards. Placement is a pure function of chunk coordinates (same hash
// family as world.js) layered onto World's getWallSlots(cx,cz); textures
// stream in/out with the chunk lifecycle World already drives.
//
// Integration: instantiate once startWorld() has a World+Player, then each
// frame call sync() (after world.update) and update(dt) (after player.update).

const JSON_URL = 'assets/artworks.json';
const INSPECT_DIST = 1.8;      // metres — proximity to show the prompt
const INSPECT_FACING = 0.4;    // dot-product threshold (~66°) for "facing"
const EYE_Y = 1.55;            // frame centre height
const PLACARD_Y = 1.35;        // placard centre height
const DOLLY_DIST = 1.3;        // metres in front of the artwork during inspect, at least
const DOLLY_MAX = 2.0;         // and at most: corridors are 2.4 m wide
const DOLLY_TIME = 0.6;        // seconds
const AUTO_DIST = 2.6;         // metres: on hands, passing this close to a work shows it by itself
const AUTO_SHOW = 3;           // seconds each work stays; an open palm holds it longer

// ── deterministic hashing (mirrors world.js's private hash family) ─────────
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
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DECK_SEED = CONSPACE_SEED ^ 0x5eed5;

function shuffledDeck(n, seed) {
  const arr = Array.from({ length: n }, (_, i) => i);
  const rand = mulberry32(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Monotonic-ish ordinal walking outward from the origin chunk in Chebyshev
// rings, so exploring outward from spawn cycles the shuffled deck before any
// artwork repeats.
function ringOrdinal(cx, cz) {
  const r = Math.max(Math.abs(cx), Math.abs(cz));
  if (r === 0) return 0;
  const ringStart = (2 * r - 1) * (2 * r - 1);
  let pos;
  if (cz === -r && cx < r) pos = cx + r;
  else if (cx === r && cz < r) pos = 2 * r + (cz + r);
  else if (cz === r && cx > -r) pos = 4 * r + (r - cx);
  else pos = 6 * r + (r - cz);
  return ringStart + pos;
}

// A wall run with room to stand back: at least two open cells in front of it
// along its whole usable length, so the dolly of inspect always fits. With
// the opposite wall right behind those two cells it is a corridor, and
// corridors are hung first, so the rose tunnel that follows the last work is
// still usually met in one.
function frontClear(slot) {
  const { position: p, normal: n, length } = slot;
  let corridor = true;
  for (const k of [0.5, length / 2, length - 0.5]) {          // both ends and the middle of the run
    const u = -length * CELL / 2 + k * CELL;                   // along the wall
    const x = n.x !== 0 ? p.x + n.x * CELL * 0.5 : p.x + u;    // the cell in front of it
    const z = n.x !== 0 ? p.z + u : p.z + n.z * CELL * 0.5;
    const gi = Math.floor(x / CELL), gj = Math.floor(z / CELL);
    if (solidAtGlobal(gi, gj) || solidAtGlobal(gi + n.x, gj + n.z)) return 0;       // two open cells
    if (!solidAtGlobal(gi + 2 * n.x, gj + 2 * n.z)) corridor = false;               // then the other wall?
  }
  return corridor ? 2 : 1;
}

// The part of a wall run a work may use: two cells clear of the chunk's
// edges, where doors and portals stand, and long enough for the frame, the
// placard and air on both sides. Returns a narrowed copy of the slot, or null.
const PLACARD_W = 0.46, PLACARD_GAP = 0.10, FRAME_BORDER = 0.06, MARGIN = 0.45;
const SPAN_NEEDED = 1.35 + FRAME_BORDER * 2 + PLACARD_GAP + PLACARD_W + MARGIN * 2;   // the widest work
function usableSpan(slot, cx, cz) {
  const { position: p, normal: n, length } = slot;
  const alongZ = n.x !== 0, c = alongZ ? p.z : p.x, base = (alongZ ? cz : cx) * CHUNK * CELL;
  const start = Math.max(c - length * CELL / 2, base + 2 * CELL);
  const end = Math.min(c + length * CELL / 2, base + (CHUNK - 2) * CELL);
  if (end - start < SPAN_NEEDED) return null;
  const mid = (start + end) / 2;
  return { ...slot, position: { x: alongZ ? p.x : mid, y: p.y, z: alongZ ? mid : p.z }, length: (end - start) / CELL };
}

// How the works keep apart (#40, #43). A step is one tap of W, about 0.75 m;
// a work comes about every 25–30 of them, so each chunk (19.2 m) hangs one,
// on the run nearest a point jittered round its middle, and the rhythm holds
// across chunks. Two works never closer than APART centre to centre; in a
// corridor all the works of a stretch hang on one wall, never across from
// each other; a big hall (6 x 6 cells and more) holds one. The rule is
// settled among the candidate runs of a chunk and its eight neighbours: a
// run keeps its work when it outranks every run it clashes with, so both
// sides of a chunk border agree without either looking further.
const STEP = 0.75;
const APART = 18 * STEP;                                            // centre to centre: the floor under the rhythm
const ONE_SIDE = 12;                                                // m along a corridor: the stretch whose works share a wall
const BIG_HALL = 6;

// the big hall the cell in front of a run opens into, if any
function hallOf(slot) {
  const { position: p, normal: n } = slot;
  const gi = Math.floor((p.x + n.x * CELL * 0.5) / CELL), gj = Math.floor((p.z + n.z * CELL * 0.5) / CELL);
  const cx = Math.floor(gi / CHUNK), cz = Math.floor(gj / CHUNK), i = gi - cx * CHUNK, j = gj - cz * CHUNK;
  const k = chunkRooms(cx, cz).findIndex(r => r.x1 - r.x0 + 1 >= BIG_HALL && r.y1 - r.y0 + 1 >= BIG_HALL && i >= r.x0 && i <= r.x1 && j >= r.y0 && j <= r.y1);
  return k < 0 ? null : cx + ':' + cz + ':' + k;
}

// a chunk's runs that could take a work, with their rank; cached
const candCache = new Map();
function candidatesOf(cx, cz) {
  const key = cx + ':' + cz;
  let c = candCache.get(key);
  if (c) return c;
  const rand = mulberry32(hash2i(DECK_SEED, cx, cz));
  const target = 1;                                           // one a chunk: about one every 25–30 steps
  const mx = (cx + 0.3 + rand() * 0.4) * CHUNK_M, mz = (cz + 0.3 + rand() * 0.4) * CHUNK_M;   // the chunk's middle, jittered
  const list = [];
  for (const s of wallSlots(cx, cz)) {
    const span = usableSpan(s, cx, cz);
    const clear = span ? frontClear(span) : 0;
    if (!clear) continue;
    const x = span.position.x, z = span.position.z;
    // nearest the middle wins; a corridor counts as 2 m nearer
    list.push({ slot: span, clear, r: rand(), rank: -Math.hypot(x - mx, z - mz) + clear * 2 + rand() * 0.1, x, z, n: span.normal, hall: hallOf(span), key: span.cellKey });
  }
  c = { target, list };
  candCache.set(key, c);
  if (candCache.size > 400) candCache.delete(candCache.keys().next().value);
  return c;
}

function clash(a, b) {
  if (a.hall && a.hall === b.hall) return true;
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.hypot(dx, dz) < APART) return true;
  // across the corridor: facing walls, the other in front of this one, a corridor's width apart
  if (a.n.x * b.n.x + a.n.z * b.n.z < -0.5) {
    const ahead = dx * a.n.x + dz * a.n.z, along = Math.abs(dx * a.n.z - dz * a.n.x);
    if (ahead > 0 && ahead <= 3 * CELL && along < ONE_SIDE) return true;
  }
  return false;
}
const outranks = (a, b) => a.rank > b.rank || (a.rank === b.rank && a.key > b.key);

// Which wall slots (if any) get an artwork in this chunk, and which deck
// index each one draws. Pure function of (cx, cz) and the walls round it.
function chunkArtworkPlan(cx, cz, slots, deck) {
  const { target, list } = candidatesOf(cx, cz);
  const around = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) around.push(...candidatesOf(cx + dx, cz + dz).list);
  const kept = list.filter(c => around.every(o => o === c || !clash(c, o) || outranks(c, o)));
  kept.sort((a, b) => b.rank - a.rank);
  const chosen = kept.slice(0, target);
  const ord = ringOrdinal(cx, cz);
  return chosen.map(({ slot }, i) => ({ slot, artIndex: deck[(ord + i) % deck.length] }));
}

// The wall runs that carry a work in this chunk, so other things keep off them.
export function artworkSlots(cx, cz, slots) {
  return chunkArtworkPlan(cx, cz, slots, [0]).map(p => p.slot);
}

// ── texture loading (lazy, per file) ───────────────────────────────────────
// Every work lies beside its JPEG as two WebP files: NN.webp at full size and
// NN-800.webp for tier 0, so a phone downloads the small one instead of
// halving the large one after the fact. The JPEG stays as the way back if a
// WebP does not load; on tier 0 it is halved on a canvas as before.
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img));   // decoded off the main thread, before the GPU asks for it
    img.onerror = reject;
    img.src = url;
  });
}
// The WebP as a bitmap decoded off the main thread and already turned the way
// the GPU wants it: handing it over then costs the walk no long frame.
function loadBitmap(url) {
  if (typeof createImageBitmap !== 'function') return Promise.reject(new Error('no createImageBitmap'));
  return fetch(url)
    .then(res => { if (!res.ok) throw new Error(`${res.status} ${url}`); return res.blob(); })
    .then(blob => createImageBitmap(blob, { imageOrientation: 'flipY' }));
}
function loadTexture(url, halfRes) {
  const finish = tex => { tex.anisotropy = 4; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true; return tex; };
  const webp = url.replace(/\.jpe?g$/i, halfRes ? '-800.webp' : '.webp');
  return loadBitmap(webp)
    .then(bmp => { const tex = new THREE.Texture(bmp); tex.flipY = false; return finish(tex); })   // flipped already, as it was decoded
    .catch(() => loadImage(webp).then(img => finish(new THREE.Texture(img))))
    .catch(() => loadImage(url).then(img => {
      if (!halfRes) return finish(new THREE.Texture(img));
      const c = document.createElement('canvas');
      c.width = Math.max(1, img.width >> 1);
      c.height = Math.max(1, img.height >> 1);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return finish(new THREE.CanvasTexture(c));
    }));
}

// what a canvas shows until its picture has arrived: the dark of an unlit room
let _blank = null;
const blankTexture = () => _blank ||= Object.assign(new THREE.DataTexture(new Uint8Array([12, 14, 13, 255]), 1, 1), { needsUpdate: true });
// a work is fetched once the visitor is this near, a little past where the fog lets it be seen
const FETCH_NEAR = 36;

function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '', lines = [];
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}

function buildPlacardTexture(art) {
  // a dark plate with pale letters: it has to read on whitewash and on wallpaper
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 600;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  const draw = () => {
    ctx.fillStyle = '#0d0f0e';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#6f7a73';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, c.width - 8, c.height - 8);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1ece0';
    ctx.font = '400 96px "Departure Mono", ui-monospace, monospace';
    wrapText(ctx, getLang() === 'ru' ? art.title_ru : art.title_en, c.width / 2, 255, c.width - 90, 112);
    ctx.fillStyle = '#b9c2bb';
    ctx.font = '400 54px "Departure Mono", ui-monospace, monospace';
    ctx.fillText('UVALISS · SOULS', c.width / 2, c.height - 70);
    tex.needsUpdate = true;
  };
  draw();
  // canvas text uses whatever font is ready: redraw once the site font arrives
  if (document.fonts && !document.fonts.check('64px "Departure Mono"')) document.fonts.load('64px "Departure Mono"').then(draw).catch(() => {});
  return tex;
}

// A moulded wooden frame: darker grain, a lit outer bevel and a shadowed
// inner lip, so it reads as a profile and not a flat black box. One texture
// stretched over the whole box; the canvas covers its middle.
function frameTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#3a2a16'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {                      // grain running round the frame
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '20,12,4' : '90,66,36'},${0.08 + Math.random() * 0.12})`;
    g.lineWidth = 0.5 + Math.random() * 1.5;
    const k = Math.random() * S * 0.5;
    g.strokeRect(k, k, S - 2 * k, S - 2 * k);
  }
  const bevel = (k, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.strokeRect(k, k, S - 2 * k, S - 2 * k); };
  bevel(3, 'rgba(160,122,70,0.55)', 4);               // the lit outer edge
  bevel(10, 'rgba(0,0,0,0.25)', 5);
  bevel(19, 'rgba(190,150,90,0.35)', 2);              // a bead of gilt
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
// The soft shadow a hanging frame throws on the wall: a blurred rectangle,
// a little lower than the frame, darkest near its edge.
let WALL_SHADOW = null;
function wallShadowTexture() {
  if (WALL_SHADOW) return WALL_SHADOW;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);         // an alpha map: white is shadow
  g.filter = 'blur(10px)'; g.fillStyle = '#fff'; g.fillRect(22, 22, S - 44, S - 44);
  WALL_SHADOW = new THREE.CanvasTexture(c);
  return WALL_SHADOW;
}
// Fog reaches a work only in part: the image stays readable in the milk of
// the last stage, while its frame and the wall fade as usual.
function thinFog(mat, k = 0.4) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>',
      `#ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        #else
          float fogF = smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogF * ${k.toFixed(2)});
      #endif`);
  };
  return mat;
}

// ── DOM: proximity prompt + inspect overlay ─────────────────────────────────
function ensureDom() {
  if (document.getElementById('artwork-prompt')) return;
  const style = document.createElement('style');
  style.textContent = `
#artwork-prompt {
  position: fixed; left: 50%; bottom: calc(2vh + var(--hud-h, 0px) + 12px); transform: translateX(-50%) translateY(6px);
  z-index: 5; font-family: 'Departure Mono', ui-monospace, monospace; font-size: 0.85em;
  color: #baffc9; background: rgba(1,8,5,0.9); border: 1px solid #3f8a5a;
  padding: 0.5em 1em; letter-spacing: 0.04em; opacity: 0; pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}
#artwork-prompt.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
#inspect-overlay {
  position: fixed; inset: 0; z-index: 6; pointer-events: none;
  /* focus, never dim: the centre stays clear, only the edges darken. The
     placard beside the work is its only label: nothing covers the work. */
  background: radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 38%, rgba(0,0,0,0.6) 100%);
  opacity: 0; transition: opacity 0.5s ease;
  display: flex; align-items: flex-end; justify-content: center;
}
#inspect-overlay.visible { opacity: 1; }
#inspect-overlay .auto-hold {
  display: none; margin: 0 16px calc(3vh + var(--hud-h, 0px)); padding: 0.5em 1em;
  font-family: 'Departure Mono', ui-monospace, monospace; font-size: 0.85em; letter-spacing: 0.04em;
  color: #baffc9; background: rgba(1,8,5,0.9); border: 1px solid #3f8a5a; text-align: center;
}
body.auto-show #inspect-overlay .auto-hold { display: block; }
`;
  document.head.appendChild(style);

  const prompt = document.createElement('div');
  prompt.id = 'artwork-prompt';
  document.body.appendChild(prompt);

  const overlay = document.createElement('div');
  overlay.id = 'inspect-overlay';
  const hold = document.createElement('p');
  hold.className = 'auto-hold';
  overlay.appendChild(hold);
  document.body.appendChild(overlay);
}

// a hung work by where it hangs: chunks rebuild their objects, the place stays
const autoKey = a => `${a.art.id}@${a.centerWorld.x.toFixed(1)},${a.centerWorld.z.toFixed(1)}`;

// ── Artworks ─────────────────────────────────────────────────────────────
export class Artworks {
  static async create(scene, world, quality, camera, player, router) {
    const res = await fetch(JSON_URL);
    const list = await res.json();
    return new Artworks(scene, world, quality, camera, player, router, list);
  }

  constructor(scene, world, quality, camera, player, router, list) {
    this.scene = scene;
    this.world = world;
    this.quality = quality;
    this.camera = camera;
    this.player = player;
    this.list = list;
    this.deck = shuffledDeck(list.length, DECK_SEED);

    this.built = new Set();          // chunk keys claimed (building or built)
    this.chunkGroups = new Map();    // chunk key -> THREE.Group | null
    this.active = [];                // [{ art, centerWorld, normal, width, height, chunkKey }]

    this.frameMat = new THREE.MeshBasicMaterial({ map: frameTexture() });
    this.shadowMat = new THREE.MeshBasicMaterial({ map: wallShadowTexture(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.shadowMat.alphaMap = this.shadowMat.map; this.shadowMat.map = null;
    this.texCache = new Map();       // art.id -> { tex, refs }
    this.placardCache = new Map();   // art.id -> { tex, refs }

    ensureDom();
    this._prompt = document.getElementById('artwork-prompt');
    this._overlay = document.getElementById('inspect-overlay');

    this.inspecting = null;
    this._animT = 0;
    this._prevPinch = false;
    this._pickPressed = false;
    this._autoShown = new Set();     // works already shown by themselves on hands, once each
    this._autoT = 0;

    router.on('pick', () => { this._pickPressed = true; });
    router.on('halt', () => { if (this.inspecting) this._closeInspect(); });
  }

  // ── streaming: mirror World's chunk lifecycle ─────────────────────────
  sync() {
    for (const key of this.world.chunks.keys()) {
      if (!this.built.has(key)) {
        this.built.add(key);
        const [cx, cz] = key.split(':').map(Number);
        this._buildForChunk(cx, cz, key);
      }
    }
    for (const key of Array.from(this.chunkGroups.keys())) {
      if (!this.world.chunks.has(key)) this._disposeChunk(key);
    }
    this._fetchNear();
  }

  // A work hangs at once, frame, placard and a dark canvas; its picture is
  // fetched when the visitor comes near, the nearest first. A wall far off in
  // the fog needs no file yet.
  _fetchNear() {
    const P = this.player.pos;
    let due = null;
    for (const a of this.active) {
      if (a.wanted) continue;
      a.dist = Math.hypot(a.centerWorld.x - P.x, a.centerWorld.z - P.y);
      if (a.dist < FETCH_NEAR) (due ||= []).push(a);
    }
    if (!due) return;
    due.sort((a, b) => a.dist - b.dist);
    for (const a of due) {
      a.wanted = a.sub.userData.textureWanted = true;
      this._getTexture(a.art).then(tex => {
        if (this.active.includes(a)) a.canvas.material.map = tex;   // else its chunk went meanwhile, and the texture was released with it
      }).catch(e => console.warn('[artworks] failed to load', a.art.id, e));
    }
  }

  _buildForChunk(cx, cz, key) {
    const slots = this.world.getWallSlots(cx, cz);
    const plan = chunkArtworkPlan(cx, cz, slots, this.deck);
    if (!plan.length) { this.chunkGroups.set(key, null); return; }

    const group = new THREE.Group();
    group.name = 'artworks_' + key;
    this.scene.add(group);
    this.chunkGroups.set(key, group);

    for (const { slot, artIndex } of plan) {
      const art = this.list[artIndex];
      try {
        this._placeArtwork(group, slot, art, key);
      } catch (e) {
        console.warn('[artworks] failed to place', art?.id, e);
      }
    }
  }

  _placeArtwork(group, slot, art, chunkKey) {
    // the picture's proportions come with the list (artworks.json), so the frame can hang before the file is here
    const aspect = art.w && art.h ? art.w / art.h : (art.orientation === 'landscape' ? 1.25 : 0.8);
    const width = art.orientation === 'landscape' ? 1.35 : 1.1;
    const height = width / aspect;

    const wallOffset = 0.011;
    const sub = new THREE.Group();
    // the frame and its placard together sit in the middle of the span
    const shift = -(PLACARD_GAP + PLACARD_W) / 2, tx = slot.normal.z, tz = -slot.normal.x;
    sub.position.set(
      slot.position.x + slot.normal.x * wallOffset + tx * shift,
      EYE_Y,
      slot.position.z + slot.normal.z * wallOffset + tz * shift
    );
    sub.rotation.y = Math.atan2(slot.normal.x, slot.normal.z);
    sub.userData.artworkId = art.id;
    group.add(sub);

    const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), thinFog(new THREE.MeshBasicMaterial({ map: blankTexture() })));
    sub.add(canvasMesh);
    // its shadow on the wall, thrown down by the lamps overhead
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.5, height + 0.55), this.shadowMat);
    shade.position.set(0, -0.07, -0.008);                // on the wall itself, just in front of it
    sub.add(shade);

    const border = FRAME_BORDER, depth = 0.05;
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(width + border * 2, height + border * 2, depth), this.frameMat);
    frameMesh.position.z = -depth * 0.5 - 0.005;
    sub.add(frameMesh);

    const placardTex = this._getPlacard(art);
    const pw = PLACARD_W, ph = 0.27;
    const placard = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: placardTex }));
    placard.position.set(width / 2 + border + PLACARD_GAP + pw / 2, PLACARD_Y - EYE_Y, 0.002);
    sub.add(placard);

    this.active.push({
      art,
      centerWorld: sub.position.clone(),
      normal: new THREE.Vector3(slot.normal.x, 0, slot.normal.z),
      width, height,
      chunkKey,
      sub,            // the work's own group: fear hides the ones not found yet (soulpath.js)
      hidden: false,
      canvas: canvasMesh,
      wanted: false,  // its picture has been asked for (_fetchNear)
    });
  }

  _disposeChunk(key) {
    this.built.delete(key);
    const group = this.chunkGroups.get(key);
    this.chunkGroups.delete(key);
    if (this.inspecting && this.inspecting.chunkKey === key) this._closeInspect();
    this.active = this.active.filter(a => a.chunkKey !== key);
    if (!group) return;
    this.scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== this.frameMat && o.material !== this.shadowMat) o.material.dispose();
      if (o.userData && o.userData.artworkId) {
        if (o.userData.textureWanted) this._releaseTexture(o.userData.artworkId);
        this._releasePlacard(o.userData.artworkId);
      }
    });
  }

  // Cache the in-flight *promise* (not just the resolved value) so concurrent
  // callers for the same artwork — e.g. multiple chunks that finish their
  // deck lookup to the same index and build in parallel off sync()'s
  // un-awaited loop — share one load instead of racing to overwrite each
  // other's cache entry (which used to leak one GPU texture and could cause
  // the surviving placement's texture to be disposed out from under it).
  _getTexture(art) {
    const cached = this.texCache.get(art.id);
    if (cached) { cached.refs++; return cached.promise; }
    const halfRes = this.quality.tier === 0;
    const entry = { tex: null, refs: 1, promise: null };
    entry.promise = loadTexture(art.file, halfRes).then(tex => { entry.tex = tex; return tex; });
    this.texCache.set(art.id, entry);
    return entry.promise;
  }
  _releaseTexture(id) {
    const e = this.texCache.get(id);
    if (!e) return;
    if (--e.refs <= 0) {
      this.texCache.delete(id);
      e.promise.then(tex => tex.dispose()); // safe even if already resolved
    }
  }
  _getPlacard(art) {
    const cached = this.placardCache.get(art.id);
    if (cached) { cached.refs++; return cached.tex; }
    const tex = buildPlacardTexture(art);
    this.placardCache.set(art.id, { tex, refs: 1 });
    return tex;
  }
  _releasePlacard(id) {
    const e = this.placardCache.get(id);
    if (!e) return;
    if (--e.refs <= 0) { e.tex.dispose(); this.placardCache.delete(id); }
  }

  // ── proximity, prompt, inspect ─────────────────────────────────────────
  update(dt) {
    if (this.player.mode === 'hands' && this.player.hand.present) return this._updateAuto(dt);
    if (this.inspecting) {
      this._updateInspectAnim(dt);
      const pinchNow = !!(this.player.hand.present && this.player.hand.pinch);
      const pinchEdge = pinchNow && !this._prevPinch;
      this._prevPinch = pinchNow;
      if (this._pickPressed || pinchEdge) this._closeInspect();
      this._pickPressed = false;
      return;
    }

    const candidate = this._findCandidate();
    this._setPrompt(candidate);
    const pinchNow = !!(this.player.hand.present && this.player.hand.pinch);
    const pinchEdge = pinchNow && !this._prevPinch;
    this._prevPinch = pinchNow;
    if (candidate && (this._pickPressed || pinchEdge) && !this.player.locked) this._openInspect(candidate);   // never mid-crossing (the tunnel holds the walk)
    this._pickPressed = false;
  }

  // On hands nothing is pinched: a work shows itself as the visitor passes,
  // for AUTO_SHOW seconds, and the next one near follows; an open palm (or
  // both) holds the one on screen, E / click / Escape put it away.
  _updateAuto(dt) {
    this._prompt.classList.remove('visible');
    document.body.classList.remove('can-inspect');
    if (this.inspecting) {
      this._updateInspectAnim(dt);
      const hand = this.player.hand;
      const holding = hand.stopped || /palm/.test(hand.left + hand.right);
      if (!holding) this._autoT += dt;
      if (this._pickPressed) this._autoT = AUTO_SHOW;
      this._pickPressed = false;
      if (this._autoT >= AUTO_SHOW) {
        const next = this._findAuto();
        if (next) this._showAuto(next);
        else this._closeInspect();
      }
      return;
    }
    this._pickPressed = false;
    if (this.player.auto || this.player.locked || window.__app?.training) return;       // a question board holds the walk, or Тренировка is on
    const next = this._findAuto();
    if (next) this._showAuto(next);
  }

  _findAuto() {
    const px = this.player.pos.x, pz = this.player.pos.y;
    const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    let best = null, bestD = Infinity;
    for (const a of this.active) {
      if (a.hidden || this._autoShown.has(autoKey(a)) || a === this.inspecting) continue;
      const dx = a.centerWorld.x - px, dz = a.centerWorld.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > AUTO_DIST || d < 1e-4) continue;
      if ((dx * a.normal.x + dz * a.normal.z) / d > -0.2) continue;   // on our side of its wall
      if ((fx * dx + fz * dz) / d < -0.3) continue;                    // not one already behind us
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  _showAuto(a) {
    this._autoShown.add(autoKey(a));
    this._autoT = 0;
    this._overlay.querySelector('.auto-hold').textContent = t('autoHold');
    document.body.classList.add('auto-show');
    this._openInspect(a);
  }

  _findCandidate() {
    const px = this.player.pos.x, pz = this.player.pos.y;
    const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    let best = null, bestD = Infinity;
    for (const a of this.active) {
      if (a.hidden) continue;
      const dx = a.centerWorld.x - px, dz = a.centerWorld.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > INSPECT_DIST || d < 1e-4) continue;
      const facing = (fx * dx + fz * dz) / d;
      if (facing < INSPECT_FACING) continue;
      if ((dx * a.normal.x + dz * a.normal.z) / d > -0.2) continue; // must be on the viewer side of the wall
      // the gaze has to land on the canvas itself: the dark placard beside it
      // (and the wall around) is only read, never inspected
      const toward = -(fx * a.normal.x + fz * a.normal.z);          // how squarely we face the wall
      if (toward < 1e-3) continue;
      const back = -(dx * a.normal.x + dz * a.normal.z);           // our distance from the wall plane
      const hx = px + fx * back / toward - a.centerWorld.x, hz = pz + fz * back / toward - a.centerWorld.z;
      const along = hx * a.normal.z - hz * a.normal.x;             // + is toward the placard
      if (along > a.width / 2 + FRAME_BORDER + 0.04 || along < -(a.width / 2 + FRAME_BORDER + 0.25)) continue;
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  _setPrompt(candidate) {
    document.body.classList.toggle('can-inspect', !!candidate);   // wakes the pad's LOOK CLOSER
    if (!candidate) { this._prompt.classList.remove('visible'); return; }
    const mode = this.player.mode;
    const touch = matchMedia('(pointer: coarse)').matches;
    const hint = t(mode === 'hands' ? 'promptHands' : touch ? 'promptPad' : 'promptKeys');
    this._prompt.textContent = hint;
    this._prompt.classList.add('visible');
  }

  _openInspect(a) {
    this.inspecting = a;
    this.player.locked = true;
    this._prompt.classList.remove('visible');
    this._animT = 0;
    this._animFrom = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
    // Frame the work together with its placard: aim between them and step
    // back until both fit, but never further than the corridor allows.
    const cam = this.camera, vHalf = THREE.MathUtils.degToRad(cam.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * cam.aspect);
    const left = a.width / 2 + 0.06, right = a.width / 2 + 0.06 + 0.10 + 0.46;
    const dist = Math.min(DOLLY_MAX, Math.max(DOLLY_DIST,
      ((left + right) / 2 + 0.12) / Math.tan(hHalf), (a.height / 2 + 0.18) / Math.tan(vHalf)));
    const focus = a.centerWorld.clone().addScaledVector(new THREE.Vector3(a.normal.z, 0, -a.normal.x), (right - left) / 2);
    const target = focus.clone().addScaledVector(a.normal, dist);
    // Camera-style orientation (looking down −Z at the artwork). A plain
    // Object3D.lookAt aims +Z instead, which turned the view 180° away.
    const m = new THREE.Matrix4().lookAt(target, focus, new THREE.Vector3(0, 1, 0));
    this._animTo = { pos: target, quat: new THREE.Quaternion().setFromRotationMatrix(m) };
    this._overlay.classList.add('visible');
    document.body.classList.add('inspecting'); // hide the key legend under the caption
  }

  _updateInspectAnim(dt) {
    this._animT = Math.min(1, this._animT + dt / DOLLY_TIME);
    const e = 1 - Math.pow(1 - this._animT, 3); // ease-out cubic
    this.camera.position.lerpVectors(this._animFrom.pos, this._animTo.pos, e);
    this.camera.quaternion.copy(this._animFrom.quat).slerp(this._animTo.quat, e);
  }

  _closeInspect() {
    this.inspecting = null;
    document.body.classList.remove('auto-show');
    document.body.classList.remove('inspecting');
    this.player.locked = false;
    this._overlay.classList.remove('visible');
    this.player.update(0); // snap camera back to the player's frozen transform
  }

  dispose() {
    for (const key of Array.from(this.chunkGroups.keys())) this._disposeChunk(key);
    this.frameMat.map?.dispose(); this.frameMat.dispose(); this.shadowMat.dispose();
    this._prompt?.remove();
    this._overlay?.remove();
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
