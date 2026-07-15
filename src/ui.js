// Welcome screen: collab statement, links, machine capability check, mode select.
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
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);

  let gpuClass = 'unknown';
  if (/(intel|iris|uhd|hd graphics)/i.test(gpu) && !/(arc)/i.test(gpu)) gpuClass = 'low';
  else if (gpu) gpuClass = 'high';

  let recommendedMode = 'keys';
  if (isMobile) recommendedMode = 'light';
  else if (webgl2 && gpuClass !== 'low' && !!navigator.mediaDevices?.getUserMedia) recommendedMode = 'hands';

  return { webgl2, gpu, dpr, touch, isMobile, gpuClass, recommendedMode };
}

export class UI {
  constructor() {
    this.selectedMode = null;
  }

  showCapabilityResult(caps) {
    const el = $('capability-result');
    if (!el) return;
    el.classList.remove('hidden');
    if (!caps.webgl2) {
      el.textContent = 'WebGL2 is not available on this device or browser. This experience needs it to run.';
      return;
    }
    el.textContent = `capability check — GPU: ${caps.gpuClass} · pixel ratio: ${caps.dpr} · `
      + `${caps.touch ? 'touch detected' : 'no touch'}`;
  }

  // DOS-style typed boot sequence, run once on load before the capability
  // line and mode-select settle in. Purely decorative — resolves regardless
  // of typing state so it never blocks entry.
  async runBootSequence(caps) {
    const el = $('boot-sequence');
    if (!el) return;
    const lines = [
      'C:\\CONSPACE>LOADING KERNEL.SYS...',
      'C:\\CONSPACE>MOUNTING SOULS.DAT...',
      `C:\\CONSPACE>GPU: ${(caps.gpuClass || 'unknown').toUpperCase()} — OK`,
      'C:\\CONSPACE>ROOMS.EXE READY_',
    ];
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
    this.selectedMode = recommendedMode;
    const buttons = Array.from(document.querySelectorAll('#mode-select button'));
    const hasWebcam = !!navigator.mediaDevices?.getUserMedia;
    buttons.forEach(btn => {
      const isRecommended = btn.dataset.mode === recommendedMode;
      btn.classList.toggle('selected', isRecommended);
      if (isRecommended) {
        const tag = document.createElement('span');
        tag.className = 'mode-legend';
        tag.textContent = 'recommended for this device';
        btn.appendChild(tag);
      }
      if (btn.dataset.mode === 'hands' && !hasWebcam) {
        const tag = document.createElement('span');
        tag.className = 'mode-legend';
        tag.textContent = 'no webcam detected — will fall back to keyboard';
        btn.appendChild(tag);
      }
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedMode = btn.dataset.mode;
      });
    });
  }

  showWebglError() {
    $('welcome')?.classList.add('hidden');
    $('webgl-error')?.classList.remove('hidden');
  }

  waitForEnter() {
    return new Promise(res => {
      $('btn-enter').addEventListener('click', () => res(this.selectedMode));
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
    el.textContent = 'hold top half to walk · drag to turn · tap artwork to inspect';
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    const hide = () => { el.classList.remove('visible'); setTimeout(() => el.remove(), 600); };
    const timer = setTimeout(hide, 5000);
    addEventListener('touchstart', () => { clearTimeout(timer); hide(); }, { once: true });
  }

  // Persistent low-opacity key legend for keyboard mode — mirrors the
  // touch-hint pattern above but stays up (no auto-fade) since keys mode has
  // more bindings to remember than touch mode.
  showControlHud() {
    if ($('control-hud')) return;
    const el = document.createElement('div');
    el.id = 'control-hud';
    el.innerHTML = '<span>&uarr;/W walk</span><span>&darr;/S back</span>'
      + '<span>&larr;/&rarr; turn</span><span>A/D strafe</span><span>E inspect</span>';
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  // Persistent low-opacity gesture legend for hands mode — mirrors control-hud.
  showHandLegend() {
    if ($('hand-legend')) return;
    const el = document.createElement('div');
    el.id = 'hand-legend';
    el.innerHTML = '<span>both fists = walk</span><span>point right hand = turn right</span>'
      + '<span>point left hand = turn left</span><span>both palms = stop</span>'
      + '<span>spread/pinch palms = zoom</span><span>finger pinch = inspect</span>';
    document.body.appendChild(el);
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
      fsBtn.innerHTML = active ? '⛶ <span>Exit fullscreen</span>' : '⛶ <span>Fullscreen</span>';
    };
    fsBtn.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    });
    document.addEventListener('fullscreenchange', syncFsLabel);

    $('btn-main-screen').addEventListener('click', () => {
      if (!confirm('Leave the labyrinth and return to the main screen?')) return;
      location.reload();
    });

    $('btn-finish').addEventListener('click', () => onFinish?.());
  }

  // Farewell screen: one existential-dread question drawn at random each
  // time, plus credits/links. Purely a DOM overlay — caller is responsible
  // for pausing movement/audio before calling this.
  showFarewell() {
    const questions = [
      'If the room forgot you the moment you left it, would you have been here at all?',
      "Name the version of yourself you buried to become who is reading this. Does it know it's dead?",
      'When you finally stop moving, what will you have been walking toward?',
      'Which of your memories would you erase first, if erasing it meant losing the person who gave it to you?',
      "If your soul were hung on this wall tonight, framed and lit — would you recognize it, or is it a stranger you're required to love?",
      'What part of you only exists because someone else is watching?',
      "You will forget this labyrinth. What makes you so sure you won't forget yourself the same way?",
    ];
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
