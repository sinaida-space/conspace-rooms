import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';
import { plantRng } from './props.js';
import { leafEnvironment } from './plants.js';

// ── conspace-rooms · tropics.js ─────────────────────────────────────────────
// The light zone's other plants, beside the monstera (plants.js), one to a
// place: a strelitzia (a fan of paddles, torn along the veins), an alocasia
// (dark arrow leaves with pale raised veins), a fiddle-leaf fig (a slim trunk,
// broad wavy leaves) and a calathea (a low bush, silver stripes). All made in
// code, in the monstera's manner: a waxy physical skin drawn on canvas (colour
// plus a height map turned normal map), each in its own shade of green;
// blades bent from a grid, each on its own stalk, a blade that would touch
// one already placed is tried again elsewhere.

export const TROPICS = ['strelitzia', 'alocasia', 'fiddle', 'calathea'];

const S = 1024;   // skin size
const hex = (h, a = 1) => { const c = new THREE.Color(h); return `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},${a})`; };

// what sets the species apart: skin, blade, habit
const SPECIES = {
  strelitzia: {
    skin: { seed: 3141, base: ['#2c5a47', '#32644f', '#3b7258'], vein: 'rgba(150,185,150,0.25)', veinHi: 'rgba(200,220,190,0.18)', veins: 34, rise: 0.05, veinW: 2.2, sunk: true,
      rib: 'rgba(205,210,150,0.75)', ribW: 26, stalk: '#58704a', tears: 11, rough: 0.5, coat: 0.45 },
    blade: { hw: t => 0.15 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.55), cup: 0.9, fold: 0.08, droop: 0.05, nu: 10, nv: 24 },
    count: 10, stalkR: [0.017, 0.01],
  },
  alocasia: {
    skin: { seed: 2718, base: ['#132a19', '#17311e', '#1d3b24'], vein: 'rgba(214,232,204,0.85)', veinHi: 'rgba(245,250,240,0.5)', veins: 6, rise: 0.2, veinW: 9, sunk: false,
      rib: 'rgba(220,236,210,0.9)', ribW: 20, rim: 'rgba(205,225,195,0.55)', stalk: '#3e5a3a', rough: 0.35, coat: 0.8 },
    blade: { hw: t => 0.33 * Math.pow(1 - t, 0.8) * (0.72 + 0.28 * Math.sin(Math.PI * t)), lobe: 0.22, cup: 0.55, fold: 0.05, droop: 0.12, wave: 0.02, waves: 5, nu: 12, nv: 22 },
    count: 6, stalkR: [0.02, 0.011],
  },
  fiddle: {
    skin: { seed: 1618, base: ['#356f2c', '#3d7c33', '#4a8c3b'], vein: 'rgba(175,205,115,0.5)', veinHi: 'rgba(215,235,160,0.3)', veins: 9, rise: 0.16, veinW: 5, sunk: true,
      rib: 'rgba(200,215,130,0.7)', ribW: 16, stalk: '#5a6e38', bark: '#6b5a48', rough: 0.3, coat: 0.85 },
    blade: { hw: t => 0.4 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 1.5) * 0.93 + 0.035)), 0.55) * (1 - 0.12 * Math.exp(-(((t - 0.42) / 0.1) ** 2))), cup: 0.4, fold: 0.03, droop: 0.08, wave: 0.035, waves: 3.5, nu: 12, nv: 18 },
    count: 15, stalkR: [0.007, 0.006],
  },
  calathea: {
    skin: { seed: 5772, base: ['#355f35', '#3b6a3b', '#437641'], vein: 'rgba(40,80,40,0.35)', veinHi: 'rgba(40,80,40,0)', veins: 16, rise: 0.13, veinW: 3, sunk: true,
      stripe: 'rgba(200,222,190,0.5)', rib: 'rgba(190,210,170,0.6)', ribW: 12, stalk: '#5c6e46', rough: 0.55, coat: 0.3 },
    blade: { hw: t => 0.31 * Math.pow(Math.sin(Math.PI * t), 0.7), cup: 0.35, fold: 0.03, droop: 0.05, wave: 0.015, waves: 6, nu: 12, nv: 16 },
    count: 13, stalkR: [0.007, 0.004], planter: 0.78,
  },
};

// the curve of a lateral vein from the midrib out to the margin, as points (canvas px)
function veinPath(side, y0, rise) {
  const P = [[S / 2, y0], [S / 2 + side * S * 0.08, y0 - S * rise * 0.4], [S / 2 + side * S * 0.3, y0 - S * rise * 0.85], [S / 2 + side * S * 0.54, y0 - S * rise]];
  return t => { const u = 1 - t; const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]; return [0, 1].map(c => w.reduce((a, k, i) => a + k * P[i][c], 0)); };
}
function strokePath(ctx, f, a, b, colr, w) {
  ctx.strokeStyle = colr; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k <= 24; k++) { const [x, y] = f(a + (b - a) * k / 24); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
}

// The skin, as the monstera's (plants.js): u across (0.5 the midrib), v from
// the stalk (0) to the tip (1); the corner u, v < 0.04 is stalk, u > 0.96,
// v < 0.04 bark. Veins sunk or raised in the height map; a strelitzia also
// gets an alpha map: its tears, running in from the margin along the veins.
function skinOf(sp) {
  const K = sp.skin, rnd = plantRng(K.seed);
  const canvas = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const col = canvas(), g = col.getContext('2d'), hgt = canvas(), h = hgt.getContext('2d');
  const base = g.createLinearGradient(0, S, 0, 0);
  base.addColorStop(0, K.base[0]); base.addColorStop(0.6, K.base[1]); base.addColorStop(1, K.base[2]);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
  for (let k = 0; k < 90; k++) {                                   // mottle
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 70, dark = rnd() < 0.5;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, dark ? 'rgba(8,24,12,0.18)' : 'rgba(80,130,70,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const step = 0.86 / K.veins;
  for (let k = 0; k < K.veins; k++) {
    const y0 = S * (0.93 - k * step) + (rnd() - 0.5) * S * step * 0.25;
    for (const side of [-1, 1]) {
      const f = veinPath(side, y0, K.rise);
      if (K.stripe) {                                              // calathea: a silver feather between the veins
        const fm = veinPath(side, y0 - S * step * 0.5, K.rise);
        strokePath(g, fm, 0.08, 0.86, K.stripe, S * step * 0.32);
      }
      strokePath(g, f, 0, 1, K.vein, K.veinW);
      strokePath(g, f, 0, 1, K.veinHi, K.veinW * 0.3);
      strokePath(h, f, 0, 1, K.sunk ? '#5a5a5a' : '#b4b4b4', K.veinW * 1.1);
    }
  }
  for (let y = 0; y < S; y += 2) {                                 // the midrib, widest at the stalk
    const w = K.ribW * (0.3 + 0.7 * (y / S));
    g.fillStyle = K.rib; g.fillRect(S / 2 - w / 2, y, w, 2);
    h.fillStyle = '#b0b0b0'; h.fillRect(S / 2 - w / 2, y, w, 2);
  }
  if (K.rim) for (const x0 of [0, S]) {                            // a pale line along the margin
    const gr = g.createLinearGradient(x0, 0, S / 2, 0);
    gr.addColorStop(0, K.rim); gr.addColorStop(0.035, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const img = g.getImageData(0, 0, S, S), d = img.data;          // grain
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  g.fillStyle = K.stalk; g.fillRect(0, S - 40, 40, 40);
  if (K.bark) { g.fillStyle = K.bark; g.fillRect(S - 40, S - 40, 40, 40); }
  h.fillStyle = '#808080'; h.fillRect(0, S - 40, 40, 40); h.fillRect(S - 40, S - 40, 40, 40);
  // height to normal (Sobel)
  const hd = h.getImageData(0, 0, S, S).data, nrm = canvas(), ng = nrm.getContext('2d'), out = ng.createImageData(S, S), k = 2.2;
  const H = (x, y) => hd[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y + 1) - H(x, y - 1)) * k;
    const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  ng.putImageData(out, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t; };
  let alpha = null;
  if (K.tears) {                                                   // strelitzia: torn in from the margin, along a vein
    const a = canvas(), ag = a.getContext('2d');
    ag.fillStyle = '#fff'; ag.fillRect(0, 0, S, S);
    for (let k = 0; k < K.tears; k++) {
      const y0 = S * (0.3 + rnd() * 0.6), side = rnd() < 0.5 ? -1 : 1;
      strokePath(ag, veinPath(side, y0, K.rise), 0.35 + rnd() * 0.4, 1, '#000', 3.5);
    }
    alpha = tex(a, false);
  }
  return { map: tex(col, true), normal: tex(nrm, false), alpha };
}

// One blade on a grid, unit length: s across (-1..1), t from the stalk (0) to
// the tip (1). x across, y the face, z along. Cupped, folded on the midrib,
// drooping, wavy at the margin; `lobe` pulls the base corners back past the
// stalk (the alocasia's arrow), the stalk meeting the blade in the sinus.
function bladeGeo(B, rnd) {
  const { nu, nv, cup, fold = 0, droop, wave = 0, waves = 4, lobe = 0 } = B;
  const sc = 0.92 + rnd() * 0.16, dr = droop * (0.7 + rnd() * 0.6), ph = rnd() * 6;
  const hw = t => B.hw(t) * sc;
  let wMax = 0;
  for (let j = 0; j <= nv; j++) wMax = Math.max(wMax, hw(j / nv));
  const P = [], z0 = -lobe, z1 = 1;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const t = j / nv, s = i / nu * 2 - 1, w = hw(t), x = s * w;
    const z = t - lobe * Math.pow(Math.abs(s), 1.3) * (1 - t) * (1 - t);
    const y = cup * x * x + fold * Math.abs(x) - dr * t * t + wave * w * s * s * Math.sin(waves * Math.PI * t + ph * Math.sign(s));
    P.push(x, y, z);
  }
  const uv = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const n = (j * (nu + 1) + i) * 3;
    uv.push(0.5 + P[n] / (2 * wMax) * 0.96, (P[n + 2] - z0) / (z1 - z0));
  }
  const idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// a stalk (or a trunk): r0 at the soil tapering to r1, painted from the skin's corner at uv
function tube(curve, r0, r1, uv = 0.02, seg = 24) {
  const t = new THREE.TubeGeometry(curve, seg, 1, 6, false);
  const q = t.attributes.position, pts = curve.getSpacedPoints(seg);
  for (let i = 0; i < q.count; i++) {
    const ring = Math.floor(i / 7), c = pts[Math.min(ring, seg)], r = r0 + (r1 - r0) * ring / seg;
    q.setXYZ(i, c.x + (q.getX(i) - c.x) * r, c.y + (q.getY(i) - c.y) * r, c.z + (q.getZ(i) - c.z) * r);
  }
  t.computeVertexNormals();
  t.deleteAttribute('uv');
  const u = new Float32Array(q.count * 2);
  for (let i = 0; i < q.count; i++) { u[i * 2] = uv; u[i * 2 + 1] = 0.02; }
  t.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  t.setAttribute('color', new THREE.BufferAttribute(new Float32Array(q.count * 3).fill(1), 3));
  return t;
}

const near = (A, B, d) => { const d2 = d * d; for (const x of A) for (const y of B) if (x.distanceToSquared(y) < d2) return true; return false; };
const pointsOf = g => { const p = g.attributes.position, out = []; for (let i = 0; i < p.count; i += 2) out.push(new THREE.Vector3().fromBufferAttribute(p, i)); return out; };

// Where each leaf goes, per species: { B the blade's base, T its direction,
// size, stalk: [p0, p1] (the start and first handle of its stalk) }. f: 0 the
// oldest, lowest leaf, 1 the newest. az(): round the stem, or within
// `sector` of +z in a corner.
const POSE = {
  strelitzia(f, k, rnd, az, soilY, env) {
    // a fan: leaves alternate to either side of one plane
    const a = env.sector >= Math.PI ? env.fan + (k % 2 ? Math.PI : 0) + (rnd() - 0.5) * 0.45 : az();
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const h = soilY + 0.55 + f * 0.75 + (rnd() - 0.5) * 0.1, reach = 0.1 + (1 - f) * 0.24;
    const theta = 1.3 - (1 - f) * 0.6 + (rnd() - 0.5) * 0.15;
    const p0 = new THREE.Vector3(out.x * 0.03, soilY - 0.02, out.z * 0.03);
    return { out, B: new THREE.Vector3(out.x * reach, h, out.z * reach), theta, size: 0.6 + (1 - f) * 0.22, p0, lift: 0.75 };
  },
  alocasia(f, k, rnd, az, soilY, env) {
    const a = az(), out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const h = soilY + 0.8 + f * 0.45 + (rnd() - 0.5) * 0.1, reach = 0.32 - f * 0.16 + rnd() * 0.06;
    const theta = k === env.count - 1 ? 0.85 : -0.6 + f * 0.55 + (rnd() - 0.5) * 0.2;   // tips down and out, the newest still up
    const p0 = new THREE.Vector3(out.x * 0.05, soilY - 0.02, out.z * 0.05);
    return { out, B: new THREE.Vector3(out.x * reach, h, out.z * reach), theta, size: 0.6 - f * 0.12, p0, lift: 0.7 };
  },
  fiddle(f, k, rnd, az, soilY, env) {
    // leaves spiral up the trunk on short stalks, the lowest nearly level, the top ones rising
    const a = az(), out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const Q = env.trunk.getPoint(0.3 + f * 0.7);
    const theta = k === env.count - 1 ? 1.2 : 0.45 + f * 0.55 + (rnd() - 0.5) * 0.3;   // the face turned out to the room, not up
    return { out, B: Q.clone().addScaledVector(out, 0.07).add(new THREE.Vector3(0, 0.03, 0)), theta, size: 0.48 - f * 0.12 + rnd() * 0.05, p0: Q, lift: 0.2, short: true };
  },
  calathea(f, k, rnd, az, soilY) {
    const a = az(), out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const h = soilY + 0.2 + f * 0.35 + rnd() * 0.06, reach = 0.08 + (1 - f) * 0.22;
    const theta = 0.95 - (1 - f) * 0.6 + (rnd() - 0.5) * 0.2;
    const p0 = new THREE.Vector3(out.x * 0.03, soilY - 0.02, out.z * 0.03);
    return { out, B: new THREE.Vector3(out.x * reach, h, out.z * reach), theta, size: 0.3 + rnd() * 0.07, p0, lift: 0.7 };
  },
};

function grow(name, soilY, sector) {
  const sp = SPECIES[name], rnd = plantRng(sp.skin.seed + 7), up = new THREE.Vector3(0, 1, 0);
  const tpls = [0, 1, 2].map(() => bladeGeo(sp.blade, rnd));
  const env = { sector, count: sp.count, fan: rnd() * Math.PI };
  const parts = [], placed = [];
  if (name === 'fiddle') {                                         // the trunk, a slight lean
    env.trunk = new THREE.CubicBezierCurve3(new THREE.Vector3(0, soilY - 0.02, 0), new THREE.Vector3(0.04, soilY + 0.6, 0.02),
      new THREE.Vector3(-0.03, soilY + 1.1, 0.04), new THREE.Vector3(0.02, soilY + 1.5, 0));
    parts.push(tube(env.trunk, 0.024, 0.011, 0.98, 32));
  }
  for (let k = 0; k < sp.count; k++) {
    const f = k / (sp.count - 1);
    for (let tryN = 0; tryN < 30; tryN++) {
      const az = () => sector >= Math.PI ? k * 2.39996 + (rnd() - 0.5) * 0.5 + tryN * 0.37
        : Math.PI / 2 + sector * (2 * ((k * 0.618034 + tryN * 0.137 + rnd() * 0.05) % 1) - 1);
      const P = POSE[name](f, k, rnd, az, soilY, env);
      const T = P.out.clone().multiplyScalar(Math.cos(P.theta)).addScaledVector(up, Math.sin(P.theta)).normalize();
      const X = new THREE.Vector3().crossVectors(up, T).normalize(), Y = new THREE.Vector3().crossVectors(T, X);
      const m = new THREE.Matrix4().makeBasis(X, Y, T).multiply(new THREE.Matrix4().makeRotationZ((rnd() - 0.5) * 0.4))
        .scale(new THREE.Vector3(1, 1, 1).multiplyScalar(P.size));
      m.setPosition(P.B);
      const blade = tpls[(k + tryN) % 3].clone().applyMatrix4(m);
      const rise = P.B.y - P.p0.y;
      const p1 = P.short ? P.p0.clone().addScaledVector(P.out, 0.03) : P.p0.clone().addScaledVector(up, rise * P.lift).addScaledVector(P.out, P.B.distanceTo(new THREE.Vector3(0, P.B.y, 0)) * 0.3);
      const p2 = P.B.clone().addScaledVector(T, P.short ? -0.03 : -0.28 * rise);
      const curve = new THREE.CubicBezierCurve3(P.p0, p1, p2, P.B.clone().addScaledVector(T, 0.01));
      const stalk = curve.getSpacedPoints(20).slice(3, 18), cloud = pointsOf(blade);
      if (placed.some(o => near(cloud, o.cloud, 0.04) || near(stalk, o.cloud, 0.025) || near(o.stalk, cloud, 0.025))) continue;
      placed.push({ cloud, stalk });
      const tint = 0.9 + rnd() * 0.2, warm = (rnd() - 0.5) * 0.08, col = [];
      for (let i = 0; i < blade.attributes.position.count; i++) col.push(tint + warm, tint, tint - warm);
      blade.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      blade.computeVertexNormals();
      parts.push(blade, tube(curve, sp.stalkR[0], sp.stalkR[1]));
      break;
    }
  }
  return parts;
}

const skins = {};
// The plant, leaves and stalks in one mesh, on the soil at soilY. sector as the monstera's.
export function buildTropic(name, { soilY = 0.475, sector = Math.PI, renderer = null } = {}) {
  const sp = SPECIES[name], K = sp.skin, skin = (skins[name] ||= skinOf(sp));
  const mat = new THREE.MeshPhysicalMaterial({
    map: skin.map, normalMap: skin.normal, normalScale: new THREE.Vector2(0.8, 0.8),
    alphaMap: skin.alpha, alphaTest: skin.alpha ? 0.5 : 0,
    roughness: K.rough, metalness: 0, clearcoat: K.coat, clearcoatRoughness: 0.2,
    envMap: leafEnvironment(renderer), envMapIntensity: 1.2, side: THREE.DoubleSide, vertexColors: true,
  });
  return new THREE.Mesh(mergeGeometries(grow(name, soilY, sector)), mat);
}
export const planterScale = name => SPECIES[name]?.planter ?? 1;

// Je suis le spectre d'une rose que tu portais hier au bal. (Gautier)
