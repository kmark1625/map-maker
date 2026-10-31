"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import titleArt from "@/app/assets/images/title_screen/map_maker_title_screen.png";

export default function TitleScreen() {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.tagName === "BUTTON" ||
          target.tagName === "A")
      ) {
        return;
      }
      e.preventDefault();
      router.push("/select");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-zinc-900 px-6 py-8 text-center">
      <h1 className="sr-only">Map Maker</h1>
      <div className="relative min-h-0 w-full max-w-md flex-1">
        <Image
          src={titleArt}
          alt="Map Maker — elf archer hero above a map landscape"
          fill
          sizes="(max-width: 448px) 100vw, 448px"
          className="object-contain"
          priority
        />
      </div>
      <p className="text-sm font-medium tracking-wide text-zinc-400 motion-safe:animate-pulse">
        Press Space or Enter to continue
      </p>
      <Link
        href="/select"
        className="rounded-lg bg-white px-8 py-3 text-sm font-bold text-zinc-900 shadow-md transition hover:bg-zinc-200"
      >
        Continue
      </Link>
    </main>
  );
}
