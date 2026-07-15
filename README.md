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

Served as a static site from `main` (root) via GitHub Pages:
https://sinaida-space.github.io/conspace-rooms/

All asset and module paths are relative, so the site works unmodified under the
`/conspace-rooms/` subpath. To (re)enable Pages:

```
gh api repos/sinaida-space/conspace-rooms/pages -X POST \
  -f build_type=legacy -f "source[branch]=main" -f "source[path]=/"
```

## Stack

- Vanilla JS (ES modules), no build step
- [three.js](https://threejs.org/) (vendored) for rendering
- Procedural GLSL materials — no texture files for the labyrinth geometry itself
- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) hand landmarker for gesture mode (loaded lazily, opt-in)

## Rights

© Sinaida Krivchenko & UVALISS (Alsa Feer). Artworks all rights reserved.
