// ── conspace-rooms · pace.js ────────────────────────────────────────────────
// The world feels how the visitor walks. Two slow signals from the walking
// speed, both 0..1:
//   run   hurrying: the candles shrink and shudder, the light goes cold and
//         green, the tubes stutter, the music presses on, shadows come more
//         often, and the head swims a little (vertigo, never in calm mode)
//   slow  standing or creeping: the candles grow, the light warms to amber,
//         the works sing louder
// Nobody is told; it is only felt. Read by main.js, materials.js (candles),
// kitchen.js (flames), post.js (grade, vertigo), music.js (tempo),
// audio.js (the works' voices) and events.js (shadows).

import { calm } from './calm.js';

const RUN_FROM = 3.4, RUN_FULL = 5.6;            // m/s: walking tops out at 3.2, running at 6
const SLOW_TO = 0.8, SLOW_FROM = 2.6;            // m/s: under this it is slow, over that it is a walk

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const pace = {
  speed: 0, run: 0, slow: 0,
  get vertigo() { return calm.on ? 0 : this.run; },
  _stutter: 4,

  update(dt, speed) {
    this.speed += (speed - this.speed) * Math.min(1, dt / 0.6);
    const run = smooth(RUN_FROM, RUN_FULL, this.speed);
    this.run += (run - this.run) * Math.min(1, dt / (run > this.run ? 1.2 : 2.5));    // the head clears slower than it swims
    const slow = 1 - smooth(SLOW_TO, SLOW_FROM, this.speed);
    this.slow += (slow - this.slow) * Math.min(1, dt / (slow > this.slow ? 4 : 1));   // stillness is earned, haste breaks it at once
    // hurrying through the hospital, a tube near you stutters now and then
    const zone = window.__app?.zone;
    if (this.run > 0.5 && (zone?.fear ?? 0) > 0.5 && (this._stutter -= dt) <= 0) {
      window.__app?.atmo?.flicker?.(0.5 + 0.5 * this.run);
      this._stutter = 3 + Math.random() * 5;
    }
  },
};

// Je suis le spectre d'une rose que tu portais hier au bal.
