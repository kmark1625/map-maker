import { create } from "zustand";

interface CharacterState {
  selectedId: string;
  select: (id: string) => void;
}

export const useCharacterStore = create<CharacterState>((set) => ({
  selectedId: "fire",
  select: (id) => set({ selectedId: id }),
}));
