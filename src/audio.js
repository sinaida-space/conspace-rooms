import { startAmbience } from './ambience.js';
import { Music } from './music.js';
// Generative audio, zero files: the music (music.js), crackle, footsteps,
// turns, the works' voices, soft chime on demand.
// Init-only — build only after a user gesture (start()), not auto-started.
export class AudioEngine {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    // everything that is "the corridor" (drone, crackle, whisper, footsteps,
    // turns, the works' notes) goes through bed; a work's own sound world
    // goes straight to master, so standing at a work silences the corridor
    this.bed = ctx.createGain(); this.bed.gain.value = 1;
    this.bed.connect(this.master);

    // the music: lo-fi corridors, a gramophone in grandmother's room (music.js)
    this.music = new Music(ctx, this.bed);

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

  // footfall thump/creak, alternating pitch left/right foot for a bit of variety
  step() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this._stepFoot = !this._stepFoot;
    const base = this._stepFoot ? 66 : 61;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = base;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 300; bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(bp); bp.connect(g); g.connect(this.bed);
    o.start(t); o.stop(t + 0.18);
  }

  // subtle whoosh/tick tied to turn rate (rad/s), same shape as motion()
  turn(yawRate) {
    if (!this.ctx || !this.turnFilter || !Number.isFinite(yawRate)) return;
    const s = Math.min(1, Math.abs(yawRate) / 2.2);
    this.turnFilter.frequency.setTargetAtTime(700 + s * 900, this.ctx.currentTime, 0.08);
    this.turnGain.gain.setTargetAtTime(s * 0.02, this.ctx.currentTime, 0.08);
  }

  chime() { // soft bell: root + fifth, long decay
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
      v.gain.gain.setTargetAtTime(src.seen ? 0.022 : 0.06, now, 0.8);
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

  // A whisper: breath-like noise swelling and falling, for the souls.
  whisper() {
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

  // The music and the crackle follow the zone.
  setZone(zone) {
    if (!this.ctx || !this.music) return;
    this.music.setZone(zone);
    this.crackleGain.gain.setTargetAtTime((0.011 + (this._speedS || 0) * 0.012) * (zone.fear + 0.4 * zone.memory), this.ctx.currentTime, 0.4);
  }

  // Grandmother's room: the corridor music gives way to the gramophone.
  hush(on) { this.music?.room(on); }

  // A presence door gives way for a moment, then slams.
  doorLight(seconds) { this.music?.light(seconds); }
  doorSlam() { this.music?.slam(); }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9 * (this._volume ?? 1), this.ctx.currentTime, 0.1);
  }

  // overall level, 0..1 (gallery mode)
  setVolume(v) {
    this._volume = v;
    if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(0.9 * v, this.ctx.currentTime, 0.1);
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
