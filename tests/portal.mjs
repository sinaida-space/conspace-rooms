// What a crossing costs: the frame with no tunnel, while it closes in, in
// the flight (the view fully covered) and while it opens. Each frame is
// stepped by hand and waited for on the GPU (a 1 px read), so the numbers
// are the work of one frame, not the display's pace. Needs a real GPU.
//
//   node portal.mjs                  TIER=2 VIEW=1280x800 DPR=2 FRAMES=90
// "crossing" is a real one (fear to memory, the stage swapped under cover):
// every frame of it, stepped the same way.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TIER = process.env.TIER ?? '2';
const FRAMES = +(process.env.FRAMES ?? 90);
const DPR = +(process.env.DPR ?? 2);
const [WIDTH, HEIGHT] = (process.env.VIEW ?? '1280x800').split('x').map(Number);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };

const server = http.createServer(async (req, res) => {
  const file = join(ROOT, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  try { res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: DPR });
  await context.addInitScript(() => { try { localStorage.setItem('conspace-consent', '1'); } catch (e) {} });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?lang=en&seed=1224&tier=${TIER}`);
  await page.locator('#mode-select [data-mode="keys"]').click({ timeout: 60_000 });
  await page.locator('#btn-enter').click();
  await page.waitForFunction(() => window.__app?.player && window.__app?.soul && window.__app?.tunnel && window.__app?.post, null, { timeout: 120_000 });
  await page.waitForTimeout(4000);
  const out = await page.evaluate(async frames => {
    const a = window.__app, gl = a.renderer.getContext(), px = new Uint8Array(4);
    a.renderer.setAnimationLoop(null);
    const measure = () => {
      const ms = [];
      for (let i = 0; i < frames; i++) {
        const t0 = performance.now();
        a.frame(performance.now());
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // wait for the GPU
        if (i > 5) ms.push(performance.now() - t0);
      }
      ms.sort((u, v) => u - v);
      return { median: +ms[ms.length >> 1].toFixed(2), p90: +ms[Math.floor(ms.length * 0.9)].toFixed(2) };
    };
    const r = { none: measure() };
    a.tunnel.start(0, 1, () => {}, () => {});
    const T = a.tunnelTimes ?? { inT: 0.75, hold: 1.6 };
    for (const [name, t] of [['closing', T.inT * 0.5], ['flight', T.inT + T.hold * 0.5], ['opening', T.inT + T.hold + 0.3]]) { a.tunnel.seek(t); r[name] = measure(); }
    a.tunnel.seek(null);
    a.tunnel.render(10);                                             // let the held one finish
    const ms = [], prof = [];
    let cur = {};
    const wrap = (o, name, label) => { const f = o[name]; if (!f) return; o[name] = function (...x) { const t0 = performance.now(); try { return f.apply(this, x); } finally { cur[label] = (cur[label] || 0) + performance.now() - t0; } }; };
    for (const n of ['_stepRebuild', '_stepPaint', '_sync', 'update', '_rebuildScatter']) wrap(a.soul, n, 'soul.' + n);
    for (const n of Object.getOwnPropertyNames(Object.getPrototypeOf(a.soul))) if (/^_(build|show|want|make|snuff|drown|print|write)/.test(n)) wrap(a.soul, n, 'soul.' + n);
    wrap(a.world, 'update', 'world.update'); wrap(a.renderer, 'render', 'renderer.render'); wrap(a.renderer, 'compile', 'compile');
    for (const n of ['texImage2D', 'texSubImage2D', 'getProgramParameter', 'linkProgram', 'compileShader', 'getShaderParameter', 'texStorage2D']) wrap(gl, n, 'gl.' + n);
    a.soul._cross(1);
    while (a.tunnel.active && ms.length < 2000) {
      const t0 = performance.now();
      a.frame(performance.now());
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      ms.push(performance.now() - t0);
      if (ms[ms.length - 1] > 60) prof.push([ms.length - 1, Math.round(ms[ms.length - 1]), Object.entries(cur).filter(([, v]) => v > 3).map(([k, v]) => k + ' ' + Math.round(v)).join(', ')]);
      cur = {};
    }
    r.prof = prof;
    const s = [...ms].sort((u, v) => u - v);
    r.timeline = ms.map(v => Math.round(v));
    r.crossing = { frames: ms.length, median: +s[s.length >> 1].toFixed(2), max: +s[s.length - 1].toFixed(2), gpuSum: +ms.reduce((u, v) => u + v, 0).toFixed(0) };
    return r;
  }, FRAMES);
  if (process.env.SHOT) {                                            // SHOT=prefix: the tunnel held closing and in flight
    for (const [n, t] of [['closing', 0.5], ['flight', 1.4]]) {
      await page.evaluate(t => { const a = window.__app; a.tunnel.start(0, 1, () => {}, () => {}); a.tunnel.seek(t); a.frame(); }, t);
      await page.screenshot({ path: `${process.env.SHOT}-${n}.png` });
    }
  }
  console.log(JSON.stringify({ tier: TIER, view: `${WIDTH}x${HEIGHT}@${DPR}`, ...out }, null, 1));
} finally {
  await browser.close();
  server.close();
}

// Je suis le spectre d'une rose que tu portais hier au bal.
