# Ruby Red Kölsch captain wall panel

The supplied package mascot now appears on a weathered navy-and-yellow enamel sign in the east-wall bay between Beer & Ale and bay 01. The reference-based illustration retains his cap, beard, red pipe, grapefruit and glass carrier. Local canvas lettering, chipped enamel and rusty fasteners connect it to the existing brewery signs; the panel receives the warehouse lighting and shadows.

The 4.3 × 5.375 m panel sits below the duct and adds no collider. Its local 1.43 MB PNG loads asynchronously into one canvas material. A labeled panel remains visible if the image is unavailable. Artwork provenance and both image-edit prompts are in [SOURCE.md](public/textures/brewery/SOURCE.md).

## Visual evidence

Baseline: `d51d17d` (warehouse local identity). Before and after use the same 1440 × 900 viewport, camera positions and 48° field of view; the character and HUD are hidden for the three comparisons. Reproduce with `sim/captain-capture.playwright.js` through the Playwright runner, changing its output root for a baseline checkout. Development server: port 5173.

| View | Before | After |
| --- | --- | --- |
| Wall detail | [Before](screenshots/captain-before/wall.png) | [After](screenshots/captain-after/wall.png) |
| Stair approach | [Before](screenshots/captain-before/approach.png) | [After](screenshots/captain-after/approach.png) |
| East bays | [Before](screenshots/captain-before/east-bays.png) | [After](screenshots/captain-after/east-bays.png) |

[Normal follow camera, approaching the wall](screenshots/captain-after/gameplay-wide.png) and [close push approach](screenshots/captain-after/gameplay.png) retain the live HUD and character. The sign is mounted above the ramp: its lower left is occluded from some directions, and the fixed gameplay camera crops the top when very close. The full mascot is readable from across the skate floor.

## Validation

- `npm run build`: passed. Vite retains the existing >500 kB JavaScript chunk advisory.
- `node sim/brewerytest.js`: passed stock-hull placement, grind clearances, four access lanes and three physics approaches.
- Existing `sim/visual-live.playwright.js`: all 23 checks passed, covering regular/fakie push posture, keyboard/controller ollies and flips, landings, rail/ledge grinds and effects, responsive title/menu controls, replay and low-effects mode. Output was redirected to this task's screenshot directory.
- Production preview on port 5175: image loads; normal follow-camera push approach stays in ride state; delaying the image leaves skating active before the art arrives; a forced image 404 leaves the labeled fallback and a playable run. No uncaught browser exceptions or WebGL errors. The forced 404 is intentional.
- Matching east-bay render: 92 → 93 draw calls, 144,490 → 144,492 triangles, 77 → 78 textures. The panel adds one draw call, two triangles and one GPU canvas texture.
- Browser timing across 360 live frames: median 16.7 ms, p95 16.8 ms on this machine. This is a local observation, not a guarantee on slower devices.

Structured results: [verification.json](screenshots/captain-after/verification.json). The mascot is a recreation from the user's packaging reference, rather than an official original production asset.
