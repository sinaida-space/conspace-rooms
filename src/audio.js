import { startAmbience } from './ambience.js';
import { sketchParam } from './device.js';
import { Music } from './music.js';
import { WaterSound } from './waterSound.js';
import { captions } from './captions.js';
// Generative audio, zero files: the music (music.js), crackle, footsteps,
// turns, the works' voices, soft chime on demand.
// Init-only — build only after a user gesture (start()), not auto-started.
export class AudioEngine {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    // out: the overall level and mute; master: everything but Alisa's voice,
    // which sinks under her (duckWorld, alisa.js) while she goes straight to out
    this.out = ctx.createGain(); this.out.gain.value = this.muted ? 0 : 0.9 * (this._volume ?? 1);
    this.out.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 1;
    this.master.connect(this.out);
    // everything that is "the corridor" (drone, crackle, whisper, footsteps,
    // turns, the works' notes) goes through bed; a work's own sound world
    // goes straight to master, so standing at a work silences the corridor
    this.bed = ctx.createGain(); this.bed.gain.value = 1;
    this.bed.connect(this.master);

    // the music: lo-fi corridors, a gramophone in grandmother's room (music.js)
    this.musicDuck = ctx.createGain();   // Alisa's voice sinks the music (alisa.js)
    // a tape that can go wobbly: a short delay whose time a slow LFO swings,
    // at depth 0 until a shadow bends the world (wow, shadowSound.js)
    this._wow = ctx.createDelay(0.05); this._wow.delayTime.value = 0.012;
    const wowLfo = ctx.createOscillator(); wowLfo.frequency.value = 0.7;
    this._wowDepth = ctx.createGain(); this._wowDepth.gain.value = 0;
    wowLfo.connect(this._wowDepth); this._wowDepth.connect(this._wow.delayTime); wowLfo.start();
    this.musicDuck.connect(this._wow); this._wow.connect(this.bed);
    this.music = new Music(ctx, this.musicDuck);
    // the flooded acceptance stage: surf, drips, wet steps (waterSound.js)
    this.water = new WaterSound(ctx, this.bed);

    // crackle bed: looping filtered noise + random pops
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
    this.crackleGain = ctx.createGain(); this.crackleGain.gain.value = 0.011;
    noise.connect(bp); bp.connect(this.crackleGain); this.crackleGain.connect(this.bed);
    noise.start();
    this._popTimer = setInterval(() => this._pop(), 400);

    // turn whoosh: same noise buffer, bandpassed and swept by turn()
    const turnNoise = ctx.createBufferSource(); turnNoise.buffer = buf; turnNoise.loop = true;
    this.turnFilter = ctx.createBiquadFilter(); this.turnFilter.type = 'bandpass'; this.turnFilter.frequency.value = 700; this.turnFilter.Q.value = 1.4;
    this.turnGain = ctx.createGain(); this.turnGain.gain.value = 0;
    turnNoise.connect(this.turnFilter); this.turnFilter.connect(this.turnGain); this.turnGain.connect(this.bed);
    turnNoise.start();
  }

  _pop() { // crackle pop / tick
    if (!this.ctx || this.muted || Math.random() < 0.45) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.value = 900 + Math.random() * 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.02 + Math.random() * 0.025, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.05);
    o.connect(g); g.connect(this.bed); o.start(t); o.stop(t + 0.09);
  }

  // motion speed 0..~8 → crackle rises slightly
  motion(speed) {
    if (!this.ctx) return;
    const s = Math.min(1, Math.abs(speed) / 8);
    this.music?.motion(s);
    this._speedS = s; // crackle level is set in setZone(), which scales it by zone
  }

  // footfall thump/creak, alternating pitch left/right foot for a bit of variety.
  // the flooded acceptance stage swaps this for a squelch (waterSound.js).
  step() {
    if (!this.ctx || this.muted) return;
    const level = window.__app?.water?.level ?? 0;
    if (level > 0.01) {
      const running = (window.__app?.player?.vel?.length?.() ?? 0) > 3.2;
      this.water.step(running, (dx, dz, dist) => this.drip(dx, dz, dist));
      return;
    }
    const running = (window.__app?.player?.vel?.length?.() ?? 0) > 3.2;
    this._stepFoot = !this._stepFoot;
    const detune = 1 + (Math.random() * 2 - 1) * 0.04;   // no two steps alike
    const surface = this._surface();
    if (surface === 'tile') this._stepTile(running, detune);
    else if (surface === 'parquet') this._stepParquet(running, detune);
    else if (surface === 'rug') this._stepRug(running, detune);
    else this._stepSoft(running, detune);
  }

  // what is underfoot: a rug, grandmother's parquet, the light's softness, or tile
  _surface() {
    if (this._forceSurface === undefined) {   // ?steps=tile|parquet|rug|soft, read once
      const f = sketchParam('steps');
      this._forceSurface = ['tile', 'parquet', 'rug', 'soft'].includes(f) ? f : null;
    }
    if (this._forceSurface) return this._forceSurface;
    const p = window.__app?.player?.pos;
    if (p && window.__app?.soul?.onRug?.(p.x, p.y) === true) return 'rug';
    const z = this._zone;
    if (!z) return this._inRoom ? 'parquet' : 'tile';
    const top = Math.max(z.fear, z.memory, z.accept);
    if (this._inRoom || z.memory === top) return 'parquet';
    if (z.accept === top) return 'soft';
    return 'tile';
  }

  // one 0.3 s noise buffer, built once and shared by every step
  _noiseBuf() {
    if (!this._noise) {
      const ctx = this.ctx, n = Math.floor(ctx.sampleRate * 0.3);
      this._noise = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = this._noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return this._noise;
  }

  // low body: a decaying triangle thump through a filter into bed
  _body(t, freq, peak, dur, type, cutoff, q = 1.1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = cutoff; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.bed);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // a short filtered noise burst into bed
  _burst(t, type, freq, q, peak, dur) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this._noiseBuf();
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.bed);
    n.start(t); n.stop(t + dur + 0.02);
  }

  // hospital tile: hard click, low body, a faint echo off the walls
  _stepTile(running, detune) {
    const t = this.ctx.currentTime, k = running ? 1.25 : 1, len = running ? 0.8 : 1;
    const base = (this._stepFoot ? 66 : 61) * detune;
    this._burst(t, 'bandpass', 2500 * detune, 1.2, 0.03 * k, 0.025 * len);
    this._body(t, base, 0.05 * k, 0.16 * len, 'bandpass', 300);
    const e = t + 0.09 + Math.random() * 0.05;   // echo 90-140 ms later, about 25%
    this._burst(e, 'bandpass', 2300 * detune, 1.2, 0.03 * k * 0.25, 0.03 * len);
    this._body(e, base, 0.05 * k * 0.25, 0.14 * len, 'bandpass', 300);
  }

  // grandmother's floor: a softened thump, now and then a board creaks
  _stepParquet(running, detune) {
    const ctx = this.ctx, t = ctx.currentTime, k = running ? 1.2 : 1;
    this._body(t, (this._stepFoot ? 66 : 61) * detune, 0.05 * k, 0.16, 'lowpass', 900, 0.7);
    if (Math.random() > 1 / 3) return;
    const f0 = (180 + Math.random() * 140) * detune, dur = 0.12 + Math.random() * 0.08;
    const o = ctx.createOscillator(); o.type = Math.random() < 0.5 ? 'sawtooth' : 'triangle';
    o.frequency.setValueAtTime(f0, t + 0.02);
    o.frequency.linearRampToValueAtTime(f0 * (0.85 + Math.random() * 0.3), t + 0.02 + dur);   // slow random glide
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0; bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.02, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + dur);
    o.connect(bp); bp.connect(g); g.connect(this.bed);
    o.start(t + 0.02); o.stop(t + dur + 0.05);
  }

  // a rug: a dull low thump, no click
  _stepRug(running, detune) {
    this._body(this.ctx.currentTime, (this._stepFoot ? 66 : 61) * detune, 0.05 * 0.6 * (running ? 1.2 : 1), 0.18, 'lowpass', 350, 0.7);
  }

  // the light: barely there, an airy brush and no body
  _stepSoft(running, detune) {
    this._burst(this.ctx.currentTime, 'lowpass', 1400 * detune, 0.5, 0.05 * 0.4 * (running ? 1.2 : 1), 0.11);
  }

  // the flooded acceptance stage, called every frame by water.js
  setWater({ level = 0, tide = 0 } = {}) {
    this.water?.setWater(level, tide, this.muted);
  }

  // one drip landed: dx/dz = direction from the listener (world), dist metres
  drip(dx, dz, dist) {
    captions.say('drip', { dx, dz, gap: 20 });
    if (!this.ctx || this.muted) return;
    const yaw = window.__app?.player?.yaw ?? 0;
    this.water.drip(dx, dz, dist, yaw);
  }

  // ── the event director's sounds (#43, C4, events.js) ─────────────────────
  // Heard from where they happen: dx/dz the direction from the listener
  // (world), dist in metres; panned and softened with distance, some of it
  // into the corridor's room so it carries.
  _at(dx, dz, dist) {
    const ctx = this.ctx, d = Math.max(0.5, dist), yaw = window.__app?.player?.yaw ?? 0;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d));
    const g = ctx.createGain(); g.gain.value = 1 / (1 + d / 4);
    pan.connect(g); g.connect(this.bed); g.connect(this.water._room());
    return pan;
  }

  // a floorboard or an old hinge somewhere: a slow stick-slip saw through two resonances
  creak(dx, dz, dist, { low = false, cc = true } = {}) {   // cc: false when the caller captions it itself
    if (cc) captions.say(low ? 'floor' : 'creak', { dx, dz });
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 0.5 + Math.random() * 0.6, out = this._at(dx, dz, dist);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const curve = new Float32Array(24);
    let f = (low ? 110 : 190) + Math.random() * 50;
    for (let i = 0; i < curve.length; i++) { f = Math.max(low ? 70 : 130, f + (Math.random() - 0.45) * 26); curve[i] = f; }
    o.frequency.setValueCurveAtTime(curve, t, dur);
    const slip = ctx.createOscillator(); slip.type = 'square'; slip.frequency.setValueAtTime(14, t); slip.frequency.linearRampToValueAtTime(30, t + dur);
    const amp = ctx.createGain(); amp.gain.value = 0.5;
    const slipG = ctx.createGain(); slipG.gain.value = 0.5;
    slip.connect(slipG); slipG.connect(amp.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.09, t + 0.1);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [fr, q] of [[low ? 520 : 820, 4], [low ? 1300 : 2100, 6]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q;
      amp.connect(bp); bp.connect(env);
    }
    o.connect(amp); env.connect(out);
    o.start(t); slip.start(t); o.stop(t + dur + 0.05); slip.stop(t + dur + 0.05);
  }

  // knocks: metal on a pipe (a ringing partial) or knuckles on a wooden door
  knock(dx, dz, dist, { metal = false, n = 2 + Math.floor(Math.random() * 2) } = {}) {
    captions.say(metal ? 'pipe' : 'knock', { dx, dz });
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, out = this._at(dx, dz, dist);
    for (let k = 0; k < n; k++) {
      const t = ctx.currentTime + k * (0.28 + Math.random() * 0.12);
      const o = ctx.createOscillator(); o.type = metal ? 'sine' : 'triangle';
      o.frequency.setValueAtTime(metal ? 420 + Math.random() * 40 : 120 + Math.random() * 20, t);
      o.frequency.exponentialRampToValueAtTime(metal ? 400 : 70, t + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(metal ? 0.18 : 0.5, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (metal ? 0.9 : 0.16));
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 1);
      const nb = ctx.createBufferSource(); nb.buffer = this._noiseBuf();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = metal ? 2400 : 900; bp.Q.value = 1.4;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.25, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      nb.connect(bp); bp.connect(ng); ng.connect(out); nb.start(t); nb.stop(t + 0.05);
    }
  }

  // someone else's steps on the tile, quiet, starting at (dx, dz) from the
  // visitor and going off at (vx, vz) metres a second for `dur` seconds
  steps(dx, dz, vx, vz, dur) {
    captions.say('steps', { dx, dz, gap: 15 });
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.3, gap = 0.56;
    for (let k = 0; k * gap < dur; k++) {
      const s = k * gap + Math.random() * 0.04, x = dx + vx * s, z = dz + vz * s;
      const out = this._at(x, z, Math.hypot(x, z)), t = t0 + s;
      const fade = Math.min(1, (dur - s) / 1.5);            // they thin out as they go
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime((k % 2 ? 64 : 59) * (0.97 + Math.random() * 0.06), t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.0001 + 0.16 * fade, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2);
      const nb = ctx.createBufferSource(); nb.buffer = this._noiseBuf();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 1.2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001 + 0.05 * fade, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      nb.connect(bp); bp.connect(ng); ng.connect(out); nb.start(t); nb.stop(t + 0.04);
    }
  }

  // a thing off the wall hits the floor (glass: a few bright tinkles after), or the water
  fall(dx, dz, dist, { glass = false, wet = false } = {}) {
    captions.say(wet ? 'fallWet' : glass ? 'fallGlass' : 'fall', { dx, dz });
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._at(dx, dz, dist);
    const burst = (at, type, fr, q, peak, dur) => {
      const nb = ctx.createBufferSource(); nb.buffer = this._noiseBuf();
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = fr; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      nb.connect(f); f.connect(g); g.connect(out); nb.start(at); nb.stop(at + dur + 0.02);
    };
    if (wet) {                                        // a slap on the water, then it gulps and goes down
      burst(t, 'lowpass', 1400, 0.7, 0.6, 0.25);
      burst(t + 0.02, 'bandpass', 500, 1.2, 0.4, 0.4);
      for (let k = 0; k < 4; k++) {
        const b = t + 0.3 + k * (0.12 + Math.random() * 0.15), o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(300 + Math.random() * 300, b); o.frequency.exponentialRampToValueAtTime(900, b + 0.05);
        g.gain.setValueAtTime(0.0001, b); g.gain.exponentialRampToValueAtTime(0.06, b + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, b + 0.06);
        o.connect(g); g.connect(out); o.start(b); o.stop(b + 0.08);
      }
      return;
    }
    const o = ctx.createOscillator(), g = ctx.createGain();             // the body landing
    o.type = 'triangle'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.18);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.25);
    burst(t, 'bandpass', 1600, 0.9, 0.5, 0.09);
    burst(t + 0.16, 'bandpass', 1900, 1.1, 0.18, 0.06);                 // it bounces once
    if (glass) for (let k = 0; k < 6; k++) burst(t + 0.04 + Math.random() * 0.35, 'bandpass', 4200 + Math.random() * 3500, 12, 0.12, 0.05);
  }

  // subtle whoosh/tick tied to turn rate (rad/s), same shape as motion()
  turn(yawRate) {
    if (!this.ctx || !this.turnFilter || !Number.isFinite(yawRate)) return;
    const s = Math.min(1, Math.abs(yawRate) / 2.2);
    this.turnFilter.frequency.setTargetAtTime(700 + s * 900, this.ctx.currentTime, 0.08);
    this.turnGain.gain.setTargetAtTime(s * 0.02, this.ctx.currentTime, 0.08);
  }

  chime() { // soft bell: root + fifth, long decay
    captions.say('chime', { gap: 10 });
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, v] of [[523.25, 0.10], [784, 0.05], [1046.5, 0.03]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 3);
    }
  }

  // The crossing through a portal (tunnel.js, SoulPath._cross): an inhale as
  // the tunnel closes in, two slow heartbeats in the flight, an exhale as it
  // opens, and there the new place answers: a singing bowl struck softly into
  // grandmother's zone, a drop into still water into the light. All of it
  // rings in one large empty room. to: the stage entered · times: the
  // tunnel's own (seconds).
  crossing(to, { inT = 0.75, hold = 1.6, out = 0.9 } = {}) {
    captions.say('crossing');
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.02, open = t + inT + hold;
    if (!this._room) {                                   // a stereo tail of darkening, decaying noise, built once
      const n = Math.ceil(ctx.sampleRate * 3.2), ir = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch); let lp = 0;
        for (let i = 0; i < n; i++) { const k = i / n; lp += (Math.random() * 2 - 1 - lp) * (0.08 + 0.9 * (1 - k)); d[i] = lp * Math.pow(1 - k, 2.4); }
      }
      this._room = ctx.createConvolver(); this._room.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = 0.55;
      this._room.connect(wet); wet.connect(this.master);
      const nb = this._breath = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const bus = ctx.createGain(); bus.gain.value = 0.9;
    bus.connect(this.master); bus.connect(this._room);
    const env = (g, pts) => { g.gain.setValueAtTime(0.0001, pts[0][0]); for (const [tt, v] of pts.slice(1)) g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0001), tt); };
    const noise = (t0, dur) => { const s = ctx.createBufferSource(); s.buffer = this._breath; s.start(t0); s.stop(t0 + dur); return s; };
    const breath = (t0, dur, f0, f1, v) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      const g = ctx.createGain(); env(g, [[t0, 0], [t0 + dur * 0.55, v], [t0 + dur, 0]]);
      noise(t0, dur).connect(bp); bp.connect(g); g.connect(bus);
    };
    const tone = (t0, f, v, dec, type = 'sine', f1 = null, rise = 0.004) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
      o.frequency.setValueAtTime(f, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + Math.min(dec, 0.18));
      env(g, [[t0, 0], [t0 + rise, v], [t0 + dec, 0]]); o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dec + 0.05);
    };
    breath(t, inT + 0.3, 700, 1700, 0.35);                                   // the inhale
    for (const b0 of [t + inT + 0.25, t + inT + 1.05]) { tone(b0, 90, 0.7, 0.25, 'sine', 40, 0.015); tone(b0 + 0.22, 90, 0.45, 0.25, 'sine', 40, 0.015); }   // lub-dub, twice
    breath(open, out + 0.6, 1400, 350, 0.3);                                 // the exhale
    if (to === 2) {
      // a drop into still water: the bubble's chirp upward and a tick of splash, two smaller ones after
      const drop = (t0, f, v) => {
        tone(t0, f, v, 0.09, 'sine', f * 2.6);
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
        const g = ctx.createGain(); env(g, [[t0, 0], [t0 + 0.002, v * 0.25], [t0 + 0.03, 0]]);
        noise(t0, 0.03).connect(hp); hp.connect(g); g.connect(bus);
      };
      drop(open, 980, 0.5); drop(open + 0.42, 980 * 1.35, 0.14); drop(open + 0.71, 980 * 1.1, 0.06);
    } else {
      // a singing bowl struck softly: a felt knock, then paired inharmonic partials that beat and fade
      const f = (to === 1 ? 87.31 : 73.42) * 4;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
      const kg = ctx.createGain(); env(kg, [[open, 0], [open + 0.004, 0.25], [open + 0.05, 0]]);
      noise(open, 0.05).connect(lp); lp.connect(kg); kg.connect(bus);
      for (const [r, v, dec] of [[1, 0.16, 7], [2.76, 0.07, 5], [5.4, 0.035, 3.2], [8.9, 0.015, 2]])
        for (const det of [-0.6, 0.6]) tone(open, f * r + det * r, v / 2, dec, 'sine', null, 0.02);
    }
    setTimeout(() => bus.disconnect(), (inT + hold + out + 8) * 1000);
  }

  // ── voices of the works ──────────────────────────────────────────────────
  // Each SOULS piece near the visitor hums its own note (D minor pentatonic,
  // index = artwork number), placed in 3D with a panner. Through a wall the
  // note is muffled by a lowpass; once the work has been seen it quietens.
  // listener: { x, z, yaw }; sources: [{ key, index, x, z, seen, occluded }]
  setArtVoices(listener, sources) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    this.voices = this.voices || new Map();
    const L = ctx.listener;
    const fx = -Math.sin(listener.yaw), fz = -Math.cos(listener.yaw);
    if (L.positionX) {
      L.positionX.setTargetAtTime(listener.x, now, 0.05);
      L.positionY.setTargetAtTime(1.6, now, 0.05);
      L.positionZ.setTargetAtTime(listener.z, now, 0.05);
      L.forwardX.setTargetAtTime(fx, now, 0.05);
      L.forwardY.setTargetAtTime(0, now, 0.05);
      L.forwardZ.setTargetAtTime(fz, now, 0.05);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(listener.x, 1.6, listener.z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
    const wanted = new Set(sources.map(s => s.key));
    for (const [key, v] of this.voices) {
      if (wanted.has(key)) continue;
      v.gain.gain.setTargetAtTime(0, now, 0.4);
      setTimeout(() => { v.oscs.forEach(o => o.stop()); v.out.disconnect(); }, 2500);
      this.voices.delete(key);
    }
    for (const src of sources) {
      let v = this.voices.get(src.key);
      if (!v) v = this._makeVoice(src);
      this.voices.set(src.key, v);
      v.panner.positionX ? (v.panner.positionX.value = src.x, v.panner.positionZ.value = src.z)
        : v.panner.setPosition(src.x, 1.55, src.z);
      v.lp.frequency.setTargetAtTime(src.occluded ? 420 : 2600, now, 0.3);
      const still = 1 + 0.8 * (window.__app?.pace?.slow ?? 0);   // standing still, the works sing louder (pace.js)
      v.gain.gain.setTargetAtTime(this._silenced ? 0 : (src.seen ? 0.022 : 0.06) * still, now, 0.8);
    }
  }

  _makeVoice(src) {
    const ctx = this.ctx;
    const steps = [0, 3, 5, 7, 10];                     // minor pentatonic
    const i = ((src.index % 10) + 10) % 10;
    const f = 146.83 * Math.pow(2, (12 * Math.floor(i / 5) + steps[i % 5]) / 12); // from D3
    const gain = ctx.createGain(); gain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
    panner.refDistance = 1.6; panner.rolloffFactor = 1.1; panner.maxDistance = 40;
    panner.positionY && (panner.positionY.value = 1.55);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2.003;
    const o2g = ctx.createGain(); o2g.gain.value = 0.25;
    // slow tremolo, a different breath for every work
    const trem = ctx.createOscillator(); trem.frequency.value = 0.12 + 0.05 * (src.index % 7);
    const tremG = ctx.createGain(); tremG.gain.value = 0.35;
    const body = ctx.createGain(); body.gain.value = 0.65;
    trem.connect(tremG); tremG.connect(body.gain);
    o1.connect(body); o2.connect(o2g); o2g.connect(body);
    if (!this.voiceBus) { this.voiceBus = ctx.createGain(); this.voiceBus.connect(this.bed); }
    body.connect(gain); gain.connect(lp); lp.connect(panner); panner.connect(this.voiceBus);
    [o1, o2, trem].forEach(o => o.start());
    return { oscs: [o1, o2, trem], gain, lp, panner, out: panner };
  }

  // the music and the places go wobbly (1) or straight again (0)
  // counted, so one shadow leaving does not straighten another's wobble
  wow(on) {
    this._wowN = Math.max(0, (this._wowN || 0) + (on ? 1 : -1));
    if (this._wowDepth) this._wowDepth.gain.setTargetAtTime(this._wowN ? 0.0045 : 0, this.ctx.currentTime, this._wowN ? 0.8 : 1.2);
  }

  // A whisper: breath-like noise swelling and falling, for the souls.
  whisper() {
    captions.say('whisper');
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime, len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1700, t + 2.5); bp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    s.connect(bp); bp.connect(g); g.connect(this.master); s.start(t); s.stop(t + 3);
    this.chime();
  }

  // Television snow: a hiss whose level the caller sets (0 silent .. 1 close).
  tvStatic(level) {
    if (level > 0.3) captions.say('tv', { gap: 30 });
    if (!this.ctx) return;
    if (!this._tvGain) {
      const ctx = this.ctx, len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      this._tvGain = ctx.createGain(); this._tvGain.gain.value = 0;
      src.connect(hp); hp.connect(lp); lp.connect(this._tvGain); this._tvGain.connect(this.master); src.start();
    }
    this._tvGain.gain.setTargetAtTime(this.muted ? 0 : level * 0.05, this.ctx.currentTime, 0.15);
  }

  // Standing at a work (or looking closely at it): its own sound world rises
  // and the corridor falls silent. index: artwork index, or null to leave.
  nearWork(index) {
    if (!this.ctx || index === this._workIndex) return;
    this._workIndex = index;
    const now = this.ctx.currentTime;
    if (this._stopAmbience) { this._stopAmbience(); this._stopAmbience = null; }
    if (index === null || index === undefined) {
      this.bed.gain.setTargetAtTime(1, now, 2.0);    // the corridor comes back gently
      return;
    }
    this.bed.gain.setTargetAtTime(0, now, 1.4);
    this._stopAmbience = startAmbience(this.ctx, this.master, index);
  }

  // Everything else under Alisa's voice (corridor, water, ambience, music): 0..1, eased.
  duckWorld(level) { if (this.master) this.master.gain.setTargetAtTime(level, this.ctx.currentTime, level < 1 ? 0.5 : 1.5); }

  // The music under Alisa's voice: level 0..1, eased.
  duckMusic(level) { if (this.musicDuck) this.musicDuck.gain.setTargetAtTime(level, this.ctx.currentTime, level < 1 ? 0.6 : 1.5); }

  // The music and the crackle follow the zone.
  setZone(zone) {
    this._zone = zone;
    if (!this.ctx || !this.music) return;
    this.music.setZone(zone);
    this.crackleGain.gain.setTargetAtTime((0.011 + (this._speedS || 0) * 0.012) * (zone.fear + 0.4 * zone.memory), this.ctx.currentTime, 0.4);
  }

  // Grandmother's room: the corridor music gives way to the gramophone.
  roomStay() { this.music?.places?.stay(); }
  hush(on) { this._inRoom = !!on; this.music?.room(on); }

  // A presence door gives way for a moment, then slams.
  doorLight(seconds) { this.music?.light(seconds); }

  // The metal door's nightmare: the corridor drains away to almost nothing,
  // and what is left is a low mains hum and a slow heartbeat, close, as if
  // inside the head. The corridor comes back after.
  nightmare(seconds) {
    captions.say('nightmare');
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.bed.gain.setTargetAtTime(0.12, t, 0.35);
    this.bed.gain.setTargetAtTime(1, t + seconds, 0.6);
    const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5, t + 0.8);
    out.gain.setValueAtTime(0.5, t + seconds - 0.3);
    out.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.2);
    out.connect(this.master);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.connect(out);
    for (const [f, type, g] of [[50, 'sine', 0.09], [100, 'sawtooth', 0.025], [150.7, 'triangle', 0.012]]) {   // the hum, a touch out of tune with itself
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(lp);
      o.start(t); o.stop(t + seconds + 0.3);
    }
    for (let at = 0.5; at < seconds - 0.2; at += 0.95) {        // lub-dub
      for (const [d, k] of [[0, 1], [0.22, 0.7]]) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(62, t + at + d); o.frequency.exponentialRampToValueAtTime(38, t + at + d + 0.16);
        const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t + at + d);
        e.gain.exponentialRampToValueAtTime(0.5 * k, t + at + d + 0.015);
        e.gain.exponentialRampToValueAtTime(0.0001, t + at + d + 0.2);
        o.connect(e); e.connect(out); o.start(t + at + d); o.stop(t + at + d + 0.22);
      }
    }
  }
  doorSlam() {
    captions.say('doorSlam');
    this.music?.slam();
    if (!this.ctx || this.muted) return;
    // the wood of it: a hollow knock and a rattle of the latch after
    const ctx = this.ctx, t = ctx.currentTime;
    const len = ctx.sampleRate * 0.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    for (const [at, f, q, v, dur] of [[0, 420, 1.2, 0.55, 0.16], [0.09, 1700, 6, 0.08, 0.05], [0.16, 1900, 6, 0.05, 0.04]]) {
      const s = ctx.createBufferSource(); s.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(v, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      s.connect(bp); bp.connect(g); g.connect(this.master); s.start(t + at); s.stop(t + at + dur + 0.02);
    }
  }

  // Old hinges giving way: a sawtooth whose pitch wanders as the leaf
  // sticks and slips, chopped by the stick-slip itself, through two
  // resonances of the wood.
  doorCreak(seconds = 1.3) {
    captions.say('doorCreak');
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const curve = new Float32Array(40);
    let f = 240 + Math.random() * 60;
    for (let i = 0; i < curve.length; i++) { f = Math.max(150, Math.min(460, f + (Math.random() - 0.4) * 38)); curve[i] = f; }
    o.frequency.setValueCurveAtTime(curve, t, seconds);
    const amp = ctx.createGain(); amp.gain.value = 0.5;
    const slip = ctx.createOscillator(); slip.type = 'square'; slip.frequency.setValueAtTime(22, t); slip.frequency.linearRampToValueAtTime(38, t + seconds);
    const slipG = ctx.createGain(); slipG.gain.value = 0.5;
    slip.connect(slipG); slipG.connect(amp.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.07, t + 0.12);
    env.gain.setValueAtTime(0.07, t + seconds * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    for (const [fr, q] of [[1050, 3], [2500, 5]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q;
      amp.connect(bp); bp.connect(env);
    }
    o.connect(amp); env.connect(this.master);
    o.start(t); slip.start(t); o.stop(t + seconds + 0.05); slip.stop(t + seconds + 0.05);
  }

  // ── the metal door onto the stairwell (#34) ──────────────────────────────
  // The building coming down, heard through a door that only opens for a
  // moment: a low rumble that swells, concrete cracking in bursts, debris
  // clicking as it falls, and a long hiss settling after. All into bed, so
  // muting and the corridor's own levels still hold.
  collapse() {
    captions.say('collapse');
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 3.6;
    const len = ctx.sampleRate * dur, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // the rumble: heavily lowpassed noise, swelling in over 0.4 s
    const rumble = ctx.createBufferSource(); rumble.buffer = buf;
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 80;
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.exponentialRampToValueAtTime(0.5, t + 0.4);
    rg.gain.setValueAtTime(0.5, t + dur - 1.4);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    rumble.connect(rlp); rlp.connect(rg); rg.connect(this.bed);
    rumble.start(t); rumble.stop(t + dur + 0.05);
    // concrete cracking: bandpassed bursts, ticking at random through the hold
    for (let i = 0; i < 14; i++) {
      const at = t + 0.1 + Math.random() * (dur - 0.6);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600 + Math.random() * 1900; bp.Q.value = 3 + Math.random() * 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09 + Math.random() * 0.1, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05 + Math.random() * 0.1);
      s.connect(bp); bp.connect(g); g.connect(this.bed); s.start(at); s.stop(at + 0.2);
    }
    // falling debris: many short decaying clicks
    for (let i = 0; i < 40; i++) {
      const at = t + 0.3 + Math.random() * (dur - 0.8);
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 300 + Math.random() * 2200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.02 + Math.random() * 0.025, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.02 + Math.random() * 0.04);
      o.connect(g); g.connect(this.bed); o.start(at); o.stop(at + 0.08);
    }
    // a long settling hiss, under everything, fading out last
    const hiss = ctx.createBufferSource(); hiss.buffer = buf;
    const hhp = ctx.createBiquadFilter(); hhp.type = 'highpass'; hhp.frequency.value = 2000;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t + 0.5);
    hg.gain.exponentialRampToValueAtTime(0.05, t + 0.9);
    hg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    hiss.connect(hhp); hhp.connect(hg); hg.connect(this.bed);
    hiss.start(t + 0.5); hiss.stop(t + dur + 0.05);
  }

  // The metal door slamming shut: a heavy low thump and a metallic ring.
  slam() {
    captions.say('slam');
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const len = ctx.sampleRate * 0.4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const thump = ctx.createBufferSource(); thump.buffer = buf;
    const tlp = ctx.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 150;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.6, t); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    thump.connect(tlp); tlp.connect(tg); tg.connect(this.bed); thump.start(t); thump.stop(t + 0.24);
    for (const f of [180, 420]) {                        // the metallic ring
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(this.bed); o.start(t); o.stop(t + 0.55);
    }
  }

  // ── the finale: the chord, then silence for the card of questions ────────
  finale() { this.music?.resolve(); }
  silence() {
    this._silenced = true;
    this.music?.release();
    if (this.voices) { const now = this.ctx.currentTime; for (const v of this.voices.values()) v.gain.gain.setTargetAtTime(0, now, 1.2); }
  }
  unsilence() {
    this._silenced = false;
    if (this.ctx) this.out.gain.setTargetAtTime(this.muted ? 0 : 0.9 * (this._volume ?? 1), this.ctx.currentTime, 1.5);
    this.music?.unresolve();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : 0.9 * (this._volume ?? 1), this.ctx.currentTime, 0.1);
  }

  // overall level, 0..1 (gallery mode)
  setVolume(v) {
    this._volume = v;
    if (this.ctx && !this.muted) this.out.gain.setTargetAtTime(0.9 * v, this.ctx.currentTime, 0.1);
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
