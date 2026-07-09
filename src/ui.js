// Welcome screen: collab statement, links, machine capability check, mode select.
const $ = id => document.getElementById(id);

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
    if (!caps.webgl2) {
      el.textContent = 'WebGL2 is not available on this device or browser. This experience needs it to run.';
      return;
    }
    el.textContent = `capability check — GPU: ${caps.gpuClass} · pixel ratio: ${caps.dpr} · `
      + `${caps.touch ? 'touch detected' : 'no touch'}`;
  }

  initModeSelect(recommendedMode) {
    this.selectedMode = recommendedMode;
    const buttons = Array.from(document.querySelectorAll('#mode-select button'));
    buttons.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.mode === recommendedMode);
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
}
