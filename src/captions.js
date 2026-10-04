// ── conspace-rooms · captions.js ────────────────────────────────────────────
// Subtitles for the sounds: whoever cannot hear the labyrinth (or walks it
// with the sound off) reads it instead. Chosen on the welcome screen or in
// the menu, kept only in the URL (?cc=1), like the language; nothing is
// stored. Every sound that means something says one short line at the
// bottom of the screen, the way films caption sound: yellow with a black
// edge, [a sound in brackets], ♪ music between notes ♪, and a sound from one
// side sits on that side of the screen. Lines fade by themselves, at
// most three at once, and the same line does not come back too soon.

import { t } from './i18n.js';

const listeners = new Set();
let on = new URLSearchParams(location.search).get('cc') === '1';
let box = null;
const last = new Map();                          // key → when it was last shown (ms)

const SHOW_MS = 3600, MUSIC_MS = 5200, MAX_LINES = 3;
const GAP_MS = 6000;                             // the same line, at the soonest again

function ensureBox() {
  if (box) return box;
  box = document.createElement('div');
  box.id = 'captions';
  box.setAttribute('role', 'log');
  box.setAttribute('aria-live', 'polite');
  document.body.appendChild(box);
  return box;
}

// the side a sound comes from, as the listener stands: dx/dz from the listener (world)
function side(dx, dz) {
  const d = Math.hypot(dx, dz);
  if (!(d > 0.01)) return 0;
  const yaw = window.__app?.player?.yaw ?? 0;
  return (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d;
}

function show(text, ms, place = '') {
  const el = document.createElement('p');
  el.className = 'cc-line' + (place ? ' cc-' + place : '');
  el.textContent = text;
  const b = ensureBox();
  b.appendChild(el);
  while (b.children.length > MAX_LINES) b.firstChild.remove();
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 700);
}

export const captions = {
  get on() { return on; },
  set(value) {
    on = !!value;
    const url = new URL(location.href);
    if (on) url.searchParams.set('cc', '1'); else url.searchParams.delete('cc');
    history.replaceState(history.state, '', url);
    if (!on && box) box.replaceChildren();
    for (const fn of listeners) fn(on);
  },
  onChange(fn) { listeners.add(fn); },

  // say('creak', { dx, dz }) or say('cuckoo', { pan }) or say(key, { at }) for
  // a sound scheduled on the audio clock; gap: seconds before it may repeat
  say(key, { dx, dz, pan, at, gap, music = false } = {}) {
    if (!on) return;                             // with the sound off too: that is when they are read most
    const now = performance.now();
    if (now - (last.get(key) ?? -Infinity) < (gap != null ? gap * 1000 : GAP_MS)) return;
    last.set(key, now);
    const p = pan ?? (dx != null ? side(dx, dz) : 0);
    const text = music ? `♪ ${t('cc_' + key)} ♪` : `[${t('cc_' + key)}]`;
    const place = music ? '' : p < -0.35 ? 'left' : p > 0.35 ? 'right' : '';
    const ctx = window.__app?.audio?.ctx;
    const delay = at != null && ctx ? Math.max(0, (at - ctx.currentTime) * 1000) : 0;
    const ms = music ? MUSIC_MS : SHOW_MS;
    if (delay > 30) setTimeout(() => on && show(text, ms, place), delay); else show(text, ms, place);
  },
};

// Je suis le spectre d'une rose que tu portais hier au bal.
