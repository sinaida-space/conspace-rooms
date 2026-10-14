import * as THREE from 'three';
import { CELL, solidAtGlobal } from './world.js';

// ── conspace-rooms · placement.js ───────────────────────────────────────────
// Nothing hangs in the air. A thing meant for a wall is fixed there only if a
// wall stands right behind its point; otherwise it lies on the floor, face up,
// slightly askew. Build-time only, never per frame. ?debug=place draws every
// placement (green wall, amber dropped to the floor, blue air by design) and
// logs every conflict; window.__place lists them.

export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === 'place';

const LOG = [];
const DROP = 'no wall behind';
const COLOR = { wall: 0x33ff66, floor: 0xffb020, air: 0x3388ff };
let helperMat = {};

// nx,nz: the wall's normal, pointing into the room. True if the point just
// behind (x, z) is inside a solid cell, or within eps of one of the given
// wall segments ({ a: {x,z}, b: {x,z} }: rooms whose walls are their own meshes).
export function wallBehind(x, z, nx, nz, eps = 0.03, { walls } = {}) {
  if (walls) {
    for (const { a, b } of walls) {
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      if (Math.hypot(x - (a.x + dx * u), z - (a.z + dz * u)) <= eps) return true;
    }
    return false;
  }
  return solidAtGlobal(Math.floor((x - nx * eps) / CELL), Math.floor((z - nz * eps) / CELL));
}

// A stable pseudo-random number in -1..1 from a point: the same spot lies the same way every visit.
const askew = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };

// obj: the mesh or group as built, on its wall. kind: what it is · x, z, y: where it hangs
// (world) · nx, nz: the wall normal · w: half its width along the wall, so both ends need
// a wall too · walls: see wallBehind · fallen: already meant to lie on the floor (only recorded).
// Returns 'wall' (left as built) or 'floor' (dropped, lying face up, touching y = 0).
export function mountOrDrop(obj, { x, z, nx, nz, y = 1.5, kind = 'thing', walls, w = 0, fallen = false }) {
  const tx = -nz, tz = nx;                                   // along the wall
  const held = !fallen && [-w, 0, w].every(k => wallBehind(x + tx * k, z + tz * k, nx, nz, 0.03, { walls }));
  if (held) { record({ kind, x, z, y, mount: 'wall', ok: true, obj }); return 'wall'; }
  if (!fallen) {
    obj.rotation.order = 'YXZ';                              // lay it down first, then turn it about the vertical
    obj.rotation.set(-Math.PI / 2, askew(x, z) * 0.35, 0);   // a plane facing +z in local space now faces up
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.position.y += 0.02 - box.min.y;                      // lowest point 2 cm above the floor, clear of z-fighting
  }
  record({ kind, x, z, y: 0.1, mount: 'floor', ok: true, why: fallen ? 'fallen' : DROP, obj });
  return 'floor';
}

// entry: { kind, x, z, mount: 'wall'|'floor'|'air', ok, why?, y?, obj?, parent? }
export function record(entry) {
  const { obj, parent, y = 1.5, ...e } = entry;
  LOG.push(e);
  if (LOG.length > 4000) LOG.shift();
  if (!DEBUG) return;
  if (e.why === DROP) console.warn('[place]', e.kind, e.why, e.x.toFixed(2), e.z.toFixed(2));
  const host = parent || obj?.parent;
  if (!host) return;
  let cx = e.x, cy = y, cz = e.z, sx = 0.4, sy = 0.4, sz = 0.4;
  if (obj) {                                                 // box round the thing itself, in world space
    obj.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(obj), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    cx = c.x; cy = c.y; cz = c.z; sx = s.x + 0.06; sy = s.y + 0.06; sz = s.z + 0.06;
  }
  const mat = helperMat[e.mount] ||= new THREE.LineBasicMaterial({ color: COLOR[e.mount], depthTest: false, transparent: true, fog: false });
  const h = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)), mat);
  host.updateWorldMatrix(true, false);
  h.position.copy(host.worldToLocal(new THREE.Vector3(cx, cy, cz)));
  h.renderOrder = 999;
  h.userData.keepMaterial = true;                            // shared by every helper
  host.add(h);
}

if (typeof window !== 'undefined') window.__place = {
  list: () => LOG.slice(),
  drops: () => LOG.filter(e => e.why === DROP || !e.ok),
};

// Je suis le spectre d'une rose que tu portais hier au bal. (Gautier)
