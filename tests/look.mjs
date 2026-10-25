// Headless look at one place, for checks by hand: enters on keys, runs a
// snippet in the page (LOOK_JS, may await) and saves a screenshot (SHOT).
//   BASE=http://127.0.0.1:4830 LOOK_JS="await window.__app.soul._jumpToRoom(2)" SHOT=a.png node look.mjs
import { chromium } from 'playwright-core';
const base = process.env.BASE ?? 'http://127.0.0.1:4830';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
await page.addInitScript(() => { try { localStorage.setItem('conspace-consent', '1'); } catch (e) {} });
await page.goto(`${base}/index.html?lang=ru&seed=1224&tier=${process.env.TIER ?? 2}`);
await page.locator('#btn-consent').click({ timeout: 60_000 });   // the content warning comes up on every visit
await page.locator('#mode-select [data-mode="keys"]').click({ timeout: 60_000 });
await page.locator('#btn-enter').click();
await page.waitForFunction(() => window.__app?.player && window.__app?.soul, null, { timeout: 120_000 });
await page.waitForFunction(() => { const el = document.getElementById('loading'); return !el || el.classList.contains('gone'); }, null, { timeout: 60_000 });
await page.waitForTimeout(1500);
const out = await page.evaluate(`(async () => { ${process.env.LOOK_JS ?? ''} })()`);
if (out !== undefined) console.log(JSON.stringify(out));
await page.waitForTimeout(+(process.env.WAIT ?? 4000));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
