import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CharacterState {
  selectedId: string;
  select: (id: string) => void;
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set) => ({
      selectedId: "fire",
      select: (id) => set({ selectedId: id }),
    }),
    {
      name: "map-maker-character",
      partialize: (state) => ({ selectedId: state.selectedId }),
    },
  ),
);
