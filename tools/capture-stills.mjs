// Press stills: five real-time frames of the current game (fear, memory, two
// of the light, the ending), captured headless with the game's own camera,
// no HUD.
//
//   (cd tests && npm i)                             playwright-core, the tests' own
//   node tools/capture-stills.mjs --out assets/press
//
// Needs system Chrome with a GPU (Metal on macOS). Serves the repo itself on
// an ephemeral port. Env: SEED (default 1224), ONLY (a file name part: just
// those shots; stills.txt keeps the others' lines).
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(process.argv[process.argv.indexOf('--out') + 1] || 'assets/press');
const { chromium } = createRequire(new URL('../tests/package.json', import.meta.url))('playwright-core');

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
  // the light near its end: most works found, so the frames hang at their largest (#94);
  // stand in the corridor a few steps along from the nearest work, looking at it
  { file: 'conspace-rooms-still-03-acceptance.jpg', caption: 'a work by UVALISS in the Acceptance zone',
    setup: `async () => { const a = window.__app, s = a.soul, P = a.player.pos; s.stage.set(2); await new Promise(r => setTimeout(r, 3000));
      for (const w of s.artworks.list.slice(0, 14)) s.seen.add(w.id); s.stageSeen[2] = 14;
      P.set(P.x + 100, P.y + 40); for (let i = 0; i < 12; i++) { s.world.update(P.x, P.y); await new Promise(r => setTimeout(r, 400)); }
      const { solidAtGlobal } = await import('/src/world.js'), solid = (x, z) => solidAtGlobal(Math.floor(x / 1.2), Math.floor(z / 1.2));
      const act = s.artworks.active.filter(w => !w.hidden).sort((p, q) => Math.hypot(p.centerWorld.x - P.x, p.centerWorld.z - P.y) - Math.hypot(q.centerWorld.x - P.x, q.centerWorld.z - P.y));
      const w = act.find(w => w.width > 2) || act[0], n = w.normal, c = w.centerWorld;
      let k = 0.4; while (k < 8 && !solid(c.x + n.x * k, c.z + n.z * k)) k += 0.1;
      k = Math.min(k - 0.5, 3); const along = Math.min(2.2, 3.4 - k);
      let x = c.x + n.x * k + n.z * along, z = c.z + n.z * k - n.x * along;
      if (solid(x, z)) { x = c.x + n.x * k; z = c.z + n.z * k; }
      P.set(x, z); a.player.vel.set(0, 0); a.player.yaw = Math.atan2(x - c.x, z - c.z); a.player.pitch = 0.04; }`, settle: 7000 },
  // grandmother's kitchen again in the light, faded, the television and the table under glowing linen (#94)
  { file: 'conspace-rooms-still-05-acceptance-kitchen-under-linen.jpg', caption: "grandmother's kitchen under glowing linen, Acceptance zone",
    setup: `async () => { const a = window.__app, s = a.soul, P = a.player.pos; s._jumpToRoom(2); await new Promise(r => setTimeout(r, 2500));
      const v = [...s.chunkStuff.values()].map(st => st.veiled).filter(v => v?.room).sort((p, q) => Math.hypot(p.x - P.x, p.z - P.y) - Math.hypot(q.x - P.x, q.z - P.y))[0];
      if (!v) return;
      const t = v.room.lamp, tv = v.room.tv, dx = t.x - tv.x, dz = t.z - tv.z, d = Math.hypot(dx, dz) || 1;   // table, and the set beyond it
      const x = t.x + dx / d * 2.6 - dz / d * 1.0, z = t.z + dz / d * 2.6 + dx / d * 1.0, mx = (t.x * 2 + tv.x) / 3, mz = (t.z * 2 + tv.z) / 3;
      P.set(x, z); a.player.vel.set(0, 0); a.player.yaw = Math.atan2(x - mx, z - mz); a.player.pitch = -0.17; }`, settle: 6000 },
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

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
try {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.addInitScript(() => { try { localStorage.setItem('conspace-consent', '1'); } catch (e) {} });
  await page.goto(`${base}/index.html?lang=en&seed=${SEED}&tier=2`);
  await page.locator('#mode-select [data-mode="keys"]').click({ timeout: 60000 });
  await page.locator('#btn-enter').click();
  await page.waitForFunction(() => window.__app?.player && window.__app?.soul && window.__app?.artworks, null, { timeout: 120000 });
  await page.waitForFunction(() => { const el = document.getElementById('loading'); return !el || el.classList.contains('gone'); }, null, { timeout: 60000 });
  await page.addStyleTag({ content: 'body > *:not(#gl){display:none!important} *{cursor:none!important}' });   // no HUD, captions or cursor in frame
  await mkdir(out, { recursive: true });
  const lines = [];
  for (const s of SHOTS) {
    const line = `${s.file}: Still from the game (real-time render, not a visualisation): ${s.caption}, 1920×1080. ${CREDIT}`;
    lines.push(line);
    if (process.env.ONLY && !s.file.includes(process.env.ONLY)) continue;
    await page.evaluate(`(${s.setup})()`);
    if (s.until) await page.waitForFunction(`(${s.until})()`, null, { timeout: 60000 });
    await sleep(s.settle ?? 6000);                      // textures, the stage blend, a few seconds of frames
    await page.screenshot({ path: join(out, s.file), type: 'jpeg', quality: 85 });
    console.log('captured', s.file);
  }
  if (SHOTS.length) await writeFile(join(out, 'stills.txt'), lines.join('\n') + '\n');
} finally { await browser.close(); server.close(); }
