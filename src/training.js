import { t } from './i18n.js';

// ── conspace-rooms · training.js ────────────────────────────────────────────
// Тренировка / Training: chosen beside ВОЙТИ in the gesture mode. The walk
// begins as usual, and a panel teaches the six gestures one at a time: a
// gesture counts once the camera has held it for a moment. If it will not
// come, the panel says what the camera sees instead (no hands, one hand,
// the other hand, a palm instead of a fist) and how to put it right. Boards
// and paintings stay quiet meanwhile (window.__app.training).

const HOLD = 1.0;          // seconds a gesture must hold to count
const HINT_AFTER = 4;      // seconds without success before the panel explains
const ZOOM_NEED = 0.08;    // hand-distance change that counts as a zoom

const STEPS = [
  { id: 'walk',  glyph: '✊',       two: false, ok: h => h.anyFist && !h.bothFists },
  { id: 'run',   glyph: '✊✊',     two: true,  ok: h => h.bothFists },
  { id: 'right', glyph: '✊ →',     two: false, ok: h => h.turnRight && !h.bothFists },
  { id: 'left',  glyph: '← ✊',     two: false, ok: h => h.turnLeft && !h.bothFists },
  { id: 'stop',  glyph: '✋✋',     two: true,  ok: h => h.stopped },
  { id: 'zoom',  glyph: '✋ ↔ ✋',  two: true,  ok: h => h.stopped },   // and the palms move (below)
];

// What is wrong, from what the camera sees right now.
function hintFor(step, h) {
  if (!h.present) return t('trainHintNoHands');
  const seen = [h.left, h.right].filter(Boolean);
  if (step.two && seen.length < 2) return t('trainHintTwoHands');
  const has = name => seen.includes(name);
  switch (step.id) {
    case 'walk': case 'run':
      if (has('palm')) return t('trainHintFist');
      if (has('point')) return t('trainHintFistPoint');
      break;
    case 'right': case 'left':
      if (h.bothFists) return t('trainHintOneFist');
      if (!h.anyFist) return has('point') ? t('trainHintFistPoint') : t('trainHintFist');
      if (step.id === 'right' ? h.turnLeft : h.turnRight) return t('trainHintOtherWay');
      return t('trainHintCarry');
    case 'stop':
      if (has('fist')) return t('trainHintPalms');
      break;
    case 'zoom':
      if (h.stopped) return t('trainHintMove');
      if (has('fist')) return t('trainHintPalms');
      break;
  }
  return t('trainHintSteady');
}

export function startTraining({ player, onDone }) {
  window.__app && (window.__app.training = true);
  const labels = t('trainSteps');
  const el = document.createElement('div');
  el.id = 'training';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <p class="train-head"><span>${t('train')}</span><span class="train-count"></span></p>
    <div class="train-glyph" aria-hidden="true"></div>
    <p class="train-label"></p>
    <div class="train-bar"><i></i></div>
    <p class="train-hint"></p>
    <div class="train-actions">
      <button type="button" class="train-skip">${t('trainSkip')}</button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  const $ = s => el.querySelector(s);

  let i = -1, held = 0, since = 0, zoom = 0, doneAt = 0, raf = 0, last = performance.now();
  const next = () => {
    i++; held = 0; since = 0; zoom = 0;
    if (i >= STEPS.length) return finish();
    const s = STEPS[i];
    $('.train-count').textContent = `${i + 1} / ${STEPS.length}`;
    $('.train-glyph').textContent = s.glyph;
    $('.train-label').textContent = labels[i];
    $('.train-hint').textContent = '';
    el.classList.remove('got');
  };

  const finish = () => {
    doneAt = performance.now();
    $('.train-count').textContent = '';
    $('.train-glyph').textContent = '✓';
    $('.train-label').textContent = t('trainDone');
    $('.train-hint').textContent = '';
    $('.train-bar').style.visibility = 'hidden';
    $('.train-skip').textContent = t('trainGo');
    el.classList.add('done');
  };

  const close = () => {
    cancelAnimationFrame(raf);
    window.__app && (window.__app.training = false);
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 600);
    onDone?.();
  };
  $('.train-skip').addEventListener('click', close);

  const tick = now => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (doneAt) { if (now - doneAt > 3500) close(); return; }   // then onDone: the new labyrinth
    if (i < 0 || i >= STEPS.length) return;
    const s = STEPS[i], h = player.hand || {};
    since += dt;
    let ok = s.ok(h);
    if (s.id === 'zoom') { zoom += Math.abs(h.zoomDelta || 0); ok = ok && zoom > ZOOM_NEED; held = ok ? HOLD : Math.min(0.95, zoom / ZOOM_NEED) * HOLD; }
    else held = ok ? held + dt : Math.max(0, held - dt * 2);
    $('.train-bar i').style.width = `${Math.min(1, held / HOLD) * 100}%`;
    if (held >= HOLD) {
      el.classList.add('got');
      $('.train-hint').textContent = t('trainGot');
      i = STEPS.length + i;                            // pause the checks for a beat, then the next gesture
      setTimeout(() => { i -= STEPS.length; next(); }, 900);
      return;
    }
    if (ok) $('.train-hint').textContent = '';
    else if (since > HINT_AFTER) $('.train-hint').textContent = hintFor(s, h);
  };
  next();
  raf = requestAnimationFrame(tick);
}

// Je suis le spectre d'une rose que tu portais hier au bal.
