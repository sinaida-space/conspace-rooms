// The way on, by ear. Once a portal is summoned it calls from where it
// stands, in 3D (HRTF), so headphones can follow it through the labyrinth.
// The sound does not come through the walls: it sits a few cells ahead on
// the walked route to the portal, so it turns round the corners the way the
// visitor must, and grows as the route shortens.
//
//   fear      a valve radio being tuned: static swept by a slow dial, the
//             whistle between stations, the six pips of the time signal,
//             now and then a murmur of a voice far away
//   memory    a wind-up music box with a little waltz in A minor (the waltz
//             that comes back at the very end), slack and slow far from the
//             portal, wound tight near it; under it the clack of a
//             filmstrip projector turning to the next frame, and its fan
//
// A recording in assets/sounds/beacons/ (radio, musicbox, projector: .mp3)
// replaces the synthesised voice of that part when it is there; without
// them it is all made here, and nothing is lost.

const FILES = { radio: 'assets/sounds/beacons/radio.mp3', musicbox: 'assets/sounds/beacons/musicbox.mp3', projector: 'assets/sounds/beacons/projector.mp3' };
const NEAR = 4, FAR = 60;                     // metres of route: full voice, and nothing beyond
// the box's waltz, an original tune: [midi, beats], 3/4
const TUNE = [[69, 1], [72, 1], [76, 1], [74, 1], [72, 1], [71, 1], [72, 1], [69, 1], [64, 1], [69, 3],
  [67, 1], [71, 1], [74, 1], [72, 1], [71, 1], [69, 1], [71, 1], [68, 1], [64, 1], [69, 3]];

export function createBeacon(audio) {
  let ctx = null, out = null, panner = null, lp = null, kind = null, level = 0, wind = 1;
  const parts = [];                              // what is playing, to stop on a change of kind
  const samples = {};                            // decoded recordings, or false when absent
  let noiseBuf = null, timer = null;

  const freq = m => 440 * Math.pow(2, (m - 69) / 12);
  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  async function sample(name) {
    if (name in samples) return samples[name];
    samples[name] = false;
    try {
      const r = await fetch(FILES[name]);
      if (r.ok) samples[name] = await ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { /* no recording: the synthesised voice stays */ }
    return samples[name];
  }

  function ensure() {
    if (ctx || !audio.ctx) return !!ctx;
    ctx = audio.ctx;
    out = ctx.createGain(); out.gain.value = 0;
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
    panner = ctx.createPanner();
    panner.panningModel = 'HRTF'; panner.distanceModel = 'linear';
    panner.refDistance = 1; panner.maxDistance = 1000; panner.rolloffFactor = 0;   // distance is the route's, set by hand below
    panner.positionY && (panner.positionY.value = 1.4);
    out.connect(lp); lp.connect(panner); panner.connect(audio.bed);
    return true;
  }

  function stop() {
    clearTimeout(timer); timer = null;
    for (const p of parts.splice(0)) { try { p.stop?.(); } catch (e) {} p.disconnect?.(); }
  }

  // ── fear: the radio ─────────────────────────────────────────────────────
  async function radio() {
    const rec = await sample('radio');
    if (kind !== 'radio') return;
    const src = ctx.createBufferSource(); src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
    const g = ctx.createGain();
    if (rec) { src.buffer = rec; g.gain.value = 0.5; bp.frequency.value = 1800; bp.Q.value = 0.5; }
    else { src.buffer = noise(); g.gain.value = 0.16; bp.frequency.value = 1400; }
    src.connect(bp); bp.connect(g); g.connect(out); src.start();
    // the whistle between stations, its pitch the dial's distance to the next
    const wh = ctx.createOscillator(); wh.type = 'sine'; wh.frequency.value = 900;
    const whg = ctx.createGain(); whg.gain.value = 0;
    wh.connect(whg); whg.connect(out); wh.start();
    parts.push(src, bp, g, wh, whg);
    const dial = () => {
      if (kind !== 'radio') return;
      const t = ctx.currentTime, L = 2.5 + Math.random() * 3;
      const f0 = 600 + Math.random() * 2400, f1 = 600 + Math.random() * 2400;
      bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + L);
      const station = Math.random() < 0.45;
      whg.gain.setValueAtTime(0, t);
      whg.gain.linearRampToValueAtTime(rec ? 0.004 : 0.012, t + L * 0.3);
      whg.gain.linearRampToValueAtTime(0, t + L * (station ? 0.6 : 1));
      wh.frequency.setValueAtTime(1600 + Math.random() * 900, t);
      wh.frequency.exponentialRampToValueAtTime(120 + Math.random() * 200, t + L * 0.6);
      if (station && !rec) (Math.random() < 0.4 ? pips : murmur)(t + L * 0.6);
      timer = setTimeout(dial, L * 1000 + (station ? 2600 : 0));
    };
    dial();
  }
  // six short pips at 1 kHz, the last one long: the hour on the radio
  function pips(t0) {
    for (let k = 0; k < 6; k++) {
      const o = ctx.createOscillator(); o.frequency.value = 1000;
      const g = ctx.createGain(), t = t0 + k, len = k === 5 ? 0.5 : 0.1;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.005);
      g.gain.setValueAtTime(0.05, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.01);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.05);
    }
  }
  // a voice too far to make out: noise through two moving formants, in syllables
  function murmur(t0) {
    const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 9;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 12;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f1); src.connect(f2); f1.connect(g); f2.connect(g); g.connect(out);
    const L = 2 + Math.random() * 1.5;
    for (let t = t0; t < t0 + L; t += 0.14 + Math.random() * 0.12) {
      f1.frequency.setValueAtTime(300 + Math.random() * 500, t);
      f2.frequency.setValueAtTime(900 + Math.random() * 1400, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.4, t + 0.03); g.gain.linearRampToValueAtTime(0.05, t + 0.12);
    }
    g.gain.linearRampToValueAtTime(0, t0 + L + 0.1);
    src.start(t0); src.stop(t0 + L + 0.2);
  }

  // ── memory: the music box and the filmstrip projector ───────────────────
  async function memory() {
    const [box, proj] = await Promise.all([sample('musicbox'), sample('projector')]);
    if (kind !== 'memory') return;
    // the projector's fan: a low hum under everything
    let fan;
    if (proj) { fan = ctx.createBufferSource(); fan.buffer = proj; fan.loop = true; }
    else {
      fan = ctx.createBufferSource(); fan.buffer = noise(); fan.loop = true;
      const lo = ctx.createBiquadFilter(); lo.type = 'lowpass'; lo.frequency.value = 220;
      fan.connect(lo); parts.push(lo); fan = Object.assign(fan, { tap: lo });
    }
    const fg = ctx.createGain(); fg.gain.value = proj ? 0.35 : 0.09;
    (fan.tap || fan).connect(fg); fg.connect(out); fan.start(); parts.push(fan, fg);
    if (box) {                                    // a recording: its rate follows the spring
      const s = ctx.createBufferSource(); s.buffer = box; s.loop = true;
      const g = ctx.createGain(); g.gain.value = 0.6; s.connect(g); g.connect(out); s.start(); parts.push(s, g);
      const tick = () => { if (kind !== 'memory') return; s.playbackRate.setTargetAtTime(0.6 + 0.4 * wind, ctx.currentTime, 0.5); timer = setTimeout(tick, 400); };
      tick();
      return;
    }
    let n = 0, at = ctx.currentTime + 0.2, frames = 0;
    const step = () => {
      if (kind !== 'memory') return;
      // the spring: far from the portal the box is slack, slow and flat
      const beat = 0.42 / (0.55 + 0.45 * wind), sag = Math.pow(0.97, 1 - wind);
      while (at < ctx.currentTime + 0.6) {
        const [m, b] = TUNE[n % TUNE.length];
        tine(freq(m) * sag, at, 0.11);
        if (n % TUNE.length === 0) tine(freq(m - 24) * sag, at, 0.06);     // the low comb at the top of the tune
        at += b * beat; n++;
        if (n % 10 === 0 && ++frames) clack(at - beat * 0.5);              // a frame turns every phrase
      }
      timer = setTimeout(step, 200);
    };
    step();
  }
  // a comb's tooth: a bright fundamental and its stiff, inharmonic overtone, quickly dying
  function tine(f, t, v) {
    for (const [mul, a, d] of [[1, v, 1.6], [5.4, v * 0.18, 0.35], [2.0, v * 0.12, 0.6]]) {
      const o = ctx.createOscillator(); o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.003); g.gain.exponentialRampToValueAtTime(1e-4, t + d);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05);
    }
  }
  // the filmstrip pulled on by a frame: a dry clack and a thump
  function clack(t) {
    const s = ctx.createBufferSource(); s.buffer = noise();
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2400; hp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.05);
    g.gain.setValueAtTime(0.14, t + 0.09); g.gain.exponentialRampToValueAtTime(1e-4, t + 0.14);
    s.connect(hp); hp.connect(g); g.connect(out); s.start(t); s.stop(t + 0.2);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.12, t); og.gain.exponentialRampToValueAtTime(1e-4, t + 0.1);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.12);
  }

  return {
    // stage: 0 fear, 1 memory, other: silent · at: where the call comes from
    // (a cell on the route a few metres ahead, or the portal itself) ·
    // route: metres of walking left · seen: whether the portal is in plain view
    update(stage, at, route, seen) {
      if (!ensure()) return;
      const want = at && (stage === 0 || stage === 1) && !audio.muted ? (stage === 0 ? 'radio' : 'memory') : null;
      if (want !== kind) { stop(); kind = want; if (kind === 'radio') radio(); else if (kind === 'memory') memory(); }
      const now = ctx.currentTime;
      if (!kind) { out.gain.setTargetAtTime(0, now, 0.4); return; }
      const k = Math.max(0, Math.min(1, (FAR - route) / (FAR - NEAR)));
      wind = k;
      level = 0.05 + 0.6 * k * k;
      out.gain.setTargetAtTime(audio._silenced ? 0 : level, now, 0.5);
      lp.frequency.setTargetAtTime(seen ? 6000 : 1200 + 3000 * k, now, 0.4);   // round a corner it comes muffled
      if (panner.positionX) { panner.positionX.setTargetAtTime(at.x, now, 0.3); panner.positionZ.setTargetAtTime(at.z, now, 0.3); }
      else panner.setPosition(at.x, 1.4, at.z);
    },
    stop() { stop(); kind = null; if (out) out.gain.value = 0; },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
