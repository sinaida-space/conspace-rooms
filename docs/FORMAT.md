# The labyrinth as a format

CONSPACE ROOMS was built for one series, SOULS by UVALISS. This note separates
the part that could carry another artist's exhibition from the part that
belongs to SOULS, as the ground for an offer to other artists, galleries and
museums. Nothing here is built yet; it describes the skeleton, not code.

## The idea in one paragraph

An exhibition that opens in a browser. The artist's works hang in a labyrinth
of rooms that is built anew for each visitor, so no two people meet them in the
same order. The walk passes through worlds that tell the exhibition's story,
a counter grows with every work met, and meeting them all opens an ending.
The same link runs on a phone at home and, in a gallery, as a projection
steered by hand gestures.

## What stays the same for every exhibition

| Part | Where it lives now |
|---|---|
| The labyrinth grown from a seed (time of entry), chunks built as you walk | `world.js`, `geom.js` |
| Walking, turning, looking closer; keyboard, mouse, touch, hand gestures | `player.js`, `input.js`, `hands.js` |
| Works hung in corridors, never by doors; the inspect placard | `artworks.js`, `frames.js` |
| A counter of works met, an ending when all are met | `roses.js` (the counter), `soulpath.js` (the ending) |
| Worlds that change through portals, one look blending into the next | `zones.js`, `soulpath.js` |
| Generative sound: one note per work, music per world | `ambience.js`, `music.js`, `audio.js` |
| Quality tiers, light mode for phones | `quality.js`, `device.js`, `post.js` |
| Gallery mode: attract screen, gestures, idle reset, offline keeper, operator panel | `gallery.js`, `keeper.js`, `sw.js` |
| Walk clip for Reels, final card as an image | `clip.js`, `card.js` |
| Two languages, press and rider pages, privacy without analytics | `i18n.js`, the HTML pages |

## What each exhibition brings

| Layer | For SOULS | For another show |
|---|---|---|
| Works | 18 images with titles in two languages (`assets/artworks.json`) | any number, same fields |
| Worlds | fear, memory, acceptance: hospital, grandmother's flat, lace and light | two to four worlds chosen with the artist |
| Materials of each world | GLSL in `materials.js` (paint under whitewash, rosette wallpaper, lace) | new shaders per world |
| Props | hospital beds and drips (`ward.js`), grandmother's room (`kitchen.js`) | one set of props per world, optional |
| The counter and the ending | a rose that grows; an arch of roses | a sign drawn from the show (a plant, a thread, a light) |
| Texts inside the walk | the souls' questions, wall writings | the show's own questions or none |
| Music | Soviet lo-fi, synth, gramophone records | a palette per world |
| Title, credits, colour | CONSPACE ROOMS, green terminal screen | the show's identity inside the same frame |

## How far the code is from this

These are estimates, before any extraction work:

- **Same worlds, other works.** Swapping the 18 images, titles and texts is
  already close to a data change. About 2–3 days, including testing.
- **One exhibition file.** Moving world names, colours, the counter, texts and
  music choices into one config per show. About 1–2 weeks.
- **A new world.** Its shaders, props, sound and light. About 2–4 weeks per
  world, the most artistic part of the work.

## What could be sold

- **A show in the labyrinth:** an artist's or gallery's exhibition built into
  the format, with worlds designed for it. Priced per project.
- **The gallery version:** the rider as it is, a fee per showing, installation
  help on site or remotely.
- **Licence of an existing labyrinth** for a limited period (a festival, an
  exhibition run), with the gallery mode.

Rights: the engine and code are Sinaida's; works stay with their artists; each
show needs its own agreement on credit and fees.
