// ── conspace-rooms · ambience.js ────────────────────────────────────────────
// A sound world for each SOULS piece, heard while you look at it closely
// (inspect). Everything is synthesized: filtered noise, a few oscillators,
// events scheduled on timers. startAmbience() returns a stop function that
// fades it out and releases every node.
//
//  01 The Last Word      a slow clock            10 Dawn                  birdsong
//  02 Childhood          a music box             11 Shine                 a warm glowing chord
//  03 Movement           wind                    12 Lomo                  projector whirr, shutter
//  04 Public Opinion     a murmuring crowd       13 Guard Your Freedom    sea waves
//  05 Freedom            wind and birds          14 Place                 drips in an empty room
//  06 I Am Waiting       rain on a window        15 We Are a Polyhedron   glass chimes
//  07 Remembrance        vinyl crackle, hum      16 Limitation            a buzzing tube
//  08 Fears              a heartbeat             17 Pain                  a heart monitor
//  09 Just Keep Fighting fire crackling          18 Promise               a distant bell

let NOISE = null;
function noise(ctx) {
  if (NOISE && NOISE.sampleRate === ctx.sampleRate) return NOISE;
  const len = ctx.sampleRate * 3;
  NOISE = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = NOISE.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return NOISE;
}

export function startAmbience(ctx, dest, index) {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
  out.connect(dest);
  const nodes = [], timers = [];
  const keep = n => { nodes.push(n); return n; };
  const every = (ms, fn, jitter = 0) => {
    const tick = () => { fn(); timers.push(setTimeout(tick, ms + Math.random() * jitter)); };
    timers.push(setTimeout(tick, Math.random() * ms));
  };

  // building blocks
  const noiseSrc = () => { const s = keep(ctx.createBufferSource()); s.buffer = noise(ctx); s.loop = true; s.start(); return s; };
  const filter = (type, f, q = 0.7) => { const b = keep(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = v => { const g = keep(ctx.createGain()); g.gain.value = v; return g; };
  const lfo = (rate, depth, target) => { const o = keep(ctx.createOscillator()); o.frequency.value = rate; const g = gain(depth); o.connect(g); g.connect(target); o.start(); return o; };
  const bed = (type, f, level, q) => { const n = noiseSrc(), b = filter(type, f, q), g = gain(level); n.connect(b); b.connect(g); g.connect(out); return { b, g }; };
  // a short enveloped tone
  const tone = (f, dur, level, type = 'sine', attack = 0.005) => {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  };
  // a short burst of filtered noise (drops, crackles, ticks)
  const burst = (f, dur, level, type = 'bandpass', q = 1) => {
    const t = ctx.currentTime, s = ctx.createBufferSource(), b = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise(ctx); b.type = type; b.frequency.value = f; b.Q.value = q;
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(b); b.connect(g); g.connect(out); s.start(t, Math.random() * 2); s.stop(t + dur + 0.02);
  };
  const chirp = (f0, f1, dur, level) => {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  };
  const birds = (rate) => every(rate, () => {
    const base = 2200 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) timers.push(setTimeout(() => chirp(base * (1 + Math.random() * 0.3), base * (0.7 + Math.random() * 0.6), 0.06 + Math.random() * 0.08, 0.05), k * 110));
  }, rate);
  const wind = (level) => { const w = bed('lowpass', 500, level, 0.9); lfo(0.07, 350, w.b.frequency); lfo(0.11, level * 0.7, w.g.gain); };
  const pentatonic = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

  switch (index % 18) {
    case 0: // The Last Word: a slow clock in a quiet room
      bed('lowpass', 180, 0.02);
      every(1000, () => burst(2600 + Math.random() * 400, 0.03, 0.25, 'bandpass', 6));
      break;
    case 1: // Childhood: a music box, slightly out of tune
      every(420, () => { if (Math.random() < 0.85) tone(pentatonic[Math.floor(Math.random() * 7)] * (1 + (Math.random() - 0.5) * 0.01), 1.6, 0.07, 'triangle'); }, 200);
      break;
    case 2: wind(0.09); break; // Movement
    case 3: { // Public Opinion: a crowd murmur, voices without words
      for (let k = 0; k < 4; k++) { const v = bed('bandpass', 350 + k * 180, 0.035, 3); lfo(1.5 + Math.random() * 3, 0.03, v.g.gain); }
      break;
    }
    case 4: wind(0.06); birds(2600); break; // Freedom
    case 5: // I Am Waiting for You: rain on a window
      bed('highpass', 1800, 0.05); bed('lowpass', 400, 0.03);
      every(60, () => burst(3000 + Math.random() * 3000, 0.02, 0.05 + Math.random() * 0.1, 'bandpass', 3), 80);
      break;
    case 6: // Remembrance: a record that has finished playing
      bed('bandpass', 2500, 0.012, 0.8);
      { const h = keep(ctx.createOscillator()); h.frequency.value = 50; const hg = gain(0.012); h.connect(hg); hg.connect(out); h.start(); }
      every(90, () => { if (Math.random() < 0.4) burst(1500 + Math.random() * 4000, 0.008, 0.2); }, 120);
      every(1800, () => burst(300, 0.12, 0.05, 'lowpass'));
      break;
    case 7: // Fears: a heartbeat, close
      every(900, () => { tone(55, 0.18, 0.4, 'sine', 0.01); timers.push(setTimeout(() => tone(48, 0.2, 0.3, 'sine', 0.01), 230)); }, 60);
      bed('lowpass', 120, 0.03);
      break;
    case 8: // Just Keep Fighting: fire crackling
      bed('lowpass', 250, 0.06);
      every(70, () => { if (Math.random() < 0.5) burst(1200 + Math.random() * 3500, 0.01 + Math.random() * 0.03, 0.08 + Math.random() * 0.25); }, 120);
      every(2500, () => burst(180, 0.4, 0.08, 'lowpass'), 2000); // a log shifting
      break;
    case 9: birds(900); bed('highpass', 5000, 0.006); break; // Dawn
    case 10: { // Shine: a warm glowing chord that breathes
      for (const f of [196, 246.94, 293.66, 392]) { const o = keep(ctx.createOscillator()); o.type = 'sine'; o.frequency.value = f; const g = gain(0.03); o.connect(g); g.connect(out); o.start(); lfo(0.1 + Math.random() * 0.1, 0.015, g.gain); }
      break;
    }
    case 11: { // Lomo: a projector whirring, a shutter now and then
      const m = keep(ctx.createOscillator()); m.type = 'sawtooth'; m.frequency.value = 24; const mg = gain(0.03); const mf = filter('lowpass', 900); m.connect(mf); mf.connect(mg); mg.connect(out); m.start();
      bed('bandpass', 3000, 0.01);
      every(2400, () => { burst(4000, 0.02, 0.3, 'bandpass', 4); timers.push(setTimeout(() => burst(2500, 0.03, 0.25, 'bandpass', 4), 90)); }, 2500);
      break;
    }
    case 12: { // Guard Your Freedom: sea waves
      const w = bed('lowpass', 700, 0.02, 0.7); lfo(0.09, 0.07, w.g.gain); lfo(0.09, 400, w.b.frequency);
      break;
    }
    case 13: // Place: drips in an empty room
      bed('lowpass', 150, 0.015);
      every(1300, () => chirp(1400 + Math.random() * 900, 500, 0.12, 0.15), 1600);
      break;
    case 14: // We Are a Polyhedron: glass chimes
      every(700, () => { const f = pentatonic[Math.floor(Math.random() * 7)] * 2; tone(f, 2.5, 0.05); tone(f * 2.76, 1.2, 0.02); }, 900);
      break;
    case 15: { // Limitation: a buzzing fluorescent tube
      const o = keep(ctx.createOscillator()); o.type = 'square'; o.frequency.value = 100; const f = filter('bandpass', 400, 2), g = gain(0.03);
      o.connect(f); f.connect(g); g.connect(out); o.start(); lfo(7, 0.012, g.gain);
      break;
    }
    case 16: // Pain: a heart monitor
      every(1050, () => tone(1000, 0.11, 0.12, 'sine', 0.002));
      bed('lowpass', 90, 0.04);
      break;
    case 17: // Promise: a distant bell tolling
      every(6000, () => { for (const [m, v] of [[1, 0.12], [2.4, 0.05], [3.0, 0.04], [4.5, 0.02]]) tone(220 * m, 5.5, v, 'sine', 0.01); });
      bed('lowpass', 300, 0.012);
      break;
  }

  return function stop() {
    timers.forEach(clearTimeout);
    timers.length = 0;
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => {
      for (const n of nodes) { try { n.stop?.(); } catch (e) { /* already stopped */ } try { n.disconnect(); } catch (e) { /* ok */ } }
      out.disconnect();
    }, 1600);
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
