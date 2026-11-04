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
  },
};

/** The selected character's tile ability, or null if it has none. */
export function tileAbilityFor(selectedId: string): TileAbility | null {
  return TILE_ABILITIES[selectedId] ?? null;
}
