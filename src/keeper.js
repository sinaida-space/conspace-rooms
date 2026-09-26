// The installation's keeper, for gallery mode only:
//   - offline: registers sw.js and asks it to cache every work and model ahead
//     of need, so a dropped gallery network does not stop the piece;
//   - watchdog: a lost WebGL context or a render loop that has stalled for
//     STALL_S seconds reloads the page; after `uptime` hours (URL, default 6)
//     it also reloads, but only while the attract screen is up;
//   - operator panel: press O three times within three seconds. FPS, quality,
//     camera, network, cache, uptime, and a count of walks and finished walks
//     (today and in total). The count lives in this machine's localStorage and
//     holds numbers only, nothing about any visitor.

const STALL_S = 12;
const STATS_KEY = 'conspace-gallery-stats';

const today = () => new Date().toISOString().slice(0, 10);
function readStats() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STATS_KEY)); } catch (e) { /* storage blocked */ }
  s = s || { day: today(), walks: 0, finishes: 0, totalWalks: 0, totalFinishes: 0 };
  if (s.day !== today()) Object.assign(s, { day: today(), walks: 0, finishes: 0 });
  return s;
}
function bump(field) {
  const s = readStats();
  s[field]++; s['total' + field[0].toUpperCase() + field.slice(1)]++;
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
}

export function startKeeper({ getHands, attractUp }) {
  const started = performance.now();
  const uptimeH = Math.min(48, Math.max(1, +(new URLSearchParams(location.search).get('uptime')) || 6));
  let cachedFiles = '…';

  // ── offline ────────────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(async () => {
      const reg = await navigator.serviceWorker.ready;
      const mp = 'vendor/mediapipe/';
      let urls = ['gallery.html', 'assets/artworks.json', 'assets/models/old_bed_frame.glb', 'assets/models/wheelchair_01.glb',
        mp + 'vision_bundle.mjs', mp + 'hand_landmarker.task', mp + 'blaze_face_short_range.tflite',
        ...['', '_nosimd'].flatMap(v => [`${mp}wasm/vision_wasm${v}_internal.js`, `${mp}wasm/vision_wasm${v}_internal.wasm`])];
      try {
        const list = await (await fetch('assets/artworks.json')).json();
        urls = urls.concat(list.map(a => a.file));
      } catch (e) { /* offline: the cache already has what it has */ }
      reg.active?.postMessage({ type: 'warm', urls: urls.map(u => new URL(u, location.href).href) });
    }).catch(e => console.warn('[keeper] no service worker:', e));
  }

  // ── watchdog ───────────────────────────────────────────────────────────────
  const canvas = document.getElementById('gl');
  canvas?.addEventListener('webglcontextlost', () => setTimeout(() => location.reload(), 2000));
  setInterval(() => {
    const beat = window.__app?.beat;
    if (beat && document.visibilityState === 'visible' && performance.now() - beat > STALL_S * 1000) location.reload();
    if (performance.now() - started > uptimeH * 3600e3 && attractUp()) location.reload();
  }, 3000);

  // ── operator panel ─────────────────────────────────────────────────────────
  const panel = document.createElement('pre');
  panel.className = 'keeper-panel hidden';
  panel.setAttribute('aria-hidden', 'true');
  document.body.appendChild(panel);
  let presses = [], fps = 0, lastFrames = 0;
  addEventListener('keydown', e => {
    if (e.code !== 'KeyO' || e.repeat) return;
    const now = performance.now();
    presses = presses.filter(t => now - t < 3000).concat(now);
    if (presses.length >= 3) { presses = []; panel.classList.toggle('hidden'); }
  });
  setInterval(async () => {
    const frames = window.__app?.frames || 0;          // counted by the render loop in main.js
    fps = frames - lastFrames; lastFrames = frames;
    if (panel.classList.contains('hidden')) return;
    try { cachedFiles = (await (await caches.open('conspace-gallery-v1')).keys()).length; } catch (e) { cachedFiles = '—'; }
    const s = readStats(), hands = getHands(), up = (performance.now() - started) / 60e3;
    panel.textContent = [
      'CONSPACE ROOMS · keeper',
      `fps       ~${fps}   quality tier ${window.__app?.quality?.tier ?? '?'}`,
      `camera    ${hands ? (hands.faceWithin?.(1000) ? 'face in view' : 'on, nobody') : 'off'}`,
      `network   ${navigator.onLine ? 'online' : 'OFFLINE'}   cached files ${cachedFiles}`,
      `uptime    ${Math.floor(up / 60)} h ${Math.floor(up % 60)} min   reload after ${uptimeH} h idle`,
      `today     ${s.walks} walks, ${s.finishes} finished`,
      `total     ${s.totalWalks} walks, ${s.totalFinishes} finished`,
      'O O O to hide',
    ].join('\n');
  }, 1000);

  return { walk: () => bump('walks'), finish: () => bump('finishes') };
}

// Je suis le spectre d'une rose que tu portais hier au bal.
