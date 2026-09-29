import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';
import { GLTFLoader } from '../vendor/addons/GLTFLoader.js';
import { shape, ficusBuild, plantLook, plantRng } from './props.js';
import { CELL, solidAtGlobal } from './world.js';

// ── conspace-rooms · plants.js ──────────────────────────────────────────────
// DRAFTS of the plants each zone will get, behind ?plantdraft=fear|room|accept
// (nothing here is loaded otherwise):
//   fear    the pale ficus in a cubic concrete planter: cast grey, pebbles in
//           the skin, chipped arrises, a pour line, a damp dark foot
//   room    a lush glossy ficus in a majolica pot with a painted band and a
//           saucer, real MeshStandardMaterial so the room's lamp shines on it
//   accept  a huge monstera (assets/models/monstera.glb, CC0, Isa Lousberg via
//           Poly Pizza) in a pale rounded stone planter; the model's own pot
//           is cut away and the foliage is seated in ours
// Everything else is made in code: shapes from primitives, textures on canvas.

// small value noise, for roughness and stains
const hash3 = (x, y, z) => { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); };
function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// a texture the faked-light prop material reads raw (as ward.js does with its models)
function rawTex(canvas) { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; return t; }
function srgbTex(canvas) { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// noise added to every pixel of a rectangle: the grain of cement, sand, glaze
function grain(g, x, y, w, h, amt, rnd) {
  const img = g.getImageData(x, y, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.95;
  }
  g.putImageData(img, x, y);
}

// ── concrete ────────────────────────────────────────────────────────────────
const CELL_PX = 512;   // the atlas is 4 x 2 cells: 0-3 the four sides, 4 the rim, 5 inside wall, 6 soil
const PEBBLES = ['#b7ae9d', '#77746e', '#cfc9bd', '#8b7963', '#5c5d5e', '#a39b8c', '#9aa19c'];

// one pebble sitting in the cement: a dark halo, the stone, a lit cap
function pebble(g, x, y, r, col, rnd) {
  const sq = 0.65 + rnd() * 0.35, rot = rnd() * Math.PI;
  g.fillStyle = 'rgba(30,28,25,0.45)';
  g.beginPath(); g.ellipse(x + 0.6, y + 1.1, r + 1.2, r * sq + 1.2, rot, 0, 7); g.fill();
  g.fillStyle = col;
  g.beginPath(); g.ellipse(x, y, r, r * sq, rot, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath(); g.ellipse(x - r * 0.2, y - r * 0.25, r * 0.6, r * sq * 0.55, rot, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.ellipse(x + r * 0.35, y + r * sq * 0.4, r * 0.55, r * sq * 0.4, rot, 0, 7); g.fill();
}

function concreteCell(g, ox, oy, kind, seed) {
  const S = CELL_PX, rnd = plantRng(seed);
  g.save();
  g.beginPath(); g.rect(ox, oy, S, S); g.clip();
  g.translate(ox, oy);
  if (kind === 'soil') {
    g.fillStyle = '#2b2018'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 700; i++) {
      const a = 0.25 + rnd() * 0.5, r = 2 + rnd() * 9;
      g.fillStyle = `rgba(${70 + rnd() * 40 | 0},${52 + rnd() * 30 | 0},${36 + rnd() * 20 | 0},${a})`;
      g.beginPath(); g.ellipse(rnd() * S, rnd() * S, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7); g.fill();
    }
    for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(214,208,190,0.85)'; g.beginPath(); g.arc(rnd() * S, rnd() * S, 1.5 + rnd() * 2.5, 0, 7); g.fill(); }   // perlite
    g.restore();
    grain(g, ox, oy, S, S, 26, rnd);
    return;
  }
  const inner = kind === 'inner';
  g.fillStyle = inner ? '#5f5d59' : '#8f8d88'; g.fillRect(0, 0, S, S);
  // clouds of lighter and darker cement, where the mix was not quite the same
  for (let i = 0; i < 70; i++) {
    const r = 30 + rnd() * 90, dark = rnd() < 0.5;
    const gr = g.createRadialGradient(rnd() * S, rnd() * S, 0, 0, 0, 1);
    const x = rnd() * S, y = rnd() * S;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, dark ? 'rgba(40,40,40,0.13)' : 'rgba(235,232,224,0.12)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
    void gr;
  }
  g.restore();
  grain(g, ox, oy, S, S, 30, rnd);
  g.save();
  g.beginPath(); g.rect(ox, oy, S, S); g.clip();
  g.translate(ox, oy);
  // aggregate: pebbles of every size pressed into the skin
  const n = inner ? 60 : 210;
  for (let i = 0; i < n; i++) {
    const big = rnd() < 0.12;
    pebble(g, rnd() * S, rnd() * S, big ? 8 + rnd() * 7 : 2.2 + rnd() * 5.5, PEBBLES[Math.floor(rnd() * PEBBLES.length)], rnd);
  }
  // air pits from the pour
  for (let i = 0; i < 110; i++) {
    const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 2.6;
    g.fillStyle = 'rgba(28,27,26,0.75)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.fillStyle = 'rgba(230,226,216,0.35)'; g.beginPath(); g.arc(x + 0.5, y + r * 0.7, r * 0.55, 0, 7); g.fill();
  }
  if (kind === 'side') {
    // rain streaks running down from the top
    for (let i = 0; i < 16; i++) {
      const x = rnd() * S, w = 3 + rnd() * 14, len = 120 + rnd() * 300;
      const lg = g.createLinearGradient(0, 0, 0, len);
      lg.addColorStop(0, 'rgba(40,38,34,0.16)'); lg.addColorStop(1, 'rgba(40,38,34,0)');
      g.fillStyle = lg; g.fillRect(x, 0, w, len);
    }
    // the pour line: a joint where the second pour met the first, a lip of slurry above it
    const py = S * 0.34;
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, 0, S, py);                     // the upper pour, a shade paler
    g.fillStyle = 'rgba(20,19,18,0.7)'; g.fillRect(0, py, S, 3.5);
    g.fillStyle = 'rgba(224,221,212,0.32)'; g.fillRect(0, py - 3, S, 2.5);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, py + 3.5, S, 7);
    for (let x = 0; x < S; x += 4) {                                                       // a ragged edge to the joint
      const dy = (vnoise3(x * 0.07, seed, 0) - 0.5) * 5;
      g.fillStyle = 'rgba(30,29,27,0.45)'; g.fillRect(x, py + dy, 4, 2.5);
    }
    // form-tie holes, two rows, as after the shuttering came off
    for (const hx of [S * 0.27, S * 0.73]) {
      const hy = S * 0.66;
      g.fillStyle = 'rgba(24,23,22,0.9)'; g.beginPath(); g.arc(hx, hy, 9, 0, 7); g.fill();
      g.strokeStyle = 'rgba(224,221,212,0.4)'; g.lineWidth = 2; g.beginPath(); g.arc(hx, hy, 11, 0.2, 2.4); g.stroke();
      g.fillStyle = 'rgba(60,58,54,0.8)'; g.beginPath(); g.arc(hx - 1, hy - 1, 5, 0, 7); g.fill();
    }
    // the damp foot: darker, cooler, a tide line of salt above it
    for (let x = 0; x < S; x += 2) {
      const h = S * 0.19 + (vnoise3(x * 0.03, seed, 1) - 0.5) * S * 0.09 + (vnoise3(x * 0.2, seed, 2) - 0.5) * 8;
      const lg = g.createLinearGradient(0, S - h, 0, S);
      lg.addColorStop(0, 'rgba(24,30,28,0.35)'); lg.addColorStop(1, 'rgba(14,18,16,0.72)');
      g.fillStyle = lg; g.fillRect(x, S - h, 2, h);
      g.fillStyle = 'rgba(226,224,214,0.24)'; g.fillRect(x, S - h - 3, 2, 3);
    }
    g.fillStyle = 'rgba(40,64,40,0.10)'; g.fillRect(0, S * 0.9, S, S * 0.1);                   // a breath of algae at the very bottom
  }
  // chips: patches where the edge broke away and the coarse aggregate shows
  const chips = kind === 'side' ? 7 : 3;
  for (let i = 0; i < chips; i++) {
    const edge = Math.floor(rnd() * 4);
    const cx = edge === 0 ? rnd() * 26 : edge === 1 ? S - rnd() * 26 : rnd() * S;
    const cy = edge === 2 ? rnd() * 26 : edge === 3 ? S - rnd() * 26 : rnd() * S;
    const r = 14 + rnd() * 26, pts = [];
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2, rr = r * (0.55 + rnd() * 0.6); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
    g.fillStyle = '#5d5b57'; g.fill();
    g.strokeStyle = 'rgba(232,229,220,0.5)'; g.lineWidth = 2; g.stroke();
    g.save(); g.clip();
    for (let k = 0; k < 16; k++) pebble(g, cx + (rnd() - 0.5) * r * 1.6, cy + (rnd() - 0.5) * r * 1.6, 2 + rnd() * 4.5, PEBBLES[Math.floor(rnd() * PEBBLES.length)], rnd);
    g.restore();
    g.strokeStyle = 'rgba(20,19,18,0.5)'; g.lineWidth = 1.5; g.stroke();
  }
  g.restore();
}

function concreteAtlas() {
  const c = canvasOf(CELL_PX * 4, CELL_PX * 2), g = c.getContext('2d');
  const kinds = ['side', 'side', 'side', 'side', 'rim', 'inner', 'soil', 'rim'];
  kinds.forEach((k, i) => concreteCell(g, (i % 4) * CELL_PX, Math.floor(i / 4) * CELL_PX, k, 7100 + i * 31));
  return rawTex(c);
}

// A bilinear patch P00, P10, P01, P11 (u then v) into an atlas cell, with an
// optional displacement of each vertex. Indexed, smooth inside the patch.
function patch(cell, P, nu, nv, disp) {
  const pos = [], uv = [], idx = [];
  const [a, b, c, d] = P;
  const cx = (cell % 4) * 0.25, cy = Math.floor(cell / 4) * 0.5;
  const eps = 0.004;   // keep the samples off the neighbouring cell
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv;
    const p = new THREE.Vector3().copy(a).multiplyScalar((1 - u) * (1 - v)).addScaledVector(b, u * (1 - v)).addScaledVector(c, (1 - u) * v).addScaledVector(d, u * v);
    if (disp) disp(p);
    pos.push(p.x, p.y, p.z);
    uv.push(cx + eps + u * (0.25 - 2 * eps), 1 - (cy + 0.5) + eps + v * (0.5 - 2 * eps));   // v = 1 at the top of the cell
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const p = j * (nu + 1) + i, q = p + 1, r = p + nu + 1, s = r + 1;
    idx.push(p, q, r, q, s, r);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// The cube: a cast concrete box open at the top, a rim, an inside wall and a
// bed of soil, all in one indexed mesh. Roughness and chips are displacements
// of the skin along its own outward direction (a function of the position
// only, so the faces stay joined along the arrises).
function concreteGeo(S = 0.45, wall = 0.055) {
  const h = S / 2, H = S, hi = h - wall, eps = 1e-5;
  const chips = [   // centres on the arrises and corners: [x, y, z, radius, depth]
    [h, H, h, 0.085, 0.02], [-h, H, -0.06, 0.07, 0.014], [0.11, H, -h, 0.075, 0.012], [h, 0.06, -0.08, 0.06, 0.013],
    [-h, 0.0, h, 0.07, 0.012], [-0.1, 0.0, h, 0.06, 0.01], [h, 0.27, h, 0.05, 0.008], [-h, 0.31, -h, 0.05, 0.009],
  ];
  const disp = p => {
    let nx = Math.abs(p.x) > h - eps ? Math.sign(p.x) : 0, nz = Math.abs(p.z) > h - eps ? Math.sign(p.z) : 0, ny = p.y > H - eps ? 1 : 0;
    const inOpening = ny && Math.abs(p.x) < hi + eps && Math.abs(p.z) < hi + eps;
    if (inOpening) return;
    // the rim's inner edge and the inside wall stay put, so they meet cleanly
    if (ny && (Math.abs(p.x) < hi + eps || Math.abs(p.z) < hi + eps) && Math.max(Math.abs(p.x), Math.abs(p.z)) < hi + eps) return;
    const n = new THREE.Vector3(nx, ny, nz);
    if (n.lengthSq() === 0) return;
    n.normalize();
    let dpt = (vnoise3(p.x * 38, p.y * 38, p.z * 38) - 0.5) * 0.004 + (vnoise3(p.x * 11, p.y * 11, p.z * 11) - 0.5) * 0.004;
    for (const [cx, cy, cz, r, dep] of chips) {
      const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
      if (d < r) { const f = 1 - d / r; dpt -= dep * f * (2 - f) * (0.75 + 0.25 * vnoise3(p.x * 60, p.y * 60, p.z * 60)); }
    }
    p.addScaledVector(n, dpt);
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const parts = [];
  // four outer sides: cells 0-3
  const sides = [[-h, h], [h, h], [h, -h], [-h, -h]];   // going round: south-west corner start
  for (let k = 0; k < 4; k++) {
    const [x0, z0] = sides[k], [x1, z1] = sides[(k + 1) % 4];
    parts.push(patch(k, [V(x0, 0, z0), V(x1, 0, z1), V(x0, H, z0), V(x1, H, z1)], 12, 12, disp));
  }
  // rim: outer square to the opening
  for (let k = 0; k < 4; k++) {
    const [x0, z0] = sides[k], [x1, z1] = sides[(k + 1) % 4];
    const s0 = V(Math.sign(x0) * hi, H, Math.sign(z0) * hi), s1 = V(Math.sign(x1) * hi, H, Math.sign(z1) * hi);
    parts.push(patch(4, [V(x0, H, z0), V(x1, H, z1), s0, s1], 12, 2, disp));
  }
  // inside wall, down to the soil
  const soilY = H - 0.055;
  for (let k = 0; k < 4; k++) {
    const [x0, z0] = sides[k], [x1, z1] = sides[(k + 1) % 4];
    const a = V(Math.sign(x0) * hi, H, Math.sign(z0) * hi), b = V(Math.sign(x1) * hi, H, Math.sign(z1) * hi);
    parts.push(patch(5, [a, b, V(a.x, soilY, a.z), V(b.x, soilY, b.z)], 6, 1, null));
  }
  // soil, a little heaped and lumpy
  parts.push(patch(6, [V(-hi, soilY, -hi), V(hi, soilY, -hi), V(-hi, soilY, hi), V(hi, soilY, hi)], 8, 8, p => {
    const edge = Math.max(Math.abs(p.x), Math.abs(p.z)) / hi;
    p.y += (vnoise3(p.x * 14, 3, p.z * 14) - 0.4) * 0.014 * (1 - edge * edge * 0.6) - (edge > 0.95 ? 0.004 : 0);
  }));
  const g = mergeGeometries(parts);
  for (const q of parts) q.dispose();
  return g;
}

// The concrete cube planter, 0.45 m, standing on y = 0. Faked-light material,
// so it is lit by the zone (fixtures, flicker) like everything in the corridors.
export function buildConcreteCube(atmo) {
  const geo = concreteGeo();
  const mesh = new THREE.Mesh(geo, atmo.prop({ map: concreteAtlas(), rust: 0.12 }));
  mesh.userData.soilY = 0.45 - 0.055;
  return mesh;
}

// ── plants ──────────────────────────────────────────────────────────────────
// Puts a ficus builder's parts through a transform, so several stems can grow
// from one pot: put is shape()'s, m the plant's own frame in the pot.
function through(put, T) {
  const I = new THREE.Matrix4();
  return (geo, hex, gloss, m, paint) => put(geo, hex, gloss, new THREE.Matrix4().multiplyMatrices(T, m || I), paint);
}
const STEM_FOOT = 0.27;   // where ficusBuild's stem leaves the (skipped) pot

// The pale ficus, look 3 of #37: green at the base, fading to the light at the
// top. Vertex colours (rgb + gloss) for the faked-light material. soilY: the
// planter's soil, where the stem goes in.
export function palePlant(atmo, soilY = 0.4) {
  const geo = shape(put => ficusBuild(through(put, new THREE.Matrix4().makeTranslation(0, soilY - STEM_FOOT - 0.02, 0)), plantLook(3), { pot: false, aside: false }));
  const mesh = new THREE.Mesh(geo, atmo.prop({ vertexColors: true, rust: 0.15 }));
  return mesh;
}

// shape() paints "linear" values that are really sRGB numbers, for the faked
// shader. A standard material needs true linear colour and no alpha channel.
function forStandard(geo) {
  const c = geo.attributes.color, col = new THREE.Color(), out = new Float32Array(c.count * 3);
  for (let i = 0; i < c.count; i++) { col.setRGB(c.getX(i), c.getY(i), c.getZ(i), THREE.SRGBColorSpace); out[i * 3] = col.r; out[i * 3 + 1] = col.g; out[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}

// A lush living ficus: three stems from one root, leaves bigger and denser,
// deep green with a spread of tones, glossy standard material.
export function livingPlant(soilY = 0.36) {
  const look = { leaf: 0x2c6a32, rib: 0xa6c47a, stem: 0x4e5c30, pot: 0, soil: 0, gloss: 1, fade: false };
  const geo = shape(put => {
    const stems = [
      { n: 12, seed: 4711, size: 1.12, x: 0, z: 0, tilt: [0, 0], s: 1 },
      { n: 10, seed: 88, size: 1.08, x: 0.07, z: -0.05, tilt: [0.16, -0.28], s: 0.9 },
      { n: 9, seed: 9021, size: 1.0, x: -0.07, z: 0.06, tilt: [-0.2, 0.22], s: 0.78 },
    ];
    for (const st of stems) {
      const T = new THREE.Matrix4().compose(new THREE.Vector3(st.x, soilY - STEM_FOOT * st.s - 0.02, st.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(st.tilt[0], st.seed, st.tilt[1], 'YXZ')), new THREE.Vector3(st.s, st.s, st.s));
      // the turn about y is around the stem itself; tilt then lean, so build in a frame whose origin is the foot
      const foot = new THREE.Matrix4().makeTranslation(0, STEM_FOOT, 0), back = new THREE.Matrix4().makeTranslation(0, -STEM_FOOT, 0);
      ficusBuild(through(put, new THREE.Matrix4().multiplyMatrices(T, new THREE.Matrix4().multiplyMatrices(foot, back).clone())), look, { pot: false, aside: false, n: st.n, seed: st.seed, size: st.size, spread: 0.07 });
    }
  });
  forStandard(geo);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  return mesh;
}

// ── the majolica pot ────────────────────────────────────────────────────────
function majolicaTexture() {
  const W = 1024, H = 512, c = canvasOf(W, H), g = c.getContext('2d'), rnd = plantRng(1961);
  const Y = v => H * (1 - v);
  const COBALT = '#1d3f8f', COBALT_D = '#152d6a', OCHRE = '#d19a2e', IVORY = '#f3ecdc';
  g.fillStyle = IVORY; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, 'rgba(120,100,60,0.14)'); gr.addColorStop(0.3, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const band = (v0, v1, col, wave = 0, n = 16) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, Y(v0));
    for (let x = 0; x <= W; x += 4) g.lineTo(x, Y(v0) + Math.sin(x / W * Math.PI * 2 * n) * wave);
    g.lineTo(W, Y(v1));
    for (let x = W; x >= 0; x -= 4) g.lineTo(x, Y(v1) + Math.sin(x / W * Math.PI * 2 * n) * wave);
    g.closePath(); g.fill();
  };
  // the painted band round the belly: cobalt ground, scalloped edges
  band(0.34, 0.74, COBALT, 5, 24);
  band(0.325, 0.335, OCHRE); band(0.745, 0.755, OCHRE); band(0.78, 0.787, COBALT);
  // foot and rim
  band(0.055, 0.1, COBALT); band(0.11, 0.118, OCHRE); band(0.925, 1.0, COBALT); band(0.9, 0.912, OCHRE);
  // motifs, eight round: a white flower on a stem with two leaves, dots between
  const N = 8;
  for (let k = 0; k < N; k++) {
    const cx = (k + 0.5) * W / N + (rnd() - 0.5) * 6, cy = Y(0.54) + (rnd() - 0.5) * 4;
    g.save(); g.translate(cx, cy);
    g.fillStyle = IVORY;
    for (const s of [-1, 1]) {                                                  // leaves
      g.save(); g.rotate(s * 0.9); g.beginPath(); g.ellipse(0, 46, 11, 34, 0, 0, 7); g.fill(); g.restore();
    }
    g.fillStyle = OCHRE; g.fillRect(-2, 10, 4, 60);
    for (let p = 0; p < 6; p++) {                                               // petals
      g.save(); g.rotate(p / 6 * Math.PI * 2); g.fillStyle = IVORY; g.beginPath(); g.ellipse(0, -20, 8.5, 20, 0, 0, 7); g.fill();
      g.strokeStyle = COBALT_D; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -8); g.lineTo(0, -34); g.stroke(); g.restore();
    }
    g.fillStyle = OCHRE; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
    g.fillStyle = COBALT_D; g.beginPath(); g.arc(0, 0, 3.5, 0, 7); g.fill();
    g.restore();
    // dots and a small sprig between two flowers
    const bx = (k + 1) * W / N;
    g.fillStyle = OCHRE;
    for (let d = -2; d <= 2; d++) { g.beginPath(); g.arc(bx, Y(0.54) + d * 30, 5.5, 0, 7); g.fill(); }
    g.fillStyle = IVORY;
    for (const s of [-1, 1]) for (let d = -1; d <= 1; d += 2) { g.beginPath(); g.ellipse(bx + s * 14, Y(0.54) + d * 44, 4, 9, s * 0.6, 0, 7); g.fill(); }
  }
  // a row of ochre dots on the rim band
  g.fillStyle = OCHRE; for (let x = 8; x < W; x += 22) { g.beginPath(); g.arc(x, Y(0.962), 4, 0, 7); g.fill(); }
  // craquelure: fine hairlines in the glaze, and a few brush hairs
  g.strokeStyle = 'rgba(70,50,20,0.10)'; g.lineWidth = 0.8;
  for (let i = 0; i < 160; i++) {
    let x = rnd() * W, y = rnd() * H; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const x = rnd() * W, y = Y(0.34 + rnd() * 0.4); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + rnd() * 50, y + (rnd() - 0.5) * 3); g.stroke(); }
  return srgbTex(c);
}

// a smooth lathe through points: profile [r, y] pairs, spline-sampled
function smoothLathe(pts, samples, seg, H) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  const g = new THREE.LatheGeometry(curve.getPoints(samples), seg);
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setY(i, Math.min(1, Math.max(0, pos.getY(i) / H)));   // v = height, so a band stays level
  return g;
}

// The pot: glazed ivory belly with a painted cobalt band, ochre lines, foot
// ring, a lip, and a matching saucer. y = 0 is the saucer's floor. Standard
// physical material with a clear coat: it takes the room's lamp as a hard spark.
export function buildCeramicPot() {
  const group = new THREE.Group();
  const H = 0.42, tex = majolicaTexture();
  const glaze = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide });
  const oy = 0.03;                       // the pot stands on the saucer's floor
  const body = smoothLathe([[0.001, 0], [0.11, 0], [0.135, 0.008], [0.14, 0.022], [0.17, 0.07], [0.215, 0.14], [0.238, 0.22], [0.238, 0.29],
    [0.215, 0.35], [0.188, 0.385], [0.195, 0.41], [0.208, 0.42], [0.196, 0.424], [0.176, 0.4], [0.17, 0.37]], 20, 28, H);
  body.translate(0, oy, 0);
  group.add(new THREE.Mesh(body, glaze));
  // saucer: a shallow dish, glazed the same, painted with one cobalt ring
  const sc = canvasOf(256, 64), sg = sc.getContext('2d');
  sg.fillStyle = '#f3ecdc'; sg.fillRect(0, 0, 256, 64);
  sg.fillStyle = '#1d3f8f'; sg.fillRect(0, 34, 256, 16); sg.fillStyle = '#d19a2e'; sg.fillRect(0, 30, 256, 3); sg.fillRect(0, 51, 256, 3);
  const sTex = srgbTex(sc);
  const saucer = smoothLathe([[0.001, 0], [0.16, 0], [0.19, 0.006], [0.26, 0.02], [0.285, 0.04], [0.29, 0.044], [0.28, 0.038], [0.25, 0.018], [0.001, 0.014]], 8, 28, 0.045);
  group.add(new THREE.Mesh(saucer, new THREE.MeshPhysicalMaterial({ map: sTex, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide })));
  // soil
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.176, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b1f16, roughness: 1 }));
  soil.position.y = oy + 0.38;
  group.add(soil);
  group.userData.soilY = oy + 0.38;
  return group;
}

// ── the pale stone planter ──────────────────────────────────────────────────
function stoneTexture() {
  const c = canvasOf(512, 512), g = c.getContext('2d'), rnd = plantRng(2626);
  g.fillStyle = '#e6e2d6'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {                                   // soft horizontal veining, as in travertine
    const y = rnd() * 512, h = 4 + rnd() * 24;
    g.fillStyle = rnd() < 0.5 ? 'rgba(190,180,158,0.12)' : 'rgba(255,255,250,0.14)'; g.fillRect(0, y, 512, h);
  }
  for (let i = 0; i < 260; i++) {                                  // pores and flecks
    const r = 0.8 + rnd() * 2.6, x = rnd() * 512, y = rnd() * 512;
    g.fillStyle = rnd() < 0.7 ? 'rgba(150,140,118,0.5)' : 'rgba(255,255,255,0.5)';
    g.beginPath(); g.ellipse(x, y, r * 1.6, r, 0, 0, 7); g.fill();
  }
  grain(g, 0, 0, 512, 512, 12, rnd);
  return rawTex(c);
}

// The planter: an egg cut open, a soft shoulder, a thick rounded lip. y = 0 is the floor.
export function buildRoundPlanter(atmo) {
  const H = 0.56;
  const geo = smoothLathe([[0.001, 0], [0.16, 0], [0.24, 0.02], [0.33, 0.1], [0.39, 0.21], [0.4, 0.3], [0.375, 0.4], [0.335, 0.49],
    [0.315, 0.54], [0.322, 0.565], [0.305, 0.575], [0.285, 0.56], [0.29, 0.5], [0.3, 0.46]], 20, 32, H);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.5, uv.getY(i) * 1.6);
  const mesh = new THREE.Mesh(geo, atmo.prop({ map: (() => { const t = stoneTexture(); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })(), rust: 0 }));
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24).rotateX(-Math.PI / 2), atmo.prop({ color: 0x2c2018, rust: 0 }));
  soil.position.y = 0.475;
  const group = new THREE.Group();
  group.add(mesh, soil);
  group.userData.soilY = 0.475;
  return group;
}

// ── the CC0 monstera ────────────────────────────────────────────────────────
const MONSTERA_POT_TOP = 1.0;   // native units: the model's own pot ends at y = 1.0, foliage stems rise out of it
// Monstera Plant (Poly Pizza), Isa Lousberg, CC0. `soilY`: our planter's soil,
// `scale`: 0.68 makes the whole plant about 2.3 m with the planter under it.
export async function loadMonstera(atmo, { soilY = 0.475, scale = 0.68 } = {}) {
  const gltf = await new GLTFLoader().loadAsync('assets/models/monstera.glb');
  gltf.scene.updateMatrixWorld(true);
  let src = null;
  gltf.scene.traverse(o => { if (!src && o.isMesh) src = o; });
  const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
  for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
  // keep only what stands above the pot's rim: drop triangles that lie below it
  const p = geo.attributes.position, ix = geo.index, keep = [];
  const cut = MONSTERA_POT_TOP + 0.02;
  for (let t = 0; t < ix.count; t += 3) {
    const a = ix.getX(t), b = ix.getX(t + 1), c = ix.getX(t + 2);
    if ((p.getY(a) + p.getY(b) + p.getY(c)) / 3 >= cut) keep.push(a, b, c);
  }
  geo.setIndex(keep);
  // seat the stems at the soil, scaled; centred on the pot's own axis
  geo.translate(0, -MONSTERA_POT_TOP, 0);
  geo.scale(scale, scale, scale);
  geo.translate(0, soilY, 0);
  const map = src.material.map;
  if (map) { map.colorSpace = THREE.NoColorSpace; map.needsUpdate = true; }
  // the palette's greens, gently lifted toward the light, no grime
  const mesh = new THREE.Mesh(geo, atmo.prop({ map, color: 0xf2f6e6, rust: 0 }));
  return mesh;
}

// ── the draft hook ──────────────────────────────────────────────────────────
// distance from a point to the nearest wall cell, out to `max` metres
function clearance(x, z, max) {
  const gi = Math.floor(x / CELL), gj = Math.floor(z / CELL), n = Math.ceil(max / CELL);
  let best = max;
  for (let j = gj - n; j <= gj + n; j++) for (let i = gi - n; i <= gi + n; i++) {
    if (!solidAtGlobal(i, j)) continue;
    const dx = Math.max(i * CELL - x, 0, x - (i + 1) * CELL), dz = Math.max(j * CELL - z, 0, z - (j + 1) * CELL);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}
function lineClear(x0, z0, x1, z1) {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.2);
  for (let k = 0; k <= n; k++) { const t = k / n; if (solidAtGlobal(Math.floor((x0 + (x1 - x0) * t) / CELL), Math.floor((z0 + (z1 - z0) * t) / CELL))) return false; }
  return true;
}

// Builds the draft plant of a zone, stands it on the floor 2.2 m ahead of the
// visitor, clear of the walls (if the spawn has no room, at the nearest open
// place, with the visitor moved to face it), and lights it.
export async function placePlantDraft(kind, { scene, player, atmo }) {
  const R = kind === 'accept' ? 1.2 : 0.7;               // how much clear floor the plant wants around it
  const sx = player.pos.x, sz = player.pos.y;
  // the nearest spot with room, on a 0.3 m grid; the visitor stands 2.2 m off on a clear line
  let best = null;
  for (let r = 0; r < 40 && !best; r += 0.3) {
    for (let a = 0; a < 24; a++) {
      const th = a / 24 * Math.PI * 2, x = sx + Math.cos(th) * r, z = sz + Math.sin(th) * r;
      if (clearance(x, z, R + 0.1) < R + 0.05) continue;
      for (let b = 0; b < 16; b++) {
        const ph = b / 16 * Math.PI * 2, vx = x + Math.cos(ph) * 2.2, vz = z + Math.sin(ph) * 2.2;
        if (clearance(vx, vz, 0.4) < 0.35 || !lineClear(vx, vz, x, z)) continue;
        best = { x, z, vx, vz }; break;
      }
      if (best) break;
    }
  }
  if (!best) best = { x: sx, z: sz - 2.2, vx: sx, vz: sz };
  const group = new THREE.Group();
  group.position.set(best.x, 0, best.z);
  group.rotation.y = 0.6;
  let tris = 0;
  const add = o => { group.add(o); o.traverse(m => { if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); };
  if (kind === 'fear') {
    const cube = buildConcreteCube(atmo);
    add(cube); add(palePlant(atmo, cube.userData.soilY));
  } else if (kind === 'room') {
    const pot = buildCeramicPot();
    add(pot); add(livingPlant(pot.userData.soilY));
    // the room's lamp and its green fill, only for the draft, so the gloss has something to catch
    const dx = best.vx - best.x, dz = best.vz - best.z, l = Math.hypot(dx, dz) || 1;
    const lamp = new THREE.PointLight(0xffb468, 5.5, 7, 2);
    lamp.position.set(best.x + dx / l * 0.5 - dz / l * 0.9, 1.75, best.z + dz / l * 0.5 + dx / l * 0.9);
    scene.add(lamp, new THREE.HemisphereLight(0x2d5a3c, 0x240808, 0.55));
  } else {
    const planter = buildRoundPlanter(atmo);
    add(planter);
    add(await loadMonstera(atmo, { soilY: planter.userData.soilY }));
  }
  scene.add(group);
  player.pos.set(best.vx, best.vz);
  player.yaw = Math.atan2(best.vx - best.x, best.vz - best.z);   // the camera faces -Z at yaw 0, toward the plant
  player.pitch = -0.08;
  window.__plantDraft = { kind, tris, at: [best.x, best.z], group };
  return group;
}

// Je suis le spectre d'une rose que tu portais hier au bal. (Gautier)
