// ── conspace-rooms · music.js ───────────────────────────────────────────────
// The labyrinth's music, generated live with Web Audio: no files, nobody's
// recording. Three layers share one reverb and cross-fade:
//
//   corridor   three pieces take turns every couple of minutes:
//              · the ward: lo-fi electric piano (below)
//              · estrada: a 70s Soviet VIA ballad in A minor, an electric organ
//                with vibrato, bass guitar, brushes, a vibraphone tune
//              · kosmos: 80s Soviet synth in E minor, a sawtooth arpeggio
//                under a slowly sweeping filter, pads, a pulsing bass
//              and now and then a radio breaks through with the six pips of
//              the time signal. The ward piece:
//              lo-fi electric piano on a slow minor progression (Dm9 · B♭maj7 ·
//              Gm9 · A7♭9), bent by tape wow and flutter; a faint heartbeat on
//              the bar; far down the ward a patient monitor beeps at its own,
//              unsteady pace and now and then sounds its three-note alarm.
//              Fear keeps the beeps and the heartbeat; memory softens them;
//              in the light they are gone and the piano opens up.
//   room       grandmother's room: records through a gramophone horn
//              (band-limited, resonant, overdriven), wobbling at 78 rpm under
//              surface noise and crackle. Three records take turns: an old
//              waltz on a tinny piano, a tango on a bayan, a romance on a
//              seven-string guitar.
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

// estrada: A minor ballad, 84 bpm, one bar per chord
const ESTRADA_BEAT = 60 / 84;
const ESTRADA_CHORDS = [[45, [57, 60, 64]], [50, [57, 62, 65]], [43, [59, 62, 67]], [48, [55, 60, 64]],
  [41, [57, 60, 65]], [50, [57, 62, 65]], [40, [56, 59, 62, 64]], [45, [57, 60, 64]]];   // Am Dm G C F Dm E7 Am
const ESTRADA_SCALE = [69, 71, 72, 74, 76, 77, 79, 81, 83, 84];
// kosmos: E minor, 100 bpm, two bars per chord
const KOSMOS_BEAT = 60 / 100;
const KOSMOS_CHORDS = [[40, [59, 64, 67, 71]], [36, [59, 64, 67, 71]], [45, [60, 64, 67, 71]], [47, [59, 63, 66, 69]]];   // Em Cmaj7 Am9 B7
// tango: D minor, 104 bpm, one bar per chord
const TANGO_BEAT = 60 / 104;
const TANGO_CHORDS = [[38, [62, 65, 69]], [38, [62, 65, 69]], [43, [62, 67, 70]], [45, [61, 64, 67]],
  [38, [62, 65, 69]], [46, [62, 65, 70]], [45, [61, 64, 67]], [38, [62, 65, 69]]];     // Dm Dm Gm A7 Dm Bb A7 Dm
const TANGO_SCALE = [69, 70, 73, 74, 76, 77, 79, 81, 82];
// romance: E minor, 3/4 at 76 bpm, one bar per chord, guitar picking
const ROMANCE_BEAT = 60 / 76;
const ROMANCE_CHORDS = [[40, [52, 55, 59, 64]], [45, [52, 57, 60, 64]], [47, [51, 54, 57, 63]], [40, [52, 55, 59, 64]],
  [36, [52, 55, 60, 64]], [45, [52, 57, 60, 64]], [47, [51, 54, 57, 63]], [40, [52, 55, 59, 64]]];   // Em Am B7 Em C Am B7 Em
const ROMANCE_SCALE = [71, 72, 74, 75, 76, 78, 79, 81, 83];

const PIECE_SECONDS = [110, 170];      // how long one piece plays before another takes over

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
    this._noise = noiseBuffer(ctx, 1);
    this._piece = { corridor: 0, room: 0, corridorUntil: ctx.currentTime + 60 + Math.random() * 60, roomUntil: ctx.currentTime + 90 };
    this._radioAt = ctx.currentTime + 90 + Math.random() * 120;
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
    if (!this.inRoom && this._radioAt < until) { this._radio(this._radioAt); this._radioAt += 150 + Math.random() * 180; }
    else if (this._radioAt < until) this._radioAt = until + 20;
    if (this.inRoom) while (this._t.crackle < until) this._crackle();
    else this._t.crackle = until;
  }

  // the corridor's pieces take turns at phrase boundaries
  _corridorPhrase() {
    const t0 = this._t.corridor;
    if (t0 > this._piece.corridorUntil) {
      this._piece.corridor = (this._piece.corridor + 1 + Math.floor(Math.random() * 2)) % 3;
      this._piece.corridorUntil = t0 + PIECE_SECONDS[0] + Math.random() * (PIECE_SECONDS[1] - PIECE_SECONDS[0]);
      this._bar.corridor = 0;
      this._t.corridor += 1.5;                                   // a breath between pieces
      return;
    }
    const play = !this.inRoom;                                   // keep time in the room, play nothing
    this._t.corridor += [this._wardPhrase, this._estradaPhrase, this._kosmosPhrase][this._piece.corridor].call(this, t0, play);
  }

  // the ward: two bars of one chord, bass, a lazy strum, a few melody notes
  _wardPhrase(t0, play) {
    const B = CORRIDOR_BEAT;
    const idx = this._bar.corridor++ % CORRIDOR_CHORDS.length;
    const [bass, voicing] = CORRIDOR_CHORDS[idx];
    if (!play) return 8 * B;
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
    return 8 * B;
  }

  // estrada: one bar of the ballad, organ held, bass and brushes, a vibraphone line
  _estradaPhrase(t0, play) {
    const B = ESTRADA_BEAT, bar = this._bar.corridor++;
    const [bass, chord] = ESTRADA_CHORDS[bar % ESTRADA_CHORDS.length];
    if (!play) return 4 * B;
    chord.forEach(n => this._organ(midi(n), t0, 3.9 * B, 0.01));
    for (const [beat, step] of [[0, 0], [1.5, 7], [2, 12], [3.5, 7]]) this._bassPluck(midi(bass + step - 12), t0 + beat * B, 0.9 * B, 0.09);
    for (const beat of [1, 3]) this._brush(t0 + beat * B, 0.05);
    for (let k = 0; k < 8; k++) this._hat(t0 + k * B / 2 + (k % 2 ? B * 0.06 : 0), k % 2 ? 0.008 : 0.013);
    const rhythms = [[0, 1, 2], [0, 1.5, 2, 3], [0, 2], [0.5, 1, 2, 3], [0, 3]];
    const r = rhythms[Math.floor(Math.random() * rhythms.length)];
    let pos = this._estradaPos ?? 4;
    r.forEach((beat, k) => {
      if (k === 0) {                                             // start the bar on a chord tone
        const tone = chord[Math.floor(Math.random() * chord.length)] + 12;
        pos = ESTRADA_SCALE.reduce((b, n, i) => Math.abs(n - tone) < Math.abs(ESTRADA_SCALE[b] - tone) ? i : b, 0);
      } else pos = Math.max(0, Math.min(ESTRADA_SCALE.length - 1, pos + [-1, 1, -1, 2, -2, 3][Math.floor(Math.random() * 6)]));
      let note = ESTRADA_SCALE[pos];
      if (bass === 40 && note === 79) note = 80;                 // E7 wants the G sharp
      this._vibes(midi(note), t0 + beat * B, ((r[k + 1] ?? 4) - beat) * B, 0.05);
    });
    this._estradaPos = pos;
    return 4 * B;
  }

  // kosmos: one bar, a sixteenth-note arpeggio, a pad under it, the bass in eighths
  _kosmosPhrase(t0, play) {
    const B = KOSMOS_BEAT, bar = this._bar.corridor++;
    const [bass, chord] = KOSMOS_CHORDS[Math.floor(bar / 2) % KOSMOS_CHORDS.length];
    if (!play) return 4 * B;
    const sweep = 700 + 900 * (0.5 + 0.5 * Math.sin(t0 * 0.07));   // the filter opens and closes over minutes
    const up = [...chord, chord[0] + 12, ...chord.slice(1).map(n => n + 12)];
    for (let k = 0; k < 16; k++) {
      const i = k % 8, n = i < 4 ? up[i] : up[7 - i + 1] ?? up[i];
      this._sawNote(midi(n), t0 + k * B / 4, B / 4 * 0.9, 0.022, sweep);
    }
    if (bar % 2 === 0) chord.forEach(n => this._pad(midi(n - 12), t0, 7.6 * B, 0.012, this.corridorIn));
    for (let k = 0; k < 8; k++) this._sawNote(midi(bass - 12 + (k % 4 === 3 ? 7 : 0)), t0 + k * B / 2, B / 2 * 0.7, 0.06, 420);
    if (bar % 8 >= 4 && Math.random() < 0.5) {                   // a lead, gliding in on the second half
      const n = chord[Math.floor(Math.random() * chord.length)] + 12;
      this._lead(midi(n), midi(n + (Math.random() < 0.5 ? 2 : -2)), t0 + B, 2.5 * B, 0.025);
    }
    return 4 * B;
  }

  // the radio breaking through: tuning noise, then the six pips of the time signal
  _radio(t) {
    const ctx = this.ctx;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.4;
    const out = ctx.createGain(); out.gain.value = 1;
    bp.connect(out); out.connect(this.corridorBus); out.connect(this.wardSend);
    const hiss = ctx.createBufferSource(); hiss.buffer = this._noise; hiss.loop = true;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t); hg.gain.exponentialRampToValueAtTime(0.03, t + 0.8);
    hg.gain.setValueAtTime(0.03, t + 7.5); hg.gain.exponentialRampToValueAtTime(0.0001, t + 9);
    const sweepF = ctx.createBiquadFilter(); sweepF.type = 'bandpass'; sweepF.Q.value = 6;
    sweepF.frequency.setValueAtTime(400, t); sweepF.frequency.exponentialRampToValueAtTime(3000, t + 1.4); sweepF.frequency.exponentialRampToValueAtTime(1100, t + 2);
    hiss.connect(sweepF); sweepF.connect(hg); hg.connect(bp);
    hiss.start(t); hiss.stop(t + 9.2);
    for (let k = 0; k < 6; k++) {
      const pt = t + 2.5 + k, o = ctx.createOscillator(); o.frequency.value = 1000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, pt); g.gain.exponentialRampToValueAtTime(0.07, pt + 0.005);
      g.gain.setValueAtTime(0.07, pt + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, pt + 0.115);
      o.connect(g); g.connect(bp); o.start(pt); o.stop(pt + 0.13);
    }
    setTimeout(() => { try { out.disconnect(); } catch (e) { /* gone */ } }, (t - ctx.currentTime + 10) * 1000);
  }

  // the room's records take turns; out of the room they only keep time
  _roomBar() {
    const t0 = this._t.room;
    if (t0 > this._piece.roomUntil) {
      this._piece.room = (this._piece.room + 1 + Math.floor(Math.random() * 2)) % 3;
      this._piece.roomUntil = t0 + 80 + Math.random() * 60;
      this._bar.room = 0;
      this._t.room += 2;                                          // the needle lifted and set down
      if (this.inRoom) this._click(t0 + 0.4, 0.3, 700, this.roomBus);
      return;
    }
    this._t.room += [this._waltzBar, this._tangoBar, this._romanceBar][this._piece.room].call(this, t0, this.inRoom);
  }

  // one bar of the waltz: bass on one, the chord on two and three, a melody line
  _waltzBar(t0, play) {
    const B = ROOM_BEAT, bar = this._bar.room++;
    if (!play) return 3 * B;
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
    return 3 * B;
  }

  // one bar of the tango: the habanera in the bass, bayan chords, a dotted, dramatic line
  _tangoBar(t0, play) {
    const B = TANGO_BEAT, bar = this._bar.room++;
    const [bass, chord] = TANGO_CHORDS[bar % TANGO_CHORDS.length];
    if (!play) return 4 * B;
    for (const [beat, step, len] of [[0, 0, 1.2], [1.5, 7, 0.4], [2, 12, 0.8], [3, 7, 0.6]]) this._piano(midi(bass + step), t0 + beat * B, len * B, 0.11);
    for (const beat of [1, 3]) chord.forEach(n => this._bayan(midi(n), t0 + beat * B, 0.35 * B, 0.03));
    const rhythms = [[0, 1.5, 2, 3], [0, 0.75, 1, 2], [0, 2, 2.5, 3], [0.5, 1, 1.5, 2, 3]];
    const r = rhythms[Math.floor(Math.random() * rhythms.length)];
    let pos = this._tangoPos ?? 3;
    r.forEach((beat, k) => {
      if (k === 0) { const tone = chord[Math.floor(Math.random() * chord.length)] + 12; pos = TANGO_SCALE.reduce((b, n, i) => Math.abs(n - tone) < Math.abs(TANGO_SCALE[b] - tone) ? i : b, 0); }
      else pos = Math.max(0, Math.min(TANGO_SCALE.length - 1, pos + [-1, 1, -1, -2, 2][Math.floor(Math.random() * 5)]));
      this._bayan(midi(TANGO_SCALE[pos]), t0 + beat * B, ((r[k + 1] ?? 4) - beat) * B * 0.92, 0.06);
    });
    this._tangoPos = pos;
    return 4 * B;
  }

  // one bar of the romance: the bass on one, the guitar picking through the chord,
  // now and then a melody note on top
  _romanceBar(t0, play) {
    const B = ROMANCE_BEAT, bar = this._bar.room++;
    const [bass, chord] = ROMANCE_CHORDS[bar % ROMANCE_CHORDS.length];
    if (!play) return 3 * B;
    this._guitar(midi(bass), t0, 0.16);
    const pick = [chord[1], chord[2], chord[3], chord[2], chord[1]];
    pick.forEach((n, k) => this._guitar(midi(n), t0 + (k + 1) * B / 2 + Math.random() * 0.015, 0.07));
    if (Math.random() < 0.7) {
      let pos = this._romancePos ?? 4;
      pos = Math.max(0, Math.min(ROMANCE_SCALE.length - 1, pos + [-1, 1, -2, 2, 0][Math.floor(Math.random() * 5)]));
      this._guitar(midi(ROMANCE_SCALE[pos]), t0 + (Math.random() < 0.5 ? 0 : 1) * B, 0.13);
      this._romancePos = pos;
    }
    return 3 * B;
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
  // electric organ, the Yunost kind: two detuned pulse waves and a sub, a
  // vibrato, softened by a lowpass
  _organ(f, t, dur, vel) {
    const ctx = this.ctx, amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(vel, t + 0.03);
    amp.gain.setValueAtTime(vel, t + dur); amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000;
    lp.connect(amp); amp.connect(this.corridorIn);
    const vib = ctx.createOscillator(); vib.frequency.value = 5.8;
    const vg = ctx.createGain(); vg.gain.value = f * 0.004; vib.connect(vg);
    for (const [type, mul, cents, v] of [['square', 1, 4, 0.5], ['square', 1, -4, 0.5], ['sine', 0.5, 0, 0.6]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul * Math.pow(2, cents / 1200);
      vg.connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = v; o.connect(g); g.connect(lp);
      o.start(t); o.stop(t + dur + 0.25);
    }
    vib.start(t); vib.stop(t + dur + 0.25);
  }
  // vibraphone: a sine and its bar partial, trembling
  _vibes(f, t, dur, vel) {
    const ctx = this.ctx, amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(vel, t + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(1.2, dur + 0.8));
    const trem = ctx.createGain(); trem.gain.value = 0.75;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const lg = ctx.createGain(); lg.gain.value = 0.25;
    lfo.connect(lg); lg.connect(trem.gain);
    amp.connect(trem); trem.connect(this.corridorIn);
    for (const [m, v] of [[1, 1], [4, 0.12]]) { const o = ctx.createOscillator(); o.frequency.value = f * m; const g = ctx.createGain(); g.gain.value = v; o.connect(g); g.connect(amp); o.start(t); o.stop(t + dur + 1.3); }
    lfo.start(t); lfo.stop(t + dur + 1.3);
  }
  _bassPluck(f, t, dur, vel) {
    const ctx = this.ctx, amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(vel, t + 0.006); amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
    lp.connect(amp); amp.connect(this.corridorIn);
    for (const [type, v] of [['triangle', 1], ['sine', 0.7]]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = v; o.connect(g); g.connect(lp); o.start(t); o.stop(t + dur + 0.35); }
  }
  _noiseHit(t, vel, type, freq, q, len) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this._noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f); f.connect(g); g.connect(this.corridorIn); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }
  _brush(t, vel) { this._noiseHit(t, vel, 'bandpass', 2800, 0.6, 0.16); }
  _hat(t, vel) { this._noiseHit(t, vel, 'highpass', 7500, 0.7, 0.04); }
  // a sawtooth through a lowpass that snaps shut: the arpeggiator's voice
  _sawNote(f, t, dur, vel, cut) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(cut * 1.8, t); lp.frequency.exponentialRampToValueAtTime(cut * 0.5, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(lp); lp.connect(g); g.connect(this.corridorIn); o.start(t); o.stop(t + dur + 0.08);
  }
  // a square lead gliding from one note to the next
  _lead(f0, f1, t, dur, vel) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(f0, t); o.frequency.setTargetAtTime(f1, t + dur * 0.5, 0.15);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.12); g.gain.setValueAtTime(vel, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    o.connect(lp); lp.connect(g); g.connect(this.corridorIn); g.connect(this.corridorSend); o.start(t); o.stop(t + dur + 0.7);
  }
  // bayan: two reeds a little apart (the musette beat), reedy, into the gramophone
  _bayan(f, t, dur, vel) {
    const ctx = this.ctx, amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(vel, t + 0.04);
    amp.gain.setValueAtTime(vel, t + dur); amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    lp.connect(amp); amp.connect(this.roomIn);
    for (const cents of [-9, 9]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * Math.pow(2, cents / 1200); o.connect(lp); o.start(t); o.stop(t + dur + 0.15); }
  }
  // a guitar string: bright at the pluck, dying away
  _guitar(f, t, vel) {
    const ctx = this.ctx, amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(vel, t + 0.003);
    amp.gain.exponentialRampToValueAtTime(vel * 0.25, t + 0.3); amp.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    amp.connect(this.roomIn);
    for (const [m, v] of [[1, 1], [2, 0.5], [3, 0.25], [4.02, 0.12]]) { const o = ctx.createOscillator(); o.frequency.value = f * m; const g = ctx.createGain(); g.gain.value = v; o.connect(g); g.connect(amp); o.start(t); o.stop(t + 2.3); }
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
  _pad(f, t, dur, vel, dest = this.lightBus) {
    const ctx = this.ctx, amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime(vel, t + 0.9);
    amp.gain.setValueAtTime(vel, t + dur); amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.8);
    amp.connect(dest);
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
