# CONSPACE ROOMS on itch.io

Upload kit for an HTML5 page. The account, the upload and the payment settings
are done by hand on itch.io.

## Build

```
sh tools/build-itch.sh
```

Makes `dist/conspace-rooms-itch.zip` (about 25 MB, 105 files): the site as it
is, without the press trailer. `index.html` sits at the root, as itch expects.

## Page settings

| Field | Value |
|---|---|
| Kind of project | HTML |
| Upload | `conspace-rooms-itch.zip`, tick “This file will be played in the browser” |
| Embed | “Click to launch in fullscreen” (the labyrinth needs the whole screen and pointer lock) |
| Viewport | 1280 × 720 |
| Mobile friendly | yes, orientation: landscape |
| Pricing | No payments, or “Pay what you want”, 0 minimum, suggested €3 |
| Genre | Exploration / walking simulator |
| Tags | walking-simulator, atmospheric, liminal-space, art-game, surreal, psychological, exploration, procedural-generation, short, soviet |
| Release status | Released |
| Community | comments on |
| Cover | 630 × 500 from `assets/press/conspace-rooms-hospital-corridor.jpg` |
| Screenshots | stills from `assets/press/`, plus fresh ones from the red rooms and the light |
| Trailer | the Instagram or YouTube link to the reel |

Gesture control may not start inside itch's frame, because the frame decides
whether the camera is allowed. The keyboard, mouse and touch controls always
work. The description says so and links to the site for gestures.

## Title

CONSPACE ROOMS

## Short description (the line under the title)

A labyrinth of half-lit rooms that hides eighteen paintings. Find them all.

## Description

A walk-through piece by Sinaida and UVALISS. Eighteen works from the SOULS
series by UVALISS hang in a labyrinth of half-lit rooms that your browser builds
as you walk: hospital corridors of fear, a grandmother’s flat full of memory,
pale rooms dissolving into lace and light.

There is no map. Candles show the way, a rare door gives way if you stand still
in front of it, and every work hums its own note. A rose in the corner grows
with each work you meet; find all eighteen and an arch of roses lets you out.

Every visit builds a new labyrinth, and the music is generated as you walk.
Put on headphones and go slowly.

Controls: W / S or the arrows to walk, the mouse or ← / → to turn, E or a click
to look closer, Shift to run. On a phone, hold the top of the screen to walk
and drag to turn.

Steer with your hands: open https://conspace-rooms.vercel.app/ and choose
gestures (it needs your webcam; the image never leaves your device).

No analytics, no accounts.

Content: flickering light, sudden loud sounds, darkness, hospital imagery. 16+.

Concept, experience design and code: Sinaida Krivchenko (sinaida.eu).
SOULS series works © UVALISS (Alisa Feer, uvaliss.ru).
