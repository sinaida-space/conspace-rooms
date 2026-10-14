import * as THREE from 'three';
import { plantRng } from './props.js';
import { buildConcreteCube } from './plants.js';
import { buildPorcelainPot } from './kitchen.js';

// ── conspace-rooms · ivy.js ─────────────────────────────────────────────────
// Common ivy (Hedera helix) climbing the corridor walls of fear and of
// grandmother's zone (#43; none in the light). A patch starts at the skirting
// and wanders up the wall in a few vines: each a slow random walk leaning
// upward, a woody stem pressed to the plaster, and leaves on stalks turned
// out from the wall, bigger low down where the vine is old, small and bright
// at the growing tip. Stems and leaves are two InstancedMeshes a chunk.
//
// The leaf is drawn once, in colour, on a canvas: five pointed lobes with
// shallow sinuses, dark glossy green going olive toward the margin, a pale
// palmate vein fan from the stalk, a thin light rim, a few age spots. Four
// looks sit side by side in the atlas (young, old, dusty, yellowing) and each
// leaf picks one through its UV offset. The zone only tints the whole:
//   fear     grey-dusted, as under hospital dust
//   memory   deep green, the ivy on a courtyard wall

const TINT = [0xe4e8e0, 0xd2dccb];
const LEAF = 0.11;                         // metres across a grown leaf
const LOOKS = 4;

// the outline: lobe tips and the sinuses between them, polar round the stalk
function leafPath(cx, cy, R, rnd) {
  const tips = [[-1.75, 0.5], [-0.95, 0.74], [0, 1], [0.95, 0.74], [1.75, 0.5]]
    .map(([a, r]) => [a + (rnd() - 0.5) * 0.12, r * (0.92 + rnd() * 0.12)]);
  const pt = (a, r) => [cx + Math.sin(a) * R * r, cy - Math.cos(a) * R * r];
  const g = new Path2D();
  g.moveTo(...pt(-2.35, 0.18));
  for (let i = 0; i < tips.length; i++) {
    const [a, r] = tips[i];
    const next = i < tips.length - 1 ? tips[i + 1][0] : 2.4;
    const sinOut = pt((a + next) / 2, i < tips.length - 1 ? 0.5 : 0.3);
    // a gently convex shoulder up to a pointed tip, and down to the next sinus
    g.quadraticCurveTo(...pt(a - 0.28, r * 0.86), ...pt(a, r));
    g.quadraticCurveTo(...pt(a + 0.28, r * 0.86), ...sinOut);
  }
  g.lineTo(...pt(2.35, 0.18));
  g.quadraticCurveTo(cx, cy + R * 0.06, ...pt(-2.35, 0.18));   // the heart-shaped base round the stalk
  g.closePath();
  return { path: g, tips };
}

let leafTex = null;
function leafTexture() {
  if (leafTex) return leafTex;
  const S = 256, c = document.createElement('canvas');
  c.width = S * LOOKS; c.height = S;
  const g = c.getContext('2d'), rnd = plantRng(4242);
  const looks = [
    { deep: '#24521f', mid: '#3f7a33', rim: '#8cb862', vein: 'rgba(214,226,190,0.8)', spots: 0 },    // young, glossy
    { deep: '#1a3d17', mid: '#335e29', rim: '#6d8f4c', vein: 'rgba(190,204,170,0.65)', spots: 3 },   // old, dark
    { deep: '#3b4d37', mid: '#65765c', rim: '#a3ad96', vein: 'rgba(220,222,210,0.7)', spots: 6 },    // dusty
    { deep: '#3b4a17', mid: '#71782a', rim: '#b8a54a', vein: 'rgba(236,228,180,0.8)', spots: 8 },    // yellowing
  ];
  looks.forEach((L, k) => {
    g.save();
    g.translate(k * S, 0);
    const cx = S / 2, cy = S * 0.9, R = S * 0.84;
    const { path, tips } = leafPath(cx, cy, R, rnd);
    g.clip(path);
    // body: dark at the heart, olive toward the margin
    const body = g.createRadialGradient(cx, cy - R * 0.25, R * 0.05, cx, cy - R * 0.35, R * 0.9);
    body.addColorStop(0, L.deep); body.addColorStop(0.65, L.mid); body.addColorStop(1, L.rim);
    g.fillStyle = body; g.fillRect(0, 0, S, S);
    // a waxy sheen across one half
    const sheen = g.createLinearGradient(S * 0.2, 0, S * 0.8, S);
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = sheen; g.fillRect(0, 0, S, S);
    // mottling in the blade
    for (let i = 0; i < 90; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,220,0.05)';
      g.beginPath(); g.arc(rnd() * S, rnd() * S, 3 + rnd() * 10, 0, 7); g.fill();
    }
    // veins: a pale fan from the stalk to every lobe tip, with side veins
    g.strokeStyle = L.vein; g.lineCap = 'round';
    for (const [a, r] of tips) {
      const ex = cx + Math.sin(a) * R * r * 0.93, ey = cy - Math.cos(a) * R * r * 0.93;
      g.lineWidth = 3.2; g.beginPath(); g.moveTo(cx, cy - R * 0.08);
      g.quadraticCurveTo(cx + Math.sin(a) * R * r * 0.4, cy - Math.cos(a) * R * r * 0.52, ex, ey); g.stroke();
      g.lineWidth = 1.2;
      for (let t = 0.3; t < 0.85; t += 0.16) for (const sd of [-1, 1]) {
        const bx = cx + Math.sin(a) * R * r * t, by = cy - R * 0.08 - Math.cos(a) * R * r * t;
        const ba = a + sd * 0.7;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.sin(ba) * R * 0.1, by - Math.cos(ba) * R * 0.1); g.stroke();
      }
    }
    // age: brown spots and a nibbled, drying edge on the older looks
    for (let i = 0; i < L.spots; i++) {
      const x = S * (0.25 + rnd() * 0.5), y = S * (0.2 + rnd() * 0.55), r = 3 + rnd() * 8;
      g.fillStyle = 'rgba(92,64,28,0.55)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = 'rgba(200,170,90,0.35)'; g.beginPath(); g.arc(x, y, r * 0.5, 0, 7); g.fill();
    }
    // a thin light rim along the margin (half the stroke falls inside the clip)
    g.strokeStyle = L.rim; g.lineWidth = 5; g.stroke(path);
    g.restore();
  });
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  leafTex.anisotropy = 8;
  return leafTex;
}

// lit as every other thing in the corridors (atmo.prop), so the leaves take
// the zone's light and fog the way the walls behind them do
const mats = [], stemMats = [];
function leafMaterial(stage, atmo) {
  if (mats[stage]) return mats[stage];
  const m = atmo.prop({ map: leafTexture(), color: TINT[stage], rust: 0 });
  m.alphaTest = 0.5; m.side = THREE.DoubleSide;
  return mats[stage] = m;
}
const stemMaterial = (stage, atmo) => stemMats[stage] ||= atmo.prop({ color: stage === 0 ? 0x6a5c4c : 0x4a3a28, rust: 0 });

// one leaf quad per look, its UVs on that look's cell of the atlas; the quad
// turns about its stalk at the bottom edge
let leafGeos = null, stemGeo = null;
function leafGeometries() {
  return leafGeos ||= Array.from({ length: LOOKS }, (_, k) => {
    const geo = new THREE.PlaneGeometry(LEAF, LEAF).translate(0, LEAF / 2, 0);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / LOOKS);
    return geo;
  });
}

// Every patch grows out of a pot against the wall, never out of the skirting:
// in fear the pale concrete cube of its ficus, in grandmother's zone a pot
// thrown like her teapot. POT_OFF: the pot's middle off the wall face.
const POT_OFF = 0.3;
function potFor(stage, atmo) {
  if (stage === 0) {
    const cube = buildConcreteCube(atmo);
    cube.scale.setScalar(0.8);
    cube.userData.soilY *= 0.8;
    return cube;
  }
  const pot = buildPorcelainPot();
  pot.traverse(o => { o.userData.keep = true; });        // shared geometry and materials
  return pot;
}

// patches: [{ x, z, nx, nz }] a point on the wall face and the wall's
// outward normal. Returns { meshes, pots, dispose } or null when there is nothing;
// pots: [{ x, z }] where each pot stands, for footprints.
export function buildIvy(group, stage, patches, seed, atmo) {
  if (!patches.length || stage === 2) return null;          // the light has no ivy
  const geos = leafGeometries();
  stemGeo ||= new THREE.CylinderGeometry(0.006, 0.008, 1, 5).translate(0, 0.5, 0);   // a unit stem, scaled per segment
  const rnd = plantRng(seed);
  const leaves = geos.map(() => []), stems = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), a = new THREE.Vector3();
  // older looks low on the vine, dust in fear, young leaves at the tips
  const lookAt = (k, dusty) => dusty && rnd() < 0.55 ? 2 : k < 0.35 ? (rnd() < 0.25 ? 3 : 1) : k > 0.8 ? 0 : (rnd() < 0.5 ? 0 : 1);
  const pots = [], potMeshes = [];
  for (const w of patches) {
    const tx = -w.nz, tz = w.nx;                           // along the wall
    const at = (u, y, off) => new THREE.Vector3(w.x + tx * u + w.nx * off, y, w.z + tz * u + w.nz * off);
    const pot = potFor(stage, atmo), soil = pot.userData.soilY;
    const pp = at(0, 0, POT_OFF);
    pot.position.copy(pp); pot.rotation.y = Math.atan2(w.nx, w.nz) + (rnd() - 0.5) * 0.3;
    group.add(pot); potMeshes.push(pot); pots.push({ x: pp.x, z: pp.z });
    const vines = 5 + Math.floor(rnd() * 4);
    for (let v = 0; v < vines; v++) {
      // from the soil, bowing over the rim to the wall, then up it and out sideways
      let u = (rnd() - 0.5) * 0.24, y = soil + 0.28 + rnd() * 0.1, du = (rnd() - 0.5) * 1.2;
      const top = 1.2 + rnd() * 1.6;                       // how high this vine got
      let prev = at(u * 0.5, soil - 0.02, POT_OFF - 0.05 + (rnd() - 0.5) * 0.12), step = 0;
      // over the rim toward the wall: two short segments in a bow, not one straight rod
      for (const [k, lift] of [[0.45, 0.14], [0.8, 0.22]]) {
        const node = at(u * k, soil + lift, (POT_OFF - 0.05) * (1 - k) + 0.02);
        dir.subVectors(node, prev);
        const l = dir.length();
        q.setFromUnitVectors(up, dir.normalize());
        stems.push(m.compose(prev, q, s.set(1.6, l, 1.6)).clone());
        prev = node;
      }
      while (y < top) {
        du += (rnd() - 0.5) * 0.6; du *= 0.9;
        if (Math.abs(u) > 1.3) du -= Math.sign(u) * 0.3;
        u += du * 0.1; y += 0.055 + rnd() * 0.03;
        const k = y / top;
        // the stem: a segment from the last node to this one, flat on the wall
        const cur = at(u, y, 0.008);
        dir.subVectors(cur, prev);
        const len = dir.length();
        q.setFromUnitVectors(up, dir.normalize());
        const thick = 1.6 - k;                             // thicker where it is old
        stems.push(m.compose(prev, q, s.set(thick, len, thick)).clone());
        prev = cur;
        // a leaf at every other node, alternate sides, on a short stalk out from the wall
        if (step++ % 3 !== 2 || rnd() < 0.5) {
          const side = step % 2 ? -1 : 1;
          const grow = (1.25 - 0.7 * k) * (0.8 + rnd() * 0.35);
          const off = 0.015 + rnd() * 0.035;
          a.copy(at(u + side * 0.025, y, off));
          e.set(-0.1 - rnd() * 0.35, Math.atan2(w.nx, w.nz) + (rnd() - 0.5) * 0.6, side * (0.35 + rnd() * 0.7), 'YXZ');
          q.setFromEuler(e);
          leaves[lookAt(k, stage === 0)].push(m.compose(a, q, s.setScalar(grow)).clone());
        }
      }
    }
  }
  const made = [];
  const inst = (geo, mat, list, shade) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const c = new THREE.Color();
    list.forEach((mm, i) => { mesh.setMatrixAt(i, mm); if (shade) mesh.setColorAt(i, c.setScalar(0.78 + rnd() * 0.3)); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.userData.keep = true;                             // shared geometry and material; dispose() frees the instances
    group.add(mesh); made.push(mesh);
  };
  geos.forEach((geo, k) => inst(geo, leafMaterial(stage, atmo), leaves[k], true));
  inst(stemGeo, stemMaterial(stage, atmo), stems, false);
  return {
    meshes: made, pots,
    dispose() {
      for (const mesh of made) { group.remove(mesh); mesh.dispose(); }
      for (const pot of potMeshes) group.remove(pot);      // pots share their geometry and materials
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
