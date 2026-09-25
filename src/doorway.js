import * as THREE from 'three';
import { roundedBox } from './geom.js';
import { CEIL_H } from './world.js';

// rounded edges: radius a third of the thinnest side, capped at 4 cm
const box = (w, h, d) => roundedBox(w, h, d, Math.min(0.04, Math.min(w, h, d) * 0.3));

// ── conspace-rooms · doorway.js ─────────────────────────────────────────────
// A presence door: the corridor is closed by a stretch of ordinary wall (the
// same shader as every other wall, so it belongs), with a real door in it:
// architrave, a lever handle, a peephole and a small enamel plaque screwed on
// at eye level. In the hospital it is a painted panel door, chipped; in the
// red rooms it is the leatherette-padded flat door with brass studs that
// every Soviet stairwell had. It swings open on its hinges.

const DOOR_W = 0.9, DOOR_H = 2.05, FRAME = 0.08, WALL_T = 0.2;
const CEIL_TOP = 3.1;   // just under the ceiling (world.js CEIL_H 3.2)

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function grime(g, w, h, k = 1) {
  for (let i = 0; i < 700 * k; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  const bottom = g.createLinearGradient(0, h * 0.75, 0, h);
  bottom.addColorStop(0, 'rgba(20,14,8,0)'); bottom.addColorStop(1, 'rgba(20,14,8,0.5)');
  g.fillStyle = bottom; g.fillRect(0, 0, w, h);
  const hand = g.createRadialGradient(w * 0.86, h * 0.5, 2, w * 0.86, h * 0.5, w * 0.35); // grease where hands push
  hand.addColorStop(0, 'rgba(10,8,5,0.35)'); hand.addColorStop(1, 'rgba(10,8,5,0)');
  g.fillStyle = hand; g.fillRect(0, 0, w, h);
}

// Painted panel door: two raised panels with bevelled light and shadow, paint
// chipped to grey primer, scuffs at kick height.
function panelDoor(stage) {
  const base = stage === 2 ? [200, 204, 194] : [58, 96, 80];
  return canvasTex(256, 584, (g, w, h) => {
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, w, h);
    for (const [y0, y1] of [[40, 270], [310, 544]]) {
      const x0 = 34, x1 = w - 34;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0, y0, x1 - x0, 6); g.fillRect(x0, y0, 6, y1 - y0);       // shadowed top/left bevel
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x0, y1 - 6, x1 - x0, 6); g.fillRect(x1 - 6, y0, 6, y1 - y0); // lit bottom/right bevel
      const p = g.createLinearGradient(x0, y0, x1, y1);
      p.addColorStop(0, 'rgba(255,255,255,0.05)'); p.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = p; g.fillRect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12);
    }
    for (let i = 0; i < 40; i++) {                     // chips down to primer
      const x = Math.random() * w, y = Math.random() * h, r = 2 + Math.random() * 9;
      g.fillStyle = 'rgba(150,150,140,0.8)'; g.beginPath();
      for (let a = 0; a < 6.3; a += 0.8) g.lineTo(x + Math.cos(a) * r * (0.4 + Math.random()), y + Math.sin(a) * r * (0.4 + Math.random()));
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.3)';                 // scuffs at kick height
    for (let i = 0; i < 25; i++) { g.beginPath(); const y = h - 20 - Math.random() * 90, x = Math.random() * w; g.moveTo(x, y); g.lineTo(x + 10 + Math.random() * 30, y + (Math.random() - 0.5) * 6); g.stroke(); }
    grime(g, w, h);
  });
}

// Leatherette-padded door: quilted in diamonds by thin cords, a brass stud at
// every crossing, the padding bulging between them, cracked here and there.
function paddedDoor() {
  return canvasTex(256, 584, (g, w, h) => {
    g.fillStyle = '#3a1512'; g.fillRect(0, 0, w, h);
    const step = 52;
    for (let y = -step; y < h + step; y += step) for (let x = -step; x < w + step; x += step) {
      const cx = x + ((y / step) % 2 ? step / 2 : 0), cy = y;
      const r = g.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, step * 0.6); // each diamond bulges
      r.addColorStop(0, 'rgba(255,200,180,0.16)'); r.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = r; g.beginPath();
      g.moveTo(cx, cy - step / 2); g.lineTo(cx + step / 2, cy); g.lineTo(cx, cy + step / 2); g.lineTo(cx - step / 2, cy); g.fill();
    }
    g.strokeStyle = 'rgba(15,5,4,0.8)'; g.lineWidth = 2;  // cords
    for (let k = -h; k < w + h; k += step) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); g.beginPath(); g.moveTo(k, h); g.lineTo(k + h, 0); g.stroke(); }
    for (let y = 0; y <= h; y += step / 2) for (let x = (y / (step / 2)) % 2 ? step / 2 : 0; x <= w; x += step) { // brass studs
      const s = g.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5);
      s.addColorStop(0, '#f3d98a'); s.addColorStop(1, '#5a3d12');
      g.fillStyle = s; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(200,170,150,0.35)'; g.lineWidth = 1; // cracks in the leatherette
    for (let i = 0; i < 18; i++) { let x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 16; y += (Math.random() - 0.5) * 16; g.lineTo(x, y); } g.stroke(); }
    grime(g, w, h, 0.6);
  });
}

function trimTex(stage) {
  const col = stage === 1 ? '#2a1a10' : stage === 2 ? '#c9ccc2' : '#44705f';
  return canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(w * 0.15, 0, 4, h);  // moulding ridge
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(w * 0.7, 0, 5, h);
    grime(g, w, h, 0.3);
  });
}

// Small enamel plaque: white enamel, dark lettering, chipped edges, four
// screws and a rust stain running from one of them.
function plaqueTex(text) {
  return canvasTex(512, 170, (g, w, h) => {
    g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1c2a24'; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#1c2a24'; g.font = '44px "Departure Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
    for (const [x, y] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]]) {
      const s = g.createRadialGradient(x - 2, y - 2, 1, x, y, 8); s.addColorStop(0, '#d8d8d0'); s.addColorStop(1, '#4a4a44');
      g.fillStyle = s; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
      g.strokeStyle = '#333'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.stroke();
    }
    const rust = g.createLinearGradient(0, 30, 0, h);
    rust.addColorStop(0, 'rgba(120,60,20,0.5)'); rust.addColorStop(1, 'rgba(120,60,20,0)');
    g.fillStyle = rust; g.fillRect(w - 32, 30, 10, h - 40);
    for (let i = 0; i < 14; i++) { g.fillStyle = '#20241f'; const x = Math.random() < 0.5 ? Math.random() * w : (Math.random() < 0.5 ? 6 : w - 12); g.fillRect(x, Math.random() < 0.5 ? 4 : h - 10, 4 + Math.random() * 10, 5); }
  });
}

// Build the doorway. span: corridor width; wallMat: the world's wall shader.
// Returns { group, pivot, door, blockers(x,z,rotY) } in local coordinates.
export function buildDoorway(span, wallMat, stage, text) {
  const g = new THREE.Group();
  const side = (span - DOOR_W - 2 * FRAME) / 2;
  const basic = map => new THREE.MeshBasicMaterial({ map, fog: true });
  // the wall around the door, same shader as all walls
  for (const s of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(side, CEIL_H, WALL_T), wallMat);
    slab.position.set(s * (span / 2 - side / 2), CEIL_H / 2, 0); slab.userData.keepMaterial = true; g.add(slab); // shared wall shader: never dispose it
  }
  const top = DOOR_H + FRAME;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 2 * FRAME, CEIL_H - top, WALL_T), wallMat);
  lintel.position.set(0, top + (CEIL_H - top) / 2, 0); lintel.userData.keepMaterial = true; g.add(lintel);
  // architrave, proud of the wall on both faces
  const trim = basic(trimTex(stage));
  for (const s of [-1, 1]) {
    const jamb = new THREE.Mesh(box(FRAME, top, WALL_T + 0.05), trim);
    jamb.position.set(s * (DOOR_W / 2 + FRAME / 2), top / 2, 0); g.add(jamb);
  }
  const head = new THREE.Mesh(box(DOOR_W + 2 * FRAME, FRAME, WALL_T + 0.05), trim);
  head.position.set(0, DOOR_H + FRAME / 2, 0); g.add(head);
  // the door itself on a hinge pivot at its left edge
  const pivot = new THREE.Group();
  pivot.position.set(-DOOR_W / 2, 0, 0); g.add(pivot);
  const leafMat = basic(stage === 1 ? paddedDoor() : panelDoor(stage));
  const door = new THREE.Mesh(box(DOOR_W, DOOR_H, 0.05), leafMat);
  door.position.set(DOOR_W / 2, DOOR_H / 2, 0); pivot.add(door);
  const metal = new THREE.MeshBasicMaterial({ color: stage === 1 ? 0xb08a3a : 0x8c8c84, fog: true });
  for (const f of [-1, 1]) {                           // both faces: handle, peephole, plaque
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16).rotateX(Math.PI / 2), metal);
    rose.position.set(DOOR_W - 0.09, 1.0, f * 0.031); pivot.add(rose);
    const lever = new THREE.Mesh(box(0.12, 0.018, 0.018), metal);
    lever.position.set(DOOR_W - 0.14, 1.0, f * 0.05); pivot.add(lever);
    const peep = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.012, 12).rotateX(Math.PI / 2), metal);
    peep.position.set(DOOR_W / 2, 1.6, f * 0.031); pivot.add(peep);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), basic(plaqueTex(text)));
    plaque.position.set(DOOR_W / 2, 1.38, f * 0.027); plaque.rotation.y = f > 0 ? 0 : Math.PI; pivot.add(plaque);
  }
  return { group: g, pivot, door, side, gap: DOOR_W };
}

// ── light behind a door ─────────────────────────────────────────────────────
// What pours out when a presence door gives way for a moment: the doorway
// fills with white, and shafts of light fan out through the air toward the
// visitor, streaked like sun through dust. Additive planes (a vertical and a
// horizontal fan) that start in the door gap and widen as they reach out.
// Built in the doorway's own frame, reaching along +Z; set(k, time) fades it.
const RAY_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const RAY_FRAG = /* glsl */`
uniform float uK;
uniform float uTime;
varying vec2 vUv;
void main(){
  float along = vUv.y, across = vUv.x;
  float streak = 0.5 + 0.5 * sin(across * 41.0 + uTime * 0.5) * sin(across * 17.0 - uTime * 0.31);
  streak = streak * streak * streak;                   // narrow shafts with dark air between
  float fade = pow(1.0 - along, 1.7);
  float edge = smoothstep(0.0, 0.22, across) * smoothstep(1.0, 0.78, across);
  float a = uK * fade * edge * (0.08 + 0.92 * streak) * 0.12;
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a, 1.0);
}
`;
const GAP_FRAG = /* glsl */`
uniform float uK;
varying vec2 vUv;
void main(){
  vec2 d = abs(vUv - 0.5) * 2.0;
  float soft = 1.0 - smoothstep(0.75, 1.0, max(d.x, d.y));
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * uK * (0.55 + 0.45 * soft), 1.0);
}
`;
export function buildLightRays(reach = 4.5) {
  const g = new THREE.Group();
  const uniforms = { uK: { value: 0 }, uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: RAY_VERT, fragmentShader: RAY_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const z0 = WALL_T / 2, z1 = z0 + reach;
  const nearW = DOOR_W, nearH = DOOR_H, farW = 2.3, farH = CEIL_TOP;
  // one blade: a quad from a line in the gap to a line in the far rectangle
  const blade = (a0, a1, b0, b1) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...a0, ...a1, ...b1, ...b0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    return new THREE.Mesh(geo, mat);
  };
  for (let k = 0; k <= 6; k++) {                        // vertical fan
    const f = k / 6, nx = (f - 0.5) * nearW * 0.92, fx = (f - 0.5) * farW;
    g.add(blade([nx, 0, z0], [nx, nearH, z0], [fx, 0, z1], [fx, farH, z1]));
  }
  for (let k = 0; k <= 4; k++) {                        // horizontal fan
    const f = k / 4, ny = 0.1 + f * (nearH - 0.2), fy = 0.05 + f * (farH - 0.1);
    g.add(blade([-nearW / 2, ny, z0], [nearW / 2, ny, z0], [-farW / 2, fy, z1], [farW / 2, fy, z1]));
  }
  const gapMat = new THREE.ShaderMaterial({ uniforms, vertexShader: RAY_VERT, fragmentShader: GAP_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const gap = new THREE.Mesh(new THREE.PlaneGeometry(nearW, nearH), gapMat);
  gap.position.set(0, nearH / 2, -WALL_T / 2 - 0.01);   // the far face of the wall: the gap turns to white
  g.add(gap);
  g.visible = false;
  return {
    group: g,
    set(k, time) { uniforms.uK.value = k; uniforms.uTime.value = time; g.visible = k > 0.002; },
    dispose() { g.traverse(o => o.geometry?.dispose()); mat.dispose(); gapMat.dispose(); },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
