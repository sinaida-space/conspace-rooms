# CONSPACE ROOMS · cheats and secrets

For the authors, testers and anyone who wants to skip ahead. None of these are
shown in the piece itself. Key presses count the physical key, so they work in
any keyboard layout; the presses must come within three seconds.

## Keys (while walking)

| Keys | What happens |
|------|--------------|
| `7` × 5 | The nearest hanging work becomes the last one: every other work counts as seen (the rose shows 17 of 18) and you stand in front of it. Look at it and the arch of roses opens. |
| `5` × 5 | Jump to the nearest grandmother's room (the red rooms stage). |
| `M` × 5 | Toggle a guide chevron on the floor: in the hospital it points to the nearest portal into the red rooms, there to grandmother's room, then onward into the light. Press again to hide it. |
| `Shift` | Run. |

## Secrets in the walk

- **Walk backwards for 30 seconds** and you shrink to a child's height. Walk forwards for 25 seconds to grow back.
- **Stand still for a minute in the light (acceptance stage)** and a nineteenth frame appears.
- **Turn around** in front of a wall writing: some of them change behind your back.
- **Stand still in front of a door** for three seconds: it gives way for a moment.
- **All 18 works seen:** the arch of roses; walking through it opens the card of every question the souls asked.

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
