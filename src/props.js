import * as THREE from 'three';
import { viewMaterial, nextView, paneAttributes } from './views.js';
import { sketchParam } from './device.js';
import { mergeGeometries, mergeVertices } from '../vendor/addons/BufferGeometryUtils.js';
import { roundedBox } from './geom.js';
import { contactShadows } from './shadows.js';
import { wallBehind, record } from './placement.js';

// ── conspace-rooms · props.js ───────────────────────────────────────────────
// Things left along the corridors, so that hardly a corridor is quite empty.
// Each stage leaves its own:
//   FEAR       a tube chair, a bucket and mop, bottles, a cardboard box, an
//              oxygen cylinder, now and then a window of grey, dirty glass
//              onto a night block of flats, its tulle cut off at the sill
//   MEMORY     the toys every Soviet child had (неваляшка, пирамидка, юла,
//              матрёшки, a two-colour ball), slippers, a
//              stool, jars of preserves, a tied stack of newspapers
//   ACCEPTANCE furniture under white sheets, windows onto flowers behind frosted
//              glass (views.js), a breathing tulle before them, lace napkins adrift on the water and
//              paper cranes circling under the ceiling, shy of the visitor
// Every shape is built once from primitives (no downloads) and baked with
// vertex colours (rgb + gloss in alpha, as in ward.js and eggs.js). A chunk
// merges all of its grounded things into one mesh lit by atmo.prop(), plus
// at most three more draw calls: windows, tulle (both in fear and the
// light), floaters (the light).
// Where they stand is decided in soulpath.js (_buildProps).

const SHEET = 0xeeeee8, STEEL = 0xa9adab, WOOD = 0x6a4424, WOOD_PALE = 0xd8b070;

function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sphere = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

// one shape: primitives with colour and gloss, merged in local space. Local
// +z faces the corridor, the back rests toward the wall, y = 0 is the floor.
export function shape(build, crumple = 0) {
  const parts = [];
  // paint: optional (x, y, z) => hex in the part's own frame, before m, so
  // a face, a flower or a stripe can be painted on per vertex
  const put = (geo, hex, gloss, m, paint = null) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const pos = g.attributes.position, cc = new THREE.Color();
    const col = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      cc.setHex(paint ? paint(pos.getX(i), pos.getY(i), pos.getZ(i)) ?? hex : hex, THREE.LinearSRGBColorSpace);
      col.set([cc.r, cc.g, cc.b, gloss], i * 4);
    }
    if (m) g.applyMatrix4(m);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    parts.push(g);
  };
  build(put);
  let geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  if (crumple) {
    // weld first: split vertices would fold apart into black slits, and
    // flat face normals would show every facet
    geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
    const welded = mergeVertices(geo, 1e-4);
    geo.dispose(); geo = welded;
    geo.computeVertexNormals();                                   // cloth: soft folds pushed along the normals
    const p = geo.attributes.position, n = geo.attributes.normal, c = geo.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // a sheet hangs: on the sides long vertical folds that widen and
      // deepen toward the floor, on top only a slack ripple
      const side = 1 - Math.min(1, Math.abs(n.getY(i)) * 1.6);
      const along = x * n.getZ(i) - z * n.getX(i);                    // across the face, horizontally
      const drop = 0.35 + 0.65 * Math.max(0, Math.min(1, (0.9 - y) / 0.9));
      const hang = Math.sin(along * 26 + 1.3 * Math.sin(y * 5 + along * 3)) * drop * 1.3;
      const slack = Math.sin(x * 11 + z * 3) * Math.sin(z * 9 - x * 2) * 0.45;
      const f = crumple * (side * hang + (1 - side) * slack);
      p.setXYZ(i, x + n.getX(i) * f, y + Math.max(0, n.getY(i)) * f * 0.3, z + n.getZ(i) * f);
      const fold = 1 - 0.22 * Math.min(1, Math.max(0, -f / (crumple * 1.5)));   // the valleys of a fold hold a little shade
      c.setXYZ(i, c.getX(i) * fold, c.getY(i) * fold, c.getZ(i) * fold);
    }
    geo.computeVertexNormals();
    const flat = geo.toNonIndexed();                  // back to the shape of every other part, so they still merge
    geo.dispose(); geo = flat;
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  }
  return geo;
}

// ── fear ────────────────────────────────────────────────────────────────────
const FEAR = {
  chair: { depth: 0.45, w: 0.45, solid: true, build: put => {
    for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) put(cyl(0.011, 0.011, 0.45, 8), STEEL, 0.5, M(x, 0.225, z));
    for (const x of [-0.19, 0.19]) put(cyl(0.011, 0.011, 0.42, 8), STEEL, 0.5, M(x, 0.66, -0.19));
    put(roundedBox(0.42, 0.04, 0.4, 0.012), 0x3b4a3a, 0.35, M(0, 0.47, 0));
    put(roundedBox(0.42, 0.24, 0.03, 0.01), 0x3b4a3a, 0.35, M(0, 0.76, -0.19));
  } },
  bucket: { depth: 0.3, w: 0.4, build: put => {
    put(cyl(0.14, 0.11, 0.26, 16), 0xc9c7bb, 0.4, M(0.05, 0.13, 0));
    put(new THREE.TorusGeometry(0.14, 0.008, 6, 20), 0x2b3a66, 0.5, M(0.05, 0.26, 0, Math.PI / 2));
    put(new THREE.CircleGeometry(0.13, 16), 0x2e302a, 0.7, M(0.05, 0.262, 0, -Math.PI / 2));   // grey water
    put(cyl(0.012, 0.012, 1.3, 6), 0x6a4a2a, 0.2, M(0.05, 0.62, -0.08, -0.26, 0, 0.12));    // the mop leans on the wall
    put(roundedBox(0.26, 0.05, 0.1, 0.02), 0x77726a, 0.05, M(0.08, 0.025, 0.02, 0, 0.4, 0));
  } },
  bottles: { depth: 0.2, w: 0.35, build: put => {
    const bottle = (x, z, hex, lying) => {
      const m = lying ? M(x, 0.035, z, 0, 0.7, Math.PI / 2) : M(x, 0, z);
      put(cyl(0.035, 0.035, 0.16, 10), hex, 0.85, m.clone().multiply(M(0, 0.08, 0)));
      put(cyl(0.012, 0.03, 0.06, 8), hex, 0.85, m.clone().multiply(M(0, 0.19, 0)));
    };
    bottle(-0.1, 0, 0x3a2008); bottle(0, -0.03, 0x1f3a1a); bottle(0.09, 0.02, 0x9aa89c); bottle(0.05, 0.1, 0x3a2008, true);
  } },
  box: { depth: 0.34, w: 0.42, solid: true, build: put => {
    put(roundedBox(0.4, 0.3, 0.32, 0.006), 0x8a6a42, 0.05, M(0, 0.15, 0, 0, 0.1, 0));
    put(new THREE.BoxGeometry(0.4, 0.005, 0.15), 0x7d5f3a, 0.05, M(0, 0.33, 0.2, -1.0, 0.1, 0));
    put(new THREE.BoxGeometry(0.4, 0.005, 0.15), 0x7d5f3a, 0.05, M(0, 0.33, -0.2, 1.1, 0.1, 0));
  } },
  oxygen: { depth: 0.22, w: 0.22, build: put => {
    put(cyl(0.09, 0.09, 1.0, 16), 0x2a4f8a, 0.5, M(0, 0.5, 0, -0.07));
    put(sphere(0.09, 16, 8), 0x2a4f8a, 0.5, M(0, 1.0, -0.035, -0.07, 0, 0, 1, 0.6, 1));
    put(roundedBox(0.05, 0.08, 0.05, 0.01), STEEL, 0.6, M(0, 1.1, -0.04));
  } },
};

// the hospital's leftovers (#43): a drip stand, a wheelchair, a gurney, a
// folding screen, a bedside cabinet and the scales with a height rod.
// Local frame as above: x along the wall, -z toward it.
const ENAMEL = 0xd9d6c8, VINYL = 0x2f3b36, CURTAIN = 0xb9c4b0;
Object.assign(FEAR, {
  drip: { depth: 0.5, w: 0.5, solid: true, build: put => {
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; put(cyl(0.01, 0.01, 0.28, 6), STEEL, 0.5, M(Math.cos(a) * 0.12, 0.03, Math.sin(a) * 0.12, 0, -a, Math.PI / 2 - 0.12)); put(sphere(0.022, 8, 6), 0x222222, 0.3, M(Math.cos(a) * 0.24, 0.022, Math.sin(a) * 0.24)); }
    put(cyl(0.012, 0.012, 1.85, 8), STEEL, 0.6, M(0, 0.95, 0));
    put(cyl(0.006, 0.006, 0.34, 6), STEEL, 0.6, M(0, 1.86, 0, 0, 0, Math.PI / 2));
    put(roundedBox(0.1, 0.17, 0.035, 0.015), 0xdfe6dc, 0.9, M(-0.14, 1.7, 0));                 // an empty bag
    put(cyl(0.004, 0.004, 0.9, 5), 0xcfd6cc, 0.8, M(-0.14, 1.18, 0.02, 0.05));               // its line hanging down
  } },
  wheelchair: { depth: 0.66, w: 0.62, solid: true, build: put => {
    for (const x of [-0.29, 0.29]) {
      put(new THREE.TorusGeometry(0.28, 0.014, 6, 28), 0x1c1c1c, 0.3, M(x, 0.29, -0.05, 0, Math.PI / 2));
      put(new THREE.TorusGeometry(0.24, 0.006, 6, 24), STEEL, 0.7, M(x + Math.sign(x) * 0.02, 0.29, -0.05, 0, Math.PI / 2));
      put(sphere(0.045, 8, 6), 0x1c1c1c, 0.3, M(x * 0.8, 0.05, 0.26));                          // castors in front
      put(cyl(0.012, 0.012, 0.9, 8), STEEL, 0.6, M(x * 0.82, 0.5, -0.2, -0.12));                 // the back frame and handles
    }
    put(roundedBox(0.46, 0.04, 0.42, 0.015), VINYL, 0.4, M(0, 0.5, 0.02));
    put(roundedBox(0.44, 0.38, 0.03, 0.012), VINYL, 0.4, M(0, 0.74, -0.22, -0.12));
    put(roundedBox(0.36, 0.02, 0.1, 0.01), STEEL, 0.5, M(0, 0.1, 0.33, 0.4));                    // footplate
  } },
  gurney: { depth: 0.62, w: 1.9, solid: true, build: put => {
    for (const x of [-0.85, 0.85]) for (const z of [-0.24, 0.24]) { put(cyl(0.014, 0.014, 0.72, 8), STEEL, 0.6, M(x, 0.4, z)); put(sphere(0.045, 8, 6), 0x1c1c1c, 0.3, M(x, 0.045, z)); }
    put(roundedBox(1.86, 0.06, 0.58, 0.02), STEEL, 0.5, M(0, 0.76, 0));
    put(roundedBox(1.8, 0.09, 0.54, 0.04), 0x8d8f7e, 0.15, M(0, 0.84, 0));                      // a worn mattress
    put(roundedBox(1.1, 0.03, 0.56, 0.02), 0xcfcab8, 0.1, M(0.3, 0.9, 0.01, 0, 0.05, 0.02));    // a sheet pushed down
  } },
  screen: { depth: 0.3, w: 1.5, build: put => {
    for (const [x, a] of [[-0.5, 0.35], [0, 0], [0.5, -0.35]]) {
      const t = M(x, 0, a ? 0.1 : 0, 0, a);
      for (const u of [-0.24, 0.24]) put(cyl(0.01, 0.01, 1.7, 6), STEEL, 0.6, t.clone().multiply(M(u, 0.85, 0)));
      put(new THREE.BoxGeometry(0.46, 1.3, 0.004), CURTAIN, 0.15, t.clone().multiply(M(0, 1.0, 0)));   // stretched cloth, stained low
      put(new THREE.BoxGeometry(0.46, 0.25, 0.006), 0x9da38e, 0.15, t.clone().multiply(M(0, 0.44, 0)));
    }
  } },
  cabinet: { depth: 0.42, w: 0.46, solid: true, build: put => {
    put(roundedBox(0.44, 0.72, 0.4, 0.01), ENAMEL, 0.45, M(0, 0.36, 0));
    put(new THREE.BoxGeometry(0.4, 0.004, 0.005), 0x6f6d64, 0.3, M(0, 0.56, 0.2));               // drawer seam
    put(roundedBox(0.08, 0.015, 0.02, 0.005), STEEL, 0.7, M(0, 0.62, 0.21));
    put(roundedBox(0.36, 0.26, 0.005, 0.004), 0xcac6b5, 0.4, M(0, 0.26, 0.2));                  // the door
    put(cyl(0.03, 0.03, 0.08, 10), 0x6a3a14, 0.85, M(0.1, 0.76, 0.05));                           // a brown medicine bottle
    put(roundedBox(0.2, 0.02, 0.14, 0.01), ENAMEL, 0.6, M(-0.08, 0.73, 0.02, 0, 0.3));            // a kidney tray
  } },
  scales: { depth: 0.45, w: 0.42, solid: true, build: put => {
    put(roundedBox(0.4, 0.08, 0.42, 0.02), ENAMEL, 0.45, M(0, 0.04, 0.02));
    put(cyl(0.02, 0.02, 1.95, 8), ENAMEL, 0.5, M(0, 1.02, -0.17));
    put(roundedBox(0.3, 0.05, 0.06, 0.01), STEEL, 0.6, M(0, 1.2, -0.13));                         // the beam with its weights
    put(roundedBox(0.03, 0.04, 0.05, 0.005), 0x333333, 0.4, M(0.06, 1.2, -0.09));
    put(roundedBox(0.2, 0.012, 0.1, 0.004), STEEL, 0.6, M(0, 1.9, -0.1));                         // the height rod's slider
  } },
});

// ── memory: the toys, and the house around them ─────────────────────────────
const MEMORY = {
  // a roly-poly doll: an egg of a body, painted with a white apron and a
  // flower on it, a round face with eyes, rosy cheeks and a fringe, a red
  // headscarf with white dots
  nevalyashka: { depth: 0.18, w: 0.2, toy: true, build: put => {
    put(lathe([[0, 0], [0.05, 0.005], [0.085, 0.04], [0.095, 0.085], [0.085, 0.13], [0.06, 0.16], [0, 0.17]], 28), 0xc81e24, 0.65, M(0, 0, 0),
      (x, y, z) => {
        if (z > 0.02 && y > 0.03 && y < 0.15 && Math.abs(x) < 0.055 + (0.15 - y) * 0.2) {           // the apron
          const fx = x, fy = y - 0.085, r = Math.hypot(fx, fy);
          if (r < 0.012) return 0xf2c230;                                                            // the flower's heart
          if (r < 0.03 && Math.cos(Math.atan2(fy, fx) * 5) > 0.2) return 0xd0202a;                   // five red petals
          if (Math.abs(fx) < 0.004 && fy < -0.03) return 0x2f8a3c;                                   // its stem
          return 0xf4ece0;
        }
        return null;
      });
    put(sphere(0.058, 28, 20), 0xf2cfae, 0.35, M(0, 0.215, 0), (x, y, z) => {
      if (z < 0.01) return 0xc81e24;                                                                 // the scarf over the back
      if (y > 0.028) return z > 0.035 && y < 0.04 ? 0x7a4a24 : 0xc81e24;                             // a fringe of hair, the scarf above
      if (Math.hypot(Math.abs(x) - 0.019, y - 0.008) < 0.008 && z > 0.04) return 0x1e2a44;          // eyes
      if (Math.hypot(Math.abs(x) - 0.03, y + 0.012) < 0.011 && z > 0.035) return 0xe07a70;          // rosy cheeks
      if (Math.abs(x) < 0.01 && Math.abs(y + 0.028) < 0.004 && z > 0.04) return 0xb02030;           // mouth
      return null;
    });
    const dots = (x, y, z) => (Math.sin(x * 160) * Math.sin(y * 160 + z * 90) > 0.82 ? 0xf4ece0 : null);   // white polka dots
    put(new THREE.SphereGeometry(0.061, 28, 20, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9), 0xc81e24, 0.6, M(0, 0.218, -0.004), dots);   // round the back, open at the face
    put(new THREE.SphereGeometry(0.062, 28, 8, 0, Math.PI * 2, 0, 0.62), 0xc81e24, 0.6, M(0, 0.218, -0.004), dots);                  // over the crown and forehead
  } },
  pyramid: { depth: 0.18, w: 0.18, toy: true, build: put => {
    put(cyl(0.08, 0.086, 0.03, 24), WOOD_PALE, 0.35, M(0, 0.015, 0));
    put(cyl(0.012, 0.012, 0.3, 10), WOOD_PALE, 0.35, M(0, 0.18, 0));
    [0xd0202a, 0xf08a1a, 0xf2d21e, 0x2f9a3c, 0x2a5fb0, 0x7a3fa0].forEach((hex, i) =>
      put(new THREE.TorusGeometry(0.072 - i * 0.008, 0.022 - i * 0.0015, 12, 28), hex, 0.7, M(0, 0.052 + i * 0.043, 0, Math.PI / 2)));
    put(sphere(0.032, 16, 12), 0xd0202a, 0.7, M(0, 0.335, 0));
  } },
  // a humming top, fallen on its side: red and blue bands, a yellow stripe,
  // the steel plunger
  yula: { depth: 0.26, w: 0.3, toy: true, build: put => {
    const t = M(0, 0.1, 0, 0, 0.5, 0.55);
    put(lathe([[0, 0], [0.02, 0.01], [0.1, 0.06], [0.112, 0.09], [0.08, 0.13], [0.02, 0.15], [0, 0.15]], 32), 0xc8202a, 0.75, t.clone().multiply(M(0, -0.08, 0)),
      (x, y) => (y > 0.1 ? 0x2a5fb0 : y > 0.075 && y < 0.09 ? 0xf2d21e : null));
    put(new THREE.TorusGeometry(0.108, 0.01, 8, 32), 0xf2efe6, 0.7, t.clone().multiply(M(0, 0.01, 0, Math.PI / 2)));
    put(cyl(0.008, 0.008, 0.11, 8), STEEL, 0.8, t.clone().multiply(M(0, 0.12, 0)));
    put(sphere(0.016, 10, 8), STEEL, 0.8, t.clone().multiply(M(0, 0.18, 0)));
  } },
  // matryoshki, three nested ones stood in a row: a painted face with a
  // fringe and cheeks, a yellow apron with a red flower, a black-edged scarf
  matryoshki: { depth: 0.16, w: 0.36, toy: true, build: put => {
    [[1, -0.1], [0.78, 0.03], [0.58, 0.13]].forEach(([s, x]) => {
      const m = M(x, 0, 0, 0, (x * 3) % 0.6 - 0.3, 0, s);
      put(lathe([[0, 0], [0.06, 0], [0.075, 0.04], [0.07, 0.1], [0.05, 0.14], [0.055, 0.17], [0.045, 0.2], [0, 0.215]], 32), 0xb81c20, 0.75, m,
        (px, py, pz) => {
          const face = Math.hypot(px, (py - 0.17) * 1.1) < 0.03 && pz > 0.03;
          if (face) {
            if (py > 0.185 && pz > 0.04) return 0x3a2012;                                   // fringe
            if (Math.hypot(Math.abs(px) - 0.011, py - 0.172) < 0.004) return 0x1e2a44;     // eyes
            if (Math.hypot(Math.abs(px) - 0.017, py - 0.162) < 0.006) return 0xe07a70;     // cheeks
            if (Math.abs(px) < 0.005 && Math.abs(py - 0.153) < 0.002) return 0xb02030;     // mouth
            return 0xf3d2b0;
          }
          if (Math.hypot(px, (py - 0.17) * 1.1) < 0.036 && pz > 0.02) return 0x1a1a1a;     // the scarf's dark edge
          if (pz > 0.035 && py > 0.02 && py < 0.13 && Math.abs(px) < 0.045) {              // the apron
            const r = Math.hypot(px, py - 0.075);
            if (r < 0.01) return 0xf2c230;
            if (r < 0.026 && Math.cos(Math.atan2(py - 0.075, px) * 6) > 0.1) return 0xd0202a;
            return 0xf2c230;
          }
          return null;
        });
    });
  } },
  // a two-coloured rubber ball, a white band, a star on the red half,
  // scuffed paler here and there
  ball: { depth: 0.2, w: 0.2, toy: true, build: put => {
    put(sphere(0.1, 36, 24), 0xc81e24, 0.75, M(0, 0.1, 0, 0.4, 0, 0.3), (x, y, z) => {
      if (Math.abs(y) < 0.009) return 0xf2efe6;
      if (y < 0) return (Math.sin(x * 90) * Math.sin(z * 70) > 0.93) ? 0x6a86b8 : 0x2a5fb0;          // scuffs
      const a = Math.atan2(z, x), r = Math.hypot(x, z);
      if (y > 0.07 && r < 0.02 + 0.03 * Math.pow(Math.abs(Math.cos(a * 2.5)), 6)) return 0xf2d21e;    // the star on top
      return (Math.sin(x * 80 + y * 30) * Math.sin(z * 90) > 0.94) ? 0xe06a6a : null;
    });
  } },
  slippers: { depth: 0.3, w: 0.3, build: put => {
    [[-0.07, 0.1], [0.08, -0.15]].forEach(([x, a]) => {
      put(roundedBox(0.1, 0.05, 0.26, 0.03), 0x6a1f28, 0.3, M(x, 0.025, 0, 0, a));
      put(roundedBox(0.105, 0.025, 0.09, 0.012), 0xd8c8b0, 0.1, M(x + Math.sin(a) * 0.05, 0.058, Math.cos(a) * 0.05, 0, a));
    });
  } },
  stool: { depth: 0.32, w: 0.32, solid: true, build: put => {
    put(roundedBox(0.32, 0.03, 0.32, 0.008), WOOD, 0.3, M(0, 0.45, 0));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(new THREE.BoxGeometry(0.03, 0.45, 0.03), WOOD, 0.3, M(x * 0.12, 0.22, z * 0.12, z * 0.06, 0, -x * 0.06));
    for (const z of [-0.12, 0.12]) put(new THREE.BoxGeometry(0.26, 0.02, 0.02), WOOD, 0.3, M(0, 0.15, z));
  } },
  jars: { depth: 0.15, w: 0.3, build: put => {
    [[-0.06, 0xc0601a], [0.08, 0x6a1420]].forEach(([x, hex]) => {
      put(cyl(0.06, 0.06, 0.14, 14), hex, 0.9, M(x, 0.07, 0));
      put(cyl(0.064, 0.064, 0.02, 14), 0xb0a060, 0.7, M(x, 0.15, 0));
    });
  } },
  newspapers: { depth: 0.26, w: 0.36, build: put => {
    put(roundedBox(0.35, 0.12, 0.25, 0.01), 0xcfc6ae, 0.05, M(0, 0.06, 0, 0, 0.15, 0));
    put(new THREE.BoxGeometry(0.36, 0.125, 0.006), 0x4a3a2a, 0.1, M(0, 0.06, 0, 0, 0.15, 0));
    put(new THREE.BoxGeometry(0.006, 0.125, 0.26), 0x4a3a2a, 0.1, M(0, 0.06, 0, 0, 0.15, 0));
  } },
};

// A memory-stage toy shape and its footprint, for anything outside this file
// that wants to drop one on the floor too (drowned.js: a toy the flood left
// behind). Built once, same cache the kit itself would use.
const MEMORY_GEO = new Map();
export function memoryShape(name) {
  if (!MEMORY_GEO.has(name)) MEMORY_GEO.set(name, shape(MEMORY[name].build, MEMORY[name].crumple || 0));
  return MEMORY_GEO.get(name);
}
export function memoryDims(name) { return MEMORY[name]; }

// ── acceptance: under sheets, in the light ─────────────────────────────────
const LIGHT = {
  chair: { depth: 0.5, w: 0.5, solid: true, crumple: 0.012, build: put => {
    put(roundedBox(0.46, 0.08, 0.46, 0.03, 10), SHEET, 0.08, M(0, 0.47, 0));
    put(roundedBox(0.46, 0.45, 0.1, 0.03, 10), SHEET, 0.08, M(0, 0.74, -0.19));
    put(new THREE.CylinderGeometry(0.33, 0.37, 0.44, 32, 10, true), SHEET, 0.08, M(0, 0.22, 0, 0, Math.PI / 4));
  } },
  armchair: { depth: 0.75, w: 0.85, solid: true, crumple: 0.018, build: put => {
    put(roundedBox(0.82, 0.48, 0.7, 0.12, 10), SHEET, 0.08, M(0, 0.24, 0));
    put(roundedBox(0.82, 0.5, 0.22, 0.08, 10), SHEET, 0.08, M(0, 0.7, -0.24));
    for (const x of [-0.34, 0.34]) put(roundedBox(0.16, 0.2, 0.7, 0.07, 8), SHEET, 0.08, M(x, 0.56, 0));
  } },
  mirror: { depth: 0.36, w: 0.72, solid: true, crumple: 0.01, build: put => {
    put(roundedBox(0.7, 1.7, 0.12, 0.04, 10), SHEET, 0.08, M(0, 0.9, 0, -0.08));
    put(new THREE.CylinderGeometry(0.38, 0.46, 0.06, 32, 2), SHEET, 0.08, M(0, 0.03, 0.06, 0, 0, 0, 1, 1, 0.55));
  } },
  piano: { depth: 0.6, w: 1.3, solid: true, crumple: 0.016, build: put => {
    put(roundedBox(1.3, 1.1, 0.55, 0.06, 10), SHEET, 0.08, M(0, 0.55, 0));
    put(new THREE.CylinderGeometry(0.7, 0.76, 0.3, 40, 8, true), SHEET, 0.08, M(0, 0.15, 0, 0, 0, 0, 1, 1, 0.45));
  } },
};

// ── houseplants ─────────────────────────────────────────────────────────────
// A ficus and a monstera in plain pots, built from a bent leaf grid and a few
// lathes. Three looks to compare, ?plants=1|2|3:
//   1 real colour (deep green, glossy, terracotta)
//   2 white haze  (the plant is sheeted like the furniture, read by shape)
//   3 fading into light (green at the base, the top leaves nearly SHEET white)
const PLANT_LOOK = +(sketchParam('plants') || 1);   // 1|2|3

// colours of the current look; `fade` paints leaves by height toward SHEET
export function plantLook(look = PLANT_LOOK) {
  if (look === 2) return { leaf: SHEET, rib: 0xd0d0c6, stem: SHEET, pot: SHEET, soil: 0xd2d2c8, gloss: 0.55, fade: false };
  if (look === 3) return { leaf: 0x2c5a2e, rib: 0x9cb878, stem: 0x5a6a3c, pot: 0xd8d2c4, soil: 0x3a3026, gloss: 0.6, fade: true };
  return { leaf: 0x244f2a, rib: 0x9ab872, stem: 0x4a5a30, pot: 0xa8552f, soil: 0x2a1e16, gloss: 0.65, fade: false };
}

// small deterministic random, so a plant is the same every time it is built
export function plantRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// One leaf lying in the XZ plane, length along +z from the stalk, normal +y.
// hw(t): half-width 0..0.5 along the leaf; keep(s, t): drops a triangle (the
// monstera's slits and holes). Bent: cupped across, drooping at the tip, a
// slight fold on the midrib. Two-sided (the prop material culls back faces).
export function leafGeo(L, W, hw, { nx = 6, nt = 6, curl = 2, droop = 0.25, heart = 0, keep = null } = {}) {
  const P = [], U = [], S = [];
  for (let j = 0; j <= nt; j++) for (let i = 0; i <= nx; i++) {
    const t = j / nt, u = i / nx - 0.5, s = u * 2;
    const x = s * hw(t) * W;
    const z = t * L + heart * L * (1 - Math.abs(s)) * (1 - t);
    const y = curl * x * x + 0.12 * Math.abs(x) - droop * t * t * L;
    P.push(x, y, z); U.push(u + 0.5, t); S.push(s, t);
  }
  const idx = [];
  for (let j = 0; j < nt; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    for (const tri of [[a, c, b], [b, c, d]]) {
      if (keep) {
        const s = (S[tri[0] * 2] + S[tri[1] * 2] + S[tri[2] * 2]) / 3, t = (S[tri[0] * 2 + 1] + S[tri[1] * 2 + 1] + S[tri[2] * 2 + 1]) / 3;
        if (!keep(s, t)) continue;
      }
      idx.push(...tri);
    }
  }
  const front = new THREE.BufferGeometry();
  front.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  front.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  front.setIndex(idx);
  front.computeVertexNormals();
  const back = front.clone();
  const n = back.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  const bi = Array.from(back.index.array);
  for (let i = 0; i < bi.length; i += 3) { const t = bi[i + 1]; bi[i + 1] = bi[i + 2]; bi[i + 2] = t; }
  back.setIndex(bi);
  const g = mergeGeometries([front, back]);
  front.dispose(); back.dispose();
  return g;
}

// A leaf placed on a plant: base point, azimuth psi (0 = toward the corridor),
// elevation theta above horizontal. Painted midrib; `top` is the plant height
// the fading look measures against.
export function plantLeaf(put, look, geo, L, x, y, z, psi, theta, top, tint = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-theta, psi, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const c = new THREE.Color(), v = new THREE.Vector3(), green = new THREE.Color(look.leaf).offsetHSL(0, 0, tint);
  const pale = new THREE.Color(SHEET), rib = new THREE.Color(look.rib);
  put(geo, look.leaf, look.gloss, m, (px, py, pz) => {
    c.copy(green).lerp(rib, Math.max(0, 1 - Math.abs(px) / (L * 0.06)) * 0.75);
    if (look.fade) {
      const h = v.set(px, py, pz).applyMatrix4(m).y / top;
      const f = Math.min(1, Math.max(0, (h - 0.3) / 0.62, pz / L * 0.4));
      c.lerp(pale, f * f * (3 - 2 * f));
    }
    return c.getHex();
  });
}

// a clay or enamel pot with soil; r = top radius, h = height
function plantPot(put, look, r, h) {
  put(lathe([[0, 0], [r * 0.62, 0], [r * 0.7, h * 0.05], [r * 0.96, h * 0.9], [r, h * 0.94], [r, h], [r * 0.9, h], [r * 0.88, h * 0.94], [0, h * 0.94]], 20), look.pot, look.pot === SHEET ? 0.3 : 0.25);
  put(cyl(r * 0.88, r * 0.88, 0.012, 16), look.soil, 0.05, M(0, h * 0.95, 0));
}

// The ficus. o: pot (draw the clay pot, default), n leaves, seed, size (leaf
// scale), spread (leaf tone variation), aside (turn leaves off a wall behind).
// The defaults are the plant of LIGHT.ficus; plants.js builds others from it.
export function ficusBuild(put, look, { pot: withPot = true, n = 14, seed = 4711, size = 1, spread = 0.03, aside = true } = {}) {
  const rnd = plantRng(seed), pot = { r: 0.15, h: 0.27 };
  const stemTop = 1.32;
  if (withPot) plantPot(put, look, pot.r, pot.h);
  put(cyl(0.011, 0.02, stemTop - pot.h, 7), look.stem, 0.2, M(0.01, (stemTop + pot.h) / 2, 0.0, 0, 0, -0.015));
  // oval, glossy, pointed leaves, alternating up the stem, higher ones pointing up
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    const y = pot.h + 0.22 + f * (stemTop - pot.h - 0.26);
    const L = (0.34 - f * 0.1) * (0.9 + rnd() * 0.2) * size, W = L * 0.62;
    let psi = k * 2.4 + rnd() * 0.3;
    // leaves stay off the wall behind: a leaf pointing at it is turned aside
    if (aside && Math.cos(psi) < -0.55) psi += Math.PI * 0.6;
    const theta = -0.05 + f * 0.6 + (rnd() - 0.5) * 0.2;
    const geo = leafGeo(L, W, t => 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.85), { nx: 4, nt: 5, curl: 2.2, droop: 0.35 - f * 0.15 });
    plantLeaf(put, look, geo, L, 0.01, y, 0, psi, theta, stemTop + 0.2, (rnd() - 0.5) * spread);
  }
  // a last young leaf, unfurled, standing straight up on the crown
  plantLeaf(put, look, leafGeo(0.15, 0.06, t => 0.5 * Math.pow(Math.sin(Math.PI * t), 0.7), { nx: 2, nt: 4, curl: 0, droop: 0 }), 0.15, 0.01, stemTop - 0.02, 0, 0.4, 1.45, stemTop + 0.2);
}
LIGHT.ficus = { depth: 0.5, w: 0.6, solid: true, build: put => ficusBuild(put, plantLook()) };

LIGHT.monstera = { depth: 0.8, w: 1.0, solid: true, build: put => {
  const look = plantLook(), rnd = plantRng(1913), pot = { r: 0.2, h: 0.32 };
  const top = 1.15;
  plantPot(put, look, pot.r, pot.h);
  const n = 8;
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    // fan of leaves, mostly toward the corridor and the sides, none straight at the wall
    const psi = (k % 2 ? 1 : -1) * (0.15 + f * 1.6) + (rnd() - 0.5) * 0.3;
    const ax = Math.sin(psi), az = Math.cos(psi);
    const reach = 0.06 + rnd() * 0.06, hgt = 0.62 + f * 0.38 + rnd() * 0.06;
    const L = 0.38 + rnd() * 0.14 - (Math.abs(psi) > 1.2 ? 0.06 : 0), W = L * 1.1;
    const sx = (rnd() - 0.5) * 0.12, sz = (rnd() - 0.5) * 0.1;
    const bx = ax * reach + sx * 0.4, bz = az * reach + sz * 0.4, by = hgt;
    // the stalk: from the soil, up and a little out, ending under the leaf
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx, pot.h * 0.95, sz),
      new THREE.Vector3(sx + (bx - sx) * 0.3, pot.h + (by - pot.h) * 0.45, sz + (bz - sz) * 0.3),
      new THREE.Vector3(bx - ax * 0.02, by - 0.03, bz - az * 0.02)]);
    put(new THREE.TubeGeometry(curve, 5, 0.008 + (1 - f) * 0.003, 4), look.stem, 0.3, null,
      look.fade ? (px, py) => new THREE.Color(look.stem).lerp(new THREE.Color(SHEET), Math.min(1, Math.max(0, (py / top - 0.3) / 0.65))).getHex() : null);
    // slits from the edge toward the midrib (rows 1,4,7 of 9) and small holes between
    const slit = { '-1': [], '1': [] }, hole = { '-1': [], '1': [] };
    for (const sg of [-1, 1]) {
      for (const j of [1, 4, 7]) if (rnd() < 0.8) slit[sg].push(j);
      for (const j of [2, 3, 5, 6]) if (rnd() < 0.5 && !slit[sg].some(q => Math.abs(q - j) === 1)) hole[sg].push(j);
    }
    const keep = (s, t) => {
      const sg = s < 0 ? -1 : 1, a = Math.abs(s), row = t * 9;
      if (a > 0.28 && slit[sg].some(j => Math.abs(row - (j + 0.5)) < 0.55)) return false;
      if (a > 0.28 && a < 0.62 && hole[sg].some(j => Math.abs(row - (j + 0.5)) < 0.55)) return false;
      return true;
    };
    // heart outline: broad shoulders near the base, drawn to a point
    const geo = leafGeo(L, W, t => 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.75) + 0.16 * (1 - t) * (1 - t),
      { nx: 8, nt: 9, curl: 2.4, droop: 0.4, heart: 0.1, keep });
    plantLeaf(put, look, geo, L, bx, by, bz, psi, 0.05 + rnd() * 0.3 + f * 0.1, top + 0.15, (rnd() - 0.5) * 0.03);
  }
} };

// ── materials of the light ──────────────────────────────────────────────────
function laceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  g.beginPath(); g.arc(0, 0, 58, 0, 7); g.fill();                    // the linen centre (cranes sample it)
  g.lineWidth = 3;
  for (const r of [62, 84, 104]) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
  for (let i = 0; i < 36; i++) {                                       // spokes and petals of thread
    const a = i / 36 * Math.PI * 2;
    g.beginPath(); g.moveTo(Math.cos(a) * 62, Math.sin(a) * 62); g.lineTo(Math.cos(a) * 104, Math.sin(a) * 104); g.stroke();
    g.beginPath(); g.ellipse(Math.cos(a + 0.087) * 94, Math.sin(a + 0.087) * 94, 6, 3, a, 0, 7); g.fill();
  }
  for (let i = 0; i < 24; i++) {                                       // the scalloped edge
    const a = i / 24 * Math.PI * 2;
    g.beginPath(); g.arc(Math.cos(a) * 112, Math.sin(a) * 112, 13, a - 1.6, a + 1.6); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const FLOAT_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute vec3 aCenter;
attribute vec3 aFloat;          // phase, kind (0 lace, 1 crane), wing (1 at the tips)
uniform float uTime;
uniform vec3 uPlayer;
uniform float uWaterLevel;
varying vec2 vUv;
varying float vShade;
vec2 turn(vec2 v, float a){ return vec2(v.x * cos(a) - v.y * sin(a), v.x * sin(a) + v.y * cos(a)); }
void main(){
  vec3 p = position, c = aCenter;
  float ph = aFloat.x, t = uTime;
  if (aFloat.y < 0.5) {                     // lace: afloat on the water, turning slowly as the current takes it
    p.xz = turn(p.xz, t * 0.08 + ph);
    c.xz += vec2(sin(t * 0.07 + ph), cos(t * 0.05 + ph * 1.3)) * 0.4;
    c.y = uWaterLevel + 0.006 + sin(t * 0.9 + ph) * 0.002;
    vShade = 0.92;
  } else {                                  // crane: circling, wings beating slowly
    float a = t * 0.35 + ph;
    p.y += aFloat.z * sin(t * 5.0 + ph * 3.0) * 0.05;
    p.xz = turn(p.xz, a + 1.5708);
    c += vec3(cos(a) * 0.5, sin(t * 0.8 + ph) * 0.08, sin(a) * 0.5);
    vShade = 0.74 + 0.2 * aFloat.z;          // paper in the light: a little grey, so it reads against it
  }
  // shy of the visitor: rise and drift away when they come close
  vec2 d = c.xz - uPlayer.xz;
  float shy = smoothstep(3.2, 1.0, length(d));
  if (aFloat.y > 0.5) c.y = min(c.y + shy * 0.45, 3.0);   // a crane rises; lace only drifts off on the water
  c.xz += normalize(d + 1e-4) * shy * 0.35;
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(c + p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FLOAT_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
varying vec2 vUv;
varying float vShade;
void main(){
  if (texture2D(uMap, vUv).a < 0.4) discard;
  gl_FragColor = vec4(vec3(1.0, 0.985, 0.95) * vShade, 1.0);
  #include <fog_fragment>
}`;

const TULLE_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute float aPhase;
uniform float uTime;
uniform float uWaterLevel;
varying vec2 vUv;
varying float vWorldY;
void main(){
  float hang = 1.0 - uv.y;                  // pinned at the rail, free at the hem
  float k = (position.x + position.z) * 4.0;
  // wet at the foot: the water drags on the cloth, so it hangs closer to
  // still there than it sways above the waterline
  float wet = smoothstep(uWaterLevel + 0.12, uWaterLevel - 0.05, position.y);
  float breath = (sin(uTime * 0.9 + k + aPhase) * 0.07 + sin(uTime * 0.53 + k * 2.3) * 0.03) * mix(1.0, 0.3, wet);
  vec3 p = position + normal * (hang * breath + sin(k * 4.5) * 0.02 * mix(1.0, 0.4, wet));
  vUv = uv;
  vWorldY = position.y;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const TULLE_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform float uWaterLevel;
varying vec2 vUv;
varying float vWorldY;
// Lace tulle: a fine net, gathered into soft folds, a band of lace flowers
// above a scalloped hem, sprigs scattered over the rest. Where the folds
// crowd the cloth doubles and reads denser. Where the hem trails in the
// water it darkens, clings and holds still.
float ring(vec2 p, float r, float w){ return smoothstep(w, 0.0, abs(length(p) - r)); }
void main(){
  vec2 uv = vUv;
  float hem = 0.018 + 0.016 * abs(sin(uv.x * 3.14159 * 26.0));      // scallops along the bottom
  if (uv.y < hem) discard;
  float folds = 0.5 + 0.5 * sin(uv.x * 58.0 + sin(uv.x * 11.0) * 2.4);
  vec2 n = abs(fract(uv * vec2(260.0, 520.0)) - 0.5);                  // the net's threads
  float net = smoothstep(0.36, 0.5, max(n.x, n.y));
  // lace flowers: a band near the hem, sparse sprigs above
  vec2 cell = vec2(1.0 / 13.0, 0.055);
  vec2 q = (fract(uv / cell) - 0.5) * cell * vec2(1.0, 2.2) * 30.0;
  float flower = max(ring(q, 0.42, 0.09), ring(q, 0.18, 0.08));
  for (int k = 0; k < 6; k++) { float a = float(k) * 1.0472; flower = max(flower, ring(q - vec2(cos(a), sin(a)) * 0.62, 0.2, 0.07)); }
  float band = smoothstep(0.24, 0.2, uv.y) * step(hem + 0.02, uv.y);
  float sprig = step(0.8, fract(sin(dot(floor(uv / cell), vec2(12.9898, 78.233))) * 43758.5)) * step(0.3, uv.y);
  float motif = flower * max(band, sprig * 0.8);
  float a = 0.16 + 0.22 * net + 0.2 * folds + 0.4 * motif;
  vec3 col = vec3(0.9, 0.9, 0.87) * (0.84 + 0.16 * folds) + 0.08 * motif;   // a shade darker than the light, so the folds read
  float wet = smoothstep(uWaterLevel + 0.12, uWaterLevel - 0.05, vWorldY);
  col = mix(col, col * vec3(0.5, 0.55, 0.62), wet * 0.65);                 // darker, grey, clinging
  a = mix(a, min(1.0, a + 0.25), wet);                                     // slightly more solid, less see-through
  float meniscus = smoothstep(0.035, 0.0, abs(vWorldY - uWaterLevel));
  col += meniscus * 0.35;                                                  // a thin bright line at the waterline
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;

// a paper crane, nose along +x: body, two wings (tips flagged), neck, tail
function craneGeometry() {
  const P = [], W = [];
  const tri = (a, b, c, w = [0, 0, 0]) => { P.push(...a, ...b, ...c); W.push(...w); };
  tri([0.1, 0, 0], [0, 0.03, 0], [-0.1, 0, 0]);                              // body ridge
  tri([0.1, 0, 0], [-0.1, 0, 0], [0, -0.02, 0]);
  tri([0.05, 0.01, 0], [-0.05, 0.01, 0], [0, 0.03, 0.16], [0, 0, 1]);       // wings
  tri([0.05, 0.01, 0], [-0.05, 0.01, 0], [0, 0.03, -0.16], [0, 0, 1]);
  tri([0.06, 0, 0], [0.1, 0, 0], [0.16, 0.1, 0]);                           // neck and head
  tri([-0.06, 0, 0], [-0.1, 0, 0], [-0.16, 0.08, 0]);                       // tail
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(P.length / 3 * 2).fill(0.5), 2));
  g.userData.wing = W;
  return g;
}

// ── the kit ─────────────────────────────────────────────────────────────────
// The lace tulle of the light's windows, also hung in grandmother's room
// (kitchen.js). Its geometry needs an aPhase attribute; uTime drives the
// sway, uWaterLevel (far below by default) where the hem turns wet.
export function tulleMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uWaterLevel: { value: -10 } }]),
    vertexShader: TULLE_VERT, fragmentShader: TULLE_FRAG, side: THREE.DoubleSide, fog: true,
    transparent: true, depthWrite: false });
}

export function createPropKit(atmo, quality = { tier: 2 }) {
  const geos = new Map();
  const geoOf = (stage, name) => {
    const key = stage + name;
    if (!geos.has(key)) { const d = [FEAR, MEMORY, LIGHT][stage][name]; geos.set(key, shape(d.build, d.crumple || 0)); }
    return geos.get(key);
  };
  const mat = atmo.prop({ vertexColors: true, rust: 0.15 });
  // the light's dust sheets: rough linen (Poly Haven, CC0), weave and normals
  const linenTex = (f) => {
    const t = new THREE.TextureLoader().load(`assets/textures/${f}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
    return t;
  };
  const sheetMat = atmo.prop({ vertexColors: true, rust: 0, cloth: { map: linenTex('linen_detail.webp'), normal: linenTex('linen_normal.webp') } });
  const uniforms = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3() }, uWaterLevel: { value: 0 } };
  const fogU = THREE.UniformsLib.fog;
  const floatMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([fogU, { uMap: { value: laceTexture() } }]),
    vertexShader: FLOAT_VERT, fragmentShader: FLOAT_FRAG, side: THREE.DoubleSide, fog: true });
  floatMat.uniforms.uTime = uniforms.uTime; floatMat.uniforms.uPlayer = uniforms.uPlayer; floatMat.uniforms.uWaterLevel = uniforms.uWaterLevel;
  const tulleMat = tulleMaterial();
  tulleMat.uniforms.uTime = uniforms.uTime; tulleMat.uniforms.uWaterLevel = uniforms.uWaterLevel;
  const crane = craneGeometry(), lace = new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2 + 0.25).toNonIndexed();

  // kinds a stage can leave on the floor, with weights
  const KINDS = [
    [['chair', 1.2], ['bucket', 1.5], ['bottles', 1.5], ['box', 1.2], ['oxygen', 1], ['drip', 2], ['wheelchair', 1.5], ['gurney', 1], ['screen', 1.3], ['cabinet', 1.8], ['scales', 1], ['window', 0.8]],
    [['nevalyashka', 3], ['pyramid', 3], ['yula', 2], ['matryoshki', 3], ['ball', 2], ['slippers', 2], ['stool', 1.5], ['jars', 1.5], ['newspapers', 1]],
    [['armchair', 2], ['mirror', 1.5], ['piano', 1], ['window', 3]],   // no sheeted chair: it read as anything but; plants wait for the drafts (#39)
  ];
  const pick = (stage, r, allowWindow = true) => {
    const list = allowWindow ? KINDS[stage] : KINDS[stage].filter(([name]) => name !== 'window');
    const total = list.reduce((s, [, w]) => s + w, 0);
    let x = r * total;
    for (const [name, w] of list) { if ((x -= w) <= 0) return name; }
    return list[0][0];
  };

  // The collision footprint of a prop, as ward.js's boxes: four wall segments.
  const box = (x, z, w, d, rot) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (u, v) => ({ x: x + u * c + v * s, z: z - u * s + v * c });
    const a = P(-w / 2, -d / 2), b = P(w / 2, -d / 2), e = P(w / 2, d / 2), f = P(-w / 2, d / 2);
    const seg = (p, q) => { const mx = (p.x + q.x) / 2 - x, mz = (p.z + q.z) / 2 - z, l = Math.hypot(mx, mz) || 1; return { a: p, b: q, nx: mx / l, nz: mz / l }; };
    return { x, z, r: Math.hypot(w, d) / 2, segs: [seg(a, b), seg(b, e), seg(e, f), seg(f, a)] };
  };

  return {
    // group: the chunk's group · stage: 0 fear, 1 memory, 2 light · walls:
    // [{ x, z, nx, nz, r, run3 }] floor spots against a wall (x, z = the
    // wall face point, n = into the corridor, r = a random 0..1, run3 =
    // the wall keeps going at least 3 cells, so a window fits) · air:
    // [{ x, z, r }] cell centres for things that float (light only)
    build(group, stage, walls, air) {
      const parts = [], windows = [], tulles = [], floats = [], boxes = [], feet = [], sheets = [];
      for (const s of walls) {
        const name = pick(stage, s.r, s.run3 !== false);
        const rot = Math.atan2(s.nx, s.nz);
        if (name === 'window') {                   // light where a window should be, tulle before it
          // a window is merged geometry, so it cannot lie down: with no wall behind it is not built
          const held = [-0.78, 0, 0.78].every(k => wallBehind(s.x - s.nz * k, s.z + s.nx * k, s.nx, s.nz));
          record({ kind: 'window', x: s.x, z: s.z, y: 1.7, mount: 'wall', ok: held, why: held ? undefined : 'no wall behind, window skipped', parent: group });
          if (!held) continue;
          const wm = M(s.x + s.nx * 0.012, 1.7, s.z + s.nz * 0.012, 0, rot);
          windows.push(paneAttributes(new THREE.PlaneGeometry(0.9, 1.3).applyMatrix4(wm), s.nz, -s.nx, s.r * 7.31 % 1));   // each pane its own part of the chunk's view
          for (const [bw, bh, by] of [[0.95, 0.05, 2.37], [0.95, 0.05, 1.03], [0.04, 1.3, 1.7]]) {
            const g = shape(put => put(new THREE.BoxGeometry(bw, bh, 0.03), stage === 0 ? 0x7d7f78 : 0xd8d2c4, 0.1));   // the hospital's frames gone grey
            parts.push(g.applyMatrix4(M(s.x + s.nx * 0.03, by, s.z + s.nz * 0.03, 0, rot)));
          }
          // the rod the tulle hangs from: a brass-coloured pole on two
          // brackets, a knob at each end, and small rings along it
          parts.push(shape(put => {
            put(cyl(0.012, 0.012, 1.55, 10), 0xb89a5a, 0.6, M(0, 0, 0, 0, 0, Math.PI / 2));
            for (const x of [-0.8, 0.8]) put(sphere(0.028, 10, 8), 0xc9a862, 0.7, M(x, 0, 0));
            for (const x of [-0.62, 0.62]) put(new THREE.BoxGeometry(0.018, 0.018, 0.16), 0x8a7440, 0.5, M(x, 0, -0.08));
            for (let k = 0; k < 11; k++) put(new THREE.TorusGeometry(0.02, 0.004, 4, 10), 0xb89a5a, 0.6, M(-0.55 + k * 0.11, -0.005, 0, 0, Math.PI / 2));
          }).applyMatrix4(M(s.x + s.nx * 0.16, 2.6, s.z + s.nz * 0.16, 0, rot)));
          // the light's tulle falls to the floor; the hospital's is cut off at the sill
          const tg = (stage === 0 ? new THREE.PlaneGeometry(1.2, 1.6, 12, 15).translate(0, 1.8, 0) : new THREE.PlaneGeometry(1.2, 2.58, 12, 24).translate(0, 1.29, 0))
            .applyMatrix4(M(s.x + s.nx * 0.14, 0, s.z + s.nz * 0.14, 0, rot));
          tg.setAttribute('aPhase', new THREE.Float32BufferAttribute(new Array(tg.attributes.position.count).fill(s.r * 40), 1));
          tulles.push(tg);
          continue;
        }
        const d = [FEAR, MEMORY, LIGHT][stage][name];
        const yaw = rot + (d.toy ? (s.r * 97 % 1 - 0.5) * 1.2 : (s.r * 53 % 1 - 0.5) * 0.25);
        // turned a little off the wall, a corner swings back toward it: clear
        // that too, and a sheet's folds and hem stand proud of its shape
        const swing = d.toy ? 0 : Math.abs(Math.sin(yaw - rot)) * d.w / 2;
        const off = 0.02 + d.depth / 2 + swing + (stage === 2 ? 0.06 : 0) + (d.toy ? 0.05 + s.r * 0.25 : 0);   // toys lie a little further out, as dropped
        const x = s.x + s.nx * off, z = s.z + s.nz * off;
        const geo = geoOf(stage, name);
        if (!geo.boundingBox) geo.computeBoundingBox();
        (stage === 2 ? sheets : parts).push(geo.clone().applyMatrix4(M(x, 0, z, 0, yaw)));   // the light's things are all under sheets
        if (d.solid) boxes.push(box(x, z, d.w, d.depth, yaw));
        feet.push({ x, z, w: d.w, d: d.depth, rot: yaw, k: d.toy ? 0.7 : 1, h: geo.boundingBox.max.y });
      }
      for (const a of air) {                        // lace alone, cranes in threes
        const cranes = a.r > 0.6, n = cranes ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const src = cranes ? crane : lace;
          const g = src.clone(), cnt = g.attributes.position.count;
          const cy = cranes ? 2.45 + k * 0.12 : 1.95 + a.r * 0.5;
          g.setAttribute('aCenter', new THREE.Float32BufferAttribute(Array.from({ length: cnt }, () => [a.x, cy, a.z]).flat(), 3));
          const wing = src.userData.wing || [];
          g.setAttribute('aFloat', new THREE.Float32BufferAttribute(Array.from({ length: cnt }, (_, i) =>
            [a.r * 50 + k * 2.1, cranes ? 1 : 0, wing[i] || 0]).flat(), 3));
          if (!g.attributes.normal) g.computeVertexNormals();
          floats.push(g);
        }
      }
      const meshes = [];
      const add = (list, material) => {
        if (!list.length) return;
        const g = mergeGeometries(list);
        for (const l of list) l.dispose();
        const m = new THREE.Mesh(g, material);
        m.userData.keepMaterial = true;             // shared: the chunk's disposal frees only the geometry
        m.frustumCulled = material !== floatMat;    // floaters move in the shader, away from their bounds
        group.add(m); meshes.push(m);
      };
      // one view out of all the chunk's windows, each pane showing its own part of it
      const viewMat = windows.length ? viewMaterial(nextView(stage === 0 ? 'fear' : 'light'), { dirt: stage === 0 ? 1 : 0, time: uniforms.uTime }) : null;
      add(parts, mat); add(sheets, sheetMat); add(windows, viewMat); add(tulles, tulleMat); add(floats, floatMat);
      const shade = contactShadows(feet);
      if (shade) { group.add(shade); meshes.push(shade); }
      return {
        boxes, walls, air, count: walls.length + air.length,
        dispose() { for (const m of meshes) { group.remove(m); m.geometry.dispose(); } viewMat?.userData.release(); },
      };
    },
    // A child's corner in the red rooms: toys left on and round a rug.
    // items: [{ name, x, z, yaw }] from MEMORY. One mesh, their shadows.
    toys(group, items) {
      const parts = [], feet = [], boxes = [];
      for (const it of items) {
        const d = MEMORY[it.name], geo = geoOf(1, it.name);
        if (!geo.boundingBox) geo.computeBoundingBox();
        parts.push(geo.clone().applyMatrix4(M(it.x, 0.004, it.z, 0, it.yaw)));
        feet.push({ x: it.x, z: it.z, w: d.w, d: d.depth, rot: it.yaw, k: 0.7, h: geo.boundingBox.max.y });
        if (d.solid) boxes.push(box(it.x, it.z, d.w, d.depth, it.yaw));
      }
      const meshes = [];
      if (parts.length) {
        const m = new THREE.Mesh(mergeGeometries(parts), mat);
        for (const p of parts) p.dispose();
        m.userData.keepMaterial = true;
        group.add(m); meshes.push(m);
      }
      const shade = contactShadows(feet);
      if (shade) { group.add(shade); meshes.push(shade); }
      return { meshes, boxes };
    },
    update(time, px, pz, waterLevel = 0) { uniforms.uTime.value = time; uniforms.uPlayer.value.set(px, 0, pz); uniforms.uWaterLevel.value = waterLevel; },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
