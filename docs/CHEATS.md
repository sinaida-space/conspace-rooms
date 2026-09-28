# CONSPACE ROOMS · cheats and secrets

For the authors, testers and anyone who wants to skip ahead. None of these are
shown in the piece itself. Key presses count the physical key, so they work in
any keyboard layout; the presses must come within three seconds.

## Keys (while walking)

| Keys | What happens |
|------|--------------|
| `7` × 5 | The nearest hanging work becomes the last one: every other work counts as seen (the rose shows 17 of 18) and you stand in front of it. Look at it and the arch of roses opens. |
| `5` × 5 | Jump to the nearest grandmother's room (the red rooms stage). |
| `B` × 5 | Chevrons on the floor lead to the nearest grandmother's room, the one with the television and the lampshade (the world turns to the red rooms first if you are still in the hospital). Once you are in it they go out, and the souls begin to wander the corridors. |
| `0` × 5 | Straight into the light: the world turns to the acceptance stage where you stand. |
| `M` × 5 | Toggle a guide chevron on the floor: in the hospital it points to the nearest portal into the red rooms, there to grandmother's room, then onward into the light. Press again to hide it. |
| `Shift` | Run. |

## Secrets in the walk

- **Walk backwards for 30 seconds** and you shrink to a child's height. Walk forwards for 25 seconds to grow back.
- **Turn around** in front of a wall writing: some of them change behind your back.
- **Stand still near a door** (up to 4.5 m away) for two seconds: it creaks open for a moment, then slams.
- **All 18 works seen:** the arch of roses; walking through it opens the card of every question the souls asked.

## Portals now follow what you find, not chance

- Nothing is decided at world-build time any more. In the hospital, **3 works
  seen** summons the portal into the red rooms: it lands at a corridor
  crossing 8–16 m out, ahead of you if there is one that way, and it stays
  there for the rest of the visit even if its chunk unloads.
- In the red rooms, once you have **found grandmother's room and seen 5 more
  works there**, the portal into the light is summoned the same way.
- The moment the fear portal is summoned, a solid metal door also appears in
  a side wall 2–5 m before it, on your route to it. Get within 2.6 m and
  roughly facing it and it swings open by itself: a ruined stairwell behind
  it, smoke, a picture of the stairs. It holds a couple of seconds, then
  slams for good — once only, per visit.
- `7` × 5, `5` × 5, `B` × 5, `0` × 5 and `1` × 5 all still work exactly as
  below. Setting the stage directly with a cheat does not touch the counts:
  if you cheat into fear with 3 works already seen, the portal is summoned
  as soon as the threshold check next runs. Adding ids straight into
  `soul.seen` (or the `7` × 5 cheat, which adds several at once) counts them
  into whichever stage you are in at that moment too.

## On the welcome screen

- **Click the CONSPACE ROOMS wordmark** to play a small Pac-Man.
- **The cortisol molecule** in the background: click one star, then another, and current runs between them; a third click lights the whole molecule and opens a note about cortisol.

## Links

| Link | What it does |
|------|--------------|
| `?lang=ru` / `?lang=en` | Skip the language screen. |
| `?seed=<integer>` | One fixed labyrinth instead of a new one each visit (the default seed is the UTC date and time). |
| `/voprosy` | Unlisted page with every question in the piece. |
| `/gallery` | Installation mode for a projector and a webcam; parameters on the tech page. |

## For development

`window.__app` exposes the scene, player, world and the rest; `window.__app.frame()`
steps one frame by hand, which is how the piece is tested in hidden browser tabs.
