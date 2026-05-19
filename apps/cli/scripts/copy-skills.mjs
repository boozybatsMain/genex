#!/usr/bin/env node
// Copies the AI agent skill folders that `genex create` seeds into every new
// project. Runs before `npm publish` so the published tarball ships with a
// sibling `skills/` directory (see tsup.config.ts + src/skills.ts).

import { cp, mkdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLED_SKILLS = [
  "threejs",
  "threejs-animations",
  "r3f-router",
  "r3f-fundamentals",
  "r3f-geometry",
  "r3f-materials",
  "r3f-performance",
  "r3f-drei",
];

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const repoRoot = resolve(pkgRoot, "..", "..");
const sourceDir = resolve(repoRoot, ".claude", "skills");
const destDir = resolve(pkgRoot, "skills");

if (!existsSync(sourceDir)) {
  console.error(`[copy-skills] source not found: ${sourceDir}`);
  process.exit(1);
}

await rm(destDir, { recursive: true, force: true });
await mkdir(destDir, { recursive: true });

let copied = 0;
let missing = [];
for (const name of BUNDLED_SKILLS) {
  const src = resolve(sourceDir, name);
  try {
    const s = await stat(src);
    if (!s.isDirectory()) {
      missing.push(name);
      continue;
    }
  } catch {
    missing.push(name);
    continue;
  }
  await cp(src, resolve(destDir, name), { recursive: true });
  copied++;
}

console.log(`[copy-skills] copied ${copied} skills → ${destDir}`);
if (missing.length) console.warn(`[copy-skills] missing: ${missing.join(", ")}`);
