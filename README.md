# J2S Pro Skater

A gamepad-first 3D skateboarding game in the spirit of Tony Hawk's Pro Skater 1,
with Genesee Warehouse and ROC City Skatepark in Rochester, New York.
The point of this build is **game feel**: the skater controller, camera and animation are one
hand-tuned kinematic system (no rigid-body physics), and every number in it was play-tested.

## Demo

[![Watch the J2S Pro Skater demo](https://img.youtube.com/vi/jho32KbQ5aQ/maxresdefault.jpg)](https://youtu.be/jho32KbQ5aQ)

_[Watch the gameplay demo on YouTube](https://youtu.be/jho32KbQ5aQ)._

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Plug in an Xbox-style (XInput / "standard mapping") USB controller, press a button to connect it,
then choose **Play**, select a level, and choose a goal to start your run.
Keyboard works as a fallback. Press **Back** (gamepad) or **Tab** to show the full control map in game.

## Home and level select

The home screen opens on a live view of the warehouse. **Play** opens the level selector,
where each playable spot shows its saved goal progress. Genesee Warehouse is Level 01;
ROC City Skatepark is Level 02. Each has an independent career and score table.
The home screen returns to the last selected spot during the session.

Use **Home** or **Level Select** from the goal board, results, or pause menu to leave the current
session. Earned goals and banked career records stay saved; a new run starts with a fresh timer
and partial collectible sets reset. Escape or controller B steps back through the menus.
Arrow keys / D-pad navigate, Enter / A selects, and the menus also support touch.

## Character selection

Use **Skater → Change** from Home or Level Select, choose **Joe** or **Aaron**,
then **Select Skater**. Back cancels the preview. Joe is the original character;
Aaron is a stylized KRUDCO placeholder based on the supplied reference, with an
olive cap, black glasses, salt-and-pepper beard and plaid overshirt over a red tee.

Both use the same board, animation rig, tricks and handling in both parks.
Character selection is cosmetic: careers and high scores stay with each level.
The selected skater persists under `j2s-pro-skater.character.v1`; inaccessible or
malformed storage falls back safely without touching existing progress.
Keyboard, controller and touch input work throughout the selector.

`npm run sim:characters` checks selection persistence, original-model parity,
rig contacts and resource disposal. `npm run qa:characters -- <preview-url>`
checks actual menu, skating and save/reload flows and captures screenshots.
Portraits are rendered from the actual game models; they can be regenerated
against a development server with
`node sim/charactercheck.js <dev-url> screenshots/characters --export-portraits`.

ROC City's parked cars, fence tops, benches, curbs and river-wall edge are also
grindable. Ollie near an edge and use Grind; Ollie again to dismount. See
[street grind routes and validation](STREET-GRINDS.md).

Grinds and grabs use individual contact-driven board and body poses for both
characters. See [TRICK-ANIMATION.md](TRICK-ANIMATION.md) for all seventeen tricks,
the anatomical contact references, comparisons and validation commands.
Switch poses follow the direction of travel, including manuals, grabs, pushing
and flips. Feeble is down-left and Smith is down-right. See
[switch stance corrections and validation](SWITCH-STANCE.md).

## Genesee Warehouse goals

Choose a focus on the goal board and **Start Goal Run** for a two-minute session. Only unfinished
career goals are active; a compact Run Focus checklist tracks all of them, with your selected goal
highlighted. Use the arrow keys or controller D-pad
to navigate, Enter / A to select, and Start to drop in.

Between runs, the focus stays on your selected goal while it is unfinished. Once earned, the
next run highlights the first unfinished career goal on the board, including after a restart
or reload. Results show that next focus before you drop in. Completed goals stay checked off on
the board as achievements, and cannot be selected again. After all seven are done, drop into Free Skate.

| Goal | Target |
|---|---|
| High Score | 2,500 banked points |
| Pro Score | 10,000 banked points |
| Sick Score | 25,000 banked points |
| Big Combo | One landed 3,000-point combo |
| Collect S-K-A-T-E | All five gold letters in one run, any order |
| Bottle Cap Hunt | All five vintage Genesee caps in one run |
| Secret Tape | The pink tape on the raised loading deck |

Completed goals and best records save immediately in this browser. Partial letter/cap collections
reset on every run; a bail does not take away pickups already collected. Pickups do not add score.
Once a collectible goal is complete, its pickups and HUD indicator disappear from later runs:
all five caps after Bottle Cap Hunt, all five letters only after the complete S-K-A-T-E goal,
and the tape after Secret Tape. Partial sets respawn in full until the goal is earned. Completed
score/combo goals also retire, so later runs cannot award them again. Each run keeps the goal set
it started with until the next restart or session.
Each checklist row shows its own live progress and checks off when earned. Completed rows stay
visible for the rest of that run, then retire from the checklist on your next run.
Score goals count only landed combos. When the buzzer catches a combo, **LAND IT!** gives you up
to 20 seconds to finish that line; pickups close at the buzzer, and a bail loses the unbanked points.
The results screen shows goals earned, new completions, the run score, and the best landed combo.

The five bottle caps feature distinct vintage Genesee Beer, 12 Horse Ale, Cream Ale, Genny Light,
and Light Ale labels. Their domed metal faces, crimped skirts and recessed undersides slowly turn
in the warehouse light. Teal halos and floor rings mark each collectible's position.

**Free Skate** has no timer or career goals. Pause to restart or return to the goal board, level selector, or home. Pausing
freezes the level and goal notifications; switching tabs automatically pauses the session. Existing
high scores remain available under **Best Runs** on the results screen. If browser storage is
unavailable, the game still works and retains progress in memory until reload.

![Genesee Warehouse goal board](screenshots/level-goals/board-desktop.png)

`npm run sim:level` checks progression, timing, all pickup approaches, a complete S-K-A-T-E route,
and attainable score/combo targets using actual skating physics. With the dev server running,
`npm run qa:level` checks the integrated browser flow in an isolated Edge profile and captures the UI.
`npm run qa:checklist` checks every live goal row, completion and restart behavior, and desktop/phone layouts.
`npm run qa:navigation` checks the home/level/run flow, menu input, saved progress, and responsive layouts.
`npm run sim:roccity` checks the outdoor park's actual surfaces, transitions, collection routes,
separate progression, and below-grade bail recovery. `npm run qa:roccity` checks both parks in the
browser, repeated switching, saved careers, and phone layouts.
`npm run sim:bottlecaps` checks the caps' physical geometry, rotation and collectible lifecycle;
`npm run qa:bottlecaps` renders all five designs and checks them in desktop and touch-mode play.

`npm run build` produces a static bundle in `dist/`; `npm run preview` serves it.

## ROC City Skatepark

The second level follows the Phase 1 feature map and photographs: a connected multi-depth
bowl with pool coping, seven- and nine-stair sets, blue hubbas, yellow rails, an A-frame,
and the street promenade beneath I-490 with its manual pad and extended quarter pipe.
The blue Rochester flower marks the upper street deck beside the Riverway Trail.
Concrete shares the warehouse's photographed surface maps, with outdoor lighting and slab joints.

ROC has its own High Score (5,000), Pro Score (15,000), Sick Score (35,000), Big Combo (5,000),
S-K-A-T-E, five bottle caps, and secret tape. Completion in one park never retires another
park's pickups. Keyboard, controller and mobile touch controls work in both.

See [the reference and implementation notes](ROC-CITY-LEVEL.md) for source links and
feature correspondence. Dimensions are estimates from the supplied map and public photos;
this is a playable recreation rather than a surveyed model.

The Riverway environment adds branching broadleaf trees, varied planting, Rochester-inspired
brick storefronts, worn streets and detailed bridge materials. See [the environment art review](ENVIRONMENT-ART.md)
for photographic references, matching before/after views, iteration notes and measured rendering costs.
The [ambient-life pass](ENVIRONMENT-LIFE.md) adds spectators, sidewalk walkers, cafe furniture,
parked bikes and gently moving planting, with a reduced-motion option inherited from the operating system.

![ROC City Skatepark](screenshots/environment/final/desktop-wide-establishing.png)

## Controls (gamepad)

| Input | Action |
|---|---|
| Left stick | Analog steering on the ground, spin in the air, trick direction, **balance while grinding** |
| Left stick ↓↑ flick | Manual (↑↓ for Nose Manual). Flick in the air to land in one. While manualling the vertical axis balances the pitch — you can't push on two wheels, so it's free |
| A (hold) | Crouch **= speed up** (THPS style); release to ollie – longer hold = bigger pop (0.55 s to full) |
| X + direction | Flip trick (Kickflip, Heelflip, Pop Shove-it, Impossible, 360 Flip, Varial Heel, Hardflip, Inward Heel). Can be pressed during the crouch or on the release frame – it fires on takeoff |
| B + direction | Grab trick (hold; Indy, Melon, Nosegrab, Tailgrab, Method, Stalefish, Judo, Airwalk) |
| Y + direction | Grind – a tap in the air arms a 0.6 s window; park rails assist within 2.6 m, including coping. Street objects use a tighter 0.65 m range (50-50, Nosegrind, 5-0, Boardslide, Lipslide, Crooked, Overcrook, Smith, Feeble). |
| Left stick down | Brake |
| Left stick up | Extra push – optional, the skater pushes by himself below 5.4 m/s on flat |
| L2 / R2 (ZL / ZR, LT / RT) | Revert left / right anywhere on the ground to toggle regular/switch. On ramp landings, flick into a manual to keep the combo. Triggers no longer push or brake |
| LB / RB | Spin left / right (digital, handy with the d-pad) |
| Right stick | Nudge the camera |
| Start | Start a goal run; pause / resume during play |
| Back | Toggle the controls panel |

Keyboard: arrows / WASD, Space (ollie), J (flip), K (grab), L (grind), Q/E (spin), Z/C (revert), Enter (start / pause), Escape (pause / resume), Tab (controls).

Quarter-pipe ollies carry the climb upward and return to the transition, with
manual spins taking priority over automatic facing. See [the air comparison and
verification notes](QUARTER-PIPE-AIRS.md); `npm run sim:transitions` checks both parks.

## Controls (phone / tablet)

Touch controls appear automatically on devices with a coarse primary pointer. Landscape gives
your thumbs the most room; portrait also works. Tap a goal and **Start Goal Run**, or use **Free
Skate** to learn the controls without a timer.

- Left thumb: drag the stick to steer or spin; up pushes, down brakes. Flick down then up for a
  manual, or up then down for a nose manual. The skater also pushes automatically at low speed.
- Right thumb: hold **Ollie** to build speed and charge a jump; release to pop. Tap **Flip** while
  charging or airborne, hold **Grab**, and tap or hold **Grind** near a rail. Stick direction picks
  the trick. **Revert** turns your stance on the ground and can link ramp landings.
- Tap **Pause** for music, restart, the goal board, level select, or home; the board's **Controls** button shows the full
  control map. Pausing, switching apps, rotating
  the screen, or an interrupted touch clears held controls without releasing a surprise ollie.

Phones use lighter rendering by default (1× pixels, no dynamic shadows or floor reflections).
Add `?highfx` to compare full effects, or `?touch` to try the controls with a mouse on desktop.
Keyboard and gamepad inputs remain available. Progress belongs to each browser and site origin;
the public ChatGPT Site and a local development server keep separate records.
The ChatGPT Site is the active deployment target; the former Netlify repository
connection has been removed, so pushes and pull requests no longer trigger Netlify builds.

`npm run sim:touch` checks input ownership, short taps, cancellation, and keyboard/gamepad
coexistence. With the dev server running, `npm run qa:mobile` checks actual browser multitouch
events and captures landscape/portrait screenshots. These checks emulate a phone in Edge;
physical-device comfort and performance still need hands-on testing.

Start, Enter or the on-screen Pause button opens the pause/settings menu during a run. Resume keeps
your position, score and remaining time; Restart Run explicitly resets the session. Navigate with
Up/Down, Tab/Shift+Tab, the D-pad or left stick; select with Enter/Space or controller A. Escape,
Start, controller B/Back, Resume or the backdrop closes it. Music remains adjustable while the
simulation, animations, effects, timer and skating audio/haptics pause. Held menu inputs must be
released before skating again; an interrupted ollie charge cancels to avoid an accidental pop.
Outside a run, use **Settings** for music; Escape steps back through the menus and opens settings
from home. See [pause verification](PAUSE-MENU.md).

## What is in the box

- `src/front-end.js` / `src/front-end.css` – responsive home and level selection, with
  keyboard, controller and touch navigation. `src/levels.js` holds the level catalog;
  Genesee Warehouse is the first playable entry.
- `src/skater.js` – the controller. States: ride, air, grind, bail. Surface following via raycasts with
  a 3-D travel vector that stays tangent to banks, transitions and vert; ramp-assisted uphill gravity;
  crouch "pump" in transitions; late-release ollie forgiveness at lips; steep ollies carry upward
  momentum into a return to the ramp, with automatic facing that yields to manual spins;
  forgiving landing snap (65°) with sketchy-landing speed scrub; rail snapping with a cooldown so rail
  exits are clean; wall splat vs. wall scrub; tiny hops don't break combos. THPS-style input forgiveness:
  flip/grab presses are buffered through the pop, a grind tap arms a magnet window that steers you onto
  the nearest rail, crouch is the accelerator and the skater auto-pushes when slow. All tuning lives in `TUNING`.
- `src/input.js` – Gamepad API (standard mapping) with radial deadzone, analog triggers, d-pad mirror,
  hot-plug detection, and a keyboard fallback smoothed to behave like a stick. Key taps are latched so
  they can never fall between frames.
- `src/character.js` – procedural skater and board with pose blending (ride, push cycle,
  crouch, air, per-trick flip/grab poses, grind, bail tumble), board flip animation per trick, carve lean.
- `src/camera.js` – third-person camera that follows travel direction (not body spin), pulls back with
  speed, anticipates spins, opens the view for grinds, avoids walls, never rolls, and layers spring-driven
  landing/bail impacts over the stable follow path.
- `src/level.js` – warehouse park: half pipe, two quarter pipes, long bank, raised platform with bank
  approach, 5-stair with handrail and hubba, pyramid fun box with ledge, kicker→rail line, kicker gap,
  two ledges, flat rails, a down bar. Also builds the raycast colliders and grind segments.
- `src/tricks.js` – trick tables, spin naming and the combo maths, priced from
  [`THPS-SCORING-SYSTEM.md`](THPS-SCORING-SYSTEM.md). See [Scoring](#scoring).
- `src/highscores.js` – the best-runs table, persisted to `localStorage` and available from the
  end-of-run record display. Stored data is re-validated on load, and every access is guarded so a browser
  with storage blocked simply keeps the table in memory for the session.
- `src/settings.js` – player preferences, persisted to `localStorage` with the same guarded access as
  the high-score table. Music is off by default; the pause/settings menu controls it, and switching
  it on is the gesture that starts the audio context.
- `src/balance.js` – the balance meter, as an inverted pendulum. One class, two tunings: `BALANCE` for
  grinds (roll axis, stick X) and `MANUAL_BALANCE` for manuals (pitch axis, stick Y). Standalone with an
  injectable rng so it can be tested on its own (`npm run sim:balance`).
- `sim/playtest.js` – headless Node harness that drives the controller through scripted lines
  (push/coast, brake, carving, ollie heights, flips, quarter pipe, half pipe pumping, kicker→rail,
  boardslide, stairs, gap, wall). `npm run sim` prints state timelines; use it when re-tuning.
- `sim/feeltest.js` – deterministic camera, haptic-mixing and 180° spin-tick checks (`npm run sim:feel`).
- `sim/scoretest.js` – pins every point value and combo rule to the scoring document, and exercises the
  high-score table against corrupt and unavailable storage (`npm run sim:score`).

## Scoring

Point values and the combo maths come from [`THPS-SCORING-SYSTEM.md`](THPS-SCORING-SYSTEM.md), so a run
here lands in the same range it would in Tony Hawk's Pro Skater 1+2:

```
Final Score = Σ(base × stance × degradation) × combo multiplier
```

- **Base values** by tier. Flips are all 100 — in THPS the direction you pick buys variety, not points.
  Grabs are 300 standard (Indy, Melon, Nosegrab, Tailgrab, Method, Stalefish), 350 advanced (Judo) and
  50 weak (Airwalk). Grinds are 100 basic (50-50, Nosegrind, 5-0), 125 advanced (Crooked, Overcrook,
  Smith, Feeble) and 200 for slides (Boardslide, Lipslide). Manuals are 100.
- **Multiplier** is the length of the chain: every trick adds 1x, and every completed 360 of rotation
  adds another. There is no cap — a 20-trick line really is x20.
- **Degradation** punishes repetition inside a combo: 100%, then 75%, 50%, 25%, and 10% from the fifth
  use on. It resets when the combo banks.
- **Switch** (riding fakie) pays 1.2× and counts as a different trick, so it gives a worn-out trick a
  fresh start. Switch tricks read as `Switch Kickflip` in the combo line.
- **Rotation** pays into the base of the trick it was thrown with, escalating hard: 180 is 100, 360 is
  250, 540 is 450, 720 is 700, and every further half-turn adds 400.
- **Holding** pays flat and undegraded: 100/s on a rail, 50/s in a manual, 100/s on a grab held past its
  minimum tuck. Length is worth something; it is not worth as much as another trick.
- **Reverts** change stance and scrub speed anywhere on the ground, including during manuals.
  A timed ramp-landing revert adds zero base points and one multiplier to connect into a manual.
  Other stance changes add no score or multiplier and never refresh the combo window or balance.
- Gaps are the one multiplier source from the document that is not implemented — the warehouse has no
  named gaps to clear yet.

`npm run sim:score` asserts all of the above and prints a sample line.

### High scores

Finished runs go into a ten-deep table in `localStorage`, newest ranking applied at the moment the clock
hits zero. The best of them shows under the live score as `SCORE TO BEAT`, in small type so it never
competes with the number you are watching; pass it and the line turns green and reads `NEW RECORD`. The
full table appears under Best Runs after a run, with the run you just finished highlighted.
Restarting mid-run abandons it without recording anything.

## Tuning notes (the numbers that matter)

- Gravity 22 m/s²: snappier than earth, floaty enough for tricks. Tap ollie ≈ 0.9 m / 0.57 s,
  full crouch ≈ 1.7 m / 0.79 s. Flip tricks take 0.38–0.55 s so a tap ollie can still land a kickflip.
- Holding crouch is the fastest way to move: 9.5 m/s² up to 10.8 m/s, above the 9.6 m/s stick push, so it
  reaches 9.3 m/s in a second and tops out in about 1.4 s. The skater auto-pushes to 5.4 m/s on flat so you
  never crawl; stick-up push still works on top. Rolling friction is gentle.
- Grind magnet: a tap of Y arms 0.6 s; rails within 2.6 m pull at up to 18 m/s² (4.5 m/s max closing speed)
  and snap from 1.3 m away, even when the rail is up to 0.45 m above the feet. In the sim, a line 1.4 m off
  the flat rail with a single tap becomes a 50-50; the same line without the tap lands on the floor.
- Flip/grab presses on the ground are buffered 0.25 s (indefinitely while crouched) and fire on takeoff, so
  X on the same frame as the A release, or during the crouch, always produces the trick.
- Turn rate 3.1 rad/s at a standstill down to 1.75 rad/s at speed; crouching tightens turns by 30%.
- Spin 560°/s at full stick, so a full ollie is a comfortable 360 and a tap is a 180.
- Reverts accept a fresh trigger tap on the ground at any speed; let the slide finish before tapping
  again to switch back. Airborne taps buffer for touchdown for 0.22 s. For a ramp combo link, tap
  up to 0.22 s before or 0.18 s after a valid ramp/vert landing.
  The wheel slide turns 180° over 0.26 s, keeps travel direction and loses 0.85 m/s. There is a 0.9 s
  window to connect a manual; a buffered flick waits for the transition to flatten. Without a manual
  the combo banks, and simply hopping during that window cannot carry it. The existing balance needle
  and accumulated difficulty survive the connection. `node sim/reverttest.js` covers inputs, timing,
  scoring, balance carryover, invalid landings and foot contact during the slide.
- Uphill gravity is scaled by 0.55 so a pushed run reaches every lip; downhill is full gravity.
- The skater rides regular: left foot forward, chest toward the right of travel. The push cycle plants the
  back foot on the ground beside the deck and strokes nose→tail along the travel axis, with the front leg
  bent so the pushing foot actually reaches the floor.
- Feet stay on the deck: flexing a hip swings the ankle toward the toe side, so on the ground the pelvis
  slides back by that same amount (`legReach`). The feet stay planted with ~1.5 cm over each rail and the
  hips travel back-and-down through a crouch instead of the shoes walking off the toe edge. Airborne the
  pelvis stays put and the board tracks the feet instead — averaged over both legs and capped at 5 cm, so a
  flick trick (a heelflip throws the front leg 0.59 m out) spins the board free rather than gluing it to the
  flicking foot. `node sim/rigcheck.js` prints the per-pose numbers.
- Grind balance is an inverted pendulum: the further you are tipped the harder it pulls you over, and the
  stick applies *acceleration* rather than moving the needle, so the meter carries momentum. Your weight
  also takes ~0.1 s to follow the stick, which is what makes slamming it back and forth overshoot into a
  wobble you cannot outrun. Against a simulated player with 0.14 s reaction lag: no input falls in 2.3 s,
  a light touch lasts ~7.4 s, a heavy hand 4.2 s, frantic 3.9 s. Nothing holds a long rail for free.
  Everything pushing you over is capped at 75% of your full-stick authority, so a lean is always
  recoverable given room; being at the edge *already moving outward* is not, and that point of no return
  is what keeps it tense. Difficulty ramps along the rail, with the combo banked, and as you slow down.
  A fresh balance challenge gets 0.32 s of grace, so the first short rail is forgiving. Within one combo,
  grinds and manuals share the last needle position, velocity, wander and accumulated balance time.
  Air time pauses that state; another rail, a manual or a nose-manual resumes it without new grace.
  Banking, bailing or restarting clears it. `node sim/balancechaintest.js` checks these boundaries and
  verifies that repeated short hops cannot keep an uncorrected rider balanced forever.
- Manuals run the same pendulum on the pitch axis, tuned tighter: quicker to run away (2.2 s with no input
  vs 2.3 s on a rail) but quicker to correct, and it ramps faster, so a manual is a connector between
  tricks rather than somewhere to park. Entry is a down-up flick that **only arms from centre** — that one
  rule is what stops the ordinary push-then-brake sweep, which crosses both thresholds, being read as a
  manual. On two wheels you can't push, pump or brake, which is both correct and what frees the whole
  vertical stick axis for balancing. Ollie out and the combo carries on; roll to a stop and it banks.
- The balance HUD follows the skater on screen: a tapered yellow/red arc above the head for grinds,
  or a vertical arc on the left for manuals, with a cyan pointer moving along the curve.
- Camera: ordinary riding follows 2.9–3.46 m behind with a 52–56° FOV, framing the skater at roughly
  half the viewport height. Grinds ease out to 4 m and 56° for rail visibility. Air spins lead by up to 8°
  while the base camera continues following travel, so rotation remains readable. Landings drive a short
  down/back spring punch; only hard landings shake, while bails use the full filtered shake envelope.
- Haptics: a per-frame mixer lets feedback overlap without motors fighting. Ollie charge rises under the
  low-frequency motor, every scored 180° gives a short high-frequency tick, landings scale with impact,
  and grinds buzz continuously. Metal drives the high motor; concrete ledges use a coarser low rumble.
  Grind/manual balance error is layered over the surface texture and grows sharply near failure.

## Graphics

The game uses Three.js physically based materials, image-based lighting, soft shadows,
and ACES filmic tone mapping. The visual upgrade preserves that lighting setup and the original
controller, collision geometry, camera, and pose timing.

- Detailed procedural skater: shaped clothing, fabric bump maps, rounded anatomy, cap, shirt graphics,
  and skate shoes with separate soles and laces, on the original animation rig.
- Continuous concave skateboard deck with curved nose/tail, grip tape, maple laminations, an original
  underside graphic, mounting bolts, trucks, bushings, bearings, and rounded urethane wheels.
- Deterministic local concrete, plywood, masonry, bump and roughness maps. Surface UVs use physical
  scale, with separate expansion joints, worn paint, and wheel marks on the floor.
- Smoother visual quarter-pipe curves, lightly rounded concrete edges, coping, steel toe plates,
  ledge caps and rail anchors. The original colliders remain in use, including in browser builds.
- Warehouse trusses, fixtures, windows, loading doors, utility pipes, signage, and wall art. Static
  dressing is merged by material and excluded from physics and the extra shadow-caster workload.

Most artwork is generated locally once at startup. The floor uses three bundled 2K concrete maps
from [Poly Haven](https://polyhaven.com/a/smooth_concrete_floor) (CC0, Dimitrios Savva), totaling
2.66 MB after JPEG optimization. There are no third-party asset requests at runtime or new package dependencies.
See [texture provenance](public/textures/concrete/SOURCE.md) for source filenames and original checksums.

The concrete floor combines matching color/normal/roughness maps with unique, location-based dirt,
wheel polish, repair fills, and chipped six-metre slab joints. Paint is integrated into that material.
A 512 x 512 reflection pass captures the actual warehouse; mip filtering blurs it according to surface
roughness, and Fresnel weighting makes the sheen stronger at grazing angles. It reuses existing shadows.
The original lights, exposure and collision geometry are unchanged.

Concrete banks, platforms, stairs, hubbas and unpainted ledges are the same pour as the floor: the
same three texture objects, mineral tint, six-metre slab tone variation, and gloss range, so a box top
and the slab beside it match. Their world-scaled mapping keeps detail consistent across differently
sized pieces, and ridden surfaces are burnished while dirt gathers at ground level. Surfaces facing up
enough to catch it re-use the floor's single reflection pass, re-projected from world space; there are
no extra texture downloads, materials, or render passes. The implementation is in
`src/concrete-obstacles.js`.

The existing `?lowfx` URL option disables both shadows and floor reflections and caps pixel ratio at 1.
It retains the floor textures and wear. If texture loading fails, skating continues with the procedural
floor and its paint. The isolated browser check covers this failure case as well as normal and lowfx rendering.
These are detailed stylized assets; they are not scanned or externally authored AAA character assets.

The skater uses narrower, sloped shoulders, a larger head, tapered clothing and a more settled riding
pose. Each hand is one cached, continuous skin surface with finger webbing and a rooted thumb;
`src/hand-art.js` generates those surfaces once, not during animation. Facial contours, eyelids and
surface-fitted lips replace the disconnected facial primitives. Board dimensions and foot anchors
are unchanged. The hoodie hem and pocket blend from hip to chest motion so torso twists do not
pull the elastic waistband through the jeans.

The current outfit is full-length blue denim and a charcoal-black Genesee pullover hoodie.
The hoodie has a lowered hood, a red G back print, drawstrings, a kangaroo pocket and ribbed
trim. The jean cuffs follow the ankles to preserve shoe clearance during pushes and tricks.
See [OUTFIT-UPDATE.md](OUTFIT-UPDATE.md) for matching before/after views, live gameplay evidence
and rendering measurements. `node sim/outfittest.js` checks the cuff and hood clearances.

The warehouse now carries the Genesee G on its floor and main wall sign, plus a Rochester
flower mural and loading-area plaques. Local Barlow fonts connect the warehouse signage
with the menus and HUD. See [WAREHOUSE-IDENTITY.md](WAREHOUSE-IDENTITY.md) for comparisons,
asset sources and production-build checks, including font failure/delay handling.

Art code: `src/materials.js`, `src/skater-art.js`, `src/hand-art.js`, `src/warehouse-art.js`, and `src/concrete-floor.js`.
For repeatable browser visual checks on Windows, run `node sim/graphicscheck.js http://127.0.0.1:5173/`
with the dev server running. It launches a disposable headless Edge profile, verifies rendering and
keyboard/lowfx operation, and saves screenshots under `screenshots/visual-upgrade/`.
The captures include both wrists, the temple/hood opening and the shoe side for close-up polish review.
Run `node sim/arttest.js` to check closed cuffs, tucked sleeve edges, hood lining and smooth UV seams.
Run `node sim/proportiontest.js` to check the shoulder/head ratio, hip-anchored hem and watertight, connected hand geometry.
The dev server ignores generated screenshot directories so QA captures do not trigger page reloads.
Set `EDGE_PATH` if Edge is installed elsewhere. Headless frame timings are diagnostic, not a
performance guarantee for other devices. Existing gameplay checks remain available through `npm run sim`,
`npm run sim:feel`, `npm run sim:balance`, and `node sim/animtest.js`.

![Updated warehouse and skater](screenshots/visual-upgrade/skater.png)

![Detailed skateboard](screenshots/visual-upgrade/board.png)

![Concrete detail and blurred warehouse reflections](screenshots/concrete-after/floor-detail.png)

### Title Screen

![Goal board](screenshots/level-goals/board-desktop.png)

The goal board—choose a focus and start a two-minute goal run, or choose untimed Free Skate.

### Kickflip

![Kickflip](screenshots/closeup_flip.png)

A kickflip caught mid-rotation: the board spins under the tucked legs while the trick name reads out in the HUD.

### Grind

![Grind screenshot](screenshots/gfx_grind.png)

A 50-50 down the chrome flat rail, sparks trailing off the trucks, with the live combo readout underneath.

### Riding

![Ride screenshot](screenshots/gfx_ride.png)

Carving toward the west quarter pipe at speed, in regular stance with the knees loaded over the deck.
