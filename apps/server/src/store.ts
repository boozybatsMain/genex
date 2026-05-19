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
