import * as THREE from 'three';
import { CELL, solidAtGlobal } from './world.js';
import { buildLightRays } from './doorway.js';

// ── conspace-rooms · roses.js ───────────────────────────────────────────────
// The works seen, counted by a rose. A small climbing rose grows out of the
// top-left corner of the screen: the first works draw its stem and a few
// leaves, more works add leaves, branches and buds, and every fifth work
// opens a bud into a flower. With all eighteen the bush is whole and glows.
//
// Then the labyrinth answers: the view turns a little, and a couple of steps
// away an arch of roses grows out of the floor with light pouring through it.
// Walking through it ends the walk with the card of questions (card.js).

// ── the counter ─────────────────────────────────────────────────────────────
// One SVG, drawn once; the count only reveals parts of it.
const STEMS = [                                   // [path, visible from n, whole at n]
  ['M3 0 C9 12 5 26 15 38 S28 58 24 76', 0.5, 7],
  ['M11 26 C18 22 26 24 34 18', 2, 5],
  ['M19 48 C26 48 34 54 44 52', 5, 9],
];
const LEAVES = [                                  // [x, y, angle, from n]
  [7, 10, -30, 1], [10, 22, 40, 2], [14, 34, -35, 3], [19, 44, 35, 4], [23, 60, -40, 6],
  [22, 24, -60, 7], [29, 21, 30, 9], [26, 49, 60, 11], [36, 53, -30, 12], [25, 68, 45, 14],
  [4, 16, 20, 5], [17, 40, -70, 8], [31, 19, -40, 10], [40, 55, 50, 13], [27, 72, -20, 16], [12, 30, 80, 17],
];
const BUDS = [                                    // [x, y, shows at, opens at]
  [34, 17, 4, 5], [45, 51, 8, 10], [24, 76, 12, 15], [6, 4, 16, 18],
];

function leaf(x, y, a) {
  return `<path d="M0 0 C2.5 -2.6 6 -2.4 8 0 C6 2.4 2.5 2.6 0 0Z" transform="translate(${x} ${y}) rotate(${a}) scale(1.35)" class="rl"/>`;
}
function bud(x, y) {
  return `<g transform="translate(${x} ${y}) scale(1.2)" class="rb"><path d="M0 -3.4 C2.2 -1.6 2.2 1.8 0 2.6 C-2.2 1.8 -2.2 -1.6 0 -3.4Z" class="rr"/><path d="M-2.4 1.6 L0 3.4 L2.4 1.6" class="rs"/></g>`;
}
function bloom(x, y) {
  return `<g transform="translate(${x} ${y}) scale(1.25)" class="rf"><circle r="4.6" class="rr"/><circle r="3.2" class="rd"/>` +
    `<path d="M0 0 C1.4 -1.2 2.2 0.4 1 1.4 C-0.6 2.4 -2.4 0.8 -1.6 -0.8 C-0.8 -2.4 1.6 -2.6 2.6 -1" class="rc"/></g>`;
}

export function createRoseCounter(total = 18) {
  const el = document.createElement('div');
  el.id = 'roses';
  el.className = 'roses';
  el.setAttribute('role', 'img');
  el.innerHTML = `<svg viewBox="-2 -2 54 84" aria-hidden="true">
    ${STEMS.map(([d], i) => `<path d="${d}" pathLength="1" class="rstem" data-i="${i}"/>`).join('')}
    ${LEAVES.map(([x, y, a], i) => `<g data-leaf="${i}">${leaf(x, y, a)}</g>`).join('')}
    ${BUDS.map(([x, y], i) => `<g data-bud="${i}">${bud(x, y)}</g><g data-bloom="${i}">${bloom(x, y)}</g>`).join('')}
  </svg>`;
  document.body.appendChild(el);
  let shown = -1;
  const api = {
    el,
    set(n, label) {
      n = Math.max(0, Math.min(total, n));
      if (label) el.setAttribute('aria-label', label);
      el.title = label || '';
      if (n === shown) return;
      const grew = shown >= 0 && n > shown;
      shown = n;
      const k = n * 18 / total;                    // the drawing is laid out for eighteen
      el.querySelectorAll('.rstem').forEach(p => {
        const [, from, whole] = STEMS[+p.dataset.i];
        const f = Math.max(0, Math.min(1, (k - from + 0.5) / (whole - from + 0.5)));
        p.style.strokeDashoffset = String(1 - f);
        p.style.opacity = f > 0 ? '1' : '0';                       // no round cap dot before it grows
      });
      LEAVES.forEach(([, , , from], i) => el.querySelector(`[data-leaf="${i}"]`).classList.toggle('on', k >= from));
      BUDS.forEach(([, , shows, opens], i) => {
        el.querySelector(`[data-bud="${i}"]`).classList.toggle('on', k >= shows && k < opens);
        el.querySelector(`[data-bloom="${i}"]`).classList.toggle('on', k >= opens);
      });
      el.classList.toggle('full', n >= total);
      if (grew) { el.classList.remove('grew'); void el.offsetWidth; el.classList.add('grew'); }
    },
    remove() { el.remove(); },
  };
  requestAnimationFrame(() => el.classList.add('visible'));
  return api;
}

// ── the arch ────────────────────────────────────────────────────────────────
// Two iron posts and a half-round top, wound with a vine and heavy with red
// roses, light pouring through the opening. Built facing +Z (toward the
// visitor), origin on the floor at the centre of the opening.
const ARCH_HALF = 0.8, POST_H = 1.9, ROSE_RED = 0xc3141c;

function roseGeometry() {
  // a small cabbage rose: a squashed ball of petals, cheap enough to instance
  const g = new THREE.IcosahedronGeometry(0.07, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = 1 + 0.18 * Math.sin(x * 90 + y * 70 + z * 50);
    p.setXYZ(i, x * r, y * r * 0.7, z * r);
  }
  g.computeVertexNormals();
  return g;
}

function archText(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 64;
  do { g.font = `400 ${size}px "Departure Mono", ui-monospace, monospace`; size -= 2; } while (g.measureText(text).width > 940 && size > 20);
  g.lineJoin = 'round';
  g.lineWidth = 14; g.strokeStyle = 'rgba(4, 14, 8, 0.92)';        // a dark rim: it must read against the light
  g.strokeText(text, 512, 66);
  g.shadowColor = 'rgba(255, 200, 190, 0.8)'; g.shadowBlur = 12;
  g.fillStyle = '#fff6ea';
  g.fillText(text, 512, 66);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function buildRoseArch(text) {
  const g = new THREE.Group();
  const iron = new THREE.MeshBasicMaterial({ color: 0x151816, fog: true });
  const vine = new THREE.MeshBasicMaterial({ color: 0x1f4a2e, fog: true });
  // frame: posts and the half ring on top
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, POST_H, 8), iron);
    post.position.set(s * ARCH_HALF, POST_H / 2, 0); g.add(post);
  }
  const top = new THREE.Mesh(new THREE.TorusGeometry(ARCH_HALF, 0.025, 6, 32, Math.PI), iron);
  top.position.y = POST_H; g.add(top);
  // the path of the vine: up one post, over the top, down the other
  const pts = [];
  for (let k = 0; k <= 12; k++) pts.push(new THREE.Vector3(-ARCH_HALF, k / 12 * POST_H, 0));
  for (let k = 1; k < 24; k++) { const a = Math.PI - k / 24 * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * ARCH_HALF, POST_H + Math.sin(a) * ARCH_HALF, 0)); }
  for (let k = 12; k >= 0; k--) pts.push(new THREE.Vector3(ARCH_HALF, k / 12 * POST_H, 0));
  const path = new THREE.CatmullRomCurve3(pts);
  const wind = [];
  for (let k = 0; k <= 220; k++) {                  // the vine spirals around the frame
    const u = k / 220, p = path.getPointAt(u), a = u * 60;
    wind.push(p.clone().add(new THREE.Vector3(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05)));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wind), 400, 0.012, 5, false), vine));
  // roses and leaves along it, in the order they will open (bottom up, both sides)
  const N = 46, roses = new THREE.InstancedMesh(roseGeometry(), new THREE.MeshBasicMaterial({ color: ROSE_RED, fog: true }), N);
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4).scale(1, 0.25, 0.55), vine, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
  const order = Array.from({ length: N }, (_, i) => i / (N - 1)).map(u => (u < 0.5 ? u : 1 - u) + Math.random() * 0.04);
  const sorted = order.map((o, i) => [o, i]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
  sorted.forEach((i, k) => {
    const u = i / (N - 1), p = path.getPointAt(u);
    const off = new THREE.Vector3((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.08, 0.03 + Math.random() * 0.07);
    m.compose(p.clone().add(off), q.setFromEuler(e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)), sc.setScalar(0.8 + Math.random() * 0.6));
    roses.setMatrixAt(k, m);
    const lo = off.clone().multiplyScalar(-1).add(new THREE.Vector3(0.05, -0.04, 0));
    m.compose(p.clone().add(lo), q.setFromEuler(e.set(Math.random() * 3, Math.random() * 3, 0)), sc.setScalar(1));
    leaves.setMatrixAt(k, m);
  });
  roses.count = 0; leaves.count = 0;
  roses.frustumCulled = leaves.frustumCulled = false;   // bounds were measured while empty
  g.add(roses, leaves);
  // light through the opening, and toward the visitor
  const rays = buildLightRays(4, { nearW: ARCH_HALF * 2 - 0.1, nearH: POST_H + 0.5, farW: 2.3, farH: 3.1, gapZ: -0.05, z0: 0.02, gapK: 0.35 });
  g.add(rays.group);
  // the words, hung under the top of the arch
  const words = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.19),
    new THREE.MeshBasicMaterial({ map: archText(text), transparent: true, depthWrite: false, opacity: 0 }));
  words.position.set(0, POST_H + 0.33, 0.06);
  g.add(words);

  g.scale.setScalar(0.001);
  let grow = 0;
  return {
    group: g,
    halfWidth: ARCH_HALF,
    // t: seconds since it began to grow
    update(dt, time) {
      grow = Math.min(1, grow + dt / 2.4);
      const e3 = 1 - (1 - grow) ** 3;
      g.scale.set(1, 0.05 + 0.95 * e3, 1);                       // rises out of the floor
      roses.count = leaves.count = Math.floor(N * Math.min(1, grow * 1.3));
      rays.set(Math.max(0, (grow - 0.35) / 0.65) * (0.85 + 0.15 * Math.sin(time * 1.7)), time);
      words.material.opacity = Math.max(0, (grow - 0.7) / 0.3);
    },
    dispose() {
      g.traverse(o => { o.geometry?.dispose(); if (o.material && o.material !== vine && o.material !== iron) { o.material.map?.dispose(); o.material.dispose(); } });
      vine.dispose(); iron.dispose(); rays.dispose();
    },
  };
}

// Where the arch can stand: a couple of steps from the visitor along a
// corridor axis, in open floor wide enough for it, as close as possible to
// where they are already looking. Returns { x, z, dir: [dx, dz], yaw } or null.
export function findArchSpot(px, pz, yaw) {
  const open = (x, z) => !solidAtGlobal(Math.floor(x / CELL), Math.floor(z / CELL));
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort((a, b) => (b[0] * fx + b[1] * fz) - (a[0] * fx + a[1] * fz));
  for (const dist of [3.0, 2.6, 3.6, 2.2]) {
    for (const [dx, dz] of dirs) {
      const lx = -dz, lz = dx;                        // across the corridor
      for (const side of [0, 0.3, -0.3, 0.6, -0.6]) {
        const x = px + dx * dist + lx * side, z = pz + dz * dist + lz * side;
        let ok = open(x, z) && open(x + dx * 1.2, z + dz * 1.2);
        for (const w of [-0.95, 0.95]) ok = ok && open(x + lx * w, z + lz * w);
        for (let s = 0.4; ok && s < dist; s += 0.4) ok = open(px + dx * s + lx * side * s / dist, pz + dz * s + lz * side * s / dist);
        if (ok) return { x, z, dir: [dx, dz], yaw: Math.atan2(-dx, -dz) };
      }
    }
  }
  return null;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
