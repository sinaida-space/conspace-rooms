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
// away a tunnel of rose arches rises out of the floor with light pouring
// from its far end. Walking through it ends the walk with the card of
// questions (card.js).

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

// ── the tunnel ──────────────────────────────────────────────────────────────
// Eight iron arches in a row make a rose tunnel down a corridor, tied
// by rails along the top, wound with a vine and heavy with roses. Light pours
// from its far end toward the visitor. Built in its own frame: the entrance
// arch stands at z = 0 facing +Z (the visitor), the tunnel runs to z = -LENGTH.
const HALF = 1.0, POST_H = 1.95, ARCHES = 8, GAP = 0.75, LENGTH = GAP * (ARCHES - 1);

// A rose seen from above, drawn once: rings of petals from the dark heart out
// to the lit rims, each with a shadowed edge. Used as a sprite, so it always
// faces the eye and never shows a flat side.
function roseTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  for (let ring = 0; ring < 6; ring++) {
    const r = 58 - ring * 9, n = 5 + (ring % 2), turn = ring * 0.7;
    for (let k = 0; k < n; k++) {
      const a = turn + k / n * Math.PI * 2;
      g.save(); g.rotate(a);
      const grad = g.createRadialGradient(0, r * 0.35, 1, 0, r * 0.35, r * 0.75);
      grad.addColorStop(0, ring > 3 ? '#4a0206' : '#7d0a10');
      grad.addColorStop(0.7, ring > 3 ? '#8e0d14' : '#c3141c');
      grad.addColorStop(1, '#ff5a64');
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(0, r * 0.42, r * 0.42, r * 0.5, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(40, 0, 4, 0.55)'; g.lineWidth = 1.5; g.stroke();
      g.restore();
    }
  }
  g.fillStyle = '#2a0003'; g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();    // the tight heart
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32); g.rotate(-0.7);
  const grad = g.createLinearGradient(-26, 0, 26, 0);
  grad.addColorStop(0, '#173d24'); grad.addColorStop(1, '#3f8a5a');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(-28, 0); g.quadraticCurveTo(0, -17, 28, 0); g.quadraticCurveTo(0, 17, -28, 0); g.fill();
  g.strokeStyle = 'rgba(160, 220, 170, 0.5)'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(-26, 0); g.lineTo(26, 0); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tunnelText(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d');                      // transparent: only the letters show
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 64;
  do { g.font = `400 ${size}px "Departure Mono", ui-monospace, monospace`; size -= 2; } while (g.measureText(text).width > 940 && size > 20);
  g.lineJoin = 'round';
  g.lineWidth = 12; g.strokeStyle = 'rgba(4, 14, 8, 0.92)';        // a dark rim: it must read against the light
  g.strokeText(text, 512, 66);
  g.fillStyle = '#fff6ea';
  g.fillText(text, 512, 66);
  return new THREE.CanvasTexture(c);
}

// the outline of one arch opening, for the glow at the far end
function archShape(half, postH) {
  const sh = new THREE.Shape();
  sh.moveTo(-half, 0); sh.lineTo(-half, postH);
  sh.absarc(0, postH, half, Math.PI, 0, true);
  sh.lineTo(half, 0); sh.lineTo(-half, 0);
  return sh;
}

const GLOW_VERT = /* glsl */`varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GLOW_FRAG = /* glsl */`
uniform float uK; varying vec2 vP;
void main(){
  float d = length((vP - vec2(0.0, 1.3)) / vec2(0.95, 1.6));
  gl_FragColor = vec4(vec3(1.0, 0.96, 0.88) * uK * (0.35 + 0.65 * smoothstep(1.1, 0.0, d)), 1.0);
}`;

export function buildRoseArch(text) {
  const g = new THREE.Group();
  const iron = new THREE.MeshBasicMaterial({ color: 0x151816, fog: true });
  const vine = new THREE.MeshBasicMaterial({ color: 0x1f4a2e, fog: true });
  const arches = [];
  const archPath = z => {                             // up one post, over, down the other
    const pts = [];
    for (let k = 0; k <= 10; k++) pts.push(new THREE.Vector3(-HALF, k / 10 * POST_H, z));
    for (let k = 1; k < 20; k++) { const a = Math.PI - k / 20 * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * HALF, POST_H + Math.sin(a) * HALF, z)); }
    for (let k = 10; k >= 0; k--) pts.push(new THREE.Vector3(HALF, k / 10 * POST_H, z));
    return new THREE.CatmullRomCurve3(pts);
  };
  const paths = [];
  for (let a = 0; a < ARCHES; a++) {
    const z = -a * GAP, ag = new THREE.Group();
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, POST_H, 8), iron); post.position.set(sx * HALF, POST_H / 2, z); ag.add(post); }
    const top = new THREE.Mesh(new THREE.TorusGeometry(HALF, 0.022, 6, 32, Math.PI), iron); top.position.set(0, POST_H, z); ag.add(top);
    const path = archPath(z); paths.push(path);
    const wind = [];
    for (let k = 0; k <= 160; k++) { const u = k / 160, p = path.getPointAt(u), w = u * 48 + a; wind.push(p.add(new THREE.Vector3(Math.cos(w) * 0.045, 0, Math.sin(w) * 0.045))); }
    ag.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wind), 260, 0.011, 5, false), vine));
    g.add(ag); arches.push(ag);
  }
  for (const [x, y] of [[-HALF, POST_H], [HALF, POST_H], [0, POST_H + HALF]]) {   // rails along the top
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, LENGTH, 6), iron);
    rail.rotation.x = Math.PI / 2; rail.position.set(x, y, -LENGTH / 2); g.add(rail);
  }

  // roses and leaves as sprites, spread along every arch and over the rails,
  // ordered to open from the entrance inward
  const roses = [], leaves = [];
  const jitter = (s) => (Math.random() - 0.5) * s;
  paths.forEach((path, a) => {
    for (let k = 0; k < 44; k++) {
      const u = Math.random(), p = path.getPointAt(u);
      roses.push([p.x + jitter(0.14), p.y + jitter(0.12), p.z + jitter(0.2), a]);
      const q = path.getPointAt(Math.random());
      leaves.push([q.x + jitter(0.2), q.y + jitter(0.16), q.z + jitter(0.26), a]);
    }
  });
  for (let k = 0; k < 150; k++) {                     // the roof between the arches
    const u = Math.random(), ang = Math.PI * Math.random(), z = -u * LENGTH;
    roses.push([Math.cos(ang) * HALF + jitter(0.1), POST_H + Math.sin(ang) * HALF + jitter(0.1), z, u * (ARCHES - 1)]);
    leaves.push([Math.cos(ang) * HALF + jitter(0.18), POST_H + Math.sin(ang) * HALF + jitter(0.14), z + jitter(0.2), u * (ARCHES - 1)]);
  }
  const cloud = (list, tex, size, tint) => {
    list.sort((a, b) => a[3] - b[3]);
    const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
    list.forEach(([x, y, z], i) => { pos.set([x, y, z], i * 3); const v = tint(); col.set(v, i * 3); });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setDrawRange(0, 0);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size, sizeAttenuation: true, vertexColors: true, alphaTest: 0.45, fog: true }));
    pts.frustumCulled = false;
    g.add(pts);
    return pts;
  };
  const leafPts = cloud(leaves, leafTexture(), 0.2, () => { const k = 0.7 + Math.random() * 0.5; return [k, k, k]; });
  const rosePts = cloud(roses, roseTexture(), 0.24, () => { const k = 0.75 + Math.random() * 0.45; return [k, k * (0.85 + Math.random() * 0.2), k]; });

  // light: the far arch glows in its own shape, and shafts pour back through the tunnel
  const glowU = { uK: { value: 0 } };
  const glow = new THREE.Mesh(new THREE.ShapeGeometry(archShape(HALF - 0.05, POST_H), 24),
    new THREE.ShaderMaterial({ uniforms: glowU, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.z = -LENGTH - 0.3; g.add(glow);
  // and beyond it a wall of light filling the corridor: the tunnel has no visible end
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.3),
    new THREE.ShaderMaterial({ uniforms: glowU, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG.replace('vec2(0.95, 1.6)', 'vec2(1.5, 2.2)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  haze.position.set(0, 1.65, -LENGTH - 0.9); haze.geometry.translate(0, -1.65 + 1.3, 0); g.add(haze);
  const rays = buildLightRays(LENGTH + 3.5, { nearW: HALF * 1.8, nearH: POST_H + 0.6, farW: 2.3, farH: 3.1, z0: -LENGTH - 0.25, gapK: 0 });
  g.add(rays.group);

  // the words, under the top of the entrance
  const words = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.21),
    new THREE.MeshBasicMaterial({ map: tunnelText(text), transparent: true, depthWrite: false, opacity: 0 }));
  words.position.set(0, 1.72, 0.05);                  // at eye level, inside the entrance
  g.add(words);

  arches.forEach(ag => ag.scale.set(1, 0.001, 1));
  let grow = 0;
  return {
    group: g,
    halfWidth: HALF - 0.1,
    length: LENGTH,
    update(dt, time) {
      grow = Math.min(1, grow + dt / 3.2);
      arches.forEach((ag, a) => {                     // the arches rise one after another
        const k = Math.max(0, Math.min(1, grow * 1.6 - a * 0.12));
        ag.scale.y = 0.001 + (1 - (1 - k) ** 3) * 0.999;
      });
      const bloom = Math.max(0, (grow - 0.2) / 0.8);
      rosePts.geometry.setDrawRange(0, Math.floor(rosePts.geometry.attributes.position.count * bloom));
      leafPts.geometry.setDrawRange(0, Math.floor(leafPts.geometry.attributes.position.count * Math.min(1, bloom * 1.3)));
      const k = Math.max(0, (grow - 0.35) / 0.65) * (0.85 + 0.15 * Math.sin(time * 1.7));
      rays.set(k, time); glowU.uK.value = 1.3 * k;
      words.material.opacity = Math.max(0, (grow - 0.7) / 0.3);
    },
    dispose() {
      g.traverse(o => { o.geometry?.dispose(); if (o.material && o.material !== vine && o.material !== iron) { o.material.map?.dispose(); o.material.dispose(); } });
      vine.dispose(); iron.dispose(); rays.dispose();
    },
  };
}

// Where the tunnel can stand: a couple of steps from the visitor along a
// corridor axis, on straight open floor wide and long enough for it, as close
// as possible to where they are already looking. Returns
// { x, z, dir: [dx, dz], yaw } for the entrance, or null.
// blocked(x, z): anything else in the way that is not a labyrinth wall
// (doors, furniture), supplied by the caller.
export function findArchSpot(px, pz, yaw, blocked = () => false) {
  const solid = (x, z) => solidAtGlobal(Math.floor(x / CELL), Math.floor(z / CELL)) || blocked(x, z);
  const open = (x, z) => !solid(x, z);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort((a, b) => (b[0] * fx + b[1] * fz) - (a[0] * fx + a[1] * fz));
  const sides = [0, 0.1, -0.1, 0.2, -0.2, 0.3, -0.3, 0.4, -0.4, 0.5, -0.5, 0.6, -0.6, 0.7, -0.7, 0.8, -0.8];
  const fits = (x, z, dx, dz, corridor) => {
    const lx = -dz, lz = dx;
    let walled = 0, n = 0;
    for (let s = 0; s <= LENGTH + 1.6; s += 0.4, n++) {        // the whole tunnel and a stretch beyond
      const cx = x + dx * s, cz = z + dz * s;
      if (!open(cx, cz) || solid(cx + lx * (HALF + 0.08), cz + lz * (HALF + 0.08)) || solid(cx - lx * (HALF + 0.08), cz - lz * (HALF + 0.08))) return false;
      if (solid(cx + lx * 1.4, cz + lz * 1.4) && solid(cx - lx * 1.4, cz - lz * 1.4)) walled++;
    }
    return !corridor || walled >= n * 0.85;          // a corridor: walls close on both sides nearly all the way
  };
  for (const corridor of [true, false]) {            // a corridor if there is one, open floor only if not
    for (const dist of corridor ? [2.4, 3.0, 2.0, 3.6, 4.4, 5.2, 6.0, 7.0, 8.0] : [2.4, 3.0, 2.0, 3.6]) {   // a corridor is worth a few more steps
      for (const [dx, dz] of dirs) {
        const lx = -dz, lz = dx;
        for (const side of sides) {
          const x = px + dx * dist + lx * side, z = pz + dz * dist + lz * side;
          if (!fits(x, z, dx, dz, corridor)) continue;
          let clear = true;
          for (let s = 0.4; clear && s < dist; s += 0.4) clear = open(px + dx * s + lx * side * s / dist, pz + dz * s + lz * side * s / dist);
          if (clear) return { x, z, dir: [dx, dz], yaw: Math.atan2(-dx, -dz) };
        }
      }
    }
  }
  return null;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
