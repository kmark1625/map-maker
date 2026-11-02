"use client";

import ThreeCanvas from "@/components/ThreeCanvas";
import FlowBar from "@/components/FlowBar";

export default function MapRender() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <FlowBar backHref="/editor" backLabel="Editor" currentStep={3} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-stone-800 dark:bg-zinc-950">
        <ThreeCanvas readonly />
      </div>
    </div>
  );
}
