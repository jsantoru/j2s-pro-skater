# Genesee bottle-cap label atlas

`genesee-label-atlas.webp` is a generated, flat label-art atlas for the five
warehouse bottle-cap pickups. It was created with the built-in ImageGen tool on
2026-09-27 from five reference photographs supplied by the user. No source
photographs, photographer signatures, seller stickers, or photo backgrounds are
included in the asset.

The references show, in order:

1. Genesee Beer: worn silver face, red oval lettering, red painted skirt.
2. 12 Horse Genesee Ale: gold metal and lettering, teal oval field.
3. Genesee Cream Ale: green enamel, yellow oval and lettering, twist-cap arrow.
4. Genny Light: blue enamel, italic silver lettering and thin silver border.
5. Genesee Light Ale: black face, cream lettering, orange waiter-and-globe badge,
   aged silver-gray skirt.

The generated atlas is **1536 × 1024**, RGB, in a **3 × 2** grid of 512px cells.
Its first five cells correspond to the references above. The sixth cell is a
plain cork underside. The selected output was encoded to WebP at quality
90 with Sharp; pixel dimensions and composition were preserved. Final size:
665,694 bytes (about 650 KiB). This is a new raster interpretation of the supplied
references, not a scan or extraction of their lettering.

`src/bottlecap-labels.js` validates the decoded dimensions and samples the first
five cells into individual 512px CanvasTextures. The source rectangles, measured
from the atlas's upper-left corner, are:

| Face | x | y | width | height |
| --- | ---: | ---: | ---: | ---: |
| Genesee Beer | 32 | 32 | 448 | 448 |
| 12 Horse Ale | 544 | 32 | 448 | 448 |
| Cream Ale | 1056 | 32 | 448 | 448 |
| Genny Light | 24 | 536 | 464 | 464 |
| Light Ale | 536 | 536 | 464 | 464 |
| Cork liner | 1088 | 576 | 384 | 384 |

The slightly wider blue and black samples preserve their outer silver border and
cream lettering. The cork center is sampled into separately owned 256px liner
textures, excluding the disc's edge outline. Runtime extraction prevents adjacent atlas cells from bleeding
into mipmaps. The maps use ordinary 0–1 front-face UVs, `flipY=true`, and sRGB
color space. Use a white material tint: the artwork already contains the face
colors. The mesh supplies the physical dome, fluted skirt, depth, and lighting
response. Subtle worn ink and edge patina are part of the artwork.

The module loads one shared image; each caller owns and must dispose the returned
map. Maps are usable immediately with a simple colored/lettered fallback and
update in place when their `ready` promise resolves. Failed loads resolve to the
fallback. Environments without a document return null maps. No roughness map is
used; the five cap materials use their individual roughness values.

## Final ImageGen prompt

Use case: product-mockup. Asset type: one production-ready FLAT ALBEDO TEXTURE
ATLAS for a 3D game's vintage Genesee bottle cap collection. Create one 1536x1024
landscape image with a mathematically regular THREE COLUMN by TWO ROW atlas.
Each cell is exactly square, occupies 1/3 image width and 1/2 image height, with
NO gutters or padding between cells. Recreate the printed TOP FACE ART ONLY from
the five reference photographs, preserving their actual branding, lettering,
colors and character illustration. References 1–5 supply artwork and worn-print
character only, not their perspective, lighting, cap geometry or photo
backgrounds. Each cell has a centered perfectly round flat disc, diameter 92% of
its square cell, photographed in exact straight-on orthographic alignment,
lettering horizontal/upright. Circle centers must be exactly (1/6,1/4), (1/2,1/4),
(5/6,1/4), (1/6,3/4), (1/2,3/4), (5/6,3/4) of the complete image. Outside each
disc, fill that entire cell with the SAME base substrate color as that face so
edges have no black/white halo. These are unlit diffuse color textures: preserve
fine age scratches, flecks of worn ink and subtle metal grain, but absolutely no
directional highlights, light/shadow gradients, 3D beveling, ridged cap edges, cast
shadows, camera blur, glossy reflections or perspective. Keep text bold, high
contrast and legible at small size. The face discs are all the same physical size.

TOP LEFT: reference1 Genesee Beer. Worn pale silver-metal substrate with slight
warm olive tint. Large red thin horizontally stretched oval enclosing bold
uppercase exact text 'GENESEE' and smaller red flowing handwritten exact text
'Beer' below it. Small registered mark. Reference's pleasing aged scratches, but
no red crimped cap skirt.

TOP MIDDLE: reference2 12 Horse Genesee Ale. Warm antique gold substrate, a deep
teal-green broad oval with double gold outline. Three centered lines of gold
exact text '12 Horse', 'GENESEE', 'Ale'. GENESEE is large heavy condensed
uppercase, Ale larger mixed-case beneath. Maintain ample readable spacing.

TOP RIGHT: reference3 Cream Ale. Emerald-green enamel substrate. Small curved
yellow exact text 'TWIST CAP' along the upper arc with a simple curved
left-pointing yellow arrow. Wide yellow oval band containing green bold
uppercase exact text 'GENESEE'. Lower pale-yellow condensed exact text 'CREAM
ALE'. No photographer signature.

BOTTOM LEFT: reference4 Genny Light. Royal ultramarine-blue enamel with thin
silver-white circular border. Silver-white bold italic exact text 'GENNY' on the
upper line, smaller exact text 'LIGHT' below. Subtle worn scratches only, strong
clean legibility.

BOTTOM MIDDLE: reference5 Genesee Light Ale. Black substrate with pale cream
uppercase exact text 'GENESEE' along upper arc and 'LIGHT ALE' along lower arc.
Large centered orange circle with thin cream rim containing the vintage
black-and-cream illustration of the standing waiter carrying a tray of beer
glasses, one bent leg, over a lined globe. Small cream vertical dashes at left and
right. Clearly reproduce the reference's visual identity and lightly distressed
ink. No seller sticker or red inventory dot.

BOTTOM RIGHT: one plain warm tan cork underside disc with subtle fine cork grain,
no text and no logos. Match the circular layout of the other cells.

Critical: ONE regular 3x2 texture atlas, exact cell alignment, no labels/headings
between cells, no extra words, no watermarks, no invented branding, no decorative
backdrop, no cap geometry. This is a flat source texture sheet, never a mockup
showing physical 3D bottle caps.
