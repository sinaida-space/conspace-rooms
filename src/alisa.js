// ── conspace-rooms · alisa.js ───────────────────────────────────────────────
// Alisa's voice at some of the works (assets/sounds/alisa/NN.mp3, NN = the
// work's id). Walking up to such a work, from 6 m out: its note rises first,
// then her voice comes in over it, louder the closer one stands; the note
// stays at 30% of the voice and the music sinks to 10%. When the recording
// ends the note fades and the music comes back.
//
// Once per work on the wall: the same work met again further on (another
// chunk, another key) speaks again. Walking off beyond 7 m ends its turn. Two voiced works near each other: the
// one met first plays to its end, then the other, if one is still near it.
// The voice and its note go straight to master, past the corridor bed, so
// standing at the work (which silences the corridor) does not cut them.

export const VOICED = new Set(['01', '06', '07', '09', '12', '17', '18']);

const RADIUS = 6;          // m: the note begins here
const FULL = 1.5;          // m: the voice is at full level from here in
const LEAD = 1.5;          // s: the note alone before the voice
const NOTE_SHARE = 0.3;    // the note against the voice
const MUSIC_DUCK = 0.1;    // the music while she speaks
const VOICE_GAIN = 0.9;
const NOTE_GAIN = VOICE_GAIN * NOTE_SHARE * 0.5;   // the synth note is dense: at half its gain share it sits at about a third of her voice by ear

// 0 at RADIUS, 1 at FULL and nearer, eased; the voice never starts from silence
const nearness = d => { const t = Math.min(1, Math.max(0, (RADIUS - d) / (RADIUS - FULL))); return t * t * (3 - 2 * t); };
const voiceLevel = d => d > RADIUS ? 0 : 0.2 + 0.8 * nearness(d);

export class AlisaVoices {
  constructor(audio) {
    this.audio = audio;
    this.buffers = new Map();   // id → AudioBuffer | Promise
    this.done = new Set();      // keys of works on the wall that have spoken
    this.active = null;         // { key, id, x, z, t0, phase: 'note'|'voice'|'fade', src, voice, note }
  }

  // the recording of a work, fetched and decoded once, from its first approach
  _load(id) {
    const ctx = this.audio.ctx;
    if (!this.buffers.has(id)) {
      this.buffers.set(id, fetch(`assets/sounds/alisa/${id}.mp3`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b))
        .then(buf => { this.buffers.set(id, buf); return buf; }, () => { this.buffers.set(id, null); return null; }));
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
          src.connect(act.voice.gain);
          src.onended = () => { if (this.active === act) act.phase = 'fade'; };
          src.start();
          act.src = src; act.phase = 'voice';
          A.duckMusic?.(MUSIC_DUCK);
        } else if (now - act.t0 > 8) act.phase = 'fade';                 // it never came: let the work go
      }
      if (act.phase === 'note') act.note.gain.gain.setTargetAtTime(lv * NOTE_GAIN, now, 0.5);   // the note alone, rising
      if (act.phase === 'voice') {
        act.voice.gain.gain.setTargetAtTime(lv * VOICE_GAIN, now, 0.25);
        act.note.gain.gain.setTargetAtTime(lv * NOTE_GAIN, now, 0.25);
      }
      if (d > RADIUS + 1 && act.phase !== 'fade') { act.src?.stop(); act.phase = 'fade'; }   // walked away: it has had its turn
      if (act.phase === 'fade') {
        act.note.gain.gain.setTargetAtTime(0, now, 0.8);
        act.voice.gain.gain.setTargetAtTime(0, now, 0.3);
        A.duckMusic?.(1);
        this.done.add(act.key);
        const { note, voice } = act;
        setTimeout(() => { note.oscs.forEach(o => o.stop()); note.out.disconnect(); voice.panner.disconnect(); }, 4000);
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
    this.active = { ...next, t0: now, phase: 'note', note: this._note(next), voice: this._voice(next) };
  }

  // the work's note, as the corridor plays it (audio.js), but to master
  _note(w) {
    const A = this.audio, v = A._makeVoice({ index: parseInt(w.id, 10) - 1 });
    v.panner.disconnect(); v.panner.connect(A.master);
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
    gain.connect(panner); panner.connect(this.audio.master);
    return { gain, panner };
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal. (Gautier)
