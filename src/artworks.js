import * as THREE from 'three';
import { CONSPACE_SEED, chunkRooms } from './world.js';

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
const DOLLY_DIST = 1.3;        // metres in front of the artwork during inspect
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

// Which wall slots (if any) get an artwork in this chunk, and which deck
// index each one draws. Pure function of (cx, cz) + the chunk's own slots.
function chunkArtworkPlan(cx, cz, slots, deck) {
  const rooms = chunkRooms(cx, cz).length;
  const rand = mulberry32(hash2i(DECK_SEED, cx, cz));
  let target = 0;
  for (let r = 0; r < rooms; r += 2 + rand()) target++; // ~1 per 2–3 rooms

  const candidates = slots.filter(s => s.length >= 2);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const chosen = candidates.slice(0, Math.min(target, candidates.length));
  const ord = ringOrdinal(cx, cz);
  return chosen.map((slot, i) => ({ slot, artIndex: deck[(ord * 3 + i) % deck.length] }));
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
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#c9c0ac';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#171512';
  ctx.font = '700 24px ui-monospace, "SF Mono", monospace';
  ctx.fillText('UVALISS', c.width / 2, 54);
  ctx.font = '400 21px ui-monospace, "SF Mono", monospace';
  wrapText(ctx, art.title_en, c.width / 2, 108, c.width - 40, 26);
  ctx.fillStyle = '#8a8171';
  ctx.font = '400 17px ui-monospace, "SF Mono", monospace';
  ctx.fillText('SOULS', c.width / 2, c.height - 28);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// ── DOM: proximity prompt + inspect overlay ─────────────────────────────────
function ensureDom() {
  if (document.getElementById('artwork-prompt')) return;
  const style = document.createElement('style');
  style.textContent = `
#artwork-prompt {
  position: fixed; left: 50%; bottom: 8vh; transform: translateX(-50%) translateY(6px);
  z-index: 5; font-family: ui-monospace, 'SF Mono', monospace; font-size: 0.85em;
  color: #f2f2f2; background: rgba(10,10,10,0.55); border: 1px solid rgba(242,242,242,0.35);
  padding: 0.5em 1em; letter-spacing: 0.04em; opacity: 0; pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}
#artwork-prompt.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
#inspect-overlay {
  position: fixed; inset: 0; z-index: 6; pointer-events: none;
  background: rgba(6,6,6,0.55); opacity: 0; transition: opacity 0.5s ease;
  display: flex; align-items: flex-end; justify-content: center;
}
#inspect-overlay.visible { opacity: 1; }
#inspect-overlay .inspect-card {
  margin-bottom: 9vh; text-align: center; font-family: ui-monospace, 'SF Mono', monospace;
  color: #f2f2f2; opacity: 0; transform: translateY(8px); transition: opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s;
}
#inspect-overlay.visible .inspect-card { opacity: 1; transform: translateY(0); }
#inspect-overlay .ru { font-size: 1.1em; letter-spacing: 0.03em; margin-bottom: 0.2em; }
#inspect-overlay .en { font-size: 0.95em; color: #cfcfcf; margin-bottom: 0.5em; }
#inspect-overlay .tag { font-size: 0.75em; letter-spacing: 0.12em; color: #8a8a8a; }
`;
  document.head.appendChild(style);

  const prompt = document.createElement('div');
  prompt.id = 'artwork-prompt';
  document.body.appendChild(prompt);

  const overlay = document.createElement('div');
  overlay.id = 'inspect-overlay';
  overlay.innerHTML = '<div class="inspect-card"><p class="ru"></p><p class="en"></p><p class="tag">UVALISS — SOULS</p></div>';
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
    this._overlayRu = this._overlay.querySelector('.ru');
    this._overlayEn = this._overlay.querySelector('.en');

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
    const pw = 0.34, ph = 0.20;
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
    if (!candidate) { this._prompt.classList.remove('visible'); return; }
    const mode = this.player.mode;
    const hint = mode === 'hands' ? 'pinch to look closer'
      : mode === 'light' ? 'tap to look closer'
      : 'press E to look closer';
    this._prompt.textContent = hint;
    this._prompt.classList.add('visible');
  }

  _openInspect(a) {
    this.inspecting = a;
    this.player.locked = true;
    this._prompt.classList.remove('visible');
    this._animT = 0;
    this._animFrom = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
    const target = a.centerWorld.clone().addScaledVector(a.normal, DOLLY_DIST);
    const look = new THREE.Object3D();
    look.position.copy(target);
    look.lookAt(a.centerWorld);
    this._animTo = { pos: target, quat: look.quaternion.clone() };
    this._overlayRu.textContent = a.art.title_ru;
    this._overlayEn.textContent = a.art.title_en;
    this._overlay.classList.add('visible');
  }

  _updateInspectAnim(dt) {
    this._animT = Math.min(1, this._animT + dt / DOLLY_TIME);
    const e = 1 - Math.pow(1 - this._animT, 3); // ease-out cubic
    this.camera.position.lerpVectors(this._animFrom.pos, this._animTo.pos, e);
    this.camera.quaternion.copy(this._animFrom.quat).slerp(this._animTo.quat, e);
  }

  _closeInspect() {
    this.inspecting = null;
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
