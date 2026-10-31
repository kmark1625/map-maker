import type { StaticImageData } from "next/image";

import fireVariant from "@/app/assets/images/character_select_screen/elf_fire_variant.png";
import iceVariant from "@/app/assets/images/character_select_screen/elf_ice_variant.png";
import shadowVariant from "@/app/assets/images/character_select_screen/elf_shadow_variant.png";

export interface CharacterVariant {
  id: string;
  name: string;
  element: string;
  description: string;
  image: StaticImageData;
  /** Tailwind classes for the selected-state dot. */
  accentDot: string;
}

export const CHARACTER_VARIANTS: CharacterVariant[] = [
  {
    id: "fire",
    name: "Elf Archer",
    element: "Fire",
    description: "Wields wildfire arrows across scorched, burning lands.",
    image: fireVariant,
    accentDot: "bg-orange-600",
  },
  {
    id: "ice",
    name: "Elf Archer",
    element: "Ice",
    description: "Fires frost-tipped arrows over frozen citadels and glaciers.",
    image: iceVariant,
    accentDot: "bg-sky-500",
  },
  {
    id: "shadow",
    name: "Elf Archer",
    element: "Shadow",
    description: "Strikes from darkness beneath a void moon and storm clouds.",
    image: shadowVariant,
    accentDot: "bg-zinc-800 dark:bg-zinc-200",
  },
];

export function getVariant(id: string): CharacterVariant {
  return CHARACTER_VARIANTS.find((v) => v.id === id) ?? CHARACTER_VARIANTS[0];
}

/** Step through variants with wrap-around; direction is +1 or -1. */
export function stepVariant(id: string, direction: 1 | -1): CharacterVariant {
  const index = CHARACTER_VARIANTS.findIndex((v) => v.id === id);
  const current = index === -1 ? 0 : index;
  const next =
    (current + direction + CHARACTER_VARIANTS.length) %
    CHARACTER_VARIANTS.length;
  return CHARACTER_VARIANTS[next];
}
