// ── conspace-rooms · debug.js ───────────────────────────────────────────────
// ?dbg: a small panel for a phone, to find where an artefact comes from. Each
// button switches one layer of the picture off and on; the panel also shows
// the GPU, its float precision and the quality tier. Loaded only with ?dbg.

export function openDebug(app) {
  const gl = app.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const mp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);
  const q = app.quality;
  const post = app.post, atmo = app.atmo;

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:max(8px,env(safe-area-inset-top));left:8px;z-index:99;background:rgba(0,0,0,0.78);'
    + 'color:#9f9;font:12px/1.35 monospace;padding:8px;border:1px solid #3a3;border-radius:4px;max-width:250px;pointer-events:auto';
  const info = document.createElement('div');
  info.textContent = `GPU: ${gpu}\nhighp: ${hp.precision} bit, mediump: ${mp.precision} bit\n`
    + `DPR ${devicePixelRatio}, canvas ${app.renderer.domElement.width}×${app.renderer.domElement.height}\n`
    + `tier ${q.tier} (${q.p?.name ?? ''}), post ${q.p?.post ? 'on' : 'off'}`;
  info.style.whiteSpace = 'pre-wrap';
  el.appendChild(info);

  const toggles = [
    ['CRT: строки и шум', v => { post.dbg.noCrt = !v; }],
    ['RGB-сдвиг при ходьбе', v => { post.dbg.noShift = !v; }],
    ['Размытие краёв (B)', v => { post.dbg.noEdge = !v; }],
    ['Подтёки на стенах', v => { atmo.dbg.x = v ? 0 : 1; }],
    ['Весь пост-эффект', v => { q.p.post = v; }],
  ];
  for (const [label, set] of toggles) {
    const b = document.createElement('button');
    let on = true;
    const paint = () => { b.textContent = (on ? '■ ' : '□ ') + label; b.style.opacity = on ? 1 : 0.55; };
    b.style.cssText = 'display:block;width:100%;margin-top:6px;padding:9px 6px;text-align:left;font:13px monospace;'
      + 'color:#cfc;background:#132;border:1px solid #3a3;border-radius:3px';
    b.addEventListener('click', e => { e.stopPropagation(); on = !on; set(on); paint(); });
    paint();
    el.appendChild(b);
  }
  const hide = document.createElement('button');
  hide.textContent = 'спрятать панель';
  hide.style.cssText = 'display:block;width:100%;margin-top:8px;padding:6px;font:11px monospace;color:#9f9;background:none;border:1px dashed #3a3';
  hide.addEventListener('click', e => { e.stopPropagation(); el.remove(); });
  el.appendChild(hide);
  document.body.appendChild(el);
}

// Je suis le spectre d'une rose que tu portais hier au bal.
