# CONSPACE ROOMS · cheats and secrets

For the authors, testers and anyone who wants to skip ahead. None of these are
shown in the piece itself. Key presses count the physical key, so they work in
any keyboard layout; the presses must come within three seconds.

## Keys (while walking)

| Keys | What happens |
|------|--------------|
| `1` × 5 | Fear (the hospital). |
| `2` × 5 | Grandmother's zone (the red rooms). |
| `3` × 5 | Acceptance (the light). |
| `0` × 5 | Acceptance, then straight into the finale: every work counts as seen and the arch of roses rises. |
| `M` × 5 | The way on, for the authors. In fear and in grandmother's zone the next portal is summoned at once if it is not there yet (grandmother's room counts as found) and chevrons on the floor lead to it; five more presses put them out. In the light the whole ending plays: every work counts as seen, the roses in the corner shed, the walls part and the arch of roses rises as the way out. |
| `Shift` | Run. |

Digits work from the top row and the numpad, with or without Shift; M works in
any layout (`Ь` on the Russian one) and either case. The presses must be the
same key, within three seconds; any other key in between starts the count
again. Each code answers with a flash even when you are already there. The
older codes `7`, `5` and `B` are gone.

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
- The codes above still work as described. Setting the stage directly with a cheat does not touch the counts:
  if you cheat into fear with 3 works already seen, the portal is summoned
  as soon as the threshold check next runs. Adding ids straight into
  `soul.seen` (or the `0` × 5 cheat, which adds them all at once) counts them
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

Crossing a portal draws the world into a tunnel of light for about three
seconds (src/tunnel.js): `window.__app.soul._cross(1)` or `_cross(2)` plays a
crossing on the spot, and `window.__app.tunnel.seek(1.6)` holds it at that
second to look at (`seek(null)` lets it go on). `?debug=events` logs the
ambient events; `window.__app.events.fire('fall')` stages one. The metal door
onto the stairwell belongs to fear alone and is gone once you leave it.
