import { readdir } from "node:fs/promises";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";

// Static export: the gallery lists public/assets/ at build time.

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
  ".bmp",
  ".ico",
]);

async function listAssetImages(): Promise<string[]> {
  const assetsDir = path.join(process.cwd(), "public", "assets");
  try {
    const entries = await readdir(assetsDir);
    return entries
      .filter((name) =>
        IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()),
      )
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export default async function AssetsPage() {
  const images = await listAssetImages();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assets</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Every image in{" "}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-sm dark:bg-zinc-800">
              public/assets/
            </code>{" "}
            appears here automatically.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← Back home
        </Link>
      </header>

      {images.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
          <p className="text-lg font-medium">No images yet</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Drop a{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm dark:bg-zinc-800">
              .png
            </code>
            ,{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm dark:bg-zinc-800">
              .jpg
            </code>
            , or{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm dark:bg-zinc-800">
              .svg
            </code>{" "}
            into{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm dark:bg-zinc-800">
              public/assets/
            </code>{" "}
            and refresh this page.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((name) => (
            <li
              key={name}
              className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="relative aspect-square w-full bg-zinc-50 dark:bg-zinc-950">
                <Image
                  src={`/assets/${encodeURIComponent(name)}`}
                  alt={name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-contain p-2"
                />
              </div>
              <p className="truncate border-t border-zinc-200 px-3 py-2 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                {name}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
