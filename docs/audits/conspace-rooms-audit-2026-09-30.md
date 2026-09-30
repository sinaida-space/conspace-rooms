# CONSPACE ROOMS · website audit

Prepared for Sinaida Krivchenko, 30 September 2026. Scope: repo at `98432d5` (equal to live, https://conspace-rooms.vercel.app/), all pages, the engine in `src/`, deploy config

## Executive summary

The piece is strong in concept and in privacy, machines read it well, and it holds its memory flat over a long walk. Its weakest side is delivery: a visitor downloads 7.2 MB of paintings before the first step, phones included, and nothing is cached between visits. The most consequential finding is F-002, the weight of the paintings, because most visitors arrive on a phone. F-001 was rated first in the morning and corrected the same day: at walking pace a chunk crossing costs one frame of about 42 ms, where the first measurement showed five.

**Overall: 7.5 / 10.**

| Area | Score | One line |
|---|---|---|
| Concept and scope | 9 | One arc (fear, memory, acceptance) carried by space, light and sound, and by the text. Scope sits at the upper limit for a solo build. |
| Mechanics | 8 | Candles as the map, a rose as the counter, portals that come once works are seen, souls with questions, a finale. The gates are invisible and the full length has no playtest data. |
| Rendering | 7 | Steady state is light (263 draw calls, 336 k triangles at tier 2). One long frame per chunk crossing. |
| Loading and network | 5.5 | 76 requests and 10.7 MB decoded at entry, no cache policy, JPEG only. |
| Accessibility | 6 | Good text contrast and focus rings. Zoom is locked, WebGL ignores reduced motion, no plain route to the works. |
| Security | 7 | HSTS, no secrets, no backend. No CSP or companion headers, third-party code runs beside the camera. |
| Privacy (GDPR) | 9.5 | No analytics, no cookies, three functional storage keys, all disclosed. |
| SEO | 7.5 | Canonical, JSON-LD, sitemap, OG on the home page. Text pages lack description, canonical and hreflang. |
| Agentic readiness | 10 | robots with Content Signals, llms.txt, Markdown negotiation, Agent Skills, WebMCP. |
| Code health | 5.5 | 22.7 k lines, no tests, no CI, one 3 165-line class, a global `window.__app` as the wiring. |

## Methodology

Audited against the skill’s checklists: NN/g heuristics, WCAG 2.1 AA, GDPR, the security baseline, technical SEO, agentic readiness, adaptive performance, fonts, typography, animation principles and the anti-slop catalog. Each finding is rated on Impact and Probability and combined through `references/risk-matrix.md`.

Evidence was gathered three ways: reading the source, `curl` against the live site for headers and transfer sizes, and a local run (seed 1224, tier 2, 1536×1152 canvas, Apple M2) where frames were stepped by hand through `window.__app.frame()` with `gl.finish()` after each. The browser pane was hidden during the run, so absolute frame times at rest are not trustworthy and are left out; the chunk-crossing times are CPU work on the main thread and hold.

Not checked: a real phone, a real Intel laptop, a screen reader pass, Lighthouse (the hidden pane gives no honest paint timings), a full walk from fear to the finale.

## Risk summary

| # | Finding | Category | Impact | Probability | Rating |
|---|---|---|---|---|---|
| F-002 | 7.2 MB of JPEG paintings at entry, full size on phones too | Performance | Medium | High | **High** |
| F-001 | Every chunk crossing costs one frame of about 42 ms (corrected, see the finding) | Performance | Low | High | **Medium** |
| F-003 | One 3 165-line class, global wiring, no tests, no CI | Code health | Medium | Medium | **Medium** |
| F-004 | No cache policy: every file revalidates on every visit | Performance | Low | High | **Medium** |
| F-005 | Flicker and glitch in WebGL ignore reduced motion | Accessibility | Medium | Medium | **Medium** |
| F-006 | Third-party code and models load beside the camera | Security | High | Low | **Medium** |
| F-007 | No evidence that visitors reach the second and third zone | Scope | Medium | Medium | **Medium** |
| F-008 | Security headers missing except HSTS | Security | Medium | Low | **Low** |
| F-009 | Zoom locked on the home page and the gallery page | Accessibility | Medium | Low | **Low** |
| F-010 | No plain route to the eighteen works | Accessibility | Medium | Low | **Low** |
| F-011 | Tab is captured in the walk, the volume slider has no key | Accessibility | Low | Medium | **Low** |
| F-012 | Text pages lack description, canonical, hreflang, `<main>` | SEO | Low | Medium | **Low** |
| F-013 | On a phone the language buttons sit below the fold | UX | Low | Medium | **Low** |
| F-014 | Repo and deploy carry dead weight and test switches | Hygiene | Low | Low | **Minimal** |

## Findings in detail

### F-001 · Every chunk crossing stalls the walk for about five frames
- **Category:** Performance
- **Impact:** Medium. The walk is the work; a hitch every 19 m reads as a broken machine on anything slower than an M2.
- **Probability:** High. It happens to every visitor at every chunk border.
- **Rating:** Medium (was High, see the correction)
- **Correction, 30 September, from the smoke run of wave 2:** the numbers below were taken while the visitor was moved 1.2 m a frame, which is 72 m/s. At walking pace (3 m/s, 0.05 m a frame, seed 1224, tier 2, Apple M2, real GPU) two crossings over 40 m gave one frame of about 42 ms each, 2 frames of 800 past 33 ms, median 7.5 ms. The dressing of a chunk is already spread over frames; one frame per crossing still runs long. Impact is therefore Low on this hardware, and a slower machine remains unmeasured. `tests/smoke.mjs` repeats the measurement.
- **Evidence:** stepping east through four borders gave, per border, five slow frames in a row: 56, 77, 22, 115, 66 ms; then 120, 64, 45, 22, 72; then 11, 160, 22, 126, 24; then 37, 39, 40, 42, 40. Over twelve more chunks 26 of 192 frames ran past 33 ms, worst 109 ms. The scene holds about 2 000 meshes and 2 600 to 2 900 objects for 30 chunks, 1 664 of them built by `SoulPath._buildChunk` (`src/soulpath.js:637`, 250 lines, synchronous) on top of `World._buildChunk` (`src/world.js:181`), which fills plain JS arrays with `push` and copies them into typed arrays.
- **Why it matters:** the governor in `src/quality.js` reads the median frame, so these hitches never trigger a step down, and a step down would not help anyway: the cost is CPU work of dressing a chunk, which no tier removes except by density.
- **Recommended remediation:** spread the dressing of a new row of chunks over frames with a time budget (about 4 ms a frame), nearest chunk first; build one ring further out than the eye reaches so a chunk is ready before it shows; move `World._buildChunk` to preallocated typed arrays. Merging static props of a chunk into a few meshes per material would cut both build time and the object count. The pure geometry of `world.js` can go to a Worker later if the budget alone is not enough.

### F-002 · 7.2 MB of JPEG paintings at entry, full size on phones too
- **Category:** Performance
- **Impact:** Medium. On mobile data the paintings arrive late or the visitor leaves; the paintings are the content.
- **Probability:** High. Phones are the usual way in from Instagram links.
- **Rating:** High
- **Evidence:** at the first frame of the walk 15 of 18 files from `assets/artworks/` were fetched (180 to 630 KB each, 1280×1600). `loadTexture` in `src/artworks.js:186` downloads the full file on tier 0 and halves it on a canvas afterwards, so the phone pays for the pixels it throws away. `cwebp -q 82` on `08.jpg` gives 313 KB against 646 KB.
- **Why it matters:** total at entry is 76 requests and 10.7 MB decoded, 8.3 MB of it images and models.
- **Recommended remediation:** ship two WebP sizes per work (1600 px and 800 px), pick by tier before the request, keep JPEG as the source in the repo only. Load the texture of a work when its chunk comes within one ring of the visitor, nearest first. Expected entry weight: about 4 MB on desktop, about 1.5 MB on a phone.

### F-003 · One 3 165-line class, global wiring, no tests, no CI
- **Category:** Code health
- **Impact:** Medium. Each round of changes costs a review round to find what it broke.
- **Probability:** Medium. The last five commits on `main` are all fixes to earlier rounds.
- **Rating:** Medium
- **Evidence:** `src/soulpath.js` is 3 165 lines with one class of about 110 methods; `update()` runs from line 2737 to 3088. `window.__app` is read in 11 modules (34 times in `main.js`) and carries renderer, world, player, soul, water, post, audio. There is no test file and no workflow in `.github/`. `world.js` states that it is importable in node, and nothing imports it there.
- **Why it matters:** placement rules (keep-out, candles, things on walls, drowned things) interact, and every one of them is checked by eye in a browser.
- **Recommended remediation:** no rewrite. Three cheap moves: (1) a node test file for the pure parts (`world.js`, `placement.js`, `zones.js`): determinism by seed, stitching of chunk edges, no two things on one wall face, keep-out distances; (2) a headless smoke run that enters, steps 200 frames across a border and fails on a console error; (3) split `soulpath.js` along lines it already has (portals and stairwell, souls and balloons, candles and marks, the finale, the guide) into files that receive a context object. A GitHub Action runs (1) on push.

### F-004 · No cache policy: every file revalidates on every visit
- **Category:** Performance
- **Impact:** Low. The second visit works, only slower than necessary.
- **Probability:** High. Every repeat visit, and every reload in gallery mode after each visitor.
- **Rating:** Medium
- **Evidence:** live headers for `/`, `/vendor/three.module.js` and `/assets/artworks/08.jpg` all answer `cache-control: public, max-age=0, must-revalidate`. `vercel.json` sets no `Cache-Control` anywhere.
- **Why it matters:** the gallery page reloads into a new labyrinth for each visitor and asks the network 76 times; on a venue connection that is the difference between a dark screen and a ready one.
- **Recommended remediation:** in `vercel.json`, `max-age=31536000, immutable` for `/assets/fonts/*` and `/vendor/*`; `max-age=86400, stale-while-revalidate=604800` for `/assets/**`; leave HTML and `src/*.js` as they are, since nothing is fingerprinted.

### F-005 · Flicker and glitch in WebGL ignore reduced motion
- **Category:** Accessibility
- **Impact:** Medium. The content warning names photosensitive epilepsy, and the visitor who set the system preference still gets the full effect.
- **Probability:** Medium. Applies to visitors with the preference set.
- **Rating:** Medium
- **Evidence:** `prefers-reduced-motion` is read in `css/style.css` (three blocks), `src/tunnel.js`, `src/petals.js` and `src/ui.js`. It is not read in `src/post.js` (glitch bursts, RGB shift), `src/materials.js` (lamp flicker), `src/events.js` (flicker event) or `src/player.js` (head bob).
- **Why it matters:** WCAG 2.3.1 and 2.3.3; the skill treats missing support as an accessibility gap.
- **Recommended remediation:** one `calm` flag read once in `main.js` and passed down: glitch bursts scaled to a quarter, lamp flicker replaced by a slow dim, the flicker event swapped for a sound event, head bob off. Add a “calm” line to the menu so the choice is also manual.

### F-006 · Third-party code and models load beside the camera
- **Category:** Security
- **Impact:** High. Code from another host runs on the page that holds the camera stream.
- **Probability:** Low. The version is pinned and the CDN is reputable; the path is opt-in.
- **Rating:** Medium
- **Evidence:** `src/hands.js:31` loads `@mediapipe/tasks-vision@0.10.14` from `cdn.jsdelivr.net` and two models from `storage.googleapis.com`. A dynamic import carries no integrity check. The README notes that the mirror still needs jsDelivr and Google.
- **Why it matters:** besides the supply chain, the gallery installation depends on three hosts at the venue, and the privacy page has to name two processors only because of this.
- **Recommended remediation:** vendor the library, its WASM and both models into `vendor/mediapipe/` (about 15 to 20 MB, loaded only in gesture mode). That removes both outside hosts from the privacy page, makes `script-src 'self'` possible in a CSP, and is the first step of the offline gallery in issue #22.

### F-007 · No evidence that visitors reach the second and third zone
- **Category:** Scope
- **Impact:** Medium. Two thirds of the work (grandmother’s flat, the light, the finale) sit behind gates.
- **Probability:** Medium. Unknown by design: the site measures nothing.
- **Rating:** Medium
- **Evidence:** the first portal comes after three works in fear, the second after five and grandmother’s room; the finale needs all eighteen. Works hang about one per chunk, 14 to 22 m apart. The guide on `M` and the jumps are authors’ cheats (`docs/CHEATS.md`). The only counter a visitor sees is the rose.
- **Why it matters:** the no-analytics stance is a strength and should stay; it also means the length of the walk has never been measured on a stranger.
- **Recommended remediation:** a timed playtest with five people who have not seen the piece, each with the R R R card at the end (it already holds the state of the walk). Note when each leaves and what they had found. Decide from that whether the visitor needs one more hint (for example the rose showing “3 of 18” on hover or on Tab), a shorter road to the finale, or nothing.

### F-008 · Security headers missing except HSTS
- **Category:** Security
- **Impact:** Medium. Defence in depth for a page that can hold a camera stream.
- **Probability:** Low. No backend, no user input reaches `innerHTML`, no third-party script outside gesture mode.
- **Rating:** Low
- **Evidence:** live response for `/` carries `strict-transport-security` and no `content-security-policy`, `x-content-type-options`, `referrer-policy`, `permissions-policy` or frame rule.
- **Recommended remediation:** in `vercel.json` for `/(.*)`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()`, `Content-Security-Policy` with `frame-ancestors 'none'` and, after F-006, `default-src 'self'` with hashes for the inline mirror script, the import map and the JSON-LD. Test in report-only first.

### F-009 · Zoom locked on the home page and the gallery page
- **Category:** Accessibility
- **Impact:** Medium. WCAG 1.4.4; the welcome screen is a long text in a pixel font.
- **Probability:** Low. iOS ignores the lock; Android honours the lock.
- **Rating:** Low
- **Evidence:** `index.html:15` and `gallery.html:5`: `maximum-scale=1, user-scalable=no`.
- **Recommended remediation:** drop both from the meta tag and keep the pinch away from the canvas with `touch-action: none` on `#gl` while walking (the body already gets `.walking`).

### F-010 · No plain route to the eighteen works
- **Category:** Accessibility
- **Impact:** Medium. Without WebGL2, or with a screen reader, the series is unreachable.
- **Probability:** Low. Few visitors; still the ones the piece promises to reach.
- **Rating:** Low
- **Evidence:** `#webgl-error` shows one sentence. `assets/artworks.json` holds titles in two languages and there is no page that lists them. The canvas has no text alternative.
- **Recommended remediation:** a quiet `works.html` in the text-page layout: eighteen works, title, one line of description as alt text, in the order of the series. Link it from the WebGL error and the footer. It also gives search engines the works themselves. UVALISS decides whether the images may stand on a plain page.

### F-011 · Tab is captured in the walk, the volume slider has no key
- **Category:** Accessibility
- **Impact:** Low. Every other menu item has its own key.
- **Probability:** Medium. Any keyboard-only visitor.
- **Rating:** Low
- **Evidence:** `src/ui.js:413` calls `preventDefault` on Tab and toggles the menu; focus stays on the canvas, so the items cannot be reached by keyboard, and volume has no hotkey.
- **Recommended remediation:** on open, focus the first menu item and let the arrows move between items (the markup already says `role="menu"`); Escape closes and returns focus. Add `[` and `]` for volume.

### F-012 · Text pages lack description, canonical, hreflang, `<main>`
- **Category:** SEO
- **Impact:** Low.
- **Probability:** Medium. `?lang=ru` and `?lang=en` are two URLs of one document.
- **Rating:** Low
- **Evidence:** `tech.html`, `privacy.html`, `rider.html`: no `meta name="description"`, no `rel="canonical"`, no `hreflang`, no `<main>`, no skip link. `press.html` has a description only.
- **Recommended remediation:** per page: description, canonical without the query, `hreflang` pair for `?lang=ru` and `?lang=en`, a `<main>` around the two language sections.

### F-013 · On a phone the language buttons sit below the fold
- **Category:** UX
- **Impact:** Low.
- **Probability:** Medium. Every first visit on a small phone.
- **Rating:** Low
- **Evidence:** at 320×640 the first screen shows the title and both blurbs; `Русский` and `English` come after a scroll.
- **Recommended remediation:** put the two buttons right under the title, or show only the blurb that matches the browser language with the other one folded.

### F-014 · Repo and deploy carry dead weight and test switches
- **Category:** Hygiene
- **Impact:** Low.
- **Probability:** Low.
- **Rating:** Minimal
- **Evidence:** `prvm.png` (1.9 MB) at the root is tracked, deployed and referenced nowhere. `.claude/launch.json` holds eight servers, four of them pointing at scratchpads of closed sessions, and is the only dirty file. A worktree `agent-a6184956d841f3cb9` (34 MB) is still registered. Sketch switches ship to production: `?plantdraft`, `?clouds`, `?fogtop`, `?plants`, `?edge`, `?dream`, `?steps`. `vendor/three.module.js` is the unminified build (273 KB over the wire).
- **Recommended remediation:** delete `prvm.png`; keep two servers in `launch.json` (one plain, one no-store with the script moved into the repo under `tools/`); remove the worktree; move the sketch switches behind `?dbg`.

## What’s already working

- Privacy is a position here: no analytics, no cookies, no accounts, camera frames never leave the device, and the privacy page says so in plain words in both languages.
- Agentic readiness is complete for a piece of this kind: `robots.txt` with Content Signals and a clear split between assistants and training crawlers, `llms.txt`, Markdown twins through middleware (verified live: `Accept: text/markdown` returns 200 `text/markdown`), Agent Skills index, WebMCP tools.
- Memory stays flat: after sixteen chunk crossings geometries stayed between 157 and 206, textures between 47 and 58, heap near 225 MB. Disposal is done properly.
- Code loads lazily: the welcome screen needs 14 modules; the other 39 come on Enter.
- The quality governor reads the median frame, has a cooldown, never drops a desktop to the tier that changes the light, and lowers render scale under the CRT pass where it cannot be seen.
- Fallbacks hold: camera failure falls to keys at any moment, the world failing to build gives a retry, WebGL2 missing gives a message.
- The 404 page is styled and returns 404. Font is self-hosted with `font-display: swap`. HSTS with preload.
- One visual language runs across the gate, the welcome, the HUD tape, the text pages and the footer.

## Recommended next steps

F-002 decides how the piece opens on a stranger’s phone and is the one I would settle first. F-001 is one long frame every 19 m and worth a measured fix. F-004, F-008, F-009, F-012 and F-014 are small edits that fit one short session. F-003 and F-006 are investments that pay back in the gallery version (issue #22). F-007 is settled by a playtest with people; code follows the results.

**This report is a diagnosis. Say which findings (by number) should become fixes, and in what order.**

<!-- Je suis le spectre d'une rose que tu portais hier au bal. -->
