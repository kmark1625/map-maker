import type { TerrainId, TileThemeId } from "@/stores/grid-store";

import grassTile from "@/app/assets/images/tile/base/grass_flat.webp";
import waterTile from "@/app/assets/images/tile/base/water_flat.webp";
import sandTile from "@/app/assets/images/tile/base/sand_flat.webp";
import stoneTile from "@/app/assets/images/tile/base/stone_flat.webp";
import forestTile from "@/app/assets/images/tile/base/forest_flat.webp";
import fireGrassTile from "@/app/assets/images/tile/fire/grass_flat.webp";
import fireWaterTile from "@/app/assets/images/tile/fire/water_flat.webp";
import fireSandTile from "@/app/assets/images/tile/fire/sand_flat.webp";
import fireStoneTile from "@/app/assets/images/tile/fire/stone_flat.webp";
import fireForestTile from "@/app/assets/images/tile/fire/forest_flat.webp";
import iceGrassTile from "@/app/assets/images/tile/ice/grass_flat.webp";
import iceWaterTile from "@/app/assets/images/tile/ice/water_flat.webp";
import iceSandTile from "@/app/assets/images/tile/ice/sand_flat.webp";
import iceStoneTile from "@/app/assets/images/tile/ice/stone_flat.webp";
import iceForestTile from "@/app/assets/images/tile/ice/forest_flat.webp";
import lightningGrassTile from "@/app/assets/images/tile/lightning/grass_flat.webp";
import lightningWaterTile from "@/app/assets/images/tile/lightning/water_flat.webp";
import lightningSandTile from "@/app/assets/images/tile/lightning/sand_flat.webp";
import lightningStoneTile from "@/app/assets/images/tile/lightning/stone_flat.webp";
import lightningForestTile from "@/app/assets/images/tile/lightning/forest_flat.webp";

/**
 * Tile-top texture sets. Every theme must cover every terrain with the
 * same `<terrain>_flat.webp` filename (see images/tile/<theme>/), so
 * swapping themes re-skins all tiles without changing their terrain.
 * To add an elemental set (ice, lightning, …): drop its five textures
 * in a new folder, extend TileThemeId in grid-store, add an entry here,
 * and register its ability below.
 */
export const TILE_TEXTURE_URLS: Record<TileThemeId, Record<TerrainId, string>> = {
  base: {
    grass: grassTile.src,
    water: waterTile.src,
    sand: sandTile.src,
    stone: stoneTile.src,
    forest: forestTile.src,
  },
  fire: {
    grass: fireGrassTile.src,
    water: fireWaterTile.src,
    sand: fireSandTile.src,
    stone: fireStoneTile.src,
    forest: fireForestTile.src,
  },
  ice: {
    grass: iceGrassTile.src,
    water: iceWaterTile.src,
    sand: iceSandTile.src,
    stone: iceStoneTile.src,
    forest: iceForestTile.src,
  },
  lightning: {
    grass: lightningGrassTile.src,
    water: lightningWaterTile.src,
    sand: lightningSandTile.src,
    stone: lightningStoneTile.src,
    forest: lightningForestTile.src,
  },
};

export interface TileAbility {
  /** Theme applied to every tile while the ability is active. */
  theme: Exclude<TileThemeId, "base">;
  /** Button label. */
  label: string;
  /** Button label while the ability is active. */
  activeLabel: string;
  /** Tooltip / accessible description. */
  title: string;
  /** Icon shown on the button. */
  icon: "flame" | "snowflake" | "bolt";
  /** Tailwind classes for the button while the ability is active. */
  activeClass: string;
}

/**
 * Elemental tile abilities, keyed by character variant id
 * (see data/character-variants.ts). Variants without an entry have
 * no tile ability yet, so no button is offered for them.
 */
const TILE_ABILITIES: Partial<Record<string, TileAbility>> = {
  fire: {
    theme: "fire",
    label: "Flame",
    activeLabel: "Flaming…",
    title: "Set every tile on the map to its fire texture",
    icon: "flame",
    activeClass: "border-orange-600 bg-orange-600/90 font-semibold text-white",
  },
  ice: {
    theme: "ice",
    label: "Freeze",
    activeLabel: "Freezing…",
    title: "Freeze every tile on the map to its ice texture",
    icon: "snowflake",
    activeClass: "border-sky-600 bg-sky-600/90 font-semibold text-white",
  },
  lightning: {
    theme: "lightning",
    label: "Zap",
    activeLabel: "Zapping…",
    title: "Set every tile on the map to its lightning texture",
    icon: "bolt",
    activeClass: "border-yellow-400 bg-yellow-400/90 font-semibold text-stone-900",
  },
};

/** The selected character's tile ability, or null if it has none. */
export function tileAbilityFor(selectedId: string): TileAbility | null {
  return TILE_ABILITIES[selectedId] ?? null;
}
