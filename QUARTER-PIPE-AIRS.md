# Quarter-pipe ollies

The old ollie added most of its impulse along the surface normal. Near a
vertical lip, that normal points horizontally out of the ramp, so a charged
ollie kicked the rider across the park instead of carrying the climb upward.

Steep ascending ollies now blend that outward impulse into a small clearance
drift. Vertical velocity and travel along the coping remain unchanged. The
blend starts above roughly 49 degrees and reaches full strength above roughly
63 degrees; shallow bank and flat-ground jumps retain their previous behavior.
An early release that still travels inward can transfer onto the deck.

Automatic facing follows the return direction, including diagonal and fakie
airs. At the apex, a short ballistic forecast refines the facing for the actual
landing surface, including the mini-ramp's adjoining side bank. This changes
only facing: it does not move the rider, change velocity, relax landing
tolerance or award spin points. Steering or a bumper spin cancels that assist
for the rest of the air. Natural ramp exits without an ollie are unchanged.

## Measured comparison

These are identical controller and native touch input sequences, recorded from
flat approaches through takeoff, apex and landing in the built application.
Distances measure outward travel from takeoff to landing; peak heights are
board position in level coordinates, not height above the lip.

| Route | Before outward travel | After outward travel | Peak board height, unchanged |
|---|---:|---:|---:|
| Warehouse west quarter pipe | 7.96 m | 0.93 m | 6.39 m |
| ROC City bridge quarter pipe | 7.56 m | 0.93 m | 5.28 m |

Both fixed routes land back on the curved transition without bailing.
Controller and touch trajectories match. The reports and approach, takeoff,
apex and landing screenshots are in `screenshots/transitions/before/` and
`screenshots/transitions/after/`.

## Verification

- `npm run sim:transitions`: 38 checks covering lip and held releases, angled
  airs, both mini-ramp lips, both bridge heights, regular/fakie stance, manual
  override, reset, unchanged flat/bank trajectories and a real grind exit.
- `npm run sim:roccity`: all 101 surface, skating-route and progression checks.
- `npm run sim:level`, `sim:revert`, `sim:score`, `sim:touch` and `sim:feel`: pass.
- `node sim/transitioncheck.js <preview-url> <output-directory>`: all four
  controller/touch trajectory checks pass with no browser or WebGL errors.
  Set `QA_BASELINE_REPORT` to the before report to compare the two recordings.
- `node sim/roccitycheck.js <preview-url> <output-directory>`: all ten integrated
  checks pass, including controller grinding, independent saved careers,
  completed-goal retirement, level switching and three mobile viewport sizes.
- `npm run build` succeeds; the existing bundle-size advisory remains.

Touch testing uses browser emulation, not a physical phone. These checks cover
representative routes and release timings; they do not guarantee every possible
speed, approach angle or trick will land. Park geometry, character proportions,
camera tuning, saved progress and input mappings are unchanged by this fix.
