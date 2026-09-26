import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';
import { roundedBox } from './geom.js';
import { t, getLang } from './i18n.js';

// ── conspace-rooms · eggs.js ────────────────────────────────────────────────
// A quiet nightstand tucked against a corridor wall, deep in the memory ring:
// a small Soviet electronic clock reading 12:24, its colon blinking once a
// second, and two children's wooden blocks dropped at its foot. Which chunk
// gets one and where it stands against the wall is decided in soulpath.js
// (clockPlan); this file only ever draws the one fixed shape, built once and
// shared by every nook the labyrinth generates, so a hundred of them cost a
// handful of draw calls and no extra geometry.
//
// Corridors carry no real THREE lights — everything standing in them (see
// ward.js) is lit by atmo.prop()'s faked fixture/candle shader instead, so
// every material here comes from that same factory; a plain MeshStandard
// material would render black away from grandmother's room.

const WOOD = 0x3a2416, PLASTIC = 0x6b5636, BLOCK_WOOD = 0xe8dcc0;
const CLOCK_W = 0.22, CLOCK_H = 0.08, CLOCK_D = 0.1;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// The clock face: dark smoked plastic, green VFD digits. Two variants, colon
// lit or dark — swapped on the one shared material, so every nook in the
// labyrinth blinks together at 1Hz.
function faceTexture(colonOn) {
  const [c, g] = canvas(160, 64);
  g.fillStyle = '#050503'; g.fillRect(0, 0, 160, 64);
  g.fillStyle = '#2f6b3a'; g.font = '700 40px "Courier New", monospace';   // unlit segments, faint
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('88 88', 80, 34);
  g.fillStyle = '#3dff7a'; g.shadowColor = '#3dff7a'; g.shadowBlur = 9;
  g.fillText('12', 46, 34); g.fillText('24', 114, 34);
  g.shadowBlur = colonOn ? 9 : 0;
  g.fillStyle = colonOn ? '#3dff7a' : 'rgba(61,255,122,0.12)';
  g.beginPath(); g.arc(80, 22, 3, 0, 7); g.fill();
  g.beginPath(); g.arc(80, 46, 3, 0, 7); g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A single painted letter on a block's face, pale wood behind it.
function letterTexture(letter, color) {
  const [c, g] = canvas(48, 48);
  g.fillStyle = '#ece1c8'; g.fillRect(0, 0, 48, 48);
  g.strokeStyle = 'rgba(110,90,50,0.4)'; g.lineWidth = 2; g.strokeRect(3, 3, 42, 42);
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 30px Georgia, "Times New Roman", serif';
  g.fillText(letter, 24, 25);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let SHARED = null, SHARED_LANG = null, blinkTimer = null;

// Everything a nook needs, built once (rebuilt only if the language changes,
// since the two block letters are the only translated thing here).
function shared(atmo) {
  const lang = getLang();
  if (SHARED && SHARED_LANG === lang) return SHARED;
  SHARED_LANG = lang;

  // the nightstand and the clock's housing: one merged mesh, vertex colours
  // carrying colour in rgb and gloss in alpha, same convention as ward.js
  const parts = [];
  const put = (geo, hex, gloss, x = 0, y = 0, z = 0) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const cc = new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
    const col = new Float32Array(g.attributes.position.count * 4);
    for (let i = 0; i < g.attributes.position.count; i++) col.set([cc.r, cc.g, cc.b, gloss], i * 4);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.translate(x, y, z);
    parts.push(g);
  };
  const LEG_H = 0.08, BODY_H = 0.4, TOP_H = 0.03;
  for (const [lx, lz] of [[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]]) put(new THREE.BoxGeometry(0.03, LEG_H, 0.03), WOOD, 0.15, lx, LEG_H / 2, lz);
  put(roundedBox(0.4, BODY_H, 0.36, 0.012), WOOD, 0.15, 0, LEG_H + BODY_H / 2, 0);
  put(roundedBox(0.45, TOP_H, 0.4, 0.01), WOOD, 0.2, 0, LEG_H + BODY_H + TOP_H / 2, 0);
  const standTop = LEG_H + BODY_H + TOP_H;                      // ~0.51m, the tabletop
  const clockY = standTop + CLOCK_H / 2;
  put(roundedBox(CLOCK_W, CLOCK_H, CLOCK_D, 0.008), PLASTIC, 0.35, 0, clockY, 0.02);
  const standGeo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  const standMat = atmo.prop({ vertexColors: true, rust: 0 });

  const faceOn = faceTexture(true), faceOff = faceTexture(false);
  const faceMat = atmo.prop({ map: faceOn, glow: 0.85, rust: 0 });
  const faceGeo = new THREE.PlaneGeometry(CLOCK_W * 0.82, CLOCK_H * 0.72);

  const blockGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  const blockMat = atmo.prop({ color: BLOCK_WOOD, rust: 0 });
  const letterGeo = new THREE.PlaneGeometry(0.055, 0.055);
  const matA = atmo.prop({ map: letterTexture(t('eggBlockA'), '#b0242a'), rust: 0 });
  const matB = atmo.prop({ map: letterTexture(t('eggBlockB'), '#25529c'), rust: 0 });

  clearInterval(blinkTimer);                    // one shared clock: every nook blinks in sync
  let on = true;
  blinkTimer = setInterval(() => { on = !on; faceMat.uniforms.uMap.value = on ? faceOn : faceOff; }, 500);

  SHARED = { standGeo, standMat, faceGeo, faceMat, clockY, blockGeo, blockMat, letterGeo, matA, matB };
  return SHARED;
}

// parent: the chunk's egg group · x,z: world position of the nightstand's
// foot, against the wall it stands on · rot: facing, away from that wall
// (matches the anchor.rot convention in ward.js's wardPlan) · atmo: the
// shared prop-material factory (materials.js), so the nook is lit like
// everything else standing in the corridors.
export function buildClockNook(parent, x, z, rot, atmo) {
  const S = shared(atmo);

  const body = new THREE.Mesh(S.standGeo, S.standMat);
  body.position.set(x, 0, z);
  body.rotation.y = rot;
  body.userData.keep = true;                    // shared by every nook: never dispose with a chunk
  parent.add(body);

  const face = new THREE.Mesh(S.faceGeo, S.faceMat);
  face.position.set(0, S.clockY, 0.02 + CLOCK_D / 2 + 0.001);
  face.userData.keep = true;
  body.add(face);

  // two blocks dropped on the floor at the nightstand's foot, one tipped
  const blockA = new THREE.Mesh(S.blockGeo, S.blockMat);
  blockA.position.set(-0.16, 0.03, 0.34);
  blockA.rotation.y = 0.3;
  blockA.userData.keep = true;
  body.add(blockA);
  const letterA = new THREE.Mesh(S.letterGeo, S.matA);
  letterA.position.set(0, 0, 0.031);
  letterA.userData.keep = true;
  blockA.add(letterA);

  const blockB = new THREE.Mesh(S.blockGeo, S.blockMat);
  blockB.position.set(0.1, 0.04, 0.42);
  blockB.rotation.set(0, -0.4, 0.4);
  blockB.userData.keep = true;
  body.add(blockB);
  const letterB = new THREE.Mesh(S.letterGeo, S.matB);
  letterB.position.set(0, 0, 0.031);
  letterB.userData.keep = true;
  blockB.add(letterB);
}

// Je suis le spectre d'une rose que tu portais hier au bal.
