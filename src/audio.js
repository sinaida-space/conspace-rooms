import { startAmbience } from './ambience.js';
// Generative audio, zero files: low drone bed + crackle, motion-reactive
// filter, soft chime on demand.
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

    // drone: detuned saws (a narrow, slightly dissonant cluster instead of a
    // clean fifth) through a slow-breathing lowpass — a beating, haunted bed
    // rather than a warm one.
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass'; this.filter.frequency.value = 170; this.filter.Q.value = 3.2;
    const droneGain = this.droneGain = ctx.createGain(); droneGain.gain.value = 0.05;
    for (const f of [54, 54.9, 108.4, 111.2]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(this.filter); o.start();
    }
    this.filter.connect(droneGain); droneGain.connect(this.bed);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 80;
    lfo.connect(lfoGain); lfoGain.connect(this.filter.frequency); lfo.start();

    // a far-off, very quiet high whisper tone that slowly drifts — reads as
    // an unplaceable voice rather than a musical element
    const whisper = ctx.createOscillator(); whisper.type = 'sine'; whisper.frequency.value = 1180;
    const whisperGain = ctx.createGain(); whisperGain.gain.value = 0;
    const whisperLfo = ctx.createOscillator(); whisperLfo.frequency.value = 0.017;
    const whisperLfoGain = ctx.createGain(); whisperLfoGain.gain.value = 0.006;
    whisperLfo.connect(whisperLfoGain); whisperLfoGain.connect(whisperGain.gain);
    whisperGain.gain.value = 0.006;
    whisper.connect(whisperGain); whisperGain.connect(this.bed);
    whisper.start(); whisperLfo.start();

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

  // motion speed 0..~8 → drone opens up, crackle rises slightly
  motion(speed) {
    if (!this.ctx) return;
    const s = Math.min(1, Math.abs(speed) / 8);
    this.filter.frequency.setTargetAtTime(190 + s * 620, this.ctx.currentTime, 0.4);
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
    if (!this.ctx || !this.turnFilter) return;
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

  // Standing at a work (or looking closely at it): its own sound world rises
  // and the corridor falls silent. index: artwork index, or null to leave.
  nearWork(index) {
    if (!this.ctx || index === this._workIndex) return;
    this._workIndex = index;
    const now = this.ctx.currentTime;
    if (this._stopAmbience) { this._stopAmbience(); this._stopAmbience = null; }
    if (index === null || index === undefined) {
      this.bed.gain.setTargetAtTime(1, now, 0.8);
      return;
    }
    this.bed.gain.setTargetAtTime(0, now, 0.4);
    this._stopAmbience = startAmbience(this.ctx, this.master, index);
  }

  // The bed follows the zone: harsh in fear, softer in memory, almost gone in
  // acceptance. hush() silences it entirely (grandmother's kitchen).
  setZone(zone) {
    if (!this.ctx || !this.droneGain) return;
    this._zoneLevel = 0.05 * (zone.fear + 0.55 * zone.memory + 0.18 * zone.accept);
    const target = this._hushed ? 0 : this._zoneLevel;
    this.droneGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.6);
    this.crackleGain.gain.setTargetAtTime(this._hushed ? 0 : (0.011 + (this._speedS || 0) * 0.012) * (zone.fear + 0.4 * zone.memory), this.ctx.currentTime, 0.4);
  }

  hush(on) {
    this._hushed = on;
    if (!this.ctx || !this.droneGain) return;
    this.droneGain.gain.setTargetAtTime(on ? 0 : (this._zoneLevel ?? 0.05), this.ctx.currentTime, on ? 1.2 : 2.0);
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
