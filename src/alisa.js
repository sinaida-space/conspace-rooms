// ── conspace-rooms · alisa.js ───────────────────────────────────────────────
// Alisa's voice at some of the works (assets/sounds/alisa/NN.mp3, NN = the
// work's id). Walking up to such a work, from 6 m out: first everything else
// (corridor, water, ambience, music) sinks almost away, then the work's note
// comes in very quietly as a ground with no voice in it, then her voice over
// it, clear and louder the closer one stands. When the recording ends the
// note fades and the world comes back.
//
// Once per work on the wall: the same work met again further on (another
// chunk, another key) speaks again. Walking off beyond 7 m ends its turn. Two voiced works near each other: the
// one met first plays to its end, then the other, if one is still near it.
// The voice and its note go straight to out, past master, so the world
// sinking under her (duckWorld) does not take them along.

export const VOICED = new Set(['01', '06', '07', '09', '12', '17', '18']);

const RADIUS = 6;          // m: the note begins here
const FULL = 1.5;          // m: the voice is at full level from here in
const LEAD = 2.2;          // s: the world sinks, the note alone, before the voice
const WORLD_DUCK = 0.12;   // everything else while she is near
const MUSIC_DUCK = 0.3;    // the music sinks further still, inside the world
const VOICE_GAIN = 1.0;
const NOTE_GAIN = 0.07;    // the ground under her: barely there

// 0 at RADIUS, 1 at FULL and nearer, eased; the voice never starts from silence
const nearness = d => { const t = Math.min(1, Math.max(0, (RADIUS - d) / (RADIUS - FULL))); return t * t * (3 - 2 * t); };
const voiceLevel = d => d > RADIUS ? 0 : 0.55 + 0.45 * nearness(d);

// The recordings came in at very different, mostly low levels (-31 to -51 dB
// mean): lift each to about -19 dB RMS, never letting its peak pass -1 dB.
function loudness(buf) {
  let sum = 0, peak = 0, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = d[i]; sum += v * v; if (v > peak) peak = v; else if (-v > peak) peak = -v; }
    n += d.length;
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  if (rms < 1e-6) return 1;
  return Math.min(Math.pow(10, -19 / 20) / rms, Math.pow(10, -1 / 20) / Math.max(peak, 1e-6));
}

export class AlisaVoices {
  constructor(audio) {
    this.audio = audio;
    this.buffers = new Map();   // id → AudioBuffer | Promise
    this.levels = new Map();    // id → gain that brings the recording to a common loudness
    this.done = new Set();      // keys of works on the wall that have spoken
    this.active = null;         // { key, id, x, z, t0, phase: 'note'|'voice'|'fade', src, voice, note }
  }

  // the recording of a work, fetched and decoded once, from its first approach
  _load(id) {
    const ctx = this.audio.ctx;
    if (!this.buffers.has(id)) {
      this.buffers.set(id, fetch(`assets/sounds/alisa/${id}.mp3`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b))
        .then(buf => { this.buffers.set(id, buf); this.levels.set(id, loudness(buf)); return buf; }, () => { this.buffers.set(id, null); return null; }));
    }
    const b = this.buffers.get(id);
    return b instanceof AudioBuffer ? b : null;
  }

  // keys of works the corridor's own note should leave alone right now
  // (their note is ours until they have spoken)
  holds(key, id) { return VOICED.has(id) && !this.done.has(key); }

  // listener: { x, z }; works: [{ key, id, x, z }] voiced works nearby, any distance
  update(listener, works) {
    const A = this.audio, ctx = A.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const w of works) if (Math.hypot(w.x - listener.x, w.z - listener.z) < RADIUS + 6) this._load(w.id);   // fetch a little ahead
    const act = this.active;
    if (act) {
      const d = Math.hypot(act.x - listener.x, act.z - listener.z), lv = A._silenced ? 0 : voiceLevel(d);
      if (act.phase === 'note' && now - act.t0 >= LEAD) {
        const buf = this._load(act.id);
        if (buf) {
          const src = ctx.createBufferSource(); src.buffer = buf;
          // some recordings stop mid-sound (07, 17): a soft tail over the last 0.8 s, and a breath of fade-in
          const tail = ctx.createGain(), end = now + buf.duration, fade = Math.min(0.8, buf.duration / 4);
          tail.gain.setValueAtTime(0, now); tail.gain.linearRampToValueAtTime(1, now + 0.04);
          tail.gain.setValueAtTime(1, end - fade); tail.gain.linearRampToValueAtTime(0, end);
          src.connect(tail); tail.connect(act.voice.gain);
          src.onended = () => { if (this.active === act) act.phase = 'fade'; };
          src.start();
          act.src = src; act.phase = 'voice';
        } else if (now - act.t0 > 8) act.phase = 'fade';                 // it never came: let the work go
      }
      if (act.phase === 'note' && now - act.t0 > 0.8) act.note.gain.gain.setTargetAtTime(lv * NOTE_GAIN, now, 0.5);   // once the world is down, the note alone, rising
      if (act.phase === 'voice') {
        act.voice.gain.gain.setTargetAtTime(lv * VOICE_GAIN * (this.levels.get(act.id) ?? 1), now, 0.25);
        act.note.gain.gain.setTargetAtTime(lv * NOTE_GAIN, now, 0.25);
      }
      if (d > RADIUS + 1 && act.phase !== 'fade') act.phase = 'fade';   // walked away: it has had its turn, her voice fades rather than cuts
      if (act.phase === 'fade') {
        act.note.gain.gain.setTargetAtTime(0, now, 0.8);
        act.voice.gain.gain.setTargetAtTime(0, now, 0.7);   // about 2.5 s to silence
        A.duckMusic?.(1); A.duckWorld?.(1);
        this.done.add(act.key);
        const { note, voice } = act;
        const src = act.src;
        setTimeout(() => { try { src?.stop(); } catch (e) { /* already ended */ } note.oscs.forEach(o => o.stop()); note.out.disconnect(); voice.panner.disconnect(); }, 4000);
        this.active = null;
      }
      return;
    }
    // nobody speaks: the nearest voiced work within reach that has not spoken begins
    let next = null, nd = RADIUS;
    for (const w of works) {
      if (this.done.has(w.key)) continue;
      const d = Math.hypot(w.x - listener.x, w.z - listener.z);
      if (d < nd) { nd = d; next = w; }
    }
    if (!next || A._silenced) return;
    this._load(next.id);
    A.duckWorld?.(WORLD_DUCK); A.duckMusic?.(MUSIC_DUCK);   // the world sinks first
    this.active = { ...next, t0: now, phase: 'note', note: this._note(next), voice: this._voice(next) };
  }

  // the work's note, as the corridor plays it (audio.js), but to master
  _note(w) {
    const A = this.audio, v = A._makeVoice({ index: parseInt(w.id, 10) - 1 });
    v.panner.disconnect(); v.panner.connect(A.out || A.master);
    v.gain.gain.value = 0;
    if (v.panner.positionX) { v.panner.positionX.value = w.x; v.panner.positionZ.value = w.z; } else v.panner.setPosition(w.x, 1.55, w.z);
    return v;
  }

  // her voice from the work, placed but not fading with distance (the level
  // is ours, by nearness)
  _voice(w) {
    const ctx = this.audio.ctx, gain = ctx.createGain(), panner = ctx.createPanner();
    gain.gain.value = 0;
    panner.panningModel = 'HRTF'; panner.distanceModel = 'linear'; panner.rolloffFactor = 0;
    if (panner.positionX) { panner.positionX.value = w.x; panner.positionY.value = 1.55; panner.positionZ.value = w.z; } else panner.setPosition(w.x, 1.55, w.z);
    gain.connect(panner); panner.connect(this.audio.out || this.audio.master);
    return { gain, panner };
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal. (Gautier)
