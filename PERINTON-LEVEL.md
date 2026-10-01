# Perinton Skatepark: implementation and validation

Perinton is Level 03, reconstructed from completed-park photographs rather than the earlier master-plan rendering. [PERINTON-REFERENCES.md](PERINTON-REFERENCES.md) records the sources, directly observed features, and confidence limits. The reference photographs are research material, not shipped game textures.

## Layout and implementation

The coordinate frame follows the Town’s Grand Opening 33 aerial: +X is image-right and +Z points toward the entrance. It does not establish geographic north. The approximately 44 × 40 m outer envelope includes turf and gaps. Modeled plaza, bowl/deck, and pump surface footprints total about 1,268 m² before connector overlaps, a useful scale check against the published 1,254 m² / 13,500 ft² skating area.

The level uses unscaled metre coordinates. ROC City’s previous 1.25 horizontal enlargement is **not** applied, and player dimensions and physics tuning are unchanged.

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

## Gameplay and validation

Perinton supports the existing two characters, keyboard/controller/touch input, trick system, two-minute goal runs, and untimed Free Skate. Its seven goals are scores of 5,000 / 15,000 / 35,000, a 5,000-point combo, SKATE, five bottle caps, and the secret tape. Careers and score tables use separate level-specific save keys. Completed goals retire from subsequent runs; the confirmation-based goal reset restores only that level’s completion flags while retaining records and other careers.

[sim/perintontest.js](sim/perintontest.js) passes **14/14** checks using the real 120 Hz controller. Coverage includes surface validity, pickup support, both pump directions, bowl/quarter airs, flatbar dismounts, and both directions of the linked A-frame grind. Measured routes, each without a bail:

| Route | Elapsed | Result |
| --- | ---: | --- |
| SKATE | 16.61 s | All five letters |
| Bottle caps | 18.62 s | All five, including the bowl |
| Secret tape | 3.38 s | Street-bank approach to the raised spine |
| Linked bowl grind/flip line | 48.93 s | 44,910 points; 44,910 best combo |

Fixtures choose starting lines and issue actual movement/trick inputs; they do not inject score or attach the rider directly to rails. Scenery ownership tests pass 17/17, including rebuild/disposal and unchanged gameplay data. A separate shader check verifies material restoration, idempotent disposal, and retention of the borrowed Warehouse scan.

## Limits

Exact feature radii, depths, roller counts, grades, and scenic placements remain photo-based estimates. Automated routes prove attainability, not difficulty for every player. Touch validation uses browser emulation rather than physical-device testing; no universal frame-rate claim is made.
