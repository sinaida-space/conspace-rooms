import * as THREE from 'three';

// ── conspace-rooms · footdust.js ────────────────────────────────────────────
// Dust settling on the things the visitor has already walked past: the beds,
// chairs, trolleys and boxes of a corridor walked once go grey on top, like
// fear's ficus, so a corridor walked twice looks walked (#53). The floor stays
// as it is. A small map of the cells around the visitor (one texel a cell)
// feeds the props' shader (materials.js, uDust); a cell passed fills in over
// a few seconds. The map follows the visitor, re-centred when they near its
// edge; the cells walked are kept, so the dust is still there on return.
// Cleared when the stage changes.

const N = 96;                  // cells a side of the map (~115 m)
const SETTLE = 4;              // seconds for dust to settle on a cell passed
const REACH = 1;               // cells around the one walked through that gather dust too

export function createFootDust(atmo, cell) {
  const data = new Uint8Array(N * N);
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;  // soft at the edges of a walked stretch
  tex.needsUpdate = true;
  const u = atmo?.dust;
  const walked = new Map();                             // "gi,gj" -> { gi, gj, t0 }: when the dust began to settle
  let oi = 0, oj = 0, placed = false, settling = 0;

  const paint = time => {
    data.fill(0);
    for (const { gi, gj, t0 } of walked.values()) {
      const i = gi - oi, j = gj - oj;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      data[j * N + i] = Math.round(255 * Math.min(1, (time - t0) / SETTLE));
    }
    tex.needsUpdate = true;
  };
  // the map's corner, in cells, so the visitor stands near its middle
  const recentre = (gi, gj, time) => {
    oi = gi - (N >> 1); oj = gj - (N >> 1); placed = true;
    u.map.value = tex; u.origin.value.set(oi * cell, oj * cell, N * cell);
    paint(time);
  };

  return {
    // pos: the visitor on the floor plan ({x, y}); time: seconds
    update(pos, time, on = true) {
      if (!u) return;
      if (!on) { if (placed) { u.origin.value.set(1e6, 1e6, 1); placed = false; } return; }
      const gi = Math.floor(pos.x / cell), gj = Math.floor(pos.y / cell);
      if (!placed || gi - oi < 12 || gj - oj < 12 || gi - oi > N - 12 || gj - oj > N - 12) recentre(gi, gj, time);
      for (let dj = -REACH; dj <= REACH; dj++) for (let di = -REACH; di <= REACH; di++) {
        const key = (gi + di) + ',' + (gj + dj);
        if (!walked.has(key)) { walked.set(key, { gi: gi + di, gj: gj + dj, t0: time }); settling = time + SETTLE; }
      }
      if (time <= settling) paint(time);                // only while some cell is still filling in
    },
    clear() { walked.clear(); data.fill(0); tex.needsUpdate = true; settling = 0; },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
