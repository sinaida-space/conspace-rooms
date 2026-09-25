# CONSPACE ROOMS

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

Primary: GitHub Pages from `main` (root):
https://sinaida-space.github.io/conspace-rooms/

Mirror: Neocities, https://conspace-rooms.neocities.org/

Both are free and both open from Russia without a VPN (checked with
check-host.net Russian nodes on 2026-09-25). Cloudflare Pages is not used:
Cloudflare is throttled in Russia. Codeberg Pages is not used either: its terms
require free licenses and the artworks are all rights reserved.

All asset and module paths are relative, so the site works unmodified under a
subpath or at a domain root. To (re)enable GitHub Pages:

```
gh api repos/sinaida-space/conspace-rooms/pages -X POST \
  -f build_type=legacy -f "source[branch]=main" -f "source[path]=/"
```

To update the Neocities mirror (log in once with `neocities login`, you type
the password yourself):

```
gem install neocities
./scripts/neocities-deploy.sh
```

The script uploads only tracked site files (no `.git`, `reel/`, `.claude/`).

Before any hosting change, check reachability from Russia:

```
curl -s -H 'Accept: application/json' \
  "https://check-host.net/check-http?host=https://sinaida-space.github.io/conspace-rooms/&max_nodes=40"
```

then read `https://check-host.net/check-result/<request_id>` and look at the
`ru*` nodes.

## Languages

The first screen asks for Russian or English. The choice is kept only in the
URL (`?lang=ru` / `?lang=en`), never in storage, so a link with `?lang=ru`
opens straight in Russian. All strings live in `src/i18n.js`. The text pages
(`tech.html`, `privacy.html`) hold both languages and switch the same way.

Easter egg: type `souls` (or tap the title five times) on the welcome screen.

## Stack

- Vanilla JS (ES modules), no build step
- [Departure Mono](https://github.com/rektdeckard/departure-mono) by Helena Zhang (SIL OFL 1.1), self-hosted in `assets/fonts/`
- [three.js](https://threejs.org/) (vendored) for rendering
- Procedural GLSL materials — no texture files for the labyrinth geometry itself
- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) hand landmarker for gesture mode (loaded lazily, opt-in)

## Rights

© Sinaida Krivchenko & UVALISS (Alsa Feer). Artworks all rights reserved.
