# Genesee warehouse — reference pass

The subsequent [brewery detail and character pass](BREWERY-DETAILS.md) adds the
keg/case storage areas, machinery, heel adjustment, brown hair and beard.
This document records the earlier THPS reference pass.

Completed on `codex/warehouse-visual-polish`, following the supplied THPS 1+2 screenshots.
Git access is restored and implementation checkpoints are pushed:

- `36b239d`: preceding warehouse visual upgrade and push correction.
- `8be00d0`: slimmer skater, T-shirt, cargo shorts and material upgrade.
- `ef09956`: Genesee warehouse dressing and finer skylight shadows.

## Skater

The flared hoodie and broad jeans are replaced by a navy cotton T-shirt, charcoal
cargo shorts, bare arms and lower legs, crew socks and worn suede skate shoes.
Hip-joint spacing changes from 30 cm to 20.6 cm. Clothing stays narrower than the
shoulders; shaped knees and tapered calves replace the bulky trouser silhouette.
The cap remains, without adding a helmet or pads.

Separate cotton/twill color, normal and roughness maps provide fabric grain,
uneven wash and stitching. The shirt has geometric folds and a worn Rochester/1878
back print. Cargo pockets follow the thigh curvature, and skin spans each elbow
and knee. The forward-facing push and planted leading foot work in both stances.

## Warehouse

Genesee Beer & Ale, Cream Ale and bottling signs establish the brewery identity.
The lettering includes Rochester and 1878, consistent with [Genesee's company history](https://www.geneseebeer.com/about/).
This is an imagined skating warehouse, not a reconstruction of the actual brewery.

Exposed brick, irregular limewash loss, water staining and layered Rochester,
High Falls, Genny and 585 graffiti weather the perimeter. More graffiti covers
the half-pipe's outer face. Kegs, timber pallets, cones, scattered paper and dirty
storage bays add detail. The west quarter-pipe now uses plywood. A finer skylight
grid and one 4096px sun shadow map add clearer light patterns; reduced fill gives
the shaded areas more depth. Low-effects mode still disables those shadows.

## Matching views

Before images were captured from `36b239d`; after images use the same camera and
pose setup at 1440 × 900. Title cameras move slowly, so title views are approximate.

| View | Before | After |
| --- | --- | --- |
| Skater | [Before](screenshots/brewery-before/skater-back.png) | [After](screenshots/brewery-after/skater-back.png) |
| Warehouse | [Before](screenshots/brewery-before/warehouse.png) | [After](screenshots/brewery-after/warehouse.png) |
| Gameplay camera | [Before](screenshots/brewery-before/camera-ride.png) | [After](screenshots/brewery-after/camera-ride.png) |
| Transitions | [Before](screenshots/brewery-before/transitions.png) | [After](screenshots/brewery-after/transitions.png) |
| Title | [Before](screenshots/brewery-before/title.png) | [After](screenshots/brewery-after/title.png) |

[Push animation clip](screenshots/brewery-after/push-motion.webm) shows regular and
fakie cycles in a fixed-camera rig preview. The character is held in place for
inspection; it is not a recording of a live skating run.

Additional images show [keg storage](screenshots/brewery-after/keg-storage.png),
[graffiti](screenshots/brewery-after/graffiti-wall.png),
[cones and dirt](screenshots/brewery-after/cone-and-dirt.png), responsive menus,
live rail/ledge effects and low-effects play.

## Verification and limits

- 23 live browser checks passed: regular/fakie pushing with keyboard input,
  ollie/kickflip landings and scoring, reverts, rail/ledge grinds and material
  effects, simulated standard-gamepad input, native menus, replay, low-effects
  play, and no browser runtime/shader/WebGL errors.
- Rig tests pass 7,203 foot contacts across 4,339 frames and 1,440 settled push
  frames. Proportions, shirt-hem anchoring, cuff-free arm geometry, crouching and
  head skinning pass. The animation simulation completes 4,801 frames with no
  invalid transforms. Effect and revert regression checks pass.
- Production build passed using Vite's `build({configFile:false})` API. The single
  JavaScript chunk is about 678 kB (189 kB gzip); Vite reports its size warning.
- Browser samples remain around 60 fps: median 16.7 ms / p95 16.8 ms for both the
  120-frame title capture and 360-frame live gameplay sample at 1440 × 900.
  These are short samples on this machine, not broad hardware benchmarks.

The art is still procedural and stylized. Skin, facial expression and cloth
deformation remain simpler than the THPS reference. Props are static visual
dressing; they do not have knock-over physics. Physical controller rumble was not
tested. The game is available from the running local development server.

Use `sim/brewery-capture.playwright.js` through Playwright's filename-based code
runner to repeat the after views. The original live and push capture scripts can
also be used with their output directory changed to `screenshots/brewery-after/`.
