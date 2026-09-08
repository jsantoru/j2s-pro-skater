# Genesee brewery detail and character pass

Built on the previous reference pass, on `codex/warehouse-visual-polish`.
Implementation checkpoints are pushed: `bd3271f` (character) and `6fa1bf1`
(brewery stock, collision, startup timing and visual evidence).

## What changed

The northwest corner now combines a keg return area with a small cellar bay.
Twenty-four stainless kegs replace the generic colored drums and earlier simple
kegs. They have shaped bodies, subtle dents, open carrying collars, rolled rims,
fittings and curved inventory labels. Two domed, cone-bottom vessels have
service plates, manways, welded bands, valves, pipework and a coiled hose.

The northeast packing area replaces the generic wooden crates with stacks of
Genesee Beer, Cream Ale and kraft cartons. Seven loaded pallets hold 132 cases;
three have shrink wrap and dispatch labels. Printed faces, taped flaps, barcodes,
alternating orientations and different stack heights distinguish the stock.
Reusable bottle crates, amber bottles, a pallet jack, a keg hand truck and empty
pallets complete the loading areas. Worn signs, floor stencils, water/dirt stains,
a drain, a repair patch, paper scraps and bottle caps concentrate wear around use.

The skater's ankle now enters the rear third of the shoe, moving its offset from
55 mm to 78 mm. A padded heel opening surrounds the sock. The existing inverse
kinematics compensates the offset, preserving the sole's position over the truck.
Short brown curved locks emerge from under the cap; a textured brown beard and
mustache follow the deforming face and neck. The slimmer outfit and forward push
remain, without a helmet or pads.

The first animation-frame timestamp could precede initialization's stored time
after synchronous asset creation. Clamping the frame delta to zero prevents a
negative accumulator from delaying skating input immediately after loading.

## Gameplay and performance

Eighteen simple collision hulls share placement data with the major stock piles,
loose kegs and tanks. The platform kegs now sit on its actual 1.6 m surface.
The half-pipe, rails, stairs, banks and central skating lines keep their layout.
Small machinery, fittings, hose, empty pallets and litter are decorative.
Static parts are merged by material; the large props cast shadows.

- Production build passed: `npm run build`; 35 modules, 693.67 kB JavaScript /
  195.17 kB gzip. The existing warning about a chunk larger than 500 kB remains.
- 23 browser checks passed, including keyboard and simulated standard gamepad
  tricks/scoring, regular/fakie push, reverts, rail/ledge grinds, menus, replay,
  responsive viewports and low-effects play. No runtime/shader/WebGL errors.
- Five additional routes passed through the live game loop and follow camera:
  keg returns, tank bay, packing, loading aisle and platform kegs. The route
  checks require actual movement and caught the startup timing issue.
- `node sim/brewerytest.js` passed stock placement/top collision, all authored
  grind clearances, four access lanes and three normal-physics stock approaches.
- Foot planting passed 7,203 contacts across 4,339 frames; pushing passed 1,440
  regular/fakie frames. Head deformation, proportions, clothing seams, effects
  and revert regression checks also passed.
- At 1440 × 900 / DPR 1, the 360-frame gameplay sample and 240-frame dense stock
  view both measured median 16.7 ms / p95 16.8 ms, about 60 fps on this machine.
  The dense view rendered about 200,000 triangles. These are short local samples.

## Comparable views

Before images were captured from `2915cda`, before this task's edits; after images
use the same cameras and settled poses. Images are 1440 × 900, except the push
preview at 960 × 720. Moving title and live gameplay frames are illustrative,
not exact comparisons.

| View | Before | After |
| --- | --- | --- |
| Keg returns | [Before](screenshots/brewery-detail-before/keg-returns.png) | [After](screenshots/brewery-detail-after/keg-returns.png) |
| Tanks | [Before](screenshots/brewery-detail-before/tank-bay.png) | [After](screenshots/brewery-detail-after/tank-bay.png) |
| Beer cases | [Before](screenshots/brewery-detail-before/cases-close.png) | [After](screenshots/brewery-detail-after/cases-close.png) |
| Loading area | [Before](screenshots/brewery-detail-before/loading-area.png) | [After](screenshots/brewery-detail-after/loading-area.png) |
| Face | [Before](screenshots/brewery-detail-before/face.png) | [After](screenshots/brewery-detail-after/face.png) |
| Hair | [Before](screenshots/brewery-detail-before/hair-back.png) | [After](screenshots/brewery-detail-after/hair-back.png) |
| Ankle/shoe | [Before](screenshots/brewery-detail-before/ankle-shoe.png) | [After](screenshots/brewery-detail-after/ankle-shoe.png) |

[Regular/fakie push clip](screenshots/brewery-detail-after/push-motion.webm) is a
fixed-camera rig preview with the skater held in place. The five `live-*.png`
brewery route images show the normal game loop, input and follow camera.

Repeat the detail views with `sim/brewery-detail-capture.playwright.js` and the
new routes with `sim/brewery-live.playwright.js`, using Playwright's filename code
runner. Existing `sim/visual-live.playwright.js`, `sim/brewery-capture.playwright.js`
and `sim/push-visual.playwright.js` were run with their output directory changed
to `screenshots/brewery-detail-after/`.

## Limits and PR handoff

The character remains procedural and stylized, with simple skin, facial
expression and cloth deformation. Hair is attached geometry, without strand
simulation. Stock is static, its collision uses approximate hulls, and the
loading/brewing machinery is decorative. Shrink wrap is a lightweight surface
effect. Physical controller rumble and a broad range of hardware were not tested.

There was no open PR for this branch when checked. [PR-VISUALS.md](PR-VISUALS.md)
contains a ready-to-paste description/comment with immutable GitHub screenshot
links and testing results. No PR was created or merged.
