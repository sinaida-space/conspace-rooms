// Press stills: four real-time frames of the current game (one per zone and
// the ending), captured headless with the game's own camera, no HUD.
//
//   cd <scratchpad> && npm i puppeteer-core        (never into the repo)
//   NODE_PATH=<scratchpad>/node_modules node tools/capture-stills.mjs --out assets/press
//
// ESM ignores NODE_PATH, so the script resolves puppeteer-core through it by
// hand. Needs system Chrome with a GPU (Metal on macOS). Serves the repo
// itself on an ephemeral port. Env: SEED (default 1224), CHROME (binary).
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(process.argv[process.argv.indexOf('--out') + 1] || 'assets/press');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: (process.env.NODE_PATH ?? '').split(':').filter(Boolean) }));

const SEED = process.env.SEED ?? '1224';
const W = 1920, H = 1080;
const CREDIT = '© Sinaida Krivchenko, UVALISS 2026.';

// Each shot: a file, a caption and what the page does to stand in the zone.
// All through the game's own API (stage.set, soul._jumpToRoom, the finale
// cheat); nothing is added to the game.
const SHOTS = [
  { file: 'conspace-rooms-still-01-fear-hospital.jpg', caption: 'hospital corridor, Fear zone',
    setup: `() => { const p = window.__app.player; p.yaw = Math.PI / 2; p.pitch = 0; }` },
  { file: 'conspace-rooms-still-02-memory-grandmothers-flat.jpg', caption: "grandmother's flat, Memory zone",
    setup: `() => { window.__app.soul._jumpToRoom(); }`, settle: 7000 },
  { file: 'conspace-rooms-still-03-acceptance.jpg', caption: 'a gallery hall in the Acceptance zone',
    setup: `() => { const a = window.__app; a.stage.set(2); a.player.yaw -= Math.PI / 2; a.player.pitch = 0; }`, settle: 8000 },
  { file: 'conspace-rooms-still-04-ending-arch-of-roses.jpg', caption: 'the arch of roses, ending',
    setup: `() => { window.__app.soul._cheatFinale(); }`, until: `() => window.__app.soul.finale?.vanish >= 1`, settle: 2500 },
];

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
  const file = join(ROOT, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`],
});
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('conspace-consent', '1'); } catch (e) {} });
  await page.goto(`${base}/index.html?lang=en&seed=${SEED}&tier=2`);
  await page.waitForSelector('#mode-select [data-mode="keys"]', { visible: true, timeout: 60000 });
  await page.click('#mode-select [data-mode="keys"]');
  await page.click('#btn-enter');
  await page.waitForFunction(() => window.__app?.player && window.__app?.soul && window.__app?.artworks, { timeout: 120000 });
  await page.waitForFunction(() => { const el = document.getElementById('loading'); return !el || el.classList.contains('gone'); }, { timeout: 60000 });
  await page.addStyleTag({ content: 'body > *:not(#gl){display:none!important} *{cursor:none!important}' });   // no HUD, captions or cursor in frame
  await mkdir(out, { recursive: true });
  const lines = [];
  for (const s of SHOTS) {
    await page.evaluate(new Function('return (' + s.setup + ')')());
    if (s.until) await page.waitForFunction(new Function('return (' + s.until + ')')(), { timeout: 60000 });
    await sleep(s.settle ?? 6000);                      // textures, the stage blend, a few seconds of frames
    await page.screenshot({ path: join(out, s.file), type: 'jpeg', quality: 85 });
    lines.push(`${s.file}: Still from the game (real-time render, not a visualisation): ${s.caption}, 1920×1080. ${CREDIT}`);
    console.log('captured', s.file);
  }
  if (SHOTS.length) await writeFile(join(out, 'stills.txt'), lines.join('\n') + '\n');
} finally { await browser.close(); server.close(); }
