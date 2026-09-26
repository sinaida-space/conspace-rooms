// Welcome screen: collab statement, links, machine capability check, mode select.
import { detectDevice } from './device.js';
import { t, getLang, setLang, langFromUrl, applyStatic } from './i18n.js';
import { renderFooter } from './footer.js';

const $ = id => document.getElementById(id);
const wait = ms => new Promise(res => setTimeout(res, ms));

// WebGL2 support (hard requirement) + GPU class heuristic + dpr + touch.
export function detectCapabilities() {
  let webgl2 = false, gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    webgl2 = !!gl;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    }
  } catch (e) { /* no webgl2 */ }

  const dpr = window.devicePixelRatio || 1;
  const device = detectDevice();
  const touch = device.isTouch;
  const isMobile = device.isMobile;

  let gpuClass = 'unknown';
  if (/(intel|iris|uhd|hd graphics)/i.test(gpu) && !/(arc)/i.test(gpu)) gpuClass = 'low';
  else if (gpu) gpuClass = 'high';

  let recommendedMode = 'keys';
  if (!(device.isMobile || device.coarsePointer) && webgl2 && gpuClass !== 'low' && device.hasCamera) recommendedMode = 'hands';

  return { webgl2, gpu, dpr, touch, isMobile, gpuClass, recommendedMode, device };
}

export class UI {
  constructor() {
    this.selectedMode = null;
  }

  // Language gate: the very first screen. A ?lang= link (or a reload after
  // choosing) skips it. Nothing is stored; the choice lives in the URL.
  async gateLanguage() {
    const gate = $('lang-gate');
    const preset = langFromUrl();
    if (preset) {
      setLang(preset);
      gate?.classList.add('hidden');
      applyStatic();
      renderFooter(getLang());
      return;
    }
    const el = $('lang-boot');
    if (el) await this._typeLine(el, 'C:\\CONSPACE>ВЫБЕРИТЕ ЯЗЫК / SELECT LANGUAGE_');
    const byBrowser = (navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
    gate?.querySelector(`[data-lang="${byBrowser}"]`)?.focus({ preventScroll: true });
    const chosen = await new Promise(res => {
      gate?.querySelectorAll('[data-lang]').forEach(b =>
        b.addEventListener('click', () => res(b.dataset.lang), { once: true }));
    });
    setLang(chosen);
    applyStatic();
    renderFooter(getLang());
    gate?.classList.add('hidden');
  }

  // Cookie/consent gate: shown once (persisted in localStorage) before the
  // welcome screen. Resolves immediately if consent was already given.
  async gateConsent() {
    let consented = false;
    try { consented = localStorage.getItem('conspace-consent') === '1'; } catch (e) { /* storage blocked */ }
    if (consented) {
      $('cookie-gate')?.classList.add('hidden');
      return;
    }
    $('cookie-gate')?.classList.remove('hidden');
    await this._typeCookieBoot();
    await new Promise(res => {
      $('btn-consent')?.addEventListener('click', () => {
        try { localStorage.setItem('conspace-consent', '1'); } catch (e) { /* storage blocked */ }
        res();
      }, { once: true });
    });
    $('cookie-gate')?.classList.add('hidden');
  }

  async _typeCookieBoot() {
    const el = $('cookie-boot');
    if (!el) return;
    const lines = t('cookieBoot');
    for (const line of lines) {
      await this._typeLine(el, line);
      await wait(120);
    }
  }

  showCapabilityResult(caps) {
    const el = $('capability-result');
    if (!el) return;
    el.classList.remove('hidden');
    if (!caps.webgl2) {
      el.textContent = t('noWebgl');
      return;
    }
    el.textContent = t('capability', { gpu: caps.gpuClass, dpr: caps.dpr, touch: t(caps.touch ? 'touchYes' : 'touchNo') });
  }

  // DOS-style typed boot sequence, run once on load before the capability
  // line and mode-select settle in. Purely decorative — resolves regardless
  // of typing state so it never blocks entry.
  async runBootSequence(caps) {
    const el = $('boot-sequence');
    if (!el) return;
    this._armPacman();
    const lines = t('boot', { gpu: (caps.gpuClass || 'unknown').toUpperCase() });
    for (const line of lines) {
      await this._typeLine(el, line);
      await wait(120);
    }
  }

  _typeLine(el, text) {
    return new Promise(res => {
      const row = document.createElement('div');
      el.appendChild(row);
      let i = 0;
      const step = () => {
        row.textContent = text.slice(0, i);
        if (i < text.length) { i++; setTimeout(step, 14); }
        else res();
      };
      step();
    });
  }

  initModeSelect(recommendedMode, caps = {}) {
    const isTouch = !!(caps.device?.isTouch ?? caps.touch);
    if (isTouch && recommendedMode === 'hands') recommendedMode = 'keys';
    this.selectedMode = recommendedMode;
    const buttons = Array.from(document.querySelectorAll('#mode-select button'));
    const hasWebcam = !!navigator.mediaDevices?.getUserMedia;
    buttons.forEach(btn => {
      // one method on every device: a phone gets the on-screen pad legend, no keyboard talk
      if (btn.dataset.mode === 'keys' && isTouch) btn.querySelector('.mode-legend').textContent = t('legendPad');
      const isHands = btn.dataset.mode === 'hands';
      const isRecommended = btn.dataset.mode === recommendedMode && !(isHands && isTouch);
      btn.classList.toggle('selected', isRecommended);
      if (isRecommended) {
        const tag = document.createElement('span');
        tag.className = 'mode-legend';
        tag.textContent = t('recommended');
        btn.appendChild(tag);
      }
      if (isHands && !hasWebcam) {
        const tag = document.createElement('span');
        tag.className = 'mode-legend';
        tag.textContent = t('noCamKeys');
        btn.appendChild(tag);
      }
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedMode = btn.dataset.mode;
      });
    });
  }

  // Easter egg: clicking the CONSPACE ROOMS wordmark opens a small Pac-Man
  // in the site's phosphor greens (src/pacman.js, loaded on demand).
  _armPacman() {
    if (this._eggArmed) return;
    this._eggArmed = true;
    const mark = $('wordmark');
    if (!mark) return;
    mark.addEventListener('click', async () => {
      const { openPacman } = await import('./pacman.js');
      openPacman();
    });
  }

  showWebglError() {
    $('cookie-gate')?.classList.add('hidden');
    $('welcome')?.classList.add('hidden');
    $('webgl-error')?.classList.remove('hidden');
  }

  // Resolves { mode, cameraStream }. cameraStream is a Promise<MediaStream> or
  // null, created synchronously inside the click listener (before any await)
  // so iOS user-activation is still live when getUserMedia is called. A
  // no-op .catch() is attached so a rejection here is never unhandled; the
  // caller (main.js) awaits the same promise and handles the real error.
  waitForEnter() {
    return new Promise(res => {
      $('btn-enter').addEventListener('click', () => {
        let cameraStream = null;
        if (this.selectedMode === 'hands' && navigator.mediaDevices?.getUserMedia) {
          cameraStream = navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
          cameraStream.catch(() => {});
        }
        res({ mode: this.selectedMode, cameraStream });
      });
    });
  }

  hideWelcome() {
    $('welcome')?.classList.add('hidden');
  }

  // On-screen pad for the buttons mode: arrows hold the same keys the keyboard
  // does, LOOK CLOSER inspects and wakes up only when an artwork is in reach
  // (artworks.js sets body.can-inspect).
  showPad({ keys, pick }) {
    if ($('pad')) return;
    const el = document.createElement('div');
    el.id = 'pad';
    const labels = t('padLabels');
    el.innerHTML = `
      <div class="pad-arrows">
        <button type="button" data-key="ArrowUp" class="pad-up" aria-label="${labels[0]}">▲</button>
        <button type="button" data-key="ArrowLeft" aria-label="${labels[2]}">◄</button>
        <button type="button" data-key="ArrowDown" aria-label="${labels[1]}">▼</button>
        <button type="button" data-key="ArrowRight" aria-label="${labels[3]}">►</button>
      </div>
      <button type="button" class="pad-inspect"><span class="pi-open">${t('padInspect')}</span><span class="pi-close">${t('padBack')}</span></button>`;
    for (const b of el.querySelectorAll('[data-key]')) {
      const set = v => e => {
        e.preventDefault();
        keys()[b.dataset.key] = v; keys().Pad = v && b.dataset.key === 'ArrowUp' ? 1 : 0;
        b.classList.toggle('held', !!v);
        if (v) b.setPointerCapture?.(e.pointerId);
      };
      b.addEventListener('pointerdown', set(1));
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, set(0));
    }
    el.querySelector('.pad-inspect').addEventListener('click', () => { const b = document.body.classList; if (b.contains('can-inspect') || b.contains('inspecting')) pick(); });
    el.addEventListener('contextmenu', e => e.preventDefault());
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  // The bottom legend stays on one line, centred between the pad's arrows and
  // the buttons in the right corner. If it does not fit there it shrinks once,
  // then steps aside entirely: nothing on screen may overlap. Its height goes
  // out as --hud-h so the artwork prompt (artworks.js) sits just above it.
  _trackHudHeight(el) {
    const fit = () => {
      el.classList.remove('no-room');
      el.style.fontSize = '';
      const room = () => {
        const band = el.getBoundingClientRect(), mid = innerWidth / 2;
        let half = mid - 16;
        for (const sel of ['#pad .pad-arrows', '#pad .pad-inspect', '#btn-mute']) {
          const o = document.querySelector(sel);
          if (!o || o.classList.contains('hidden')) continue;
          const r = o.getBoundingClientRect();
          if (!r.width || r.bottom < band.top - 8 || r.top > band.bottom + 8) continue;  // not in the legend's band
          half = Math.min(half, r.left > mid ? r.left - mid - 12 : mid - r.right - 12);
        }
        return el.scrollWidth / 2 <= half;
      };
      if (room()) return;
      el.style.fontSize = '0.8em';
      if (!room()) el.classList.add('no-room');
    };
    const watch = new MutationObserver(() => set());
    const set = () => {
      if (!el.isConnected) { watch.disconnect(); removeEventListener('resize', set); return; }   // the legend was replaced
      fit();
      document.documentElement.style.setProperty('--hud-h', `${el.classList.contains('no-room') ? 0 : el.offsetHeight}px`);
    };
    set();
    addEventListener('resize', set);
    watch.observe(document.body, { childList: true });   // the pad arrives later
  }

  // Persistent low-opacity key legend for keyboard mode — mirrors the
  // pad above but stays up (no auto-fade) since keys mode has
  // more bindings to remember than touch mode.
  showControlHud() {
    if ($('control-hud')) return;
    const el = document.createElement('div');
    el.id = 'control-hud';
    el.innerHTML = t('hud').map(s => `<span>${s}</span>`).join('');
    document.body.appendChild(el);
    this._trackHudHeight(el);
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  // Persistent low-opacity gesture legend for hands mode — mirrors control-hud.
  showHandLegend() {
    if ($('hand-legend')) return;
    const el = document.createElement('div');
    el.id = 'hand-legend';
    el.innerHTML = t('handLegend').map(s => `<span>${s}</span>`).join('');
    document.body.appendChild(el);
    this._trackHudHeight(el);
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  // Fullscreen / main-screen / finish toolbar, shown once the mode is chosen.
  showExperienceControls({ onFinish } = {}) {
    const toolbar = $('hud-toolbar');
    if (!toolbar) return;
    toolbar.classList.remove('hidden');

    // the menu opens on its tape and folds away after any choice or a tap elsewhere
    const menuBtn = $('btn-menu'), menu = $('hud-menu');
    const setMenu = open => { menu.classList.toggle('hidden', !open); menuBtn.setAttribute('aria-expanded', String(open)); };
    menuBtn.addEventListener('click', e => { e.stopPropagation(); setMenu(menu.classList.contains('hidden')); });
    menu.addEventListener('click', () => setMenu(false));
    addEventListener('pointerdown', e => { if (!toolbar.contains(e.target)) setMenu(false); });
    addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

    const fsBtn = $('btn-fullscreen');
    const syncFsLabel = () => {
      const active = !!document.fullscreenElement;
      fsBtn.querySelector('span').textContent = t(active ? 'exitFullscreen' : 'fullscreen');
    };
    fsBtn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    });
    document.addEventListener('fullscreenchange', syncFsLabel);

    // In-page confirm: window.confirm() is silently blocked in some embedded
    // browsers, which left this button doing nothing.
    $('btn-main-screen').addEventListener('click', async () => {
      if (await this.confirmDialog(t('confirmLeave'))) location.href = `index.html?lang=${getLang()}`;
    });

    $('btn-finish').addEventListener('click', () => onFinish?.());
  }

  // Terminal-styled yes/no dialog. Resolves true on Yes/Enter, false on
  // No/Escape/backdrop click.
  confirmDialog(text) {
    return new Promise(res => {
      const wrap = document.createElement('div');
      wrap.className = 'dialog';
      wrap.innerHTML = `<div class="dialog-box" role="alertdialog" aria-modal="true">
        <p class="dialog-bar">SYSTEM</p><p class="dialog-text"></p>
        <div class="dialog-actions">
          <button type="button" class="btn-enter" data-v="1">${t('yes')}</button>
          <button type="button" class="btn-enter dialog-no" data-v="0">${t('no')}</button>
        </div></div>`;
      wrap.querySelector('.dialog-text').textContent = text;
      document.body.appendChild(wrap);
      document.exitPointerLock?.();
      const done = v => { removeEventListener('keydown', onKey, true); wrap.remove(); res(v); };
      const onKey = e => {
        if (e.code === 'Escape') { e.stopPropagation(); done(false); }
        if (e.code === 'Enter') { e.stopPropagation(); done(true); }
      };
      addEventListener('keydown', onKey, true);
      wrap.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (b) done(b.dataset.v === '1');
        else if (e.target === wrap) done(false);
      });
      wrap.querySelector('[data-v="1"]').focus({ preventScroll: true });
    });
  }

  // Farewell screen: one existential-dread question drawn at random each
  // time, plus credits/links. Purely a DOM overlay — caller is responsible
  // for pausing movement/audio before calling this.
  showFarewell() {
    const questions = t('questions');
    const q = questions[Math.floor(Math.random() * questions.length)];
    const qEl = $('farewell-question');
    if (qEl) qEl.textContent = q;
    $('hud-toolbar')?.classList.add('hidden');
    $('btn-mute')?.classList.add('hidden');
    $('hand-legend')?.remove();
    $('control-hud')?.remove();
    $('pad')?.remove();
    $('roses')?.remove();
    $('final-card')?.remove();
    $('farewell')?.classList.remove('hidden');
    $('btn-walk-again')?.addEventListener('click', () => location.reload(), { once: true });
  }

  // Small transient message (e.g. webcam-denied fallback notice).
  showToast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    let top = 16;                                       // under the toolbar and the rose, never on them
    for (const el of [$('hud-toolbar'), $('roses')]) if (el && !el.classList.contains('hidden')) top = Math.max(top, el.getBoundingClientRect().bottom + 12);
    el.style.setProperty('--toast-top', `${Math.round(top)}px`);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 600);
    }, 3500);
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
