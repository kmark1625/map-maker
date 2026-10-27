import { create } from "zustand";

interface HelloState {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export const useHelloStore = create<HelloState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 }),
}));
