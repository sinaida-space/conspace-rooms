// ── conspace-rooms · rituals.js ─────────────────────────────────────────────
// Touch a thing three times and it answers. Three clicks on it, three taps,
// E (or the controller's A) three times while looking at it, or one open
// palm held toward it for two seconds in gesture mode. The first two touches
// only tick, quietly, as if something heard; the third is the ritual.
//   candle      (every stage) a close crackle and a breath by the ear, the
//               flame flares, sparks drift off toward a work not yet seen,
//               and a question rises in the smoke
//   bed         (fear) the sheet rises and falls as if someone breathed under it
//   drip        (fear) a drop falls, slowly, and the ward monitor beeps
//   wheelchair  (fear) its wheels squeak, twice, as if someone sat down
//   clock       (memory) the nightstand clock strikes twelve, and the kettle after
//   tv          (memory) the television bursts into snow and shows 12:24
//   drowned     (light) the thing lifts a little in the water and settles, a ring spreads
// What can be touched is asked of soulpath.js (ritualTargets); nothing here
// is stored. The candles' questions are kept for the card like any other.

import * as THREE from 'three';
import { t } from './i18n.js';
import { captions } from './captions.js';

const REACH = 3.2;                 // metres: further than this nothing answers
const GAP = 0.65;                  // seconds between touches that still count as one ritual
const PALM_HOLD = 2;               // seconds of one open palm toward a thing
const AGAIN = 15;                  // seconds before the same thing answers again
const AGAIN_CLOCK = 26;            // the clock: twelve strokes and the kettle after take about 22 s

const rand = (a, b) => a + Math.random() * (b - a);
const again = tg => (tg.kind === 'clock' ? AGAIN_CLOCK : AGAIN);

export function createRituals({ scene, camera, canvas, router, soul, player }) {
  const ray = new THREE.Raycaster();
  const count = new Map();         // target key → { n, at }
  const done = new Map();          // target key → when its ritual last ran (s)
  const running = [];
  let time = 0, palm = { key: null, t: 0 }, clickAt = -1;
  const order = (() => { const n = t('candleQuestions').length, a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
  let qi = 0;

  const audio = () => window.__app?.audio;

  // the thing nearest the line of sight (or the pointer's ray), within reach
  function aim(ndc = { x: 0, y: 0 }) {
    if (player.locked) return null;
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction, best = { t: null, a: Infinity };
    for (const tg of soul.ritualTargets(player.pos.x, player.pos.y, REACH + 1)) {
      const vx = tg.x - o.x, vy = tg.y - o.y, vz = tg.z - o.z, dist = Math.hypot(vx, vy, vz);
      if (dist > REACH) continue;
      const along = (vx * d.x + vy * d.y + vz * d.z) / dist;
      if (along <= 0) continue;
      const ang = Math.acos(Math.min(1, along)), allow = Math.atan2(tg.r, dist) + 0.04;
      if (ang < allow && ang < best.a) { best.a = ang; best.t = tg; }
    }
    return best.t;
  }

  function touch(tg) {
    if (!tg) return;
    if (time - (done.get(tg.key) ?? -Infinity) < again(tg)) return;
    const c = count.get(tg.key);
    const n = c && time - c.at < GAP ? c.n + 1 : 1;
    count.set(tg.key, { n, at: time });
    if (n < 3) { tick(tg); return; }
    count.delete(tg.key);
    done.set(tg.key, time);
    perform(tg);
  }

  // ── the ways to touch ──
  canvas.addEventListener('click', e => {
    if ((canvas.dragDist || 0) >= 6) return;
    clickAt = performance.now();
    const r = canvas.getBoundingClientRect();
    touch(aim({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }));
  });
  let tap = null;
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') tap = { x: e.clientX, y: e.clientY, at: performance.now() }; });
  canvas.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch' || !tap) return;
    const quick = performance.now() - tap.at < 300 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 14;
    tap = null;
    if (!quick) return;
    const r = canvas.getBoundingClientRect();
    touch(aim({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }));
  });
  // E and the controller's A arrive as 'pick'; a mouse click sends one too, already counted above
  router.on('pick', () => setTimeout(() => { if (performance.now() - clickAt > 60) touch(aim()); }, 0));

  // ── what the touch does ──
  function tick(tg) {                                   // something heard: a tiny dry tick from the thing
    const a = audio(); if (!a?.ctx || a.muted) return;
    const ctx = a.ctx, now = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noise(ctx);
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2400 + Math.random() * 800; hp.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.06, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    s.connect(hp); hp.connect(g); g.connect(panAt(a, tg)); s.start(now); s.stop(now + 0.06);
  }

  function perform(tg) {
    captions.say('rit_' + tg.kind, { dx: tg.x - player.pos.x, dz: tg.z - player.pos.y, gap: 0 });
    ({ candle, bed, drip, wheelchair, clock, tv, drowned })[tg.kind]?.(tg);
  }

  function candle(tg) {
    const a = audio();
    if (a?.ctx && !a.muted) asmr(a);
    // the flame flares and settles back
    const it = tg.it, sc = tg.sc, base = it.flame.clone();
    let k = 0;
    running.push(dt => {
      k += dt / 2.6;
      if (sc.disposed) return false;
      it.flame.copy(base).multiplyScalar(1 + 1.1 * Math.max(0, 1 - k) * (0.85 + 0.15 * Math.sin(k * 40)));
      for (const name of ['flame', 'pool']) { const m = sc.meshes[name]; if (m?.instanceColor) { m.setColorAt(tg.i, it.flame); m.instanceColor.needsUpdate = true; } }
      if (k < 1) return true;
      it.flame.copy(base); for (const name of ['flame', 'pool']) { const m = sc.meshes[name]; if (m?.instanceColor) { m.setColorAt(tg.i, base); m.instanceColor.needsUpdate = true; } }
      return false;
    });
    // sparks lean off toward a work not yet seen (or the way the marks go)
    let dir = null, bd = Infinity;
    for (const w of soul.artworks?.active || []) {
      if (w.hidden || soul.seen.has(w.art.id)) continue;
      const dx = w.centerWorld.x - tg.x, dz = w.centerWorld.z - tg.z, d = Math.hypot(dx, dz);
      if (d < bd) { bd = d; dir = { x: dx / d, z: dz / d }; }
    }
    dir ??= soul.wayDir?.() || { x: 0, z: 0 };
    sparks(tg, dir, base);
    // and a question in the smoke
    const qs = t('candleQuestions'), text = qs[order[qi++ % order.length]];
    if (!soul.asked.includes(text)) soul.asked.push(text);
    setTimeout(() => soul._say(t('candleLabel'), text, '#ffcf8a'), 900);
  }

  function sparks(tg, dir, col) {
    const N = 9, pos = new Float32Array(N * 3), seeds = [];
    for (let i = 0; i < N; i++) seeds.push({ d: rand(0, 0.5), s: rand(0.7, 1.2), w: rand(-0.25, 0.25) });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: col.clone().multiplyScalar(1.4), size: 0.035, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    let k = 0;
    running.push(dt => {
      k += dt / 3;
      for (let i = 0; i < N; i++) {
        const s = seeds[i], q = Math.max(0, k - s.d * 0.3) * s.s, side = s.w * q;
        pos[i * 3] = tg.x + dir.x * q * 2.4 - dir.z * side;
        pos[i * 3 + 1] = 0.26 + q * 0.5 + Math.sin(q * 9 + i) * 0.03;
        pos[i * 3 + 2] = tg.z + dir.z * q * 2.4 + dir.x * side;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = Math.min(1, k * 6) * Math.max(0, 1 - k);
      if (k < 1) return true;
      scene.remove(pts); geo.dispose(); mat.dispose();
      return false;
    });
  }

  // ASMR at the ear: wick crackle in both ears by turns, a breath, a drop of wax
  function asmr(a) {
    const ctx = a.ctx, t0 = ctx.currentTime;
    const ear = side => { const p = ctx.createStereoPanner(); p.pan.value = side; p.connect(a.master); return p; };
    for (let i = 0; i < 16; i++) {
      const at = t0 + rand(0, 2.4), s = ctx.createBufferSource(); s.buffer = noise(ctx);
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = rand(2500, 6000);
      const g = ctx.createGain(); const v = rand(0.03, 0.09);
      g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(0.0001, at + rand(0.006, 0.02));
      s.connect(f); f.connect(g); g.connect(ear(i % 2 ? 0.8 : -0.8)); s.start(at, Math.random()); s.stop(at + 0.03);
    }
    const b = ctx.createBufferSource(); b.buffer = noise(ctx);   // a slow breath across the flame, left to right
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.setValueAtTime(700, t0 + 0.6); bf.frequency.linearRampToValueAtTime(1300, t0 + 1.9); bf.Q.value = 1.2;
    const bg = ctx.createGain(); bg.gain.setValueAtTime(0.0001, t0 + 0.6); bg.gain.exponentialRampToValueAtTime(0.05, t0 + 1.2); bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.1);
    const bp = ctx.createStereoPanner(); bp.pan.setValueAtTime(-0.7, t0 + 0.6); bp.pan.linearRampToValueAtTime(0.7, t0 + 2.1); bp.connect(a.master);
    b.connect(bf); bf.connect(bg); bg.connect(bp); b.start(t0 + 0.6, Math.random()); b.stop(t0 + 2.2);
    const o = ctx.createOscillator(), og = ctx.createGain(), wt = t0 + 2.3;   // the drop of wax
    o.frequency.setValueAtTime(1700, wt); o.frequency.exponentialRampToValueAtTime(2900, wt + 0.05);
    og.gain.setValueAtTime(0.0001, wt); og.gain.exponentialRampToValueAtTime(0.04, wt + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, wt + 0.12);
    o.connect(og); og.connect(ear(0.3)); o.start(wt); o.stop(wt + 0.14);
  }

  function bed(tg) {                                     // the sheet breathes, twice
    // the corridors light their own materials, so the sheet carries its light in its vertices: pale on top, grey in the folds
    const geo = new THREE.SphereGeometry(0.5, 24, 12), nrm = geo.attributes.normal, cols = [];
    for (let i = 0; i < nrm.count; i++) { const k = 0.38 + 0.42 * Math.max(0, nrm.getY(i)); cols.push(0.86 * k, 0.86 * k, 0.8 * k); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(tg.x, tg.y, tg.z); m.rotation.y = tg.rot || 0; m.scale.set(1.25, 0.01, 0.5);
    scene.add(m);
    breath(tg, 2);
    let k = 0;
    running.push(dt => {
      k += dt / 5;
      m.scale.y = 0.01 + 0.26 * Math.max(0, Math.sin(k * Math.PI * 2)) ** 1.5;
      if (k < 1) return true;
      scene.remove(m); m.geometry.dispose(); mat.dispose();
      return false;
    });
  }

  function breath(tg, n) {
    const a = audio(); if (!a?.ctx || a.muted) return;
    const ctx = a.ctx, out = panAt(a, tg);
    for (let i = 0; i < n * 2; i++) {
      const at = ctx.currentTime + i * 1.25, inhale = i % 2 === 0;
      const s = ctx.createBufferSource(); s.buffer = noise(ctx);
      const f = ctx.createBiquadFilter(); f.type = inhale ? 'bandpass' : 'lowpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(inhale ? 900 : 1400, at); f.frequency.exponentialRampToValueAtTime(inhale ? 1600 : 500, at + 1.1);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.08, at + (inhale ? 0.6 : 0.1)); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.15);
      s.connect(f); f.connect(g); g.connect(out); s.start(at, Math.random()); s.stop(at + 1.2);
    }
  }

  function drip(tg) {                                    // one drop, falling slow
    const mat = new THREE.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.9 });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), mat);
    m.scale.y = 1.4; scene.add(m);
    let k = 0, landed = false;
    running.push(dt => {
      k += dt / 2.6;
      m.position.set(tg.x, 1.32 - 1.3 * k * k, tg.z);
      if (k < 1) return true;
      if (!landed) {
        landed = true;
        const a = audio(); a?.drip?.(tg.x - player.pos.x, tg.z - player.pos.y, Math.hypot(tg.x - player.pos.x, tg.z - player.pos.y));
        beep(tg);
      }
      scene.remove(m); m.geometry.dispose(); mat.dispose();
      return false;
    });
  }

  function beep(tg) {
    const a = audio(); if (!a?.ctx || a.muted) return;
    const ctx = a.ctx, out = panAt(a, tg);
    [84, 81, 77].forEach((n, i) => {
      const at = ctx.currentTime + 0.3 + i * 0.19, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 440 * 2 ** ((n - 69) / 12);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.025, at + 0.005); g.gain.setValueAtTime(0.025, at + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
      o.connect(g); g.connect(out); o.start(at); o.stop(at + 0.15);
    });
  }

  function wheelchair(tg) {
    const a = audio(), dx = tg.x - player.pos.x, dz = tg.z - player.pos.y, d = Math.hypot(dx, dz);
    a?.creak?.(dx, dz, d, { cc: false });                // its wheels, not 'a door somewhere'
    setTimeout(() => a?.creak?.(dx, dz, d, { cc: false }), 900);
  }

  function clock() { audio()?.music?.places?.stay?.(); }

  function tv() {                                        // a burst of loud snow, then the time (soulpath.js draws and hisses both)
    soul._tvText = null; soul._tvBurstUntil = performance.now() + 1600;
    setTimeout(() => { soul._tvText = '12:24'; soul._tvUntil = performance.now() + 6000; soul._tvDirty = true; }, 1600);
  }

  function drowned(tg) {
    const th = tg.th, y0 = th.meshes.map(m => m.position.y);
    window.__app?.water?.addRipple?.(tg.x, tg.z, 1.4);
    audio()?.chime?.();
    let k = 0;
    running.push(dt => {
      k += dt / 2.6;
      const lift = 0.07 * Math.sin(Math.min(1, k) * Math.PI);
      th.meshes.forEach((m, i) => { m.position.y = y0[i] + lift; });
      return k < 1;
    });
  }

  return {
    update(dt) {
      time += dt;
      for (let i = running.length - 1; i >= 0; i--) if (!running[i](dt)) running.splice(i, 1);
      // gesture mode: one open palm held toward a thing (both open is "stop")
      const h = player.hand;
      const one = h?.present && !h.stopped && ((h.left === 'palm') !== (h.right === 'palm'));
      const tg = one ? aim() : null;
      if (tg && tg.key === palm.key) {
        if ((palm.t += dt) >= PALM_HOLD && time - (done.get(tg.key) ?? -Infinity) >= again(tg)) { done.set(tg.key, time); palm.t = 0; perform(tg); }
      } else palm = { key: tg?.key ?? null, t: 0 };
    },
  };
}

let NOISE = null;
function noise(ctx) {
  if (NOISE) return NOISE;
  NOISE = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = NOISE.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return NOISE;
}

// a panner placed where the thing is, as the listener stands
function panAt(a, tg) {
  const ctx = a.ctx, P = window.__app?.player;
  const dx = tg.x - (P?.pos.x ?? 0), dz = tg.z - (P?.pos.y ?? 0), d = Math.max(0.5, Math.hypot(dx, dz)), yaw = P?.yaw ?? 0;
  const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d));
  const g = ctx.createGain(); g.gain.value = 1 / (1 + d / 3);
  p.connect(g); g.connect(a.bed);
  setTimeout(() => { try { g.disconnect(); } catch (e) { /* gone */ } }, 8000);
  return p;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
