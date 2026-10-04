// ── conspace-rooms · shadowSound.js ─────────────────────────────────────────
// What a walking shadow sounds like, one of four, picked at random each time
// one appears, heard from where it is on the wall and following it along:
//   breath   a slow wet breath in and out, in step with its stride; when it
//            stops dead, the breath stops too
//   whisper  someone murmuring backwards inside the wall, no word to catch
//   warp     a low pressure under everything while it walks, and the music
//            and the places go wobbly like chewed tape
//   drag     one foot dragged on the linoleum every other step; when it stops,
//            the joints crack
// Grandmother's cat has its own: a meow or two from wherever it runs (meow).
// Everything synthesized. audio: the AudioEngine (audio.js).

import { captions } from './captions.js';

export const SHADOW_SOUNDS = ['breath', 'whisper', 'warp', 'drag'];

let noise = null;
function noiseBuf(ctx) {
  if (noise) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

// a burst of filtered noise into `dest`: type/freq ramps from f0 to f1, an envelope a → peak → 0
function puff(ctx, dest, t, { type = 'bandpass', f0, f1 = f0, q = 1.2, peak, attack, len }) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx); s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 1.5); s.stop(t + len + 0.05);
}

// The shadow's voice. update(dx, dz) each frame (from the listener, world),
// step() on each footfall, halt() when it stops dead, stop() when it is gone.
export function shadowVoice(audio, kind) {
  const ctx = audio?.ctx;
  if (!ctx || audio.muted) return null;
  captions.say('shadow_' + kind, { gap: 12 });
  const pan = ctx.createStereoPanner(), near = ctx.createGain();
  near.gain.value = 0;
  pan.connect(near); near.connect(audio.bed);
  try { near.connect(audio.water._room()); } catch (e) { /* no room yet */ }
  const live = [];                                       // sources to stop at the end
  let steps = 0, gone = false;

  if (kind === 'whisper') {                              // syllables: slow swell, cut off (a word reversed)
    const formants = [[700, 1100], [400, 2000], [300, 900], [600, 1700], [350, 2600]];
    const timer = setInterval(() => {
      if (gone) return;
      const t = ctx.currentTime + 0.02, len = 0.18 + Math.random() * 0.32;
      const [a, b] = formants[Math.floor(Math.random() * formants.length)];
      for (const [f, v] of [[a, 0.05], [b, 0.03]]) {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx); s.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 9;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + len * 0.9); g.gain.linearRampToValueAtTime(0, t + len);
        s.connect(bp); bp.connect(g); g.connect(pan); s.start(t, Math.random()); s.stop(t + len + 0.02);
      }
    }, 260);
    live.push({ stop: () => clearInterval(timer) });
  } else if (kind === 'meow') {                           // mi-a-ow: a reedy voice whose pitch rises and falls while the mouth opens and closes
    const meow = () => {
      if (gone) return;
      const t = ctx.currentTime + 0.02, len = 0.55 + Math.random() * 0.35, f = 520 + Math.random() * 160;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.55, t + len * 0.35); o.frequency.exponentialRampToValueAtTime(f * 0.95, t + len);
      const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 6.5; vg.gain.value = f * 0.015;
      vib.connect(vg); vg.connect(o.frequency);
      const mouth = ctx.createBiquadFilter(); mouth.type = 'lowpass'; mouth.Q.value = 6;
      mouth.frequency.setValueAtTime(700, t); mouth.frequency.linearRampToValueAtTime(2800, t + len * 0.4); mouth.frequency.exponentialRampToValueAtTime(800, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.06); g.gain.setValueAtTime(0.05, t + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(mouth); mouth.connect(g); g.connect(pan);
      o.start(t); vib.start(t); o.stop(t + len + 0.05); vib.stop(t + len + 0.05);
    };
    const timers = [setTimeout(meow, 500 + Math.random() * 900)];
    if (Math.random() < 0.6) timers.push(setTimeout(meow, 2200 + Math.random() * 1500));
    live.push({ stop: () => timers.forEach(clearTimeout) });
  } else if (kind === 'warp') {                           // a pressure felt more than heard, and the tape wobbles
    const t = ctx.currentTime;
    for (const [f, v] of [[38, 0.16], [57.3, 0.05]]) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 1.5);
      o.connect(g); g.connect(audio.bed); o.start();      // under everything, not from a side
      live.push({ stop: () => { g.gain.setTargetAtTime(0, ctx.currentTime, 0.5); o.stop(ctx.currentTime + 2); } });
    }
    audio.wow?.(1);
    live.push({ stop: () => audio.wow?.(0) });
  }

  return {
    update(dx, dz) {
      const d = Math.max(0.5, Math.hypot(dx, dz)), yaw = window.__app?.player?.yaw ?? 0;
      pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d)), ctx.currentTime, 0.05);
      near.gain.setTargetAtTime(gone ? 0 : 1 / (1 + d / 4), ctx.currentTime, 0.1);
    },
    step() {
      if (gone) return;
      const t = ctx.currentTime;
      steps++;
      if (kind === 'breath') {                           // in on one foot, out on the next
        if (steps % 2) puff(ctx, pan, t, { f0: 900, f1: 1700, q: 1.4, peak: 0.07, attack: 0.5, len: 0.8 });
        else puff(ctx, pan, t, { type: 'lowpass', f0: 1400, f1: 500, q: 0.8, peak: 0.08, attack: 0.08, len: 0.9 });
      } else if (kind === 'drag' && steps % 2 === 0) {   // the dragged foot
        puff(ctx, pan, t, { f0: 1300, f1: 500, q: 0.9, peak: 0.09, attack: 0.05, len: 0.42 });
      }
    },
    halt() {
      if (gone || kind !== 'drag') return;
      const t = ctx.currentTime + 0.1;                   // the joints, three short cracks
      for (let k = 0; k < 3; k++) puff(ctx, pan, t + k * (0.07 + Math.random() * 0.06), { type: 'highpass', f0: 2500, q: 0.7, peak: 0.12, attack: 0.002, len: 0.03 });
    },
    stop() {
      if (gone) return;
      gone = true;
      near.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      for (const l of live) l.stop();
      setTimeout(() => { try { near.disconnect(); } catch (e) { /* gone */ } }, 3000);
    },
  };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
