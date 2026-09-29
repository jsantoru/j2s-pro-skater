# ROC City Skatepark — Level 02

This level recreates the **Phase 1 park** shown in the supplied A–L feature map.
The bowl sits west of the street terraces, the Riverway Trail curves around the
western edge, and the southern street promenade continues beneath I-490.
The 2025/2026 expansion is outside this version's scope.

## References and accuracy

- [ROC City Park photographs, drone overview, and renderings](https://roccitypark.org/wp/the-park/): the primary visual reference, including all six April 2021 photographs and the overhead drone image. These establish the concrete finish, blue ledge edges, yellow rails and risers, bowl shape, Rochester flower, and bridge structure.
- [City of Rochester park page and feature map](https://www.cityofrochester.gov/locations/roc-city-skatepark): the A–L feature names and arrangement, matching the user's supplied map.
- [New Line Skateparks project page](https://www.newlineskateparks.com/project/roc-city-skatepark/): designer context and the park's relationship to the bridge.
- [City design workshop, October 3, 2018](https://www.cityofrochester.gov/sites/default/files/migrated/assets-0-78-125-8589934628-8589936481-8589936482-7ad3e1b9-3e8d-439a-ad43-888d3fb82e68.pdf): inspected pages 2 and 25–27 for site context. Its preliminary overall plan differs from the completed Phase 1 park, so it does not override the supplied map or as-built photographs.

The public references inspected do **not** provide a dimensioned, as-built
construction drawing. Distances, heights, radii, and bridge clearances are
estimates chosen from the map's proportions and the photographs. This is a
recognizable, playable game recreation, not a survey-accurate architectural model.
Coordinates use +X east and +Z south; one world unit is approximately one metre.
Source photographs are reference material, not copied game textures.

### Rider-to-park scale

The two supplied photographs with people in the bowl and street section prompted
a horizontal scale pass. ROC City is now **25% wider and longer** than the first
recreation (X/Z ×1.25). This is a visual/gameplay estimate, not a measurement of
the real park. It increases the plan area by 56.25%; it does not increase heights.

The riding Joe model measures approximately 1.75 m including board and cap.
Keeping the same model and feature heights preserves the relationship between
the skater and the 18 cm stair risers, 82 cm stair handrail, 75 cm bridge flatbar,
48 cm manual pad and 2.65 m deepest bowl pocket. Those are **game dimensions**;
the supplied photographs do not establish surveyed dimensions for these features.
The broader footprint provides more room across the bowl, mini and approach decks.

| Game measurement | Previous | Revised |
| --- | ---: | ---: |
| Plan bounding box (not usable floor area) | 34 × 102 m | 42.5 × 127.5 m |
| Mini flat length / width | 3.6 / 5 m | 4.5 / 6.25 m |
| Bridge manual-pad length / width | 8.5 / 2.1 m | 10.625 / 2.625 m |
| Stair riser / manual-pad height | 0.18 / 0.48 m | unchanged |

`ROC_CITY_LAYOUT` remains the authored plan. `RocCityLevel` applies the horizontal
world transform once after building it; its spawn, grind segments, feature
positions and bounds are world coordinates. `ROC_PICKUPS` uses the same transform,
with pickup hover height, size and collection radius unchanged. Surrounding art
inherits the transform. Collision and contact-shadow normals use the inverse
transpose of the world matrix so the wider slopes render and ride consistently.
Game speeds, gravity, ollies, follow-camera framing, warehouse geometry, characters,
save keys and mobile controls retain their existing settings.
The mini's steep transition lips now preserve upward momentum when their ground probe
first touches the flat deck. This prevents the wider mini from snapping the rider
onto the apron instead of airing back in. It retains the existing launch-speed
threshold; the bowl, other ramps, shallow banks and warehouse do not use this additional condition.

Compare the fixed camera views in `screenshots/roc-scale/before` and `after`.
`sim:roc-scale` exercises the actual enlarged level; the older detailed geometry
and trim fixtures explicitly use the authored 1× layout. `qa:roc-scale` captures
the same rider-relative viewpoints before/after and checks the rendered game.

On the revised default scale, real input simulations collect all S-K-A-T-E
letters from spawn in **22.75 seconds with no bails**, collect all five caps in
one **37.07-second run with no bails**, reach the secret tape by skating/ollies,
and bank **38,400 points in 42.78 seconds** on a
street line (9,000 best combo, three recoverable bails). The score line starts on
the plaza. These are deterministic test routes rather than player performance
guarantees; the two-minute run timer and score thresholds are unchanged.

## Feature correspondence

| Map | Implemented feature |
| --- | --- |
| A | North roll-in and southwest entry |
| B | Angled, terrain-connected mini ramp with a clear floor and small extension |
| C | Raised pool deck and flower-marked street deck |
| D | Connected multi-depth bowl, pool tile band, grindable coping |
| E | Seven stairs, central handrail, hubba ledges, adjoining banks |
| F | Curved blue-edged grind ledge on the western pool deck |
| G | Diagonal nine stairs, central handrail, hubbas and banks |
| H | A-frame, kinked rail, ledge and quarter-pipe hip |
| I | Mellow descending bank into the bridge promenade |
| J | Yellow flat rail beneath the bridge |
| K | Blue-edged manual pad / flat ledge |
| L | Terminal quarter pipe with a higher extension |

The bowl is one continuous collision surface with an actual opening in the
surrounding deck. Explicitly linked coping and ledge segments carry grinds through
curves and kinks without restarting the trick or balance meter. The bridge and landscaping use the game's existing stylized
material language. Gameplay uses the same skater, scoring, camera and controls
as the warehouse, including touch controls.

## Career and switching

Each level has its own goal completion, best run, best combo and score table.
Warehouse save keys remain unchanged. ROC saves use
`j2s-pro-skater.roc-city-skatepark.goals.v1` and
`j2s-pro-skater.roc-city-skatepark.highscores.v1`.
Completed collection goals retire their pickups only in that level.
Returning through the home screen or level select keeps earned progress and
clears held skating inputs. Each level is constructed once and detached while
inactive; switching does not retain its lights, collision targets or pickups in
the active scene.

## Verification

The three-pass layout, rideability and visual audit is recorded in
[ROC-CITY-ACCURACY.md](ROC-CITY-ACCURACY.md), including verified details versus
estimated dimensions and before/after camera views.

Pure simulation checks: `sim/roccitytest.js`, `sim/rocgeometrytest.js`,
`sim/rocsupporttest.js`, `sim/roctrimtest.js`, `sim/levelprogresstest.js`,
`sim/levelbailtest.js`, `sim/linkedrailtest.js`, and `sim/rocarttest.js`. Browser integration and rendered evidence:
`sim/roccitycheck.js`, with a production preview URL and an optional output folder.
The existing warehouse, navigation, checklist and mobile checks remain available.
Phone-sized touch emulation verifies layout and input; it is not a physical-phone
performance benchmark.

The original authored-layout route checks collect all S-K-A-T-E letters from spawn in 18.39 seconds
without a bail, reach every cap and the secret tape with skating inputs, and bank
42,250 points in 42.82 seconds on a street line with two recoverable bails and a
9,000-point best combo. The score line begins on the plaza, leaving ample time to
travel there from spawn. These are deterministic simulation runs, not a guarantee
of a particular player's score.
