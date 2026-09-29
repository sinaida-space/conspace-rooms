import * as THREE from 'three';
import { keyCode } from './input.js';
import { CELL, CHUNK, CEIL_H, CONSPACE_SEED, solidAtGlobal, chunkRooms, hash2i, mulberry32 } from './world.js';
import { zoneWeights, ORIGIN } from './zones.js';
import { t, getLang } from './i18n.js';
import { boardTexture, carpetTexture, rugTexture } from './boards.js';
import { createChandeliers } from './chandeliers.js';
import { EYE_HEIGHT } from './player.js';
import { buildKitchen, createKitchenRig, buildScatter, tickCandles, shadeOf } from './kitchen.js';
import { baroqueFrame } from './frames.js';
import { buildDoorway, buildLightRays } from './doorway.js';
import { artworkSlots } from './artworks.js';
import { createWardKit, wardPlan, bedsPlan, reserveSlot, reserveAround, cellKey } from './ward.js';
import { buildClockNook } from './eggs.js';
import { createRoseCounter, buildRoseArch, findArchSpot, GRAIN_OPEN_MS } from './roses.js';
import { showCard } from './card.js';
import { createPetals } from './petals.js';
import { createPropKit } from './props.js';
import { createDrowned } from './drowned.js';
import { buildStairwell } from './stairwell.js';

// ── conspace-rooms · soulpath.js ────────────────────────────────────────────
// Everything that makes the labyrinth respond to the visitor on the way from
// fear to acceptance. All state lives in memory only and is gone on reload.
//
//   red scratches   the only red in the world: a few scratch marks on the
//                   walls at hand height, slanted the way to go, leading to the
//                   nearest SOULS piece not yet seen, and once all nearby ones
//                   are seen, onward, away from where you started
//   wall writings   scrawled at a child's height, one per some chunks, voiced
//                   by the zone; turn around and some of them have changed
//   presence doors  very rarely a corridor crossing is shut by a door; stand
//                   still in front of it and it gives way: light pours out,
//                   the music clears, "not yet", and it slams shut for good
//   portals         shimmering doorways further out; walking through one moves
//                   the whole world to the next stage (fear → memory → light).
//                   Nothing else changes the stage.
//   souls           in grandmother's room three lights drift: the soul of
//                   someone close (gold), of a child (green), of a grown-up
//                   (deep red). Walk into one and it scatters; its question
//                   types itself on the television and across the screen.
//   posters         the walls' questions: notice boards in the hospital
//                   (boards.js), each
//                   asking one question
//   roses           every work seen grows the rose in the top-left corner;
//                   with all of them an arch of roses opens a couple of steps
//                   away, and walking through it ends the walk with the card
//                   of every question the souls asked (roses.js, card.js)
//   secrets         walk backwards long enough and you shrink to a child's
//                   height; grandmother's kitchen hides in the memory zone
//
// Integration: new SoulPath({...}) once the world exists, then update() every
// frame after player/artworks updates.

const MARK_COLOR = 0xb3141a;
const MARK_Y = 1.1;              // hand height, metres
const ROUTE_CELLS = 30;          // how much of the route gets marks (~36 m)
const MARK_EVERY = 2;            // cells between marks
const MARK_POOL = 28;             // marks stay where they were scratched, so the pool is larger
const CANDLE_NEAR = 12;          // metres: candles within this of a work tell whether it is seen
const CANDLE_CURTAIN_GAP = 1.4;  // metres: no flame this close to a window and its curtains
const CANDLE_DIE = 2.6;          // seconds a candle gutters before it is only an ember
const EMBER = new THREE.Color(0x2e0c04);
const MARK_FADE = 2.5;           // seconds a mark takes to fade once its work is seen
const MARK_KEEP = 32;            // metres: marks further behind than this go back to the pool
const REPATH_EVERY = 0.4;        // seconds
const SEEN_DIST = 3.2;           // metres: an artwork this close and in view counts as seen

const WRITING_Y = 0.72;          // child's height
const DOOR_WAIT = 2.0;           // seconds of stillness that open a door
const DOOR_REACH = 4.5;          // metres: standing still this far from a door is enough
const DOOR_EVERY = 0.0625;       // chance per chunk edge: about one door in eight chunks
const DOOR_SWING = 1.15;         // radians the door gives way
const DOOR_HOLD = 4.2;           // seconds the light pours out before the door slams
const DOOR_SLAM = 0.22;          // seconds to slam shut
const PORTAL_SEEN_FEAR = 3;
const FEAR_FIND_2 = { writings: 3, things: 4 };   // scrawls and boards, things lying about: then the second work
const FEAR_FIND_3 = 5;           // more of the hospital's things after that: the third
const FEAR_TURNS = 2;            // turns of the corridor after the third, before the door and the portal
const FIND_NEAR = 3.0;           // metres: passing this close, looking its way, a thing counts as found      // works seen in fear before its portal is summoned
const PORTAL_SEEN_MEMORY = 5;    // works seen in memory (past the room) before the way into the light
const PORTAL_NEAR = 8;           // metres: a summoned portal never lands closer than this
const PORTAL_FAR = 24;           // metres: nor further than this
const FINALE_VANISH = 6;         // seconds the walls take to dissolve before the rose tunnel rises
const DREAM_PREVIEW = new URLSearchParams(location.search).has('dream');
const STAIR_NIGHTMARE = true;     // false: the calm version, only the door, fog and light, no zoom, no sound, no blackout
const STAIR_NEAR = 3.2;          // metres: this close, the metal door gives way, each time the visitor passes
const STAIR_OPEN = 1.3;          // seconds: it swings open
const STAIR_HOLD = 5.0;          // seconds held, with the light pouring out
const STAIR_SLAM = 0.2;          // seconds: it slams shut
const STAIR_SWING = 1.15;        // radians: how far it gives way, as the other doors do
const STAIR_FLY = 1.0;           // seconds the view takes to fly to the doorway
const STAIR_FREE = 0.175;        // radians (10°) the view may be turned while it is held
const STAIR_TURN = 1.0;          // seconds the view takes to come round onto the way on
const STAIR_BEFORE_MIN = 4.8;      // metres before the portal a metal door may stand
const STAIR_BEFORE_MAX = 30;
const CHILD_AFTER = 30;          // seconds of walking backwards
const CHILD_EYE = 0.98;
const SOUL_HOLD = 5;             // seconds a soul's question stays before another may open
const SOUL_WALK = 3;             // metres walked between two souls
const SOUL_STOP = 1.6;           // a soul drawn to a still visitor halts this far off
const BOARD_NEAR = 2.4;          // metres: on hands, passing a notice board this close stops the walk before it
const BOARD_FIST = 3;            // seconds of a held fist before the walk turns back and goes on
const BOARD_FOV = 34;            // degrees: close enough to read the board's question

const SEED_WRITING = CONSPACE_SEED ^ 0x77a1;
const SEED_DOOR = CONSPACE_SEED ^ 0x0d00;
const SEED_KITCHEN = CONSPACE_SEED ^ 0x4b17;
const SEED_SCATTER = CONSPACE_SEED ^ 0x5ca7;
const SEED_POSTER = CONSPACE_SEED ^ 0x7057;
const SEED_SOULQ = CONSPACE_SEED ^ 0x50a1;
const SEED_EGG = CONSPACE_SEED ^ 0xe66c;
const SEED_PROPS = CONSPACE_SEED ^ 0x9e05;
const SEED_STAIR = CONSPACE_SEED ^ 0x57a1;
const EGG_BAND = new Set([4, 5, 10, 11]);   // the corridor lattice, mirrored from world.js
const mod16 = v => ((v % CHUNK) + CHUNK) % CHUNK;   // a global cell's position on that lattice
const SKY = '#cfe6ff';                              // the questions of the light, pale sky blue
const SOUL_COLORS = [0xffd27a, 0x5dff8a, 0xd0202a]; // someone close · a child · a grown-up

// Portals no longer sit at fixed, distance-rolled spots: the fear portal and
// the one into the light are each summoned once, at a corridor crossing near
// wherever the visitor happens to be when they have earned it (see
// _summonPortal). this.summonedPortals holds the one plan per target stage.

// Grandmother's room of one chunk (or null), as a pure function: a big enough
// room, about one chunk in two, anywhere past the first steps, so the red
// rooms soon lead to one and the souls come out.
function kitchenPlan(cx, cz) {
  const room = chunkRooms(cx, cz).find(r => r.x1 - r.x0 >= 4 && r.y1 - r.y0 >= 4);
  if (!room || hash2i(SEED_KITCHEN, cx, cz) % 2 !== 0) return null;
  const x = (cx * CHUNK + (room.x0 + room.x1 + 1) / 2) * CELL;
  const z = (cz * CHUNK + (room.y0 + room.y1 + 1) / 2) * CELL;
  if (Math.hypot(x - ORIGIN.x, z - ORIGIN.z) < 14) return null;   // not in the very first room
  return {
    x, z,
    minX: (cx * CHUNK + room.x0) * CELL, maxX: (cx * CHUNK + room.x1 + 1) * CELL,
    minZ: (cz * CHUNK + room.y0) * CELL, maxZ: (cz * CHUNK + room.y1 + 1) * CELL,
  };
}

// A quiet nightstand and clock, memory ring only: about one chunk in three,
// tucked against a wall on the corridor lattice, clear of any chunk edge
// (where presence doors live) and of anything already reserved (artwork
// walls, writings, posters). Pure function of the chunk and the visit's seed.
function clockPlan(cx, cz, reserved) {
  const cxm = (cx * CHUNK + 8) * CELL, czm = (cz * CHUNK + 8) * CELL;
  if (zoneWeights(cxm, czm).memory <= 0.3) return null;   // as deep as the kitchen
  const re = mulberry32(hash2i(SEED_EGG, cx, cz));
  if (re() > 1 / 3) return null;
  const gi0 = cx * CHUNK, gj0 = cz * CHUNK;
  const sites = [];
  for (let j = 1; j < CHUNK - 1; j++) for (let i = 1; i < CHUNK - 1; i++) {
    if (!EGG_BAND.has(i) && !EGG_BAND.has(j)) continue;              // corridor lattice only
    const gi = gi0 + i, gj = gj0 + j;
    if (solidAtGlobal(gi, gj) || reserved.has(cellKey(gi, gj))) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (solidAtGlobal(gi + di, gj + dj)) sites.push({ gi, gj, nx: -di, nz: -dj });
  }
  if (!sites.length) return null;
  const s = sites[Math.floor(re() * sites.length)];
  return { x: centreOf(s.gi) - s.nx * 0.38, z: centreOf(s.gj) - s.nz * 0.38, rot: Math.atan2(s.nx, s.nz) };   // back 2 cm off the wall face (CELL/2 − depth/2)
}

// ── small helpers ───────────────────────────────────────────────────────────
const cellOf = v => Math.floor(v / CELL);
const centreOf = g => (g + 0.5) * CELL;

// The holy free zone: nothing stands within five steps (3.6 m) of a corridor
// crossing. cornerDist is the distance in metres from a point to the nearest
// crossing square of the 2-cell corridor lattice (bands 4-5 and 10-11 of a
// 16-cell chunk, along both axes).
const CORNER_FREE = 3.6;
const BAND_SPANS = [[-6, -4], [4, 6], [10, 12], [20, 22]];
function bandGap(u) {
  const m = ((u % CHUNK) + CHUNK) % CHUNK;
  let d = Infinity;
  for (const [lo, hi] of BAND_SPANS) d = Math.min(d, Math.max(0, lo - m, m - hi));
  return d;
}
const cornerDist = (x, z) => Math.hypot(bandGap(x / CELL), bandGap(z / CELL)) * CELL;

function pick(list, r) { return list[Math.floor(r * list.length) % list.length]; }

// Whether a getWallSlots() run passes by the open cell (gi, gj) — i.e. that
// cell sits against the run's wall face, within its length.
function slotNearCell(slot, gi, gj) {
  const cx = centreOf(gi), cz = centreOf(gj), half = slot.length * CELL / 2;
  if (slot.normal.x !== 0) {
    if (Math.abs(cx - (slot.position.x + slot.normal.x * CELL / 2)) > CELL * 0.15) return false;
    return cz > slot.position.z - half - 0.05 && cz < slot.position.z + half + 0.05;
  }
  if (Math.abs(cz - (slot.position.z + slot.normal.z * CELL / 2)) > CELL * 0.15) return false;
  return cx > slot.position.x - half - 0.05 && cx < slot.position.x + half + 0.05;
}

// Chalk / pencil scrawl on a transparent canvas: each letter jittered and
// tilted a little, the stroke roughened, so it reads as written by hand.
function scrawlTexture(text, zone) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  const ink = zone.memory > 0.5 ? 'rgba(40,30,22,0.85)'        // pencil on wallpaper
    : zone.accept > 0.5 ? 'rgba(90,96,88,0.7)'                 // faint graphite on pale plaster
      : 'rgba(225,232,220,0.8)';                               // chalk on green paint
  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  // never cut short: a long phrase breaks at the space nearest its middle
  // (non-breaking spaces hold), and each line shrinks until it fits the plank
  const room = c.width - 40, SPREAD = 1.06;           // the widest the jittered spacing can get
  ctx.font = '34px "Departure Mono", monospace';
  let lines = [text];
  if (ctx.measureText(text).width * SPREAD > room) {
    const mid = text.length / 2;
    let cut = -1;
    for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
    if (cut > 0) lines = [text.slice(0, cut), text.slice(cut + 1)];
  }
  let size = lines.length > 1 ? 30 : 34;
  ctx.font = `${size}px "Departure Mono", monospace`;
  const widest = Math.max(...lines.map(l => ctx.measureText(l).width)) * SPREAD;
  if (widest > room) { size = Math.floor(size * room / widest); ctx.font = `${size}px "Departure Mono", monospace`; }
  const rows = lines.length > 1 ? [30, 68] : [48];
  lines.forEach((line, li) => {
    let x = 14;
    for (const ch of line) {
      const w = ctx.measureText(ch).width;
      ctx.save();
      ctx.translate(x + w / 2, rows[li] + (Math.random() - 0.5) * 6);
      ctx.rotate((Math.random() - 0.5) * 0.22);
      ctx.fillText(ch, -w / 2, 0);
      ctx.restore();
      x += w * (0.92 + Math.random() * 0.14);
    }
  });
  // rub some of it away
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}



// Three or four thin scratches, slanted up and to the right, as if a nail was
// dragged along the plaster in the direction of travel.
function scratchTexture() {
  // three nail scratches dragged along the plaster toward the right: each
  // starts as a hairline and bites deeper as it goes, ending in a small
  // chipped gouge. The way reads only to someone looking for it.
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    let x = 30 + k * 10 + Math.random() * 8, y = 48 + k * 15 + Math.random() * 4;
    const end = 190 + k * 8 + Math.random() * 18;
    while (x < end) {                                   // tapering: hairline to gouge
      const t = (x - 30) / (end - 30);
      const nx = x + 5 + Math.random() * 5, ny = y - 0.5 + (Math.random() - 0.5) * 1.8;
      ctx.lineWidth = 0.6 + t * t * 4.2;
      ctx.globalAlpha = 0.25 + t * 0.65;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      x = nx; y = ny;
    }
    ctx.globalAlpha = 0.8;                              // the chip where the nail stopped
    ctx.beginPath(); ctx.ellipse(x + 1, y + 1, 3.2, 2, 0.4, 0, 7); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A small cloud: a few overlapping soft puffs with a brighter crown and a
// greyer belly, feathered all round so nothing reads as an edge.
let CLOUD = null;
function cloudTexture() {
  if (CLOUD) return CLOUD;
  const W = 256, H = 160, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const puff = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y - r * 0.25, r * 0.1, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.6, `rgba(236,240,236,${a * 0.6})`); gr.addColorStop(1, 'rgba(210,216,214,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
  };
  for (const [x, y, r, a] of [[128, 92, 62, 0.8], [86, 96, 48, 0.75], [170, 98, 50, 0.75], [108, 70, 44, 0.7], [150, 68, 40, 0.7], [58, 108, 30, 0.6], [200, 110, 32, 0.6]]) puff(x, y, r, a);
  const belly = g.createLinearGradient(0, 70, 0, 150);        // a greyer underside
  belly.addColorStop(0, 'rgba(120,130,135,0)'); belly.addColorStop(1, 'rgba(120,130,135,0.35)');
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = belly; g.fillRect(0, 0, W, H);
  CLOUD = new THREE.CanvasTexture(c);
  return CLOUD;
}

let GLOW = null;
function glowTexture() {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  GLOW = new THREE.CanvasTexture(c);
  return GLOW;
}

// ── SoulPath ────────────────────────────────────────────────────────────────
export class SoulPath {
  constructor({ scene, world, player, camera, artworks, audio, post, quality, renderer, stage, atmo }) {
    Object.assign(this, { scene, world, player, camera, artworks, audio, post, quality, stage, atmo });
    this.ward = createWardKit(atmo, quality);   // what the hospital left behind (fear stage only)
    this._wardCells = new Map();                // chunk key -> cells the island owns
    this._lastStage = stage.stage;
    this._prevPos = { x: player.pos.x, z: player.pos.y };
    this.kitchenRig = createKitchenRig(scene, renderer, quality);
    this.seen = new Set();          // art ids seen this visit
    this.asked = [];                // what the souls asked, in order, for the card
    this.total = new Set((artworks.list || []).map(a => a.id)).size || 18;
    this.roses = createRoseCounter(this.total);
    this.petals = createPetals(scene, camera, quality);
    this.props = createPropKit(atmo, quality);
    this.drowned = createDrowned(atmo, quality);   // what the water on the floor uncovers, acceptance stage only
    this.chandeliers = createChandeliers(scene);   // grandmother's ice-glass chandeliers, red rooms only   // what each stage leaves along its corridors
    this.roses.set(0, t('rosesLabel', { n: 0, total: this.total }));
    this.finale = null;
    this.chunkStuff = new Map();    // chunk key -> { group, writings[], doors[], kitchen }
    // summoned portals: one plan per target stage (1 fear→memory, 2 →light),
    // set once by _summonPortal and rebuilt into whichever chunk owns it
    this.stageSeen = [0, 0, 0];     // works seen while in each stage (#34)
    this._stageSeenIds = new Set(); // ids already counted into stageSeen
    this.summonedPortals = {};      // target -> { x, z, west, cx, cz }
    this.stairwellPlan = null;      // the fear-stage metal door's plan, once summoned
    this._stairDone = false;        // the dream line is said the first time only
    this.doorsOpen = new Set();     // door keys opened this visit (none now: doors only give way for a moment)
    this.doorsDone = new Set();     // doors that already gave way and slammed: they stay shut
    this._doorLights = [];          // light from a door ajar, for the walls to catch
    this.textures = [];

    // red scratches: a small pool of wall decals, re-placed along the route
    this.markMat = new THREE.MeshBasicMaterial({
      map: scratchTexture(), color: MARK_COLOR, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, fog: true,
    });
    const markGeo = new THREE.PlaneGeometry(0.5, 0.25);
    this.marks = Array.from({ length: MARK_POOL }, () => {
      const m = new THREE.Mesh(markGeo, this.markMat.clone());   // own opacity, shared texture
      m.visible = false;
      m.userData = { key: null, goal: null, fadeAt: 0 };
      scene.add(m);
      // in the light the same mark is a firefly instead: a warm point hanging
      // off the wall that drifts the way to go, fades, and starts again
      const fly = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd79a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
      fly.scale.set(0.16, 0.16, 1);
      fly.visible = false;
      scene.add(fly);
      m.userData.fly = fly;
      return m;
    });
    this._repathT = 0;
    this._pathKey = '';

    // turn-around detection (yaw history over the last ~1.5 s)
    this._yawHist = [];

    // secrets
    this._backT = 0; this._fwdT = 0; this.child = false;
    this._inKitchen = false;
    this._soulIdx = [0, 0, 0];            // next question per soul
    this._soulAt = -1e9; this._walked = SOUL_WALK; this._lastPos = null; // gate between souls
    // guide: five presses of the M key (any layout: physical key) toggles it
    this.guide = null; this._mTimes = []; this._fiveTimes = [];
    addEventListener('keydown', e => {
      if (keyCode(e) !== 'KeyM' || e.repeat) return;
      const now = performance.now();
      this._mTimes = this._mTimes.filter(tm => now - tm < 2500).concat(now);
      if (this._mTimes.length >= 5) { this._mTimes = []; this._toggleGuide(); }
    });
    addEventListener('keydown', e => {
      if ((keyCode(e) !== 'Digit5' && keyCode(e) !== 'Numpad5') || e.repeat) return;
      const now = performance.now();
      this._fiveTimes = this._fiveTimes.filter(tm => now - tm < 3000).concat(now);
      if (this._fiveTimes.length >= 5) { this._fiveTimes = []; this._jumpToRoom(); }
    });
    // five presses of 7: stand before the last work, every other one already seen
    this._sevenTimes = [];
    addEventListener('keydown', e => {
      if ((keyCode(e) !== 'Digit7' && keyCode(e) !== 'Numpad7') || e.repeat) return;
      const now = performance.now();
      this._sevenTimes = this._sevenTimes.filter(tm => now - tm < 3000).concat(now);
      if (this._sevenTimes.length >= 5) { this._sevenTimes = []; this._jumpToLastWork(); }
    });

    // five presses of B: chevrons on the floor to the nearest grandmother's
    // room (the red rooms, if the visitor is still in the hospital); once it
    // is found they go out and the souls begin to wander
    this._bTimes = [];
    addEventListener('keydown', e => {
      if (keyCode(e) !== 'KeyB' || e.repeat) return;
      const now = performance.now();
      this._bTimes = this._bTimes.filter(tm => now - tm < 3000).concat(now);
      if (this._bTimes.length < 5) return;
      this._bTimes = [];
      if (this.stage.set(1)) this.post?.burst(1.4);
      if (this.visitedRoom) return;
      this._guideRoom = true;
      if (!this.guide) this._toggleGuide();
    });

    // five presses of 0: straight into the light, the acceptance stage
    this._zeroTimes = [];
    addEventListener('keydown', e => {
      if ((keyCode(e) !== 'Digit0' && keyCode(e) !== 'Numpad0') || e.repeat) return;
      const now = performance.now();
      this._zeroTimes = this._zeroTimes.filter(tm => now - tm < 3000).concat(now);
      if (this._zeroTimes.length >= 5) { this._zeroTimes = []; if (this.stage.set(2)) this.post?.burst(1.4); }
    });

    // five presses of 1: back into fear, the hospital, from wherever
    this._oneTimes = [];
    addEventListener('keydown', e => {
      if ((keyCode(e) !== 'Digit1' && keyCode(e) !== 'Numpad1') || e.repeat) return;
      const now = performance.now();
      this._oneTimes = this._oneTimes.filter(tm => now - tm < 3000).concat(now);
      if (this._oneTimes.length >= 5) { this._oneTimes = []; if (this.stage.set(0)) this.post?.burst(1.4); }
    });

    // doors take part in collision: wrap World's wall query once
    const orig = world.wallSegmentsNear.bind(world);
    world.wallSegmentsNear = (x, z) => {
      const segs = orig(x, z);
      for (const d of this._doorsNear(x, z)) { segs.push(...d.walls); if (!d.open) segs.push(d.seg); }
      if (this.stage.stage === 0) for (const st of this.chunkStuff.values()) for (const b of (st.ward?.plan.boxes || []).concat(st.beds?.plan.boxes || []))
        if (Math.hypot(b.x - x, b.z - z) < b.r + 1.5) segs.push(...b.segs);
      if (this.stage.stage === 1) for (const st of this.chunkStuff.values()) for (const b of st.toyBoxes || [])
        if (Math.hypot(b.x - x, b.z - z) < b.r + 1.5) segs.push(...b.segs);
      for (const st of this.chunkStuff.values()) for (const b of st.props?.boxes || [])
        if (Math.hypot(b.x - x, b.z - z) < b.r + 1.5) segs.push(...b.segs);
      return segs;
    };
  }

  // The water task's rig (water.js), or a stand-in while it hasn't landed:
  // shallow everywhere, calm, so the acceptance stage still shows its work.
  _water() {
    return window.__app?.water || { level: 0.1, heightAt: () => 0.1, calm: 1, tide: 0 };
  }

  // Open floor cells on the corridor lattice for drowned.js: at least
  // 0.5 m clear of every wall (a cell is 1.2 m, so a cell with no solid
  // neighbour already clears that), not reserved, not the hospital's own
  // islands. drowned.js itself nudges each 0.3–0.5 m off the corridor's
  // middle line, so what it drops is never quite underfoot.
  _drownSpots(cx, cz, reserved) {
    const ward = this._wardCells.get(cx + ':' + cz);
    const out = [];
    for (let j = 1; j < CHUNK - 1; j++) for (let i = 1; i < CHUNK - 1; i++) {
      if (!EGG_BAND.has(i) && !EGG_BAND.has(j)) continue;
      const gi = cx * CHUNK + i, gj = cz * CHUNK + j;
      if (solidAtGlobal(gi, gj) || reserved.has(cellKey(gi, gj)) || ward?.has(cellKey(gi, gj))) continue;
      if (cornerDist(centreOf(gi), centreOf(gj)) < CORNER_FREE) continue;
      let clear = true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (solidAtGlobal(gi + di, gj + dj)) clear = false;
      if (clear && !this._keepOut(cx, cz, centreOf(gi), centreOf(gj), 0.5)) out.push({ x: centreOf(gi), z: centreOf(gj) });
    }
    return out;
  }

  // ── chunk lifecycle (mirrors World) ────────────────────────────────────
  _sync() {
    for (const key of this.world.chunks.keys()) {
      if (!this.chunkStuff.has(key)) {
        const [cx, cz] = key.split(':').map(Number);
        this.chunkStuff.set(key, this._buildChunk(cx, cz));
      }
    }
    // the clock nook only exists in the memory stage, like the ward's islands
    // in the fear stage; re-check every frame, cheap since it is one flag
    const memStage = this.stage.stage === 1;
    for (const stuff of this.chunkStuff.values()) if (stuff.egg) stuff.egg.group.visible = memStage;
    for (const [key, stuff] of this.chunkStuff) {
      if (this.world.chunks.has(key)) continue;
      this.scene.remove(stuff.group);
      stuff.group.userData.gone = true;               // a model still loading must not land here
      if (stuff.ward) stuff.ward.group.userData.gone = true;
      if (stuff.beds) stuff.beds.group.userData.gone = true;
      this._wardCells.delete(key);
      stuff.group.traverse(o => {
        if (o.userData.keep) return;                  // shared scatter geometry and materials
        o.geometry?.dispose();
        if (o.material && o.material !== this.markMat && !this.marks.includes(o) && !o.userData.keepMaterial) { o.material.map?.dispose(); o.material.uniforms?.uMap?.value?.dispose?.(); o.material.dispose(); }
      });
      this.chunkStuff.delete(key);
    }
  }

  _buildChunk(cx, cz) {
    const group = new THREE.Group();
    group.name = 'soul_' + cx + '_' + cz;
    this.scene.add(group);
    const stuff = { group, writings: [], doors: [], kitchen: null, portals: [], egg: null };

    // ── writings: about half the chunks get one, on a deterministic wall run
    const rw = mulberry32(hash2i(SEED_WRITING, cx, cz));
    if (rw() < 0.55) {
      const slots = this.world.getWallSlots(cx, cz).filter(s => s.length >= 2 && cornerDist(s.position.x, s.position.z) >= CORNER_FREE);
      if (slots.length) {
        const slot = slots[Math.floor(rw() * slots.length)];
        const along = (rw() - 0.5) * (slot.length - 1.6) * CELL; // slide along the run
        const pos = new THREE.Vector3(
          slot.position.x + slot.normal.x * 0.012 + (slot.normal.x === 0 ? along : 0),
          WRITING_Y,
          slot.position.z + slot.normal.z * 0.012 + (slot.normal.z === 0 ? along : 0));
        const zone = this.stage.weights();
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28),
          new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
        mesh.position.copy(pos);
        mesh.rotation.y = Math.atan2(slot.normal.x, slot.normal.z);
        group.add(mesh);
        stuff.taken = [[pos.x, pos.z, 1.3]];
        const w = { mesh, zone, seed: rw(), behindT: 0 };
        this._writeOn(w);
        stuff.writings.push(w);
      }
    }

    // ── portals: each one is summoned once, at a crossing near wherever the
    // visitor is when they have earned it (_summonPortal); if it landed in
    // this chunk, build it here so it survives the chunk unloading later.
    const usedEdges = new Set();
    this._ensurePortalsFor(cx, cz, group, stuff);
    this._ensureStairwellFor(cx, cz, group, stuff);

    // ── the walls' questions: a notice board in the hospital (boards.js),
    // one or two a chunk, never on a work's wall. And a Soviet carpet on some walls of the red rooms.
    const rpo = mulberry32(hash2i(SEED_POSTER, cx, cz));
    stuff.posters = []; stuff.carpets = [];
    const hung = new Set(artworkSlots(cx, cz, this.world.getWallSlots(cx, cz)).map(sl => sl.cellKey));
    const long = this.world.getWallSlots(cx, cz).filter(sl => sl.length >= 4 && !hung.has(sl.cellKey));
    for (let i = long.length - 1; i > 0; i--) { const j = Math.floor(rpo() * (i + 1)); [long[i], long[j]] = [long[j], long[i]]; }
    const nPost = rpo() < 0.85 ? (rpo() < 0.45 ? 2 : 1) : 0;
    const onWall = (sl, w, h, y, off) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.atmo.prop({ rust: 0 }));
      mesh.position.set(
        sl.position.x + sl.normal.x * 0.014 + (sl.normal.x === 0 ? off : 0), y,
        sl.position.z + sl.normal.z * 0.014 + (sl.normal.z === 0 ? off : 0));
      mesh.rotation.set(0, Math.atan2(sl.normal.x, sl.normal.z), 0);
      group.add(mesh);
      return mesh;
    };
    long.slice(0, nPost).forEach(sl => {
      const off = (rpo() < 0.5 ? -1 : 1) * (sl.length * CELL / 2 - 0.9);
      const mesh = onWall(sl, 0.78, 1.04, 1.6, off);
      mesh.rotation.z = (rpo() - 0.5) * 0.04;              // hung a little crooked
      (stuff.taken ||= []).push([mesh.position.x, mesh.position.z, 1.0]);
      const p = { mesh, q: Math.floor(rpo() * 1000) };
      this._printPoster(p);
      stuff.posters.push(p);
    });
    const carpetWall = long[nPost];
    if (carpetWall && rpo() < 0.65) {
      const mesh = onWall(carpetWall, 2.0, 1.46, 1.62, 0);     // landscape, as they hung over a sofa
      const seed = Math.floor(rpo() * 1e6);
      mesh.material.uniforms.uMap.value = carpetTexture(seed);
      mesh.material.uniforms.uHasMap.value = 1;
      mesh.visible = this.stage.stage === 1;
      stuff.carpets.push(mesh);
      (stuff.taken ||= []).push([mesh.position.x, mesh.position.z, 1.2]);
    }

    // ── rugs on the parquet of the red rooms: one or two a chunk, 1.8 by
    // 3 metres, turned a little, wherever the floor is open enough round them
    stuff.rugs = [];
    const rr = mulberry32(hash2i(SEED_POSTER ^ 0x7a9, cx, cz));
    const kRoom = kitchenPlan(cx, cz);
    const addRug = (x, z, w, d, rot, pal = null) => {
      const mat = this.atmo.prop({ map: rugTexture(Math.floor(rr() * 1e6), pal), rust: 0 });
      mat.polygonOffset = true; mat.polygonOffsetFactor = -1; mat.polygonOffsetUnits = -1;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
      mesh.position.set(x, 0.003, z); mesh.rotation.y = rot;
      mesh.visible = this.stage.stage === 1;
      group.add(mesh);
      stuff.rugs.push(mesh);
    };
    // under most of grandmother's rooms a big one, the television and table on it
    const bigRug = kRoom && rr() < 0.7;                 // laid below, once the room shows where its television stands
    for (let k = 0, n = stuff.rugs.length + (rr() < 0.6 ? 1 : 0); k < 12 && stuff.rugs.length < n; k++) {   // one rug, and not in every chunk
      const gi = cx * CHUNK + 3 + Math.floor(rr() * (CHUNK - 6)), gj = cz * CHUNK + 3 + Math.floor(rr() * (CHUNK - 6));   // clear of the chunk's edges: no rug meets a neighbour's
      let open = true;
      for (let b = -2; b <= 2 && open; b++) for (let a = -1; a <= 1 && open; a++) if (solidAtGlobal(gi + a, gj + b)) open = false;
      if (!open || (kRoom && Math.hypot(centreOf(gi) - kRoom.x, centreOf(gj) - kRoom.z) < 4.5)) continue;
      if (stuff.rugs.some(m => Math.abs(m.position.x - centreOf(gi)) < 2.6 && Math.abs(m.position.z - centreOf(gj)) < 3.8)) continue;   // never over another rug   // not over grandmother's room
      const rx = centreOf(gi), rz = centreOf(gj);
      addRug(rx, rz, 1.8, 3.0, (rr() - 0.5) * 0.3);   // long side along z, where the room is open
      // and a child's things on it and round it, as if play had just stopped
      const names = ['nevalyashka', 'pyramid', 'yula', 'matryoshki', 'ball'];
      const toys = [];
      for (let t = 0, n = 3 + Math.floor(rr() * 3); t < n; t++) {
        const name = names[Math.floor(rr() * names.length)];
        const on = t < 2;                                  // a couple on the rug, the rest strayed off it
        const x = rx + (rr() - 0.5) * (on ? 1.2 : 2.8), z = rz + (rr() - 0.5) * (on ? 2.2 : 4.0);
        if (solidAtGlobal(cellOf(x), cellOf(z)) || toys.some(o => Math.hypot(o.x - x, o.z - z) < 0.5)) continue;
        toys.push({ name, x, z, yaw: rr() * 6.283 });
      }
      const tk = this.props.toys(group, toys);
      stuff.toys = (stuff.toys || []).concat(tk.meshes);
      for (const m of tk.meshes) m.visible = this.stage.stage === 1;
      stuff.toyBoxes = (stuff.toyBoxes || []).concat(tk.boxes);
    }

    // ── the hospital's leftovers: one small island in some rooms, off the
    // walls that carry a work, a poster or a writing
    const taken = new Set();
    for (const sl of artworkSlots(cx, cz, this.world.getWallSlots(cx, cz))) reserveSlot(taken, sl);
    for (const [x, z, r] of stuff.taken || []) reserveAround(taken, x, z, r);
    const plan = wardPlan(cx, cz, taken, this.ward.withModels);
    if (plan) {
      const wg = new THREE.Group();
      group.add(wg);
      this.ward.build(wg, plan);
      wg.visible = this.stage.stage === 0;
      stuff.ward = { group: wg, plan };
      this._wardCells.set(cx + ':' + cz, plan.cells);
      for (const c of plan.cells) taken.add(c);
    }
    // ── a row of beds wherever a room opens wide (hospital only)
    const bp = bedsPlan(cx, cz, taken);
    if (bp) {
      const bg = new THREE.Group();
      group.add(bg);
      this.ward.buildBeds(bg, bp);
      bg.visible = this.stage.stage === 0;
      stuff.beds = { group: bg, plan: bp };
      for (const c of bp.cells) taken.add(c);
      const wc = this._wardCells.get(cx + ':' + cz) || new Set();   // candles and props keep off the beds too
      for (const c of bp.cells) wc.add(c);
      this._wardCells.set(cx + ':' + cz, wc);
    }

    // ── the clock nook: a nightstand against a corridor wall, memory ring only
    const cp = clockPlan(cx, cz, taken);
    if (cp) {
      const eg = new THREE.Group();
      group.add(eg);
      buildClockNook(eg, cp.x, cp.z, cp.rot, this.atmo);
      eg.visible = this.stage.stage === 1;
      stuff.egg = { group: eg };
    }

    // ── scattered things: candles, teapots, cups. The closer the portal into
    // the next stage, the more of them, so they thicken into a trail.
    // props first: their windows and curtains tell the candles where not to burn
    stuff.reserved = taken;
    if (cp) taken.add(cellKey(cellOf(cp.x), cellOf(cp.z)));
    stuff.props = this._buildProps(group, cx, cz, taken);
    stuff.scatter = this._buildScatter(group, cx, cz);
    stuff.drown = this.stage.stage === 2 ? this.drowned.build(group, cx, cz, this._drownSpots(cx, cz, taken)) : null;

    // ── presence doors on this chunk's west and north edge crossings.
    // Never in the spawn chunk, so nobody starts boxed in.
    if (!(cx === 0 && cz === 0)) {
      const rd = mulberry32(hash2i(SEED_DOOR, cx, cz));
      for (const edge of ['west', 'north']) {
        const band = rd() < 0.5 ? 4 : 10;
        if (rd() > DOOR_EVERY || usedEdges.has(edge)) continue;
        const key = `${cx}:${cz}:${edge}`;
        stuff.doors.push(this._makeDoor(group, cx, cz, edge, band, key));
      }
      for (const d of stuff.doors) d.group.visible = this.stage.stage === 0;   // doors belong to fear alone
    }

    // ── grandmother's room: rare, only deep in the memory ring
    const kp = kitchenPlan(cx, cz);
    if (kp) {
      const kg = new THREE.Group();                   // only exists in the memory stage
      group.add(kg);
      stuff.kitchen = { ...kp, group: kg, room: buildKitchen(kg, kp.x, kp.z) };
      if (bigRug) {                                     // the table and the television both on it, in the lampshade's colours
        const tv = stuff.kitchen.room.tv, m = 1.35;          // room.tv is half a metre before the set: reach past it
        const x0 = Math.max(kp.minX + 0.3, Math.min(kp.x - 1.3, tv.x - m)), x1 = Math.min(kp.maxX - 0.3, Math.max(kp.x + 1.3, tv.x + m));
        const z0 = Math.max(kp.minZ + 0.3, Math.min(kp.z - 1.3, tv.z - m)), z1 = Math.min(kp.maxZ - 0.3, Math.max(kp.z + 1.3, tv.z + m));
        const sh = shadeOf(kp.x, kp.z), hex = n => '#' + n.toString(16).padStart(6, '0');
        if (x1 - x0 > 1.5 && z1 - z0 > 1.5) addRug((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, { field: sh.v[1], dark: sh.v[0], light: hex(sh.fringe) });
      }
      stuff.kitchen.wisps = [0, 1, 2, 0, 1, 2].map(cat => {
        const color = SOUL_COLORS[cat];
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        }));
        sprite.scale.set(0.35, 0.35, 1);
        kg.add(sprite);
        // a faint tail of smaller lights that lag behind, so it reads as alive
        const tail = [0.6, 0.42, 0.28].map(k => {
          const tsp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: k,
          }));
          tsp.scale.set(0.35 * k, 0.35 * k, 1);
          kg.add(tsp);
          return tsp;
        });
        const w = { sprite, tail, cat, gone: false, back: 0, seed: Math.random() * 10, pull: new THREE.Vector3() };
        this._placeWisp(w, stuff.kitchen);
        return w;
      });
    }
    return stuff;
  }

  _printPoster(p) {
    const st = this.stage.stage, u = p.mesh.material.uniforms;
    p.mesh.visible = st === 0;                        // past the hospital the souls, clouds and balloons ask
    if (st !== 0) return;
    const list = t('fearQuestions').concat(t('posterQuestions'));
    const old = u.uMap.value;
    u.uMap.value = boardTexture(list[p.q % list.length], p.q + 1, getLang());
    u.uHasMap.value = 1;
    p.mesh.scale.set(1.55, 0.85, 1);                  // a wide board
    old?.dispose();
  }

  // Somewhere inside the room, at chest height, away from the walls.
  _placeWisp(w, k) {
    const m = 0.8;
    w.home = new THREE.Vector3(
      k.minX + m + Math.random() * Math.max(0.1, k.maxX - k.minX - 2 * m),
      1.2 + Math.random() * 0.6,
      k.minZ + m + Math.random() * Math.max(0.1, k.maxZ - k.minZ - 2 * m));
    w.sprite.position.copy(w.home);
  }

  // A soul scattered: its question types itself on the television and across
  // the screen, under a whisper.
  // Another soul may speak only once the last question has held and the
  // visitor has walked a few steps since.
  _soulReady(time) { return time - this._soulAt >= SOUL_HOLD && this._walked >= SOUL_WALK; }

  // Each soul asks its questions in an order shuffled by the visit's seed.
  _soulOrder(cat, n) {
    this._soulOrders ??= [];
    let o = this._soulOrders[cat];
    if (!o || o.length !== n) {
      o = Array.from({ length: n }, (_, i) => i);
      const r = mulberry32(hash2i(SEED_SOULQ, cat, n));
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
      this._soulOrders[cat] = o;
    }
    return o;
  }

  _askSoul(cat, room, time) {
    if (this.finale) return;                            // the tunnel has risen: no more questions
    this._soulAt = time; this._walked = 0;
    const qs = t('soulQuestions')[cat];
    const order = this._soulOrder(cat, qs.length);
    const text = qs[order[this._soulIdx[cat]++ % qs.length]];
    if (!this.asked.includes(text)) this.asked.push(text);
    const label = t('soulLabels')[cat];
    this.audio?.whisper?.();
    this._say(label, text, '#' + new THREE.Color(SOUL_COLORS[cat]).lerp(new THREE.Color(0xffffff), 0.3).getHexString());   // in the soul's own colour
  }

  // ── the finale ─────────────────────────────────────────────────────────
  // The view turns a little toward open floor, and a couple of steps away an
  // arch of roses grows out of it with light pouring through.
  _beginFinale() {
    this.roses.shed(); this.audio?.finale?.();
    const P = this.player;
    // doors and the hospital's furniture stand in the way too
    const segDist = (x, z, a, b) => {
      const ex = b.x - a.x, ez = b.z - a.z, l = ex * ex + ez * ez || 1;
      const u = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l));
      return Math.hypot(x - a.x - ex * u, z - a.z - ez * u);
    };
    const blocked = (x, z) => {
      for (const st of this.chunkStuff.values()) {
        for (const d of st.doors) for (const sg of [d.seg, ...d.walls]) if (segDist(x, z, sg.a, sg.b) < 0.6) return true;
        for (const b of (st.ward?.plan.boxes || []).concat(st.beds?.plan.boxes || [])) if (Math.hypot(b.x - x, b.z - z) < b.r + 0.3) return true;
      }
      return false;
    };
    let spot = findArchSpot(P.pos.x, P.pos.y, P.yaw, blocked);
    if (!spot) {                                        // nowhere better: straight ahead
      const dx = -Math.sin(P.yaw), dz = -Math.cos(P.yaw);
      spot = { x: P.pos.x + dx * 2.2, z: P.pos.y + dz * 2.2, dir: [dx, dz], yaw: P.yaw };
    }
    const arch = buildRoseArch(t('archText'));
    arch.group.position.set(spot.x, 0, spot.z);
    arch.group.rotation.y = Math.atan2(-spot.dir[0], -spot.dir[1]);   // its face toward the visitor
    this.scene.add(arch.group);
    arch.fitToWalls((x, z) => solidAtGlobal(cellOf(x), cellOf(z)));
    // first the walls go: a pearl haze rises off the water, the walls, the
    // ceiling and every thing come apart in it, and only the water is left
    // to the horizon. Then, out of nothing, the tunnel of roses rises.
    arch.group.visible = false;
    // the view turns to the entrance itself (_updateFinale): the tunnel
    // keeps to the middle of the corridor, the visitor may not
    this.finale = { arch, spot, from: P.yaw, t: 0, side: null, vanish: 0 };
    this.post?.burst?.(0.4);
  }

  _updateFinale(dt, time) {
    const f = this.finale, P = this.player;
    if (f.vanish < 1) {
      f.vanish = Math.min(1, f.vanish + dt / FINALE_VANISH);
      const e = f.vanish * f.vanish * (3 - 2 * f.vanish);
      this.atmo.setVanish?.(e);
      window.__app.vanish = f.vanish;                   // main.js thickens the fog while it happens
      for (const g of this.artworks.chunkGroups?.values() || []) g.visible = e < 0.55;   // the works go with the walls they hung on
      if (f.vanish < 1) return;
      f.arch.group.visible = true;
      this.petals.stream({ x: f.spot.x, z: f.spot.z, dir: f.spot.dir, length: f.arch.length });
    }
    if (f.t < 1) {
      f.t = Math.min(1, f.t + dt / 1.6);
      const e = f.t * f.t * (3 - 2 * f.t);
      // aim from where the visitor is now: collision may have nudged them
      let turn = Math.atan2(-(f.spot.x - P.pos.x), -(f.spot.z - P.pos.y)) - f.from;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      P.yaw = f.from + turn * e;
    }
    f.arch.update(dt, time);
    // walking through: the visitor's side of the far arch flips while inside its span
    // through the far end of the tunnel, not just its entrance
    const [dx, dz] = f.spot.dir, rx = P.pos.x - (f.spot.x + dx * f.arch.length), rz = P.pos.y - (f.spot.z + dz * f.arch.length);
    const side = -(rx * dx + rz * dz), across = Math.abs(rx * -dz + rz * dx);
    if (f.side !== null && f.side > 0 && side <= 0 && across < f.arch.halfWidth && !this._carded) this._endWalk();
    f.side = side;
  }

  _endWalk() {
    this._carded = true;
    this.player.locked = true;
    this.audio?.silence?.();
    showCard({
      questions: this.asked,
      strings: {
        heading: t('cardHeading'), empty: t('cardEmpty'), boot: t('cardBoot'),
        save: t('cardSave'), back: t('cardBack'), again: t('walkAgain'),
      },
      onBack: () => { this.player.locked = false; this._carded = false; this.audio?.unsilence?.(); },
      onAgain: () => location.reload(),
    });
  }

  // A line typed across the lower screen, then gone.
  // color: the asker's own colour for the words (a soul's, a pale sky blue
  // in the light); without it the screen's phosphor green
  _say(label, text, color = null, { keep = false } = {}) {
    if (label !== null) {                               // the television shows exactly what a soul says
      this._tvText = text;
      this._tvUntil = performance.now() + 11000;
      this._tvDirty = true;
    }
    document.getElementById('soul-q')?.remove();
    const el = document.createElement('div');
    el.id = 'soul-q';
    el.innerHTML = `<p class="sq-label"></p><p class="sq-text"></p>`;
    if (color) el.style.setProperty('--q', color);
    if (label) el.querySelector('.sq-label').textContent = label; else el.querySelector('.sq-label').remove();
    document.body.appendChild(el);
    const tEl = el.querySelector('.sq-text');
    let i = 0;
    const type = setInterval(() => { tEl.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(type); }, 45);
    requestAnimationFrame(() => el.classList.add('visible'));
    // a tap anywhere but the controls puts it away; otherwise it fades on its own
    const close = () => {
      removeEventListener('pointerdown', onTap, true);
      clearInterval(type);
      el.classList.remove('visible'); setTimeout(() => el.remove(), 1200);
    };
    const onTap = e => { if (!e.target.closest?.('button, #pad, #hud-toolbar, a')) close(); };
    setTimeout(() => { if (el.isConnected) addEventListener('pointerdown', onTap, true); }, 400);   // not the tap that set it off
    if (!keep) setTimeout(() => { if (el.isConnected && el.classList.contains('visible')) close(); }, 11000);
    return close;
  }

  _boardZoom(fov) {
    const P = this.player;
    P.fov = fov; P.camera.fov = fov; P.camera.updateProjectionMatrix();
  }

  // In fear, on hands: passing a notice board stops the walk, turns the view
  // to it and leans in until its question can be read. Hands lowered, it
  // stays; a fist held for BOARD_FIST seconds turns the view back the way it
  // was going and the walk goes on. Each board asks once.
  _updateBoards(dt) {
    const P = this.player, b = this._board;
    if (b) {
      if (P.auto !== b.auto) { this._boardZoom(b.fov0); this._board = null; return; }   // the keys took over, or Space
      // the view leans in on the board while it asks, and back out as the walk turns away
      const want = b.phase === 'hold' ? BOARD_FOV : b.fov0;
      this._boardZoom(P.fov + (want - P.fov) * Math.min(1, dt * 2.4));
      if (b.phase === 'hold') {
        b.auto.yaw = Math.atan2(-(b.x - P.pos.x), -(b.z - P.pos.y));   // at the board itself, as the walk comes to rest
        b.fist = P.hand.present && P.hand.anyFist ? b.fist + dt : 0;
        if (b.fist >= BOARD_FIST) { b.phase = 'back'; b.auto.yaw = b.back; }
      } else if (Math.abs(Math.atan2(Math.sin(b.back - P.yaw), Math.cos(b.back - P.yaw))) < 0.06) {
        this._boardZoom(b.fov0);
        P.auto = null; this._board = null;
      }
      return;
    }
    if (this.stage.stage !== 0 || P.mode !== 'hands' || !P.hand.present || P.auto || P.locked || this.finale || window.__app?.training) return;
    if (P.vel.length() < 0.3) return;                   // only a walk passing by, not someone standing near
    this._boardsAsked ||= new Set();
    for (const st of this.chunkStuff.values()) for (const p of st.posters || []) {
      const m = p.mesh;
      if (!m.visible) continue;
      const key = `${m.position.x.toFixed(1)},${m.position.z.toFixed(1)}`;
      if (this._boardsAsked.has(key)) continue;
      const nx = Math.sin(m.rotation.y), nz = Math.cos(m.rotation.y);   // the board faces into the corridor
      const dx = P.pos.x - m.position.x, dz = P.pos.y - m.position.z;
      if (Math.hypot(dx, dz) > BOARD_NEAR || dx * nx + dz * nz < 0.2) continue;
      if (-(dx * -Math.sin(P.yaw) + dz * -Math.cos(P.yaw)) < -0.4 * Math.hypot(dx, dz)) continue;   // one already behind is let be
      if (!this._lineOfSight(P.pos.x, P.pos.y, m.position.x + nx * 0.3, m.position.z + nz * 0.3)) continue;
      this._boardsAsked.add(key);
      const auto = { kind: 'board', yaw: Math.atan2(dx, dz) };
      P.auto = auto;
      this._board = { auto, back: P.yaw, phase: 'hold', fist: 0, fov0: P.fov, x: m.position.x, z: m.position.z };   // the question is on the board itself
      return;
    }
  }

  _writeOn(w) {
    const listKey = w.zone.accept > 0.5 ? 'wallAccept' : w.zone.memory > 0.5 ? 'wallMemory' : 'wallFear';
    const text = pick(t(listKey), w.seed);
    const old = w.mesh.material.map;
    w.mesh.material.map = scrawlTexture(text, w.zone);
    w.mesh.material.needsUpdate = true;
    old?.dispose();
  }

  _makeDoor(group, cx, cz, edge, band, key) {
    // The corridor crosses the edge through cells band, band+1 (2.4 m wide):
    // it gets closed by a piece of wall with a real door in it.
    const span = 2 * CELL, west = edge === 'west';
    const x = west ? cx * CHUNK * CELL : (cx * CHUNK + band) * CELL + span / 2;
    const z = west ? (cz * CHUNK + band) * CELL + span / 2 : cz * CHUNK * CELL;
    const d = buildDoorway(span, this.world.mat.wall, this.stage.stage, t('doorWait'));
    d.group.position.set(x, 0, z);
    d.group.rotation.y = west ? Math.PI / 2 : 0;
    group.add(d.group);
    // collision: the two wall pieces always, the door gap while closed
    const segAlong = (u0, u1) => west
      ? { a: { x, z: z + u0 }, b: { x, z: z + u1 }, nx: 1, nz: 0 }
      : { a: { x: x + u0, z }, b: { x: x + u1, z }, nx: 0, nz: 1 };
    const walls = [segAlong(-span / 2, -d.gap / 2), segAlong(d.gap / 2, span / 2)];
    const seg = segAlong(-d.gap / 2, d.gap / 2);
    const routeSeg = segAlong(-span / 2, span / 2);   // path-finding treats the closed crossing as shut
    return { key, group: d.group, pivot: d.pivot, leaf: d.door, walls, seg, routeSeg, x, z, waitT: 0, t: 0, open: false,
      phase: this.doorsDone.has(key) ? 'done' : 'wait', rays: null, dir: 1 };   // open stays false: a door never lets you through
  }


  // A doorway of light across a 2.4 m corridor crossing: a baroque frame
  // and a shimmering veil in the colours of the stage it leads to. x, z: the
  // crossing's centre; west: true if the visitor crosses it by moving in x
  // (the frame spans z), false if they cross it moving in z (frame spans x).
  _makePortal(group, x, z, west, target) {
    const span = 2 * CELL;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = west ? Math.PI / 2 : 0;
    // a walk-through baroque picture frame, gilt scratched down to the bole
    const openW = span - 0.6, openH = CEIL_H - 0.72;
    g.add(baroqueFrame(openW, openH, 0.3));
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(openW, openH - 0.06), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uFade: { value: 1 },
        uA: { value: new THREE.Color(target === 2 ? 0xfff6e0 : 0x9b0f14) },
        uB: { value: new THREE.Color(target === 2 ? 0xbfd6c8 : 0x1f6b3a) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime, uFade; uniform vec3 uA, uB; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          // two layers of slow noise flowing upward, bright at the core, fading to the frame
          float a = n(vUv * vec2(4.0, 7.0) + vec2(0.0, -uTime * 0.35));
          float b = n(vUv * vec2(9.0, 3.0) + vec2(uTime * 0.2, -uTime * 0.6));
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
          vec3 c = mix(uB, uA, a) * (0.35 + 0.65 * b);
          gl_FragColor = vec4(c * edge * uFade * 1.8, edge * 0.9 * uFade);
        }`,
    }));
    veil.position.set(0, 0.06 + openH / 2, 0);
    g.add(veil);
    group.add(g);
    return { x, z, west, span: openW, target, veil, group: g };
  }

  // Walking through a portal: the side of its plane the visitor is on flips
  // while they are inside its span.
  _checkPortals(prev, cur) {
    for (const st of this.chunkStuff.values()) for (const p of st.portals) {
      if (Math.abs(p.x - cur.x) > 3 || Math.abs(p.z - cur.z) > 3) continue;
      const a0 = p.west ? prev.x - p.x : prev.z - p.z, a1 = p.west ? cur.x - p.x : cur.z - p.z;
      const along = p.west ? cur.z - p.z : cur.x - p.x;
      if (!p.group.visible) continue;
      if (Math.sign(a0) !== Math.sign(a1) && Math.abs(along) < p.span / 2 && this.stage.go(p.target)) {
        this.post?.burst(1.6);
        this.audio?.chime();
      }
    }
  }

  // The one portal leading past the current stage, if it has been summoned
  // yet — as a list, so candles and props can keep treating it as "portals".
  _nextPortals() {
    const p = this.summonedPortals[this.stage.stage + 1];
    return p ? [p] : [];
  }

  // If a portal (or the stairwell's door) was summoned into this chunk,
  // build it now — called both when the chunk is first built and, later,
  // if it is rebuilt after unloading with the plan already in hand.
  _ensurePortalsFor(cx, cz, group, stuff) {
    for (const target of [1, 2]) {
      const plan = this.summonedPortals[target];
      if (!plan || plan.cx !== cx || plan.cz !== cz) continue;
      if (stuff.portals.some(p => p.target === target)) continue;
      stuff.portals.push(this._makePortal(group, plan.x, plan.z, plan.west, target));
    }
  }
  _ensureStairwellFor(cx, cz, group, stuff) {
    const plan = this.stairwellPlan;
    if (!plan || plan.cx !== cx || plan.cz !== cz || stuff.stairwell) return;
    const idx = (hash2i(SEED_STAIR, 0, 0) % 5) + 1;
    const sw = buildStairwell(this.atmo, `assets/stairs/stairs_${idx}.webp`);
    sw.group.position.set(plan.x, 0, plan.z);
    sw.group.rotation.y = plan.rotY;
    group.add(sw.group);
    sw.phase = 'wait';
    sw.pic = idx;
    sw.t = 0;
    stuff.stairwell = sw;
  }

  // Spots for a portal: the exact centre line of a plain 2-cell corridor,
  // never a crossing, never where a room opens onto it — solid wall on both
  // sides of the cell and of the cells either side of it along the corridor.
  // Returns the centre of the 2-cell width, and whether the visitor crosses
  // the frame moving in x (west) or in z. Cells the visitor cannot yet walk
  // to (behind a closed presence door) are left out.
  _latticeCrossings(gi0, gj0, near, far, reach) {
    const out = [];
    const R = Math.ceil(far / CELL) + 1;
    const bandLow = v => { const m = mod16(v); return m === 4 || m === 10; };   // first cell of a 2-cell band
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const gi = gi0 + di, gj = gj0 + dj;
      if (solidAtGlobal(gi, gj)) continue;
      const inI = EGG_BAND.has(mod16(gi)), inJ = EGG_BAND.has(mod16(gj));
      if (inI === inJ) continue;                       // a crossing or a room cell, not a plain corridor
      let x, z, west;
      if (inI) {                                       // a corridor running along z: walls at i-1 and i+2
        const lo = bandLow(gi) ? gi : gi - 1;
        if ([-1, 0, 1].some(k => !solidAtGlobal(lo - 1, gj + k) || !solidAtGlobal(lo + 2, gj + k))) continue;
        if (gi !== lo) continue;                       // one candidate per corridor cell row
        x = (lo + 1) * CELL; z = centreOf(gj); west = false;
      } else {                                         // a corridor running along x
        const lo = bandLow(gj) ? gj : gj - 1;
        if ([-1, 0, 1].some(k => !solidAtGlobal(gi + k, lo - 1) || !solidAtGlobal(gi + k, lo + 2))) continue;
        if (gj !== lo) continue;
        x = centreOf(gi); z = (lo + 1) * CELL; west = true;
      }
      const d = Math.hypot(x - centreOf(gi0), z - centreOf(gj0));
      if (d < near || d > far) continue;
      if (cornerDist(x, z) < CORNER_FREE) continue;    // never near a corner
      if (reach && !reach.has(gi + ',' + gj)) continue;
      out.push({ gi, gj, x, z, d, west });
    }
    return out;
  }

  // A crossing 8–16 m out becomes the next portal, once enough works have
  // been seen: preferring one ahead of the view, always one the visitor can
  // actually walk to.
  _summonPortal(target, time) {
    const P = this.player;
    const gi0 = cellOf(P.pos.x), gj0 = cellOf(P.pos.y);
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const reach = this._reachableSet(gi0, gj0);
    const cands = this._latticeCrossings(gi0, gj0, PORTAL_NEAR, PORTAL_FAR, reach);
    if (!cands.length) return false;                     // nothing in reach yet: try again next frame
    for (const c of cands) c.ahead = (fx * (c.x - P.pos.x) + fz * (c.z - P.pos.y)) / (c.d || 1);
    cands.sort((a, b) => b.ahead - a.ahead || a.d - b.d);
    const c = cands[0];
    const plan = { x: c.x, z: c.z, west: c.west, target, cx: Math.floor(c.gi / CHUNK), cz: Math.floor(c.gj / CHUNK) };
    this.summonedPortals[target] = plan;
    const stuff = this.chunkStuff.get(plan.cx + ':' + plan.cz);
    this._clearAround(plan.x, plan.z, 2.4);
    if (stuff) { stuff.portals.push(this._makePortal(stuff.group, plan.x, plan.z, plan.west, target)); this._rebuildChunkProps(plan.cx, plan.cz, stuff); }
    this._rebuildScatter();                              // no candle left standing in its way, in any chunk
    this.post?.burst(0.4);
    this.audio?.whisper?.();
    if (target === 1) this._summonStairwell(plan, gi0, gj0);
    return true;
  }

  // Breadth-first: every open cell the visitor can reach without crossing a
  // shut presence door, as a Set of "gi,gj" keys.
  _reachableSet(gi0, gj0, maxNodes = 4000) {
    const key = (i, j) => i + ',' + j;
    const seen = new Set([key(gi0, gj0)]);
    const q = [[gi0, gj0]];
    for (let head = 0; head < q.length && head < maxNodes; head++) {
      const [i, j] = q[head];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, k = key(ni, nj);
        if (seen.has(k) || solidAtGlobal(ni, nj) || this._doorBlocks(i, j, ni, nj)) continue;
        seen.add(k); q.push([ni, nj]);
      }
    }
    return seen;
  }

  // The metal door onto the ruined stairwell: once, in fear, somewhere on
  // the route between the visitor and the portal just summoned, 2–5 m
  // before it — a wall slot at least 2 cells long, never one already
  // carrying a work.
  _summonStairwell(portal, gi0, gj0) {
    if (this.stairwellPlan) return;
    const goalGi = cellOf(portal.x - 0.01), goalGz = cellOf(portal.z - 0.01);
    const path = this._route((i, j) => (Math.abs(i - goalGi) <= 1 && Math.abs(j - goalGz) <= 1 ? Infinity : -Math.hypot(i - goalGi, j - goalGz)), gi0, gj0, 20000);
    if (path.length < 2) return;
    let d = 0;
    const zone = [];
    for (let k = path.length - 1; k > 0; k--) {
      const [i, j] = path[k], [pi, pj] = path[k - 1];
      d += Math.hypot(i - pi, j - pj) * CELL;
      if (d >= STAIR_BEFORE_MIN && d <= STAIR_BEFORE_MAX) zone.push({ gi: pi, gj: pj });
      if (d > STAIR_BEFORE_MAX) break;
    }
    this._placeStairwell(zone, portal);
  }

  // The metal door on the first turn after the first work is seen: along the
  // corridor the visitor has just turned into, 4 to 14 m ahead, on a side wall.
  _summonStairwellAhead() {
    if (this.stairwellPlan) return;
    const P = this.player, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const ax = Math.abs(fx) > Math.abs(fz) ? Math.sign(fx) : 0, az = ax ? 0 : Math.sign(fz);
    const zone = [];
    for (let d = 0.6; d < 14; d += CELL) {
      const x = P.pos.x + ax * d, z = P.pos.y + az * d;
      if (!this.world.isWalkable(x, z)) break;
      if (d >= 4) zone.push({ gi: cellOf(x), gj: cellOf(z) });
    }
    this._placeStairwell(zone, { x: P.pos.x, z: P.pos.y });
  }

  // Find a wall run beside one of the zone's cells for the metal door, clear
  // of corners, of works and of `away` (a portal, or the visitor), and set it there.
  _placeStairwell(zone, away) {
    const portal = away;
    for (const clear of [CORNER_FREE, 1.8]) {          // the holy zone first; only if no slot at all, a smaller one
      for (const w of zone) {
        const cx = Math.floor(w.gi / CHUNK), cz = Math.floor(w.gj / CHUNK);
        const wallSlots = this.world.getWallSlots(cx, cz);
        const hung = new Set(artworkSlots(cx, cz, wallSlots).map(sl => sl.cellKey));
        // the door may slide along a run of wall, off its middle, to stand clear of the corners
        let slot = null, at = null;
        for (const sl of wallSlots) {
          if (sl.length < 2 || hung.has(sl.cellKey) || !slotNearCell(sl, w.gi, w.gj)) continue;
          const tx = Math.abs(sl.normal.z), tz = Math.abs(sl.normal.x), reach = sl.length * CELL / 2 - 0.9;
          for (let off = 0; off <= reach + 1e-6 && !at; off += 0.3) for (const sgn of off ? [1, -1] : [1]) {
            const x = sl.position.x + tx * off * sgn, z = sl.position.z + tz * off * sgn;
            if (cornerDist(x, z) >= clear && Math.hypot(x - portal.x, z - portal.z) >= 4.8) { slot = sl; at = { x, z }; break; }
          }
          if (at) break;
        }
        if (!slot) continue;
        this.stairwellPlan = { x: at.x, z: at.z, rotY: Math.atan2(slot.normal.x, slot.normal.z), cx, cz };
        this._clearAround(at.x, at.z, 2.4);
        const stuff = this.chunkStuff.get(cx + ':' + cz);
        if (stuff) {
          this._ensureStairwellFor(cx, cz, stuff.group, stuff);
          this._rebuildChunkProps(cx, cz, stuff);          // whatever already stood there makes way for the door
        }
        this._rebuildScatter();                          // candles in the chunks around it too
        return;
      }
    }
  }


  // The heading that looks straight down the route to a portal: toward the
  // route's cell a few steps ahead, so it follows the corridor rather than
  // cutting across corners. null when there is no portal or no route.
  _wayYaw(portal) {
    if (!portal) return null;
    const P = this.player;
    const gi = cellOf(portal.x - 0.01), gj = cellOf(portal.z - 0.01);
    const path = this._route((i, j) => (Math.abs(i - gi) <= 1 && Math.abs(j - gj) <= 1 ? Infinity : -Math.hypot(i - gi, j - gj)), cellOf(P.pos.x), cellOf(P.pos.y), 20000);
    if (path.length < 2) return null;
    const [ti, tj] = path[Math.min(4, path.length - 1)];
    return Math.atan2(-(centreOf(ti) - P.pos.x), -(centreOf(tj) - P.pos.y));
  }

  // ── fear, paced ────────────────────────────────────────────────────────
  // Fear shows three works, found one at a time. The first hangs near the
  // start. The second comes only once the walk has taken in a few scrawls on
  // the walls and a few of the things left lying about; the third after more
  // of the hospital's things (beds, chairs, trolleys). Each appears on a wall
  // somewhere out of sight, never before the visitor's eyes. After the third
  // is seen, two more turns of the corridor, and only then the metal door and
  // the portal. A thing counts as found when the walk passes close by,
  // looking its way. Works not found yet are hidden, by instance: the same
  // picture may hang in several chunks.
  _fearPacing(speed) {
    const act = this.artworks.active, P = this.player;
    if (this.stage.stage !== 0) {
      if (this._fear?.hiding) { for (const a of act) { a.hidden = false; if (a.sub) a.sub.visible = true; } this._fear.hiding = false; }
      return;
    }
    const f = this._fear ||= { shown: new Set(), ids: new Set(), found: new Set(), writings: 0, things: 0, unlocked: 1, at2: 0, turns: 0, axis: null, hiding: true };
    const keyOf = a => a.art.id + '@' + a.centerWorld.x.toFixed(1) + ',' + a.centerWorld.z.toFixed(1);
    for (const a of act) { const on = f.shown.has(keyOf(a)); a.hidden = !on; if (a.sub) a.sub.visible = on; }

    // what the walk has taken in
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const look = (key, x, z, kind) => {
      if (f.found.has(key)) return;
      const dx = x - P.pos.x, dz = z - P.pos.y, d = Math.hypot(dx, dz);
      if (d < FIND_NEAR && (fx * dx + fz * dz) / (d || 1) > 0.3) { f.found.add(key); f[kind]++; }
    };
    for (const t of this._fearFinds()) look(t.key, t.x, t.z, t.kind);

    // the next work is due
    const shownSeen = [...f.ids].every(id => this.seen.has(id));
    if (f.unlocked === 1 && shownSeen && f.shown.size && f.writings >= FEAR_FIND_2.writings && f.things >= FEAR_FIND_2.things) { f.unlocked = 2; f.at2 = f.things; }
    else if (f.unlocked === 2 && shownSeen && f.shown.size >= 2 && f.things - f.at2 >= FEAR_FIND_3) f.unlocked = 3;
    if (f.shown.size < f.unlocked) {
      const first = f.shown.size === 0;
      let best = null, bd = Infinity;
      for (const a of act) {
        if (f.ids.has(a.art.id) || this.seen.has(a.art.id)) continue;
        const dx = a.centerWorld.x - P.pos.x, dz = a.centerWorld.z - P.pos.y, d = Math.hypot(dx, dz);
        if (first ? d > 30 : (d < 6 || d > 22)) continue;
        if (!first && ((fx * dx + fz * dz) / (d || 1) > 0.2 && this._lineOfSight(P.pos.x, P.pos.y, a.centerWorld.x + a.normal.x * 0.3, a.centerWorld.z + a.normal.z * 0.3))) continue;   // never appears in plain view
        if (d < bd) { bd = d; best = a; }
      }
      if (best) {
        f.shown.add(keyOf(best)); f.ids.add(best.art.id); best.hidden = false; if (best.sub) best.sub.visible = true;
        if (!first) this._rebuildScatter();              // the candles re-light toward it
      }
    }

    // turns of the corridor, walking: the first one after the first work
    // brings the metal door into the corridor ahead; after the third work
    // they count toward the portal
    if (speed > 0.5) {
      const axis = ((Math.round(P.yaw / (Math.PI / 2)) % 4) + 4) % 4;
      if (f.axis === null) f.axis = axis;
      else if (axis !== f.axis) {
        f.axis = axis;
        if (this.stageSeen[0] >= 1 && !this.stairwellPlan) this._summonStairwellAhead();
        if (this.stageSeen[0] >= PORTAL_SEEN_FEAR) f.turns++;
      }
    }
  }

  // Everything in fear that counts as a find: scrawls and boards on the walls,
  // things lying about, the ward's beds and chairs. Keys are stable per chunk.
  _fearFinds() {
    const out = [];
    for (const [ck, st] of this.chunkStuff) {
      st.writings.forEach((w, i) => out.push({ key: 'w' + ck + ':' + i, x: w.mesh.position.x, z: w.mesh.position.z, kind: 'writings' }));
      (st.posters || []).forEach((p, i) => out.push({ key: 'b' + ck + ':' + i, x: p.mesh.position.x, z: p.mesh.position.z, kind: 'writings' }));
      (st.props?.walls || []).concat(st.props?.air || []).forEach((p, i) => out.push({ key: 'p' + ck + ':' + i, x: p.x, z: p.z, kind: 'things' }));
      (st.ward?.plan.boxes || []).concat(st.beds?.plan.boxes || []).forEach((b, i) => out.push({ key: 'm' + ck + ':' + i, x: b.x, z: b.z, kind: 'things' }));
    }
    return out;
  }

  // Threshold check, run every frame: cheap when nothing is due.
  _maybeSummonPortal(time) {
    const st = this.stage.stage;
    // ?dream=1|2|3 (a sketch to judge): the metal door at once, the visitor set before it
    if (DREAM_PREVIEW && st === 0) {
      if (!this.summonedPortals[1]) this._summonPortal(1, time);
      const pl = this.stairwellPlan;
      if (pl && !this._dreamPlaced) {
        this._dreamPlaced = true;
        const nx = Math.sin(pl.rotY), nz = Math.cos(pl.rotY);
        let d = 0.6;
        while (d < 4 && this.world.isWalkable(pl.x + nx * (d + 0.2), pl.z + nz * (d + 0.2))) d += 0.2;
        this.player.pos.set(pl.x + nx * d, pl.z + nz * d);
        this.player.yaw = pl.rotY;
      }
      if (pl) return;
    }
    if (st === 0 && !this.summonedPortals[1] && this.stageSeen[0] >= PORTAL_SEEN_FEAR && (this._fear?.turns ?? FEAR_TURNS) >= FEAR_TURNS) this._summonPortal(1, time);
    else if (st === 0 && this.summonedPortals[1] && !this.stairwellPlan && time - (this._stairTry || 0) > 1) {
      // no wall for the metal door on the first try: look again from wherever the walk is now
      this._stairTry = time;
      this._summonStairwell(this.summonedPortals[1], cellOf(this.player.pos.x), cellOf(this.player.pos.y));
    }
    else if (st === 1 && !this.summonedPortals[2] && this.visitedRoom && this.stageSeen[1] >= PORTAL_SEEN_MEMORY) this._summonPortal(2, time);
  }

  // Candles along the walls are the map. Their colour tells how close you are:
  //   fear stage     the flame reddens toward a portal into the red rooms
  //   memory stage   the flame turns yellow toward the next portal, and the
  //                  wax itself reddens toward grandmother's room
  //   light stage    pale, nothing left to find
  _buildScatter(group, cx, cz) {
    const st = this.stage.stage;
    const rnd = mulberry32(hash2i(SEED_SCATTER ^ (st * 7919), cx, cz));
    const portals = this._nextPortals(cx, cz);
    const kitchens = [];
    if (st === 1) for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) { const k = kitchenPlan(cx + dx, cz + dz); if (k) kitchens.push(k); }
    const seekRoom = st === 1 && !this.visitedRoom;   // red rooms: first the room, then the way on
    const near = (list, x, z) => { let d = Infinity; for (const p of list) d = Math.min(d, Math.hypot(p.x - x, p.z - z)); return d; };
    const arts = this.artworks.active.filter(a => !a.hidden).map(a => ({ x: a.centerWorld.x, z: a.centerWorld.z, seen: this.seen.has(a.art.id) }));
    const unseen = arts.filter(a => !a.seen);
    const prox = d => { const k = Math.max(0, Math.min(1, 1 - d / 45)); return k * k * (3 - 2 * k); };
    const YELLOW = new THREE.Color(0xffd27a), RED = new THREE.Color(0xff2a14), PALE_WAX = new THREE.Color(0xe6dac0), RED_WAX = new THREE.Color(0x8e1216);
    const items = [];
    const wardCells = this._wardCells.get(cx + ':' + cz);
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
      const gi = cx * CHUNK + i, gj = cz * CHUNK + j;
      if (solidAtGlobal(gi, gj)) continue;
      if (wardCells?.has(cellKey(gi, gj))) continue;  // the hospital's things own these cells
      if (cornerDist(centreOf(gi), centreOf(gj)) < CORNER_FREE) continue;   // the holy zone round a corner stays bare
      const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([di, dj]) => solidAtGlobal(gi + di, gj + dj));
      const r = rnd();
      if (!side) continue;                              // only along walls, so paths stay clear
      const x = centreOf(gi) + side[0] * 0.36 + (rnd() - 0.5) * 0.3;
      const z = centreOf(gj) + side[1] * 0.36 + (rnd() - 0.5) * 0.3;
      const pp = seekRoom ? 0 : prox(near(portals, x, z));
      const pk = st === 1 ? Math.max(0, Math.min(1, 1 - near(kitchens, x, z) / 70)) : 0;
      // unseen works draw candles to them; around works already seen they are embers
      const du = near(unseen, x, z), spent = du > CANDLE_NEAR && near(arts, x, z) < CANDLE_NEAR;
      const pa = du < CANDLE_NEAR ? 1 - du / CANDLE_NEAR : 0;
      if (r > (st === 0 ? 0.06 : 0.035) + 0.05 * Math.max(pp, pk) + 0.08 * pa) continue;   // fear is lit more often: the candles are its map
      const flame = st === 0 ? YELLOW.clone().lerp(RED, pp)
        : seekRoom ? YELLOW.clone().lerp(RED, pk)        // before the room: everything reddens toward it
          : st === 1 ? RED.clone().lerp(YELLOW, pp)      // after: the flame yellows toward the way into the light
            : new THREE.Color(0xfff4dc);
      const wax = st === 1 ? PALE_WAX.clone().lerp(RED_WAX, pk) : PALE_WAX.clone();
      if (spent) flame.copy(EMBER);
      else if (pa > 0) flame.multiplyScalar(1 + 0.35 * pa);   // brighter the closer the unseen work
      // the map's own direction: the nearest thing this candle points toward
      // (a portal, or an unseen work), for stage 2's floating candles to
      // drift along without recomputing it every frame
      let tgx = 0, tgz = 0, tgd = Infinity;
      for (const p of portals) { const d = Math.hypot(p.x - x, p.z - z); if (d < tgd) { tgd = d; tgx = p.x - x; tgz = p.z - z; } }
      for (const a of unseen) { const d = Math.hypot(a.x - x, a.z - z); if (d < tgd) { tgd = d; tgx = a.x - x; tgz = a.z - z; } }
      if (tgd < Infinity && tgd > 1e-3) { tgx /= tgd; tgz /= tgd; }
      if (this._nearFlammable(cx, cz, x, z) || this._keepOut(cx, cz, x, z, 0.25)) continue;
      items.push({ type: 'candle', x, z, rot: rnd() * 6.28, flame, wax, spent, tgx, tgz });
    }
    return buildScatter(group, items);
  }

  // After a stage change the trail must lead to the next portal: rebuild it.
  // Things the stage leaves along its corridors (props.js): spots against a
  // wall on the corridor lattice, kept apart, clear of works, writings,
  // posters, the hospital's islands, portals and grandmother's room; in the
  // light also spots in the air for lace and cranes. Pure function of the
  // chunk, the visit's seed and the stage.
  _buildProps(group, cx, cz, reserved) {
    const st = this.stage.stage, low = this.quality.tier === 0;
    const rp = mulberry32(hash2i(SEED_PROPS ^ (st * 7919), cx, cz));
    const ward = this._wardCells.get(cx + ':' + cz);
    const avoid = [];
    for (const target of [1, 2]) {
      const p = this.summonedPortals[target];
      if (p && p.cx === cx && p.cz === cz) avoid.push([cellOf(p.x), cellOf(p.z), 3]);
    }
    if (this.stairwellPlan?.cx === cx && this.stairwellPlan?.cz === cz) avoid.push([cellOf(this.stairwellPlan.x), cellOf(this.stairwellPlan.z), 3]);
    if (st === 1) { const k = kitchenPlan(cx, cz); if (k) avoid.push([cellOf(k.x), cellOf(k.z), 5]); }
    const free = (gi, gj) => !solidAtGlobal(gi, gj) && !reserved.has(cellKey(gi, gj)) && !ward?.has(cellKey(gi, gj))
      && cornerDist(centreOf(gi), centreOf(gj)) >= CORNER_FREE
      && avoid.every(([ai, aj, r]) => Math.max(Math.abs(gi - ai), Math.abs(gj - aj)) > r);
    const wallSpots = [], airSpots = [];
    for (let j = 1; j < CHUNK - 1; j++) for (let i = 1; i < CHUNK - 1; i++) {
      if (!EGG_BAND.has(i) && !EGG_BAND.has(j)) continue;              // corridor lattice only
      const gi = cx * CHUNK + i, gj = cz * CHUNK + j;
      if (!free(gi, gj)) continue;
      airSpots.push({ gi, gj });
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (solidAtGlobal(gi + di, gj + dj)) {
          // the wall a window would sit in: open on both sides along the
          // face too, and the wall itself keeps going past them, so a
          // 0.95 m frame and its 1.55 m curtain rod never hang past a
          // corner or a doorway into empty air
          const tx = di !== 0 ? 0 : 1, tz = di !== 0 ? 1 : 0;
          const run3 = !solidAtGlobal(gi + tx, gj + tz) && !solidAtGlobal(gi - tx, gj - tz)
            && solidAtGlobal(gi + tx + di, gj + tz + dj) && solidAtGlobal(gi - tx + di, gj - tz + dj);
          wallSpots.push({ gi, gj, di, dj, run3 });
        }
    }
    const choose = (list, n, gap) => {
      const out = [];
      for (let tries = 0; tries < 60 && out.length < n && list.length; tries++) {
        const s = list[Math.floor(rp() * list.length)];
        if (out.every(o => Math.max(Math.abs(o.gi - s.gi), Math.abs(o.gj - s.gj)) >= gap)) out.push(s);
      }
      return out;
    };
    const nWall = st === 2 ? (low ? 3 : 5) : (low ? 4 : 7);
    const walls = choose(wallSpots, nWall, 3).map(s => ({
      x: centreOf(s.gi) + s.di * CELL / 2, z: centreOf(s.gj) + s.dj * CELL / 2, nx: -s.di, nz: -s.dj, r: rp(), run3: s.run3 }));
    const air = st === 2 ? choose(airSpots, low ? 2 : 4, 4).map(s => ({ x: centreOf(s.gi), z: centreOf(s.gj), r: rp() })) : [];
    const sp = this.stairwellPlan, clearOf = q => Object.values(this.summonedPortals || {}).every(p => !p || Math.hypot(p.x - q.x, p.z - q.z) > 2.6)
      && (!sp || Math.hypot(sp.x - q.x, sp.z - q.z) > 3);
    for (const list of [walls, air]) for (let i = list.length - 1; i >= 0; i--) if (!clearOf(list[i])) list.splice(i, 1);
    // everything on a wall may be a curtained window: remember it, a candle keeps off
    (this._flammable ||= new Map()).set(cx + ':' + cz, walls.map(w => ({ x: w.x, z: w.z })));
    return this.props.build(group, st, walls, air);
  }

  // Nothing is set down on top of something else: the ways through doors and
  // portals, the metal door's threshold, the hospital's beds, grandmother's
  // room and whatever props already stand nearby keep their ground. pad:
  // the item's own reach. Checks only this chunk and its neighbours.
  _keepOut(cx, cz, x, z, pad = 0.35) {
    for (const p of Object.values(this.summonedPortals || {})) if (p && Math.hypot(p.x - x, p.z - z) < 2.4 + pad) return true;
    const sp = this.stairwellPlan;
    if (sp && Math.hypot(sp.x - x, sp.z - z) < 2.8 + pad) return true;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const st = this.chunkStuff.get((cx + dx) + ':' + (cz + dz));
      if (!st) continue;
      if (this.stage.stage === 0) for (const d of st.doors || []) if (Math.hypot(d.x - x, d.z - z) < 1.8 + pad) return true;
      for (const q of (st.props?.walls || []).concat(st.props?.air || [])) if (Math.hypot(q.x - x, q.z - z) < 0.5 + pad) return true;
      for (const b of (st.ward?.plan.boxes || []).concat(st.beds?.plan.boxes || [])) if (Math.hypot(b.x - x, b.z - z) < b.r + pad) return true;
      const k = st.kitchen;
      if (k && x > k.minX - pad && x < k.maxX + pad && z > k.minZ - pad && z < k.maxZ + pad) return true;
    }
    return false;
  }

  // a candle never stands where it would set a curtain alight
  _nearFlammable(cx, cz, x, z) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
      for (const f of this._flammable?.get((cx + dx) + ':' + (cz + dz)) || [])
        if (Math.hypot(f.x - x, f.z - z) < CANDLE_CURTAIN_GAP) return true;
    return false;
  }

  // Where the view is taken to see into the door: a step and a bit in front
  // of it, a little to the free side of the leaf's swing, looking at the
  // opening. { from, spot, doorYaw, ... } — see _stairHold.
  _stairView(sw) {
    const P = this.player, r = sw.group.rotation.y;
    const nx = Math.sin(r), nz = Math.cos(r), ax = Math.cos(r), az = -Math.sin(r);   // out of the wall, and along it (the door's local +x)
    let spot = null;
    for (const dist of [1.4, 1.1, 0.8]) {
      const x = sw.group.position.x + nx * dist + ax * 0.3, z = sw.group.position.z + nz * dist + az * 0.3;
      if (this.world.isWalkable(x, z)) { spot = { x, z }; break; }
    }
    spot ??= { x: P.pos.x, z: P.pos.y };
    return {
      from: { x: P.pos.x, z: P.pos.y }, spot, yaw0: P.yaw, pitch0: P.pitch,
      doorYaw: Math.atan2(-(sw.group.position.x - 0.05 * ax - spot.x), -(sw.group.position.z - 0.05 * az - spot.z)),
      way: null, yawFrom: 0, pitchFrom: 0, turnT: 0,
    };
  }

  // One frame of the held view: it flies to the spot while the door opens,
  // stays there with only a few degrees of turn, and comes round level onto
  // the way on as the door shuts.
  _stairHold(sw, dt) {
    const P = this.player, c = sw.cam;
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    const ease = e => e * e * (3 - 2 * e);
    P.vel.set(0, 0);
    if (sw.phase === 'open') {
      const e = ease(Math.min(1, sw.t / STAIR_FLY));
      P.pos.set(c.from.x + (c.spot.x - c.from.x) * e, c.from.z + (c.spot.z - c.from.z) * e);
      P.yaw = c.doorYaw + wrap(c.yaw0 - c.doorYaw) * (1 - e);
      P.pitch = c.pitch0 * (1 - e);
    } else if (sw.phase === 'hold') {
      P.pos.set(c.spot.x, c.spot.z);
      P.yaw = c.doorYaw + Math.max(-STAIR_FREE, Math.min(STAIR_FREE, wrap(P.yaw - c.doorYaw)));
      P.pitch = Math.max(-STAIR_FREE, Math.min(STAIR_FREE, P.pitch));
    } else {                                            // slam, turn
      c.turnT += dt;
      const e = ease(Math.min(1, c.turnT / STAIR_TURN));
      P.pos.set(c.spot.x, c.spot.z);
      P.yaw = c.yawFrom + wrap(c.way - c.yawFrom) * e;
      P.pitch = c.pitchFrom * (1 - e);
    }
    P._apply(0);
  }

  // Whatever hangs on the walls within r metres of a spot (notice boards,
  // carpets, writings) is taken down: a door or a portal owns that stretch.
  _clearAround(x, z, r) {
    const near = m => Math.hypot(m.position.x - x, m.position.z - z) < r;
    for (const st of this.chunkStuff.values()) {
      st.posters = (st.posters || []).filter(p => { if (!near(p.mesh)) return true; p.mesh.parent?.remove(p.mesh); return false; });
      st.carpets = (st.carpets || []).filter(m => { if (!near(m)) return true; m.parent?.remove(m); return false; });
      st.writings = (st.writings || []).filter(w => { if (!near(w.mesh)) return true; w.mesh.parent?.remove(w.mesh); return false; });
    }
  }

  // A door or a portal has just been given a place in this chunk: what was
  // already built there is drawn again so nothing is left standing on it.
  _rebuildChunkProps(cx, cz, st) {
    st.props?.dispose();
    st.props = this._buildProps(st.group, cx, cz, st.reserved || new Set());
    st.scatter?.dispose();
    st.scatter = this._buildScatter(st.group, cx, cz);
  }

  _rebuildScatter() {
    for (const [key, st] of this.chunkStuff) {
      st.scatter?.dispose();
      const [cx, cz] = key.split(':').map(Number);
      st.scatter = this._buildScatter(st.group, cx, cz);
      st.props?.dispose();
      st.props = this._buildProps(st.group, cx, cz, st.reserved || new Set());
      st.drown?.dispose();
      st.drown = this.stage.stage === 2 ? this.drowned.build(st.group, cx, cz, this._drownSpots(cx, cz, st.reserved || new Set())) : null;
    }
  }

  // ── the television ─────────────────────────────────────────────────────
  // One screen texture for every room: the current question in bright
  // phosphor while it is being asked, otherwise snow (black and white static).
  _tvTexture() {
    if (this._tv) return this._tv;
    const c = document.createElement('canvas'); c.width = 256; c.height = 192;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this._tv = { c, g: c.getContext('2d'), tex, img: null, frame: 0 };
    return this._tv;
  }
  _drawTV() {
    const tv = this._tvTexture(), g = tv.g, W = tv.c.width, H = tv.c.height;
    const talking = this._tvText && performance.now() < this._tvUntil;
    if (talking) {
      if (!this._tvDirty) return true;
      this._tvDirty = false;
      g.fillStyle = '#050000'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffd2c4'; g.shadowColor = '#ff4a30'; g.shadowBlur = 8;
      g.font = '17px "Departure Mono", monospace';
      const words = this._tvText.split(/\s+/); let line = '', y = 44;
      for (const w of words) { const tt = line ? line + ' ' + w : w; if (g.measureText(tt).width > 224 && line) { g.fillText(line, 16, y); line = w; y += 22; } else line = tt; }
      g.fillText(line, 16, y);
      g.shadowBlur = 0;
      for (let yy = 0; yy < H; yy += 2) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, yy, W, 1); }
      tv.tex.needsUpdate = true;
      return true;
    }
    // snow: redraw every other frame, grey-white dots on black, a rolling bar
    if ((tv.frame++ & 1) === 0) {
      if (!tv.img) tv.img = g.createImageData(W, H);
      const d = tv.img.data, bar = (performance.now() / 12) % H;
      for (let i = 0; i < W * H; i++) {
        const y = (i / W) | 0;
        let v = Math.random() < 0.5 ? Math.random() * 90 : 120 + Math.random() * 135;
        if (Math.abs(y - bar) < 8) v *= 1.25;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
      }
      g.putImageData(tv.img, 0, 0);
      tv.tex.needsUpdate = true;
    }
    return false;
  }

  // ── clouds ─────────────────────────────────────────────────────────────
  // In the light the souls are gone; small clouds drift through the fog
  // instead, above the head, each carrying a question about acceptance.
  // Stand still and one sinks toward you; walk into it and it asks, then
  // thins away and gathers again somewhere else.
  _hideRoamers() {
    if (this._roamersHidden || !this.roamers) return;
    this._roamersHidden = true;
    for (const r of this.roamers) { r.sprite.visible = false; r.tail.forEach(t => { t.visible = false; }); }
  }
  _askAccept(time) {
    if (this.finale) return;
    this._soulAt = time; this._walked = 0;
    const qs = t('acceptQuestions');
    const order = this._soulOrder(3, qs.length);
    this._soulIdx[3] = this._soulIdx[3] || 0;
    const text = qs[order[this._soulIdx[3]++ % qs.length]];
    if (!this.asked.includes(text)) this.asked.push(text);
    this.audio?.whisper?.();
    this._say(t('cloudLabel'), text, SKY);
  }
  // open floor a metre round (x, z): clouds and balloons keep clear of walls
  _airClear(x, z, r = 1.0) {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]])
      if (solidAtGlobal(cellOf(x + dx), cellOf(z + dz))) return false;
    return true;
  }
  _updateClouds(dt, time, speed) {
    const P = this.player;
    this._updateBalloons(dt, time, speed);
    this._updateSurfaceBalloon(time);
    if (!this.clouds) {
      const tex = cloudTexture();
      this.clouds = Array.from({ length: 4 }, (_, i) => {
        const puffs = [1, 0.7, 0.62, 0.5].map((k, j) => {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xf4f6f1, transparent: true, depthWrite: false, fog: true, opacity: 0 }));
          sp.userData.k = k; sp.userData.off = new THREE.Vector3(j ? (Math.random() - 0.5) * 0.5 : 0, j ? (Math.random() - 0.4) * 0.18 : 0, j ? (Math.random() - 0.5) * 0.5 : 0);
          this.scene.add(sp);
          return sp;
        });
        const c = { puffs, pos: new THREE.Vector3(), aim: new THREE.Vector3(), home: new THREE.Vector3(), gone: false, back: 0, seed: Math.random() * 10, a: 0 };
        this._spawnCloud(c);
        return c;
      });
    }
    for (const c of this.clouds) {
      if (c.gone) {
        c.a = Math.max(0, c.a - dt * 0.8);
        if (time > c.back) this._spawnCloud(c);
      } else {
        const toP = new THREE.Vector3(P.pos.x - c.pos.x, 0, P.pos.y - c.pos.z), dP = toP.length();
        if (dP > 26) { this._spawnCloud(c); continue; }
        // they hang where they are and only drift a little; a still visitor
        // draws one in, slowly, through open air only
        if (c.pos.distanceTo(c.aim) < 0.2 || Math.random() < dt * 0.03) {
          const nx = c.home.x + (Math.random() - 0.5) * 2.4, nz = c.home.z + (Math.random() - 0.5) * 2.4;
          if (this._airClear(nx, nz)) c.aim.set(nx, 2.2 + Math.random() * 0.4, nz);
        }
        const drawn = speed < 0.1 && dP < 8;
        const goal = drawn ? new THREE.Vector3(P.pos.x - toP.x / dP * 0.6, 1.8, P.pos.y - toP.z / dP * 0.6) : c.aim;
        const step = goal.clone().sub(c.pos), len = step.length();
        if (len > 1e-3) {
          step.multiplyScalar(Math.min(len, dt * (drawn ? 0.35 : 0.08)) / len);
          if (this._airClear(c.pos.x + step.x, c.pos.z + step.z, 0.8)) c.pos.add(step); else c.aim.copy(c.pos);
        }
        c.a = Math.min(1, c.a + dt * 0.4);
        if (dP < 1.2 && this._soulReady(time)) { c.gone = true; c.back = time + 14; this._askAccept(time); }
      }
      for (const sp of c.puffs) {
        const k = sp.userData.k, br = 1 + 0.06 * Math.sin(time * 0.7 + c.seed + k * 3);   // breathing
        sp.position.copy(c.pos).add(sp.userData.off);
        sp.position.y += Math.sin(time * 0.5 + c.seed) * 0.08;
        sp.scale.set(0.95 * k * br, 0.6 * k * br, 1);
        sp.material.opacity = 0.85 * c.a;
        sp.visible = c.a > 0.01;
      }
    }
  }
  // Balloons: pale, almost white blue, each holding a question. They float
  // on their strings in open rooms; walk up to one and its question is
  // asked; it lets go and rises away, and another appears elsewhere.
  _updateBalloons(dt, time, speed) {
    const P = this.player;
    if (!this.balloons) {
      const qs = t('acceptQuestions'), order = this._soulOrder(4, qs.length);
      this.balloons = Array.from({ length: 2 }, (_, i) => {   // just a couple, far apart
        const text = qs[order[i % qs.length]];
        const g = new THREE.Group();
        // lit by the sky, not the lamps: a pale gradient with a sheen, so it never reads grey
        const skin = document.createElement('canvas'); skin.width = 64; skin.height = 64;
        const sg = skin.getContext('2d'), grad = sg.createLinearGradient(0, 0, 0, 64);
        grad.addColorStop(0, '#fbfdff'); grad.addColorStop(0.55, '#e3eef7'); grad.addColorStop(1, '#b8cad9');
        sg.fillStyle = grad; sg.fillRect(0, 0, 64, 64);
        const hl = sg.createRadialGradient(20, 20, 0, 20, 20, 14); hl.addColorStop(0, 'rgba(255,255,255,0.9)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
        sg.fillStyle = hl; sg.fillRect(0, 0, 64, 64);
        const skinTex = new THREE.CanvasTexture(skin); skinTex.colorSpace = THREE.SRGBColorSpace;
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 18), new THREE.MeshBasicMaterial({ map: skinTex, fog: true }));
        body.scale.set(1, 1.18, 1);
        const knot = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.04, 10), this.atmo.prop({ color: 0xdfe9f0, rust: 0 }));
        knot.position.y = -0.245; knot.rotation.x = Math.PI;
        const pts = Array.from({ length: 12 }, (_, k) => new THREE.Vector3(Math.sin(k * 0.7) * 0.02, -0.26 - k * 0.1, 0));
        const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xc9d2d6, transparent: true, opacity: 0.7, fog: true }));
        g.add(body, knot, string);
        this.scene.add(g);
        const b = { g, text, pos: new THREE.Vector3(), seed: Math.random() * 10, gone: false, back: 0, rise: 0 };
        this._spawnBalloon(b);
        return b;
      });
    }
    for (const b of this.balloons) {
      const dP = Math.hypot(P.pos.x - b.pos.x, P.pos.y - b.pos.z);
      if (b.gone) {                                          // let go: it rises into the fog
        b.rise += dt * 0.6; b.g.position.y = b.pos.y + b.rise * b.rise;
        if (time > b.back) this._spawnBalloon(b);
        continue;
      }
      if (dP > 26) { this._spawnBalloon(b); continue; }
      b.g.position.set(b.pos.x + Math.sin(time * 0.4 + b.seed) * 0.05, b.pos.y + Math.sin(time * 0.9 + b.seed) * 0.05, b.pos.z + Math.cos(time * 0.35 + b.seed) * 0.05);
      b.g.rotation.set(Math.sin(time * 0.6 + b.seed) * 0.06, time * 0.1 + b.seed, 0);   // turning slowly on its string
      if (dP < 1.1 && this._soulReady(time) && !this.finale) {
        b.gone = true; b.back = time + 16; b.rise = 0;
        this._soulAt = time; this._walked = 0;
        if (!this.asked.includes(b.text)) this.asked.push(b.text);
        this.audio?.whisper?.();
        this._say(t('balloonLabel'), b.text, SKY);
      }
    }
  }
  _spawnBalloon(b) {
    const P = this.player;
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * 6.28, d = 8 + Math.random() * 12;
      const x = P.pos.x + Math.cos(a) * d, z = P.pos.y + Math.sin(a) * d;
      if (!this._airClear(x, z, 0.9)) continue;
      if ((this.balloons || []).some(o => o !== b && !o.gone && Math.hypot(o.pos.x - x, o.pos.z - z) < 8)) continue;   // never two together
      b.pos.set(x, 1.7 + Math.random() * 0.5, z);
      b.gone = false; b.rise = 0; b.g.position.copy(b.pos);
      return;
    }
  }
  // A third balloon, on the water itself: no string, no question, no let
  // go. It just turns and rides the tide a few centimetres, one more small
  // thing the flood carried in.
  _updateSurfaceBalloon(time) {
    if (this.stage.stage !== 2) return;
    if (!this.surfaceBalloon) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), this.atmo.prop({ color: 0xe8f1f8, rust: 0 }));
      body.scale.set(1, 1.18, 1);
      g.add(body);
      this.scene.add(g);
      this.surfaceBalloon = { g, pos: new THREE.Vector3(), seed: Math.random() * 10 };
      this._spawnSurfaceBalloon();
    }
    const b = this.surfaceBalloon, P = this.player;
    if (Math.hypot(P.pos.x - b.pos.x, P.pos.y - b.pos.z) > 26) this._spawnSurfaceBalloon();
    const water = this._water();
    const wy = water.heightAt(b.pos.x, b.pos.z);
    const y = (wy ?? 0.1) + 0.2;
    b.g.position.set(b.pos.x + Math.sin(time * 0.15 + b.seed) * 0.04, y, b.pos.z + Math.cos(time * 0.13 + b.seed) * 0.04);
    b.g.rotation.set(Math.sin(time * 0.3 + b.seed) * 0.04, time * 0.09 + b.seed, 0);
  }
  _spawnSurfaceBalloon() {
    const P = this.player;
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * 6.28, d = 6 + Math.random() * 14;
      const x = P.pos.x + Math.cos(a) * d, z = P.pos.y + Math.sin(a) * d;
      if (!this._airClear(x, z, 0.9)) continue;
      this.surfaceBalloon.pos.set(x, 0, z);
      return;
    }
  }
  _spawnCloud(c) {
    const P = this.player;
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * 6.28, d = 6 + Math.random() * 12;
      const x = P.pos.x + Math.cos(a) * d, z = P.pos.y + Math.sin(a) * d;
      if (!this._airClear(x, z, 1.1)) continue;          // only where a room opens up
      c.pos.set(x, 2.2 + Math.random() * 0.4, z); c.aim = c.pos.clone(); c.home = c.pos.clone();
      c.gone = false; c.a = 0;
      return;
    }
  }

  // ── roaming souls ──────────────────────────────────────────────────────
  // Five souls wander the corridors around the visitor once the room has
  // been found. They drift on their own; stand still and one comes to you;
  // walk into it and it asks. Then it scatters and returns somewhere else.
  _spawnRoamer(r) {
    const P = this.player;
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * 6.28, d = 7 + Math.random() * 12;
      const x = P.pos.x + Math.cos(a) * d, z = P.pos.y + Math.sin(a) * d;
      if (solidAtGlobal(cellOf(x), cellOf(z))) continue;
      r.pos.set(x, 1.3 + Math.random() * 0.5, z);
      r.aim = r.pos.clone();
      r.gone = false; r.sprite.material.opacity = 0;
      r.tail.forEach(t => t.position.copy(r.pos));
      return;
    }
  }
  _updateRoamers(dt, time, speed) {
    const P = this.player;
    this._roamersHidden = false;                       // hidden again whenever the walk leaves the red rooms
    if (!this.roamers) {
      this.roamers = [0, 1, 2, 0, 1].map(cat => {
        const mk = (k) => new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: SOUL_COLORS[cat], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: k }));
        const sprite = mk(1); sprite.scale.set(0.35, 0.35, 1); this.scene.add(sprite);
        const tail = [0.6, 0.42, 0.28].map(k => { const t2 = mk(k); t2.scale.set(0.35 * k, 0.35 * k, 1); this.scene.add(t2); return t2; });
        const r = { cat, sprite, tail, pos: new THREE.Vector3(), aim: new THREE.Vector3(), gone: false, back: 0, seed: Math.random() * 10 };
        this._spawnRoamer(r);
        return r;
      });
    }
    for (const r of this.roamers) {
      r.sprite.visible = true;
      if (r.gone) {
        r.sprite.material.opacity = Math.max(0, r.sprite.material.opacity - dt);
        r.tail.forEach(t => { t.visible = false; });
        if (time > r.back) this._spawnRoamer(r);
        continue;
      }
      const toP = new THREE.Vector3(P.pos.x - r.pos.x, 0, P.pos.y - r.pos.z), dP = toP.length();
      if (dP > 26) { this._spawnRoamer(r); continue; }   // left behind: come back nearer
      // wander toward a new aim now and then; a still visitor draws it in
      if (r.pos.distanceTo(r.aim) < 0.3 || Math.random() < dt * 0.1) {
        const nx = r.pos.x + (Math.random() - 0.5) * 6, nz = r.pos.z + (Math.random() - 0.5) * 6;
        if (!solidAtGlobal(cellOf(nx), cellOf(nz))) r.aim.set(nx, 1.3 + Math.random() * 0.5, nz);
      }
      const drawn = speed < 0.1 && dP < 7;
      const goal = drawn ? new THREE.Vector3(P.pos.x - toP.x / dP * SOUL_STOP, 1.5, P.pos.y - toP.z / dP * SOUL_STOP) : r.aim;
      const step = goal.clone().sub(r.pos);
      const len = step.length();
      if (len > 1e-3) {
        step.multiplyScalar(Math.min(len, dt * (drawn ? 0.9 : 0.35)) / len);
        const nx = r.pos.x + step.x, nz = r.pos.z + step.z;
        if (!solidAtGlobal(cellOf(nx), cellOf(nz))) r.pos.add(step); else r.aim.copy(r.pos); // never through walls
      }
      r.sprite.material.opacity = Math.min(1, r.sprite.material.opacity + dt * 0.5);
      r.sprite.position.set(r.pos.x, r.pos.y + Math.sin(time * 0.9 + r.seed) * 0.1, r.pos.z);
      const s2 = 0.32 + 0.05 * Math.sin(time * 3 + r.seed); r.sprite.scale.set(s2, s2, 1);
      let lead = r.sprite.position;
      for (const t of r.tail) { t.visible = true; t.position.lerp(lead, Math.min(1, dt * 4)); lead = t.position; }
      if (dP < 1.1 && this._soulReady(time)) {
        r.gone = true; r.back = time + 12;
        this._askSoul(r.cat, null, time);
      }
    }
  }

  // Straight into the nearest grandmother's room, the world switched to the
  // red rooms on the way.
  _jumpToRoom() {
    const P = this.player;
    const cx = Math.floor(P.pos.x / (CHUNK * CELL)), cz = Math.floor(P.pos.y / (CHUNK * CELL));
    let best = null, bd = Infinity;
    for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) {
      const k = kitchenPlan(cx + dx, cz + dz);
      if (!k) continue;
      const d = Math.hypot(k.x - P.pos.x, k.z - P.pos.y);
      if (d < bd) { bd = d; best = k; }
    }
    if (!best) return;
    if (this.artworks.inspecting) this.artworks._closeInspect();
    this.player.auto = null;
    this.stage.set(1);
    // stand a step from the table, looking at it
    const sx = best.x - 1.4, sz = best.z - 1.4;
    const ok = !solidAtGlobal(cellOf(sx), cellOf(sz));
    P.pos.set(ok ? sx : best.x, ok ? sz : best.z - 1.2);
    P.vel.set(0, 0);
    P.yaw = Math.atan2(-(best.x - P.pos.x), -(best.z - P.pos.y));
    P.pitch = -0.25;
    this._prevPos = { x: P.pos.x, z: P.pos.y };      // not a walk through anything
    this.world.update(P.pos.x, P.pos.y);
    this.post?.burst(1.4);
  }

  // Cheat 77777: the nearest hanging work becomes the last one. Every other
  // work counts as seen (the rose shows 17), and the visitor stands before it.
  _jumpToLastWork() {
    const P = this.player;
    if (this.finale) return;
    if (this.artworks.inspecting) this.artworks._closeInspect();
    P.auto = null;
    let best = null, bd = Infinity;
    for (const a of this.artworks.active) {
      const d = Math.hypot(a.centerWorld.x - P.pos.x, a.centerWorld.z - P.pos.y);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best) return;
    this.seen.clear();
    for (const a of this.artworks.list) if (a.id !== best.art.id) this.seen.add(a.id);
    const n = best.normal;
    P.pos.set(best.centerWorld.x + n.x * 1.7, best.centerWorld.z + n.z * 1.7);   // across the corridor
    P.vel.set(0, 0);
    P.yaw = Math.atan2(n.x, n.z);                      // facing the work
    P.pitch = 0;
    this._prevPos = { x: P.pos.x, z: P.pos.y };
    this.world.update(P.pos.x, P.pos.y);
    this.post?.burst(1.4);
  }

  // ── guide ──────────────────────────────────────────────────────────────
  _toggleGuide() {
    if (this.guide) {
      this.scene.remove(this.guide.mesh); this.guide.mesh.geometry.dispose(); this.guide.mesh.material.dispose();
      this.guide = null; return;
    }
    const shape = new THREE.Shape();                    // a broad chevron lying on the floor
    shape.moveTo(0, 0.45); shape.lineTo(0.42, -0.05); shape.lineTo(0.24, -0.05); shape.lineTo(0, 0.2);
    shape.lineTo(-0.24, -0.05); shape.lineTo(-0.42, -0.05); shape.closePath();
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).scale(1.4, 1, 1.4);
    const mat = new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.9, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.InstancedMesh(geo, mat, 80);
    mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.guide = { mesh, t: 0 };
  }

  // Where the guide leads: in fear to the nearest portal into the red rooms,
  // in the red rooms to the nearest grandmother's room, then to the way on.
  _guideTarget() {
    const P = this.player, cx = Math.floor(P.pos.x / (CHUNK * CELL)), cz = Math.floor(P.pos.y / (CHUNK * CELL));
    let best = null, bd = Infinity;
    const consider = (x, z) => { const d = Math.hypot(x - P.pos.x, z - P.pos.y); if (d < bd) { bd = d; best = { x, z }; } };
    if (this.stage.stage === 1 && !this.visitedRoom) {
      for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) { const k = kitchenPlan(cx + dx, cz + dz); if (k) consider(k.x, k.z); }
    } else {
      const p = this.summonedPortals[this.stage.stage + 1];
      if (p) consider(p.x, p.z);
    }
    return best;
  }

  _updateGuide(dt, time) {
    const g = this.guide;
    if (this._guideRoom && this.visitedRoom) { this._guideRoom = false; this._toggleGuide(); return; }   // B×5 led here: its work is done
    g.t -= dt;
    g.mesh.material.opacity = 0.6 + 0.35 * Math.sin(time * 4);
    if (g.t > 0) return;
    g.t = 1;
    const target = this._guideTarget();
    if (!target) { g.mesh.count = 0; return; }
    const tx = cellOf(target.x - 0.01), tz = cellOf(target.z - 0.01);
    const path = this._route((i, j) => (Math.abs(i - tx) <= 1 && Math.abs(j - tz) <= 1 ? Infinity : -Math.hypot(i - tx, j - tz)),
      cellOf(this.player.pos.x), cellOf(this.player.pos.y), 40000);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    let n = 0;
    for (let k = 1; k < path.length - 1 && n < 80; k += 2) {
      const [i, j] = path[k], [ni, nj] = path[k + 1];
      q.setFromAxisAngle(up, Math.atan2(-(ni - i), -(nj - j)));  // point along the route
      m.compose(new THREE.Vector3(centreOf(i), 0.04, centreOf(j)), q, one);
      g.mesh.setMatrixAt(n++, m);
    }
    g.mesh.count = n;
    g.mesh.instanceMatrix.needsUpdate = true;
  }

  _doorsNear(x, z) {
    const out = [];
    for (const stuff of this.chunkStuff.values()) {
      if (this.stage.stage !== 0) break;                 // no doors outside fear: nothing to bump into
      for (const d of stuff.doors) if (Math.abs(d.x - x) < 4 && Math.abs(d.z - z) < 4) out.push(d);
    }
    return out;
  }


  // ── route for the red scratches: breadth-first over open cells ─────────
  _route(goalFn, fromGi, fromGj, maxNodes = 7000) {
    const key = (i, j) => i + ',' + j;
    const prev = new Map([[key(fromGi, fromGj), null]]);
    const q = [[fromGi, fromGj]];
    let best = null, bestScore = -Infinity;
    for (let head = 0; head < q.length && head < maxNodes; head++) {
      const [i, j] = q[head];
      const s = goalFn(i, j);
      if (s === Infinity) { best = [i, j]; break; }
      if (s > bestScore) { bestScore = s; best = [i, j]; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, k = key(ni, nj);
        if (prev.has(k) || solidAtGlobal(ni, nj)) continue;
        if (this._doorBlocks(i, j, ni, nj)) continue;
        prev.set(k, [i, j]);
        q.push([ni, nj]);
      }
    }
    if (!best) return [];
    const path = [];
    for (let c = best; c; c = prev.get(key(c[0], c[1]))) path.push(c);
    return path.reverse();
  }

  // a closed door sits on a chunk edge between two cells
  _doorBlocks(i, j, ni, nj) {
    if (this.stage.stage !== 0) return false;           // no doors outside fear
    for (const stuff of this.chunkStuff.values()) for (const d of stuff.doors) {
      if (d.open) continue;
      const mx = (Math.max(i, ni)) * CELL, mz = (Math.max(j, nj)) * CELL;
      if (i !== ni && Math.abs(mx - d.routeSeg.a.x) < 1e-3 && d.routeSeg.a.x === d.routeSeg.b.x
        && centreOf(j) > d.routeSeg.a.z && centreOf(j) < d.routeSeg.b.z) return true;
      if (j !== nj && Math.abs(mz - d.routeSeg.a.z) < 1e-3 && d.routeSeg.a.z === d.routeSeg.b.z
        && centreOf(i) > d.routeSeg.a.x && centreOf(i) < d.routeSeg.b.x) return true;
    }
    return false;
  }

  _updateMarks() {
    const p = this.player.pos;
    const gi = cellOf(p.x), gj = cellOf(p.y);
    // target: the work the marks already lead to, until it is seen; then the
    // nearest one not yet seen; else onward, away from spawn. Holding the
    // target keeps the arrows from swinging between two works.
    let target = this._markTarget;
    if (!target || this.seen.has(target.art.id) || !this.artworks.active.includes(target)) {
      target = null; let td = Infinity;
      for (const a of this.artworks.active) {
        if (a.hidden || this.seen.has(a.art.id)) continue;
        const d = Math.hypot(a.centerWorld.x - p.x, a.centerWorld.z - p.y);
        if (d < td) { td = d; target = a; }
      }
      this._markTarget = target;
    }
    let goalFn, goalKey;
    const portal = this.summonedPortals?.[this.stage.stage + 1];
    let find = null;
    if (!portal && !target && this.stage.stage === 0 && this._fear) {   // fear, waiting: lead to what is still to be found
      let fd = 30;
      for (const t of this._fearFinds()) {
        if (this._fear.found.has(t.key)) continue;
        const d = Math.hypot(t.x - p.x, t.z - p.y);
        if (d > 2 && d < fd) { fd = d; find = t; }
      }
    }
    if (portal) {                                        // the way on is open: every mark points to it
      const tx = cellOf(portal.x - 0.01), tz = cellOf(portal.z - 0.01);
      goalFn = (i, j) => (Math.abs(i - tx) <= 1 && Math.abs(j - tz) <= 1 ? Infinity : -Math.hypot(i - tx, j - tz));
      goalKey = `p${tx},${tz}`;
    } else if (find && !target) {
      const tx = cellOf(find.x), tz = cellOf(find.z);
      goalFn = (i, j) => (Math.abs(i - tx) <= 1 && Math.abs(j - tz) <= 1 ? Infinity : -Math.hypot(i - tx, j - tz));
      goalKey = `f${find.key}`;
    } else if (target) {
      const tx = cellOf(target.centerWorld.x + target.normal.x * 0.9);
      const tz = cellOf(target.centerWorld.z + target.normal.z * 0.9);
      goalFn = (i, j) => (i === tx && j === tz ? Infinity : -Math.hypot(i - tx, j - tz));
      goalKey = `a${tx},${tz}`;
    } else {
      // no unseen work in reach: lead outward, toward acceptance
      const lim = 40;
      goalFn = (i, j) => (Math.abs(i - gi) > lim || Math.abs(j - gj) > lim ? -Infinity
        : Math.hypot(centreOf(i) - ORIGIN.x, centreOf(j) - ORIGIN.z));
      goalKey = 'out';
    }
    const pathKey = `${gi},${gj}:${goalKey}:${this.doorsOpen.size}`;
    if (pathKey === this._pathKey) return;
    this._pathKey = pathKey;

    // marks toward another goal fade out where they are; nothing jumps
    for (const m of this.marks) if (m.visible && m.userData.goal !== goalKey && !m.userData.fadeAt) m.userData.fadeAt = this._time || 0.001;

    const byKey = new Map();
    for (const m of this.marks) if (m.visible && m.userData.key) byKey.set(m.userData.key, m);
    const spare = () => {
      let best = this.marks.find(m => !m.visible), far = -1;
      if (best) return best;
      for (const m of this.marks) {                    // else the mark furthest behind
        const d = Math.hypot(m.position.x - p.x, m.position.z - p.y);
        if (d > far && d > 8) { far = d; best = m; }
      }
      return best;
    };
    const cells = this._route(goalFn, gi, gj).slice(0, ROUTE_CELLS);
    for (let k = 2; k < cells.length - 1; k += MARK_EVERY) {
      const [i, j] = cells[k], [ni, nj] = cells[k + 1];
      const di = ni - i, dj = nj - j;
      // a wall beside this step: left or right of the direction of travel
      const sides = di !== 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      const side = sides.find(([si, sj]) => solidAtGlobal(i + si, j + sj));
      if (!side) continue;
      const [si, sj] = side;
      const key = `${i},${j},${si},${sj},${di},${dj}`;
      const had = byKey.get(key);
      if (had) { had.userData.goal = goalKey; had.userData.fadeAt = 0; had.material.opacity = 1; continue; }   // already scratched here
      const m = spare();
      if (!m) break;
      const nx = -si, nz = -sj;                         // wall normal, into the corridor
      m.position.set(
        si ? (si > 0 ? (i + 1) * CELL : i * CELL) + nx * 0.013 : centreOf(i),
        MARK_Y + (k % 2) * 0.12,
        sj ? (sj > 0 ? (j + 1) * CELL : j * CELL) + nz * 0.013 : centreOf(j));
      m.rotation.set(0, Math.atan2(nx, nz), 0);
      // plane's local +x in world is (nz, -nx); mirror so the arrow points onward
      m.scale.x = di * nz - dj * nx >= 0 ? 1 : -1;
      Object.assign(m.userData, { key, goal: goalKey, fadeAt: 0 });
      m.material.opacity = 1;
      m.visible = true;
    }
  }

  // A work just seen: the candles around it, with nothing unseen left near,
  // flicker and die down to embers (_tickCandles). Lights share the colour.
  _gutterCandles(time) {
    const arts = this.artworks.active.filter(a => !a.hidden).map(a => ({ x: a.centerWorld.x, z: a.centerWorld.z, seen: this.seen.has(a.art.id) }));
    this._dying ??= [];
    for (const st of this.chunkStuff.values()) {
      const sc = st.scatter;
      if (!sc?.items) continue;
      sc.items.forEach((it, i) => {
        if (it.spent) return;
        let dA = Infinity, dU = Infinity;
        for (const a of arts) { const d = Math.hypot(a.x - it.x, a.z - it.z); dA = Math.min(dA, d); if (!a.seen) dU = Math.min(dU, d); }
        if (dA < CANDLE_NEAR && dU > CANDLE_NEAR) {
          it.spent = true;
          this._dying.push({ sc, i, it, base: it.flame.clone(), t0: time + Math.random() * 0.8 });
        }
      });
    }
  }

  _tickCandles(time) {
    if (!this._dying?.length) return;
    this._dying = this._dying.filter(d => {
      if (d.sc.disposed) return false;
      const k = Math.max(0, (time - d.t0) / CANDLE_DIE);
      const flick = 0.55 + 0.45 * Math.sin(time * 23 + d.i * 1.7) * Math.sin(time * 7.3 + d.i);
      d.it.flame.copy(d.base).multiplyScalar(Math.max(0, 1 - k) * flick).lerp(EMBER, Math.min(1, k));
      for (const name of ['flame', 'pool']) {
        const m = d.sc.meshes[name];
        if (!m) continue;
        m.setColorAt(d.i, d.it.flame);
        m.instanceColor.needsUpdate = true;
      }
      return k < 1;
    });
  }

  // Acceptance stage only: every live candle rides the water where it has
  // risen, bobs, tilts a little and drifts along its wall toward the
  // direction _buildScatter worked out for it (tgx, tgz), never more than
  // CANDLE_DRIFT off where it was set down. The candle lights the walls
  // catch (scatter.lights) follow it, so the map still reads.
  _floatCandles(time, water) {
    if (this.stage.stage !== 2) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qt = new THREE.Quaternion(),
      up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(1, 0, 0), one = new THREE.Vector3(1, 1, 1);
    const CANDLE_DRIFT = 0.25;
    for (const st of this.chunkStuff.values()) {
      const sc = st.scatter;
      if (!sc?.items?.length) continue;
      for (let i = 0; i < sc.items.length; i++) {
        const it = sc.items[i];
        if (it.spent) continue;
        const sway = 0.5 + 0.5 * Math.sin(time * 0.17 + i * 0.63);      // 0..1, biased on toward the target
        const drift = (sway * 0.7 + 0.3) * CANDLE_DRIFT;
        const x = it.x + it.tgx * drift, z = it.z + it.tgz * drift;
        const wy = water.heightAt(x, z);
        const floaty = wy != null;
        const base = floaty ? wy : 0;
        const bob = floaty ? Math.sin(time * 1.7 + i * 1.3) * 0.005 : 0;
        q.setFromAxisAngle(up, it.rot);
        if (floaty) { qt.setFromAxisAngle(ax, Math.sin(time * 0.6 + i * 2.1) * 0.09); q.multiply(qt); }
        for (const [name, off] of [['saucer', 0.01], ['wax', 0.09], ['flame', 0.18], ['pool', 0.016]]) {
          const mesh = sc.meshes[name];
          if (!mesh) continue;
          m.compose(new THREE.Vector3(x, base + off + bob, z), q, one);
          mesh.setMatrixAt(i, m);
        }
        const L = sc.lights[i];
        if (L) { L.x = x; L.y = base + 0.28 + bob; L.z = z; }
      }
      for (const name in sc.meshes) sc.meshes[name].instanceMatrix.needsUpdate = true;
    }
  }

  // marks of a finished goal fade slowly; marks far behind return to the pool
  _tickMarks(time) {
    const p = this.player.pos, light = this.stage.stage === 2;
    for (const m of this.marks) {
      const fly = m.userData.fly;
      m.material.visible = !light;                       // no red in the light: fireflies lead there
      fly.visible = light && m.visible;
      if (fly.visible) {
        const nx = Math.sin(m.rotation.y), nz = Math.cos(m.rotation.y);   // off the wall, into the corridor
        const ax = nz * m.scale.x, az = -nx * m.scale.x;                    // the way the scratch points
        const seed = (m.position.x * 7.1 + m.position.z * 3.7) % 1;
        const u = (time * 0.35 + seed) % 1;                                  // drifting on, then again
        fly.position.set(m.position.x + nx * 0.4 + ax * (u - 0.5) * 1.2,
          1.05 + Math.sin(time * 1.3 + seed * 6.28) * 0.12,
          m.position.z + nz * 0.4 + az * (u - 0.5) * 1.2);
        fly.material.opacity = m.material.opacity * Math.sin(u * Math.PI) * (0.75 + 0.25 * Math.sin(time * 9 + seed * 40));
      }
      if (!m.visible) continue;
      if (m.userData.fadeAt) {
        const k = (time - m.userData.fadeAt) / MARK_FADE;
        m.material.opacity = Math.max(0, 1 - k);
        if (k >= 1) { m.visible = false; m.userData.key = null; m.userData.fadeAt = 0; }
      } else if (Math.hypot(m.position.x - p.x, m.position.z - p.y) > MARK_KEEP) {
        m.visible = false; m.userData.key = null;
      }
    }
  }

  // ── per-frame ───────────────────────────────────────────────────────────
  // The name of the stage, shown once as the visitor enters it: rises out of
  // the dark in the middle of the screen, holds, and sinks back.
  _zoneTitle(n) {
    let el = document.getElementById('zone-title');
    if (!el) { el = document.createElement('div'); el.id = 'zone-title'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.textContent = t('zoneNames')[n];
    el.classList.remove('show'); void el.offsetWidth;   // restart the animation
    el.classList.add('show');
  }

  update(dt, time, zone) {
    if (this._titleFor !== this.stage.stage) { this._titleFor = this.stage.stage; this._zoneTitle(this.stage.stage); }
    this._sync();
    this.petals.update(dt, time);
    this._time = time;
    this._tickMarks(time);
    this._tickCandles(time);
    const water = this._water();
    this._floatCandles(time, water);
    this.props.update(time, this.player.pos.x, this.player.pos.y, water.level);
    this.drowned.update(time, water);
    this.chandeliers.update(time, this.camera.position, this.stage.stage === 1);
    const P = this.player, cam = this.camera;
    const memoryStage = this.stage.stage === 1;   // grandmother's room only exists here
    const speed = P.vel.length();
    if (this._lastPos) this._walked += Math.min(1, Math.hypot(P.pos.x - this._lastPos.x, P.pos.y - this._lastPos.y));
    this._lastPos = { x: P.pos.x, y: P.pos.y };
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);

    this._fearPacing(speed);

    // seen: close enough and roughly in front
    for (const a of this.artworks.active) {
      if (a.hidden) continue;
      const dx = a.centerWorld.x - P.pos.x, dz = a.centerWorld.z - P.pos.y;
      const d = Math.hypot(dx, dz);
      if (d < SEEN_DIST && (fx * dx + fz * dz) / (d || 1) > 0.5) this.seen.add(a.art.id);
    }
    if (this.artworks.inspecting) this.seen.add(this.artworks.inspecting.art.id);
    if (this.seen.size !== this._seenShown) {
      if (this._seenShown === 0 && this.seen.size > 0) setTimeout(() => this.petals.sparkle(), GRAIN_OPEN_MS); // the grain opens: sparkles spill from the corner
      this._seenShown = this.seen.size;
      // count each newly-seen work into the stage it was seen in, however it
      // got into `seen` — normal viewing, a console poke while testing, or
      // a cheat like 77777 that adds several at once
      for (const id of this.seen) if (!this._stageSeenIds.has(id)) { this._stageSeenIds.add(id); this.stageSeen[this.stage.stage]++; }
      this._gutterCandles(time);
      this.roses.set(this.seen.size, t('rosesLabel', { n: this.seen.size, total: this.total }));
    }
    this._maybeSummonPortal(time);

    this._updateBoards(dt);

    this._repathT -= dt;
    if (this._repathT <= 0) { this._repathT = REPATH_EVERY; this._updateMarks(); }

    // turn-around: more than ~145° of turning inside 1.5 s
    this._yawHist.push([time, P.yaw]);
    while (this._yawHist.length && time - this._yawHist[0][0] > 1.5) this._yawHist.shift();
    const turned = Math.abs(P.yaw - this._yawHist[0][1]);
    if (turned > 2.5 && !this._turning) {
      this._turning = true;
      this.post?.burst(0.9);
      // whatever was behind you may not be what it was
      for (const s of this.chunkStuff.values()) for (const w of s.writings) {
        if (w.behindT > 0.8 && Math.random() < 0.6) { w.seed = Math.random(); this._writeOn(w); }
      }
    } else if (turned < 1.0) this._turning = false;
    // track how long each writing has been out of sight behind you
    for (const s of this.chunkStuff.values()) for (const w of s.writings) {
      const dx = w.mesh.position.x - cam.position.x, dz = w.mesh.position.z - cam.position.z;
      const d = Math.hypot(dx, dz);
      w.behindT = d < 14 && (fx * dx + fz * dz) / (d || 1) < -0.2 ? w.behindT + dt : 0;
    }

    // presence doors: stand still close to one and it gives way. Light pours
    // out through the gap, the music clears, "not yet", and it slams shut.
    this._doorLights.length = 0;
    for (const s of this.chunkStuff.values()) for (const d of s.doors) {
      if (d.phase === 'done' || this.stage.stage !== 0) continue;   // doors live in fear only
      if (d.phase === 'wait') {
        if (this.finale) continue;                     // the way on is open now: doors keep still
        const near = Math.hypot(d.x - P.pos.x, d.z - P.pos.y) < DOOR_REACH;
        d.waitT = near && speed < 0.08 && !P.locked ? d.waitT + dt : Math.max(0, d.waitT - dt * 2);
        d.leaf.material.color.setScalar(0.8 + 0.2 * Math.min(1, d.waitT / DOOR_WAIT));
        if (d.waitT < DOOR_WAIT) continue;
        d.phase = 'open'; d.t = 0; d.said = false;
        const local = d.group.worldToLocal(new THREE.Vector3(P.pos.x, 1, P.pos.y));
        d.dir = local.z >= 0 ? 1 : -1;                 // the side the visitor stands on
        d.rays ??= buildLightRays();
        d.rays.group.rotation.y = d.dir > 0 ? 0 : Math.PI;
        d.group.add(d.rays.group);
        this.audio?.doorLight?.(DOOR_HOLD + 1.5);
        this.audio?.doorCreak?.(1.3);                  // the hinges, as it gives way
      }
      d.t += dt;
      let swing = 0, k = 0;
      if (d.phase === 'open') {
        const e = Math.min(1, d.t / 1.3);
        swing = DOOR_SWING * (1 - (1 - e) ** 3);        // gives way, slowing at the end
        k = Math.min(1, Math.max(0, (d.t - 0.15) / 0.9));
        if (!d.said && d.t > 0.8) { d.said = true; this._say(null, t('doorNotYet')); }
        if (d.t >= DOOR_HOLD) { d.phase = 'slam'; d.t = 0; }
      } else if (d.phase === 'slam') {
        const e = Math.min(1, d.t / DOOR_SLAM);
        swing = DOOR_SWING * (1 - e * e);               // accelerating shut
        k = Math.max(0, 1 - d.t / 0.12);
        if (e >= 1) {
          d.phase = 'done'; this.doorsDone.add(d.key);
          d.leaf.material.color.setScalar(0.8);
          this.audio?.doorSlam?.();
          this.post?.burst?.(0.7);
        }
      }
      d.pivot.rotation.y = -d.dir * swing;               // away from the visitor
      d.rays?.set(k, time);
      if (k > 0.01) {                                    // the walls and floor catch it
        d.lights ??= [[0.6, 1.3], [2.0, 1.0]].map(([z, y]) => ({ at: new THREE.Vector3(0, y, z), p: new THREE.Vector3(), x: 0, y: 0, z: 0, col: new THREE.Color() }));
        for (const l of d.lights) {                      // reused every frame: nothing allocated while it shines
          d.rays.group.localToWorld(l.p.copy(l.at));
          l.x = l.p.x; l.y = l.p.y; l.z = l.p.z;
          l.col.setRGB(1, 0.97, 0.9).multiplyScalar(0.55 * k);
          this._doorLights.push(l);
        }
      }
    }

    // the metal door onto the stairwell (fear only): every time the visitor
    // comes close, the view is taken — flown from wherever they stand to a spot
    // in front of the doorway, looking in — while the door gives way and shows
    // the stairwell with light in the tone of its photograph pouring out. The
    // view can be turned only a few degrees while it is held. As the door
    // shuts the view comes round, level, onto the way on, and the walk is the
    // visitor's again. It re-arms once they have walked away.
    const eye = new THREE.Vector3();
    for (const s of this.chunkStuff.values()) {
      const sw = s.stairwell;
      if (!sw) continue;
      const d = Math.hypot(sw.group.position.x - P.pos.x, sw.group.position.z - P.pos.y);
      let k = 0;
      if (sw.phase === 'wait') {
        if (this.finale || d >= STAIR_NEAR) continue;
        sw.phase = 'open'; sw.t = 0;
        if (!P.locked && !P.auto) sw.cam = this._stairView(sw);
        this.audio?.doorCreak?.(STAIR_OPEN + 0.4);
        this.audio?.doorLight?.(STAIR_HOLD + 1);
        if (STAIR_NIGHTMARE) { this.audio?.nightmare?.(STAIR_OPEN + STAIR_HOLD); sw.fov0 = P.camera.fov; }
      }
      sw.t += dt;
      if (sw.phase === 'open') {
        const e = Math.min(1, sw.t / STAIR_OPEN);
        // negative, as the presence doors: the leaf swings out toward the visitor
        sw.pivot.rotation.y = -STAIR_SWING * (1 - (1 - e) ** 3);
        k = e;
        if (sw.t >= STAIR_OPEN) { sw.phase = 'hold'; sw.t = 0; }
      } else if (sw.phase === 'hold') {
        sw.pivot.rotation.y = -STAIR_SWING;
        k = 1;
        if (STAIR_NIGHTMARE && sw.fov0) {                // the corridor seems to stretch away: a slow creeping zoom in
          const e = Math.min(1, sw.t / STAIR_HOLD);
          P.camera.fov = sw.fov0 * (1 - 0.14 * e * e * (3 - 2 * e)); P.camera.updateProjectionMatrix();
        }
        if (sw.t >= STAIR_HOLD) {
          sw.phase = 'slam'; sw.t = 0;
          if (sw.cam) {                                   // the view will come round onto the way on
            sw.cam.way = this._wayYaw(this.summonedPortals[this.stage.stage + 1]) ?? sw.cam.doorYaw;
            sw.cam.yawFrom = P.yaw; sw.cam.pitchFrom = P.pitch; sw.cam.turnT = 0;
          }
        }
      } else if (sw.phase === 'slam') {
        const e = Math.min(1, sw.t / STAIR_SLAM);
        sw.pivot.rotation.y = -STAIR_SWING * (1 - e * e);
        k = 1 - e;
        if (e >= 1) {
          sw.phase = 'turn'; sw.t = 0;
          this.audio?.doorSlam?.();
          this.post?.burst?.(0.4);
          if (STAIR_NIGHTMARE) {
            this.post?.black?.(0.3);
            if (sw.fov0) { P.camera.fov = sw.fov0; P.camera.updateProjectionMatrix(); sw.fov0 = 0; }
          }
          if (!this._stairDone) { this._stairDone = true; this._say(null, t('stairDream')); }
        }
      } else if (sw.phase === 'turn') {
        if (!sw.cam || sw.cam.turnT >= STAIR_TURN) { sw.cam = null; sw.phase = 'cool'; }
      } else if (sw.phase === 'cool') {
        if (d > STAIR_NEAR + 1.5 || (DREAM_PREVIEW && sw.t > 3)) {   // walked away (or judging a sketch: a pause): it opens for the next pass, onto another stairwell
          sw.phase = 'wait';
          sw.pic = ((sw.pic + Math.floor(Math.random() * 4)) % 5) + 1;   // any of the other four
          sw.setImage(`assets/stairs/stairs_${sw.pic}.webp`);
        }
      }
      if (sw.cam) this._stairHold(sw, dt);
      eye.set(P.pos.x, P.eyeH ?? EYE_HEIGHT, P.pos.y);
      sw.tick(dt, time, k, eye);
      if (k > 0.01) {                                  // the walls and floor catch it, in the photograph's tone
        sw.lights ??= [[0.6, 1.3], [2.0, 1.0]].map(([z, y]) => ({ at: new THREE.Vector3(0, y, z), p: new THREE.Vector3(), x: 0, y: 0, z: 0, col: new THREE.Color() }));
        for (const l of sw.lights) {
          sw.rays.group.localToWorld(l.p.copy(l.at));
          l.x = l.p.x; l.y = l.p.y; l.z = l.p.z;
          l.col.setRGB(sw.tint.x, sw.tint.y, sw.tint.z).multiplyScalar(0.45 * k);
          this._doorLights.push(l);
        }
      }
    }

    // secret: walk backwards for 30 s and you are small again
    if (P.intent < 0) { this._backT += dt; this._fwdT = 0; }
    else if (P.intent > 0) { this._fwdT += dt; this._backT = 0; }
    if (!this.child && this._backT > CHILD_AFTER) { this.child = true; P.eyeTarget = CHILD_EYE; this.audio?.chime(); }
    if (this.child && this._fwdT > 25) { this.child = false; P.eyeTarget = EYE_HEIGHT; }

    // secret: grandmother's kitchen is quiet
    let inKitchen = false;
    for (const s of this.chunkStuff.values()) {
      const k = s.kitchen;
      if (k && memoryStage && P.pos.x > k.minX && P.pos.x < k.maxX && P.pos.y > k.minZ && P.pos.y < k.maxZ) inKitchen = true;
    }
    if (inKitchen !== this._inKitchen) {
      this._inKitchen = inKitchen;
      this.audio?.hush(inKitchen);
      if (inKitchen && !this._roomHinted) {
        this._roomHinted = true; this.visitedRoom = true;
        this._say(t('roomLabel'), t('roomHint')); this._soulAt = time;
        this._rebuildScatter();                       // candles now point to the way out into the light
      }
    }

    // portals: cross-check, animate the veils, dim the ones already used
    const cur = { x: P.pos.x, z: P.pos.y };
    this._checkPortals(this._prevPos, cur);
    this._prevPos = cur;
    for (const st of this.chunkStuff.values()) for (const p of st.portals) {
      // only the portal into the very next stage exists; the way into the
      // light opens only after grandmother's room has been found
      const live = p.target === this.stage.stage + 1 && (p.target !== 2 || this.visitedRoom);
      p.group.visible = live;
      p.veil.material.uniforms.uTime.value = time;
    }
    if (this.stage.stage !== this._lastStage) { // the world changed: rewrite the walls in its hand
      this._lastStage = this.stage.stage;
      const target = { fear: +(this.stage.stage === 0), memory: +(this.stage.stage === 1), accept: +(this.stage.stage === 2) };
      for (const st of this.chunkStuff.values()) for (const w of st.writings) { w.zone = target; this._writeOn(w); }
      for (const st of this.chunkStuff.values()) for (const p of st.posters || []) this._printPoster(p);
      for (const st of this.chunkStuff.values()) for (const m of (st.carpets || []).concat(st.rugs || [], st.toys || [])) m.visible = this.stage.stage === 1;
      this._rebuildScatter();
      for (const st of this.chunkStuff.values()) if (st.ward) st.ward.group.visible = this.stage.stage === 0;
      for (const st of this.chunkStuff.values()) if (st.beds) st.beds.group.visible = this.stage.stage === 0;
      for (const st of this.chunkStuff.values()) for (const d of st.doors) d.group.visible = this.stage.stage === 0;
    }

    // grandmother's room: light the nearest one, let candles and picture breathe
    let room = null, rd = 14;
    for (const st of this.chunkStuff.values()) {
      const k = st.kitchen;
      if (!k) continue;
      k.group.visible = memoryStage;
      if (!memoryStage) continue;
      const d = Math.hypot(k.x - P.pos.x, k.z - P.pos.y);
      if (d < rd) { rd = d; room = k.room; }
    }
    this.kitchenRig.update(room, time);
    // the souls in the room drift, and scatter when walked into
    for (const st of this.chunkStuff.values()) {
      const k = st.kitchen;
      if (!k || !memoryStage || !k.wisps) continue;
      for (const w of k.wisps) {
        if (w.gone) {
          for (const tsp of w.tail) tsp.visible = false;
          w.sprite.material.opacity = Math.max(0, w.sprite.material.opacity - dt);
          w.sprite.scale.multiplyScalar(1 + dt * 1.5);
          if (time > w.back) { w.gone = false; this._placeWisp(w, k); w.sprite.scale.set(0.35, 0.35, 1); }
          continue;
        }
        w.sprite.material.opacity = Math.min(1, w.sprite.material.opacity + dt * 0.5);
        // a still visitor draws the nearest soul in, slowly; moving lets it drift home
        const dxp = P.pos.x - w.home.x, dzp = P.pos.y - w.home.z, dp = Math.hypot(dxp, dzp);
        const drawn = speed < 0.1 && dp < 5 ? Math.min(1, w.pull.x + dt * 0.12) : Math.max(0, w.pull.x - dt * 0.2);
        w.pull.x = drawn;
        const reach = dp > SOUL_STOP ? drawn * (1 - SOUL_STOP / dp) : 0;  // never drifts inside touching range
        const b = Math.sin(time * 0.9 + w.seed);
        w.sprite.position.set(
          w.home.x + dxp * reach + Math.sin(time * 0.4 + w.seed) * 0.25,
          w.home.y + b * 0.12,
          w.home.z + dzp * reach + Math.cos(time * 0.35 + w.seed) * 0.25);
        let lead = w.sprite.position;
        for (const tsp of w.tail) { tsp.position.lerp(lead, Math.min(1, dt * 4)); tsp.visible = true; lead = tsp.position; }
        const s2 = 0.32 + 0.05 * Math.sin(time * 3 + w.seed);
        w.sprite.scale.set(s2, s2, 1);
        if (Math.hypot(w.sprite.position.x - P.pos.x, w.sprite.position.z - P.pos.y) < 1.1 && this._soulReady(time)) {
          w.gone = true; w.back = time + 20;
          this._askSoul(w.cat, k.room, time);
        }
      }
    }
    // the television: attach the shared screen once, draw it, hiss when it snows
    if (room) {
      const tv = this._tvTexture();
      for (const sc of room.screens) if (sc.material.map !== tv.tex) { sc.material.map = tv.tex; sc.material.needsUpdate = true; }
      const talking = this._drawTV();
      const tvPos = room.tv;
      const dTv = tvPos ? Math.hypot(tvPos.x - P.pos.x, tvPos.z - P.pos.y) : 99;
      this.audio?.tvStatic?.(talking ? 0 : Math.max(0, 1 - dTv / 7));
    } else this.audio?.tvStatic?.(0);
    if (room) {
      for (const { flame, halo } of room.flames.concat(room.trail || [])) {
        const f = 1.7 + Math.sin(time * 13 + flame.id) * 0.25 + Math.random() * 0.2;
        flame.scale.set(1, f, 1);
        halo.material.opacity = 0.7 + Math.random() * 0.3;
      }
      for (const sc of room.screens) sc.material.color.setScalar(0.92 + 0.08 * Math.random());
    }

    if (this.guide) this._updateGuide(dt, time);

    // after grandmother's room the souls leave it and roam the corridors
    if (this.visitedRoom && this.stage.stage === 1) this._updateRoamers(dt, time, speed);
    if (this.stage.stage === 2) {
      this._hideRoamers(); for (const b of this.balloons || []) b.g.visible = true;
      if (this.surfaceBalloon) this.surfaceBalloon.g.visible = true;
      this._updateClouds(dt, time, speed);
    } else if (this.clouds || this.balloons || this.surfaceBalloon) {            // a cheat can lead back out of the light
      for (const b of this.balloons || []) b.g.visible = false;
      if (this.surfaceBalloon) this.surfaceBalloon.g.visible = false;
      for (const c of this.clouds || []) for (const sp of c.puffs) sp.visible = false;
    }
    if (this.stage.stage !== 1) this._hideRoamers?.();

    // all the works seen: the arch of roses, once nothing else holds the view
    if (!this.finale && this.seen.size >= this.total && !P.locked) this._beginFinale();
    if (this.finale) this._updateFinale(dt, time);

    // candles: flames breathe; the 8 nearest light the walls
    tickCandles(time);
    this._candleT = (this._candleT || 0) - dt;
    if (this._candleT <= 0) {
      this._candleT = 0.25;
      const all = [];
      for (const st2 of this.chunkStuff.values()) for (const c of st2.scatter?.lights || []) {
        const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.y);
        if (d < 14) all.push([d, c]);
      }
      all.sort((a, b) => a[0] - b[0]);
      this._nearCandles = all.slice(0, 8).map(e => e[1]);
    }
    window.__app?.atmo?.setCandles(this._doorLights.length ? this._doorLights.concat(this._nearCandles || []).slice(0, 8) : this._nearCandles || [], time);

    // voices of the works nearby
    this._updateVoices(zone);
  }

  _updateVoices(zone) {
    if (!this.audio?.setArtVoices) return;
    const P = this.player;
    const near = this.artworks.active
      .filter(a => !a.hidden)
      .map(a => ({ a, d: Math.hypot(a.centerWorld.x - P.pos.x, a.centerWorld.z - P.pos.y) }))
      .filter(o => o.d < 30)
      .sort((u, v) => u.d - v.d)
      .slice(0, 4)
      .map(({ a }) => ({
        key: a.chunkKey + ':' + a.art.id,
        index: parseInt(a.art.id, 10) - 1,
        x: a.centerWorld.x, z: a.centerWorld.z,
        seen: this.seen.has(a.art.id),
        occluded: !this._lineOfSight(P.pos.x, P.pos.y, a.centerWorld.x + a.normal.x * 0.3, a.centerWorld.z + a.normal.z * 0.3),
      }));
    this.audio.setArtVoices({ x: P.pos.x, z: P.pos.y, yaw: P.yaw }, near);
    // at a work (within 3.5 m, in sight, or inspecting it): its own sound world
    let at = this.artworks.inspecting;
    if (!at) {
      let bd = 3.5;
      for (const a of this.artworks.active) {
        if (a.hidden) continue;
        const d = Math.hypot(a.centerWorld.x - P.pos.x, a.centerWorld.z - P.pos.y);
        if (d < bd && this._lineOfSight(P.pos.x, P.pos.y, a.centerWorld.x + a.normal.x * 0.3, a.centerWorld.z + a.normal.z * 0.3)) { bd = d; at = a; }
      }
    }
    this.audio.nearWork?.(at ? parseInt(at.art.id, 10) - 1 : null);
    this.audio.setZone?.(zone);
  }

  _lineOfSight(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.4);
    for (let k = 1; k < n; k++) {
      const x = x0 + (x1 - x0) * (k / n), z = z0 + (z1 - z0) * (k / n);
      if (solidAtGlobal(cellOf(x), cellOf(z))) return false;
    }
    return true;
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
