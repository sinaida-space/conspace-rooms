// A whole walk without cheat codes, headless: a bot holds W and only turns
// its head, as a visitor does. It prints the timeline of the walk (works
// seen, the portals summoned and entered, grandmother's room, the finale),
// so a change to the pacing can be judged by what a walk actually meets.
//
//   SMOKE_GPU=1 node walk.mjs                follow: goes where the hints lead (works, finds, portals)
//   SMOKE_GPU=1 MODE=wander node walk.mjs    wander: strolls at random and walks up only to what it can see
//   MINUTES=25                               the longest walk, in the piece's own minutes
//   SEED=1224  TIER=1  UNTIL=light|card      where the run may stop (default: the card)
//
// The piece's clock is driven by the bot (one thirtieth of a second a frame),
// so a walk of twenty minutes takes a few. Exit code 1 when the walk does not
// get where UNTIL says.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GPU = !!process.env.SMOKE_GPU;
const MODE = process.env.MODE ?? 'follow';
const MINUTES = +(process.env.MINUTES ?? 25);
const SEED = process.env.SEED ?? '1224';
const TIER = process.env.TIER ?? (GPU ? '1' : '0');
const UNTIL = process.env.UNTIL ?? 'card';
const [WIDTH, HEIGHT] = (process.env.VIEW ?? (GPU ? '640x400' : '320x200')).split('x').map(Number);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg',
};
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  channel: process.env.SMOKE_CHANNEL ?? 'chrome', headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', ...(GPU ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])],
});

const errors = [];
let result = null;
try {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  await context.addInitScript(() => { try { localStorage.setItem('conspace-consent', '1'); } catch (e) {} });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${base}/index.html?lang=en&seed=${SEED}&tier=${TIER}`);
  await page.locator('#mode-select [data-mode="keys"]').click({ timeout: 60_000 });
  await page.locator('#btn-enter').click();
  await page.waitForFunction(() => window.__app?.player && window.__app?.soul && window.__app?.artworks, null, { timeout: 120_000 });
  await page.waitForFunction(() => { const el = document.getElementById('loading'); return !el || el.classList.contains('gone'); }, null, { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.keyboard.down('KeyW');                     // held for the whole walk: the bot only turns its head

  result = await page.evaluate(async ({ mode, minutes, until, base }) => {
    const { CELL, solidAtGlobal } = await import(base + '/src/world.js');   // the same module the piece runs on
    const a = window.__app, S = a.soul, P = a.player, p = P.pos;
    const cellOf = v => Math.floor(v / CELL), centreOf = g => (g + 0.5) * CELL;
    a.renderer.setAnimationLoop(null);
    let fake = performance.now();
    performance.now = () => fake;                       // THREE.Clock reads it: the bot owns the piece's time

    const log = [], t0 = fake;
    let metres = 0, lx = p.x, lz = p.y, lastKey = '';
    const state = () => {
      const f = S._fear;
      return {
        stage: a.stage.stage, seen: S.seen.size, stageSeen: S.stageSeen.join('/'),
        fear: f ? `shown ${f.shown.size} unlocked ${f.unlocked} writings ${f.writings} things ${f.things} turns ${f.turns}` : '',
        stairs: S._stairCount || 0, portal1: !!S.summonedPortals[1], portal2: !!S.summonedPortals[2],
        room: !!S.visitedRoom, finale: !!S.finale, card: !!S._carded,
      };
    };
    const note = extra => {
      const s = state(), key = JSON.stringify(s);
      if (key === lastKey && !extra) return;
      lastKey = key;
      log.push({ t: +((fake - t0) / 1000).toFixed(0), m: +metres.toFixed(0), ...s, ...(extra ? { note: extra } : {}) });
    };

    // where to: what the hints lead to (follow), or only what is in plain sight (wander)
    const near = (x, z) => (i, j) => (Math.abs(i - cellOf(x)) <= 1 && Math.abs(j - cellOf(z)) <= 1 ? Infinity : -Math.hypot(i - cellOf(x), j - cellOf(z)));
    const sees = (x, z, r) => Math.hypot(x - p.x, z - p.y) < r && S._lineOfSight(p.x, p.y, x, z);
    let stroll = null, face = null;
    const goal = () => {
      face = null;
      const follow = mode === 'follow';
      if (S.finale) { const f = S.finale, L = f.arch.length + 3; return near(f.spot.x + f.spot.dir[0] * L, f.spot.z + f.spot.dir[1] * L); }
      const portal = S.summonedPortals[a.stage.stage + 1];
      if (portal && (follow || sees(portal.x, portal.z, 14))) { const tx = cellOf(portal.x - 0.01), tz = cellOf(portal.z - 0.01); return (i, j) => (i === tx && j === tz ? Infinity : -Math.hypot(i - tx, j - tz)); }
      let art = null, ad = Infinity;
      for (const w of S.artworks.active) {
        if (w.hidden || S.seen.has(w.art.id)) continue;
        const x = w.centerWorld.x + w.normal.x * 0.9, z = w.centerWorld.z + w.normal.z * 0.9, d = Math.hypot(x - p.x, z - p.y);
        if (d < ad && (follow || sees(x, z, 12))) { ad = d; art = w; }
      }
      if (art) {
        if (ad < 2.2) face = art.centerWorld;             // stand before it and look
        const tx = cellOf(art.centerWorld.x + art.normal.x * 0.9), tz = cellOf(art.centerWorld.z + art.normal.z * 0.9);
        return (i, j) => (i === tx && j === tz ? Infinity : -Math.hypot(i - tx, j - tz));
      }
      if (a.stage.stage === 1 && !S.visitedRoom) { const k = S._guideTarget(); if (k && (follow || sees(k.x, k.z, 12))) return near(k.x, k.z); }
      if (follow && a.stage.stage === 0 && S._fear) {
        let find = null, fd = 30;
        for (const t of S._fearFinds()) { if (S._fear.found.has(t.key)) continue; const d = Math.hypot(t.x - p.x, t.z - p.y); if (d > 2 && d < fd) { fd = d; find = t; } }
        if (find) return near(find.x, find.z);
      }
      // nothing to go to: a stroll to some cell in reach, 15 to 40 m off
      const gi = cellOf(p.x), gj = cellOf(p.y);
      if (!stroll || (Math.abs(stroll[0] - gi) <= 1 && Math.abs(stroll[1] - gj) <= 1) || fake > stroll[2]) {
        const cells = [...S._reachableSet(gi, gj)].map(k => k.split(',').map(Number)).filter(([i, j]) => { const d = Math.hypot(i - gi, j - gj) * CELL; return d > 15 && d < 40; });
        const c = cells[Math.floor(Math.random() * cells.length)] || [gi + 5, gj];
        stroll = [c[0], c[1], fake + 60000];
      }
      return (i, j) => (i === stroll[0] && j === stroll[1] ? Infinity : -Math.hypot(i - stroll[0], j - stroll[1]));
    };

    let n = 0, stuckT = 0, sx = p.x, sz = p.y, shake = 0, shakeYaw = 0, path = [], reached = false;
    const ok = () => (until === 'light' ? a.stage.stage === 2 : !!S._carded);
    while ((fake - t0) / 60000 < minutes && !ok()) {
      if (n % 6 === 0 && !P.locked) {
        path = S._route(goal(), cellOf(p.x), cellOf(p.y), 20000);
      }
      if (face) P.yaw = Math.atan2(-(face.x - p.x), -(face.z - p.y));
      else if (shake > 0) { shake--; P.yaw = shakeYaw; }
      else if (path.length > 1) {
        const [ti, tj] = path[Math.min(2, path.length - 1)];
        P.yaw = Math.atan2(-(centreOf(ti) - p.x), -(centreOf(tj) - p.y));
      }
      fake += 1000 / 30;
      a.frame();
      metres += Math.hypot(p.x - lx, p.y - lz); lx = p.x; lz = p.y;
      // held against something for three seconds: look another way for a moment
      if (++stuckT > 90) { if (Math.hypot(p.x - sx, p.y - sz) < 0.4 && !P.locked && !face) { shake = 25; shakeYaw = Math.random() * 6.28; } stuckT = 0; sx = p.x; sz = p.y; }
      note();
      if (!reached && ok()) reached = true;
      if (++n % 4 === 0) await new Promise(r => setTimeout(r, 0));   // fetches, decodes and timers get their turn
    }
    note('end');
    return { mode, reached: ok(), minutes: +((fake - t0) / 60000).toFixed(1), metres: +metres.toFixed(0), log };
  }, { mode: MODE, minutes: MINUTES, until: UNTIL, base });
  await page.keyboard.up('KeyW');
  if (process.env.SHOT) {                               // SHOT=file.png: the view at the end, looking back the way the walk came
    await page.evaluate(() => { const a = window.__app; a.player.yaw += Math.PI; if ("pitch" in a.player) a.player.pitch = -0.45; for (let i = 0; i < 3; i++) a.frame(); });
    await page.screenshot({ path: process.env.SHOT });
    if (process.env.SHOT_NODUST) { await page.evaluate(() => { const a = window.__app; a.soul.footDust.mesh.visible = false; a.soul.footDust.update = () => {}; a.frame(); }); await page.screenshot({ path: process.env.SHOT_NODUST }); }
  }
} catch (e) {
  errors.push(`walk: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.close();
}

if (result) {
  for (const l of result.log) console.log(`${String(l.t).padStart(5)} s ${String(l.m).padStart(5)} m  stage ${l.stage}  seen ${l.seen} (${l.stageSeen})  ${l.fear}  stairs ${l.stairs}${l.portal1 ? '  portal→home' : ''}${l.room ? '  room' : ''}${l.portal2 ? '  portal→light' : ''}${l.finale ? '  finale' : ''}${l.card ? '  card' : ''}${l.note ? '  [' + l.note + ']' : ''}`);
  console.log(`\n${result.mode}: ${result.reached ? 'reached' : 'did NOT reach'} ${UNTIL} in ${result.minutes} min, ${result.metres} m`);
}
if (errors.length) console.error(`\nerrors:\n- ${[...new Set(errors)].join('\n- ')}`);
process.exit(result?.reached && !errors.length ? 0 : 1);
