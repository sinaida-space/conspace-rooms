import * as THREE from 'three';
import { CEIL_H } from './world.js';

// ── conspace-rooms · kitchen.js ─────────────────────────────────────────────
// Grandmother's room, the rare secret of the memory zone: a table under an
// oilcloth, two stools, an enamel teapot and a cup, a candelabra, an old
// television glowing red. Unlike the rest of the labyrinth (faked light in
// materials.js) these props are really lit, by one shared light rig that
// follows the nearest room, so the light count never changes and no shader
// recompiles while walking. Soft contact shadows under every object stand in
// for ambient occlusion on the procedural floor, which does not receive
// shadow maps.

// ── canvas textures, generated once and shared by every room ────────────────
let TEX = null;
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function textures() {
  if (TEX) return TEX;
  TEX = {
    // dark varnished wood: wavy grain lines over a brown ground
    wood: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#3a2416'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const y0 = Math.random() * h, amp = 2 + Math.random() * 5, ph = Math.random() * 6;
        g.strokeStyle = `rgba(${Math.random() < 0.5 ? '20,10,5' : '95,60,35'},${0.25 + Math.random() * 0.35})`;
        g.lineWidth = 0.6 + Math.random() * 1.6;
        g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y0 + Math.sin(x * 0.03 + ph) * amp);
        g.stroke();
      }
    }),
    // oilcloth: teal and cream checks, worn pale where hands rest, fine cracks
    cloth: canvasTex(512, 512, (g, w, h) => {
      const n = 12, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        g.fillStyle = (i + j) % 2 ? '#f1eadb' : '#7fa89a'; g.fillRect(i * s, j * s, s, s);
      }
      const wear = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.6);
      wear.addColorStop(0, 'rgba(255,250,235,0.18)'); wear.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = wear; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(40,30,20,0.25)'; g.lineWidth = 0.7;
      for (let k = 0; k < 40; k++) {
        let x = Math.random() * w, y = Math.random() * h;
        g.beginPath(); g.moveTo(x, y);
        for (let q = 0; q < 6; q++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; g.lineTo(x, y); }
        g.stroke();
      }
    }),
    // the television picture: a red forest over a glowing field, scanlines
    screen: canvasTex(256, 192, (g, w, h) => {
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#5a0606'); bg.addColorStop(0.45, '#c01010'); bg.addColorStop(1, '#ff2a1e');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 38; i++) { // tree trunks
        const x = Math.random() * w, tw = 1 + Math.random() * 4;
        g.fillStyle = `rgba(40,0,0,${0.4 + Math.random() * 0.5})`;
        g.fillRect(x, 0, tw, h * (0.45 + Math.random() * 0.1));
      }
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
      const v = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
    }),
    // speaker grille on the television's side panel
    grille: canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = '#1c1915'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a0907';
      for (let y = 4; y < h; y += 5) g.fillRect(4, y, w - 8, 2);
    }),
    // soft black blob: contact shadow / ambient occlusion on the floor and table
    blob: canvasTex(128, 128, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(0,0,0,0.85)'); r.addColorStop(0.5, 'rgba(0,0,0,0.45)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    }),
    // warm yellow halo for the floor candles, so they read against the red carpet
    warm: canvasTex(64, 64, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,236,170,1)'); r.addColorStop(0.25, 'rgba(255,190,90,0.45)'); r.addColorStop(1, 'rgba(255,150,40,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    }),
    // halo around a candle flame
    halo: canvasTex(64, 64, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,120,60,0.9)'); r.addColorStop(0.3, 'rgba(255,40,20,0.35)'); r.addColorStop(1, 'rgba(255,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    }),
  };
  return TEX;
}

// Lathe from a (radius, height) profile — for the teapot, cup, saucer, candle cups.
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// ── build one room's props into `group`, centred on (x, z) ──────────────────
export function buildKitchen(group, x, z) {
  const T = textures();
  const std = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, ...opts });
  const wood = std({ map: T.wood, roughness: 0.55 });
  const cloth = std({ map: T.cloth, roughness: 0.38 });              // oilcloth has a soft sheen
  const enamel = std({ color: 0xe9e3d5, roughness: 0.28 });
  const enamelRed = std({ color: 0x9a1b1b, roughness: 0.3 });
  const brass = std({ color: 0x6b4a22, roughness: 0.35, metalness: 0.8 });
  const wax = std({ color: 0xe6dac0, roughness: 0.6 });
  const plastic = std({ color: 0x151310, roughness: 0.45 });
  const fabric = std({ color: 0xc08a3e, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x5a2a0c, emissiveIntensity: 0.25 });

  const flames = [], screens = [];
  const add = (geo, mat, px, py, pz, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x + px, py, z + pz);
    m.castShadow = cast; m.receiveShadow = true;
    group.add(m);
    return m;
  };
  // contact shadow: a dark blob lying just above a surface
  const blob = (w, d, px, py, pz, opacity = 0.8) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: T.blob, transparent: true, depthWrite: false, opacity, fog: true }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x + px, py, z + pz);
    m.renderOrder = 1;
    group.add(m);
  };

  // ── table: wooden top and apron, tapered legs, oilcloth with a drape ──
  const TOP = 0.745;
  add(new THREE.BoxGeometry(1.2, 0.035, 0.8), wood, 0, TOP, 0);
  for (const [w, d, px, pz] of [[1.08, 0.02, 0, -0.36], [1.08, 0.02, 0, 0.36], [0.02, 0.68, -0.56, 0], [0.02, 0.68, 0.56, 0]]) {
    add(new THREE.BoxGeometry(w, 0.08, d), wood, px, TOP - 0.06, pz); // apron
  }
  for (const [lx, lz] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) {
    add(new THREE.CylinderGeometry(0.03, 0.021, TOP - 0.02, 10), wood, lx, (TOP - 0.02) / 2, lz);
  }
  add(new THREE.BoxGeometry(1.28, 0.006, 0.88), cloth, 0, TOP + 0.021, 0);
  for (const [w, px, pz, ry] of [[1.28, 0, 0.44, 0], [1.28, 0, -0.44, Math.PI], [0.88, 0.64, 0, Math.PI / 2], [0.88, -0.64, 0, -Math.PI / 2]]) {
    const drape = add(new THREE.PlaneGeometry(w, 0.13), cloth, px, TOP - 0.045, pz);
    drape.rotation.y = ry;
    drape.material = cloth.clone(); drape.material.side = THREE.DoubleSide;
  }
  blob(1.9, 1.4, 0, 0.014, 0, 0.9);

  // ── two stools: bevelled seat, four splayed legs, a stretcher ring ──
  for (const sx of [-0.88, 0.88]) {
    add(new THREE.CylinderGeometry(0.175, 0.165, 0.035, 28), wood, sx, 0.46, 0);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      const leg = add(new THREE.CylinderGeometry(0.014, 0.017, 0.45, 8), wood, sx + Math.cos(a) * 0.1, 0.225, Math.sin(a) * 0.1);
      leg.rotation.set(Math.sin(a) * 0.1, 0, -Math.cos(a) * 0.1); // splay outward
    }
    const ring = add(new THREE.TorusGeometry(0.115, 0.008, 6, 24), wood, sx, 0.16, 0);
    ring.rotation.x = Math.PI / 2;
    blob(0.6, 0.6, sx, 0.013, 0, 0.7);
  }

  // ── enamel teapot: lathe body, red rim, tube spout, torus handle ──
  const tp = { x: 0.12, z: 0.05, y: TOP + 0.025 };
  add(lathe([[0, 0], [0.055, 0], [0.085, 0.015], [0.1, 0.05], [0.098, 0.085], [0.08, 0.115], [0.05, 0.13], [0.042, 0.135], [0, 0.135]]), enamel, tp.x, tp.y, tp.z);
  const rim = add(new THREE.TorusGeometry(0.043, 0.004, 6, 24), enamelRed, tp.x, tp.y + 0.135, tp.z);
  rim.rotation.x = Math.PI / 2;
  add(lathe([[0, 0], [0.042, 0], [0.03, 0.02], [0.012, 0.025], [0.014, 0.04], [0, 0.045]], 20), enamel, tp.x, tp.y + 0.132, tp.z);
  const spoutCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(x + tp.x + 0.08, tp.y + 0.05, z + tp.z),
    new THREE.Vector3(x + tp.x + 0.15, tp.y + 0.06, z + tp.z),
    new THREE.Vector3(x + tp.x + 0.17, tp.y + 0.14, z + tp.z));
  const spout = new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 12, 0.012, 8, false), enamel);
  spout.castShadow = true; group.add(spout);
  const handle = add(new THREE.TorusGeometry(0.045, 0.008, 8, 20, Math.PI * 1.1), enamel, tp.x - 0.1, tp.y + 0.07, tp.z);
  handle.rotation.z = Math.PI / 2 - 0.2;
  blob(0.3, 0.3, tp.x, TOP + 0.026, tp.z, 0.6);

  // ── cup on a saucer ──
  const cp = { x: -0.28, z: 0.2, y: TOP + 0.025 };
  add(lathe([[0, 0], [0.07, 0.002], [0.075, 0.01], [0.02, 0.006], [0, 0.006]]), enamel, cp.x, cp.y, cp.z);
  add(lathe([[0, 0.006], [0.028, 0.006], [0.042, 0.03], [0.046, 0.075], [0.043, 0.075], [0.04, 0.035], [0, 0.03]]), enamel, cp.x, cp.y, cp.z);
  const ch = add(new THREE.TorusGeometry(0.018, 0.005, 6, 14), enamel, cp.x + 0.052, cp.y + 0.045, cp.z);
  ch.rotation.y = Math.PI / 2;
  blob(0.2, 0.2, cp.x, TOP + 0.026, cp.z, 0.55);

  // ── candelabra: turned brass base and stem, four curved arms, five candles ──
  const cb = { x: -0.3, z: -0.16, y: TOP + 0.025 };
  add(lathe([[0, 0], [0.07, 0], [0.07, 0.01], [0.03, 0.03], [0.015, 0.05], [0, 0.05]]), brass, cb.x, cb.y, cb.z);
  add(new THREE.CylinderGeometry(0.011, 0.014, 0.24, 10), brass, cb.x, cb.y + 0.17, cb.z);
  const cups = [[0, 0, 0.3]];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, ex = Math.cos(a) * 0.11, ez = Math.sin(a) * 0.11;
    const arm = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x + cb.x, cb.y + 0.22, z + cb.z),
      new THREE.Vector3(x + cb.x + ex * 0.9, cb.y + 0.16, z + cb.z + ez * 0.9),
      new THREE.Vector3(x + cb.x + ex, cb.y + 0.25, z + cb.z + ez));
    const m = new THREE.Mesh(new THREE.TubeGeometry(arm, 10, 0.006, 6, false), brass);
    m.castShadow = true; group.add(m);
    cups.push([ex, ez, 0.25]);
  }
  for (const [ex, ez, hy] of cups) {
    add(lathe([[0, 0], [0.02, 0], [0.024, 0.02], [0.02, 0.022], [0, 0.022]], 14), brass, cb.x + ex, cb.y + hy, cb.z + ez);
    const h = 0.12 + Math.random() * 0.05;
    add(new THREE.CylinderGeometry(0.011, 0.012, h, 12), wax, cb.x + ex, cb.y + hy + 0.022 + h / 2, cb.z + ez);
    add(new THREE.SphereGeometry(0.006, 6, 4), wax, cb.x + ex + 0.01, cb.y + hy + 0.022 + h * 0.75, cb.z + ez); // wax drip
    const fy = cb.y + hy + 0.022 + h + 0.018;
    const flame = add(new THREE.SphereGeometry(0.009, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb070, fog: false }), cb.x + ex, fy, cb.z + ez, false);
    flame.scale.y = 2;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.halo, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.set(0.12, 0.12, 1);
    halo.position.set(x + cb.x + ex, fy, z + cb.z + ez);
    group.add(halo);
    flames.push({ flame, halo });
  }
  blob(0.34, 0.34, cb.x, TOP + 0.026, cb.z, 0.6);

  // ── old television on a low cabinet, antenna, knobs, grille, red picture ──
  const tv = { x: 0, z: 1.9 };
  add(new THREE.BoxGeometry(0.95, 0.46, 0.46), wood, tv.x, 0.23, tv.z);
  add(new THREE.BoxGeometry(0.9, 0.02, 0.02), plastic, tv.x, 0.4, tv.z - 0.235);             // cabinet trim
  add(new THREE.BoxGeometry(0.78, 0.58, 0.5), wood, tv.x, 0.75, tv.z);
  add(new THREE.BoxGeometry(0.56, 0.46, 0.02), plastic, tv.x - 0.08, 0.76, tv.z - 0.25);     // bezel
  const screen = add(new THREE.PlaneGeometry(0.5, 0.38), new THREE.MeshBasicMaterial({ map: T.screen, fog: false }), tv.x - 0.08, 0.76, tv.z - 0.262, false);
  screen.rotation.y = Math.PI;
  screens.push(screen);
  const grille = add(new THREE.PlaneGeometry(0.12, 0.2), new THREE.MeshStandardMaterial({ map: T.grille, roughness: 0.8 }), tv.x + 0.28, 0.68, tv.z - 0.252, false);
  grille.rotation.y = Math.PI;
  for (const ky of [0.9, 0.83]) {
    const knob = add(new THREE.CylinderGeometry(0.018, 0.02, 0.02, 14), plastic, tv.x + 0.28, ky, tv.z - 0.26);
    knob.rotation.x = Math.PI / 2;
  }
  for (const s of [-1, 1]) {
    const ant = add(new THREE.CylinderGeometry(0.003, 0.003, 0.55, 4), brass, tv.x + s * 0.12, 1.28, tv.z);
    ant.rotation.z = s * -0.45;
  }
  blob(1.3, 0.8, tv.x, 0.013, tv.z, 0.85);

  // ── fabric lampshade low over the table ──
  const shade = add(new THREE.CylinderGeometry(0.16, 0.34, 0.24, 28, 1, true), fabric, 0, 2.2, 0, false);
  shade.receiveShadow = false;
  add(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb070, fog: false }), 0, 2.14, 0, false);
  add(new THREE.CylinderGeometry(0.005, 0.005, CEIL_H - 2.32, 4), plastic, 0, (CEIL_H + 2.32) / 2, 0, false);

  return {
    flames, screens,
    lamp: new THREE.Vector3(x, 2.1, z),
    tv: new THREE.Vector3(x + tv.x - 0.08, 0.76, z + tv.z - 0.5),
  };
}

// ── candles on the floor leading to the room ────────────────────────────────
// points: [{ x, z }] world positions along the corridors (soulpath.js finds
// them). Each is a short candle on a saucer with a halo and a warm pool of
// light on the carpet: in the dark memory zone they read from far away.
export function buildCandleTrail(group, points) {
  const T = textures();
  const wax = new THREE.MeshStandardMaterial({ color: 0xe6dac0, roughness: 0.6 });
  const saucer = new THREE.MeshStandardMaterial({ color: 0xd9d2c0, roughness: 0.3 });
  const flames = [];
  for (const p of points) {
    const h = 0.16 + Math.random() * 0.12;
    const s = new THREE.Mesh(lathe([[0, 0], [0.06, 0.002], [0.065, 0.012], [0, 0.008]], 16), saucer);
    s.position.set(p.x, 0.01, p.z); group.add(s);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, h, 10), wax);
    c.position.set(p.x, 0.018 + h / 2, p.z); group.add(c);
    const fy = 0.018 + h + 0.02;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false }));
    flame.position.set(p.x, fy, p.z); flame.scale.y = 2; group.add(flame);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.warm, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.set(0.45, 0.45, 1); halo.position.set(p.x, fy, p.z); group.add(halo);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({
      map: T.warm, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.28, fog: true,
    }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, 0.015, p.z); group.add(pool);
    flames.push({ flame, halo });
  }
  return flames;
}

// ── one light rig for all rooms ─────────────────────────────────────────────
export function createKitchenRig(scene, renderer, quality) {
  const shadows = quality.tier > 0;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const lamp = new THREE.PointLight(0xffb468, 0, 7, 2);
  lamp.castShadow = shadows;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.bias = -0.002;
  lamp.shadow.radius = 4;
  const tv = new THREE.PointLight(0xff2418, 0, 4, 2);
  const fill = new THREE.HemisphereLight(0x2d5a3c, 0x240808, 0);   // green half-dark above, red carpet bounce below
  scene.add(lamp, tv, fill);

  return {
    // room: the nearest built room ({ lamp, tv }) or null
    update(room, time) {
      renderer.shadowMap.autoUpdate = shadows && !!room;   // no shadow passes far from any room
      if (!room) { lamp.intensity = tv.intensity = fill.intensity = 0; return; }
      lamp.position.copy(room.lamp);
      tv.position.copy(room.tv);
      lamp.intensity = 5.5 * (0.96 + 0.04 * Math.sin(time * 9.1));
      tv.intensity = 2.2 * (0.8 + 0.2 * Math.random());          // picture flicker
      fill.intensity = 0.55;
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
