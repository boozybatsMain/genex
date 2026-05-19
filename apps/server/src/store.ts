import { nanoid } from "nanoid";
import type { GameDefinition, ProjectSummary, ScriptRecord } from "@poc/shared";

interface ProjectState {
  summary: ProjectSummary;
  definition: GameDefinition;
  scripts: Map<string, ScriptRecord>;
}

const projects = new Map<string, ProjectState>();

export function createProject(name = "Untitled"): ProjectState {
  const projectId = nanoid(8);
  const state: ProjectState = {
    summary: { projectId, name, cliAbsPath: null },
    definition: { projectId, name, objects: [] },
    scripts: new Map(),
  };
  projects.set(projectId, state);
  return state;
}

/**
 * Idempotent upsert keyed by a caller-supplied projectId. Used by the CLI to
 * rehydrate a project on a fresh server (or restored from local files) — the
 * source of truth is whatever lives on disk in the user's project folder. If
 * the project already exists in memory we skip the rehydrate and return the
 * server's copy so concurrent edits aren't clobbered.
 */
export function ensureProject(args: {
  projectId: string;
  name: string;
  definition?: GameDefinition;
  scripts?: ScriptRecord[];
}): { state: ProjectState; created: boolean } {
  const existing = projects.get(args.projectId);
  if (existing) return { state: existing, created: false };

  const definition: GameDefinition = args.definition ?? {
    projectId: args.projectId,
    name: args.name,
    objects: [],
  };
  // Defend against clients that sent a definition with a stale projectId.
  definition.projectId = args.projectId;

  const scripts = new Map<string, ScriptRecord>();
  if (args.scripts) {
    for (const s of args.scripts) {
      scripts.set(s.id, {
        id: s.id,
        filename: s.filename ?? `${s.id}.ts`,
        source: s.source,
        updatedAt: s.updatedAt ?? Date.now(),
      });
    }
  }

  const state: ProjectState = {
    summary: { projectId: args.projectId, name: args.name, cliAbsPath: null },
    definition,
    scripts,
  };
  projects.set(args.projectId, state);
  return { state, created: true };
}

export function getProject(id: string) {
  return projects.get(id);
}

export function listScripts(id: string): ScriptRecord[] {
  return Array.from(projects.get(id)?.scripts.values() ?? []);
}

export function upsertScript(projectId: string, id: string, source: string): ScriptRecord {
  const p = projects.get(projectId);
  if (!p) throw new Error("no such project");
  const rec: ScriptRecord = {
    id,
    filename: `${id}.ts`,
    source,
    updatedAt: Date.now(),
  };
  p.scripts.set(id, rec);
  return rec;
}

export function setCliPath(projectId: string, absPath: string) {
  const p = projects.get(projectId);
  if (!p) throw new Error("no such project");
  p.summary.cliAbsPath = absPath;
}
