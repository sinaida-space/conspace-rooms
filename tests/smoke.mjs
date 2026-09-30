// Headless smoke run: serve the site, enter on keys, step the walk by hand
// across chunk borders along the corridor that always runs east from the
// spawn, and fail on any error the page reports. It also prints the frame
// times of the crossing, which is the measurement the audit used (F-001).
//
//   node smoke.mjs                          CI: software WebGL, tier 0
//   SMOKE_GPU=1 TIER=2 node smoke.mjs       a real GPU, the audit's setup
//   FRAMES=800 STEP=0.05 BUDGET_MS=33 ...   walking pace (3 m/s at 60 fps); BUDGET_MS fails the run on a slower frame
//   VIEW=1280x800                           window size (software WebGL defaults to 320x200)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TIER = process.env.TIER ?? '0';
const FRAMES = +(process.env.FRAMES ?? 200);
const STEP = +(process.env.STEP ?? 0.2);            // metres a frame: 200 frames cross two borders
const BUDGET_MS = process.env.BUDGET_MS ? +process.env.BUDGET_MS : null;
const GPU = !!process.env.SMOKE_GPU;
// software WebGL shades every pixel on the CPU: a small window keeps the CI run to minutes
const [WIDTH, HEIGHT] = (process.env.VIEW ?? (GPU ? '1280x800' : '320x200')).split('x').map(Number);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  channel: process.env.SMOKE_CHANNEL ?? 'chrome',
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist',
    ...(GPU ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
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

  await page.goto(`${base}/index.html?lang=en&seed=1224&tier=${TIER}`);
  await page.locator('#mode-select [data-mode="keys"]').click({ timeout: 60_000 });
  await page.locator('#btn-enter').click();
  await page.waitForFunction(() => window.__app?.player && window.__app?.soul && window.__app?.artworks, null, { timeout: 120_000 });

  result = await page.evaluate(({ frames, step }) => {
    const a = window.__app, gl = a.renderer.getContext(), p = a.player.pos;
    a.renderer.setAnimationLoop(null);              // from here the walk moves only when this script steps it
    for (let i = 0; i < 20; i++) a.frame();         // let the first chunks settle
    const ms = [];
    for (let i = 0; i < frames; i++) {
      p.x += step;
      const t0 = performance.now();
      a.frame();
      gl.finish();
      ms.push(performance.now() - t0);
    }
    const sorted = [...ms].sort((x, y) => x - y);
    let objects = 0, meshes = 0;
    a.scene.traverse(o => { objects++; if (o.isMesh) meshes++; });
    const place = window.__place?.list() ?? [];
    return {
      tier: a.quality.tier, metres: +(frames * step).toFixed(1), chunks: a.world.chunks.size,
      frame: { median: +sorted[frames >> 1].toFixed(1), p95: +sorted[Math.floor(frames * 0.95)].toFixed(1), max: +sorted[frames - 1].toFixed(1), over33: ms.filter(v => v > 33).length },
      objects, meshes, geometries: a.renderer.info.memory.geometries, textures: a.renderer.info.memory.textures,
      placed: place.length, placedBad: place.filter(e => !e.ok).length,
    };
  }, { frames: FRAMES, step: STEP });
} catch (e) {
  errors.push(`smoke: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.close();
}

if (result) console.log(JSON.stringify(result, null, 2));
const fail = [...errors];
if (result) {
  const maxChunks = (2 * ((+TIER === 0 ? 1 : 2) + 1) + 1) ** 2;
  if (result.chunks > maxChunks) fail.push(`chunks grew to ${result.chunks} (limit ${maxChunks})`);
  if (result.placedBad) fail.push(`${result.placedBad} bad placements`);
  if (BUDGET_MS !== null && result.frame.max > BUDGET_MS) fail.push(`slowest frame ${result.frame.max} ms, budget ${BUDGET_MS} ms`);
}
if (fail.length) {
  console.error(`\nsmoke failed:\n- ${[...new Set(fail)].join('\n- ')}`);
  process.exit(1);
}
console.log('\nsmoke passed');
