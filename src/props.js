import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';
import { roundedBox } from './geom.js';
import { contactShadows } from './shadows.js';

// ── conspace-rooms · props.js ───────────────────────────────────────────────
// Things left along the corridors, so that hardly a corridor is quite empty.
// Each stage leaves its own:
//   FEAR       a tube chair, a bucket and mop, bottles, a cardboard box, an
//              oxygen cylinder
//   MEMORY     the toys every Soviet child had (неваляшка, пирамидка, юла,
//              матрёшки, a two-colour ball), slippers, a
//              stool, jars of preserves, a tied stack of newspapers
//   ACCEPTANCE furniture under white sheets, windows with nothing but light
//              behind a breathing tulle, lace napkins adrift in the air and
//              paper cranes circling under the ceiling, shy of the visitor
// Every shape is built once from primitives (no downloads) and baked with
// vertex colours (rgb + gloss in alpha, as in ward.js and eggs.js). A chunk
// merges all of its grounded things into one mesh lit by atmo.prop(), plus
// at most three more draw calls in the light: windows, tulle, floaters.
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
function shape(build, crumple = 0) {
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
  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  if (crumple) {                                   // cloth: soft folds pushed along the normals
    const p = geo.attributes.position, n = geo.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const f = crumple * (Math.sin(x * 23 + y * 7) * Math.sin(z * 19 - y * 11) + 0.5 * Math.sin(y * 31 + x * 13));
      p.setXYZ(i, x + n.getX(i) * f, y + Math.max(0, n.getY(i)) * f * 0.3, z + n.getZ(i) * f);
    }
    geo.computeVertexNormals();
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
    put(roundedBox(0.46, 0.08, 0.46, 0.03, 4), SHEET, 0.08, M(0, 0.47, 0));
    put(roundedBox(0.46, 0.45, 0.1, 0.03, 4), SHEET, 0.08, M(0, 0.74, -0.19));
    put(new THREE.CylinderGeometry(0.33, 0.37, 0.44, 12, 3, true), SHEET, 0.08, M(0, 0.22, 0, 0, Math.PI / 4));
  } },
  armchair: { depth: 0.75, w: 0.85, solid: true, crumple: 0.018, build: put => {
    put(roundedBox(0.82, 0.48, 0.7, 0.12, 4), SHEET, 0.08, M(0, 0.24, 0));
    put(roundedBox(0.82, 0.5, 0.22, 0.08, 4), SHEET, 0.08, M(0, 0.7, -0.24));
    for (const x of [-0.34, 0.34]) put(roundedBox(0.16, 0.2, 0.7, 0.07, 3), SHEET, 0.08, M(x, 0.56, 0));
  } },
  mirror: { depth: 0.36, w: 0.72, solid: true, crumple: 0.01, build: put => {
    put(roundedBox(0.7, 1.7, 0.12, 0.04, 4), SHEET, 0.08, M(0, 0.9, 0, -0.08));
    put(new THREE.CylinderGeometry(0.38, 0.46, 0.06, 14, 1), SHEET, 0.08, M(0, 0.03, 0.06, 0, 0, 0, 1, 1, 0.55));
  } },
  piano: { depth: 0.6, w: 1.3, solid: true, crumple: 0.016, build: put => {
    put(roundedBox(1.3, 1.1, 0.55, 0.06, 4), SHEET, 0.08, M(0, 0.55, 0));
    put(new THREE.CylinderGeometry(0.7, 0.76, 0.3, 16, 2, true), SHEET, 0.08, M(0, 0.15, 0, 0, 0, 0, 1, 1, 0.45));
  } },
};

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
varying vec2 vUv;
varying float vShade;
vec2 turn(vec2 v, float a){ return vec2(v.x * cos(a) - v.y * sin(a), v.x * sin(a) + v.y * cos(a)); }
void main(){
  vec3 p = position, c = aCenter;
  float ph = aFloat.x, t = uTime;
  if (aFloat.y < 0.5) {                     // lace: a slow turn and a breath up and down
    p.xz = turn(p.xz, t * 0.15 + ph);
    c.y += sin(t * 0.6 + ph) * 0.08;
    vShade = 1.0;
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
  c.y = min(c.y + shy * 0.45, 3.0);
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

const WINDOW_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
// Petersburg out the glass: the Neva under a white night, low silver-grey
// water below a thin dark horizon, straw-to-lilac sky above, rain running
// down. uRain is 0 on tier 0: the drops sit still, nothing streams.
const WINDOW_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform float uRain;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  // a low horizon; the water mirrors the same white-night sky, only a little
  // dimmer and greyer, so the pane reads as one light, not dark below / bright above
  float horizon = 0.3;
  float ts = clamp((uv.y - horizon) / (1.0 - horizon), 0.0, 1.0);
  vec3 sky = mix(vec3(0.93, 0.85, 0.68), vec3(0.86, 0.84, 0.93), ts);   // warm straw near the water, pale lilac above
  float tw = clamp((horizon - uv.y) / horizon, 0.0, 1.0);
  vec3 skyM = mix(vec3(0.93, 0.85, 0.68), vec3(0.86, 0.84, 0.93), tw);  // the sky upside down in the water
  vec3 water = mix(skyM, vec3(0.62, 0.64, 0.68), 0.35) * 0.9;
  float glint = pow(max(0.0, sin(uv.x * 46.0 + uTime * uRain * 0.5 + tw * 9.0)), 24.0);
  water += glint * 0.12 * (1.0 - tw);                                    // slow moving glints near the far shore
  vec3 col = mix(water, sky, smoothstep(horizon - 0.015, horizon + 0.015, uv.y));
  col *= 1.0 - 0.12 * exp(-pow((uv.y - horizon) / 0.01, 2.0));           // the far embankment, a thin soft line
  // rain: streaks that run, drops that sit still on tier 0 (uRain = 0)
  vec2 ruv = uv * vec2(9.0, 13.0);
  float col1 = floor(ruv.x);
  float speed = 0.5 + hash(vec2(col1, 0.0)) * 0.7;
  float fall = uTime * uRain * 1.5 * speed;
  float y = fract(ruv.y + fall - hash(vec2(col1, 1.0)) * 11.0);   // + fall: the pattern slides down the pane
  float streak = smoothstep(0.08, 0.0, abs(fract(ruv.x) - 0.5)) * smoothstep(0.85, 0.55, y);
  col = mix(col, min(vec3(1.0), col * 1.3 + 0.04), streak * 0.5);
  gl_FragColor = vec4(col, 1.0);
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
export function createPropKit(atmo, quality = { tier: 2 }) {
  const geos = new Map();
  const geoOf = (stage, name) => {
    const key = stage + name;
    if (!geos.has(key)) { const d = [FEAR, MEMORY, LIGHT][stage][name]; geos.set(key, shape(d.build, d.crumple || 0)); }
    return geos.get(key);
  };
  const mat = atmo.prop({ vertexColors: true, rust: 0.15 });
  const uniforms = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3() }, uWaterLevel: { value: 0 } };
  const fogU = THREE.UniformsLib.fog;
  // the Neva out the glass, white night, rain: static drops on tier 0
  const windowMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([fogU, { uRain: { value: quality.tier === 0 ? 0 : 1 } }]),
    vertexShader: WINDOW_VERT, fragmentShader: WINDOW_FRAG, fog: true });
  windowMat.uniforms.uTime = uniforms.uTime;
  const floatMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([fogU, { uMap: { value: laceTexture() } }]),
    vertexShader: FLOAT_VERT, fragmentShader: FLOAT_FRAG, side: THREE.DoubleSide, fog: true });
  floatMat.uniforms.uTime = uniforms.uTime; floatMat.uniforms.uPlayer = uniforms.uPlayer;
  const tulleMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([fogU, {}]),
    vertexShader: TULLE_VERT, fragmentShader: TULLE_FRAG, side: THREE.DoubleSide, fog: true,
    transparent: true, depthWrite: false });
  tulleMat.uniforms.uTime = uniforms.uTime; tulleMat.uniforms.uWaterLevel = uniforms.uWaterLevel;
  const crane = craneGeometry(), lace = new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2 + 0.25).toNonIndexed();

  // kinds a stage can leave on the floor, with weights
  const KINDS = [
    [['chair', 3], ['bucket', 2], ['bottles', 3], ['box', 2], ['oxygen', 1]],
    [['nevalyashka', 3], ['pyramid', 3], ['yula', 2], ['matryoshki', 3], ['ball', 2], ['slippers', 2], ['stool', 1.5], ['jars', 1.5], ['newspapers', 1]],
    [['armchair', 2], ['mirror', 1.5], ['piano', 1], ['window', 3]],   // no sheeted chair: it read as anything but
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
      const parts = [], windows = [], tulles = [], floats = [], boxes = [], feet = [];
      for (const s of walls) {
        const name = pick(stage, s.r, s.run3 !== false);
        const rot = Math.atan2(s.nx, s.nz);
        if (name === 'window') {                   // light where a window should be, tulle before it
          const wm = M(s.x + s.nx * 0.012, 1.7, s.z + s.nz * 0.012, 0, rot);
          windows.push(new THREE.PlaneGeometry(0.9, 1.3).applyMatrix4(wm));
          for (const [bw, bh, by] of [[0.95, 0.05, 2.37], [0.95, 0.05, 1.03], [0.04, 1.3, 1.7]]) {
            const g = shape(put => put(new THREE.BoxGeometry(bw, bh, 0.03), 0xd8d2c4, 0.1));
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
          const tg = new THREE.PlaneGeometry(1.2, 2.58, 12, 24).applyMatrix4(M(s.x + s.nx * 0.14, 1.29, s.z + s.nz * 0.14, 0, rot));
          tg.setAttribute('aPhase', new THREE.Float32BufferAttribute(new Array(tg.attributes.position.count).fill(s.r * 40), 1));
          tulles.push(tg);
          continue;
        }
        const d = [FEAR, MEMORY, LIGHT][stage][name];
        const off = 0.02 + d.depth / 2 + (d.toy ? 0.05 + s.r * 0.25 : 0);   // toys lie a little further out, as dropped
        const x = s.x + s.nx * off, z = s.z + s.nz * off;
        const yaw = rot + (d.toy ? (s.r * 97 % 1 - 0.5) * 1.2 : (s.r * 53 % 1 - 0.5) * 0.25);
        const geo = geoOf(stage, name);
        if (!geo.boundingBox) geo.computeBoundingBox();
        parts.push(geo.clone().applyMatrix4(M(x, 0, z, 0, yaw)));
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
      add(parts, mat); add(windows, windowMat); add(tulles, tulleMat); add(floats, floatMat);
      const shade = contactShadows(feet);
      if (shade) { group.add(shade); meshes.push(shade); }
      return {
        boxes, walls, air, count: walls.length + air.length,
        dispose() { for (const m of meshes) { group.remove(m); m.geometry.dispose(); } },
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
