# Map Maker

A browser-based 2.5D isometric map editor. Paint a floating island on a
grid, then view it in 3D with an elf character wandering the terrain.
Built with **Next.js + React + Zustand + Tailwind CSS + Three.js**, and
exported as a static site (deployed to GitHub Pages).

## How it works

The app walks through three steps:

1. **Character select** (`/select`) — pick an Elf Archer variant: fire,
   ice, or lightning. The choice persists across visits.
2. **Editor** (`/editor`) — paint the island on an isometric grid
   (4×4 up to 20×20). Terrains are Grass, Water, Sand, Stone, and Forest,
   with Select / Pan / Paint tools (shortcuts `V` / `H` / `P`).
3. **Render** (`/render`) — the same map in a Three.js 3D view, with your
   elf free to wander it. Each elf also has an elemental ability that
   re-skins every tile: Flame (fire), Freeze (ice), or Zap (lightning).

### Suggest a layout

The editor's **Suggest** button generates a complete island in one of
three moods — Serene lagoon, Rugged peaks, or Wild forest. By default it
uses a built-in procedural generator. Loading the optional
**Cartographer** instead runs a small LLM (Qwen2.5 0.5B via WebLLM)
entirely in your browser on WebGPU to design the layout — no server or
API key involved. Once loaded, it pre-designs one layout in the
background (with up to 30 seconds to finish) so Suggest usually
applies instantly; resizing the grid discards that pre-designed
layout and pre-designs at the new size. A Suggest click waits at
most 10 seconds for the LLM before falling back to the procedural
generator and saying so; a background pre-design may keep running
for its full 30-second budget even when a click has fallen back.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
The in-browser LLM needs a WebGPU-capable browser (current Chrome/Edge);
without WebGPU, Suggest still works via the procedural generator.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — build the static site into `out/`
- `npm run start` — run the production build
- `npm run lint` — run ESLint
- `npm test` — run the verification tests in `scripts/`
- `npm run deploy` — build and publish `out/` to GitHub Pages

## Structure

- `src/app/` — Next.js App Router pages (`/`, `/select`, `/editor`,
  `/render`, `/assets`) and artwork under `assets/images/`
- `src/components/` — React components: the isometric editor canvas
  (`IsoCanvas`), the 3D view (`ThreeCanvas`), toolbars, and panels
- `src/stores/` — Zustand stores for the grid, character, and Suggest state
- `src/lib/` — isometric math, island generation, tile themes, and the
  WebLLM designer (runs in a Web Worker, loaded on demand)
- `src/data/` — character variants and sample island data
- `scripts/` — Node test files covering the editor, island generation,
  sprites, tile themes, and the Suggest feature
- `public/assets/` — drop-in folder for images; everything here is served
  at `/assets/<filename>` and shown on the `/assets` gallery page
