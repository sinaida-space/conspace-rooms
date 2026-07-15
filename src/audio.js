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

    // drone: detuned saws (a narrow, slightly dissonant cluster instead of a
    // clean fifth) through a slow-breathing lowpass — a beating, haunted bed
    // rather than a warm one.
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass'; this.filter.frequency.value = 170; this.filter.Q.value = 3.2;
    const droneGain = ctx.createGain(); droneGain.gain.value = 0.05;
    for (const f of [54, 54.9, 108.4, 111.2]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(this.filter); o.start();
    }
    this.filter.connect(droneGain); droneGain.connect(this.master);
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
    whisper.connect(whisperGain); whisperGain.connect(this.master);
    whisper.start(); whisperLfo.start();

    // crackle bed: looping filtered noise + random pops
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
    this.crackleGain = ctx.createGain(); this.crackleGain.gain.value = 0.011;
    noise.connect(bp); bp.connect(this.crackleGain); this.crackleGain.connect(this.master);
    noise.start();
    this._popTimer = setInterval(() => this._pop(), 400);

    // turn whoosh: same noise buffer, bandpassed and swept by turn()
    const turnNoise = ctx.createBufferSource(); turnNoise.buffer = buf; turnNoise.loop = true;
    this.turnFilter = ctx.createBiquadFilter(); this.turnFilter.type = 'bandpass'; this.turnFilter.frequency.value = 700; this.turnFilter.Q.value = 1.4;
    this.turnGain = ctx.createGain(); this.turnGain.gain.value = 0;
    turnNoise.connect(this.turnFilter); this.turnFilter.connect(this.turnGain); this.turnGain.connect(this.master);
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
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.09);
  }

  // motion speed 0..~8 → drone opens up, crackle rises slightly
  motion(speed) {
    if (!this.ctx) return;
    const s = Math.min(1, Math.abs(speed) / 8);
    this.filter.frequency.setTargetAtTime(190 + s * 620, this.ctx.currentTime, 0.4);
    this.crackleGain.gain.setTargetAtTime(0.011 + s * 0.012, this.ctx.currentTime, 0.4);
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
    o.connect(bp); bp.connect(g); g.connect(this.master);
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

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }
}
