// ── conspace-rooms · music.js ───────────────────────────────────────────────
// The labyrinth's music, generated live with Web Audio: no files, nobody's
// recording. Three layers share one reverb and cross-fade:
//
//   corridor   lo-fi electric piano on a slow minor progression (Dm9 · B♭maj7 ·
//              Gm9 · A7♭9), bent by tape wow and flutter; a faint heartbeat on
//              the bar; far down the ward a patient monitor beeps at its own,
//              unsteady pace and now and then sounds its three-note alarm.
//              Fear keeps the beeps and the heartbeat; memory softens them;
//              in the light they are gone and the piano opens up.
//   room       grandmother's room: an old waltz in A minor on a tinny piano,
//              played through a gramophone horn (band-limited, resonant,
//              overdriven), wobbling at 78 rpm under surface noise and crackle.
//   light      a presence door giving way: a high major-ninth pad and slow
//              bells; everything else sinks under it for a few seconds.
//
// Notes are scheduled ahead on the audio clock by a timer that looks 1.5 s
// ahead, so a busy frame never makes the music stumble.

const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const LOOKAHEAD = 1.5;           // seconds of music scheduled ahead of now
const TICK_MS = 200;             // scheduler period

// corridor: 66 bpm, two bars per chord (bass note first, then the voicing)
const CORRIDOR_BEAT = 60 / 66;
const CORRIDOR_CHORDS = [
  [50, [57, 60, 64, 65]],        // Dm9
  [46, [57, 62, 65, 69]],        // B♭maj7
  [43, [58, 62, 65, 69]],        // Gm9
  [45, [55, 61, 64, 70]],        // A7♭9
];
const CORRIDOR_SCALE = [62, 65, 67, 69, 72, 74, 77];   // D minor pentatonic, for the melody

// room: a waltz, 3/4 at 96 bpm, two bars per chord
const ROOM_BEAT = 60 / 96;
const ROOM_CHORDS = [
  [45, [57, 60, 64]], [50, [57, 62, 65]], [40, [56, 59, 62]], [45, [57, 60, 64]],   // Am Dm E7 Am
  [41, [57, 60, 65]], [50, [57, 62, 65]], [40, [56, 59, 62]], [45, [57, 60, 64]],   // F  Dm E7 Am
];
const ROOM_SCALE = [69, 71, 72, 74, 76, 77, 80, 81, 83, 84];                       // A harmonic minor

const LIGHT_NOTES = [74, 78, 81, 85, 88];              // Dmaj9, high

function noiseBuffer(ctx, seconds, shape = 1) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * shape;
  return buf;
}
// A generated hall: two channels of decaying noise, darker as it fades.
function impulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len, a = 0.25 + 0.7 * k;      // the tail loses its highs
      lp += a * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - k, 2.6);
    }
  }
  return buf;
}

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.mix = g(0); this.mix.connect(out);
    this.mix.gain.setTargetAtTime(1, ctx.currentTime + 0.5, 2.5);   // fades in after the Enter

    this.verb = ctx.createConvolver(); this.verb.buffer = impulse(ctx, 3.2);
    this.verbOut = g(0.55); this.verb.connect(this.verbOut); this.verbOut.connect(this.mix);

    // ── corridor chain: notes → wow/flutter delay → tone → bus
    this.corridorBus = g(1); this.corridorBus.connect(this.mix);
    this.corridorIn = g(1);
    const wow = ctx.createDelay(0.05); wow.delayTime.value = 0.012;
    this._lfo(0.33, 0.0022, wow.delayTime); this._lfo(6.1, 0.00025, wow.delayTime);
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 1600; this.tone.Q.value = 0.4;
    this.corridorIn.connect(wow); wow.connect(this.tone); this.tone.connect(this.corridorBus);
    this.corridorSend = g(0.35); this.tone.connect(this.corridorSend); this.corridorSend.connect(this.verb);
    // tape hiss under it
    const hiss = ctx.createBufferSource(); hiss.buffer = noiseBuffer(ctx, 2, 0.5); hiss.loop = true;
    const hissLp = ctx.createBiquadFilter(); hissLp.type = 'lowpass'; hissLp.frequency.value = 5200;
    this.hissGain = g(0.006); hiss.connect(hissLp); hissLp.connect(this.hissGain); this.hissGain.connect(this.corridorBus); hiss.start();
    // the ward: monitor beeps and the heartbeat, faded by the zone
    this.wardBus = g(1); this.wardBus.connect(this.corridorBus);
    this.wardSend = g(0.7); this.wardBus.connect(this.wardSend); this.wardSend.connect(this.verb);
    this.beatBus = g(1); this.beatBus.connect(this.corridorBus);

    // ── room chain: notes → overdrive → horn band → honk → wow → bus
    this.roomBus = g(0); this.roomBus.connect(this.mix);
    this.roomIn = g(1);
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
    drive.curve = curve;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 330; hp.Q.value = 0.9;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900; lp.Q.value = 2.2;
    const honk = ctx.createBiquadFilter(); honk.type = 'peaking'; honk.frequency.value = 1150; honk.gain.value = 7; honk.Q.value = 1.2;
    const rwow = ctx.createDelay(0.05); rwow.delayTime.value = 0.014;
    this._lfo(1.3, 0.0019, rwow.delayTime); this._lfo(0.27, 0.0032, rwow.delayTime);   // 78 rpm, and a warped disc
    const trim = g(0.26);                                        // the overdrive runs hot: bring it back to the corridor's level
    this.roomIn.connect(drive); drive.connect(hp); hp.connect(lp); lp.connect(honk); honk.connect(trim); trim.connect(rwow); rwow.connect(this.roomBus);
    this.roomSend = g(0.25); rwow.connect(this.roomSend); this.roomSend.connect(this.verb);
    // surface noise and rumble of the disc
    const surf = ctx.createBufferSource(); surf.buffer = noiseBuffer(ctx, 2, 0.6); surf.loop = true;
    const sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 2600; sbp.Q.value = 0.6;
    const sg = g(0.03); surf.connect(sbp); sbp.connect(sg); sg.connect(this.roomBus); surf.start();
    const rumble = ctx.createOscillator(); rumble.frequency.value = 31;
    const rg = g(0.02); rumble.connect(rg); rg.connect(this.roomBus); rumble.start();
    this._clickBuf = noiseBuffer(ctx, 0.01);

    // ── light chain
    this.lightBus = g(0); this.lightBus.connect(this.mix);
    this.lightSend = g(0.9); this.lightBus.connect(this.lightSend); this.lightSend.connect(this.verb);

    // state
    this.zone = { fear: 1, memory: 0, accept: 0 };
    this.inRoom = false;
    this._bright = 0;
    this._t = { corridor: ctx.currentTime + 0.6, room: ctx.currentTime + 0.6, beep: ctx.currentTime + 2, crackle: ctx.currentTime };
    this._bar = { corridor: 0, room: 0 };
    this._hr = 72; this._alarmIn = 40 + Math.random() * 40;
    this._timer = setInterval(() => this._schedule(), TICK_MS);
    this._schedule();
  }

  // a slow wobble on any parameter
  _lfo(freq, depth, param) {
    const o = this.ctx.createOscillator(); o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = depth;
    o.connect(g); g.connect(param); o.start();
  }

  // ── what the rest of the engine calls ───────────────────────────────────
  setZone(zone) {
    this.zone = zone;
    const now = this.ctx.currentTime, f = zone.fear, a = zone.accept;
    this.wardBus.gain.setTargetAtTime(f + 0.25 * zone.memory, now, 1.5);
    this.beatBus.gain.setTargetAtTime(f, now, 1.5);
    this.tone.frequency.setTargetAtTime(1500 + 2200 * a + 400 * zone.memory, now, 2);
    this.verbOut.gain.setTargetAtTime(0.5 + 0.35 * a, now, 2);
  }
  motion(s) { this._speed = s; }
  room(on) {
    if (on === this.inRoom) return;
    this.inRoom = on;
    this._mixLevels(on ? 3.5 : 2.5);
    if (on) { this._t.room = Math.max(this._t.room, this.ctx.currentTime + 0.4); this._bar.room = 0; }
  }
  // a door gives way: the light plays over everything for `seconds`
  light(seconds = 5) {
    const ctx = this.ctx, t = ctx.currentTime;
    this._bright++;
    this._mixLevels(1.2);
    this.lightBus.gain.setTargetAtTime(1, t, 0.9);
    for (const [k, n] of LIGHT_NOTES.entries()) this._pad(midi(n), t + k * 0.12, seconds, 0.028);
    for (let k = 0; k < Math.floor(seconds / 0.45); k++) {
      const n = LIGHT_NOTES[Math.floor(Math.random() * LIGHT_NOTES.length)] + 12;
      this._bell(midi(n), t + 0.5 + k * 0.45 + Math.random() * 0.1, 0.02);
    }
    setTimeout(() => {
      this._bright = Math.max(0, this._bright - 1);
      if (!this._bright) { this.lightBus.gain.setTargetAtTime(0, this.ctx.currentTime, 1.5); this._mixLevels(2.5); }
    }, seconds * 1000);
  }
  // the door slams: a body blow in the wall and the latch
  slam() {
    const ctx = this.ctx, t = ctx.currentTime;
    this.lightBus.gain.cancelScheduledValues(t); this.lightBus.gain.setTargetAtTime(0, t, 0.03);
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, 0.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.9, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    s.connect(lp); lp.connect(ng); ng.connect(this.mix); ng.connect(this.verb); s.start(t);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(78, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.3);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(og); og.connect(this.mix); o.start(t); o.stop(t + 0.45);
    this._click(t + 0.02, 0.25, 4000, this.mix);
  }
  stop() { clearInterval(this._timer); }

  // corridor / room / light balance
  _mixLevels(tc) {
    const t = this.ctx.currentTime, lit = this._bright > 0;
    this.corridorBus.gain.setTargetAtTime(this.inRoom ? 0 : lit ? 0.12 : 1, t, tc);
    this.roomBus.gain.setTargetAtTime(this.inRoom ? (lit ? 0.12 : 1) : 0, t, tc);
  }

  // ── the scheduler ───────────────────────────────────────────────────────
  _schedule() {
    const until = this.ctx.currentTime + LOOKAHEAD;
    if (this.ctx.state !== 'running') return;
    while (this._t.corridor < until) this._corridorPhrase();
    while (this._t.room < until) this._roomBar();
    while (this._t.beep < until) this._monitor();
    if (this.inRoom) while (this._t.crackle < until) this._crackle();
    else this._t.crackle = until;
  }

  // two bars of one chord: bass, a lazy strum, a few melody notes
  _corridorPhrase() {
    const t0 = this._t.corridor, B = CORRIDOR_BEAT;
    const idx = this._bar.corridor++ % CORRIDOR_CHORDS.length;
    const [bass, voicing] = CORRIDOR_CHORDS[idx];
    this._t.corridor += 8 * B;
    if (this.inRoom) return;                                     // keep time, play nothing
    this._keys(midi(bass), t0, 7 * B, 0.11, true);
    voicing.forEach((n, k) => this._keys(midi(n), t0 + 0.03 + k * 0.035 + Math.random() * 0.02, 3.5 * B, 0.045));
    voicing.forEach((n, k) => this._keys(midi(n), t0 + 5.5 * B + k * 0.03, 2.5 * B, 0.03));
    // heartbeat, lub-dub, on each bar
    for (const bar of [0, 4]) { this._thump(t0 + bar * B, 0.16); this._thump(t0 + bar * B + 0.26, 0.1); }
    // melody: a handful of swung eighths, sometimes sagging like stretched tape
    const n = 2 + Math.floor(Math.random() * 3);
    const slots = new Set();
    while (slots.size < n) slots.add(1 + Math.floor(Math.random() * 14));
    for (const s of slots) {
      const at = t0 + (Math.floor(s / 2) + (s % 2 ? 0.62 : 0)) * B;  // swing
      const note = CORRIDOR_SCALE[Math.floor(Math.random() * CORRIDOR_SCALE.length)];
      this._keys(midi(note), at, 1.2 * B, 0.035 + Math.random() * 0.02, false, Math.random() < 0.12);
    }
  }

  // one bar of the waltz: bass on one, the chord on two and three, a melody line
  _roomBar() {
    const t0 = this._t.room, B = ROOM_BEAT, bar = this._bar.room++;
    this._t.room += 3 * B;
    if (!this.inRoom) return;
    const [bass, chord] = ROOM_CHORDS[Math.floor(bar / 2) % ROOM_CHORDS.length];
    this._piano(midi(bar % 2 ? bass + 7 : bass), t0, 0.9, 0.16);
    for (const beat of [1, 2]) chord.forEach(n => this._piano(midi(n), t0 + beat * B, 0.35, 0.06));
    // the tune: on the first bar of a chord start from a chord tone, then walk
    const rhythms = [[0, 3], [0, 1, 2], [0, 2], [0, 1.5, 2, 2.5]];
    const r = rhythms[Math.floor(Math.random() * rhythms.length)];
    let pos = this._melody ?? 4;
    if (bar % 2 === 0) {
      const tone = chord[Math.floor(Math.random() * chord.length)] + 12;
      pos = ROOM_SCALE.reduce((best, n, i) => Math.abs(n - tone) < Math.abs(ROOM_SCALE[best] - tone) ? i : best, 0);
    }
    r.forEach((beat, k) => {
      if (k) pos = Math.max(0, Math.min(ROOM_SCALE.length - 1, pos + [-1, 1, -2, 1, 2][Math.floor(Math.random() * 5)]));
      const len = (r[k + 1] ?? 3) - beat;
      this._piano(midi(ROOM_SCALE[pos]), t0 + beat * B, len * B * 0.95, 0.11);
    });
    this._melody = pos;
  }

  // the monitor down the ward: its own unsteady pulse, skips, and an alarm
  _monitor() {
    const t = this._t.beep;
    this._hr += (Math.random() - 0.5) * 3;
    this._hr = Math.max(58, Math.min(92, this._hr + (72 - this._hr) * 0.05));
    this._t.beep += 60 / this._hr;
    this._alarmIn -= 60 / this._hr;
    if (this.inRoom) return;
    if (this._alarmIn <= 0) {                                    // three falling pulses
      this._alarmIn = 45 + Math.random() * 60;
      [84, 81, 77].forEach((n, k) => this._beep(midi(n), t + k * 0.19, 0.13, 0.03));
      this._t.beep += 0.8;
      return;
    }
    if (Math.random() < 0.06) return;                            // a missed beat
    this._beep(987.8, t, 0.075, 0.028);
  }

  // gramophone crackle: dense small clicks, a louder one now and then, and the
  // needle's knock once a revolution
  _crackle() {
    const t = this._t.crackle;
    this._t.crackle += 0.03 + Math.random() * 0.06;
    this._click(t, 0.02 + Math.random() * 0.05, 1500 + Math.random() * 5000, this.roomBus);
    if (Math.random() < 0.04) this._click(t + 0.01, 0.25, 900, this.roomBus);
    if (Math.floor(t / 0.77) !== Math.floor(this._t.crackle / 0.77)) this._click(t, 0.12, 300, this.roomBus);
  }

  // ── instruments ─────────────────────────────────────────────────────────
  // electric piano: a sine carrier with an FM bark on the attack and a tine
  _keys(f, t, dur, vel, bass = false, sag = false) {
    const ctx = this.ctx;
    f *= Math.pow(2, (Math.random() - 0.5) * 0.08 / 12);        // never quite in tune
    const car = ctx.createOscillator(); car.frequency.setValueAtTime(f, t);
    if (sag) car.frequency.setTargetAtTime(f * 0.982, t + 0.15, 0.4);
    const mod = ctx.createOscillator(); mod.frequency.value = f * (bass ? 1 : 2);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * (bass ? 0.6 : 1.4), t); mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.4);
    mod.connect(mg); mg.connect(car.frequency);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.5); amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
    car.connect(amp); amp.connect(this.corridorIn);
    const end = t + dur + 1.3;
    car.start(t); mod.start(t); car.stop(end); mod.stop(end);
    if (!bass) {                                                   // the tine
      const tine = ctx.createOscillator(); tine.frequency.value = f * 7.02;
      const tg = ctx.createGain(); tg.gain.setValueAtTime(vel * 0.12, t); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      tine.connect(tg); tg.connect(this.corridorIn); tine.start(t); tine.stop(t + 0.15);
    }
  }
  // a tinny upright: three partials, a fast decay
  _piano(f, t, dur, vel) {
    const ctx = this.ctx, amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(vel, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(vel * 0.3, t + 0.25); amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    amp.connect(this.roomIn);
    for (const [m, v] of [[1, 1], [2.003, 0.45], [3.01, 0.18]]) {
      const o = ctx.createOscillator(); o.frequency.value = f * m;
      const g = ctx.createGain(); g.gain.value = v;
      o.connect(g); g.connect(amp); o.start(t); o.stop(t + dur + 0.7);
    }
  }
  _beep(f, t, dur, vel) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
    g.gain.setValueAtTime(vel, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
    const pan = ctx.createStereoPanner(); pan.pan.value = 0.55;
    o.connect(g); g.connect(pan); pan.connect(this.wardBus); o.start(t); o.stop(t + dur + 0.05);
  }
  _thump(t, vel) {
    const ctx = this.ctx, o = ctx.createOscillator();
    o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(this.beatBus); o.start(t); o.stop(t + 0.22);
  }
  _click(t, vel, freq, dest) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this._clickBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = vel;
    s.connect(bp); bp.connect(g); g.connect(dest); s.start(t);
  }
  _pad(f, t, dur, vel) {
    const ctx = this.ctx, amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(vel, t + 0.9);
    amp.gain.setValueAtTime(vel, t + dur); amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.8);
    amp.connect(this.lightBus);
    for (const [type, cents] of [['sine', 0], ['triangle', 4], ['sine', -5]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * Math.pow(2, cents / 1200);
      o.connect(amp); o.start(t); o.stop(t + dur + 2);
    }
  }
  _bell(f, t, vel) {
    const ctx = this.ctx;
    for (const [m, v] of [[1, 1], [2.76, 0.4]]) {
      const o = ctx.createOscillator(); o.frequency.value = f * m;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g); g.connect(this.lightBus); o.start(t); o.stop(t + 1.7);
    }
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
