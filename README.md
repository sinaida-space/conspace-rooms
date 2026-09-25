![CONSPACE ROOMS](.github/conspace.png)

# CONSPACE ROOMS

**Live:** https://conspace-rooms.vercel.app/

An interactive web installation — a collaboration between Sinaida and UVALISS.

You walk an infinite, procedurally generated labyrinth of undocumented, half-lit rooms —
liminal space with no signage, no exits marked, no map. It is not a level to be solved; it
is a space to be present in. Eighteen SOULS pieces by UVALISS hang framed on its walls,
found rather than curated, encountered in whatever order the corridors happen to unfold.
This is an open call as much as a finished piece — the labyrinth keeps generating past any
single walkthrough, and there is no "end" to reach.

## Collaboration

Sinaida × UVALISS — SOULS series.

UVALISS (Alisa Feer) is a visual artist from Saint Petersburg exploring themes of light and
darkness, childhood and dreams. Her SOULS series looks into one's own inner world and
accepts it as it is.

- Sinaida — [sinaida.eu](https://sinaida.eu/) · [@sin.ai.da](https://www.instagram.com/sin.ai.da)
- UVALISS — [uvaliss.ru](https://uvaliss.ru/) · [@uvaliss](https://www.instagram.com/uvaliss/)

## Controls

| Action                | Desktop (gestures)         | Desktop (keyboard)          | Mobile (light mode)          |
|------------------------|-----------------------------|-------------------------------|---------------------------------|
| Walk                   | both hands as fists         | W / ↑, S / ↓                  | hold top half of the screen     |
| Turn                   | point right hand = turn right, point left hand = turn left | ← / →, or mouse look (click to lock) | horizontal drag |
| Zoom                   | both palms open, spread/pinch the two hands | mouse wheel         | two-finger pinch (desktop-touch fallback) |
| Strafe                 | —                            | A / D                         | —                                |
| Inspect                | thumb-index pinch (either hand) | E or Space, click        | tap an artwork                  |
| Close inspect / stop   | both palms open              | Escape                        | tap again                       |

Gesture mode requests webcam access on entry (opt-in); if it's denied or unavailable the
experience falls back to keyboard controls automatically. Light mode is auto-suggested on
touch devices and runs at reduced quality (tier 0, tighter draw radius, no post-processing,
half-resolution artwork textures, no webcam).

## Run locally

```
python3 -m http.server 4800
```

Then open http://localhost:4800/ in a browser. Requires WebGL2.

## Deploy

Vercel, from `main` (root), no build step:
https://conspace-rooms.vercel.app/

Every push to `main` redeploys production. Project settings: Application
Preset `Other`, Root Directory `./`, build, output and install commands left
empty. Vercel Web Analytics and Speed Insights stay off: the privacy policy
promises no analytics.

Cloudflare Pages is not used: Cloudflare is throttled in Russia. Codeberg
Pages is not used either: its terms require free licenses and the artworks are
all rights reserved.

All asset and module paths are relative, so the site works unmodified under a
subpath or at a domain root.

Before any hosting change, check reachability from Russia:

```
curl -s -H 'Accept: application/json' \
  "https://check-host.net/check-http?host=https://conspace-rooms.vercel.app/&max_nodes=40"
```

then read `https://check-host.net/check-result/<request_id>` and look at the
`ru*` nodes.

## Путь души (soul path)

The labyrinth follows the arc of the SOULS series, from trauma to accepting
oneself. Distance from spawn picks the zone (`src/zones.js`, blended in the
shaders in `src/materials.js`):

- **Fear** (0–45 m): hospital corridors, green oil paint under whitewash, damp,
  linoleum, cold tubes that flicker often.
- **Memory** (80–135 m): grandmother's flat, rosette wallpaper, rugs on the
  walls, parquet, warm lampshades.
- **Acceptance** (175 m and on): pale walls dissolving into lace and light.

`src/soulpath.js` adds the responsive layer. The world stays in one stage and
moves on only through a portal: a scratched baroque frame with a shimmering
veil. Candles along the walls are the map: in the hospital corridors their
flames redden toward a portal into the red rooms; in the red rooms the flame
turns yellow toward the next portal and the wax itself reddens toward
grandmother's room. In that room three souls drift (someone close, a child, a
grown-up); walk into one and its question types itself on the television.
Terminal printouts on the walls ask questions of their own, chalk writings sit
at a child's height, red scratches lead to unseen works, some doors lift after
three seconds of stillness. Every work hums its own note, and when you look
closely at one (E) it opens its own sound world (`src/ambience.js`: rain,
wind, fire, a clock, a music box, a heart monitor…). Shift runs.
`src/dust.js` hangs dust in the lamp beams. Nothing is stored.

Secrets: walk backwards for 30 s; stand still for a minute in the last stage.

## Languages

The first screen asks for Russian or English. The choice is kept only in the
URL (`?lang=ru` / `?lang=en`), never in storage, so a link with `?lang=ru`
opens straight in Russian. All strings live in `src/i18n.js`. The text pages
(`tech.html`, `privacy.html`) hold both languages and switch the same way.

Easter egg: click the CONSPACE ROOMS title on the welcome screen.

## Stack

- Vanilla JS (ES modules), no build step
- [Departure Mono](https://github.com/rektdeckard/departure-mono) by Helena Zhang (SIL OFL 1.1), self-hosted in `assets/fonts/`
- [three.js](https://threejs.org/) (vendored) for rendering
- Procedural GLSL materials — no texture files for the labyrinth geometry itself
- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) hand landmarker for gesture mode (loaded lazily, opt-in)

## Rights

© Sinaida Krivchenko & UVALISS (Alsa Feer). Artworks all rights reserved.
