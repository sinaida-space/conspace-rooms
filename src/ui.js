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
  if (device.isMobile || device.coarsePointer) recommendedMode = 'light';
  else if (webgl2 && gpuClass !== 'low' && device.hasCamera) recommendedMode = 'hands';

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
    gate?.querySelector(`[data-lang="${byBrowser}"]`)?.focus();
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
    this._armSoulsEgg();
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
    if (isTouch && recommendedMode === 'hands') recommendedMode = 'light';
    this.selectedMode = recommendedMode;
    const buttons = Array.from(document.querySelectorAll('#mode-select button'));
    const hasWebcam = !!navigator.mediaDevices?.getUserMedia;
    buttons.forEach(btn => {
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
        tag.textContent = t(isTouch ? 'noCamTouch' : 'noCamKeys');
        btn.appendChild(tag);
      }
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedMode = btn.dataset.mode;
      });
    });
  }

  // Easter egg: type "souls" (or tap the wordmark five times) during the
  // welcome screen and one SOULS piece is redrawn as an ASCII portrait,
  // sampled locally from its own pixels.
  _armSoulsEgg() {
    if (this._eggArmed) return;
    this._eggArmed = true;
    let typed = '', taps = 0, tapTimer = 0;
    const fire = () => { this._drawSoulsAscii(); typed = ''; taps = 0; };
    addEventListener('keydown', e => {
      if ($('welcome')?.classList.contains('hidden')) return;
      const k = e.key.toLowerCase();
      // "ыщгды" is what "souls" types on a Russian layout
      const map = { ы: 's', щ: 'o', г: 'u', д: 'l' };
      typed = (typed + (map[k] || k)).slice(-5);
      if (typed === 'souls') fire();
    });
    $('wordmark')?.addEventListener('click', () => {
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { taps = 0; }, 1200);
      if (++taps >= 5) fire();
    });
  }

  async _drawSoulsAscii() {
    const pre = $('souls-ascii');
    if (!pre) return;
    const n = 1 + Math.floor(Math.random() * 18);
    const img = new Image();
    img.src = `assets/artworks/${String(n).padStart(2, '0')}.jpg`;
    try { await img.decode(); } catch (e) { return; }
    const cols = 96;
    const rows = Math.round(cols * (img.height / img.width) * 0.5); // glyph cells are ~2× taller than wide
    const c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, cols, rows);
    const px = ctx.getImageData(0, 0, cols, rows).data;
    const ramp = ' .:-=+*#%@';
    let out = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
        out += ramp[Math.min(ramp.length - 1, Math.floor(l * ramp.length))];
      }
      out += '\n';
    }
    pre.textContent = out;
    pre.classList.remove('hidden');
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

  // Shown once for light-mode touch controls; fades on its own or on first touch.
  showTouchHint() {
    if ($('touch-hint')) return;
    const el = document.createElement('div');
    el.id = 'touch-hint';
    el.textContent = t('touchHint');
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    const hide = () => { el.classList.remove('visible'); setTimeout(() => el.remove(), 600); };
    const timer = setTimeout(hide, 5000);
    addEventListener('touchstart', () => { clearTimeout(timer); hide(); }, { once: true });
  }

  // Publishes the bottom legend's height as --hud-h so the artwork prompt
  // (artworks.js) can sit just above it instead of on top of it.
  _trackHudHeight(el) {
    const set = () => document.documentElement.style.setProperty('--hud-h', `${el.offsetHeight}px`);
    set();
    new ResizeObserver(set).observe(el);
  }

  // Persistent low-opacity key legend for keyboard mode — mirrors the
  // touch-hint pattern above but stays up (no auto-fade) since keys mode has
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

    $('btn-main-screen').addEventListener('click', () => {
      if (!confirm(t('confirmLeave'))) return;
      location.reload();
    });

    $('btn-finish').addEventListener('click', () => onFinish?.());
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
    $('touch-hint')?.remove();
    $('farewell')?.classList.remove('hidden');
    $('btn-walk-again')?.addEventListener('click', () => location.reload(), { once: true });
  }

  // Small transient message (e.g. webcam-denied fallback notice).
  showToast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 600);
    }, 3500);
  }
}

// Je suis le spectre d'une rose que tu portais hier au bal.
