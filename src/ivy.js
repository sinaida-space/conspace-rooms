import * as THREE from 'three';
import { plantRng } from './props.js';

// ── conspace-rooms · ivy.js ─────────────────────────────────────────────────
// Ivy climbing the corridor walls (#43). A patch starts at the skirting and
// wanders up the wall in a few vines, each a slow random walk that leans
// upward, with a leaf every few centimetres turned out from the wall. All
// the leaves of a chunk are one InstancedMesh (one draw call); the leaf is a
// drawn canvas quad, five-lobed, with pale veins, and the zone tints it:
//   fear     dusty grey-green, as if under hospital dust
//   memory   deep dark green, the ivy on a courtyard wall
//   light    fresh, a little pale in the milky air

const TINT = [0x8d9c88, 0x2f5a2c, 0x7fb06a];
const LEAF = 0.12;                          // metres across a grown leaf

let leafTex = null;
function leafTexture() {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  // five rounded lobes round the stalk point at the bottom, the middle one
  // longest, the side ones spreading out and down; a heart where they meet
  g.fillStyle = '#ffffff';
  const lobes = [[-1.35, 0.5], [-0.7, 0.72], [0, 0.86], [0.7, 0.72], [1.35, 0.5]];
  for (const [a, r] of lobes) {
    const x = 64 + Math.sin(a) * 58 * r, y = 104 - Math.cos(a) * 92 * r;
    g.beginPath(); g.ellipse((x + 64) / 2, (y + 96) / 2, 14 + 10 * r, 30 * r + 8, a, 0, 7); g.fill();   // the lobe, from the heart out
    g.beginPath(); g.arc(x, y, 9 + 9 * r, 0, 7); g.fill();                                            // its rounded tip
  }
  g.beginPath(); g.ellipse(64, 86, 30, 26, 0, 0, 7); g.fill();
  // the leaf's own shading: darker at the edges, a sheen toward the middle
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createRadialGradient(64, 80, 6, 64, 80, 70);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#8a8a8a');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,240,0.85)'; g.lineWidth = 2.2;   // pale veins out from the stalk
  for (const [a, r] of lobes) { g.beginPath(); g.moveTo(64, 100); g.lineTo(64 + Math.sin(a) * 50 * r, 104 - Math.cos(a) * 84 * r); g.stroke(); }
  g.globalCompositeOperation = 'source-over';
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  leafTex.anisotropy = 4;
  return leafTex;
}

// lit as every other thing in the corridors (atmo.prop), so the leaves take
// the zone's light and fog the way the walls behind them do
const mats = [];
function leafMaterial(stage, atmo) {
  if (mats[stage]) return mats[stage];
  const m = atmo.prop({ map: leafTexture(), color: TINT[stage], rust: 0 });
  m.alphaTest = 0.5; m.side = THREE.DoubleSide;
  return mats[stage] = m;
}
let leafGeo = null;

// patches: [{ x, z, nx, nz }] a point on the wall face and the wall's
// outward normal. Returns { mesh, dispose } or null when there is nothing.
export function buildIvy(group, stage, patches, seed, atmo) {
  if (!patches.length) return null;
  leafGeo ||= new THREE.PlaneGeometry(LEAF, LEAF).translate(0, LEAF / 2, 0);   // turns about its stalk
  const rnd = plantRng(seed);
  const mats4 = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const w of patches) {
    const tx = -w.nz, tz = w.nx;                          // along the wall
    const vines = 3 + Math.floor(rnd() * 3);
    for (let v = 0; v < vines; v++) {
      let u = (rnd() - 0.5) * 1.8, y = 0.02, du = (rnd() - 0.5) * 0.8;
      const top = 1.2 + rnd() * 1.6;                      // how high this vine got
      while (y < top) {
        du += (rnd() - 0.5) * 0.6; du *= 0.9;
        u += du * 0.12; y += 0.05 + rnd() * 0.04;
        if (Math.abs(u) > 1.3) du -= Math.sign(u) * 0.3;
        // a leaf on either side of the stem, smaller toward the tip
        for (const side of [-1, 1]) {
          if (rnd() < 0.25) continue;
          const grow = 0.55 + 0.6 * (1 - y / top) * rnd() + 0.25;
          const off = 0.012 + rnd() * 0.04;                // stands a little off the wall
          p.set(w.x + tx * (u + side * 0.02) + w.nx * off, y, w.z + tz * (u + side * 0.02) + w.nz * off);
          // face out of the wall, the stalk leaning up and to its side, a droop forward
          e.set(-0.05 - rnd() * 0.3, Math.atan2(w.nx, w.nz) + (rnd() - 0.5) * 0.7, side * (0.3 + rnd() * 0.7), 'YXZ');
          q.setFromEuler(e);
          s.setScalar(grow);
          mats4.push(m.compose(p, q, s).clone());
        }
      }
    }
  }
  const mesh = new THREE.InstancedMesh(leafGeo, leafMaterial(stage, atmo), mats4.length);
  mats4.forEach((mm, i) => mesh.setMatrixAt(i, mm));
  // each leaf a little lighter or darker than the next, so the patch has depth
  const c = new THREE.Color();
  for (let i = 0; i < mats4.length; i++) mesh.setColorAt(i, c.setScalar(0.65 + rnd() * 0.45));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  group.add(mesh);
  return {
    mesh,
    dispose() { group.remove(mesh); mesh.dispose(); },   // geometry and materials are shared
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
