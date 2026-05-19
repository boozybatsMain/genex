import { cp, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Skills that get bundled into every generated project's `.claude/skills/`.
 * These cover Three.js + React Three Fiber, which is what the editor's
 * runtime is built on, so AI agents working in the project folder have the
 * same reference material the editor was authored against.
 */
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

/**
 * Resolve the on-disk root that contains `<skill>/SKILL.md` folders.
 *
 * Priority:
 *   1. `$GENEX_SKILLS_DIR` env var
 *   2. Sibling `skills/` next to the bundled CLI (npm-published layout:
 *      `<pkg>/dist/index.js` → `<pkg>/skills/`)
 *   3. Walk up from this module's location, looking for `.claude/skills/`
 *      (only useful in this monorepo during local development)
 */
export async function findSkillsSourceDir(): Promise<string | null> {
  const fromEnv = process.env.GENEX_SKILLS_DIR;
  if (fromEnv && existsSync(fromEnv)) return resolve(fromEnv);

  const here = dirname(fileURLToPath(import.meta.url));

  // Published-package layout: <pkg-root>/dist/index.js next to <pkg-root>/skills
  const bundled = resolve(here, "..", "skills");
  if (existsSync(bundled)) return bundled;

  // Dev / monorepo layout fallback.
  let cur = here;
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(cur, ".claude/skills");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

export interface SkillCopyResult {
  sourceDir: string | null;
  copied: string[];
  skipped: string[];
  missing: string[];
}

export async function bundleSkills(projectDir: string): Promise<SkillCopyResult> {
  const sourceDir = await findSkillsSourceDir();
  const result: SkillCopyResult = {
    sourceDir,
    copied: [],
    skipped: [],
    missing: [],
  };
  if (!sourceDir) return result;

  const destBase = resolve(projectDir, ".claude/skills");
  await mkdir(destBase, { recursive: true });

  for (const name of BUNDLED_SKILLS) {
    const src = resolve(sourceDir, name);
    const dst = resolve(destBase, name);
    let srcExists = false;
    try {
      const s = await stat(src);
      srcExists = s.isDirectory();
    } catch {
      srcExists = false;
    }
    if (!srcExists) {
      result.missing.push(name);
      continue;
    }
    if (existsSync(dst)) {
      result.skipped.push(name);
      continue;
    }
    await cp(src, dst, { recursive: true });
    result.copied.push(name);
  }
  return result;
}
