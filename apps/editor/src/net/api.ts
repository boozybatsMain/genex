import type {
  CreateProjectRes,
  CreateScriptReq,
  ScriptRecord,
  GameDefinition,
  PutDefinitionReq,
  PutScriptReq,
} from "@poc/shared";
import { ORIGIN } from "./origin";
import { SERVER_HTTP } from "./config";

const BASE = SERVER_HTTP;

export async function createProject(name = "PoC Project"): Promise<CreateProjectRes> {
  const r = await fetch(`${BASE}/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return r.json();
}

export async function getProject(id: string) {
  const r = await fetch(`${BASE}/projects/${id}`);
  if (!r.ok) return null;
  return r.json() as Promise<{
    projectId: string;
    definition: GameDefinition;
    scripts: ScriptRecord[];
    cliAbsPath: string | null;
  }>;
}

export async function putDefinition(id: string, definition: GameDefinition) {
  const body: PutDefinitionReq = { definition, origin: ORIGIN };
  await fetch(`${BASE}/projects/${id}/definition`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createScript(
  projectId: string,
  scriptId: string,
): Promise<ScriptRecord> {
  const body: CreateScriptReq & { origin: string } = {
    id: scriptId,
    origin: ORIGIN,
  };
  const r = await fetch(`${BASE}/projects/${projectId}/scripts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function putScriptSource(
  projectId: string,
  scriptId: string,
  source: string,
) {
  const body: PutScriptReq = { source, origin: ORIGIN };
  await fetch(`${BASE}/projects/${projectId}/scripts/${scriptId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
