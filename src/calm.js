// ── conspace-rooms · calm.js ────────────────────────────────────────────────
// One switch for a quieter piece: the lamps dim slowly where they stuttered,
// the glitch is a quarter of itself, the head does not bob, the candles do
// not shudder, the crossing between stages flies slowly. It is on by itself
// where the system asks for reduced motion, and the menu's "flicker" item
// turns it on or off for this visit. Nothing is stored.

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const listeners = new Set();
let choice = null;                                   // null: follow the system

export const calm = {
  get on() { return choice ?? !!media?.matches; },
  set(value) { choice = !!value; for (const fn of listeners) fn(calm.on); },
  onChange(fn) { listeners.add(fn); },
};
media?.addEventListener?.('change', () => { if (choice === null) for (const fn of listeners) fn(calm.on); });

// Je suis le spectre d'une rose que tu portais hier au bal.
