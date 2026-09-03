# J2S Pro Skater

A single-level, gamepad-first 3D skateboarding prototype in the spirit of Tony Hawk's Pro Skater 1.
The point of this build is **game feel**: the skater controller, camera and animation are one
hand-tuned kinematic system (no rigid-body physics), and every number in it was play-tested.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Plug in an Xbox-style (XInput / "standard mapping") USB controller, press any button, skate.
Keyboard works as a fallback. Press **Back** (gamepad) or **Tab** to show the full control map in game.

`npm run build` produces a static bundle in `dist/`; `npm run preview` serves it.

## Controls (gamepad)

| Input | Action |
|---|---|
| Left stick | Analog steering on the ground, spin in the air, trick direction |
| Left stick up / RT | Push (analog) |
| Left stick down / LT | Brake |
| A | Hold to crouch, release to ollie – longer hold = bigger pop (0.55 s to full) |
| X + direction | Flip trick (Kickflip, Heelflip, Pop Shove-it, Impossible, 360 Flip, Varial Heel, Hardflip, Inward Heel) |
| B + direction | Grab trick (hold; Indy, Melon, Nosegrab, Tailgrab, Method, Stalefish, Judo, Airwalk) |
| Y + direction | Grind – widens the rail snap window and lets you take coping (50-50, Nosegrind, 5-0, Boardslide, Lipslide, Crooked, Overcrook, Smith, Feeble) |
| LB / RB | Spin left / right (digital, handy with the d-pad) |
| Right stick | Nudge the camera |
| Start | Start / restart the 2-minute free skate |
| Back | Toggle the controls panel |

Keyboard: arrows / WASD, Space (ollie), J (flip), K (grab), L (grind), Q/E (spin), Enter, Tab.

## What is in the box

- `src/skater.js` – the controller. States: ride, air, grind, bail. Surface following via raycasts with
  a 3-D travel vector that stays tangent to banks, transitions and vert; ramp-assisted uphill gravity;
  crouch "pump" in transitions; late-release ollie forgiveness at lips; vert airs auto-turn 180;
  forgiving landing snap (65°) with sketchy-landing speed scrub; rail snapping with a cooldown so rail
  exits are clean; wall splat vs. wall scrub; tiny hops don't break combos. All tuning lives in `TUNING`.
- `src/input.js` – Gamepad API (standard mapping) with radial deadzone, analog triggers, d-pad mirror,
  hot-plug detection, and a keyboard fallback smoothed to behave like a stick. Key taps are latched so
  they can never fall between frames.
- `src/character.js` – procedural low-poly skater and board with pose blending (ride, push cycle,
  crouch, air, per-trick flip/grab poses, grind, bail tumble), board flip animation per trick, carve lean.
- `src/camera.js` – third-person camera that follows travel direction (not body spin), pulls back with
  speed, avoids walls, never rolls.
- `src/level.js` – warehouse park: half pipe, two quarter pipes, long bank, raised platform with bank
  approach, 5-stair with handrail and hubba, pyramid fun box with ledge, kicker→rail line, kicker gap,
  two ledges, flat rails, a down bar. Also builds the raycast colliders and grind segments.
- `src/tricks.js` – trick tables, spin naming, THPS-style combo scoring (sum × trick count, repeat decay).
- `sim/playtest.js` – headless Node harness that drives the controller through scripted lines
  (push/coast, brake, carving, ollie heights, flips, quarter pipe, half pipe pumping, kicker→rail,
  boardslide, stairs, gap, wall). `npm run sim` prints state timelines; use it when re-tuning.

## Tuning notes (the numbers that matter)

- Gravity 22 m/s²: snappier than earth, floaty enough for tricks. Tap ollie ≈ 0.9 m / 0.57 s,
  full crouch ≈ 1.7 m / 0.79 s. Flip tricks take 0.38–0.55 s so a tap ollie can still land a kickflip.
- Push tops out at 9.6 m/s in about 1.5 s; rolling friction is gentle so lines carry across the park.
- Turn rate 3.1 rad/s at a standstill down to 1.75 rad/s at speed; crouching tightens turns by 30%.
- Spin 560°/s at full stick, so a full ollie is a comfortable 360 and a tap is a 180.
- Uphill gravity is scaled by 0.55 so a pushed run reaches every lip; downhill is full gravity.

## Graphics

The game uses modern Three.js rendering with physically-based materials, image-based lighting, soft shadows,
and ACES filmic tone mapping for a polished look. The procedural low-poly art style (0.84 m tall character,
simple geometric level) keeps the focus on movement and feel while supporting clear visual readout at distance.

### Grind

![Grind screenshot](screenshots/gfx_grind.png)

A 50-50 grind on a chrome rail showing orange sparks, soft PCF shadows, PBR material reflections, and glass HUD panels.

### Riding

![Ride screenshot](screenshots/gfx_ride.png)

Riding toward a quarter pipe with ACES tone mapping, image-based lighting, mipmapped textures, and vignette overlay.
