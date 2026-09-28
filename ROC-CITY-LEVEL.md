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

The physical route checks collect all S-K-A-T-E letters from spawn in 18.39 seconds
without a bail, reach every cap and the secret tape with skating inputs, and bank
42,250 points in 42.82 seconds on a street line with two recoverable bails and a
9,000-point best combo. The score line begins on the plaza, leaving ample time to
travel there from spawn. These are deterministic simulation runs, not a guarantee
of a particular player's score.
