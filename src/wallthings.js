import * as THREE from 'three';
import { shape } from './props.js';
import { roundedBox } from './geom.js';
import { mountOrDrop } from './placement.js';

// ── conspace-rooms · wallthings.js ──────────────────────────────────────────
// Small things hung on the corridor walls (#43, C4), each its own mesh so the
// event director (events.js) can take one down: it comes off its nail, falls,
// knocks on the floor or goes under the water, and lies there after.
//   FEAR    a round institutional clock stopped at 12:24, a framed notice
//           with a stamp, a wall calendar on the 24th
//   MEMORY  a painted plate, a sepia portrait in a wooden frame, a wooden
//           clock, a tear-off calendar on the 24th
//   LIGHT   nothing: nothing falls in the light
// Shapes are built once from primitives with vertex colours (props.js shape)
// and shared between chunks; one material, lit by atmo.prop() like the props.

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
const faceOut = (geo) => geo.rotateX(Math.PI / 2);           // a lathe or cylinder's axis turned from y to +z

// seven-segment digits, painted per vertex: u, v in 0..1 of the digit's cell
const SEG = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011'];
function digitInk(d, u, v) {
  const s = SEG[d], t = 0.16;
  const h = (y) => Math.abs(v - y) < t / 2 && u > t && u < 1 - t;
  const vl = (x, y0, y1) => Math.abs(u - x) < t / 2 + 0.02 && v > y0 && v < y1;
  return (s[0] === '1' && h(1 - t / 2)) || (s[6] === '1' && h(0.5)) || (s[3] === '1' && h(t / 2))
    || (s[1] === '1' && vl(1 - t / 2, 0.5, 1)) || (s[2] === '1' && vl(1 - t / 2, 0, 0.5))
    || (s[5] === '1' && vl(t / 2, 0.5, 1)) || (s[4] === '1' && vl(t / 2, 0, 0.5));
}

// a clock face: ticks round the rim and the hands at hh:mm, all in the face's plane (z = 0 front)
function clockFace(put, R, rim, face, ink, hh, mm, { second = null, roman = false } = {}) {
  put(faceOut(new THREE.CylinderGeometry(R, R, 0.03, 40)), rim, 0.55, M(0, 0, 0.015));
  put(new THREE.TorusGeometry(R, 0.012, 8, 40), rim, 0.7, M(0, 0, 0.032));
  put(faceOut(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 0.004, 40)), face, 0.25, M(0, 0, 0.032));
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2, big = k % 3 === 0;
    const l = roman ? 0.022 : big ? 0.03 : 0.016, w = roman ? (big ? 0.012 : 0.006) : big ? 0.009 : 0.005;
    put(new THREE.BoxGeometry(w, l, 0.002), ink, 0.1, M(Math.sin(a) * R * 0.76, Math.cos(a) * R * 0.76, 0.035, 0, 0, -a));
  }
  const hand = (len, w, a, col, z) => put(new THREE.BoxGeometry(w, len, 0.003), col, 0.4, M(Math.sin(a) * len * 0.4, Math.cos(a) * len * 0.4, z, 0, 0, -a));
  hand(R * 0.5, 0.012, ((hh % 12) + mm / 60) / 12 * Math.PI * 2, ink, 0.038);
  hand(R * 0.74, 0.008, mm / 60 * Math.PI * 2, ink, 0.041);
  if (second) hand(R * 0.8, 0.003, 0.61 * Math.PI * 2, second, 0.044);
  put(faceOut(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10)), ink, 0.6, M(0, 0, 0.045));
}

const BUILD = {
  // fear: the black bakelite clock over every ward door, stopped at 12:24
  fearClock: { w: 0.17, h: 0.17, build: put => clockFace(put, 0.16, 0x151515, 0xe8e6dc, 0x1a1a1a, 12, 24, { second: 0xb01818 }) },
  // fear: a notice under glass in a thin aluminium frame, typed lines and a round violet stamp
  notice: {
    w: 0.13, h: 0.18, build: put => {
      for (const [bw, bh, x, y] of [[0.25, 0.012, 0, 0.169], [0.25, 0.012, 0, -0.169], [0.012, 0.35, 0.119, 0], [0.012, 0.35, -0.119, 0]])
        put(new THREE.BoxGeometry(bw, bh, 0.014), 0xa8aca8, 0.8, M(x, y, 0.007));
      put(new THREE.PlaneGeometry(0.226, 0.326, 40, 58), 0xe6e2d4, 0.2, M(0, 0, 0.006), (x, y) => {
        const u = (x + 0.113) / 0.226, v = (y + 0.163) / 0.326;
        if (Math.hypot(u - 0.72, v - 0.2) < 0.11 && Math.hypot(u - 0.72, v - 0.2) > 0.075) return 0x6a4a8a;   // the stamp's ring
        if (v > 0.84 && v < 0.88 && u > 0.3 && u < 0.7) return 0x2a2a2a;                                   // the heading
        const line = (v * 30) % 1, row = Math.floor(v * 30);
        if (v > 0.3 && v < 0.78 && line < 0.4 && u > 0.1 && u < 0.9 - (row * 0.37 % 0.3)) return 0x5a5a58;   // typed lines, ragged
        if (v > 0.15 && v < 0.2 && u > 0.12 && u < 0.45) return 0x3a3a60;                                 // a signature
        return null;
      });
    },
  },
  // fear and memory: a wall calendar, the month on red, a big date below, tear-off sheets
  calendar: {
    w: 0.1, h: 0.14, build: put => {
      put(roundedBox(0.19, 0.27, 0.006, 0.004), 0x7a5a3a, 0.2, M(0, 0, 0.003));
      put(new THREE.BoxGeometry(0.15, 0.15, 0.02), 0xefece2, 0.15, M(0, -0.05, 0.016));
      const date = 24;                                              // John 12:24, as every clock and calendar here
      put(new THREE.PlaneGeometry(0.15, 0.15, 36, 36), 0xf4f1e6, 0.15, M(0, -0.05, 0.0265), (x, y) => {
        const u = (x + 0.075) / 0.15, v = (y + 0.075) / 0.15;
        if (v > 0.8) return 0xb42020;                                                    // the month's band
        const d = [Math.floor(date / 10), date % 10];
        for (let k = 0; k < 2; k++) {
          const u0 = 0.2 + k * 0.32, uu = (u - u0) / 0.26, vv = (v - 0.18) / 0.5;
          if (uu >= 0 && uu <= 1 && vv >= 0 && vv <= 1 && digitInk(d[k], uu, vv)) return 0x1c1c1c;
        }
        if (v < 0.1 && u > 0.3 && u < 0.7) return 0x8a8a84;                              // the weekday
        return null;
      });
      put(new THREE.BoxGeometry(0.19, 0.08, 0.004), 0xc9a860, 0.3, M(0, 0.095, 0.009));  // the printed picture above
      put(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 8).rotateX(Math.PI / 2), 0x333333, 0.6, M(0, 0.125, 0.01));   // the nail hole's eyelet
    },
  },
  // memory: a painted plate, cobalt rim and a gold line, flowers in the well
  plate: {
    w: 0.12, h: 0.12, build: put => {
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const r = k / 16 * 0.12;
        pts.push(new THREE.Vector2(r, r < 0.07 ? 0.004 : r < 0.1 ? 0.004 + (r - 0.07) * 0.5 : 0.019 - (r - 0.1) * 0.1));
      }
      pts.push(new THREE.Vector2(0.121, 0.012), new THREE.Vector2(0.1, 0.0), new THREE.Vector2(0, 0));
      put(faceOut(new THREE.LatheGeometry(pts, 48)), 0xf5f2ea, 0.75, M(0, 0, 0.006), (x, y, z) => {   // turned: the axis is z now
        const r = Math.hypot(x, y), a = Math.atan2(y, x);
        if (z < 0.003 && r < 0.1 && r > 0.02) return 0xece8de;                            // the unglazed foot
        if (r > 0.108) return 0x1f3f8f;                                                   // cobalt rim
        if (r > 0.097 && r < 0.101) return 0xc9a24a;                                      // gold line
        if (r > 0.075 && r < 0.095 && Math.cos(a * 16) > 0.55) return 0x3a5aa8;            // a garland round the marli
        const petal = 0.045 + 0.02 * Math.cos(a * 5);
        if (r < 0.014) return 0xd8a830;                                                   // the flower's heart
        if (r < petal) return Math.cos(a * 5) > 0.2 ? 0xc04050 : 0xd86070;               // a rose
        if (r < 0.06 && Math.abs(Math.sin(a * 5 + 1.2)) < 0.25) return 0x3a7a3a;          // leaves between
        return null;
      });
    },
  },
  // memory: a sepia portrait in a carved dark frame, an oval mat round it
  photo: {
    w: 0.12, h: 0.15, build: put => {
      for (const [bw, bh, x, y] of [[0.24, 0.035, 0, 0.13], [0.24, 0.035, 0, -0.13], [0.035, 0.295, 0.1025, 0], [0.035, 0.295, -0.1025, 0]])
        put(roundedBox(bw, bh, 0.022, 0.006), 0x3a2414, 0.45, M(x, y, 0.011));
      put(new THREE.PlaneGeometry(0.17, 0.225, 34, 45), 0xe6dcc4, 0.2, M(0, 0, 0.01), (x, y) => {
        const ox = x / 0.07, oy = y / 0.095;
        if (ox * ox + oy * oy > 1) return 0xe6dcc4;                                        // the cream mat
        const head = Math.hypot(x / 0.028, (y - 0.02) / 0.036) < 1;
        const hair = Math.hypot(x / 0.031, (y - 0.03) / 0.036) < 1 && y > 0.02;
        const shoulders = y < -0.022 && Math.abs(x) < 0.058 - (y + 0.022) * -0.6;
        if (hair) return 0x3a2818;
        if (head) return 0xb89a78;
        if (shoulders) return 0x4a3624;
        return y > 0 ? 0x9a8264 : 0x8a7256;                                                // the studio's backdrop
      });
    },
  },
  // memory: a round wooden clock with Roman-style ticks, stopped at 12:24 too
  roomClock: { w: 0.15, h: 0.15, build: put => clockFace(put, 0.14, 0x6a3e1e, 0xf0e6cc, 0x2a1a10, 12, 24, { roman: true }) },
};

const KINDS = [['fearClock', 'notice', 'calendar'], ['plate', 'photo', 'roomClock', 'calendar', 'plate'], []];
const HANG_Y = { fearClock: 2.05, notice: 1.5, calendar: 1.48, plate: 1.72, photo: 1.58, roomClock: 1.9 };

export function createWallThings(atmo) {
  const mat = atmo.prop({ vertexColors: true, rust: 0.05 });
  const geos = new Map();
  const geoOf = (name) => {
    if (!geos.has(name)) { const g = shape(BUILD[name].build); g.computeBoundingSphere(); geos.set(name, g); }
    return geos.get(name);
  };
  return {
    // group: the chunk's · stage 0 fear, 1 memory, 2 light · spots: [{ x, z, nx, nz, r }] wall face points.
    // Returns { hung: [{ mesh, kind, nx, nz, fallen }], dispose }: the director takes them down.
    build(group, stage, spots) {
      const hung = [];
      for (const s of spots) {
        const list = KINDS[stage];
        if (!list.length) break;
        const kind = list[Math.floor(s.r * list.length) % list.length];
        const mesh = new THREE.Mesh(geoOf(kind), mat);
        mesh.userData.keep = true;                              // shared geometry and material
        const along = ((s.r * 71) % 1 - 0.5) * 0.5;
        mesh.position.set(s.x - s.nz * along + s.nx * 0.004, HANG_Y[kind], s.z + s.nx * along + s.nz * 0.004);
        mesh.rotation.set(0, Math.atan2(s.nx, s.nz), ((s.r * 37) % 1 - 0.5) * 0.06, 'YXZ');   // hung a little crooked
        group.add(mesh);
        const where = mountOrDrop(mesh, { x: mesh.position.x, z: mesh.position.z, nx: s.nx, nz: s.nz, y: mesh.position.y, kind: 'wall ' + kind, w: BUILD[kind].w });
        hung.push({ mesh, kind, nx: s.nx, nz: s.nz, fallen: where !== 'wall' });
      }
      return { hung, dispose() { for (const h of hung) h.mesh.parent?.remove(h.mesh); } };
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
