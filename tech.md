# CONSPACE ROOMS · specs

CONSPACE ROOMS is an interactive web installation created by Sinaida Krivchenko ([sinaida.eu](https://sinaida.eu)), a new media artist, who designed the experience and wrote the code. It presents SOULS, a series of artworks by UVALISS, the artist Alisa Feer ([uvaliss.ru](https://uvaliss.ru/)).

## Requirements

- A browser with WebGL2: a recent Chrome, Firefox, Safari or Edge.
- A computer or a modern phone; phones get a lighter mode.
- A webcam for gesture control. It is optional.

## How it is made

- Vanilla JavaScript modules, no build step, hosted on Vercel.
- three.js r166 for 3D, bundled with the project. Procedural GLSL materials: the labyrinth uses no texture files.
- The labyrinth is generated from a seed (the date and time of the visit), so every visit is new.
- Music and sound are synthesized live with Web Audio; no recordings are used.
- Gesture control uses MediaPipe Tasks Vision in the browser, only after the visitor chooses it.
- Typeface: Departure Mono by Helena Zhang (SIL Open Font License 1.1), self-hosted.
- Two CC0 3D models from Poly Haven (Old Bed Frame, Wheelchair 01); everything else is drawn in code.

## Gallery mode

`/gallery` runs the piece as an installation: no start screens or buttons, the webcam watches for a face, the walk starts when someone stands in front of the screen and resets to a new labyrinth when nobody has been there for a while. URL parameters: `lang` (ru or en), `idle` (seconds, default 40), `card` (seconds, default 25), `volume` (0 to 1), `seed` (a fixed labyrinth). For unattended use, run Chrome with `--kiosk --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream`.

## Licenses

- Project code: Apache License 2.0, © Sinaida Krivchenko.
- SOULS artworks: © UVALISS (Alisa Feer), all rights reserved.
- three.js: MIT. MediaPipe: Apache 2.0. Departure Mono: SIL OFL 1.1. Poly Haven models: CC0 1.0.

## Privacy

No analytics, no accounts. The camera image never leaves the device.
