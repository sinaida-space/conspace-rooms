import * as THREE from 'three';
import { roundedBox } from './geom.js';

// ── conspace-rooms · stairwell.js ───────────────────────────────────────────
// The metal door in the fear stage (#34): a solid steel leaf set into an
// ordinary wall, on the route to the first portal. It gives way by itself as
// the visitor comes near, holds long enough to show what is behind it — a
// ruined stairwell, smoke curling above the steps, dust falling through the
// light of a broken window — then slams shut for good.
//
// The stairwell itself is a lie the wall tells: nothing can really be cut
// into world.js's own geometry from here, so the box behind the door is
// drawn with depth-testing off and a high render order, the way the water
// stage already fakes a mirror it cannot afford to build for real. It only
// ever needs to survive being seen through a 0.9 m gap for a few seconds.

const DOOR_W = 0.9, DOOR_H = 2.05, FRAME = 0.08, WALL_T = 0.2; // matches doorway.js's presence door
const BOX_DEPTH = 1.2;
const BOX_H = DOOR_H + 0.35;    // a little taller than the door, so the box reads as a real room
const SMOKE_N = 12;
const MOTE_N = 40;

const box = (w, h, d) => roundedBox(w, h, d, Math.min(0.04, Math.min(w, h, d) * 0.3));

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function grime(g, w, h, k = 1) {
  for (let i = 0; i < 500 * k; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
}

// Painted grey-green enamel, rust bleeding up from the bottom, dents down to
// bare metal. No panels: it is a single flat leaf, the kind a fire door is.
function steelDoorTexture() {
  return canvasTex(256, 584, (g, w, h) => {
    g.fillStyle = '#4c5c4a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {                       // brushed streaks
      g.strokeStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
      g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 5); g.stroke();
    }
    const rust = g.createLinearGradient(0, h * 0.6, 0, h);   // rust at the bottom
    rust.addColorStop(0, 'rgba(110,55,16,0)'); rust.addColorStop(1, 'rgba(110,55,16,0.6)');
    g.fillStyle = rust; g.fillRect(0, h * 0.6, w, h * 0.4);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(90,45,15,${0.15 + Math.random() * 0.3})`;
      const x = Math.random() * w, y = h * 0.68 + Math.random() * h * 0.32, r = 2 + Math.random() * 10;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    for (let i = 0; i < 22; i++) {                        // dents down to bare metal
      g.fillStyle = 'rgba(150,150,140,0.5)';
      const x = Math.random() * w, y = Math.random() * h * 0.6, r = 1.5 + Math.random() * 3;
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, Math.random() * 6, 0, 7); g.fill();
    }
    grime(g, w, h);
  });
}
function trimTex() {
  return canvasTex(48, 256, (g, w, h) => {
    g.fillStyle = '#3a4a3a'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(w * 0.7, 0, 6, h);
    grime(g, w, h, 0.4);
  });
}

// A shallow blue-grey placeholder — used only if the real photograph
// (assets/stairs/stairs_N.webp) fails to load: pale blue walls, a dark
// diagonal stair band, a bright window.
function placeholderTexture() {
  return canvasTex(384, 512, (g, w, h) => {
    g.fillStyle = '#b9cfdd'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(28,32,36,0.85)';
    g.beginPath(); g.moveTo(0, h * 0.96); g.lineTo(w * 0.56, h * 0.14); g.lineTo(w * 0.8, h * 0.14); g.lineTo(w * 0.24, h * 0.96); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(8,10,12,0.6)'; g.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const t = i / 13, x0 = w * 0.02 + t * w * 0.54, y0 = h * 0.95 - t * h * 0.8;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + w * 0.24, y0); g.stroke();
    }
    const wx = w * 0.7, wy = h * 0.2, ww = w * 0.18, wh = h * 0.22;
    const wg = g.createLinearGradient(wx, wy, wx, wy + wh);
    wg.addColorStop(0, '#fff8df'); wg.addColorStop(1, '#ffe19b');
    g.fillStyle = wg; g.fillRect(wx, wy, ww, wh);
    g.strokeStyle = 'rgba(35,26,10,0.5)'; g.lineWidth = 4; g.strokeRect(wx, wy, ww, wh);
    grime(g, w, h, 0.5);
  });
}

// Fit a texture to a plane of a different aspect ratio the way CSS
// background-size:cover would: scale to fill both sides, crop the overflow,
// never stretch.
function fitCover(tex, planeW, planeH, imgW, imgH) {
  const scale = Math.max(planeW / imgW, planeH / imgH);
  tex.repeat.set((planeW / imgW) / scale, (planeH / imgH) / scale);
  tex.offset.set((1 - tex.repeat.x) / 2, (1 - tex.repeat.y) / 2);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
}

let PUFF = null;
function puffTexture() {
  if (PUFF) return PUFF;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.55, 'rgba(220,220,215,0.4)'); r.addColorStop(1, 'rgba(200,200,195,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  PUFF = new THREE.CanvasTexture(c);
  return PUFF;
}

// Build the door and the small ruined room behind it. imgUrl: one of
// assets/stairs/stairs_1..5.webp, chosen by the caller from the visit's
// seed. Local +Z points out of the wall, into the corridor; the box recedes
// the other way, into the solid cell nothing else ever draws in.
export function buildStairwell(imgUrl) {
  const g = new THREE.Group();
  const basic = map => new THREE.MeshBasicMaterial({ map, fog: true });

  // architrave, proud of the wall on the corridor side only — nobody stands
  // inside the wall to see its back
  const trim = basic(trimTex());
  for (const s of [-1, 1]) {
    const jamb = new THREE.Mesh(box(FRAME, DOOR_H + FRAME, WALL_T + 0.05), trim);
    jamb.position.set(s * (DOOR_W / 2 + FRAME / 2), (DOOR_H + FRAME) / 2, 0.01); g.add(jamb);
  }
  const head = new THREE.Mesh(box(DOOR_W + 2 * FRAME, FRAME, WALL_T + 0.05), trim);
  head.position.set(0, DOOR_H + FRAME / 2, 0.01); g.add(head);

  // the leaf itself, on a hinge at its edge — always drawn over the real
  // wall (it sits a hair proud of it), so it reads as solid whether open or shut
  const pivot = new THREE.Group();
  pivot.position.set(-DOOR_W / 2, 0, 0.02);
  g.add(pivot);
  const leafMat = basic(steelDoorTexture());
  const door = new THREE.Mesh(box(DOOR_W, DOOR_H, 0.06), leafMat);
  door.position.set(DOOR_W / 2, DOOR_H / 2, 0);
  door.renderOrder = 6;
  pivot.add(door);
  const metal = new THREE.MeshBasicMaterial({ color: 0x8c8c84, fog: true });
  const lever = new THREE.Mesh(box(0.16, 0.02, 0.02), metal);
  lever.position.set(DOOR_W - 0.16, 1.0, 0.05); lever.renderOrder = 6; pivot.add(lever);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.014, 16).rotateX(Math.PI / 2), metal);
  rose.position.set(DOOR_W - 0.1, 1.0, 0.033); rose.renderOrder = 6; pivot.add(rose);
  const peep = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.014, 12).rotateX(Math.PI / 2), metal);
  peep.position.set(DOOR_W / 2, 1.62, 0.033); peep.renderOrder = 6; pivot.add(peep);

  // the box behind: dark sides and ceiling, the picture at the back. Drawn
  // with depth-testing off (see the file note above), so the real wall
  // quad — which sits exactly where the door does — never hides it once the
  // leaf swings clear.
  const box3 = new THREE.Group();
  box3.position.z = -0.01;
  g.add(box3);
  const dark = new THREE.MeshBasicMaterial({ color: 0x0e0c0a, transparent: true, depthTest: false, depthWrite: false, fog: false });
  const side = (x) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(BOX_DEPTH, BOX_H), dark);
    m.position.set(x, BOX_H / 2, -BOX_DEPTH / 2);
    m.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    m.renderOrder = 2;
    box3.add(m);
    return m;
  };
  side(-DOOR_W / 2); side(DOOR_W / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, BOX_DEPTH), dark);
  ceil.position.set(0, BOX_H, -BOX_DEPTH / 2);
  ceil.rotation.x = Math.PI / 2;
  ceil.renderOrder = 2;
  box3.add(ceil);

  const picMat = new THREE.MeshBasicMaterial({ map: placeholderTexture(), transparent: true, depthTest: false, depthWrite: false, fog: false });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, BOX_H), picMat);
  pic.position.set(0, BOX_H / 2, -BOX_DEPTH);
  pic.renderOrder = 1;
  box3.add(pic);
  if (imgUrl) {
    new THREE.TextureLoader().load(imgUrl, img => {
      img.colorSpace = THREE.SRGBColorSpace;
      fitCover(img, DOOR_W, BOX_H, img.image.width, img.image.height);
      picMat.map?.dispose();
      picMat.map = img; picMat.needsUpdate = true;
    }, undefined, () => {}); // missing file: the placeholder stays
  }

  // a little light spilling from the window in the picture, faded by k
  const windowGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: puffTexture(), color: 0xffe9b0, transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0, blending: THREE.AdditiveBlending,
  }));
  windowGlow.scale.set(0.6, 0.6, 1);
  windowGlow.position.set(0.18, BOX_H * 0.62, -BOX_DEPTH + 0.05);
  windowGlow.renderOrder = 3;
  box3.add(windowGlow);

  // smoke: soft grey-white sprites rising and curling above where the
  // stairs would be, each with its own drift so the plume never repeats
  const smoke = Array.from({ length: SMOKE_N }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: puffTexture(), color: 0xcfcfc6, transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0,
    }));
    const sc = 0.22 + Math.random() * 0.28;
    s.scale.set(sc, sc, 1);
    s.renderOrder = 3;
    s.userData = {
      base: new THREE.Vector3((Math.random() - 0.5) * DOOR_W * 0.7, 0.1 + Math.random() * 0.5, -BOX_DEPTH * (0.25 + Math.random() * 0.65)),
      seed: Math.random() * 20, speed: 0.06 + Math.random() * 0.07, o0: 0.16 + Math.random() * 0.18,
    };
    box3.add(s);
    return s;
  });

  // dust motes: small pale flecks falling slowly through the window's light
  const motes = Array.from({ length: MOTE_N }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: puffTexture(), color: 0xe8e0cc, transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0,
    }));
    const sc = 0.02 + Math.random() * 0.03;
    s.scale.set(sc, sc, 1);
    s.renderOrder = 4;
    s.userData = {
      x: (Math.random() - 0.5) * DOOR_W * 0.9, z: -BOX_DEPTH * (0.15 + Math.random() * 0.8),
      y0: BOX_H * (0.3 + Math.random() * 0.6), speed: 0.05 + Math.random() * 0.06, seed: Math.random() * 10,
    };
    box3.add(s);
    return s;
  });

  g.visible = false;
  return {
    group: g, pivot, door,
    // k: 0 shut, 1 fully open/held — fades the box's contents in and out
    // with the leaf, so nothing is glimpsed through a crack that shouldn't be
    tick(dt, time, k) {
      g.visible = k > 0.002;
      if (!g.visible) return;
      windowGlow.material.opacity = k * (0.5 + 0.2 * Math.sin(time * 5));
      for (const s of smoke) {
        const u = s.userData, t = (time * u.speed + u.seed);
        s.position.set(
          u.base.x + Math.sin(t * 0.7) * 0.14,
          u.base.y + ((t * 0.4) % 1.4),
          u.base.z + Math.cos(t * 0.5) * 0.1);
        s.material.opacity = k * u.o0 * (1 - ((t * 0.4) % 1.4) / 1.4);
      }
      for (const s of motes) {
        const u = s.userData, fall = (time * u.speed + u.seed) % 1;
        s.position.set(u.x + Math.sin(time * 0.6 + u.seed) * 0.05, u.y0 * (1 - fall), u.z);
        s.material.opacity = k * 0.5 * Math.sin(fall * Math.PI);
      }
    },
    dispose() {
      g.traverse(o => { o.geometry?.dispose(); if (o.material?.map && o.material.map !== PUFF) o.material.map.dispose(); o.material?.dispose(); });
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
