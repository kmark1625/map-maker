# Floating island 2 — style iteration log

Goal: bring the 3D render (`/render`, `ThreeCanvas readonly`) closer to
`src/app/assets/images/concept_art/floating_island_2.webp` (MuseImage):
an iceberg-style island in a bright ocean, replacing the v1 dark-void read.
Plan: `visual-plan/PRD-v2-floating-island-2.md`.

## refs/
| File | What |
|---|---|
| 00_concept_floating_island_2.webp | Target concept (copy of the source asset) |

## renders/
| File | Iteration |
|---|---|
| 00_before_v1_vibrant.png | Before: v1 dark-void floating island |
| 01_after_v2_default.png | First v2 pass: ocean/shelf in, peaks still flat, ocean edge + shelf gaps visible |
| 02_after_v2_fix1.png | Fix round: peaks restored (plaza-test bug), calmer waves, tighter fit |
| 03_after_v2_final.png | Final: ocean fills frame, solid shelf apron |

## What changed (all in `src/components/ThreeCanvas.tsx`, readonly only)
- Ocean at `SEA_Y = -2.1 * CUBE`: procedural wavy canvas texture, slow drift;
  bright sky-blue radial backdrop; violet underglow -> cyan sea bounce.
  The voxel keel is now the submerged iceberg (deep band flat `#2a6a9e`;
  `deep_underbelly_rock.webp` no longer applied to it).
- Ice shelf apron (solid 2-ring + broken outer ring) with moss, foam discs,
  and a south lagoon pond with lily pads; 12+ bobbing ice chunks replace the
  void rocks; sparkles became sea-surface glints; roots/under-mist removed.
- Snow peaks: fixed a v1 bug where any water-adjacent stone component was
  treated as the flat plaza (northern clusters touch the lake inlet), so no
  peaks ever built. Peaks now rise 4 extra cubes, all snow-white with pale
  blue-grey sides and per-level overhanging slabs.
- Dirt paths from bridges and L-routes from buildings to the plaza; lily
  pads + flowers on lake water; waterfalls shortened to end at sea level
  with foam; fit camera more top-down (polar 0.72) framing plateau + shelf.

## Remaining gaps vs concept
- Plateau/shelf are still square voxel grids (concept has a rounded,
  organic diamond outline and a continuous ice rim).
- Ocean waves are texture streaks; no ink outlines (postprocessing non-goal).
- Editor (non-readonly) 3D, 2D editor, grid data, and voxel volume untouched.
