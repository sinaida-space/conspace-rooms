import * as THREE from 'three';
import { calm } from './calm.js';
import { CELL, CHUNK, solidAtGlobal } from './world.js';

// ── conspace-rooms · events.js ──────────────────────────────────────────────
// The event director (#43, C4): once every 20-40 s the labyrinth does one
// thing, picked by the zone the visitor is in. Never two at once, never
// sooner than 20 s after the last. Anywhere near, not only in view.
//   FEAR    a figure's shadow walks along a wall, a tube stutters, a creak,
//           knocks on a pipe, a drip, a clock or a notice comes off its nail
//   MEMORY  a cat's shadow along the skirting, a lamp blinks, the floor
//           creaks, a knock on a door, the tap drips, a plate, a portrait
//           or a calendar falls (wallthings.js)
//   LIGHT   quiet only: a bird's shadow crosses a wall, the candles shudder
//           in a draught, a drop falls into the water
// Shadows keep their own clock (SHADOW_GAP, the first soon after a zone
// begins) and are thrown only on a wall ahead, inside the view, so a zone
// shows several. FEAR also has someone standing at the end of a corridor who
// is gone as the visitor comes near; MEMORY a hand drawn along the wall.
// ?debug=events logs every event; window.__app.events.fire(kind) stages one
// now; window.__app.events.log keeps them all ({ t, kind, stage, dist }).

const GAP = [20, 40];
const WEIGHTS = [
  { flicker: 3, creak: 2, knock: 2, drip: 1, fall: 2 },
  { flicker: 1, creak: 2, knock: 1, drip: 1, fall: 2 },
  { shiver: 3, drip: 3 },
];
const SHADOW_GAP = [30, 50], SHADOW_FIRST = [8, 15];   // seconds; the first after a zone begins
const SHADOWS = [{ figure: 2, stander: 1 }, { cat: 1, hand: 1 }, { bird: 1 }];
const LOOK = Math.cos(0.6);                             // inside ~35° of where the visitor looks
const DEBUG = /(^|[?&])debug=events/.test(location.search);
const rand = (a, b) => a + Math.random() * (b - a);

// nothing solid on the floor between two points (0.3 m steps on the cell grid)
function clear(x0, z0, x1, z1) {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3);
  for (let i = 1; i < n; i++) if (solidAtGlobal(Math.floor((x0 + (x1 - x0) * i / n) / CELL), Math.floor((z0 + (z1 - z0) * i / n) / CELL))) return false;
  return true;
}

// ── silhouettes, drawn once: a penumbra thrown by a low lamp far off ──
// The shape is drawn crisp on a scratch canvas, slanted and drawn up a little
// from its foot (the lamp is low), then laid down twice as a canvas shadow:
// a wide pale blur and a narrower, denser one. Canvas shadows blur in every
// browser (ctx.filter does not in older Safari, where the figures came out
// flat black). PAD leaves room round each frame for the blur to fade out.
const PAD = 28, OFF = 4096;
function silhouette(kind) {
  const W = kind === 'figure' ? 128 : 256, H = kind === 'figure' ? 256 : 128;
  const CW = W + 2 * PAD, CH = H + 2 * PAD;
  const frames = kind === 'cat' || kind === 'bird' ? 2 : 1;
  const shape = document.createElement('canvas'); shape.width = CW * frames; shape.height = CH;
  const g = shape.getContext('2d');
  g.fillStyle = '#000';
  for (let f = 0; f < frames; f++) {
    g.save(); g.translate(f * CW + PAD, PAD);
    g.translate(W / 2, H); g.transform(1, 0, -0.08, 1.07, 0, 0); g.translate(-W / 2, -H);   // slant and stretch from the foot
    if (kind === 'figure') {                         // someone walking past, a coat to the knees
      g.beginPath(); g.ellipse(64, 30, 13, 16, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(58, 44); g.lineTo(70, 44); g.lineTo(88, 62); g.lineTo(84, 160); g.lineTo(44, 160); g.lineTo(40, 62); g.closePath(); g.fill();
      g.fillRect(48, 150, 12, 96); g.save(); g.translate(76, 152); g.rotate(-0.18); g.fillRect(-6, 0, 12, 94); g.restore();
      g.save(); g.translate(86, 64); g.rotate(-0.25); g.fillRect(-5, 0, 10, 80); g.restore();
    } else if (kind === 'cat') {                     // a cat along the skirting, tail up; two steps
      g.beginPath(); g.ellipse(120, 70, 62, 22, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(196, 52, 18, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(184, 40); g.lineTo(188, 22); g.lineTo(196, 36); g.lineTo(206, 22); g.lineTo(210, 42); g.fill();
      g.lineWidth = 9; g.lineCap = 'round'; g.strokeStyle = '#000';
      g.beginPath(); g.moveTo(62, 64); g.quadraticCurveTo(30, 50, 34, 14); g.stroke();
      const s = f ? 1 : -1;
      for (const [x, k] of [[80, 1], [96, -1], [150, 1], [166, -1]]) { g.beginPath(); g.moveTo(x, 84); g.lineTo(x + s * k * 8, 120); g.stroke(); }
    } else if (kind === 'hand') {                    // a hand laid flat to the wall, long fingers ahead, the arm trailing off
      g.fillRect(0, 58, 120, 26);
      g.beginPath(); g.ellipse(142, 70, 30, 22, 0, 0, Math.PI * 2); g.fill();
      g.lineWidth = 9; g.lineCap = 'round'; g.strokeStyle = '#000';
      for (const [y, len, bend] of [[54, 78, -6], [64, 90, -2], [74, 86, 2], [84, 70, 6]]) {
        g.beginPath(); g.moveTo(160, y); g.quadraticCurveTo(160 + len * 0.6, y + bend, 160 + len, y + bend * 2.2); g.stroke();
      }
      g.beginPath(); g.moveTo(140, 50); g.quadraticCurveTo(160, 24, 186, 22); g.stroke();   // the thumb
    } else {                                         // a bird, wings up and wings down
      g.beginPath(); g.ellipse(128, 66, 34, 10, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(160, 60); g.lineTo(178, 64); g.lineTo(160, 70); g.fill();
      g.beginPath(); g.moveTo(96, 62); g.lineTo(78, 56); g.lineTo(84, 70); g.fill();
      const up = f === 0;
      g.beginPath(); g.moveTo(112, 62); g.quadraticCurveTo(120, up ? 10 : 110, up ? 150 : 146, up ? 14 : 116); g.lineTo(140, 64); g.fill();
    }
    g.restore();
  }
  const c = document.createElement('canvas'); c.width = shape.width; c.height = CH;
  const s = c.getContext('2d');
  s.shadowOffsetX = OFF;                              // the shape itself lands off the canvas; only its shadow is seen
  for (const [blur, a] of [[22, 0.5], [8, 0.45]]) {   // penumbra, then the denser middle
    s.shadowBlur = blur; s.shadowColor = `rgba(0,0,0,${a})`;
    s.drawImage(shape, -OFF, 0);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / frames, 1);
  return { tex, frames, aspect: CW / CH, scale: CH / H };   // scale: the plane's height over the figure's
}

export class EventDirector {
  constructor({ scene, world, player, audio, atmo, stage, soul }) {
    Object.assign(this, { scene, world, player, audio, atmo, stage, soul });
    this.wait = rand(...GAP);
    this.log = [];
    this.t = 0;
    this.running = [];                                // animations still playing: shadows, falls
    this.sil = {};
    this.shadowWait = rand(...SHADOW_FIRST);
    this.shadows = [];                               // { t, kind, stage, dist } of every shadow thrown (checks)
  }

  update(dt) {
    this.t += dt;
    this.audio ??= window.__app?.audio;               // the engine starts on the first gesture
    const step = this.hold ? 0 : dt;                  // hold: animations stand still (checks)
    for (let i = this.running.length - 1; i >= 0; i--) if (!this.running[i](step)) this.running.splice(i, 1);
    if (this.soul?.finale || document.hidden) return;
    if (this.stage.stage !== this._shadowStage) { this._shadowStage = this.stage.stage; this.shadowWait = rand(...SHADOW_FIRST); }
    if ((this.shadowWait -= dt) <= 0) this.shadowWait = this.throwShadow() ? rand(...SHADOW_GAP) : 2;   // nowhere ahead: look again soon
    this.wait -= dt;
    if (this.wait > 0) return;
    const st = this.stage.stage, w = WEIGHTS[st] || WEIGHTS[0];
    const kinds = Object.keys(w);
    // a weighted order without repeats; the first that can happen here, happens
    const order = [];
    const pool = kinds.map(k => [k, w[k] * (k === this.last ? 0.3 : 1)]);
    while (pool.length) {
      let x = Math.random() * pool.reduce((s, [, v]) => s + v, 0), i = 0;
      while ((x -= pool[i][1]) > 0 && i < pool.length - 1) i++;
      order.push(pool.splice(i, 1)[0][0]);
    }
    for (const k of order) if (this.fire(k)) return;
    this.wait = 3;                                    // nothing could happen here: look again shortly
  }

  // stage one event of this kind now; false if there is nowhere for it
  fire(kind) {
    const st = this.stage.stage;
    const r = this['_' + kind]?.(st);
    if (!r) return false;
    this.wait = rand(...GAP);
    this.last = kind;
    const e = { t: +this.t.toFixed(1), kind, stage: st, dist: r.dist != null ? +r.dist.toFixed(1) : null };
    this.log.push(e);
    if (DEBUG) console.info('[events]', e);
    return true;
  }

  // one of the zone's shadows, on a wall ahead; false if there is none in view
  throwShadow(kind) {
    const st = this.stage.stage;
    if (!kind) {
      const w = SHADOWS[st] || SHADOWS[0], ks = Object.keys(w);
      let x = Math.random() * ks.reduce((u, k) => u + w[k], 0);
      kind = ks.find(k => (x -= w[k]) <= 0) || ks[0];
    }
    const r = kind === 'stander' ? this._stander() : this._shadow(st, kind);
    if (!r) return false;
    const e = { t: +this.t.toFixed(1), kind, stage: st, dist: +r.dist.toFixed(1) };
    this.shadows.push(e);
    if (DEBUG) console.info('[events] shadow', e);
    return true;
  }

  _here() { return { x: this.player.pos.x, z: this.player.pos.y }; }
  _ahead() { const d = (window.__app?.camera ?? this.player.camera)?.getWorldDirection(new THREE.Vector3()); return d ? { x: d.x / (Math.hypot(d.x, d.z) || 1), z: d.z / (Math.hypot(d.x, d.z) || 1) } : null; }

  // somewhere a few metres off, for a sound
  _somewhere(min = 3, max = 12) {
    const a = Math.random() * Math.PI * 2, d = rand(min, max);
    return { dx: Math.cos(a) * d, dz: Math.sin(a) * d, dist: d };
  }

  _creak(st) { const s = this._somewhere(); this.audio?.creak(s.dx, s.dz, s.dist, { low: st === 1 }); return s; }
  _knock(st) { const s = this._somewhere(4, 14); this.audio?.knock(s.dx, s.dz, s.dist, { metal: st === 0 }); return s; }
  _drip() {
    const s = this._somewhere(2, 8);
    for (let k = 0; k < 3; k++) setTimeout(() => this.audio?.drip(s.dx, s.dz, s.dist), k * rand(600, 900));
    return s;
  }
  // calm: a creak somewhere takes the lamp's place, and the candles keep still
  _flicker(st) { if (st === 2) return null; if (calm.on) return this._creak(st); this.atmo.flicker(st === 0 ? 1 : 0.6); return { dist: null }; }
  _shiver() { if (calm.on) return null; this.atmo.shiverCandles(rand(1.2, 2)); return { dist: null }; }

  // a wall run near the visitor, long enough to walk a shadow along, whose
  // middle is inside the view; facing: it must face the visitor head-on
  // (the wall that closes a corridor ahead)
  _wallNear(min, max, minLen, facing = false) {
    const p = this._here(), f = this._ahead(), cx = Math.floor(p.x / (CELL * CHUNK)), cz = Math.floor(p.z / (CELL * CHUNK));
    const cand = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      for (const sl of this.world.getWallSlots(cx + i, cz + j)) {
        if (sl.length < minLen) continue;
        const dx = sl.position.x - p.x, dz = sl.position.z - p.z, d = Math.hypot(dx, dz);
        if (d < min || d > max) continue;
        // the visitor must be on the lit side of it, and looking its way
        if (-dx * sl.normal.x - dz * sl.normal.z <= 0) continue;
        if (f && (dx * f.x + dz * f.z) / d < LOOK) continue;
        // seen from the side a corridor wall is a sliver and a shadow on it a black line:
        // only walls seen more or less face-on (head-on for `facing`)
        if (-(sl.normal.x * dx + sl.normal.z * dz) / d < (facing ? 0.8 : 0.5)) continue;
        if (clear(p.x, p.z, sl.position.x + sl.normal.x * 0.3, sl.position.z + sl.normal.z * 0.3)) cand.push({ sl, d });
      }
    return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
  }

  _shadow(st, kind = ['figure', 'cat', 'bird'][st]) {
    const w = this._wallNear(3, st === 2 ? 8 : 12, kind === 'figure' ? 4 : 3);
    if (!w) return null;
    const sil = this.sil[kind] ||= silhouette(kind);
    const h = kind === 'figure' ? 2.2 : kind === 'cat' ? 0.6 : kind === 'hand' ? 0.34 : 0.55;
    const mat = new THREE.MeshBasicMaterial({ map: sil.tex.clone(), transparent: true, opacity: 0, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.map.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * sil.scale * sil.aspect, h * sil.scale), mat);
    const { sl } = w, n = sl.normal, along = new THREE.Vector3(-n.z, 0, n.x);   // along the wall, to the right as it faces the visitor
    const half = sl.length * CELL / 2 - 0.3, dir = Math.random() < 0.5 ? 1 : -1;
    mesh.rotation.y = Math.atan2(n.x, n.z);
    if (dir < 0) { mat.map.repeat.x = -1 / sil.frames; mat.map.offset.x = 1 / sil.frames; }   // facing the way it goes
    const y0 = kind === 'figure' ? h / 2 + 0.02 : kind === 'cat' ? h / 2 + 0.05 : kind === 'hand' ? rand(1.15, 1.45) : rand(1.7, 2.3);
    const speed = kind === 'figure' ? 1.1 : kind === 'cat' ? 0.9 : kind === 'hand' ? 0.45 : 3.2, dur = (2 * half) / speed;
    this.scene.add(mesh);
    this.lastShadow = mesh;                          // for checks
    let t = 0;
    this.running.push(dt => {
      t += dt;
      const k = Math.min(1, t / dur), s = (k - 0.5) * 2 * half * dir;
      const bob = kind === 'figure' ? Math.abs(Math.sin(t * 5.2)) * 0.03 : kind === 'bird' ? Math.sin(t * 2) * 0.12 : kind === 'hand' ? Math.sin(t * 0.9) * 0.05 : 0;
      mesh.position.set(sl.position.x + n.x * 0.03 + along.x * s, y0 + bob, sl.position.z + n.z * 0.03 + along.z * s);
      if (sil.frames > 1) {                          // two frames: steps or wingbeats
        const f = Math.floor(t * (kind === 'bird' ? 7 : 5)) % 2;
        mat.map.offset.x = (dir < 0 ? 1 : 0) / sil.frames + f / sil.frames;
      }
      const fade = Math.min(1, t / 0.5, (dur - t) / 0.5);
      mat.opacity = Math.max(0, fade) * (kind === 'bird' ? 0.5 : 0.65);   // the texture is a penumbra already: under 0.5 at its middle
      if (k < 1) return true;
      this.scene.remove(mesh); mesh.geometry.dispose(); mat.map.dispose(); mat.dispose();
      return false;
    });
    return { dist: w.d };
  }

  // Someone standing at the end of the corridor ahead, still; gone in a
  // breath when the visitor comes within a few metres, or after a while
  _stander() {
    const w = this._wallNear(6, 20, 2, true);
    if (!w) return null;
    const sil = this.sil.figure ||= silhouette('figure');
    const h = 2.15, mat = new THREE.MeshBasicMaterial({ map: sil.tex, transparent: true, opacity: 0, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * sil.scale * sil.aspect, h * sil.scale), mat);
    const { sl } = w, n = sl.normal, along = new THREE.Vector3(-n.z, 0, n.x), off = rand(-0.4, 0.4);
    mesh.rotation.y = Math.atan2(n.x, n.z);
    mesh.position.set(sl.position.x + n.x * 0.03 + along.x * off, h / 2 + 0.02, sl.position.z + n.z * 0.03 + along.z * off);
    this.scene.add(mesh);
    this.lastShadow = mesh;
    let t = 0, going = -1;
    this.running.push(dt => {
      t += dt;
      const d = Math.hypot(mesh.position.x - this.player.pos.x, mesh.position.z - this.player.pos.y);
      if (going < 0 && (d < 5 || t > 10)) going = t;
      const k = going < 0 ? Math.min(1, t / 1.2) : 1 - (t - going) / 0.25;
      mat.opacity = Math.max(0, k) * 0.65;
      mesh.scale.x = 1 + Math.sin(t * 0.7) * 0.015;  // it breathes
      if (going < 0 || k > 0) return true;
      this.scene.remove(mesh); mesh.geometry.dispose(); mat.dispose();
      return false;
    });
    return { dist: w.d };
  }

  // Where a hung thing would come to rest: out from the wall by `out`, along it
  // by `slide`, at least CLEAR from every candle and every thing already down
  // in its chunk and the ones round it. Null when no such spot is left.
  _landing(h) {
    const CLEAR = 0.38, m = h.mesh, near = [];
    for (const s of this.soul.chunkStuff.values()) {
      for (const it of s.scatter?.items || []) if (!it.gone) near.push(it);
      for (const o of s.props?.hung || []) if (o.fallen && o !== h) near.push(o.mesh.position);
    }
    for (let tries = 0; tries < 8; tries++) {
      const out = rand(0.18, 0.4), slide = tries ? rand(-0.35, 0.35) : 0;
      const x = m.position.x + h.nx * out - h.nz * slide, z = m.position.z + h.nz * out + h.nx * slide;
      if (near.every(q => Math.hypot(q.x - x, q.z - z) > CLEAR)) return { out, slide };
    }
    return null;
  }

  // a thing on a wall nearby comes off its nail: a shiver, the drop, the knock
  _fall(st) {
    const p = this._here(), cand = [];
    for (const s of this.soul.chunkStuff.values()) for (const h of s.props?.hung || []) {
      if (h.fallen || !h.mesh.parent) continue;
      const d = Math.hypot(h.mesh.position.x - p.x, h.mesh.position.z - p.z);
      if (d > 1.5 && d < 16) cand.push({ h, d });
    }
    if (!cand.length) return null;
    // it lands only where the floor is clear: never on a candle, a boat or another fallen thing
    let h, d, out, slide;
    for (let n = cand.length; n > 0 && !h; n--) {
      const i = Math.floor(Math.random() * n), c = cand[i];
      cand[i] = cand[n - 1];
      const spot = this._landing(c.h);
      if (spot) ({ h, d } = c), ({ out, slide } = spot);
    }
    if (!h) return null;
    h.fallen = true;
    this.lastFall = h;                               // for checks
    const m = h.mesh, x0 = m.position.x, y0 = m.position.y, z0 = m.position.z, z0rot = m.rotation.z;
    const water = window.__app?.water?.level ?? 0, wet = water > 0.03;
    const spin = rand(-0.6, 0.6), glass = /Clock|notice|photo/.test(h.kind);
    let t = 0, v = 0, y = y0, landed = false, sink = 0;
    const WOBBLE = 0.45;
    this.running.push(dt => {
      if (!m.parent) return false;                    // the chunk went away meanwhile
      t += dt;
      if (t < WOBBLE) { m.rotation.z = z0rot + Math.sin(t * 40) * 0.05 * (t / WOBBLE); return true; }
      if (!landed) {
        v += 9.8 * dt; y -= v * dt;
        const k = Math.min(1, (y0 - y) / Math.max(0.3, y0 - 0.02));
        m.rotation.x = -Math.PI / 2 * k;                          // tips forward, face up by the floor
        m.rotation.z = z0rot + spin * k;
        m.position.set(x0 + (h.nx * out - h.nz * slide) * k, Math.max(y, wet ? water : 0.004), z0 + (h.nz * out + h.nx * slide) * k);
        if (y <= (wet ? water : 0.004)) {
          landed = true;
          const dx = m.position.x - p.x, dz = m.position.z - p.z;
          this.audio?.fall(dx, dz, Math.hypot(dx, dz), { glass: glass && !wet, wet });
          if (!wet) m.position.y = 0.004;
        }
        return true;
      }
      if (wet && sink < 1) {                          // it settles to the flooded floor
        sink = Math.min(1, sink + dt / 2.5);
        m.position.y = water + (0.004 - water) * sink;
        return true;
      }
      // where it lies, for the chunk to remember if it is built again (soulpath.js)
      if (h.home) (this.soul._fallen ??= new Map()).set(h.home, { pos: m.position.clone(), rot: m.rotation.clone() });
      return false;
    });
    return { dist: d };
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
