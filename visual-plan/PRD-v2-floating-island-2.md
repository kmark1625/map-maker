# Floating island v2 — visual PRD (from floating_island_2.webp)

Source: `src/app/assets/images/concept_art/floating_island_2.webp` (MuseImage)
Supersedes the mood of `visual-plan/PRD.md` (v1, dark-void concept) for the
readonly Render step. Grid data, editor, and voxel volume are unchanged.

## What changed vs v1 concept (the diff that drives this iteration)

| Aspect | v1 (`floating_island.jpg`) + current render | v2 (`floating_island_2.webp`) |
|---|---|---|
| Setting | Island floats in a near-black void; full tapering keel + purple underbelly visible; roots, sparkles, floating rocks | Iceberg sits **in a bright blue ocean**; keel submerged; no roots/under-glow |
| Waterline | None — falls pour into void mist | Pale **ice shelf/apron** extends 1–3 tiles past the sand rim at sea level, jagged, moss-flecked; falls spill into the sea with foam |
| Ocean dressing | — | Scattered white-cyan **ice chunks / mini-bergs**, wavy white streak texture on the water |
| Peaks | Grey stepped stone, thin snow caps | **Massive white blocky snow peaks** — stacked white slabs, pale blue-grey shadow sides, ~4–5 cubes tall, overhanging slab edges |
| Camera | Classic iso (54.7° from vertical), island centred on keel | Higher, more top-down (~40° from vertical); plateau fills frame |
| Paths | None | Pale tan **dirt paths** from bridges to houses/plaza across the grass |
| Lake | Flat blue tiles | Same moat/plaza, plus **lily pads + white/pink flowers**; a south **lagoon pond** rests on the ice shelf |
| Light/palette | Dark radial bg `#2b3a4a→#0c1118`, violet underglow | Bright daylight: sky/ocean blues `#7fd0ff / #2f9be8 / #1f7fd0`, white sun, cyan sea bounce |

## Numbers / palette

- Ocean: base `#2f9be8`, deep `#1f7fd0`, wave streaks `#bfeaff`/white; plane at `y = -2.1 * CUBE` (upper cliff + plateau above water, keel below).
- Bg (readonly): radial `#a8dcff` centre → `#3a9be0` mid → `#1f7fd0` edge; light-blue fog for ocean distance blend.
- Ice shelf / chunks: top `#eaf9ff`, side `#bfe6f5`, deep edge `#7fc8e8`; flat-shaded.
- Snow peaks: top `#ffffff`, sides `#cfe3f2` (pale blue-grey), slab overhang 1.12× cube.
- Paths: `#ecd9a0` sandy tan, thin slabs 0.3 cube wide, on grass/sand only.
- Lilies: pad `#57b368`, flower `#ffffff`/`#ffb7d5`.

## Acceptance checklist (readonly diorama only)

1. Ocean plane (procedural wavy canvas texture, slow drift) surrounds the island; bright sky-blue background + daylight rig replace the dark void in readonly.
2. Ice shelf apron ring around the footprint at sea level, jagged deterministic extent, moss blobs + a few crystal clusters; white foam ring/discs where shelf & falls meet water; south lagoon disc with lilies.
3. ≥10 floating ice chunks bobbing on the ocean (replacing void rocks); sparkles become low sea-surface glints; roots and under-mist removed.
4. Peaks rise up to 4 extra cubes, all snow-white with pale sides and per-level overhanging slabs (plaza component stays flat).
5. Dirt paths: from each bridge along its axis and L-routes from each cottage/windmill toward the plaza, grass/sand cells only.
6. Lily pads + flowers on a deterministic subset of water cells.
7. Waterfalls shorten to end at sea level with foam/mist at the ocean surface.
8. Fit camera: more top-down polar (~0.72 rad), target centred between peak tops and sea level, frame includes shelf.
9. Scope guard: editor (non-readonly) ThreeCanvas, 2D editor, grid store, island voxel data, elf behaviour unchanged.

## Non-goals this round

Ink/cartoon outlines (postprocessing), non-voxel rounded plateau, new shipped
texture files (ocean/waves are procedural canvas), changing the map layout.
