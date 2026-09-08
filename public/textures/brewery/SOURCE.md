# Ruby Red Kölsch captain artwork

- Asset: `ruby-red-captain.png` (1254 × 1254, opaque PNG).
- Reference: the Genesee Ruby Red Kolsch package image supplied by the user in this task. The sailor illustration and Genesee product identity originate from that packaging.
- Created with the built-in image-generation tool, in reference-image edit mode. This is a reference-based recreation, not an official original production asset or a pixel-exact extraction.
- The first edit preserved the mascot while removing packaging typography. Its requested transparency was rendered as a checkerboard; a second edit replaced that with a yellow field. Only the second result is used in the game.
- Game lettering, border, fasteners and patina are composed by `src/captain-mural.js`. The original generated files remain in the Codex generated-images directory.

## First edit prompt

Use case: background-extraction / identity-preserve.
Asset type: transparent RGBA illustration for a brewery warehouse wall mural in a 3D skating game.
Input image: edit target and identity reference. Extract and carefully restore ONLY the illustrated sailor/captain in the lower-left corner of the provided Genesee Ruby Red Kolsch package.
Preserve this specific character's appearance and pose: white captain's cap with navy anchor emblem and thin red hat band, jovial eyes, curled white mustache and long striped white beard, red pipe pointing left with a thin curl of smoke, white naval coat outlined in navy, yellow buttons and small red/navy chest badge, grapefruit in his lowered left hand, right hand holding a round tray carrying the yellow beer glasses and their carrier handle. Keep the same crisp flat vintage packaging illustration, bold navy contours and white/yellow/ruby-red palette.
Remove ALL packaging backgrounds, lettering, oval brand badges, labels, decorative grain stalks and other graphics. Restore the small part of his left hand/grapefruit/left sleeve that is cropped by the package edge. Show the complete waist-up captain and tray, with a clean waist-length lower edge; do not invent legs. Center the illustration on a square canvas with modest transparent margins, occupying most of the canvas. Keep all fingertips, tray, pipe smoke and cap inside the frame. Genuine transparent background with alpha, no checkerboard painted into the image. No drop shadow, no background wall, no generated lettering, no photorealism. Clean original ink artwork; weathering will be applied by the game material.

## Background correction prompt

Edit this captain illustration. Change ONLY the checkerboard background: replace every gray checkerboard area outside the illustrated captain, tray, pipe and smoke with a perfectly flat uniform warm golden-yellow background (#eacb58), like the yellow field on the Ruby Red Kolsch package. This should be an opaque image, NOT a transparent image. Keep all the existing captain's shapes, outline, face, hat, beard, pipe, grapefruit, tray, glass carrier and clothing exactly as they are. Preserve the same square framing and the entire character. Do not add any text, border, wall texture, shadows or objects. No checkerboard or transparency grid should remain anywhere. Crisp vintage brewery illustration on solid yellow.
