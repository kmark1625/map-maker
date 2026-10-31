"use client";

import { useEffect } from "react";
import { TERRAINS, useGridStore, type ToolId } from "@/stores/grid-store";

const KEY_TO_TOOL: Record<string, ToolId> = {
  v: "select",
  h: "pan",
  p: "paint",
  e: "erase",
};

export default function Shortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const state = useGridStore.getState();
      if (e.key === "Escape") {
        state.setSelected(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selected) {
          state.eraseCell(state.selected.x, state.selected.y);
        }
        return;
      }
      if (e.key.toLowerCase() === "f") {
        state.requestFit();
        return;
      }
      const terrain = TERRAINS.find((t) => t.shortcut === e.key);
      if (terrain) {
        state.setActiveTerrain(terrain.id);
        state.setTool("paint");
        return;
      }
      const tool = KEY_TO_TOOL[e.key.toLowerCase()];
      if (tool) state.setTool(tool);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
