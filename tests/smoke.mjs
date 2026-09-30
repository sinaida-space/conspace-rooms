// Headless smoke run: serve the site, enter on keys and walk east along the
// corridor that always runs from the spawn, across chunk borders, in the
// piece's own render loop. It fails on any error the page reports, and it
// prints the time between frames, which is what a visitor feels (F-001).
//
//   node smoke.mjs                                  CI: software WebGL, tier 0
//   SMOKE_GPU=1 TIER=2 SPEED=3 METRES=80 BUDGET_MS=33 node smoke.mjs
//                                                   a real GPU at walking pace; BUDGET_MS fails the run on a longer frame
//   STAGE=1                                         walk in grandmother's stage (2: the light)
//   VIEW=1280x800                                   window size (software WebGL defaults to 320x200)
//   HANDS=1                                         enter on gestures with Chrome's fake camera: the hand tracker must load from this site alone
//
// Two traps this measurement fell into before, kept here so nobody repeats them:
// the visitor has to look where they walk (the new chunks ahead must be in
// view), and the position has to be set past the doors every frame, or the
// walk stops at the first door and never crosses a border at all.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { readCsp } from '../tools/csp.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GPU = !!process.env.SMOKE_GPU;
const HANDS = !!process.env.HANDS;
const CSP = readCsp();                                  // served as Vercel serves it, so a refused script fails the run
const TIER = process.env.TIER ?? '0';
const STAGE = +(process.env.STAGE ?? 0);
const SPEED = +(process.env.SPEED ?? (GPU ? 3 : 12));   // metres a second; software WebGL is slow, so CI strides
const METRES = +(process.env.METRES ?? 40);             // 40 m cross two borders
const BUDGET_MS = process.env.BUDGET_MS ? +process.env.BUDGET_MS : null;
// software WebGL shades every pixel on the CPU: a small window keeps the CI run to minutes
const [WIDTH, HEIGHT] = (process.env.VIEW ?? (GPU ? '1280x800' : '320x200')).split('x').map(Number);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'content-security-policy': CSP }).end(body);
  } catch {                                         // a missing path gets the site's own 404 page, as on Vercel
    const body = await readFile(join(ROOT, '404.html')).catch(() => '');
    res.writeHead(404, { 'content-type': MIME['.html'], 'cache-control': 'no-store', 'content-security-policy': CSP }).end(body);
  }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  channel: process.env.SMOKE_CHANNEL ?? 'chrome',
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist',
    ...(GPU ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    ...(HANDS ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : []),
  ],
});

const errors = [];
let result = null;
try {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  await context.addInitScript(() => { try { localStorage.setItem('conspace-consent', '1'); } catch (e) {} });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url().replace(base, '')}`); });
  const asked = [];
  page.on('request', r => { asked.push(r.url()); if (/^https?:/.test(r.url()) && !r.url().startsWith(base)) errors.push(`asked another host: ${r.url()}`); });

  // the text pages and the 404 under the same policy: a refused inline script shows as a console error
  for (const path of ['tech.html', 'privacy.html', 'rider.html', 'press.html', 'voprosy.html', 'gallery.html?lang=en', 'no-such-page']) {
    await page.goto(`${base}/${path}`, { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(300);
    if (path === 'no-such-page' && !(await page.locator('#site-footer .footer-col').count())) errors.push('the 404 page did not come up whole (its footer is missing)');
  }
  for (let i = errors.length - 1; i >= 0; i--) if (/^404 \/no-such-page|Failed to load resource.*404/.test(errors[i])) errors.splice(i, 1);   // the 404 we asked for

  await page.goto(`${base}/index.html?lang=en&seed=1224&tier=${TIER}`);
  await page.locator(`#mode-select [data-mode="${HANDS ? 'hands' : 'keys'}"]`).click({ timeout: 60_000 });
  await page.locator('#btn-enter').click();
  await page.waitForFunction(() => window.__app?.player && window.__app?.soul && window.__app?.artworks, null, { timeout: 120_000 });
  await page.waitForFunction(() => { const el = document.getElementById('loading'); return !el || el.classList.contains('gone'); }, null, { timeout: 60_000 });   // the loading screen is down: the walk has begun
  await page.waitForTimeout(1500);
  let hands = null;
  if (HANDS) {
    hands = await page.evaluate(() => ({ legend: !!document.getElementById('hand-legend'), mode: window.__app.player.mode }));
    hands.files = asked.filter(u => u.includes('/vendor/mediapipe/')).map(u => u.split('/').pop());
    if (!hands.legend || hands.mode !== 'hands') errors.push(`gesture mode fell back to keys: ${JSON.stringify(hands)}`);
    if (!hands.files.some(f => f.endsWith('.wasm')) || !hands.files.includes('hand_landmarker.task')) errors.push(`the hand tracker did not load its files: ${hands.files.join(', ')}`);
  }
  if (STAGE) { await page.evaluate(n => window.__app.stage.set(n), STAGE); await page.waitForTimeout(4000); }

  result = await page.evaluate(async ({ speed, metres, limit }) => {
    const a = window.__app, p = a.player.pos;
    // the yaw that looks east: tried, since the camera's convention is the player's business
    const Vec = a.camera.position.constructor;
    let east = 0, best = -2;
    for (let k = 0; k < 8; k++) {
      a.player.yaw = k * Math.PI / 4; a.frame();
      const dx = a.camera.getWorldDirection(new Vec()).x;
      if (dx > best) { best = dx; east = a.player.yaw; }
    }
    const gaps = [], x0 = p.x, z0 = p.y;
    let x = p.x, last = performance.now(), n = 0, borders = 0, cx = a.world._cx, done;
    const walked = new Promise(ok => { done = ok; });
    a.renderer.setAnimationLoop(() => {
      const now = performance.now(), gap = now - last;
      last = now;
      x += speed * Math.min(gap, 50) / 1000;
      p.x = x; p.y = z0; a.player.yaw = east;        // straight through the doors: the road east is always open
      a.frame();
      if (a.world._cx !== cx) { cx = a.world._cx; borders++; }
      if (++n > 10) gaps.push(gap);
      if (x - x0 >= metres) done(false);
    });
    const timedOut = await Promise.race([walked, new Promise(ok => setTimeout(() => ok(true), limit))]);
    a.renderer.setAnimationLoop(null);
    const sorted = [...gaps].sort((u, v) => u - v);
    let objects = 0, meshes = 0;
    a.scene.traverse(o => { objects++; if (o.isMesh) meshes++; });
    const place = window.__place?.list() ?? [];
    return {
      tier: a.quality.tier, stage: a.stage.stage, timedOut, metres: +(x - x0).toFixed(1), borders, chunks: a.world.chunks.size,
      frames: gaps.length,
      gap: {
        median: +sorted[gaps.length >> 1].toFixed(1), p99: +sorted[Math.floor(gaps.length * 0.99)].toFixed(1), max: +sorted[gaps.length - 1].toFixed(1),
        over25: gaps.filter(v => v > 25).length, over33: gaps.filter(v => v > 33).length, over50: gaps.filter(v => v > 50).length,
      },
      objects, meshes, geometries: a.renderer.info.memory.geometries, textures: a.renderer.info.memory.textures,
      placed: place.length, placedBad: place.filter(e => !e.ok).length,
    };
  }, { speed: SPEED, metres: METRES, limit: GPU ? 120_000 : 600_000 });
  if (hands) result.hands = hands;
} catch (e) {
  errors.push(`smoke: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.close();
}

if (result) console.log(JSON.stringify(result, null, 2));
const fail = [...errors];
if (result) {
  const maxChunks = (2 * ((result.tier === 0 ? 1 : 2) + 1) + 1) ** 2;
  if (result.timedOut) fail.push(`the walk did not finish: ${result.metres} m of ${METRES}`);
  if (!result.borders) fail.push('no chunk border was crossed');
  if (result.chunks > maxChunks) fail.push(`chunks grew to ${result.chunks} (limit ${maxChunks})`);
  if (result.placedBad) fail.push(`${result.placedBad} bad placements`);
  if (BUDGET_MS !== null && result.gap.max > BUDGET_MS) fail.push(`longest frame ${result.gap.max} ms, budget ${BUDGET_MS} ms`);
}
if (fail.length) {
  console.error(`\nsmoke failed:\n- ${[...new Set(fail)].join('\n- ')}`);
  process.exit(1);
}
console.log('\nsmoke passed');
