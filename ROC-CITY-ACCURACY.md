# ROC City accuracy review

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
| Seven and nine stair sets with handrails, hubbas and banks | Map E/G, photos 02/04/05 | Verified counts and arrangement; tread/riser dimensions estimated |
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
