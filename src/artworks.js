import * as THREE from 'three';
import { CONSPACE_SEED, chunkRooms, solidAtGlobal, CELL } from './world.js';
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

// A wall run in a corridor: the open floor in front of it is exactly two
// cells wide (the lattice corridors), with the opposite wall right behind.
// Works hang only there, so every work, and the rose tunnel that follows the
// last one, is met in a corridor.
function inCorridor(slot) {
  const { position: p, normal: n, length } = slot;
  for (const k of [0.5, length / 2, length - 0.5]) {          // both ends and the middle of the run
    const u = -length * CELL / 2 + k * CELL;                   // along the wall
    const x = n.x !== 0 ? p.x + n.x * CELL * 0.5 : p.x + u;    // the cell in front of it
    const z = n.x !== 0 ? p.z + u : p.z + n.z * CELL * 0.5;
    const gi = Math.floor(x / CELL), gj = Math.floor(z / CELL);
    if (solidAtGlobal(gi, gj) || solidAtGlobal(gi + n.x, gj + n.z)) return false;   // two open cells
    if (!solidAtGlobal(gi + 2 * n.x, gj + 2 * n.z)) return false;                    // then the other wall
  }
  return true;
}

// Which wall slots (if any) get an artwork in this chunk, and which deck
// index each one draws. Pure function of (cx, cz) + the chunk's own slots.
function chunkArtworkPlan(cx, cz, slots, deck) {
  const rooms = chunkRooms(cx, cz).length;
  const rand = mulberry32(hash2i(DECK_SEED, cx, cz));
  let target = 0;
  for (let r = 0; r < rooms; r += 2 + rand()) target++; // ~1 per 2–3 rooms

  const candidates = slots.filter(s => s.length >= 2 && inCorridor(s));
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const chosen = candidates.slice(0, Math.min(target, candidates.length));
  const ord = ringOrdinal(cx, cz);
  return chosen.map((slot, i) => ({ slot, artIndex: deck[(ord * 3 + i) % deck.length] }));
}

// The wall runs that carry a work in this chunk, so other things keep off them.
export function artworkSlots(cx, cz, slots) {
  return chunkArtworkPlan(cx, cz, slots, [0]).map(p => p.slot);
}

// ── texture loading (lazy, per file, half-res on tier 0) ───────────────────
function loadTexture(url, halfRes) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let tex;
      if (halfRes) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, img.width >> 1);
        c.height = Math.max(1, img.height >> 1);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        tex = new THREE.CanvasTexture(c);
      } else {
        tex = new THREE.Texture(img);
        tex.needsUpdate = true;
      }
      tex.anisotropy = 4;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      resolve(tex);
    };
    img.onerror = reject;
    img.src = url;
  });
}

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
`;
  document.head.appendChild(style);

  const prompt = document.createElement('div');
  prompt.id = 'artwork-prompt';
  document.body.appendChild(prompt);

  const overlay = document.createElement('div');
  overlay.id = 'inspect-overlay';
  document.body.appendChild(overlay);
}

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

    this.frameMat = new THREE.MeshBasicMaterial({ color: 0x3b2c17 });
    this.texCache = new Map();       // art.id -> { tex, refs }
    this.placardCache = new Map();   // art.id -> { tex, refs }

    ensureDom();
    this._prompt = document.getElementById('artwork-prompt');
    this._overlay = document.getElementById('inspect-overlay');

    this.inspecting = null;
    this._animT = 0;
    this._prevPinch = false;
    this._pickPressed = false;

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
  }

  async _buildForChunk(cx, cz, key) {
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
        await this._placeArtwork(group, slot, art, key);
      } catch (e) {
        console.warn('[artworks] failed to place', art?.id, e);
      }
      if (!this.built.has(key)) return; // chunk was disposed mid-load
    }
  }

  async _placeArtwork(group, slot, art, chunkKey) {
    const texture = await this._getTexture(art);
    if (!this.built.has(chunkKey)) { this._releaseTexture(art.id); return; } // disposed while awaiting

    const img = texture.image;
    const aspect = img.width / img.height;
    const width = art.orientation === 'landscape' ? 1.35 : 1.1;
    const height = width / aspect;

    const wallOffset = 0.011;
    const sub = new THREE.Group();
    sub.position.set(
      slot.position.x + slot.normal.x * wallOffset,
      EYE_Y,
      slot.position.z + slot.normal.z * wallOffset
    );
    sub.rotation.y = Math.atan2(slot.normal.x, slot.normal.z);
    sub.userData.artworkId = art.id;
    group.add(sub);

    const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture }));
    sub.add(canvasMesh);

    const border = 0.06, depth = 0.05;
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(width + border * 2, height + border * 2, depth), this.frameMat);
    frameMesh.position.z = -depth * 0.5 - 0.005;
    sub.add(frameMesh);

    const placardTex = this._getPlacard(art);
    const pw = 0.46, ph = 0.27;
    const placard = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: placardTex }));
    placard.position.set(width / 2 + border + 0.10 + pw / 2, PLACARD_Y - EYE_Y, 0.002);
    sub.add(placard);

    this.active.push({
      art,
      centerWorld: sub.position.clone(),
      normal: new THREE.Vector3(slot.normal.x, 0, slot.normal.z),
      width, height,
      chunkKey,
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
      if (o.material && o.material !== this.frameMat) o.material.dispose();
      if (o.userData && o.userData.artworkId) {
        this._releaseTexture(o.userData.artworkId);
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
    if (candidate && (this._pickPressed || pinchEdge)) this._openInspect(candidate);
    this._pickPressed = false;
  }

  _findCandidate() {
    const px = this.player.pos.x, pz = this.player.pos.y;
    const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    let best = null, bestD = Infinity;
    for (const a of this.active) {
      const dx = a.centerWorld.x - px, dz = a.centerWorld.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > INSPECT_DIST || d < 1e-4) continue;
      const facing = (fx * dx + fz * dz) / d;
      if (facing < INSPECT_FACING) continue;
      if ((dx * a.normal.x + dz * a.normal.z) / d > -0.2) continue; // must be on the viewer side of the wall
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
    document.body.classList.remove('inspecting');
    this.player.locked = false;
    this._overlay.classList.remove('visible');
    this.player.update(0); // snap camera back to the player's frozen transform
  }

  dispose() {
    for (const key of Array.from(this.chunkGroups.keys())) this._disposeChunk(key);
    this.frameMat.dispose();
    this._prompt?.remove();
    this._overlay?.remove();
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
