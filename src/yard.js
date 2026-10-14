// ── conspace-rooms · yard.js ────────────────────────────────────────────────
// The courtyard outside the light's windows (#94): a swing creaking, a ball on
// the asphalt, sparrows, someone beating a carpet, a tram going by with its
// bell. Life going on outside, by day, heard only while passing a window.
// These are the piece's only recorded sounds besides Alisa's voice: short
// CC0 clips from Freesound (see tech.html), loaded the first time the light
// asks for them. One mono strand: the nearest window decides how loud it is,
// how open (a closed pane takes the top off) and from which side.

import { captions } from './captions.js';

const CLIPS = { swing: 'swing', ball: 'ball', tram: 'tram', bell: 'bell', carpet: 'carpet', sparrowsA: 'sparrows-a', sparrowsB: 'sparrows-b' };
const HEAR = 8;                    // m: further from a window the yard is gone
// each event: how often (seconds between, min and spread), how long a slice, how loud
const EVENTS = {
  sparrows: { every: [3, 4], len: [8, 6], gain: 0.55 },
  swing: { every: [10, 14], len: [6, 6], gain: 0.4 },
  ball: { every: [12, 16], len: [3, 4], gain: 0.35 },
  carpet: { every: [28, 30], len: [5, 4], gain: 0.3 },
  tram: { every: [45, 40], len: [5.4, 0], gain: 0.28 },
};

export class Yard {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.buf = null;
    this._loading = false;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 900;
    this.pan = ctx.createStereoPanner();
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.lp.connect(this.pan); this.pan.connect(this.gain); this.gain.connect(out);
    this.near = 0;
    const now = ctx.currentTime;
    this._t = Object.fromEntries(Object.keys(EVENTS).map(k => [k, now + Math.random() * EVENTS[k].every[0]]));
  }

  _load() {
    if (this._loading) return;
    this._loading = true;
    Promise.all(Object.entries(CLIPS).map(([k, f]) => fetch(`assets/sounds/yard/${f}.mp3`)
      .then(r => r.arrayBuffer()).then(a => this.ctx.decodeAudioData(a)).then(b => [k, b])))
      .then(list => { this.buf = Object.fromEntries(list); })
      .catch(() => { this._loading = false; });      // offline or refused: try again next time the light asks
  }

  // dist: metres to the nearest window of the light (Infinity: none); dx, dz:
  // toward it; yaw: where the visitor looks
  update(dist, dx, dz, yaw) {
    const t = this.ctx.currentTime;
    const k = dist < HEAR ? Math.min(1, (HEAR - dist) / (HEAR - 1.5)) : 0;
    this.near = k * k * (3 - 2 * k);
    if (this.near > 0 && !this.buf) this._load();
    this.gain.gain.setTargetAtTime(0.9 * this.near, t, 0.6);
    this.lp.frequency.setTargetAtTime(900 + 6000 * this.near * this.near, t, 0.6);
    const d = Math.max(0.5, Math.hypot(dx, dz));
    if (isFinite(d)) this.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d)), t, 0.4);
  }

  // schedule the yard's events that fall before `until`; far from any window they only keep time
  tick(until) {
    for (const [name, e] of Object.entries(EVENTS)) {
      while (this._t[name] < until) {
        if (this.buf && this.near > 0.05) this._play(name, this._t[name], e);
        this._t[name] += e.every[0] + Math.random() * e.every[1];
      }
    }
  }

  _play(name, t, e) {
    const ctx = this.ctx;
    const clip = name === 'sparrows' ? (Math.random() < 0.5 ? 'sparrowsA' : 'sparrowsB') : name;
    const b = this.buf[clip], len = Math.min(b.duration, e.len[0] + Math.random() * e.len[1]);
    const off = Math.random() * Math.max(0, b.duration - len);
    const s = ctx.createBufferSource(); s.buffer = b;
    s.playbackRate.value = 0.96 + Math.random() * 0.08;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(e.gain, t + 0.4);
    g.gain.setValueAtTime(e.gain, t + len - 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(g); g.connect(this.lp);
    s.start(t, off, len);
    if (name === 'tram' && this.buf.bell) {                // the tram rings as it goes
      const bs = ctx.createBufferSource(); bs.buffer = this.buf.bell;
      const bg = ctx.createGain(); bg.gain.value = e.gain * 0.8;
      bs.connect(bg); bg.connect(this.lp); bs.start(t + 1 + Math.random() * 2);
    }
    if (name !== 'sparrows') captions.say('yard_' + name, { at: t, gap: 40 });
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
