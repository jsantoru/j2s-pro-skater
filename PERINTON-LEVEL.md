# Perinton Skatepark: implementation and validation

Perinton is Level 03, reconstructed from completed-park photographs rather than the earlier master-plan rendering. [PERINTON-REFERENCES.md](PERINTON-REFERENCES.md) records the sources, directly observed features, and confidence limits. The reference photographs are research material, not shipped game textures.

## Layout and implementation

The coordinate frame follows the Town’s Grand Opening 33 aerial: +X is image-right and +Z points toward the entrance. It does not establish geographic north. The approximately 44 × 40 m outer envelope includes turf and gaps. The published 1,254 m² / 13,500 ft² skating area provides an overall plausibility check, but cannot validate individual feature dimensions or distinguish pavement from modeled connector overlaps.

The level uses unscaled metre coordinates. ROC City’s previous 1.25 horizontal enlargement is **not** applied throughout Perinton. A later photo audit extended only the bowl/deck long axis by 20%, preserving the character, quarter heights, bowl depths and physical transition runs. Player dimensions and physics tuning are unchanged.

[perinton-layout.js](src/perinton-layout.js) supplies the shared plan and eleven pickups. [perinton-level.js](src/perinton-level.js) builds visible riding surfaces and matching colliders:

- An open, approximately 79 m pump ribbon with two plaza connections, a western S-return, eleven modeled roller crests, and raised outer berms. It is not a closed oval.
- A connected two-pocket bowl, estimated at 1.80 m and 1.25 m deep, with pinched rims, a sloping connecting floor, and continuous linked coping. The opening contains no hidden ground plane.
- A 1.20 m inverted-C transition, rounded inside corners, an open western side, and an outer quarter facing the plaza.
- A 0.68 m street platform and four 0.17 m risers. The two-flat-two topology and long middle landing are photographically established; these dimensions are estimates.
- A connected bank/A-frame, kinked grinds, flatbar, manual pad, entry ledges, opposing quarter walls, and two taller eastern extensions.

The base park has 31 collider meshes and 255 rail segments, before scenery fixtures. Parking cars, picnic tables, shade posts, and lights register shared physical fixtures before scenery is created. Decorative quality settings do not change gameplay geometry.

## Review passes

**Baseline / pass one:** Fixed aerial and ground views exposed distant grass appearing through the slab, triangle-shaped bowl color boundaries, and an incomplete peaked bank. Ground references also resolved the initially ambiguous stair count as four risers, not three.

**Pass two:** The main slab gained a true central-transition cutout; its depth offset was removed. Scenery now subtracts the union of paved footprints from the lawn, avoiding overlapping grass beneath concrete. Bowl colors blend continuously, the connected A-frame and linked rails were added, and the repeated views confirmed the corrected relationships. The complete pass-two browser suite passed 10/10 checks.

**Final polish:** The central curved lip’s narrow gray/tan boundary moved to per-fragment shading to remove white grid-shaped teeth. The street hubba sides became gray concrete, and scan contrast was refined. Final review also closed the turf’s 2.5 cm exposed edge so grazing cameras cannot see sky between turf and lawn. Riding surfaces and grind contacts remain unchanged. The final review-capture suite passed 5/5 with no browser errors; goal-reset checks passed 9/9, alongside the complete pass-two browser suite’s 10/10.

Selected final views: [aerial](screenshots/perinton/final/aerial-photo33.png), [central transition](screenshots/perinton/final/central-transition.png), [stairs and bank](screenshots/perinton/final/stairs-and-bank.png), [bowl](screenshots/perinton/final/bowl-overview.png).

**Scale follow-up:** Matching world-camera views and actual mesh measurements confirmed the first bowl was too compressed along its long axis relative to the aerial. The revised opening is approximately **14.20 × 8.21 m**, versus **11.84 × 8.19 m**; its plan area grows from **76.96 to 92.37 m²**. Only X control coordinates change; the tiny Z difference comes from resampling the curved outline. Depths remain 1.80/1.25 m. The deck, hidden support hole, turf cutout, coping and bowl collectible follow the revised plan. The eastern plaza is clipped against the deck to prevent coplanar overlap; at least 0.64 m separates the deck from the pump ribbon.

The audit also exposed a coarse rim-facet problem on natural airs. A contour-following strip now resolves the near-vertical part of the same analytic transition and shares vertices with the interior mesh. It uses 9,758 bowl triangles, leaves physics settings unchanged, and passes nine nearby shallow approaches that land **inside** the bowl and settle there. Mere landings on the exterior deck do not pass. [sim/perintonscalecheck.js](sim/perintonscalecheck.js) records rider-relative views at identical camera offsets/FOV and a separate fixed-world-camera comparison; Joe's rendered height including board/cap stays approximately 1.756 m in both parks.

Current comparison: [before](screenshots/perinton-scale/before/perinton-rim-fixed-camera.png), [after](screenshots/perinton-scale/after/perinton-rim-fixed-camera.png), [scale report](screenshots/perinton-scale/after/report.json).

Final scale captures pass 3/3 checks; repeated aerial/ground, paced bowl/pump and touch-menu review passes 5/5 with no browser errors. The updated menu thumbnail is rendered from the revised park. These browser runs use the production bundle, isolated saves and emulated inputs; they do not establish physical-device frame rates.

## Gameplay and validation

Perinton supports the existing two characters, keyboard/controller/touch input, trick system, two-minute goal runs, and untimed Free Skate. Its seven goals are scores of 5,000 / 15,000 / 35,000, a 5,000-point combo, SKATE, five bottle caps, and the secret tape. Careers and score tables use separate level-specific save keys. Completed goals retire from subsequent runs; the confirmation-based goal reset restores only that level’s completion flags while retaining records and other careers.

[sim/perintontest.js](sim/perintontest.js) passes **16/16** checks using the real 120 Hz controller. Coverage includes surface validity, pickup support, both pump directions, bowl/quarter airs, flatbar dismounts, both directions of the linked A-frame grind, and the widened bowl's seams and return matrix. Current measured routes, each without a bail:

| Route | Elapsed | Result |
| --- | ---: | --- |
| SKATE | 16.47 s | All five letters |
| Bottle caps | 18.57 s | All five, including the bowl |
| Secret tape | 3.38 s | Street-bank approach to the raised spine |
| Linked bowl grind/flip line | 48.92 s | 46,620 points; 46,620 best combo |

Fixtures choose starting lines and issue actual movement/trick inputs; they do not inject score or attach the rider directly to rails. Scenery ownership tests pass 17/17, including rebuild/disposal and unchanged gameplay data. A separate shader check verifies material restoration, idempotent disposal, and retention of the borrowed Warehouse scan.

## Limits

Exact feature radii, depths, roller counts, grades, and scenic placements remain photo-based estimates. Automated routes prove attainability, not difficulty for every player. Touch validation uses browser emulation rather than physical-device testing; no universal frame-rate claim is made.
