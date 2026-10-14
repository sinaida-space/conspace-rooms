// ── conspace-rooms · waterSound.js ──────────────────────────────────────────
// The flooded acceptance stage: a distant surf that breathes with the tide,
// drips with the echo of an empty room, and the wet counterpart of a
// footfall. audio.js owns ctx/bed/mute state and hands it in here; this file
// only builds and plays nodes, no app state.

let NOISE = null;
function noiseBuffer(ctx) {
  if (NOISE && NOISE.sampleRate === ctx.sampleRate) return NOISE;
  const len = ctx.sampleRate * 2;
  NOISE = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = NOISE.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return NOISE;
}

export class WaterSound {
  constructor(ctx, bed) {
    this.ctx = ctx; this.bed = bed;
    this._lastTide = 0;
    this._wanderPhase = Math.random() * 10;
    this._stepFoot = false;
    this._waterLevel = 0;
  }

  // a short feedback-delay send: the echo of an empty flooded room,
  // shared by every drip, built once on first use
  _room() {
    if (this._roomSend) return this._roomSend;
    const ctx = this.ctx;
    const send = ctx.createGain(); send.gain.value = 0.55;
    const out = ctx.createGain(); out.gain.value = 0.3;
    for (const ms of [0.07, 0.11]) {
      const dl = ctx.createDelay(0.2); dl.delayTime.value = ms;
      const fb = ctx.createGain(); fb.gain.value = 0.3;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500;
      send.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(out);
    }
    out.connect(this.bed);
    this._roomSend = send;
    return send;
  }

  // two noise beds (reusing the same buffer): a low swell and a higher hiss,
  // gains driven every frame by setWater()
  _buildSurf() {
    const ctx = this.ctx;
    const mk = (f, q) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx); s.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f; lp.Q.value = q;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 80;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(lp); lp.connect(hp); hp.connect(g); g.connect(this.bed);
      s.start();
      return { g };
    };
    this._surf = { swell: mk(400, 0.8), hiss: mk(900, 0.6) };
  }

  // called every frame by audio.js's setWater(); level 0 keeps the surf at 0
  setWater(level, tide, muted) {
    if (!this.ctx) return;
    this._waterLevel = level;
    if (level > 0.01 && !this._surf) this._buildSurf();
    if (!this._surf) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const amt = Math.min(1, level / 0.15); // fades in with the stage's progress
    const dTide = tide - this._lastTide; this._lastTide = tide;
    this._wanderPhase += 0.004 + Math.random() * 0.003; // no two waves alike
    const wander = 0.82 + 0.18 * Math.sin(this._wanderPhase);
    const swellAmt = (tide + 1) / 2; // 0 low tide .. 1 high tide
    const drawing = dTide < -0.0003; // the water pulling back
    const gSwell = muted ? 0 : amt * 0.035 * (0.35 + 0.65 * swellAmt) * wander;
    const gHiss = muted ? 0 : amt * 0.022 * (drawing ? 0.5 + Math.min(1, -dTide * 500) : 0.12) * wander;
    this._surf.swell.g.gain.setTargetAtTime(gSwell, now, 0.7);
    this._surf.hiss.g.gain.setTargetAtTime(gHiss, now, drawing ? 1.6 : 0.5); // longer hiss on the draw-back
  }

  // one drip: a 5 ms noise tick, then a rising bubble sine, panned by
  // direction and sent into the room echo. dx/dz/dist: direction & distance
  // from the listener (world units); yaw: listener facing, for the pan.
  drip(dx, dz, dist, yaw) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const d = Math.max(0.3, dist ?? 1);
    const rx = Math.cos(yaw || 0), rz = -Math.sin(yaw || 0);
    const ux = dx / d, uz = dz / d;
    const pan = Math.max(-1, Math.min(1, ux * rx + uz * rz));
    const level = 1 / (1 + d / 3);

    const panner = ctx.createStereoPanner(); panner.pan.value = pan;
    const out = ctx.createGain(); out.gain.value = level;
    panner.connect(out); out.connect(this.bed); out.connect(this._room());

    // the tick: a 5 ms grain of noise
    const tick = ctx.createBufferSource(); tick.buffer = noiseBuffer(ctx);
    const tickBp = ctx.createBiquadFilter(); tickBp.type = 'bandpass'; tickBp.frequency.value = 3000; tickBp.Q.value = 2;
    const tickG = ctx.createGain();
    tickG.gain.setValueAtTime(0.4, t); tickG.gain.exponentialRampToValueAtTime(0.0001, t + 0.005);
    tick.connect(tickBp); tickBp.connect(tickG); tickG.connect(panner);
    tick.start(t); tick.stop(t + 0.02);

    // the bubble: resonance rising quickly, fast attack, short decay
    const f0 = 600 + Math.random() * 800;
    const rise = 1.5 + Math.random() * 0.5;
    const dur = 0.04 + Math.random() * 0.04;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * rise, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(og); og.connect(panner);
    o.start(t); o.stop(t + dur + 0.1);
  }

  // the wet footfall: a slosh (noise swept through a falling bandpass), a
  // muffled thump underneath, and a couple of droplet ticks after.
  // running: bool, louder and busier splash. dripFn: audio.js's drip(),
  // called after a delay so the ticks land with real 3D placement.
  step(running, dripFn) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this._stepFoot = !this._stepFoot;
    const depth = Math.min(1, Math.max(0, (this._waterLevel - 0.03) / 0.12)); // 0..1 across the stage
    const dur = (0.1 + depth * 0.06) * (running ? 0.85 : 1);
    const f0 = 1800 - depth * 300, f1 = Math.max(200, (600 - depth * 150) * (running ? 0.9 : 1));

    // the slosh
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
    const sg = ctx.createGain();
    const peak = (running ? 0.09 : 0.045) * (0.7 + depth * 0.6);
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(sg); sg.connect(this.bed);
    s.start(t); s.stop(t + dur + 0.02);

    // the muffled thump: today's dry step, half gain, a touch lower with depth
    const base = (this._stepFoot ? 66 : 61) * (1 - depth * 0.1);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = base;
    const tbp = ctx.createBiquadFilter(); tbp.type = 'bandpass'; tbp.frequency.value = 260; tbp.Q.value = 1.1;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.exponentialRampToValueAtTime(0.025, t + 0.008);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(tbp); tbp.connect(tg); tg.connect(this.bed);
    o.start(t); o.stop(t + 0.18);

    // droplet ticks after, a few more when running
    if (typeof dripFn !== 'function') return;
    const n = running ? 2 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const at = 30 + Math.random() * 90;
      const ang = (Math.random() - 0.5) * 1.4;
      setTimeout(() => dripFn(Math.sin(ang), Math.cos(ang), 0.5 + Math.random() * 0.5), at);
    }
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
