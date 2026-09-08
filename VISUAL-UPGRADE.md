# Warehouse visual pass — September 2026

The newer [Genesee reference pass](BREWERY-UPDATE.md) replaces the skater outfit,
adds brewery dressing and increases the sun shadow map to 4096px. This document
records the preceding warehouse/push checkpoint.

Implemented and visually reviewed in Playwright. The earlier browser startup blocker was resolved through the connected Playwright browser. Git write access was restored when this session's permissions changed to full access; checkpoints use `codex/warehouse-visual-polish`.

## Art direction and changes

Late-afternoon industrial warehouse: warm sunlight, cool fill, muted amber signs and teal masonry. The palette carries through the title and HUD.

- **Environment and light:** shadow-casting roof strips aligned to the skylights, cool fill, loading-bay lights, drifting dust, surface contact shadows, elevated maintenance gallery, ladders, ductwork, factory windows, worn posters and wall numbers. Static detail remains merged by material. One 2048px sun shadow map; no added postprocessing passes.
- **Skater and board:** cloth sheen, readable hoodie print that follows the torso, rotating wheels with sidewall markings, and retained foot planting/trick poses. Browser review corrected a hidden, dark and mirrored print.
- **Motion feedback:** bounded pools for landing, ollie and revert dust; sparks for metal grinds and dust for concrete ledges. Contact shadows follow actual floor, platform and bank surfaces. Pools clear on restart.
- **Presentation:** asymmetric title over a moving warehouse view, native Drop In and Controls buttons, compact HUD and responsive menus. Fixed landscape overlap and scrolling. Focused button activation no longer leaks Enter/Space into skating. Reduced-motion preferences disable title orbit and interface animation.
- **Geometry correction:** the stair hubba was pitched backward. Its visible slab and collider now rise toward the platform and follow the grind line.
- **Push correction from user feedback:** pelvis and chest turn toward travel, the supporting shoe pivots forward over the leading truck, and the trailing foot strokes beside the deck with separated knees. Fakie swaps the supporting and pushing feet. The head looks ahead; stopping recovers from the current stroke position instead of snapping the free foot to the front of the board.

Low-effects mode reduces particle budgets and omits ambient dust, practical lighting, reflections and sun shadows.

## Visual evidence

The environment comparisons use baseline commit `55c96068567088fbbd6a5f23dc5c7f6d8bbd1020` and matching camera/pose coordinates at 1440 × 900. The title comparison intentionally shows each version's title camera. The push comparison was captured immediately before and after the push correction, with the upgraded environment in both images.

| View | Before | After |
| --- | --- | --- |
| Warehouse | [Before](screenshots/warehouse-before/warehouse.png) | [After](screenshots/warehouse-after/warehouse.png) |
| Title | [Before](screenshots/warehouse-before/title.png) | [After](screenshots/warehouse-after/title.png) |
| Skater detail | [Before](screenshots/warehouse-before/skater-back.png) | [After](screenshots/warehouse-after/skater-back.png) |
| Banks and stairs | [Before](screenshots/warehouse-before/concrete-banks.png) | [After](screenshots/warehouse-after/concrete-banks.png) |
| Ride camera | [Before](screenshots/warehouse-before/camera-ride.png) | [After](screenshots/warehouse-after/camera-ride.png) |
| Board underside | [Before](screenshots/warehouse-before/board-underside.png) | [After](screenshots/warehouse-after/board-underside.png) |
| Push posture | [Before](screenshots/warehouse-before/push.png) | [After](screenshots/warehouse-after/push.png) |

[Push motion clip](screenshots/warehouse-after/push-motion.webm): fixed-camera rig preview of three seconds each of regular and fakie pushing. The character is held in place to inspect the animation; this is not a gameplay recording.

Additional captures cover plant/stroke/return in both stances, phone and landscape titles, grind/manual HUD at three viewport sizes, live rail/ledge effects, replay and low-effects play. These are in `screenshots/warehouse-after/`.

## Verification

- **23 live Playwright checks passed:** three title viewport sizes, controls and settings, keyboard button activation, Drop In, forward-facing regular/fakie pushes using W input, charged ollie/kickflip landing and scoring, both reverts, live metal/concrete grinds and balance HUD, standard-gamepad ollie/flip input, end/replay, low-effects play and no runtime/shader/WebGL errors.
- Grind and manual HUD fit desktop (1440 × 900), phone (390 × 844), and landscape (844 × 390). Landscape title has no page overflow.
- **Push regression:** `node sim/pushtest.js` passes 1,440 settled frames covering both stances and turns, gaze/chest/pelvis direction, leading shoe placement, floor contact, separated knees, recovery and no foot teleport on release.
- **Rig checks:** foot planting passes 7,203 deck contacts across 4,339 frames, including ramps, manuals, grabs, pushes and flip catches. Animation simulation runs 4,801 frames with zero invalid transforms. Art, crouch, head and proportion checks passed; head skinning covers 32,175 collar/face vertex checks.
- Existing balance, balance-chain, camera/haptics, scoring and revert checks passed. The scripted skating playtest completed; its printed bail scenarios are not visual assertions. Output is in `screenshots/warehouse-after/playtest.txt`.
- `node sim/effectstest.js` passes surface contact, ramp normals, material-specific particles, pool bounds/expiry/reset, skylight occlusion, hubba direction, low-effects budgets and wheel rotation checks.
- `node sim/menutest.js` passes button/gameplay key separation.
- **Production build passed** through Vite's `build({ configFile: false })` API. The ordinary CLI config bundler cannot read a parent directory under this session's restrictions. The project config only adjusts the dev watcher, so bypassing it does not alter production build settings. Vite still warns that the game's single JavaScript chunk exceeds 500 kB.

### Frame timing

At 1440 × 900 in the tested browser, baseline title sampling measured median 16.7 ms / p95 16.8 ms; upgraded title sampling measured 16.7 ms / 16.7 ms (120 frames each). The live gameplay sample measured median 16.7 ms / p95 16.8 ms over 360 frames, approximately 60 fps. These short samples are regression signals, not a guarantee for other hardware, pixel densities or long sessions.

### Repeating the browser checks

Start the updated source on port 5173. To recapture comparisons, serve the baseline commit from a separate directory on port 5174. The baseline archive and extracted source are retained locally but ignored by Git.

Use Playwright's `browser_run_code_unsafe` tool with the absolute `filename` of:

1. `sim/visual-capture.playwright.js` — matching before/after camera captures.
2. `sim/visual-live.playwright.js` — isolated-context live input and rendering tests.
3. `sim/push-visual.playwright.js` — phase captures and native browser video recording.

The scripts currently use this workspace's absolute screenshot path; adjust it when running elsewhere. Physical controller input is disabled in QA pages; the gamepad test injects standard-mapped input through the normal polling path.

## Remaining limits

The result is a cohesive procedural warehouse and stylized character, not a photorealistic AAA asset production. Controller mapping was tested with simulated input; physical rumble was not assessed. The native video clip is an animation inspection aid. Hardware coverage and prolonged performance testing remain limited.

The initial Git permission error is resolved. Check the branch log for checkpoint commits and upstream status for push results.
