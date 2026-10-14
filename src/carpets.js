// Grandmother's carpets: 95 woven pictures (assets/carpets), on the walls of
// the red rooms and as rugs on their parquet. Each is fetched when a carpet
// that wears it is first shown, 1024 wide, 512 on phones; the decoded
// pictures nobody wears any more are let go, a few kept for the walk back.
import * as THREE from 'three';

export const CARPET_COUNT = 95;
const AVOID = 20;          // metres: the same carpet never twice within this, about ten steps and more
const KEEP_IDLE = 16;      // decoded pictures kept once nothing wears them

const low = () => window.__app?.quality?.tier === 0;
const url = id => `assets/carpets/${String(id).padStart(2, '0')}${low() ? '-512' : ''}.webp`;

// what a carpet shows until its picture has arrived: the dark red of a room in shade
let _blank = null;
export const carpetBlank = () => _blank ||= Object.assign(new THREE.DataTexture(new Uint8Array([40, 8, 8, 255]), 1, 1), { needsUpdate: true });

// id -> { tex, users, ready }; idle: ids nobody wears, oldest first
const cache = new Map();
const idle = [];

function load(id) {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.flipY = false;                                   // flipped as it is decoded
  const entry = { tex, users: 0, ready: null };
  entry.ready = fetch(url(id))
    .then(r => { if (!r.ok) throw new Error(`${r.status} ${url(id)}`); return r.blob(); })
    .then(b => createImageBitmap(b, { imageOrientation: 'flipY' }))
    .then(bmp => { tex.image = bmp; tex.needsUpdate = true; return tex; })
    .catch(() => null);                                // a lost picture leaves the blank
  cache.set(id, entry);
  return entry;
}

// one wearer fewer; a picture nobody wears waits among the idle, the oldest let go
function letGo(id) {
  const entry = cache.get(id);
  if (!entry || --entry.users > 0) return;
  entry.users = 0;
  if (!idle.includes(id)) idle.push(id);
  while (idle.length > KEEP_IDLE) {
    const old = idle.shift(), e = cache.get(old);
    if (!e || e.users > 0) continue;
    e.tex.dispose();
    e.tex.image?.close?.();
    cache.delete(old);
  }
}

// Put carpet `id` on a material of atmo.prop: the blank at once, the picture
// as soon as it is decoded.
export function wearCarpet(mat, id) {
  const e = cache.get(id) || load(id);
  e.users++;
  mat.addEventListener('dispose', () => letGo(id));   // the chunk that wore it is gone
  const i = idle.indexOf(id); if (i >= 0) idle.splice(i, 1);
  mat.uniforms.uHasMap.value = 1;
  if (e.tex.image) { mat.uniforms.uMap.value = e.tex; return; }
  mat.uniforms.uMap.value = carpetBlank();
  e.ready.then(t => { if (t) mat.uniforms.uMap.value = t; });
}

// Which carpet hangs or lies at (x, z): drawn from the chunk's own dice, never
// one already within AVOID metres. near: [{ id, x, z }] of those in place.
export function pickCarpet(rand, x, z, near) {
  const close = new Set();
  for (const c of near) if (Math.hypot(c.x - x, c.z - z) < AVOID) close.add(c.id);
  let id = 1 + Math.floor(rand() * CARPET_COUNT);
  for (let k = 0; k < CARPET_COUNT && close.has(id); k++) id = id % CARPET_COUNT + 1;
  return id;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
