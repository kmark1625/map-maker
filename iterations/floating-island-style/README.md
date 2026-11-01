# Floating island style — iteration log

Goal: bring the 3D render (`/render`, `ThreeCanvas readonly`) closer to
`src/app/assets/images/concept_art/floating_island.jpg`.

## refs/ (MuseImage generations — references only, do not ship)
| File | What | Prompt gist |
|---|---|---|
| 00_concept_floating_island.jpg | Original concept art (copy) | — |
| 01_museimage_cliff_waterfall_crystals.jpg | Cliff/waterfall/crystal/root detail | Icy faceted cliff, moss, waterfall+mist, cyan crystals, purple strata, roots, floating rocks |
| 02_museimage_plateau_target.jpg | Plateau 3D target | 2 snow peaks + streams, lime grass, bubbly trees, lake+plaza+bridges, cottages, windmill, sand rim, low-poly |
| 03_museimage_town_house_windmill_bridge.png | Town structures | Cottage (cream/terracotta), windmill (tapered/cone roof/blades), arched plank bridge with stone posts |

Also copied to `visual-plan/refs/` + plan in `visual-plan/PRD.md`.
Town structures are built as procedural Three.js geometry (from ref 03) rather
than pasted sprites, so they read correctly from every orbit angle.

## renders/
| File | Iteration |
|---|---|
| 00_baseline_before.png | Before this change |
| 01_…png | After diorama build (to fill) |
| 02_…png | After fix round (to fill) |

## Notes
- Generated originals from the image tool land in `generated_images/`; copies
  above are the tracked, named versions.
