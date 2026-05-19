import { Command } from "commander";
import { resolve, basename } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import chokidar from "chokidar";
import { WebSocket } from "ws";
import type {
  CreateProjectRes,
  GameDefinition,
  PutDefinitionReq,
  PutScriptReq,
  ScriptRecord,
  WsServerMsg,
} from "@poc/shared";
import { ensureBuiltins } from "@poc/shared";
import { renderReadme } from "./readmeTemplate.js";
import { bundleSkills } from "./skills.js";
import {
  CAMERA_CONTROLLER_SCRIPT_FILENAME,
  CAMERA_CONTROLLER_SCRIPT_ID,
  CAMERA_CONTROLLER_SCRIPT_SOURCE,
  ENGINE_TYPES_DTS,
  STARTER_SCRIPT_FILENAME,
  STARTER_SCRIPT_ID,
  STARTER_SCRIPT_SOURCE,
  TSCONFIG_JSON,
  buildStarterDefinition,
} from "./starterTemplates.js";

// Public defaults — overridden by env vars or CLI flags. The published binary
// ships pointing at the hosted Genex backend; self-hosters set their own.
const DEFAULT_SERVER = "https://genex-server.onrender.com";
const DEFAULT_EDITOR = "https://genex-pi.vercel.app";
const SERVER_FROM_ENV = process.env.GENEX_SERVER ?? DEFAULT_SERVER;
const EDITOR_FROM_ENV = process.env.GENEX_EDITOR ?? DEFAULT_EDITOR;
const CONFIG = ".genex.json";

interface LocalConfig {
  projectId: string;
  server: string;
}

interface RunOptions {
  dir: string;
  server: string;
  editor: string;
  open: boolean;
  /**
   * `create`: scaffold a fresh project if `.genex.json` is missing, otherwise
   *           re-attach to the existing one.
   * `edit`:   require `.genex.json` to already exist. Errors out if missing
   *           so users get a clear "run `genex create` first" signal.
   */
  mode: "create" | "edit";
}

const program = new Command();
program
  .name("genex")
  .description("Create & sync a Genex project, then open it in the editor.")
  .version("0.4.0");

program
  .command("create [dir]")
  .description("Create a new project in <dir> (or attach if one already exists) and start watching")
  .option("--no-open", "Do not open the editor in the browser")
  .option(
    "--server <url>",
    "Override Genex server URL (also: GENEX_SERVER env)",
    SERVER_FROM_ENV,
  )
  .option(
    "--editor <url>",
    "Override editor URL (also: GENEX_EDITOR env)",
    EDITOR_FROM_ENV,
  )
  .action(async (dir = ".", opts: { open: boolean; server: string; editor: string }) => {
    await runProject({ dir, server: opts.server, editor: opts.editor, open: opts.open, mode: "create" });
  });

program
  .command("edit [dir]")
  .description("Re-attach to an existing project in <dir> and start watching")
  .option("--no-open", "Do not open the editor in the browser")
  .option(
    "--server <url>",
    "Override Genex server URL (also: GENEX_SERVER env)",
    SERVER_FROM_ENV,
  )
  .option(
    "--editor <url>",
    "Override editor URL (also: GENEX_EDITOR env)",
    EDITOR_FROM_ENV,
  )
  .action(async (dir = ".", opts: { open: boolean; server: string; editor: string }) => {
    await runProject({ dir, server: opts.server, editor: opts.editor, open: opts.open, mode: "edit" });
  });

program.parseAsync();

async function runProject({ dir, server: SERVER, editor: EDITOR, open, mode }: RunOptions) {
  const absDir = resolve(process.cwd(), dir);
  const scriptsDir = `${absDir}/scripts`;
  const cfgPath = `${absDir}/${CONFIG}`;
  const defPath = `${absDir}/gameDefinition.json`;
  const readmePath = `${absDir}/README.md`;
  const dtsPath = `${absDir}/engine-types.d.ts`;
  const tsconfigPath = `${absDir}/tsconfig.json`;
  const origin = `cli-${basename(absDir)}-${process.pid}`;
  const hasCfg = existsSync(cfgPath);
  const isFresh = !hasCfg;

  if (mode === "edit" && !hasCfg) {
    console.error(
      `[genex] no ${CONFIG} found in ${absDir}.\n` +
        `        \`genex edit\` only opens existing projects — run \`genex create ${dir}\` first.`,
    );
    process.exit(1);
  }

  await mkdir(scriptsDir, { recursive: true });

  let cfg: LocalConfig | null = hasCfg
    ? (JSON.parse(await readFile(cfgPath, "utf8")) as LocalConfig)
    : null;

  let projectId: string;
  let scripts: ScriptRecord[];
  let definition: GameDefinition;

  if (!cfg) {
    const r = await fetch(`${SERVER}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: basename(absDir) }),
    });
    const body = (await r.json()) as CreateProjectRes;
    projectId = body.projectId;
    definition = body.definition;
    scripts = body.scripts;
    cfg = { projectId, server: SERVER };
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    console.log(`[genex] created project ${projectId}`);
  } else {
    projectId = cfg.projectId;
    // Idempotent upsert. If the server already has this project we get its
    // state back; if the server forgot (or never knew) we send our local
    // files so it can be rehydrated. This makes `genex create`/`edit` survive
    // server restarts and free-tier container churn — local files are the
    // source of truth.
    const localDef = await readLocalDefinition(defPath, projectId, basename(absDir));
    const localScripts = await readLocalScripts(scriptsDir);
    const r = await fetch(`${SERVER}/projects/${projectId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: localDef.name,
        definition: localDef,
        scripts: localScripts,
      }),
    });
    if (!r.ok) {
      console.error(
        `[genex] server rejected project ${projectId} (HTTP ${r.status}). ` +
          `If this keeps happening, check ${SERVER}/healthz.`,
      );
      process.exit(1);
    }
    const body = (await r.json()) as {
      projectId: string;
      definition: GameDefinition;
      scripts: ScriptRecord[];
      restored?: boolean;
    };
    definition = body.definition;
    scripts = body.scripts;
    if (body.restored) {
      console.log(
        `[genex] restored project ${projectId} from local files ` +
          `(${scripts.length} script${scripts.length === 1 ? "" : "s"})`,
      );
    } else {
      console.log(`[genex] attached to project ${projectId}`);
    }
  }

  // Fresh-project seeding -------------------------------------------------
  // On the very first `genex create`, drop in a working sample so the user
  // sees something other than an empty scene. We seed the starter script
  // and a 2-object scene that uses it, then push both to the server so the
  // editor shows them immediately.
  if (isFresh) {
    const seededDef = buildStarterDefinition(definition);
    const ensureScript = async (id: string, source: string) => {
      if (scripts.some((s) => s.id === id)) return;
      const r = await fetch(
        `${SERVER}/projects/${projectId}/scripts/${id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source, origin }),
        },
      );
      if (r.ok) {
        const rec = (await r.json()) as ScriptRecord;
        scripts = [...scripts, rec];
      }
    };
    await ensureScript(STARTER_SCRIPT_ID, STARTER_SCRIPT_SOURCE);
    await ensureScript(CAMERA_CONTROLLER_SCRIPT_ID, CAMERA_CONTROLLER_SCRIPT_SOURCE);
    if (seededDef !== definition) {
      await fetch(`${SERVER}/projects/${projectId}/definition`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ definition: seededDef, origin }),
      });
      definition = seededDef;
    }
    console.log(
      `[genex] seeded starter scene + ${STARTER_SCRIPT_FILENAME} + ${CAMERA_CONTROLLER_SCRIPT_FILENAME}`,
    );
  }

  // Write scripts (don't clobber local changes).
  for (const s of scripts) {
    const p = `${scriptsDir}/${s.filename}`;
    if (!existsSync(p)) await writeFile(p, s.source);
  }

  // Write gameDefinition.json (always overwrite with server state on startup).
  await writeFile(defPath, JSON.stringify(definition, null, 2) + "\n");

  // Write README.md if it's not already there. Don't overwrite — users may
  // have edited it.
  const editorUrl = `${EDITOR}/?projectId=${projectId}`;
  if (!existsSync(readmePath)) {
    await writeFile(readmePath, renderReadme(projectId, editorUrl));
  }

  // Drop ambient TS declarations + tsconfig so IDE IntelliSense works on
  // user scripts without any installs. Only created if absent.
  if (!existsSync(dtsPath)) await writeFile(dtsPath, ENGINE_TYPES_DTS);
  if (!existsSync(tsconfigPath)) await writeFile(tsconfigPath, TSCONFIG_JSON);

  // Drop Three.js / R3F skills into .claude/skills so AI agents working in
  // this folder have the same reference material the editor was built on.
  const skillResult = await bundleSkills(absDir);
  if (skillResult.sourceDir == null) {
    console.warn(
      `[genex] could not find a .claude/skills source dir \u2014 set GENEX_SKILLS_DIR to enable bundling`,
    );
  } else {
    if (skillResult.copied.length > 0) {
      console.log(
        `[genex] copied skills: ${skillResult.copied.join(", ")}`,
      );
    }
    if (skillResult.skipped.length > 0) {
      console.log(
        `[genex] kept existing skills: ${skillResult.skipped.join(", ")}`,
      );
    }
    if (skillResult.missing.length > 0) {
      console.warn(
        `[genex] missing in source: ${skillResult.missing.join(", ")}`,
      );
    }
  }

  await fetch(`${SERVER}/projects/${projectId}/cli`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ absPath: absDir }),
  });
  console.log(`[genex] registered abs path ${absDir}`);

  // ---- Echo suppression --------------------------------------------------
  // When the CLI writes a file to disk in response to a server broadcast,
  // chokidar fires its watcher. We track each path we wrote and the
  // timestamp; the next change event for that path within IGNORE_MS is
  // suppressed.
  const IGNORE_MS = 1500;
  const recentLocalWrites = new Map<string, number>();
  const markLocalWrite = (path: string) =>
    recentLocalWrites.set(path, Date.now());
  const isOwnWrite = (path: string) => {
    const t = recentLocalWrites.get(path);
    if (t == null) return false;
    if (Date.now() - t > IGNORE_MS) {
      recentLocalWrites.delete(path);
      return false;
    }
    return true;
  };

  // The first writeFile of gameDefinition.json above happens before the
  // watcher starts, so it doesn't fire. Subsequent server-driven writes
  // need to be marked.

  // ---- Watcher -----------------------------------------------------------
  const watcher = chokidar.watch(
    [`${scriptsDir}/*.ts`, defPath],
    { usePolling: true, interval: 1000, ignoreInitial: true },
  );

  const pending = new Map<string, NodeJS.Timeout>();
  const debounce = (file: string, fn: () => void) => {
    const prev = pending.get(file);
    if (prev) clearTimeout(prev);
    pending.set(file, setTimeout(fn, 200));
  };

  const uploadScript = async (file: string) => {
    if (isOwnWrite(file)) return;
    const id = basename(file).replace(/\.ts$/, "");
    const source = await readFile(file, "utf8");
    const body: PutScriptReq = { source, origin };
    const r = await fetch(`${SERVER}/projects/${projectId}/scripts/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) console.log(`[genex] synced ${id}.ts`);
    else console.error(`[genex] failed to sync ${id}.ts: ${r.status}`);
  };

  const uploadDefinition = async () => {
    if (isOwnWrite(defPath)) return;
    let parsed: GameDefinition;
    try {
      parsed = JSON.parse(await readFile(defPath, "utf8")) as GameDefinition;
    } catch (err) {
      console.error(`[genex] gameDefinition.json is not valid JSON \u2014 skipping:`, err);
      return;
    }
    const body: PutDefinitionReq = { definition: parsed, origin };
    const r = await fetch(`${SERVER}/projects/${projectId}/definition`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) console.log(`[genex] synced gameDefinition.json`);
    else console.error(`[genex] failed to sync definition: ${r.status}`);
  };

  const onChange = (file: string) => {
    if (file === defPath) debounce(file, uploadDefinition);
    else debounce(file, () => uploadScript(file));
  };
  watcher.on("change", onChange);
  watcher.on("add", onChange);

  // ---- WebSocket subscription -------------------------------------------
  const ws = new WebSocket(`${SERVER.replace(/^http/, "ws")}/ws`);
  ws.on("open", () =>
    ws.send(JSON.stringify({ type: "subscribe", projectId })),
  );
  ws.on("message", async (raw: Buffer | string) => {
    let msg: WsServerMsg;
    try {
      msg = JSON.parse(raw.toString()) as WsServerMsg;
    } catch {
      return;
    }
    switch (msg.type) {
      case "script:created": {
        if (msg.origin === origin) break;
        const p = `${scriptsDir}/${msg.script.filename}`;
        markLocalWrite(p);
        await writeFile(p, msg.script.source);
        console.log(`[genex] received new script ${msg.script.id}.ts`);
        break;
      }
      case "script:updated": {
        if (msg.origin === origin) break;
        const p = `${scriptsDir}/${msg.script.filename}`;
        markLocalWrite(p);
        await writeFile(p, msg.script.source);
        console.log(`[genex] received script update ${msg.script.id}.ts`);
        break;
      }
      case "definition:updated": {
        if (msg.origin === origin) break;
        markLocalWrite(defPath);
        await writeFile(
          defPath,
          JSON.stringify(msg.definition, null, 2) + "\n",
        );
        console.log(`[genex] received definition update`);
        break;
      }
      default:
        break;
    }
  });

  console.log(
    `[genex] watching ${scriptsDir}/*.ts + gameDefinition.json (poll 1s) \u2014 Ctrl+C to stop`,
  );

  // ---- Open the browser --------------------------------------------------
  if (open !== false) {
    openBrowser(editorUrl);
    console.log(`[genex] opened ${editorUrl}`);
  } else {
    console.log(`[genex] editor URL: ${editorUrl}`);
  }

  // `mode` is currently informational for logging only; behaviour differences
  // for `edit` are enforced above (config-required guard).
  void mode;
}

/**
 * Read `gameDefinition.json` from disk if it exists, otherwise return a fresh
 * empty definition. Used to rehydrate a project when the server has forgotten
 * it (e.g. Render free tier rotated containers).
 */
async function readLocalDefinition(
  defPath: string,
  projectId: string,
  fallbackName: string,
): Promise<GameDefinition> {
  if (!existsSync(defPath)) {
    return ensureBuiltins({ projectId, name: fallbackName, objects: [] });
  }
  try {
    const raw = await readFile(defPath, "utf8");
    const parsed = JSON.parse(raw) as GameDefinition;
    parsed.projectId = projectId;
    if (!parsed.name) parsed.name = fallbackName;
    if (!Array.isArray(parsed.objects)) parsed.objects = [];
    return ensureBuiltins(parsed);
  } catch {
    return ensureBuiltins({ projectId, name: fallbackName, objects: [] });
  }
}

/** Read every `scripts/*.ts` file into ScriptRecord shape. */
async function readLocalScripts(scriptsDir: string): Promise<ScriptRecord[]> {
  const { readdir } = await import("node:fs/promises");
  if (!existsSync(scriptsDir)) return [];
  const entries = await readdir(scriptsDir);
  const records: ScriptRecord[] = [];
  for (const filename of entries) {
    if (!filename.endsWith(".ts")) continue;
    const id = filename.slice(0, -3);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) continue;
    const source = await readFile(`${scriptsDir}/${filename}`, "utf8");
    records.push({ id, filename, source, updatedAt: Date.now() });
  }
  return records;
}

function openBrowser(url: string) {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch (err) {
    console.warn(`[genex] could not open browser:`, err);
  }
}
