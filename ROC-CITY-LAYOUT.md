# ROC City layout correction

This follow-up supersedes the earlier review's claim that the nine-stair
arrangement was verified. The baseline is `cf2d41f` (the 1.25 horizontal-scale
revision). The scale increase did not fix the placement or orientation error.

## Reference comparison

The supplied A–L map and close-up establish G beside the shallow bowl tail and
at the southern end of the bowl/street divider. The old model placed it almost
directly south of that tail, too far west, with its run following the divider
instead of crossing it. Its generic stair builder also added two broad banks,
which made this compact stair set look like a large ramp aimed at the trail.

The [official park reference page](https://roccitypark.org/wp/the-park/) contains
the opening-night drone image and photographs 01–06. The drone provides the
clearest evidence of the stair's direction across the divider. Photograph 04
shows the yellow risers, central handrail, broad hubbas, and landscaped outer
flank. The blue bicycle hoop behind the upper landing matches the southwest
entrance landmark in the drone image: the upper approach connects to the bowl
terrace and the stairs descend toward the street area.

The supplied rendering is oblique, not a surveyed plan. We use relative
placement, feature connections, and photographed landmarks to establish the
layout; individual pixels do not establish exact metres or a precise bearing.

## Corrections and scope

- Turn G across the central divider, with its upper approach on the west bowl
  terrace and lower landing on the east street plaza.
- Move G east of the shallow bowl tail and connect the raised deck and bank to
  its revised opening rather than leaving a detached staircase.
- Remove the unsupported pair of wide banks beside G. Retain the nine risers,
  central handrail, and two grindable hubbas.
- Rotate B in place so that its opposing transitions run northwest/southeast
  and its raised extension faces the flower deck. Update the deck cutout and
  adjoining surface together so neither covers the mini's flat bottom.
- Keep the already revised 1.25 horizontal scale and original feature heights.
- Move S slightly north onto the entry deck, preserving its ID and collection
  goal, because its old position fell inside the rotated mini opening.

B's general position is consistent with the references: southwest of the north
entrance and northwest of the flower deck. Its coping lines in the drone image,
and the extension facing the flower in photograph 01, support correcting its
orientation rather than translating its center. Its exact angle and cross-section
remain an interpretation of the photographed terrain-connected transition.

## Evidence and limits

`screenshots/roc-layout/before` records the original game views. The orthographic
plan uses the loaded game's geometry and actual A–L anchors, with north upward.
Its explicit scenery cutaway hides the bridge roof so that J–L can be inspected;
it is a diagnostic view, not an ordinary gameplay camera.

Fresh views are in `screenshots/roc-layout/after`. The final visual check also
closed the exposed undersides of G's hubbas and seated B's extension on the
sloping deck. The mini's flower-side flat apron is 0.6 authored metres wide so
normal transition airs return cleanly before the connector starts descending.

## Verification

- `npm run sim:roccity`: 86 checks passed, including 12 new layout checks at
  both 1× and 1.25×. These verify every G tread against visible/collision
  geometry, the upper approach and lower runout, solid sidewalls, extension
  support, real grind capture/landing, and connector crossings in both directions.
- Repeated mini passes use its unobstructed lane; separate cases deliberately
  capture the extension and both mini lips. No skating-physics changes were
  needed for this layout correction.
- Production browser integration: 10/10 checks passed for navigation, actual
  controller skating, collectible retirement, independent saves/reload, bounded
  resources, and touch controls at 390×844, 844×390 and 320×568.
- Scale integration: 5/5 checks passed, including physical dimensions, slope
  shadows, touch ollie/landing, and a pixel-identical Warehouse comparison.
- Layout browser check: actual controller buttons ollie onto the relocated G
  rail and bank a 150-point grind on landing. The second check verifies the
  north-up orthographic projection and all A–L feature anchors.
- All 12 reference viewpoints rendered without JavaScript or WebGL errors.
  The level-selection thumbnail was refreshed from the corrected game world.

At the production scale, deterministic input routes collect SKATE from spawn in
22.05 seconds and all five caps in 33.50 seconds, with no bails. Source images
were inspected as references, not added as game textures. Detailed simulation
results and browser reports accompany the screenshots.

Feature relationships, stair count, and the direction across the divider are
supported by the references. Dimensions, precise angle, concrete edges, and
transition profiles remain game estimates. The recreation covers the supplied
Phase 1 park. The earlier review documents historical checks, not proof of
survey accuracy.
