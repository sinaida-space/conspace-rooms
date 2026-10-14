// ── conspace-rooms · bugreport.js ───────────────────────────────────────────
// A bug report a tester with no computer habits can send: press R three times
// quickly and a picture comes up, the frame they were looking at with the
// state of the walk written over it (mode, stage, place, FPS, what the camera
// sees of the hands, the last errors, the seed that rebuilds this labyrinth).
// They take a screenshot and send it; the same picture is also saved as a
// file. Nothing leaves the browser. Works on every screen and in every mode.

import { CONSPACE_SEED, CELL } from './world.js';
import { keyCode } from './input.js';
import { getLang } from './i18n.js';

const TAPS = 3, TAP_WINDOW = 1200;   // R presses and the time they must fit in (ms)
const CLOSE_AFTER = 60000;           // the picture goes away by itself after a minute

const errors = [];                    // last few errors, newest last
const handLog = [];                   // last gesture changes, newest last
const dts = [];                       // frame times over the last few seconds
let lastHandKey = '', wanted = false, source = null, overlay = null, closeTimer = 0;
const t0 = performance.now();

function keepError(msg) {
  errors.push(`${((performance.now() - t0) / 1000).toFixed(0)}s ${String(msg).slice(0, 140)}`);
  if (errors.length > 5) errors.shift();
}

export function installBugReport() {
  addEventListener('error', e => keepError(e.message || e.error));
  addEventListener('unhandledrejection', e => keepError('promise: ' + (e.reason?.message || e.reason)));
  const origErr = console.error.bind(console), origWarn = console.warn.bind(console);
  console.error = (...a) => { keepError(a.map(String).join(' ')); origErr(...a); };
  console.warn = (...a) => { keepError('warn: ' + a.map(String).join(' ')); origWarn(...a); };

  let taps = [];
  addEventListener('keydown', e => {
    if (overlay) { if (keyCode(e) !== 'KeyR') close(); return; }
    if (keyCode(e) !== 'KeyR' || e.repeat) return;
    const now = performance.now();
    taps = taps.filter(tm => now - tm < TAP_WINDOW).concat(now);
    if (taps.length >= TAPS) { taps = []; request(); }
  }, true);
}

// the WebGL canvas to copy the frame from
export function setBugSource(canvas) { source = canvas; }

// called once per frame from the render loop
export function bugTick(dt) {
  dts.push(dt);
  if (dts.length > 300) dts.shift();
  const h = window.__app?.player?.hand;
  if (h?.present) {
    const k = [h.left || '', h.right || '', h.bothFists && 'fists2', h.anyFist && 'fist', h.pointLeft && 'ptL', h.pointRight && 'ptR', h.stopped && 'palms'].filter(Boolean).join(' ') || 'hands';
    if (k !== lastHandKey) { lastHandKey = k; handLog.push(`${((performance.now() - t0) / 1000).toFixed(1)}s ${k}`); if (handLog.length > 10) handLog.shift(); }
  } else if (h && lastHandKey !== 'none') { lastHandKey = 'none'; handLog.push(`${((performance.now() - t0) / 1000).toFixed(1)}s none`); if (handLog.length > 10) handLog.shift(); }
}

// called right after the render, while the drawing buffer still holds the frame
export function bugFrame() { if (wanted) { wanted = false; show(); } }

function request() {
  // before the labyrinth there is no render loop: draw the report at once
  if (window.__app?.player && source) wanted = true; else show();
}

function lines() {
  const a = window.__app || {}, p = a.player, s = a.soul;
  const fps = dts.length ? dts.length / dts.reduce((x, y) => x + y, 0) : 0;
  const worst = dts.length ? 1 / Math.max(...dts) : 0;
  const stageName = ['fear', 'memory', 'light'][a.stage?.stage ?? 0];
  const out = [
    `CONSPACE ROOMS · bug report`,
    `time    ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
    `seed    ${CONSPACE_SEED}   lang ${getLang()}`,
    `page    ${location.pathname}${document.body.classList.contains('gallery') ? ' (gallery)' : ''}`,
    `mode    ${p?.mode ?? 'menu'}   stage ${p ? stageName : '-'}`,
  ];
  if (p) {
    out.push(
      `pos     x ${p.pos.x.toFixed(2)} z ${p.pos.y.toFixed(2)}  cell ${Math.floor(p.pos.x / CELL)},${Math.floor(p.pos.y / CELL)}`,
      `look    yaw ${((p.yaw * 180 / Math.PI) % 360).toFixed(0)}° pitch ${(p.pitch * 180 / Math.PI).toFixed(0)}° fov ${p.fov.toFixed(0)}`,
      `state   ${[p.locked && 'locked', a.artworks?.inspecting && 'painting', s?._inKitchen && 'grandma-room', s?.guide && 'guide', s?.child && 'child', p.auto && 'auto:' + p.auto.kind].filter(Boolean).join(' ') || 'walking'}`,
      `seen    ${s?.seen?.size ?? 0} works`,
    );
  }
  out.push(
    `fps     ${fps.toFixed(0)} avg · ${worst.toFixed(0)} worst · tier ${a.quality?.tier ?? '-'}`,
    `screen  ${innerWidth}×${innerHeight} @${devicePixelRatio}${document.fullscreenElement ? ' fullscreen' : ''}`,
    `browser ${navigator.userAgent.replace(/Mozilla\/5\.0 |\(KHTML, like Gecko\) |AppleWebKit\/[\d.]+ /g, '').slice(0, 90)}`,
  );
  if (p?.hand) out.push(`hands   ${handLog.slice(-6).join(' | ') || '-'}`);
  out.push('errors  ' + (errors.length ? '' : 'none'));
  for (const e of errors) out.push('  ' + e);
  return out;
}

function show() {
  const W = 1280, H = 720;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#050805'; g.fillRect(0, 0, W, H);
  if (source?.width) {
    const sc = Math.max(W / source.width, H / source.height);
    const cw = W / sc, ch = H / sc;
    try { g.drawImage(source, (source.width - cw) / 2, (source.height - ch) / 2, cw, ch, 0, 0, W, H); } catch (e) { /* no frame, the text is enough */ }
  }
  // long lines wrap onto a continuation, nothing is cut
  const text = lines().flatMap(ln => { const out = []; for (let i = 0; i < ln.length; i += 84) out.push((i ? '        ' : '') + ln.slice(i, i + 84)); return out; });
  g.fillStyle = 'rgba(0,0,0,0.72)'; g.fillRect(0, 0, 700, H);
  g.font = '15px "Departure Mono", ui-monospace, monospace';
  g.textBaseline = 'top';
  text.forEach((ln, i) => {
    g.fillStyle = i === 0 ? '#ff4a3d' : ln.startsWith('  ') && !ln.startsWith('        ') ? '#ffb3ad' : '#e8f5ea';
    g.fillText(ln, 20, 20 + i * 22);
  });
  const url = c.toDataURL('image/png');

  const ru = getLang() === 'ru';
  overlay = document.createElement('div');
  overlay.id = 'bug-report';
  overlay.setAttribute('role', 'dialog');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '99999', background: '#000', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '16px', boxSizing: 'border-box',
    font: '16px "Departure Mono", ui-monospace, monospace', color: '#e8f5ea', textAlign: 'center',
  });
  const say = document.createElement('p');
  say.style.margin = '0';
  say.textContent = ru
    ? 'Сделайте скриншот этого экрана и пришлите Зинаиде или Алисе. Картинка также сохранена в Загрузки.'
    : 'Take a screenshot of this screen and send it to Sinaida or Alisa. The picture is also saved to Downloads.';
  const img = new Image();
  img.src = url; img.alt = 'bug report';
  Object.assign(img.style, { maxWidth: '100%', maxHeight: 'calc(100% - 90px)', objectFit: 'contain' });
  const hint = document.createElement('p');
  hint.style.cssText = 'margin:0;opacity:.6;font-size:13px';
  hint.textContent = ru ? 'закрыть: любая клавиша или клик' : 'close: any key or click';
  overlay.append(say, img, hint);
  overlay.addEventListener('click', close);
  document.body.appendChild(overlay);
  clearTimeout(closeTimer);
  closeTimer = setTimeout(close, CLOSE_AFTER);

  try {
    const aEl = document.createElement('a');
    aEl.href = url; aEl.download = `conspace-bug-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    document.body.appendChild(aEl); aEl.click(); aEl.remove();
  } catch (e) { /* the screenshot on screen is enough */ }
}

function close() {
  clearTimeout(closeTimer);
  overlay?.remove();
  overlay = null;
}

// Je suis le spectre d'une rose que tu portais hier au bal.
