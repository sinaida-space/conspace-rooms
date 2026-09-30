// ── conspace-rooms · places.js ──────────────────────────────────────────────
// The sounds of the places, under the music, one set for each stage and
// faded by the zone weights. Everything is synthesized; no voices.
//   fear      the hospital: fluorescent tubes humming overhead, now and then
//             one of them flickering, and water dripping somewhere far off
//   memory    grandmother's flat: a wall clock ticking, a cuckoo now and then,
//             and once in a long while a kettle coming to the boil
//   light     open air: a slow wind and birds calling

const TICK = 1.0;                  // seconds between the clock's ticks

export class Places {
  constructor(ctx, out, verb) {
    this.ctx = ctx;
    const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.bus = g(1); this.bus.connect(out);
    this.fear = g(0); this.memory = g(0); this.light = g(0);
    for (const b of [this.fear, this.memory, this.light]) b.connect(this.bus);
    this.verb = g(0.5); this.verb.connect(verb);
    this.fear.connect(this.verb);

    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;

    // the tubes: mains hum and its buzz, a slow unevenness
    const hum = g(0.006);
    const hbp = ctx.createBiquadFilter(); hbp.type = 'bandpass'; hbp.frequency.value = 200; hbp.Q.value = 3;
    hbp.connect(hum); hum.connect(this.fear);
    for (const [f, type] of [[100, 'sawtooth'], [200.4, 'square']]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(hbp); o.start(); }
    this._lfo(0.13, 0.002, hum.gain);

    // the wind: noise under a lowpass that wanders, rising and falling
    const w = ctx.createBufferSource(); w.buffer = buf; w.loop = true;
    const wlp = ctx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 480; wlp.Q.value = 0.8;
    const wg = g(0.035); w.connect(wlp); wlp.connect(wg); wg.connect(this.light); w.start();
    this._lfo(0.06, 300, wlp.frequency); this._lfo(0.09, 0.022, wg.gain);

    const now = ctx.currentTime;
    this._t = { drip: now + 3, flicker: now + 20, tick: now + 1, cuckoo: now + 60 + Math.random() * 60, kettle: now + 120 + Math.random() * 120, bird: now + 2 };
    this._tock = false;
  }

  _lfo(freq, depth, param) {
    const o = this.ctx.createOscillator(); o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = depth;
    o.connect(g); g.connect(param); o.start();
  }

  setZone(z) {
    const t = this.ctx.currentTime;
    this.fear.gain.setTargetAtTime(z.fear, t, 1.5);
    this.memory.gain.setTargetAtTime(z.memory, t, 1.5);
    this.light.gain.setTargetAtTime(z.accept, t, 1.5);
    this._zone = z;
  }
  // the finale takes everything down; after it, back up
  fade(to, tc) { this.bus.gain.setTargetAtTime(to, this.ctx.currentTime, tc); }

  // schedule what falls before `until`; a stage that cannot be heard only keeps time
  tick(until) {
    const z = this._zone || { fear: 1, memory: 0, accept: 0 }, T = this._t;
    while (T.drip < until) { if (z.fear > 0.05) this._drip(T.drip); T.drip += 2 + Math.random() * 6; }
    while (T.flicker < until) { if (z.fear > 0.05) this._flicker(T.flicker); T.flicker += 25 + Math.random() * 40; }
    while (T.tick < until) { if (z.memory > 0.05) this._tick(T.tick); T.tick += TICK; }
    while (T.cuckoo < until) { if (z.memory > 0.05) this._cuckoo(T.cuckoo); T.cuckoo += 90 + Math.random() * 90; }
    while (T.kettle < until) { if (z.memory > 0.05) this._kettle(T.kettle); T.kettle += 180 + Math.random() * 120; }
    while (T.bird < until) { if (z.accept > 0.05) this._bird(T.bird); T.bird += 1.5 + Math.random() * 4; }
  }

  _env(t, vel, attack, len) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    return g;
  }
  _noiseBurst(t, vel, type, freq, q, len, dest) {
    const s = this.ctx.createBufferSource(); s.buffer = this._noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this._env(t, vel, 0.002, len);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + len + 0.02);
  }
  _tone(t, f0, f1, vel, attack, len, dest, type = 'sine') {
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = this._env(t, vel, attack, len);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + len + 0.02);
  }

  // a drop far off: a tick, then a small rising bubble, mostly echo
  _drip(t) {
    const f = 900 + Math.random() * 900;
    this._noiseBurst(t, 0.01, 'highpass', 3000, 0.7, 0.01, this.verb);
    this._tone(t + 0.004, f, f * 1.9, 0.012, 0.002, 0.06, this.verb);
  }
  // a tube stuttering: the hum breaks into clicks for a moment
  _flicker(t) {
    for (let k = 0; k < 3 + Math.floor(Math.random() * 5); k++) this._noiseBurst(t + k * (0.04 + Math.random() * 0.08), 0.02, 'bandpass', 2200, 1.2, 0.02, this.fear);
  }
  // tick and tock, a little apart in pitch
  _tick(t) {
    this._tock = !this._tock;
    this._noiseBurst(t, 0.03, 'bandpass', this._tock ? 2400 : 3100, 4, 0.025, this.memory);
  }
  // the little door opens: two notes a third apart, twice
  _cuckoo(t) {
    for (let k = 0; k < 2; k++) {
      const at = t + k * 0.9;
      this._tone(at, 659, 650, 0.02, 0.02, 0.28, this.memory, 'triangle');
      this._tone(at + 0.32, 523, 515, 0.02, 0.02, 0.4, this.memory, 'triangle');
    }
  }
  // the kettle: a rumble, then a whistle climbing into its note and cut off
  _kettle(t) {
    this._noiseBurstLong(t, 5, 0.01);
    this._tone(t + 3, 1500, 2300, 0.006, 1.8, 4, this.memory);
  }
  _noiseBurstLong(t, len, vel) {
    const s = this.ctx.createBufferSource(); s.buffer = this._noise; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1200, t + len);
    const g = this._env(t, vel, len * 0.7, len);
    s.connect(f); f.connect(g); g.connect(this.memory); s.start(t); s.stop(t + len + 0.02);
  }
  // a bird: a few quick upward chirps, somewhere to one side
  _bird(t) {
    const pan = this.ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(this.light);
    const base = 2600 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) this._tone(t + k * (0.09 + Math.random() * 0.05), base, base * (1.3 + Math.random() * 0.4), 0.008, 0.005, 0.07, pan);
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
