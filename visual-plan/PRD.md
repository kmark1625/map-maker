# Floating island — visual PRD (from concept art)

Source: `src/app/assets/images/concept_art/floating_island.jpg`
Generated references (MuseImage, references only — not shipped in scene):
`iterations/floating-island-style/refs/01..03`

## Target read (1 sentence)
A vibrant lime-green diamond plateau on a dark void, ringed by sand, with two
stepped snow-capped grey peaks, bubbly tree clusters, a blue central lake with
stone plaza / bridges / terracotta cottages / a windmill, and a Icy-blue
faceted cliff body with edge waterfalls, moss, cyan crystals, purple
underbelly, hanging roots, floating rocks and sparkle dust.

## Numbers / palette
- Void bg: radial #2b3a4a centre → #0c1118 edge (concept near-black blue-grey)
- Grass top: #8fd16a→ saturated lime #7ed957-ish via vibrant light; forest deep #2f7a3d / mid #4caf50 / highlight #7ed957 (3-tone bubbly spheres)
- Sand rim: #e7d8a8; dirt/plaza stone: #cfc8b8; mountain grey #8a93a3, snow #ffffff
- Water/lake: #35a8e8; waterfall sheet: white→#7fd4ff translucent 0.75
- Cliff bands: icy #6fc3e8 (z0-3), pale strata (z4-6), deep purple #4a3575 (z7-9) — already in code
- Houses: cream walls #f3e5cf, roof terracotta #c65a32 / #d97a4a, timber #7a4a28
- Crystals: cyan #37e0ff emissive; sparkles #aef / white

## Main parts (acceptance checklist)
1. Elevation: northern `stone` cells rise 1–4 cubes to 2 peaks; top layer snow-white. Central 2×2 stone stays flat plaza.
2. Trees: every `forest` cell gets trunk + 2–3 flat-shaded spheres (bubbly), deterministic jitter. Plus small bushes on some grass.
3. Water read: water cubes sunk ~0.18 cube; sand sunk slightly. Lake stays tile-blue.
4. Town: ≥5 cottages (cream box + prism terracotta roof + door) on grass around lake, 1 windmill (tapered cylinder, cone roof, 4 rotating blades), 2 arched bridges over lake inlets (planks + stone posts).
5. Waterfalls: 2 edge falls on the south rim (animated scrolling canvas texture, mist sprites at base) + 2 thin mountain streams.
6. Cliff dressing: moss blobs + hanging vine lines on upper cliff ring, cyan crystal clusters at corners, roots (tapered cones) under keel, soft mist sprites under island.
7. Atmosphere: dark radial void (readonly), warm key + cool fill + violet underglow (existing vibrant), shadows (sun, PCF soft), ACES tone mapping, floating rocks slowly bobbing, sparkle Points.
8. Scope guard: all decoration only in `readonly` (Render step). Editor 3D tab keeps flat editable cubes; picking/elf logic unchanged except elf stays on y=CUBE plane.

## Non-goals this round
Rounded/non-voxel plateau, ink outlines (postprocessing), new shipped textures,
changing grid data / island voxel volume / 2D editor.
