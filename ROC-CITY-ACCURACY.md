# ROC City accuracy review

**Follow-up correction:** The later [layout audit](ROC-CITY-LAYOUT.md) found that
G's placement and direction were still wrong despite the checks below. It
supersedes the claims here that the complete stair arrangement was verified.
This document records the earlier passes and their gameplay checks.

This review covers the Phase 1 A–L park in the supplied feature map. The source
baseline is `bf6be1056ec8f33946087b3fe601fb6baf1f1b4a`. Comparison images are
rendered from the actual game with fixed viewpoints using
`node sim/rocaccuracycheck.js <preview-url> <output-directory>`.

## Evidence and confidence

The supplied A–L map establishes feature identity and relative arrangement.
The [official park photographs and renderings](https://roccitypark.org/wp/the-park/)
include the overhead `DJI_0173.jpg` and six April 2021 ground photographs.
Completed-park photographs take precedence over a conflicting conceptual shape.
No dimensioned, as-built survey was available in these references.

| Detail | Evidence | Confidence / limit |
| --- | --- | --- |
| North and southwest entrances; bowl west of street; promenade south under I-490 | Feature map, drone | Verified arrangement; metre coordinates estimated |
| Angled, terrain-connected mini ramp beside the bowl deck | Map B, photos 01–02, drone | Verified configuration; width, angle and transition radius estimated |
| Joined deep rounded bowl and shallower rectangular southern pocket | Map D, drone, photo 03 | Verified silhouette and depth relationship; exact curves and depths estimated |
| Seven and nine stair sets with handrails and hubbas; banks beside E | Map E/G, photos 02/04/05 | Counts supported; G placement/orientation corrected in the later layout audit; dimensions estimated |
| A-frame with continuous plaza-facing quarter-pipe hip | Map H, photo 05 | Verified connected form; transition profile estimated |
| Mellow bank, flat rail, manual pad, terminal quarter with extension | Map I–L, photo 06 | Verified sequence and relative placement; clearance and dimensions estimated |
| Pale concrete, blue ledge edges, yellow rails/risers, Rochester flower | Photos 01–06 | Verified appearance; wear and exact shades interpreted |
| Rust-brown bridge beams, pale longitudinal support rows and strip lighting | Photo 06 | Verified structural vocabulary; spans, grades and surrounding buildings estimated |

## Pass 1 — layout

Baseline inspection found an added entry bank running through B's flat bottom.
It also found overlapping bowl/flower deck surfaces, an unblended H hip, an
over-rounded southern bowl pocket, and a missing support wedge beside I.
The west trail and river edge needed visible/physical boundary agreement.

Baseline screenshots are in `screenshots/roc-accuracy/before/`. Corrections and
the results of the three passes are recorded below as each pass is completed.

Unchanged-system checks during layout work: 25 goal checks, 16 session checks,
16 scoring checks, all 11 warehouse pickup approaches, the warehouse SKATE and
score/combo routes, 10 touch-input checks, and 3 menu-input checks passed. These
exercise the existing behavior that this park-specific correction must preserve.

The first corrected visual checkpoint was inspected from all eleven cameras.
It confirmed the angled mini, connected deck, squared shallow bowl pocket,
continuous H hip, and longitudinal bridge supports. The comparison also exposed
an unfilled mini-extension trim outline, an uneven pool tile strip, overly tall
promenade sidewalls, and a stair-bank landing extending into the lawn. These
findings were corrected and rechecked before closing this pass.

Pass 1 completed: the extension is solid, the tile strip follows the actual wall,
G has a paved landing connected to the southwest entrance, and the promenade
edges meet the surrounding rock bed. Fresh screenshots in
`screenshots/roc-accuracy/pass1-checkpoint/` were checked after these corrections.
The remaining texture projection seams, tile appearance and painted trim are
assigned to the final visual pass.

Validation: production build, 13 geometry/gameplay checks, 5 surroundings checks,
6 linked-rail checks, 8 independent-career checks, 5 below-grade recovery checks,
and desktop/mobile bridge-clearance checks passed. The new SKATE route takes
18.39 seconds with no bails. The deterministic score route banks 42,250 in 42.82
seconds with two recoverable bails and a 9,000-point best combo.

## Pass 2 — geometry and rideability

Every A–L feature was checked from its ground-level view and with input-driven
approach/transition/exit routes. The full footprint scan found no unsupported
interior samples. Visible topography and physical support agree, including the
trail, stair landing, bridge columns and lower promenade.

Two defects were corrected. ROC's rail magnet now projects onto sloped rails
using horizontal position, preventing a high ollie from being pulled backward
uphill. The older Warehouse calculation remains unchanged. The mini coping's
visual tube and grind center moved 2 cm onto the deck side of the lip (within its
4.5 cm radius), so automatic exits land on the deck rather than the nearly
vertical transition.

All 15 input-driven geometry checks pass. Both directions were checked on the
mini lips, bowl coping, curved F ledges, H front coping/back rail and both L
quarters. See `screenshots/roc-accuracy/pass2-physics.json` for feature coverage
and grind durations. The 13 route/goal, 5 surroundings and 6 linked-rail checks
also pass. Warehouse routes/feel/reverts, touch and progression regressions pass.

A production-browser controller run charges/releases an ollie, catches E's rail
downhill and banks 130 on landing. Its actual game screenshot and result are in
`screenshots/roc-accuracy/pass2-browser/`. Holding Ollie accelerates the skater;
this route releases earlier than a speed-regulated simulation fixture. The full
pass-1 browser suite also passed level switching, independent saves/reload,
stable resource counts and phone controls.

## Pass 3 — visual accuracy and final verification

All eleven fixed viewpoints were compared again with the feature map, drone
image and completed-park photographs. The mini floor remains unobstructed, the
southern bowl pocket has its broad shallow floor, H is one connected hip, and
the G landing and I promenade are fully supported. Final images are in
`screenshots/roc-accuracy/final/`; the refreshed level-select thumbnail is also
rendered from the corrected game world.

The ROC concrete now blends the shared scan in world space, removing the sharp
projection seams and jagged normal bands on the bowl and transitions. Blue and
yellow ledge paint has broad caps and corner wraps. The E/J rails have the
photographed arched braces, J has a rectangular bar, and I has grounded support
posts. Pale pool coping, its yellow accent, and a small blue ceramic pattern
replace the uniform rim and stretched tiles. The flower is a stronger medium
blue. Beneath the bridge, low pale aggregate replaces the dark gaps and tall
sidewalls; young planting beds and distinct skyline silhouettes refine the
surroundings.

Five trim checks lock the complete rail endpoints and collider geometry to the
verified pass-2 state, check visible grind alignment within 6 mm, and verify
support placement and tile continuity. An independent review confirmed shader
hooks, asynchronous cleanup, and disposal of both desktop and mobile art without
disposing shared Warehouse textures. The final eleven-view capture has no
JavaScript or WebGL errors. The under-bridge view uses 60 draw calls and 64,042
triangles; that is a scene measurement, not a phone frame-rate benchmark.

Final production-browser integration passes all 10 checks, including controller
Start navigation and the downhill E grind/landing, isolated collectible retirement,
independent save/reload, unchanged resource counts through repeated switching,
and touch input at 390×844, 844×390 and 320×568. No JavaScript, network or WebGL
errors were reported. Evidence is in
`screenshots/roc-accuracy/final-integration/`. The final paint review also caught
coplanar side wraps on I; their render-only faces now sit 3 mm outside the
concrete, with a fresh screenshot confirming clean edges. Production build and
whitespace checks pass; Vite retains its existing bundle-size advisory.

## Remaining accuracy limits

The named features, stair counts, relative layout and characteristic finishes
are supported by the supplied map and public photographs. Exact metric
dimensions, radii, slopes, bridge spans and grades remain estimated. The city
silhouette, planting and minor wear are simplified to match the existing game's
visual style and rendering budget. This review covers the supplied Phase 1 park,
not its later expansion. Mobile checks use touch emulation; physical-phone
performance has not been measured.
