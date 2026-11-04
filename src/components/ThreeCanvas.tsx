"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  TERRAINS,
  TERRAIN_MAP,
  TOOLS,
  terrainAt,
  useGridStore,
  type TerrainId,
  type TileThemeId,
} from "@/stores/grid-store";
import { TILE_H, type CellCoord } from "@/lib/iso";
import { TILE_TEXTURE_URLS, tileAbilityFor } from "@/lib/tile-themes";
import sideTile from "@/app/assets/images/side_tiles/side_icy_mountain.webp";
import cliffLipTile from "@/app/assets/images/side_tiles/cliff_with_grass_lip.webp";
import bareRockTile from "@/app/assets/images/side_tiles/bare_cliff_rock.webp";
import underbellyTile from "@/app/assets/images/side_tiles/deep_underbelly_rock.webp";
import {
  ISLAND_H,
  generateIslandVolume,
  isIslandSolid,
} from "@/data/floating-island";
import {
  ELF_FRAMES,
  ELF_FRAME_MS,
  elfFrameLayout,
  elfFrameUV,
  elfSheetUrls,
  elfSpriteVariant,
  type ElfDirectionId,
  type ElfSpriteVariant,
} from "@/lib/elf-sprite";
import type { ToolId } from "@/stores/grid-store";
import { useCharacterStore } from "@/stores/character-store";

const CUBE = TILE_H; // full h x h x h cubes
const BG = "#292524"; // stone-800, matches the 2D canvas
const GROUND = "#1c1917"; // stone-900
const CLICK_SLOP_PX = 6;
const RENDER_ELEVATION_DEG = 20; // readonly camera angle above the ground plane
// Wandering elf sketch on the rendered map: random-walk the grid with a
// walk-cycle billboard, camera-relative 8-direction facing, and fading
// element-tinted trail decals on visited tiles.
const ELF_STEP_MS = 550; // per tile; diagonal steps take ~1.4x
const ELF_IDLE_MIN_MS = 250;
const ELF_IDLE_MAX_MS = 800;
const ELF_SHADOW_R = 15;
const TRAIL_R = 22;
const TRAIL_OPACITY = 0.55;
const TRAIL_MS = 2600;
const TRAIL_MAX = 48;
const ELEMENT_TRAIL: Record<string, string> = {
  fire: "#fb923c",
  ice: "#7dd3fc",
  lightning: "#facc15",
};
const FACING_ORDER = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"] as const;

// Surface cubes wear the grass-lipped cliff on their sides. The island
// column below bands by depth: bare blue rock up top, icy strata mid,
// dark underbelly at the keel.
const SURFACE_SIDE_URL = cliffLipTile.src;
const ROCK_SIDE_URL = bareRockTile.src;
const ICE_SIDE_URL = sideTile.src;
const UNDERBELLY_SIDE_URL = underbellyTile.src;
// z = 0 is the cap under the terrain, increasing downward (ISLAND_H = 10).
// Bands follow floating_island_2.webp: icy blue cliffs above the waterline,
// pale ice strata at the sea, deep underbelly rock below (seen only when
// orbiting under the ocean plane).
// Sea level for the iceberg-in-ocean read: plateau + upper cliff stay dry,
// the tapering keel sits below the water.
const SEA_Y = -CUBE * 2.1;
const ROCK_MAX_Z = 3;
const ICE_MAX_Z = 6;
function islandSideBand(z: number): number {
  if (z <= ROCK_MAX_Z) return 0;
  if (z <= ICE_MAX_Z) return 1;
  return 2;
}

const TOOL_CURSORS: Record<ToolId, string> = {
  select: "cursor-default",
  pan: "cursor-grab",
  paint: "cursor-crosshair",
};

function cellCenter(cell: CellCoord, n: number): THREE.Vector3 {
  return new THREE.Vector3(
    (cell.x - (n - 1) / 2) * CUBE,
    CUBE / 2,
    (cell.y - (n - 1) / 2) * CUBE,
  );
}

type LightingPreset = "classic" | "vibrant";

interface ViewApi {
  rebuild: (n: number) => void;
  recolor: (cells: Record<string, TerrainId>) => void;
  refreshOverlays: () => void;
  fit: () => void;
  setWander: (on: boolean) => void;
  setLighting: (preset: LightingPreset) => void;
  setVariant: (selectedId: string) => void;
  setTileTheme: (theme: TileThemeId) => void;
}

export default function ThreeCanvas({
  readonly = false,
}: {
  readonly?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ViewApi | null>(null);
  const [wander, setWanderState] = useState(readonly);

  const tool = useGridStore((s) => s.tool);
  const n = useGridStore((s) => s.n);
  const cells = useGridStore((s) => s.cells);
  const selected = useGridStore((s) => s.selected);
  const hover = useGridStore((s) => s.hover);
  const fitSignal = useGridStore((s) => s.fitSignal);
  const tileTheme = useGridStore((s) => s.tileTheme);
  const setTileTheme = useGridStore((s) => s.setTileTheme);
  const selectedId = useCharacterStore((s) => s.selectedId);

  // Mount once: renderer, scene, camera, controls, lights, loop.
  // Grid contents are (re)built by the effects below from the shared store,
  // so this tab always shows the same saved tiles as the 2D tab.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (readonly) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
    }
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    // Fixed isometric camera: no orbiting or zooming; Fit restores the view.
    controls.enableRotate = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = readonly ? Math.PI * 0.8 : Math.PI * 0.495;

    // Lighting is fixed to "classic" (the original flat white rig below).
    // The "vibrant" preset in setLighting (warm key + cool fill + sea
    // under-bounce, matching the 2.5D render) is kept dormant with no
    // toggle UI, so the toggle can return later by re-adding state + buttons.
    let sunDist = 1600;
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8478, 0.65);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.45);
    sun.position.set(0.8, 1.5, 1).normalize().multiplyScalar(sunDist);
    if (readonly) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 1.6;
    }
    scene.add(sun);
    scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0x9ecfff, 0);
    fill.position.set(-1, 0.5, -0.8);
    scene.add(fill);
    const underglow = new THREE.DirectionalLight(0x35b6e8, 0); // sea bounce in vibrant
    underglow.position.set(0.2, -1, 0.3);
    scene.add(underglow);
    const setLighting = (preset: LightingPreset) => {
      if (preset === "vibrant") {
        hemi.color.set(0xbfe3ff);
        hemi.groundColor.set(0x9a8f7a);
        hemi.intensity = 0.9;
        sun.color.set(0xffe3b3);
        sun.intensity = 1.4;
        sun.position.set(1.0, 1.1, 0.7).normalize().multiplyScalar(sunDist);
        fill.intensity = 0.5;
        underglow.intensity = 0.45;
      } else {
        hemi.color.set(0xffffff);
        hemi.groundColor.set(0x8a8478);
        hemi.intensity = 0.65;
        sun.color.set(0xffffff);
        sun.intensity = 0.45;
        sun.position.set(0.8, 1.5, 1).normalize().multiplyScalar(sunDist);
        fill.intensity = 0;
        underglow.intensity = 0;
      }
    };

    // Per-face materials: textured top, textured sides + dark bottom.
    // BoxGeometry group order is +x, -x, +y, -y, +z, -z.
    const terrainTopMats = Object.fromEntries(
      TERRAINS.map((t) => [t.id, new THREE.MeshLambertMaterial({ color: t.top })]),
    ) as Record<TerrainId, THREE.MeshLambertMaterial>;
    const terrainSideMats = Object.fromEntries(
      TERRAINS.map((t) => [
        t.id,
        {
          left: new THREE.MeshLambertMaterial({ color: t.left }),
          right: new THREE.MeshLambertMaterial({ color: t.right }),
        },
      ]),
    ) as Record<
      TerrainId,
      { left: THREE.MeshLambertMaterial; right: THREE.MeshLambertMaterial }
    >;
    const bottomMat = new THREE.MeshLambertMaterial({ color: "#292524" });
    const terrainBoxMats = Object.fromEntries(
      TERRAINS.map((t) => {
        const { left, right } = terrainSideMats[t.id];
        return [t.id, [right, left, terrainTopMats[t.id], bottomMat, right, left]];
      }),
    ) as Record<TerrainId, THREE.MeshLambertMaterial[]>;

    // Load tile textures asynchronously; tops keep their flat terrain color
    // until each texture arrives, then switch to the true texture colors.
    const textureLoader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const loadedTextures: THREE.Texture[] = [];
    let texturesCancelled = false;
    if (readonly) {
      const bgCanvas = document.createElement("canvas");
      bgCanvas.width = 512;
      bgCanvas.height = 512;
      const bctx = bgCanvas.getContext("2d");
      if (bctx) {
        // Bright daylight sea/sky backdrop (floating_island_2): pale centre
        // behind the plateau deepening to ocean blue at the frame edge.
        const grad = bctx.createRadialGradient(256, 230, 40, 256, 256, 360);
        grad.addColorStop(0, "#a8dcff");
        grad.addColorStop(0.55, "#3a9be0");
        grad.addColorStop(1, "#1f7fd0");
        bctx.fillStyle = grad;
        bctx.fillRect(0, 0, 512, 512);
        const bgTex = new THREE.CanvasTexture(bgCanvas);
        bgTex.colorSpace = THREE.SRGBColorSpace;
        loadedTextures.push(bgTex);
        scene.background = bgTex;
      }
    }
    // Tile themes: the base set loads up front; elemental sets (fire, …)
    // load lazily the first time their ability is switched on. Applying a
    // theme re-points every terrain top material at that set's texture
    // (or its flat terrain color until the texture arrives), so every tile
    // keeps its terrain and only the artwork changes.
    const tileTextures = {} as Record<
      TileThemeId,
      Partial<Record<TerrainId, THREE.Texture>>
    >;
    const tileThemesRequested = new Set<TileThemeId>();
    let activeTileTheme: TileThemeId = useGridStore.getState().tileTheme;
    const applyTileTop = (id: TerrainId) => {
      const mat = terrainTopMats[id];
      const tex = tileTextures[activeTileTheme]?.[id] ?? null;
      // Only an empty<->textured change alters the shader (USE_MAP);
      // swapping one loaded texture for another is a uniform update.
      const defineChanged = (mat.map === null) !== (tex === null);
      mat.map = tex;
      mat.color.set(tex ? "#ffffff" : TERRAIN_MAP[id].top);
      if (defineChanged) mat.needsUpdate = true;
    };
    const ensureTileThemeLoaded = (theme: TileThemeId) => {
      if (tileThemesRequested.has(theme)) return;
      tileThemesRequested.add(theme);
      tileTextures[theme] = {};
      for (const t of TERRAINS) {
        textureLoader.load(
          TILE_TEXTURE_URLS[theme][t.id],
          (tex) => {
            if (texturesCancelled) {
              tex.dispose();
              return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = Math.min(8, maxAniso);
            loadedTextures.push(tex);
            tileTextures[theme][t.id] = tex;
            if (activeTileTheme === theme) applyTileTop(t.id);
          },
          undefined,
          () => {},
        );
      }
    };
    const applyTileTheme = (theme: TileThemeId) => {
      activeTileTheme = theme;
      ensureTileThemeLoaded(theme);
      for (const t of TERRAINS) applyTileTop(t.id);
    };
    ensureTileThemeLoaded(activeTileTheme);

    const cubeGeo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
    // Island column materials: one side texture per depth band (top and
    // bottom share the cap color). Bands follow islandSideBand below.
    const islandMat = new THREE.MeshLambertMaterial({ color: "#7e9cb5" });
    const islandSideMats = [
      new THREE.MeshLambertMaterial({ color: "#7fc4e4" }),
      new THREE.MeshLambertMaterial({ color: "#ffffff" }),
      new THREE.MeshLambertMaterial({ color: "#5b4a8a" }), // deep underbelly fallback
    ];
    // BoxGeometry group order is +x, -x, +y, -y, +z, -z.
    const islandBoxMatsByBand = islandSideMats.map((side) => [
      side,
      side,
      islandMat,
      islandMat,
      side,
      side,
    ]);

    // Side textures arrive asynchronously; each material keeps its flat
    // fallback color until its texture lands, then shows it at full color.
    const applySideTexture = (
      url: string,
      targets: THREE.MeshLambertMaterial[],
    ) => {
      textureLoader.load(
        url,
        (tex) => {
          if (texturesCancelled) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = Math.min(8, maxAniso);
          loadedTextures.push(tex);
          for (const mat of targets) {
            mat.map = tex;
            mat.color.set("#ffffff");
            mat.needsUpdate = true;
          }
        },
        undefined,
        () => {},
      );
    };
    applySideTexture(
      SURFACE_SIDE_URL,
      TERRAINS.flatMap((t) => [
        terrainSideMats[t.id].left,
        terrainSideMats[t.id].right,
      ]),
    );
    applySideTexture(ROCK_SIDE_URL, [islandSideMats[0]]);
    applySideTexture(ICE_SIDE_URL, [islandSideMats[1]]);
    applySideTexture(UNDERBELLY_SIDE_URL, [islandSideMats[2]]);
    const gridGroup = new THREE.Group();
    scene.add(gridGroup);
    const islandGroup = new THREE.Group();
    scene.add(islandGroup);

    // --- Diorama styling (readonly Render step only; PRD checklist) ---
    // Deterministic per-cell hash so jitter is stable across rebuilds.
    const cellRand = (x: number, y: number, salt = 0) => {
      let h = (x * 374761393 + y * 668265263 + salt * 974711) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const dioramaGroup = new THREE.Group();
    dioramaGroup.visible = readonly;
    scene.add(dioramaGroup);
    const std = (color: string, extra: object = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true, ...extra });
    const dMats = {
      trunk: std("#7a4a28"), leafDeep: std("#2f7a3d"), leafMid: std("#4caf50"), leafHi: std("#7ed957"),
      cream: std("#f3e5cf"), roofA: std("#c65a32"), roofB: std("#d97a4a"), timber: std("#7a4a28"),
      door: std("#4a2e18"), stonePost: std("#8a93a3"), snow: std("#ffffff"), rock: std("#7e9cb5"),
      moss: std("#4a9e4f"), crystal: std("#9beaff", { emissive: "#37e0ff", emissiveIntensity: 1.1 }),
      root: std("#6b5a4a"),
      ice: std("#eaf9ff", { emissive: "#bfe6f5", emissiveIntensity: 0.22 }), iceDeep: std("#a8dcf5", { emissive: "#7fc8e8", emissiveIntensity: 0.18 }), path: std("#ecd9a0"),
      lily: std("#57b368"), flowerWhite: std("#ffffff"), flowerPink: std("#ffb7d5"),
    };
    // Snow peaks in island_2 are stacked white blocks: white tops with pale
    // blue-grey shadow sides on every level, not grey stone with a cap.
    const snowTopMat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const snowSideMat = new THREE.MeshLambertMaterial({ color: "#cfe3f2" });
    const snowBoxMats = [
      snowSideMat, snowSideMat, snowTopMat,
      bottomMat, snowSideMat, snowSideMat,
    ];
    const shelfTopMat = new THREE.MeshLambertMaterial({ color: "#eaf9ff" });
    const shelfSideMat = new THREE.MeshLambertMaterial({ color: "#9fd8f2" });
    const shelfBoxMats = [shelfSideMat, shelfSideMat, shelfTopMat, shelfSideMat, shelfSideMat, shelfSideMat];
    const foamMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false });
    const lagoonMat = new THREE.MeshBasicMaterial({ color: "#3fb3ec" });
    const dGeo = {
      trunk: new THREE.CylinderGeometry(CUBE * 0.055, CUBE * 0.075, CUBE * 0.38, 6),
      blob: new THREE.SphereGeometry(1, 7, 5),
      wall: new THREE.BoxGeometry(CUBE * 0.56, CUBE * 0.38, CUBE * 0.5),
      roof: new THREE.CylinderGeometry(CUBE * 0.36, CUBE * 0.36, CUBE * 0.7, 3, 1),
      door: new THREE.BoxGeometry(CUBE * 0.13, CUBE * 0.22, CUBE * 0.03),
      chimney: new THREE.BoxGeometry(CUBE * 0.09, CUBE * 0.2, CUBE * 0.09),
      plank: new THREE.BoxGeometry(CUBE * 0.34, CUBE * 0.045, CUBE * 0.52),
      post: new THREE.BoxGeometry(CUBE * 0.1, CUBE * 0.3, CUBE * 0.1),
      tower: new THREE.CylinderGeometry(CUBE * 0.17, CUBE * 0.26, CUBE * 0.98, 8),
      coneRoof: new THREE.ConeGeometry(CUBE * 0.3, CUBE * 0.34, 8),
      blade: new THREE.BoxGeometry(CUBE * 0.1, CUBE * 0.58, CUBE * 0.02),
      crystal: new THREE.ConeGeometry(CUBE * 0.085, CUBE * 0.52, 6),
      rock: new THREE.DodecahedronGeometry(1, 0),
      root: new THREE.ConeGeometry(CUBE * 0.11, CUBE * 1.4, 6),
      vine: new THREE.BoxGeometry(CUBE * 0.035, 1, CUBE * 0.035),
      snowSlab: new THREE.BoxGeometry(CUBE * 1.12, CUBE * 0.14, CUBE * 1.12),
      shelf: new THREE.BoxGeometry(CUBE * 1.04, CUBE * 0.22, CUBE * 1.04),
      pathSlab: new THREE.BoxGeometry(CUBE * 0.48, CUBE * 0.035, CUBE * 0.48),
      lilyPad: new THREE.CircleGeometry(CUBE * 0.16, 10),
      flower: new THREE.SphereGeometry(CUBE * 0.055, 6, 5),
      foam: new THREE.CircleGeometry(1, 18),
    };
    // Animated waterfall sheet + soft mist sprite (canvas textures).
    const fallCanvas = document.createElement("canvas");
    fallCanvas.width = 64; fallCanvas.height = 256;
    const fctx = fallCanvas.getContext("2d");
    if (fctx) {
      const g = fctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#bfeaff"); g.addColorStop(1, "#7fd4ff");
      fctx.fillStyle = g; fctx.fillRect(0, 0, 64, 256);
      fctx.globalAlpha = 0.5;
      for (let i = 0; i < 26; i++) {
        fctx.fillStyle = i % 2 ? "#ffffff" : "#5db8e8";
        fctx.fillRect(cellRand(i, 7) * 60, cellRand(i, 9) * 200, 2 + cellRand(i, 3) * 3, 40 + cellRand(i, 5) * 90);
      }
    }
    const fallTex = new THREE.CanvasTexture(fallCanvas);
    fallTex.wrapS = THREE.RepeatWrapping; fallTex.wrapT = THREE.RepeatWrapping; fallTex.repeat.set(1, 2.5);
    fallTex.colorSpace = THREE.SRGBColorSpace;
    const streamTex = fallTex.clone();
    streamTex.repeat.set(1, 1.4); streamTex.needsUpdate = true;
    loadedTextures.push(fallTex, streamTex);
    const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
    const streamMat = new THREE.MeshBasicMaterial({ map: streamTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const mistCanvas = document.createElement("canvas");
    mistCanvas.width = 128; mistCanvas.height = 128;
    const mctx = mistCanvas.getContext("2d");
    if (mctx) {
      const g = mctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, "rgba(255,255,255,0.85)"); g.addColorStop(1, "rgba(255,255,255,0)");
      mctx.fillStyle = g; mctx.fillRect(0, 0, 128, 128);
    }
    const mistTex = new THREE.CanvasTexture(mistCanvas);
    loadedTextures.push(mistTex);
    // Ocean surface (island_2): saturated blue with wavy pale streaks,
    // tiled and slowly drifted in the render loop.
    const oceanCanvas = document.createElement("canvas");
    oceanCanvas.width = 512; oceanCanvas.height = 512;
    const octx = oceanCanvas.getContext("2d");
    if (octx) {
      octx.fillStyle = "#2f9be8"; octx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 42; i++) {
        const y0 = cellRand(i, 1, 91) * 512;
        const len = 60 + cellRand(i, 2, 92) * 190;
        const x0 = cellRand(i, 3, 93) * 512 - 40;
        const amp = 3 + cellRand(i, 4, 94) * 7;
        octx.strokeStyle = i % 3 ? "rgba(191,234,255,0.32)" : "rgba(255,255,255,0.42)";
        octx.lineWidth = 2 + cellRand(i, 5, 95) * 2.5;
        octx.beginPath();
        octx.moveTo(x0, y0);
        octx.bezierCurveTo(x0 + len * 0.3, y0 - amp, x0 + len * 0.6, y0 + amp, x0 + len, y0 - amp * 0.4);
        octx.stroke();
      }
      for (let i = 0; i < 22; i++) {
        octx.fillStyle = "rgba(31,127,208,0.25)";
        octx.beginPath();
        octx.ellipse(cellRand(i, 6, 96) * 512, cellRand(i, 7, 97) * 512, 18 + cellRand(i, 8, 98) * 40, 6 + cellRand(i, 9, 99) * 10, 0, 0, Math.PI * 2);
        octx.fill();
      }
    }
    const oceanTex = new THREE.CanvasTexture(oceanCanvas);
    oceanTex.wrapS = THREE.RepeatWrapping; oceanTex.wrapT = THREE.RepeatWrapping;
    oceanTex.repeat.set(9, 9);
    oceanTex.colorSpace = THREE.SRGBColorSpace;
    loadedTextures.push(oceanTex);
    const oceanMat = new THREE.MeshLambertMaterial({ map: oceanTex, side: THREE.DoubleSide });
    const dAnim: {
      blades: THREE.Object3D | null;
      rocks: { mesh: THREE.Mesh; baseY: number; phase: number }[];
      sparkles: THREE.Points | null;
    } = { blades: null, rocks: [], sparkles: null };
    const addMist = (parent: THREE.Object3D, x: number, y: number, z: number, scale: number, opacity: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity, depthWrite: false }));
      s.position.set(x, y, z); s.scale.set(scale, scale * 0.6, 1);
      parent.add(s);
    };
    const shadowed = (m: THREE.Mesh) => { m.castShadow = true; m.receiveShadow = true; return m; };
    const blobAt = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, r: number) => {
      const b = shadowed(new THREE.Mesh(dGeo.blob, mat));
      b.position.set(x, y, z); b.scale.set(r, r * 0.85, r);
      parent.add(b);
    };
    const buildTree = (cell: CellCoord, n: number) => {
      const p = cellCenter(cell, n);
      const g = new THREE.Group();
      const jx = (cellRand(cell.x, cell.y, 1) - 0.5) * CUBE * 0.25;
      const jz = (cellRand(cell.x, cell.y, 2) - 0.5) * CUBE * 0.25;
      const s = 0.85 + cellRand(cell.x, cell.y, 3) * 0.45;
      g.position.set(p.x + jx, CUBE, p.z + jz);
      g.scale.setScalar(s);
      const trunk = shadowed(new THREE.Mesh(dGeo.trunk, dMats.trunk));
      trunk.position.y = CUBE * 0.19;
      g.add(trunk);
      blobAt(g, dMats.leafDeep, 0, CUBE * 0.52, 0, CUBE * 0.3);
      blobAt(g, dMats.leafMid, CUBE * 0.16, CUBE * 0.68, CUBE * 0.08, CUBE * 0.23);
      blobAt(g, dMats.leafHi, -CUBE * 0.13, CUBE * 0.8, -CUBE * 0.06, CUBE * 0.18);
      if (cellRand(cell.x, cell.y, 4) > 0.45) blobAt(g, dMats.leafMid, CUBE * 0.05, CUBE * 0.42, -CUBE * 0.2, CUBE * 0.17);
      dioramaGroup.add(g);
    };
    const buildCottage = (cell: CellCoord, n: number, idx: number) => {
      const p = cellCenter(cell, n);
      const g = new THREE.Group();
      g.position.set(p.x, CUBE, p.z);
      g.rotation.y = Math.atan2(-p.x, -p.z) + (cellRand(cell.x, cell.y, 8) - 0.5) * 0.5;
      g.scale.setScalar(0.9 + cellRand(cell.x, cell.y, 9) * 0.25);
      const wall = shadowed(new THREE.Mesh(dGeo.wall, dMats.cream));
      wall.position.y = CUBE * 0.19;
      g.add(wall);
      const roof = shadowed(new THREE.Mesh(dGeo.roof, idx % 2 ? dMats.roofB : dMats.roofA));
      roof.rotateZ(Math.PI / 2); // prism axis -> X (ridge along X)
      roof.rotateX(Math.PI); // flat face down, apex up
      roof.position.y = CUBE * 0.5;
      roof.scale.set(1, 0.78, 1);
      g.add(roof);
      const door = new THREE.Mesh(dGeo.door, dMats.door);
      door.position.set(0, CUBE * 0.11, CUBE * 0.265);
      g.add(door);
      const chim = shadowed(new THREE.Mesh(dGeo.chimney, dMats.timber));
      chim.position.set(CUBE * 0.16, CUBE * 0.58, -CUBE * 0.08);
      g.add(chim);
      dioramaGroup.add(g);
    };
    const buildWindmill = (cell: CellCoord, n: number) => {
      const p = cellCenter(cell, n);
      const g = new THREE.Group();
      g.position.set(p.x, CUBE, p.z);
      g.rotation.y = Math.atan2(-p.x, Math.max(1, -p.z + CUBE * 2));
      const tower = shadowed(new THREE.Mesh(dGeo.tower, dMats.cream));
      tower.position.y = CUBE * 0.49;
      g.add(tower);
      const roof = shadowed(new THREE.Mesh(dGeo.coneRoof, dMats.roofA));
      roof.position.y = CUBE * 1.13;
      g.add(roof);
      const door = new THREE.Mesh(dGeo.door, dMats.door);
      door.position.set(0, CUBE * 0.11, CUBE * 0.245);
      g.add(door);
      const hub = new THREE.Group();
      hub.position.set(0, CUBE * 0.86, CUBE * 0.24);
      for (let k = 0; k < 4; k++) {
        const arm = new THREE.Group();
        arm.rotation.z = (k * Math.PI) / 2 + 0.4;
        const blade = shadowed(new THREE.Mesh(dGeo.blade, dMats.timber));
        blade.position.y = CUBE * 0.34;
        arm.add(blade);
        hub.add(arm);
      }
      g.add(hub);
      dAnim.blades = hub;
      dioramaGroup.add(g);
    };
    const buildBridge = (cell: CellCoord, n: number, alongX: boolean) => {
      const p = cellCenter(cell, n);
      const g = new THREE.Group();
      g.position.set(p.x, CUBE, p.z);
      if (!alongX) g.rotation.y = Math.PI / 2;
      for (let i = -2; i <= 2; i++) {
        const plank = shadowed(new THREE.Mesh(dGeo.plank, dMats.timber));
        plank.position.set(i * CUBE * 0.35, CUBE * 0.1 + Math.cos((i / 2) * (Math.PI / 2)) * CUBE * 0.09, 0);
        plank.rotation.z = -Math.sin((i / 2) * (Math.PI / 2)) * 0.22;
        g.add(plank);
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const post = shadowed(new THREE.Mesh(dGeo.post, dMats.stonePost));
        post.position.set(sx * CUBE * 0.78, CUBE * 0.12, sz * CUBE * 0.24);
        g.add(post);
      }
      dioramaGroup.add(g);
    };
    const rebuildDiorama = (cells: Record<string, TerrainId>, n: number) => {
      dioramaGroup.clear();
      dAnim.blades = null; dAnim.rocks = []; dAnim.sparkles = null;
      if (!readonly) return;
      const at = (x: number, y: number): TerrainId =>
        x < 0 || y < 0 || x >= n || y >= n ? "grass" : terrainAt(cells, x, y);
      const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
      // 1. Stepped snow peaks from stone components (plaza = water-adjacent).
      const seen = new Set<string>();
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (at(x, y) !== "stone" || seen.has(`${x},${y}`)) continue;
        const comp: CellCoord[] = [];
        const queue = [{ x, y }];
        seen.add(`${x},${y}`);
        while (queue.length) {
          const c = queue.pop() as CellCoord;
          comp.push(c);
          for (const [dx, dy] of DIRS) {
            const nx = c.x + dx, ny = c.y + dy, k = `${nx},${ny}`;
            if (!seen.has(k) && at(nx, ny) === "stone") { seen.add(k); queue.push({ x: nx, y: ny }); }
          }
        }
        // Plaza = mostly water-ringed (the central 2x2). The northern peak
        // clusters merely touch the lake inlet with 1-2 cells, so a plain
        // "any water neighbour" test wrongly flattened them (v1 bug).
        const wetCells = comp.filter((c) => DIRS.some(([dx, dy]) => at(c.x + dx, c.y + dy) === "water")).length;
        const plaza = wetCells / comp.length > 0.5;
        if (plaza || comp.length < 3) continue;
        const cx = comp.reduce((s, c) => s + c.x, 0) / comp.length;
        const cy = comp.reduce((s, c) => s + c.y, 0) / comp.length;
        const peak = comp.reduce((best, c) =>
          Math.hypot(c.x - cx, c.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? c : best);
        for (const c of comp) {
          // island_2 peaks are taller (4 extra) and all-white: every raised
          // level is a snow block with an overhanging slab lip.
          const extra = Math.max(0, 4 - (Math.abs(c.x - peak.x) + Math.abs(c.y - peak.y)));
          const p = cellCenter(c, n);
          for (let h = 1; h <= extra; h++) {
            const cube = shadowed(new THREE.Mesh(cubeGeo, snowBoxMats));
            cube.position.set(p.x, CUBE / 2 + h * CUBE, p.z);
            dioramaGroup.add(cube);
            const lip = shadowed(new THREE.Mesh(dGeo.snowSlab, dMats.snow));
            lip.position.set(p.x, CUBE + h * CUBE - CUBE * 0.06, p.z);
            lip.rotation.y = (cellRand(c.x, c.y, 6 + h) - 0.5) * 0.14;
            dioramaGroup.add(lip);
          }
        }
        // Mountain stream down the peak's south face.
        const pp = cellCenter(peak, n);
        const stream = new THREE.Mesh(new THREE.PlaneGeometry(CUBE * 0.2, CUBE * 4.4), streamMat);
        stream.position.set(pp.x, CUBE * 2.5, pp.z + CUBE * 0.58);
        stream.rotation.x = 0.18;
        dioramaGroup.add(stream);
      }
      // 2. Trees on forest, bushes on some grass.
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const t = at(x, y);
        if (t === "forest") buildTree({ x, y }, n);
        else if (t === "grass" && cellRand(x, y, 11) > 0.82) {
          const p = cellCenter({ x, y }, n);
          blobAt(dioramaGroup, dMats.leafMid, p.x + (cellRand(x, y, 12) - 0.5) * CUBE * 0.4, CUBE + CUBE * 0.1, p.z, CUBE * 0.13);
        }
      }
      // Bridges: water cells flanked by stone on one side, land on the other.
      const bridges: { cell: CellCoord; alongX: boolean }[] = [];
      for (let y = 0; y < n && bridges.length < 2; y++) for (let x = 0; x < n && bridges.length < 2; x++) {
        if (at(x, y) !== "water") continue;
        const ew = (at(x - 1, y) === "stone" && at(x + 1, y) !== "water") || (at(x + 1, y) === "stone" && at(x - 1, y) !== "water");
        const ns = (at(x, y - 1) === "stone" && at(x, y + 1) !== "water") || (at(x, y + 1) === "stone" && at(x, y - 1) !== "water");
        if (!ew && !ns) continue;
        if (bridges.some((b) => Math.abs(b.cell.x - x) + Math.abs(b.cell.y - y) < 3)) continue;
        bridges.push({ cell: { x, y }, alongX: ew });
      }
      bridges.forEach((b) => buildBridge(b.cell, n, b.alongX));
      const nearBridge = (c: CellCoord) => bridges.some((b) => Math.abs(b.cell.x - c.x) + Math.abs(b.cell.y - c.y) <= 1);
      // Town: windmill on southern grass, cottages on grass near the lake.
      const distToWater = (c: CellCoord) => {
        let d = 99;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
          if (at(x, y) === "water") d = Math.min(d, Math.abs(x - c.x) + Math.abs(y - c.y));
        return d;
      };
      const grassCells: CellCoord[] = [];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
        if (at(x, y) === "grass" && !nearBridge({ x, y })) grassCells.push({ x, y });
      const placed: CellCoord[] = [];
      const spaced = (c: CellCoord) => placed.every((o) => Math.max(Math.abs(o.x - c.x), Math.abs(o.y - c.y)) >= 2);
      const south = grassCells.filter((c) => c.y > n / 2 && distToWater(c) >= 2)
        .sort((a, b) => Math.abs(a.x - n / 2) + cellRand(a.x, a.y, 21) * 2 - (Math.abs(b.x - n / 2) + cellRand(b.x, b.y, 21) * 2));
      if (south[0]) { buildWindmill(south[0], n); placed.push(south[0]); }
      const cottageSpots = grassCells.filter((c) => distToWater(c) <= 3 && distToWater(c) >= 1)
        .sort((a, b) => cellRand(a.x, a.y, 22) - cellRand(b.x, b.y, 22));
      let cottageCount = 0;
      for (const c of cottageSpots) {
        if (cottageCount >= 6) break;
        if (!spaced(c)) continue;
        buildCottage(c, n, cottageCount++);
        placed.push(c);
      }
      // Dirt paths (island_2): from each bridge along its axis, plus an
      // L-route from every placed building toward the plaza centre.
      const pathCells = new Set<string>();
      const addPath = (x: number, y: number) => {
        const t = at(x, y);
        if (x >= 0 && y >= 0 && x < n && y < n && (t === "grass" || t === "sand")) pathCells.add(`${x},${y}`);
      };
      for (const b of bridges) {
        for (let s = -4; s <= 4; s++) {
          if (s === 0) continue;
          if (b.alongX) addPath(b.cell.x + s, b.cell.y); else addPath(b.cell.x, b.cell.y + s);
        }
      }
      const plazaC = { x: Math.floor(n / 2), y: Math.floor(n / 2) };
      for (const c of placed) {
        let { x, y } = c;
        while (x !== plazaC.x) { x += Math.sign(plazaC.x - x); addPath(x, y); }
        while (y !== plazaC.y) { y += Math.sign(plazaC.y - y); addPath(x, y); }
      }
      for (const key of pathCells) {
        const [x, y] = key.split(",").map(Number);
        if (placed.some((c) => c.x === x && c.y === y)) continue;
        const p = cellCenter({ x, y }, n);
        const slab = new THREE.Mesh(dGeo.pathSlab, dMats.path);
        slab.position.set(p.x + (cellRand(x, y, 23) - 0.5) * CUBE * 0.08, CUBE + CUBE * 0.02, p.z + (cellRand(x, y, 24) - 0.5) * CUBE * 0.08);
        slab.rotation.y = (cellRand(x, y, 25) - 0.5) * 0.35;
        slab.receiveShadow = true;
        dioramaGroup.add(slab);
      }
      // Lily pads + flowers on the lake (island_2 moat detail).
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (at(x, y) !== "water" || nearBridge({ x, y }) || cellRand(x, y, 26) < 0.68) continue;
        const p = cellCenter({ x, y }, n);
        const lx = p.x + (cellRand(x, y, 27) - 0.5) * CUBE * 0.45;
        const lz = p.z + (cellRand(x, y, 28) - 0.5) * CUBE * 0.45;
        const pad = new THREE.Mesh(dGeo.lilyPad, dMats.lily);
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(lx, CUBE * 0.84, lz);
        dioramaGroup.add(pad);
        if (cellRand(x, y, 29) > 0.45) {
          const fl = new THREE.Mesh(dGeo.flower, cellRand(x, y, 30) > 0.5 ? dMats.flowerWhite : dMats.flowerPink);
          fl.position.set(lx + CUBE * 0.08, CUBE * 0.87, lz);
          dioramaGroup.add(fl);
        }
      }
      // 3. Two south-rim waterfalls with mist at the base.
      const rimZ = (n / 2) * CUBE + 3;
      for (const fx of [Math.floor(n * 0.28), Math.floor(n * 0.72)]) {
        const p = cellCenter({ x: fx, y: n - 1 }, n);
        // Falls now drop from the plateau lip to sea level (island_2).
        const fallH = CUBE - SEA_Y;
        const fall = new THREE.Mesh(new THREE.PlaneGeometry(CUBE * 0.72, fallH), fallMat);
        fall.position.set(p.x, (CUBE + SEA_Y) / 2, rimZ);
        dioramaGroup.add(fall);
        const lip = new THREE.Mesh(new THREE.PlaneGeometry(CUBE * 0.72, CUBE * 0.9),
          new THREE.MeshBasicMaterial({ color: "#7fd4ff", transparent: true, opacity: 0.85 }));
        lip.rotation.x = -Math.PI / 2;
        lip.position.set(p.x, CUBE + 1.5, p.z + CUBE * 0.2);
        dioramaGroup.add(lip);
        const foam = new THREE.Mesh(dGeo.foam, foamMat);
        foam.rotation.x = -Math.PI / 2;
        foam.position.set(p.x, SEA_Y + 1.2, rimZ + CUBE * 0.35);
        foam.scale.set(CUBE * 0.95, CUBE * 0.6, 1);
        dioramaGroup.add(foam);
        addMist(dioramaGroup, p.x, SEA_Y + CUBE * 0.35, rimZ + CUBE * 0.5, CUBE * 2.2, 0.45);
        addMist(dioramaGroup, p.x + CUBE * 0.5, SEA_Y + CUBE * 0.7, rimZ + CUBE * 0.4, CUBE * 1.5, 0.3);
      }
      // 4. Cliff dressing: moss + vines on the upper ring, corner crystals.
      // The island footprint matches the grid, so its edge is the grid edge.
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (!isIslandSolid(n, x, y, 0)) continue;
        const edge = !isIslandSolid(n, x - 1, y, 0) || !isIslandSolid(n, x + 1, y, 0) || !isIslandSolid(n, x, y - 1, 0) || !isIslandSolid(n, x, y + 1, 0);
        if (!edge || cellRand(x, y, 31) < 0.62) continue;
        const p = cellCenter({ x, y }, n);
        const southFace = y === n - 1;
        const mx = p.x + (cellRand(x, y, 32) - 0.5) * CUBE * 0.4;
        const mz = southFace ? p.z + CUBE * 0.52 : p.z + (cellRand(x, y, 33) - 0.5) * CUBE * 0.4;
        blobAt(dioramaGroup, dMats.moss, mx, -CUBE * (0.3 + cellRand(x, y, 34) * 1.1), mz, CUBE * (0.14 + cellRand(x, y, 35) * 0.12));
        if (cellRand(x, y, 36) > 0.5) {
          const len = CUBE * (0.6 + cellRand(x, y, 37) * 0.9);
          const vine = new THREE.Mesh(dGeo.vine, dMats.moss);
          vine.scale.y = len;
          vine.position.set(mx, -CUBE * 0.4 - len / 2, mz + (southFace ? 2 : 0));
          dioramaGroup.add(vine);
        }
      }
      for (const [cx, cy] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]] as const) {
        const p = cellCenter({ x: cx, y: cy }, n);
        for (let k = 0; k < 3; k++) {
          const cry = new THREE.Mesh(dGeo.crystal, dMats.crystal);
          cry.position.set(p.x + (cellRand(cx, k, 41) - 0.5) * CUBE * 0.5, CUBE + CUBE * 0.16, p.z + (cellRand(cy, k, 42) - 0.5) * CUBE * 0.5);
          cry.rotation.set((cellRand(cx, k, 43) - 0.5) * 0.7, 0, (cellRand(cy, k, 44) - 0.5) * 0.7);
          cry.scale.setScalar(0.7 + cellRand(cx, k, 45) * 0.7);
          dioramaGroup.add(cry);
        }
      }
      // 5. Ocean + ice shelf + floating ice (island_2 iceberg-in-sea read).
      // The v1 void dressing (roots, under-mist, floating rocks) is gone:
      // the keel is submerged, so the dressing lives at the waterline.
      // Oversized so the sea fills the frame (no visible plane edge).
      const ocean = new THREE.Mesh(new THREE.PlaneGeometry(CUBE * (n + 70), CUBE * (n + 70)), oceanMat);
      ocean.rotation.x = -Math.PI / 2;
      ocean.position.y = SEA_Y;
      dioramaGroup.add(ocean);
      const lagX = Math.floor(n / 2) - 1;
      const lagoonCells = new Set([0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => `${lagX + dx},${n + dy}`)));
      const chebToGrid = (x: number, y: number) =>
        Math.max(x < 0 ? -x : x > n - 1 ? x - (n - 1) : 0, y < 0 ? -y : y > n - 1 ? y - (n - 1) : 0);
      for (let y = -3; y < n + 3; y++) for (let x = -3; x < n + 3; x++) {
        const d = chebToGrid(x, y);
        if (d < 1 || d > 3) continue;
        const forced = lagoonCells.has(`${x},${y}`);
        // Solid inner apron (d<=2); only the outer ring breaks up.
        if (!forced && d === 3 && cellRand(x, y, 81) < 0.5) continue;
        const p = cellCenter({ x, y }, n);
        const slab = shadowed(new THREE.Mesh(dGeo.shelf, shelfBoxMats));
        slab.position.set(p.x, SEA_Y + CUBE * 0.05 + cellRand(x, y, 82) * CUBE * 0.04, p.z);
        slab.rotation.y = (cellRand(x, y, 83) - 0.5) * 0.08;
        slab.scale.setScalar(1.02 + cellRand(x, y, 84) * 0.14); // overlap: no checkerboard gaps
        dioramaGroup.add(slab);
        if (!forced && cellRand(x, y, 85) > 0.78)
          blobAt(dioramaGroup, dMats.moss, p.x + (cellRand(x, y, 86) - 0.5) * CUBE * 0.4, SEA_Y + CUBE * 0.2, p.z, CUBE * 0.15);
        if (d === 1 && cellRand(x, y, 87) > 0.55) {
          const foam = new THREE.Mesh(dGeo.foam, foamMat);
          foam.rotation.x = -Math.PI / 2;
          foam.position.set(p.x, SEA_Y + 1, p.z);
          foam.scale.set(CUBE * 0.55, CUBE * 0.55, 1);
          dioramaGroup.add(foam);
        }
      }
      // South lagoon pond resting on the shelf, with lilies.
      const lagC = cellCenter({ x: lagX, y: n }, n);
      const lagoon = new THREE.Mesh(dGeo.foam, lagoonMat);
      lagoon.rotation.x = -Math.PI / 2;
      lagoon.position.set(lagC.x, SEA_Y + CUBE * 0.22, lagC.z + CUBE * 0.5);
      lagoon.scale.set(CUBE * 1.35, CUBE * 0.85, 1);
      dioramaGroup.add(lagoon);
      for (let i = 0; i < 3; i++) {
        const pad = new THREE.Mesh(dGeo.lilyPad, dMats.lily);
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(lagC.x + (cellRand(i, 1, 88) - 0.5) * CUBE * 1.4, SEA_Y + CUBE * 0.25, lagC.z + CUBE * 0.5 + (cellRand(i, 2, 89) - 0.5) * CUBE * 0.7);
        dioramaGroup.add(pad);
      }
      // Floating ice chunks bobbing on the ocean (some paired, as in ref).
      for (let i = 0; i < 12; i++) {
        const a = cellRand(i, 1, 61) * Math.PI * 2;
        const r = CUBE * (n / 2 + 3.6 + cellRand(i, 2, 62) * 5.5);
        const chunk = shadowed(new THREE.Mesh(dGeo.rock, i % 3 ? dMats.ice : dMats.iceDeep));
        chunk.position.set(Math.cos(a) * r, SEA_Y + CUBE * 0.08, Math.sin(a) * r);
        chunk.rotation.set(cellRand(i, 4, 64) * 3, cellRand(i, 5, 65) * 3, 0);
        const s = CUBE * (0.25 + cellRand(i, 6, 66) * 0.55);
        chunk.scale.set(s, s * 0.55, s);
        dioramaGroup.add(chunk);
        dAnim.rocks.push({ mesh: chunk, baseY: chunk.position.y, phase: cellRand(i, 7, 67) * Math.PI * 2 });
        if (i % 3 === 0) {
          const pup = shadowed(new THREE.Mesh(dGeo.rock, dMats.ice));
          pup.position.set(chunk.position.x + s * 1.6, SEA_Y + CUBE * 0.05, chunk.position.z + s * 0.9);
          pup.scale.set(s * 0.45, s * 0.25, s * 0.45);
          pup.rotation.y = cellRand(i, 8, 68) * 3;
          dioramaGroup.add(pup);
          dAnim.rocks.push({ mesh: pup, baseY: pup.position.y, phase: cellRand(i, 9, 69) * Math.PI * 2 });
        }
      }
      // Sea-surface glints (the v1 keel sparkles, moved to the water).
      const sparkCount = 110;
      const pos = new Float32Array(sparkCount * 3);
      for (let i = 0; i < sparkCount; i++) {
        const a = cellRand(i, 1, 71) * Math.PI * 2;
        const r = CUBE * (n / 2 + 2.5 + cellRand(i, 2, 72) * 7);
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = SEA_Y + 2 + cellRand(i, 3, 73) * 5;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      const sparkGeo = new THREE.BufferGeometry();
      sparkGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const sparkles = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
        color: "#ffffff", size: 6, sizeAttenuation: true, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      dioramaGroup.add(sparkles);
      dAnim.sparkles = sparkles;
    };
    let cellMeshes: THREE.Mesh[] = [];

    // Wandering elf on the rendered map: a walk-cycle billboard that
    // random-walks the grid. THREE.Sprite always faces the camera; the
    // artwork row is picked per-step in camera space so facing stays
    // correct while orbiting.
    const elfGroup = new THREE.Group();
    elfGroup.visible = readonly;
    scene.add(elfGroup);
    const elfFeet = new THREE.Vector3(0, CUBE, 0);
    let elfSprite: THREE.Sprite | null = null;
    const elfTextures: Record<string, THREE.Texture> = {};
    const elfShadow = new THREE.Mesh(
      new THREE.CircleGeometry(ELF_SHADOW_R, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    elfShadow.rotation.x = -Math.PI / 2;
    elfGroup.add(elfShadow);

    // Wander state: logical cell plus step interpolation between world feet.
    let wanderOn = readonly;
    let elfCell: CellCoord = { x: 0, y: 0 };
    let elfFrom: CellCoord = elfCell;
    let elfTo: CellCoord = elfCell;
    let elfT = 1;
    let stepDur = ELF_STEP_MS;
    const stepFromW = new THREE.Vector3(0, CUBE, 0);
    const stepToW = new THREE.Vector3(0, CUBE, 0);
    let idleUntil = 0;
    let elfDir: ElfDirectionId = "S";
    let elfFrame = 0;
    let lastFrameAt = 0;
    // Sprite atlas follows the selected character variant; unknown ids
    // fall back inside elfSpriteVariant.
    let elfVariant: ElfSpriteVariant = elfSpriteVariant(
      useCharacterStore.getState().selectedId,
    );

    // Swap the billboard to (elfDir, elfFrame): sheet texture, UV crop,
    // and per-row size/feet anchoring (rows differ across the 2 sheets).
    const applyElfFrame = () => {
      if (!elfSprite) return;
      const layout = elfFrameLayout(elfDir, elfFrame, elfVariant);
      const tex = elfTextures[layout.url];
      if (!tex) return; // sheet still loading; keep the previous frame
      const uv = elfFrameUV(elfDir, elfFrame, elfVariant);
      tex.repeat.set(uv.u1 - uv.u0, uv.v1 - uv.v0);
      tex.offset.set(uv.u0, uv.v0);
      const mat = elfSprite.material as THREE.SpriteMaterial;
      if (mat.map !== tex) mat.map = tex;
      elfSprite.scale.set(
        layout.sw * layout.scale,
        layout.sh * layout.scale,
        1,
      );
      // Feet sit below the frame center by (footDy - sh/2) image pixels.
      const lift = (layout.footDy - layout.sh / 2) * layout.scale;
      elfSprite.position.set(elfFeet.x, CUBE + lift, elfFeet.z);
    };
    const tryCreateSprite = () => {
      if (elfSprite) return;
      const layout = elfFrameLayout(elfDir, elfFrame, elfVariant);
      if (!elfTextures[layout.url]) return;
      elfSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ transparent: true, depthWrite: false }),
      );
      elfGroup.add(elfSprite);
      applyElfFrame();
    };
    // Load both sheets for the current variant (textures stay cached by
    // URL, so switching variants back is instant). When a sheet lands,
    // re-apply the frame so a variant swap completes.
    const elfLoading = new Set<string>();
    const loadElfSheets = () => {
      if (!readonly) return;
      for (const url of elfSheetUrls(elfVariant)) {
        if (elfTextures[url] || elfLoading.has(url)) continue;
        elfLoading.add(url);
        textureLoader.load(
          url,
          (tex) => {
            elfLoading.delete(url);
            if (texturesCancelled) {
              tex.dispose();
              return;
            }
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = Math.min(8, maxAniso);
            elfTextures[url] = tex;
            tryCreateSprite();
            applyElfFrame();
          },
          undefined,
          () => elfLoading.delete(url),
        );
      }
    };
    loadElfSheets();
    const setVariant = (selectedId: string) => {
      const next = elfSpriteVariant(selectedId);
      if (next !== elfVariant) {
        elfVariant = next;
        applyElfFrame(); // no-op until the new sheet lands; load re-applies
      }
      loadElfSheets();
    };

    // Screen-space facing for a grid step, from the movement vector in
    // camera space: +x is screen right, +y is toward the viewer.
    const camFwd = new THREE.Vector3();
    const facingForMove = (from: CellCoord, to: CellCoord): ElfDirectionId => {
      const mx = to.x - from.x;
      const mz = to.y - from.y;
      if (!mx && !mz) return elfDir;
      camFwd.subVectors(controls.target, camera.position);
      camFwd.y = 0;
      if (camFwd.lengthSq() < 1e-6) return "S";
      camFwd.normalize();
      const sx = mx * -camFwd.z + mz * camFwd.x;
      const sy = -(mx * camFwd.x + mz * camFwd.z);
      const idx =
        ((Math.round(Math.atan2(sx, sy) / (Math.PI / 4)) % 8) + 8) % 8;
      return FACING_ORDER[idx];
    };

    // Random 8-neighbor step, staying dry when a non-water move exists.
    const pickNext = (): CellCoord => {
      const { cells } = useGridStore.getState();
      const all: CellCoord[] = [];
      const dry: CellCoord[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = elfCell.x + dx;
          const y = elfCell.y + dy;
          if (x < 0 || y < 0 || x >= gridN || y >= gridN) continue;
          const c = { x, y };
          all.push(c);
          if (terrainAt(cells, x, y) !== "water") dry.push(c);
        }
      }
      const pool = dry.length ? dry : all;
      return pool[(Math.random() * pool.length) | 0] ?? elfCell;
    };

    // Tile-effect hook: a fading element-tinted decal where the elf steps.
    // Color follows the selected character variant (fire/ice/lightning).
    const trailGeo = new THREE.CircleGeometry(TRAIL_R, 24);
    const trails: { mesh: THREE.Mesh; born: number }[] = [];
    const spawnTileEffect = (cell: CellCoord, now: number) => {
      const p = cellCenter(cell, gridN);
      const selected = useCharacterStore.getState().selectedId;
      const mesh = new THREE.Mesh(
        trailGeo,
        new THREE.MeshBasicMaterial({
          color: ELEMENT_TRAIL[selected] ?? ELEMENT_TRAIL.ice,
          transparent: true,
          opacity: TRAIL_OPACITY,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, CUBE + 0.6, p.z);
      elfGroup.add(mesh);
      trails.push({ mesh, born: now });
      while (trails.length > TRAIL_MAX) {
        const old = trails.shift();
        if (old) {
          elfGroup.remove(old.mesh);
          (old.mesh.material as THREE.Material).dispose();
        }
      }
    };
    const updateTrails = (now: number) => {
      for (let i = trails.length - 1; i >= 0; i--) {
        const t = trails[i];
        const age = (now - t.born) / TRAIL_MS;
        if (age >= 1) {
          elfGroup.remove(t.mesh);
          (t.mesh.material as THREE.Material).dispose();
          trails.splice(i, 1);
        } else {
          (t.mesh.material as THREE.MeshBasicMaterial).opacity =
            TRAIL_OPACITY * (1 - age);
        }
      }
    };

    const smooth = (t: number) => t * t * (3 - 2 * t);
    const updateWander = (now: number, dt: number) => {
      if (!wanderOn || !elfSprite) return;
      if (elfT < 1) {
        elfT = Math.min(1, elfT + dt / stepDur);
        elfFeet.lerpVectors(stepFromW, stepToW, smooth(elfT));
        elfDir = facingForMove(elfFrom, elfTo);
        if (now - lastFrameAt >= ELF_FRAME_MS) {
          lastFrameAt = now;
          elfFrame = (elfFrame + 1) % ELF_FRAMES;
        }
        applyElfFrame();
        elfShadow.position.set(elfFeet.x, CUBE + 0.5, elfFeet.z);
        if (elfT >= 1) {
          elfCell = elfTo;
          spawnTileEffect(elfCell, now);
          idleUntil =
            now +
            ELF_IDLE_MIN_MS +
            Math.random() * (ELF_IDLE_MAX_MS - ELF_IDLE_MIN_MS);
        }
      } else if (now >= idleUntil) {
        const next = pickNext();
        elfFrom = elfCell;
        elfTo = next;
        elfT = 0;
        const a = cellCenter(elfFrom, gridN);
        const b = cellCenter(elfTo, gridN);
        stepFromW.set(a.x, CUBE, a.z);
        stepToW.set(b.x, CUBE, b.z);
        stepDur =
          ELF_STEP_MS *
          Math.hypot(next.x - elfCell.x, next.y - elfCell.y);
        elfDir = facingForMove(elfFrom, elfTo);
        elfFrame = 0;
        lastFrameAt = now;
        applyElfFrame();
      }
    };

    const placeElf = () => {
      const c = {
        x: Math.floor(gridN / 2),
        y: Math.floor(gridN / 2),
      };
      elfCell = c;
      elfFrom = c;
      elfTo = c;
      elfT = 1;
      const p = cellCenter(c, gridN);
      elfFeet.set(p.x, CUBE, p.z);
      stepFromW.set(p.x, CUBE, p.z);
      stepToW.set(p.x, CUBE, p.z);
      elfShadow.position.set(p.x, CUBE + 0.5, p.z);
      idleUntil = performance.now() + 600;
      for (const t of trails) {
        elfGroup.remove(t.mesh);
        (t.mesh.material as THREE.Material).dispose();
      }
      trails.length = 0;
      if (elfSprite) {
        elfDir = "S";
        elfFrame = 0;
        applyElfFrame();
      }
    };

    const setWander = (on: boolean) => {
      wanderOn = on;
      const now = performance.now();
      if (on) {
        idleUntil = now + 200;
        lastFrameAt = now;
      } else if (elfSprite) {
        elfFrame = 0;
        applyElfFrame();
      }
    };

    const slabTop = new THREE.Mesh(
      new THREE.BoxGeometry(1, 20, 1),
      new THREE.MeshLambertMaterial({ color: "#78716c" }),
    );
    slabTop.position.y = -10;
    scene.add(slabTop);
    const slabBase = new THREE.Mesh(
      new THREE.BoxGeometry(1, 26, 1),
      new THREE.MeshLambertMaterial({ color: "#44403c" }),
    );
    slabBase.position.y = -33;
    scene.add(slabBase);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40000, 40000),
      new THREE.MeshLambertMaterial({ color: GROUND }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -46;
    scene.add(ground);

    // Render step: the island floats free — no slab or ground plane.
    slabTop.visible = !readonly;
    slabBase.visible = !readonly;
    ground.visible = !readonly;

    const selectedBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(CUBE + 4, CUBE + 4, CUBE + 4),
      ),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    selectedBox.visible = false;
    scene.add(selectedBox);

    const hoverBox = new THREE.Mesh(
      new THREE.BoxGeometry(CUBE + 2, CUBE + 2, CUBE + 2),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    hoverBox.visible = false;
    scene.add(hoverBox);

    let gridN = useGridStore.getState().n;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height);
    };

    const fit = () => {
      // Readonly framing follows island_2: plateau + ice shelf fill the
      // frame over the ocean (submerged keel excluded from the fit).
      const footprint = Math.hypot((gridN + (readonly ? 3 : 0)) * CUBE, (gridN + (readonly ? 3 : 0)) * CUBE) / 2;
      const top = readonly ? CUBE * 5.4 : CUBE; // snow peaks + windmill headroom
      const bottom = readonly ? SEA_Y - CUBE * 0.4 : 0;
      const radius =
        Math.hypot(footprint, readonly ? (top - bottom) / 2 : 0) + CUBE * 0.75;
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      const dist = radius / Math.sin(Math.min(vFov, hFov) / 2);
      // Polar is measured from vertical, so 20deg of elevation is a
      // 70deg polar angle. The editor keeps classic isometric framing.
      const polar = readonly
        ? THREE.MathUtils.degToRad(90 - RENDER_ELEVATION_DEG)
        : Math.acos(1 / Math.sqrt(3));
      const azim = Math.PI / 4;
      const dir = new THREE.Vector3(
        Math.sin(polar) * Math.sin(azim),
        Math.cos(polar),
        Math.sin(polar) * Math.cos(azim),
      );
      const target = new THREE.Vector3(
        0,
        readonly ? (top + bottom) / 2 : CUBE * 0.25,
        0,
      );
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.near = Math.max(1, dist / 100);
      camera.far = dist * 20;
      camera.updateProjectionMatrix();
      controls.target.copy(target);
      controls.minDistance = dist * 0.15;
      controls.maxDistance = dist * 3;
      controls.update();
    };

    const refreshOverlays = () => {
      const s = useGridStore.getState().selected;
      const h = useGridStore.getState().hover;
      const inBounds = (c: CellCoord | null) =>
        !!c && c.x >= 0 && c.y >= 0 && c.x < gridN && c.y < gridN;
      if (inBounds(s)) {
        selectedBox.position.copy(cellCenter(s as CellCoord, gridN));
        selectedBox.visible = true;
      } else {
        selectedBox.visible = false;
      }
      // Hover hides under selection, like the 2D view.
      const hoverWins =
        inBounds(h) && !(s && h && s.x === h.x && s.y === h.y);
      if (hoverWins) {
        hoverBox.position.copy(cellCenter(h as CellCoord, gridN));
        hoverBox.visible = true;
      } else {
        hoverBox.visible = false;
      }
    };

    const rebuild = (nextN: number) => {
      gridN = nextN;
      gridGroup.clear();
      cellMeshes = [];
      const state = useGridStore.getState();
      const sinkFor = (t: TerrainId) =>
        readonly ? (t === "water" ? CUBE * 0.18 : t === "sand" ? CUBE * 0.06 : 0) : 0;
      for (let y = 0; y < nextN; y++) {
        for (let x = 0; x < nextN; x++) {
          const terrain = terrainAt(state.cells, x, y);
          const mesh = new THREE.Mesh(cubeGeo, terrainBoxMats[terrain]);
          mesh.position.copy(cellCenter({ x, y }, nextN));
          mesh.position.y -= sinkFor(terrain);
          mesh.castShadow = readonly;
          mesh.receiveShadow = readonly;
          mesh.userData.cell = { x, y };
          gridGroup.add(mesh);
          cellMeshes.push(mesh);
        }
      }
      if (readonly) {
        sunDist = nextN * CUBE * 2.2;
        sun.position.setLength(sunDist);
        const sc = sun.shadow.camera;
        const extent = (nextN + 5) * CUBE * 0.75; // plateau + ice shelf
        sc.left = -extent; sc.right = extent; sc.top = extent; sc.bottom = -extent;
        sc.near = CUBE; sc.far = sunDist * 2.5;
        sc.updateProjectionMatrix();
      }
      const slabW = nextN * CUBE + 32;
      slabTop.scale.set(slabW, 1, slabW);
      slabBase.scale.set(slabW, 1, slabW);
      islandGroup.clear();
      if (readonly) {
        // Island generated for this grid size: footprint fills the grid.
        const islandVolume = generateIslandVolume(nextN);
        for (let z = 0; z < ISLAND_H; z++) {
          for (let y = 0; y < nextN; y++) {
            for (let x = 0; x < nextN; x++) {
              if (islandVolume[z][y][x] !== 1) continue;
              const mesh = new THREE.Mesh(
                cubeGeo,
                islandBoxMatsByBand[islandSideBand(z)],
              );
              const p = cellCenter({ x, y }, nextN);
              mesh.position.set(p.x, -(z * CUBE + CUBE / 2), p.z);
              mesh.receiveShadow = true;
              islandGroup.add(mesh);
            }
          }
        }
      }
      rebuildDiorama(state.cells, nextN);
      refreshOverlays();
      placeElf();
      fit();
    };

    const recolor = (nextCells: Record<string, TerrainId>) => {
      for (const mesh of cellMeshes) {
        const c = mesh.userData.cell as CellCoord;
        const terrain = terrainAt(nextCells, c.x, c.y);
        mesh.material = terrainBoxMats[terrain];
        if (readonly) {
          const sink = terrain === "water" ? CUBE * 0.18 : terrain === "sand" ? CUBE * 0.06 : 0;
          mesh.position.y = CUBE / 2 - sink;
        }
      }
      if (readonly) rebuildDiorama(nextCells, gridN);
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (e: PointerEvent): CellCoord | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(cellMeshes, false)[0];
      return hit ? (hit.object.userData.cell as CellCoord) : null;
    };

    const aborter = new AbortController();
    const { signal } = aborter;
    let downAt: { x: number; y: number } | null = null;
    let pendingHover: PointerEvent | null = null;

    renderer.domElement.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button === 0) downAt = { x: e.clientX, y: e.clientY };
      },
      { signal },
    );
    renderer.domElement.addEventListener(
      "pointerup",
      (e) => {
        const start = downAt;
        downAt = null;
        if (e.button !== 0 || !start) return;
        if (
          Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX
        ) {
          return; // was a drag, not a click
        }
        if (!readonly) {
          const cell = pick(e);
          const st = useGridStore.getState();
          if (st.tool === "select") {
            st.setSelected(cell);
          } else if (st.tool === "paint") {
            if (cell) {
              st.paintCell(cell.x, cell.y);
              st.setSelected(cell);
            }
          }
          // pan: controls own the drag; click does nothing
        }
      },
      { signal },
    );
    renderer.domElement.addEventListener(
      "pointermove",
      (e) => {
        pendingHover = e;
      },
      { signal },
    );
    renderer.domElement.addEventListener(
      "pointerleave",
      () => {
        pendingHover = null;
        useGridStore.getState().setHover(null);
      },
      { signal },
    );
    let raf = 0;
    let lastNow = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(100, now - lastNow);
      lastNow = now;
      if (pendingHover) {
        useGridStore.getState().setHover(pick(pendingHover));
        pendingHover = null;
      }
      updateWander(now, dt);
      updateTrails(now);
      if (readonly) {
        if (dAnim.blades) dAnim.blades.rotation.z -= dt * 0.0016;
        fallTex.offset.y = (fallTex.offset.y - dt * 0.0011) % 1;
        streamTex.offset.y = (streamTex.offset.y - dt * 0.0016) % 1;
        oceanTex.offset.y = (oceanTex.offset.y - dt * 0.000018) % 1;
        oceanTex.offset.x = (oceanTex.offset.x + dt * 0.000007) % 1;
        for (const r of dAnim.rocks) {
          r.mesh.position.y = r.baseY + Math.sin(now * 0.0007 + r.phase) * CUBE * 0.07;
          r.mesh.rotation.y += dt * 0.00012;
        }
        if (dAnim.sparkles) dAnim.sparkles.rotation.y = now * 0.00002;
        (dMats.crystal as THREE.MeshStandardMaterial).emissiveIntensity = 1.1 + Math.sin(now * 0.002) * 0.35;
      }
      controls.update();
      renderer.render(scene, camera);
    };

    apiRef.current = {
      rebuild,
      recolor,
      refreshOverlays,
      fit,
      setWander,
      setLighting,
      setVariant,
      setTileTheme: applyTileTheme,
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();
    loop();

    return () => {
      cancelAnimationFrame(raf);
      texturesCancelled = true;
      loadedTextures.forEach((t) => t.dispose());
      Object.values(elfTextures).forEach((t) => t.dispose());
      trailGeo.dispose();
      for (const t of trails) {
        (t.mesh.material as THREE.Material).dispose();
      }
      if (elfSprite) (elfSprite.material as THREE.Material).dispose();
      ro.disconnect();
      aborter.abort();
      controls.dispose();
      scene.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.LineSegments ||
          obj instanceof THREE.Points ||
          obj instanceof THREE.Sprite
        ) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    apiRef.current?.rebuild(n);
  }, [n]);
  useEffect(() => {
    apiRef.current?.recolor(cells);
  }, [cells]);
  useEffect(() => {
    apiRef.current?.refreshOverlays();
  }, [selected, hover]);
  useEffect(() => {
    apiRef.current?.fit();
  }, [fitSignal]);
  useEffect(() => {
    apiRef.current?.setVariant(selectedId);
  }, [selectedId]);
  useEffect(() => {
    apiRef.current?.setTileTheme(tileTheme);
  }, [tileTheme]);
  // An elemental tile theme belongs to its character: switching to a
  // character without that ability restores the base textures.
  useEffect(() => {
    if (tileTheme !== "base" && tileAbilityFor(selectedId)?.theme !== tileTheme) {
      setTileTheme("base");
    }
  }, [selectedId, tileTheme, setTileTheme]);

  const toolMeta = TOOLS.find((t) => t.id === tool);

  return (
    <div
      ref={containerRef}
      className={`relative min-w-0 flex-1 touch-none overflow-hidden bg-stone-800 select-none dark:bg-zinc-950 ${readonly ? "cursor-default" : TOOL_CURSORS[tool]}`}
    >
      {readonly ? (
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <button
            type="button"
            title={wander ? "Pause the wandering elf" : "Let the elf wander"}
            aria-pressed={wander}
            onClick={() => {
              const next = !wander;
              setWanderState(next);
              apiRef.current?.setWander(next);
            }}
            className={`rounded-md border px-2.5 py-1.5 text-xs shadow-sm ${
              wander
                ? "border-sky-600 bg-sky-600/90 font-semibold text-white"
                : "border-stone-600 bg-stone-900/90 text-stone-300 hover:bg-stone-700"
            }`}
          >
            {wander ? "Wandering…" : "Wander"}
          </button>
          {(() => {
            const ability = tileAbilityFor(selectedId);
            if (!ability) return null;
            const active = tileTheme === ability.theme;
            return (
              <button
                type="button"
                title={ability.title}
                aria-pressed={active}
                onClick={() =>
                  setTileTheme(active ? "base" : ability.theme)
                }
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs shadow-sm ${
                  active
                    ? ability.activeClass
                    : "border-stone-600 bg-stone-900/90 text-stone-300 hover:bg-stone-700"
                }`}
              >
                {ability.icon === "bolt" ? (
                  <svg
                    width={11}
                    height={13}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" />
                  </svg>
                ) : ability.icon === "snowflake" ? (
                  <svg
                    width={13}
                    height={13}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M12 2L9.5 4.5M12 2l2.5 2.5M12 22l-2.5-2.5M12 22l2.5-2.5" />
                  </svg>
                ) : (
                  <svg
                    width={11}
                    height={13}
                    viewBox="0 0 24 28"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 0c1.2 4.6-.9 7.4-3.2 10.2C7 12.5 5.2 15 5.2 18.4A6.8 6.8 0 0 0 12 25.2a6.8 6.8 0 0 0 6.8-6.8c0-2-.7-3.7-1.7-5.3-.6 1.4-1.6 2.3-2.9 2.8.9-4.4-.3-10-2.2-15.9z" />
                  </svg>
                )}
                {active ? ability.activeLabel : ability.label}
              </button>
            );
          })()}
        </div>
      ) : toolMeta ? (
        <div className="pointer-events-none absolute top-3 left-3 rounded-md border border-stone-600 bg-stone-900/90 px-2.5 py-1.5 text-xs text-stone-300 shadow-sm">
          <span className="font-semibold text-white">{toolMeta.label}</span> —{" "}
          {toolMeta.hint}
        </div>
      ) : null}

      <div className="absolute right-4 bottom-4 flex items-center gap-1 rounded-md border border-stone-600 bg-stone-900/90 px-1.5 py-1 shadow-sm">
        <button
          type="button"
          title="Fit grid to view"
          onClick={() => apiRef.current?.fit()}
          className="rounded px-2 py-0.5 text-xs font-medium text-stone-200 hover:bg-stone-700"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
