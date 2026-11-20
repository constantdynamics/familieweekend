/**
 * Builds public/sw.js after Next.js has compiled the app, so the service
 * worker can precache exactly this build's static files (Serwist's
 * getFileManifestEntries, bundled with esbuild).
 *
 * Runs from next.config.ts via `compiler.runAfterProductionCompile`, and can
 * also run on its own: `npx tsx scripts/build-sw.ts`.
 */
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

type Meta = { distDir: string; projectDir: string };

export async function buildServiceWorker({ distDir, projectDir }: Meta): Promise<void> {
  if (process.env.NEXT_PUBLIC_SW === "off") return;
  const { getFileManifestEntries } = await import("@serwist/build");
  const esbuild = await import("esbuild");

  const outDir = path.isAbsolute(distDir) ? distDir : path.join(projectDir, distDir);
  const { manifestEntries = [], warnings } = await getFileManifestEntries({
    globDirectory: outDir,
    globPatterns: ["static/**/*.{js,css,woff2}"],
    globIgnores: ["**/*.map", "**/*.LICENSE.txt"],
    globFollow: true,
    globStrict: true,
    dontCacheBustURLsMatching: /^\/_next\/static\//,
    modifyURLPrefix: { "static/": "/_next/static/" },
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    disablePrecacheManifest: false,
    additionalPrecacheEntries: [],
    templatedURLs: undefined,
    manifestTransforms: undefined,
  });
  for (const warning of warnings) console.warn(`[sw] ${warning}`);

  // The offline page and the app icons, revisioned with this build.
  const revision = createHash("sha256").update(JSON.stringify(manifestEntries)).digest("hex").slice(0, 16);
  const extra = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"].map((url) => ({
    url,
    revision,
  }));

  const result = await esbuild.build({
    entryPoints: [path.join(projectDir, "src", "sw", "sw.ts")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020", "safari15"],
    minify: true,
    write: false,
    legalComments: "none",
    tsconfig: path.join(projectDir, "src", "sw", "tsconfig.json"),
    define: {
      "self.__SW_MANIFEST": JSON.stringify([...manifestEntries, ...extra]),
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  });
  const [file] = result.outputFiles;
  await writeFile(path.join(projectDir, "public", "sw.js"), file.text);
  console.log(`[sw] public/sw.js klaar: ${manifestEntries.length + extra.length} bestanden in de precache.`);
}

if (process.argv[1] && /build-sw\.ts$/.test(process.argv[1])) {
  buildServiceWorker({ distDir: ".next", projectDir: process.cwd() }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
