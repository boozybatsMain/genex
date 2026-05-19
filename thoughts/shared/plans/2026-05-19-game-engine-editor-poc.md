---
date: 2026-05-19
researcher: boozybats
git_commit: (not a git repository — greenfield)
branch: (n/a)
repository: poc-modules
topic: "Minimal browser-based Three.js game engine editor PoC"
tags: [plan, threejs, r3f, editor, runtime, cli, hot-reload]
status: draft
last_updated: 2026-05-19
last_updated_by: boozybats
---

# Game Engine Editor PoC Implementation Plan

## Overview

A browser-based, Unity-lite game engine editor proof of concept that validates four things end-to-end:

1. A **runtime architecture** with an Edit Mode / Play Mode separation.
2. A **serialization model** (`GameDefinition`) that is the single source of truth and can fully reconstruct a runtime scene.
3. A **remote-to-local script workflow** where users edit `.ts` files in their own IDE without owning the engine source.
4. A **live sync concept** where a local file watcher hot-reloads changed scripts into the running browser editor.

The deliverable is three coordinated apps in an npm-workspaces monorepo: a Vite/React/R3F editor, an Express+ws sync server, and a `genex` CLI.

## Current State Analysis

The repo is greenfield — only a `.claude/` config directory exists. There is no `package.json`, no source code, no build configuration. Every file in this plan is new.

## Desired End State

After all phases are complete, the following workflow works end-to-end:

1. Developer runs `npm run dev` at the repo root → editor app on `http://localhost:5173`, sync server on `http://localhost:5174`, WebSocket on `ws://localhost:5174/ws`.
2. They open the editor in a browser. A default project is created on the server and a `projectId` is stored in the editor's `localStorage`.
3. They click **Add Object** in the hierarchy → an empty object appears. They open the inspector, give it a name, change the mesh dropdown from `(none)` to `Cube`, tweak transform fields. The R3F scene updates live.
4. They click **Add Script** in the inspector → server seeds a templated `PlayerController.ts`, returns the `scriptId`. The script reference appears on the object.
5. In another terminal they run `genex create ./game-scripts` → CLI POSTs to the server, receives the `projectId` (already created by the editor) plus all current scripts, writes flat `.ts` files into `./game-scripts/`, starts a chokidar watcher, and registers its absolute path with the server.
6. Clicking the script name in the inspector opens `vscode://file/<abs-path>/PlayerController.ts` in VS Code.
7. The developer edits `PlayerController.ts` and saves. The watcher PUTs the new source to the server. The server broadcasts a `script:updated` WS message. The editor revokes the old blob URL, creates a new one, re-instantiates the class on every object that references it — only if currently in Play Mode (Edit Mode just stores the latest source).
8. Pressing **Tab** toggles between Edit and Play Mode. Entering Play Mode deep-clones the `GameDefinition`, builds a runtime scene from the clone, calls `start()` on every script instance, and begins ticking `update(dt)` every frame. Exiting Play Mode disposes the runtime scene, rebuilds from the original `GameDefinition`, and returns to Edit Mode.

### Key Discoveries

- The repo has zero existing infrastructure — no constraints to work around.
- `.claude/.mcp.json` references `next-devtools-mcp`, but this PoC is not a Next.js app; that MCP is unrelated.
- The `threejs` skill at `.claude/skills/threejs/SKILL.md` provides the canonical Three.js patterns; the `r3f-fundamentals` and related skills cover React Three Fiber idioms — these will be referenced during Phase 3.

## What We're NOT Doing

- No authentication / users / permissions.
- No real database. Server state is in-memory (lost on restart). The editor mirrors state to `localStorage` so a browser reload survives.
- No multi-user collaboration. One editor session, one CLI, per project at a time.
- No graphics polish, no PBR materials, no shadows tuning, no post-processing.
- No gizmos / orbit-controls scene manipulation in 3D. Transforms are edited as numeric inputs only.
- No undo/redo.
- No production hot reload (no source maps preservation, no module-graph dependency tracking — scripts are isolated, no `import` between user scripts).
- No asset pipeline (no texture loading, no GLTF import, no audio).
- No TypeScript compilation in the browser. Scripts are authored as `.ts` for IDE ergonomics, but the **type stripping** in the browser is naive: we run sources through `sucrase`'s `imports`+`typescript` transform (or `esbuild-wasm` if simpler). No real type-checking — the file just has to be syntactically valid TS that becomes valid JS after stripping types.
- No bundler involvement for user scripts. Each script is an isolated ES module loaded from a `blob:` URL.
- No optimization (no instancing, no LOD, no frustum-cull tuning).

## Implementation Approach

**Strategy**: Bottom-up. Build the shared contract first (types + wire protocol), then the server that owns those contracts, then the editor that consumes them, then the CLI that mirrors the editor's view of the project to disk. This ordering means each layer can be tested in isolation before the layer above is wired up.

**Key invariants** that hold across all phases:

- `GameDefinition` is the single source of truth. The R3F scene, the runtime, and the inspector all derive from it.
- Scripts live in a **separate** registry from `GameDefinition`. Objects reference scripts by `scriptId` only. This lets the CLI sync scripts without touching scene data.
- `scriptId` is the filename without `.ts`, e.g. `PlayerController`. The filename is the identity.
- The server is the authority for script source. The editor and CLI are both clients that mirror it.
- All wire messages and shapes live in `packages/shared` and are imported by all three apps.

---

## Phase 1: Monorepo scaffold + shared contracts

### Overview
Stand up npm workspaces, create the four package skeletons, and define the `GameDefinition` schema and WebSocket/REST message types that everything else depends on.

### Changes Required

#### 1. Root workspace

**File**: `package.json`

```json
{
  "name": "poc-modules",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm-run-all --parallel dev:server dev:editor",
    "dev:editor": "npm --workspace apps/editor run dev",
    "dev:server": "npm --workspace apps/server run dev",
    "build": "npm-run-all --sequential build:shared build:editor build:server build:cli",
    "build:shared": "npm --workspace packages/shared run build",
    "build:editor": "npm --workspace apps/editor run build",
    "build:server": "npm --workspace apps/server run build",
    "build:cli": "npm --workspace apps/cli run build"
  },
  "devDependencies": {
    "npm-run-all": "^4.1.5",
    "typescript": "^5.5.0"
  }
}
```

**File**: `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "lib": ["ES2022", "DOM"]
  }
}
```

**File**: `.gitignore`

```
node_modules
dist
*.log
.DS_Store
.genex.json
```

#### 2. Shared contracts package

**File**: `packages/shared/package.json`

```json
{
  "name": "@poc/shared",
  "version": "0.0.1",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  }
}
```

**File**: `packages/shared/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "declaration": true },
  "include": ["src"]
}
```

**File**: `packages/shared/src/index.ts`

```ts
export type MeshType = "none" | "cube" | "sphere" | "cylinder";

export interface Vec3 { x: number; y: number; z: number; }

export interface Transform {
  position: Vec3;
  rotation: Vec3; // Euler XYZ radians
  scale: Vec3;
}

export interface GameObjectDef {
  id: string;
  name: string;
  transform: Transform;
  meshType: MeshType;
  scriptIds: string[];
}

export interface GameDefinition {
  projectId: string;
  name: string;
  objects: GameObjectDef[];
}

export interface ScriptRecord {
  id: string;          // e.g. "PlayerController"
  filename: string;    // e.g. "PlayerController.ts"
  source: string;
  updatedAt: number;
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  cliAbsPath: string | null; // set by CLI on registration
}

// ---- Wire types ----

export interface CreateProjectReq { name?: string; }
export interface CreateProjectRes {
  projectId: string;
  definition: GameDefinition;
  scripts: ScriptRecord[];
}

export interface RegisterCliReq { absPath: string; }
export interface RegisterCliRes { ok: true; }

export interface PutScriptReq { source: string; }
export interface CreateScriptReq { id: string; }

export type WsServerMsg =
  | { type: "hello"; projectId: string }
  | { type: "script:updated"; script: ScriptRecord }
  | { type: "script:created"; script: ScriptRecord }
  | { type: "cli:registered"; absPath: string }
  | { type: "cli:disconnected" };

export type WsClientMsg = { type: "subscribe"; projectId: string };

export const DEFAULT_SCRIPT_TEMPLATE = (id: string) => `// ${id}.ts
// Runs while in Play Mode. Edit this file in your IDE \u2014 changes hot-reload.

export default class ${id} {
  start() {
    console.log("[${id}] start");
  }

  update(dt: number) {
    // dt is seconds since last frame
  }
}
`;
```

### Success Criteria

#### Automated Verification
- [x] `npm install` at the repo root completes without errors.
- [x] `npm --workspace packages/shared run build` produces `packages/shared/dist/index.js` and `index.d.ts`.
- [x] `npx tsc -p packages/shared/tsconfig.json --noEmit` passes.

#### Manual Verification
- [ ] Directory layout matches the structure documented above.

**Implementation Note**: After Phase 1, stop and confirm `npm install` works before moving on.

---

## Phase 2: Sync server (REST + WebSocket)

### Overview
Express HTTP server on port `5174` that owns the in-memory project registry, the script registry, and the WebSocket broadcast hub.

### Changes Required

#### 1. Server package

**File**: `apps/server/package.json`

```json
{
  "name": "@poc/server",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@poc/shared": "*",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "ws": "^8.18.0",
    "nanoid": "^5.0.7"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/ws": "^8.5.10",
    "tsx": "^4.16.0"
  }
}
```

**File**: `apps/server/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "module": "ESNext", "moduleResolution": "Bundler" },
  "include": ["src"]
}
```

#### 2. In-memory stores

**File**: `apps/server/src/store.ts`

```ts
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
  const existing = p.scripts.get(id);
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
```

#### 3. HTTP routes + WebSocket hub

**File**: `apps/server/src/index.ts`

```ts
import express from "express";
import cors from "cors";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import {
  DEFAULT_SCRIPT_TEMPLATE,
  type CreateProjectReq, type CreateProjectRes,
  type CreateScriptReq, type PutScriptReq,
  type RegisterCliReq, type WsServerMsg,
} from "@poc/shared";
import {
  createProject, getProject, listScripts, setCliPath, upsertScript,
} from "./store.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const subscribers = new Map<string, Set<WebSocket>>();
function broadcast(projectId: string, msg: WsServerMsg) {
  const set = subscribers.get(projectId);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(data);
}

app.post("/projects", (req, res) => {
  const body = req.body as CreateProjectReq;
  const p = createProject(body?.name);
  const reply: CreateProjectRes = {
    projectId: p.summary.projectId,
    definition: p.definition,
    scripts: Array.from(p.scripts.values()),
  };
  res.json(reply);
});

app.get("/projects/:id", (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return res.status(404).end();
  res.json({
    projectId: p.summary.projectId,
    definition: p.definition,
    scripts: Array.from(p.scripts.values()),
    cliAbsPath: p.summary.cliAbsPath,
  });
});

app.put("/projects/:id/definition", (req, res) => {
  const p = getProject(req.params.id);
  if (!p) return res.status(404).end();
  p.definition = req.body;
  res.json({ ok: true });
});

app.post("/projects/:id/scripts", (req, res) => {
  const { id } = req.body as CreateScriptReq;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) {
    return res.status(400).json({ error: "invalid script id" });
  }
  const p = getProject(req.params.id);
  if (!p) return res.status(404).end();
  if (p.scripts.has(id)) return res.status(409).json({ error: "exists" });
  const rec = upsertScript(req.params.id, id, DEFAULT_SCRIPT_TEMPLATE(id));
  broadcast(req.params.id, { type: "script:created", script: rec });
  res.json(rec);
});

app.put("/projects/:id/scripts/:scriptId", (req, res) => {
  const { source } = req.body as PutScriptReq;
  const rec = upsertScript(req.params.id, req.params.scriptId, source);
  broadcast(req.params.id, { type: "script:updated", script: rec });
  res.json(rec);
});

app.get("/projects/:id/scripts", (req, res) => {
  res.json(listScripts(req.params.id));
});

app.post("/projects/:id/cli", (req, res) => {
  const { absPath } = req.body as RegisterCliReq;
  setCliPath(req.params.id, absPath);
  broadcast(req.params.id, { type: "cli:registered", absPath });
  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  let currentProject: string | null = null;
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "subscribe" && typeof msg.projectId === "string") {
        currentProject = msg.projectId;
        if (!subscribers.has(currentProject)) subscribers.set(currentProject, new Set());
        subscribers.get(currentProject)!.add(ws);
        ws.send(JSON.stringify({ type: "hello", projectId: currentProject } satisfies WsServerMsg));
      }
    } catch { /* ignore malformed */ }
  });
  ws.on("close", () => {
    if (currentProject) subscribers.get(currentProject)?.delete(ws);
  });
});

const PORT = 5174;
server.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
```

### Success Criteria

#### Automated Verification
- [x] `npm --workspace apps/server run build` produces `dist/index.js` with no type errors.
- [x] Server starts: `npm --workspace apps/server run dev` logs `[server] http://localhost:5174` within 3 seconds.
- [x] `curl -X POST http://localhost:5174/projects -H 'content-type: application/json' -d '{"name":"Test"}'` returns `{ projectId, definition, scripts: [] }`.
- [x] `curl -X POST http://localhost:5174/projects/<id>/scripts -H 'content-type: application/json' -d '{"id":"Foo"}'` returns a `ScriptRecord` with the default template as `source`.
- [x] `curl -X PUT http://localhost:5174/projects/<id>/scripts/Foo -H 'content-type: application/json' -d '{"source":"hi"}'` returns 200; a second GET shows `source: "hi"`.

#### Manual Verification
- [ ] Connect to `ws://localhost:5174/ws` with `wscat`, send `{"type":"subscribe","projectId":"<id>"}`, then `PUT` a script in another terminal — the WS connection receives a `script:updated` payload.

**Implementation Note**: Pause here and confirm the curl + wscat smoke tests pass before proceeding.

---

## Phase 3: Editor — Edit Mode (UI, scene, GameDefinition store)

### Overview
Vite + React + TypeScript app with three panels (hierarchy left, R3F viewport center, inspector right). Edit-only behavior: create objects, edit name/transform/mesh, persist `GameDefinition` to server + localStorage.

### Changes Required

#### 1. Editor package

**File**: `apps/editor/package.json`

```json
{
  "name": "@poc/editor",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@poc/shared": "*",
    "@react-three/fiber": "^8.17.0",
    "@react-three/drei": "^9.108.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.166.0",
    "zustand": "^4.5.4",
    "nanoid": "^5.0.7"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@types/three": "^0.166.0",
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.3.0"
  }
}
```

**File**: `apps/editor/vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

**File**: `apps/editor/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

**File**: `apps/editor/index.html`

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>PoC Editor</title></head>
  <body style="margin:0;background:#1e1e1e;color:#ddd;font-family:system-ui">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

#### 2. State store (Zustand)

**File**: `apps/editor/src/state/store.ts`

```ts
import { create } from "zustand";
import { nanoid } from "nanoid";
import type { GameDefinition, GameObjectDef, MeshType, ScriptRecord, Transform } from "@poc/shared";

export type Mode = "edit" | "play";

interface EditorState {
  projectId: string | null;
  definition: GameDefinition | null;
  scripts: Map<string, ScriptRecord>;
  cliAbsPath: string | null;
  selectedId: string | null;
  mode: Mode;

  setProject: (def: GameDefinition, scripts: ScriptRecord[], cliAbsPath: string | null) => void;
  upsertScript: (s: ScriptRecord) => void;
  setCliAbsPath: (p: string | null) => void;

  addObject: () => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  patchObject: (id: string, patch: Partial<Omit<GameObjectDef, "id">>) => void;
  attachScript: (objectId: string, scriptId: string) => void;
  detachScript: (objectId: string, scriptId: string) => void;

  setMode: (m: Mode) => void;
}

const defaultTransform = (): Transform => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

export const useEditor = create<EditorState>((set, get) => ({
  projectId: null,
  definition: null,
  scripts: new Map(),
  cliAbsPath: null,
  selectedId: null,
  mode: "edit",

  setProject: (definition, scripts, cliAbsPath) =>
    set({
      projectId: definition.projectId,
      definition,
      scripts: new Map(scripts.map((s) => [s.id, s])),
      cliAbsPath,
    }),

  upsertScript: (s) =>
    set((st) => {
      const next = new Map(st.scripts);
      next.set(s.id, s);
      return { scripts: next };
    }),

  setCliAbsPath: (p) => set({ cliAbsPath: p }),

  addObject: () =>
    set((st) => {
      if (!st.definition) return st;
      const obj: GameObjectDef = {
        id: nanoid(6),
        name: `Object ${st.definition.objects.length + 1}`,
        transform: defaultTransform(),
        meshType: "cube" as MeshType,
        scriptIds: [],
      };
      return {
        definition: { ...st.definition, objects: [...st.definition.objects, obj] },
        selectedId: obj.id,
      };
    }),

  removeObject: (id) =>
    set((st) => ({
      definition: st.definition
        ? { ...st.definition, objects: st.definition.objects.filter((o) => o.id !== id) }
        : null,
      selectedId: st.selectedId === id ? null : st.selectedId,
    })),

  selectObject: (id) => set({ selectedId: id }),

  patchObject: (id, patch) =>
    set((st) => ({
      definition: st.definition
        ? {
            ...st.definition,
            objects: st.definition.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
          }
        : null,
    })),

  attachScript: (objectId, scriptId) =>
    set((st) => ({
      definition: st.definition
        ? {
            ...st.definition,
            objects: st.definition.objects.map((o) =>
              o.id === objectId && !o.scriptIds.includes(scriptId)
                ? { ...o, scriptIds: [...o.scriptIds, scriptId] }
                : o,
            ),
          }
        : null,
    })),

  detachScript: (objectId, scriptId) =>
    set((st) => ({
      definition: st.definition
        ? {
            ...st.definition,
            objects: st.definition.objects.map((o) =>
              o.id === objectId ? { ...o, scriptIds: o.scriptIds.filter((s) => s !== scriptId) } : o,
            ),
          }
        : null,
    })),

  setMode: (mode) => set({ mode }),
}));
```

#### 3. Server client + bootstrap

**File**: `apps/editor/src/net/api.ts`

```ts
import type {
  CreateProjectRes, CreateScriptReq, ScriptRecord, GameDefinition,
} from "@poc/shared";

const BASE = "http://localhost:5174";

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
    projectId: string; definition: GameDefinition;
    scripts: ScriptRecord[]; cliAbsPath: string | null;
  }>;
}

export async function putDefinition(id: string, def: GameDefinition) {
  await fetch(`${BASE}/projects/${id}/definition`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(def),
  });
}

export async function createScript(projectId: string, scriptId: string): Promise<ScriptRecord> {
  const body: CreateScriptReq = { id: scriptId };
  const r = await fetch(`${BASE}/projects/${projectId}/scripts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
```

**File**: `apps/editor/src/net/ws.ts`

```ts
import type { WsServerMsg } from "@poc/shared";
import { useEditor } from "../state/store";

export function connectWs(projectId: string) {
  const ws = new WebSocket("ws://localhost:5174/ws");
  ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", projectId }));
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data) as WsServerMsg;
    const st = useEditor.getState();
    if (msg.type === "script:updated" || msg.type === "script:created") {
      st.upsertScript(msg.script);
    } else if (msg.type === "cli:registered") {
      st.setCliAbsPath(msg.absPath);
    } else if (msg.type === "cli:disconnected") {
      st.setCliAbsPath(null);
    }
  };
  ws.onclose = () => setTimeout(() => connectWs(projectId), 1000);
  return ws;
}
```

#### 4. Layout + panels

**File**: `apps/editor/src/main.tsx`

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
```

**File**: `apps/editor/src/App.tsx`

```tsx
import { useEffect } from "react";
import { useEditor } from "./state/store";
import { createProject, getProject, putDefinition } from "./net/api";
import { connectWs } from "./net/ws";
import { Hierarchy } from "./ui/Hierarchy";
import { Inspector } from "./ui/Inspector";
import { Viewport } from "./ui/Viewport";
import { Toolbar } from "./ui/Toolbar";

const LS_KEY = "poc.projectId";

export function App() {
  const { projectId, definition, setProject, mode, setMode } = useEditor();

  useEffect(() => {
    (async () => {
      const existing = localStorage.getItem(LS_KEY);
      if (existing) {
        const res = await getProject(existing);
        if (res) {
          setProject(res.definition, res.scripts, res.cliAbsPath);
          connectWs(existing);
          return;
        }
      }
      const res = await createProject();
      localStorage.setItem(LS_KEY, res.projectId);
      setProject(res.definition, res.scripts, null);
      connectWs(res.projectId);
    })();
  }, []);

  // Debounced server sync of definition
  useEffect(() => {
    if (!projectId || !definition) return;
    const t = setTimeout(() => putDefinition(projectId, definition), 250);
    return () => clearTimeout(t);
  }, [projectId, definition]);

  // Tab to toggle modes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setMode(mode === "edit" ? "play" : "edit");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, setMode]);

  if (!definition) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ display: "grid", gridTemplateRows: "32px 1fr",
                  gridTemplateColumns: "240px 1fr 320px", height: "100vh" }}>
      <div style={{ gridColumn: "1 / span 3", borderBottom: "1px solid #333" }}>
        <Toolbar />
      </div>
      <aside style={{ borderRight: "1px solid #333", overflow: "auto" }}>
        <Hierarchy />
      </aside>
      <main><Viewport /></main>
      <aside style={{ borderLeft: "1px solid #333", overflow: "auto" }}>
        <Inspector />
      </aside>
    </div>
  );
}
```

**File**: `apps/editor/src/ui/Toolbar.tsx`

```tsx
import { useEditor } from "../state/store";

export function Toolbar() {
  const { mode, setMode, cliAbsPath, projectId } = useEditor();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 8px", height: "100%" }}>
      <strong>PoC Editor</strong>
      <button onClick={() => setMode(mode === "edit" ? "play" : "edit")}>
        {mode === "edit" ? "▶ Play (Tab)" : "■ Stop (Tab)"}
      </button>
      <span style={{ opacity: 0.7 }}>mode: {mode}</span>
      <span style={{ opacity: 0.7, marginLeft: "auto" }}>
        project: {projectId ?? "—"} | CLI: {cliAbsPath ?? "not connected"}
      </span>
    </div>
  );
}
```

**File**: `apps/editor/src/ui/Hierarchy.tsx`

```tsx
import { useEditor } from "../state/store";

export function Hierarchy() {
  const { definition, selectedId, selectObject, addObject, removeObject } = useEditor();
  if (!definition) return null;
  return (
    <div style={{ padding: 8 }}>
      <button onClick={addObject}>+ Add Object</button>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
        {definition.objects.map((o) => (
          <li key={o.id}
              onClick={() => selectObject(o.id)}
              style={{
                padding: "4px 6px", cursor: "pointer",
                background: o.id === selectedId ? "#264f78" : "transparent",
              }}>
            {o.name}
            <button style={{ float: "right" }}
                    onClick={(e) => { e.stopPropagation(); removeObject(o.id); }}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**File**: `apps/editor/src/ui/Inspector.tsx`

```tsx
import type { MeshType, GameObjectDef } from "@poc/shared";
import { useEditor } from "../state/store";

const MESH_TYPES: MeshType[] = ["none", "cube", "sphere", "cylinder"];

export function Inspector() {
  const { definition, selectedId, patchObject } = useEditor();
  if (!definition) return null;
  const obj = definition.objects.find((o) => o.id === selectedId);
  if (!obj) return <div style={{ padding: 8, opacity: 0.6 }}>No selection</div>;

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 12 }}>
      <Field label="Name">
        <input value={obj.name}
               onChange={(e) => patchObject(obj.id, { name: e.target.value })}/>
      </Field>
      <Field label="Mesh">
        <select value={obj.meshType}
                onChange={(e) => patchObject(obj.id, { meshType: e.target.value as MeshType })}>
          {MESH_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <Vec3Field label="Position" obj={obj} field="position" />
      <Vec3Field label="Rotation" obj={obj} field="rotation" />
      <Vec3Field label="Scale" obj={obj} field="scale" />
      {/* Scripts section will be added in Phase 5 */}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{label}</span>
      {children}
    </label>
  );
}

function Vec3Field({ obj, field, label }:
  { obj: GameObjectDef; field: "position" | "rotation" | "scale"; label: string }) {
  const { patchObject } = useEditor();
  const v = obj.transform[field];
  return (
    <Field label={label}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
        {(["x","y","z"] as const).map((axis) => (
          <input key={axis} type="number" step="0.1" value={v[axis]}
                 onChange={(e) => patchObject(obj.id, {
                   transform: { ...obj.transform, [field]: { ...v, [axis]: Number(e.target.value) } },
                 })}/>
        ))}
      </div>
    </Field>
  );
}
```

#### 5. R3F viewport

**File**: `apps/editor/src/ui/Viewport.tsx`

```tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useEditor } from "../state/store";
import { SceneObject } from "./SceneObject";

export function Viewport() {
  const { definition } = useEditor();
  return (
    <Canvas camera={{ position: [4, 4, 4], fov: 50 }} style={{ background: "#222" }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      <Grid args={[20, 20]} cellColor="#444" sectionColor="#666" infiniteGrid />
      <OrbitControls makeDefault />
      {definition?.objects.map((o) => <SceneObject key={o.id} object={o} />)}
    </Canvas>
  );
}
```

**File**: `apps/editor/src/ui/SceneObject.tsx`

```tsx
import type { GameObjectDef } from "@poc/shared";
import { useEditor } from "../state/store";

export function SceneObject({ object }: { object: GameObjectDef }) {
  const { selectedId, selectObject } = useEditor();
  const selected = object.id === selectedId;
  const { position, rotation, scale } = object.transform;

  return (
    <group
      position={[position.x, position.y, position.z]}
      rotation={[rotation.x, rotation.y, rotation.z]}
      scale={[scale.x, scale.y, scale.z]}
      onClick={(e) => { e.stopPropagation(); selectObject(object.id); }}
    >
      {object.meshType === "cube" && (
        <mesh><boxGeometry /><meshStandardMaterial color={selected ? "#ffaa00" : "#88aaff"} /></mesh>
      )}
      {object.meshType === "sphere" && (
        <mesh><sphereGeometry args={[0.5, 24, 16]} /><meshStandardMaterial color={selected ? "#ffaa00" : "#88aaff"} /></mesh>
      )}
      {object.meshType === "cylinder" && (
        <mesh><cylinderGeometry args={[0.5, 0.5, 1, 24]} /><meshStandardMaterial color={selected ? "#ffaa00" : "#88aaff"} /></mesh>
      )}
    </group>
  );
}
```

### Success Criteria

#### Automated Verification
- [x] `npm --workspace apps/editor run build` succeeds with no TS errors.
- [x] `npx tsc -p apps/editor/tsconfig.json --noEmit` passes.

#### Manual Verification
- [ ] Open `http://localhost:5173`: editor loads with empty hierarchy, grid visible, toolbar shows a `projectId`.
- [ ] Click **+ Add Object** → object appears in hierarchy and as a cube in the scene.
- [ ] Click the object in hierarchy → inspector shows name/transform/mesh fields; the object turns orange in the viewport.
- [ ] Change mesh dropdown to `sphere` → scene updates immediately.
- [ ] Change a transform field → object moves/rotates/scales live.
- [ ] Reload the page → the same project (same `projectId` in toolbar) and objects are restored from the server.
- [ ] `curl http://localhost:5174/projects/<id>` returns the same definition as shown in the editor.

**Implementation Note**: Pause here. The editor should be fully usable in Edit Mode before adding the runtime.

---

## Phase 4: Play Mode + script runtime + hot reload

### Overview
Add a runtime layer that, when Play Mode activates, deep-clones the `GameDefinition`, builds a parallel runtime scene, loads and instantiates scripts via dynamic `import()` of blob URLs, and ticks them every frame. WebSocket `script:updated` messages cause live re-instantiation while in Play Mode.

### Changes Required

#### 1. TS-to-JS stripping in the browser

Add `sucrase` to the editor: `"sucrase": "^3.35.0"`.

**File**: `apps/editor/src/runtime/transpile.ts`

```ts
import { transform } from "sucrase";

export function stripTs(src: string): string {
  return transform(src, {
    transforms: ["typescript"],
    disableESTransforms: true,
  }).code;
}
```

#### 2. Script module loader (blob-URL based, with cache invalidation)

**File**: `apps/editor/src/runtime/scriptLoader.ts`

```ts
import type { ScriptRecord } from "@poc/shared";
import { stripTs } from "./transpile";

export interface ScriptCtor {
  new (object: RuntimeObjectHandle): { start?: () => void; update?: (dt: number) => void };
}

export interface RuntimeObjectHandle {
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

const cache = new Map<string, { url: string; ctor: ScriptCtor; version: number }>();

export async function loadScript(rec: ScriptRecord): Promise<ScriptCtor> {
  const existing = cache.get(rec.id);
  if (existing && existing.version === rec.updatedAt) return existing.ctor;
  if (existing) URL.revokeObjectURL(existing.url);

  const js = stripTs(rec.source);
  const blob = new Blob([js], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const mod = await import(/* @vite-ignore */ url);
  const ctor: ScriptCtor = mod.default;
  if (typeof ctor !== "function") throw new Error(`Script ${rec.id} has no default export class`);

  cache.set(rec.id, { url, ctor, version: rec.updatedAt });
  return ctor;
}

export function invalidateScript(id: string) {
  const c = cache.get(id);
  if (c) { URL.revokeObjectURL(c.url); cache.delete(id); }
}
```

#### 3. Runtime world

**File**: `apps/editor/src/runtime/RuntimeWorld.ts`

```ts
import type { GameDefinition, ScriptRecord } from "@poc/shared";
import { loadScript, RuntimeObjectHandle } from "./scriptLoader";

interface RuntimeObject {
  id: string;
  handle: RuntimeObjectHandle;
  scriptInstances: Map<string, { start?: () => void; update?: (dt: number) => void }>;
}

export class RuntimeWorld {
  private objects = new Map<string, RuntimeObject>();
  private running = false;
  private rafId: number | null = null;
  private lastT = 0;
  private listeners = new Set<(snapshot: GameDefinition) => void>();

  constructor(private def: GameDefinition, private scripts: Map<string, ScriptRecord>) {}

  async start() {
    for (const o of this.def.objects) {
      const handle: RuntimeObjectHandle = {
        name: o.name,
        position: { ...o.transform.position },
        rotation: { ...o.transform.rotation },
        scale: { ...o.transform.scale },
      };
      const ro: RuntimeObject = { id: o.id, handle, scriptInstances: new Map() };
      for (const sid of o.scriptIds) {
        const rec = this.scripts.get(sid);
        if (!rec) continue;
        const Ctor = await loadScript(rec);
        const inst = new Ctor(handle);
        inst.start?.();
        ro.scriptInstances.set(sid, inst);
      }
      this.objects.set(o.id, ro);
    }
    this.running = true;
    this.lastT = performance.now();
    const tick = (t: number) => {
      if (!this.running) return;
      const dt = Math.min((t - this.lastT) / 1000, 0.1);
      this.lastT = t;
      for (const ro of this.objects.values()) {
        for (const inst of ro.scriptInstances.values()) inst.update?.(dt);
      }
      this.emit();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.objects.clear();
  }

  async reloadScript(rec: ScriptRecord) {
    this.scripts.set(rec.id, rec);
    const Ctor = await loadScript(rec);
    for (const ro of this.objects.values()) {
      if (!ro.scriptInstances.has(rec.id)) continue;
      const inst = new Ctor(ro.handle);
      inst.start?.();
      ro.scriptInstances.set(rec.id, inst);
    }
  }

  subscribe(cb: (snapshot: GameDefinition) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit() {
    const snapshot: GameDefinition = {
      ...this.def,
      objects: this.def.objects.map((o) => {
        const ro = this.objects.get(o.id);
        if (!ro) return o;
        return {
          ...o,
          transform: {
            position: { ...ro.handle.position },
            rotation: { ...ro.handle.rotation },
            scale: { ...ro.handle.scale },
          },
        };
      }),
    };
    for (const cb of this.listeners) cb(snapshot);
  }
}
```

#### 4. Runtime view in the viewport

Add a runtime snapshot slice to the store and a runtime ref. **File**: `apps/editor/src/state/store.ts` — extend:

```ts
// Add to EditorState:
runtimeSnapshot: GameDefinition | null;
setRuntimeSnapshot: (d: GameDefinition | null) => void;
// And in the create() body:
runtimeSnapshot: null,
setRuntimeSnapshot: (runtimeSnapshot) => set({ runtimeSnapshot }),
```

Update `Viewport.tsx` to render from `runtimeSnapshot` when `mode === "play"`:

```tsx
const { definition, runtimeSnapshot, mode } = useEditor();
const view = mode === "play" && runtimeSnapshot ? runtimeSnapshot : definition;
```

#### 5. Mode controller

**File**: `apps/editor/src/runtime/useRuntime.ts`

```ts
import { useEffect, useRef } from "react";
import { useEditor } from "../state/store";
import { RuntimeWorld } from "./RuntimeWorld";
import { invalidateScript } from "./scriptLoader";
import type { WsServerMsg } from "@poc/shared";

export function useRuntime() {
  const worldRef = useRef<RuntimeWorld | null>(null);
  const { mode, definition, scripts, setRuntimeSnapshot } = useEditor();

  useEffect(() => {
    if (mode !== "play" || !definition) return;
    const cloned: typeof definition = JSON.parse(JSON.stringify(definition));
    const w = new RuntimeWorld(cloned, new Map(scripts));
    worldRef.current = w;
    const unsub = w.subscribe(setRuntimeSnapshot);
    w.start();
    return () => {
      unsub();
      w.stop();
      worldRef.current = null;
      setRuntimeSnapshot(null);
    };
  }, [mode]);

  // Hot-reload: react to scripts map changes while running
  useEffect(() => {
    if (mode !== "play" || !worldRef.current) return;
    for (const rec of scripts.values()) {
      invalidateScript(rec.id);
      worldRef.current.reloadScript(rec);
    }
  }, [scripts, mode]);
}
```

Wire `useRuntime()` into `App.tsx` so it runs at the top level.

### Success Criteria

#### Automated Verification
- [x] `npm --workspace apps/editor run build` passes.
- [x] `npx tsc -p apps/editor/tsconfig.json --noEmit` passes.

#### Manual Verification
- [ ] Create an object, attach (via temporary console call `useEditor.getState().attachScript(objId, scriptId)`) a script that rotates `handle.rotation.y += dt`. Press Tab — object spins in viewport.
- [ ] Press Tab again — object snaps back to its original orientation; `useEditor.getState().runtimeSnapshot` is `null`.
- [ ] While in Play Mode, edit the script source via `curl PUT` to the server with a new rotation speed — the object's rotation rate changes within ~100 ms without reloading the page.
- [ ] In Edit Mode, `script:updated` arrives but the scene does not animate (scripts are stored, not executed).

**Implementation Note**: Pause here. Without script attach UI yet, attaching happens via console — that's fine. Phase 5 adds the inspector UI.

---

## Phase 5: Script authoring UI + deep links

### Overview
Add the inspector's **Scripts** section: list attached scripts, attach existing scripts, create new scripts via the server, and render each as a `vscode://file/...` link using the CLI's reported absolute path.

### Changes Required

#### 1. API helper for attach UI

Reuse `createScript` from Phase 3.

#### 2. Scripts section in Inspector

Extend `apps/editor/src/ui/Inspector.tsx`:

```tsx
import { createScript } from "../net/api";

// inside Inspector() after the Vec3Fields:
<Field label="Scripts">
  <ScriptList obj={obj} />
</Field>
```

**File**: `apps/editor/src/ui/ScriptList.tsx`

```tsx
import type { GameObjectDef } from "@poc/shared";
import { useEditor } from "../state/store";
import { createScript } from "../net/api";

export function ScriptList({ obj }: { obj: GameObjectDef }) {
  const { scripts, cliAbsPath, projectId, attachScript, detachScript, upsertScript } = useEditor();
  const all = Array.from(scripts.values());
  const unattached = all.filter((s) => !obj.scriptIds.includes(s.id));

  function deepLink(scriptId: string): string | null {
    if (!cliAbsPath) return null;
    const sep = cliAbsPath.endsWith("/") ? "" : "/";
    return `vscode://file${cliAbsPath}${sep}${scriptId}.ts`;
  }

  async function onCreate() {
    if (!projectId) return;
    const name = prompt("Script name (PascalCase, no extension)");
    if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return;
    const rec = await createScript(projectId, name);
    upsertScript(rec);
    attachScript(obj.id, rec.id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {obj.scriptIds.map((sid) => {
          const link = deepLink(sid);
          return (
            <li key={sid} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {link
                ? <a href={link} title="Open in VS Code"
                     style={{ color: "#88c0ff" }}>{sid}.ts</a>
                : <span title="Run `genex` locally to enable deep link"
                        style={{ opacity: 0.6 }}>{sid}.ts</span>}
              <button onClick={() => detachScript(obj.id, sid)}>×</button>
            </li>
          );
        })}
      </ul>
      <button onClick={onCreate}>+ New script</button>
      {unattached.length > 0 && (
        <select onChange={(e) => { if (e.target.value) attachScript(obj.id, e.target.value); }} defaultValue="">
          <option value="">Attach existing…</option>
          {unattached.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
        </select>
      )}
    </div>
  );
}
```

### Success Criteria

#### Automated Verification
- [x] `npm --workspace apps/editor run build` passes.

#### Manual Verification
- [ ] In the inspector, click **+ New script**, name it `Spinner` → script appears in list as plain text (CLI not running yet).
- [ ] After running the CLI (Phase 6), reload the editor — the `Spinner.ts` link is now clickable.
- [ ] Clicking the link opens `Spinner.ts` in VS Code at `<CLI extraction folder>/Spinner.ts`.
- [ ] Attaching a second script to the same object adds it to the scripts list; the dropdown updates to exclude it.

**Implementation Note**: Pause. Phase 6 makes the deep links actually work.

---

## Phase 6: `genex` CLI — create, extract, watch, sync

### Overview
A Node CLI invoked as `genex create <dir>` that:

1. Asks the server for a new project (or reuses one stored in `.genex.json`).
2. Receives the `projectId` and the list of `ScriptRecord`s.
3. Writes one flat `.ts` file per script into `<dir>`.
4. Registers its absolute path with the server (`POST /projects/:id/cli`).
5. Starts a `chokidar` watcher on `<dir>/*.ts` with a 1-second polling interval.
6. On every change, debounces, reads the file, and `PUT`s the new source to the server.

### Changes Required

#### 1. CLI package

**File**: `apps/cli/package.json`

```json
{
  "name": "@poc/cli",
  "version": "0.0.1",
  "type": "module",
  "bin": { "genex": "dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@poc/shared": "*",
    "chokidar": "^3.6.0",
    "commander": "^12.1.0",
    "node-fetch": "^3.3.2"
  },
  "devDependencies": { "@types/node": "^20.14.0" }
}
```

**File**: `apps/cli/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "module": "ESNext", "moduleResolution": "Bundler" },
  "include": ["src"]
}
```

#### 2. CLI entrypoint

**File**: `apps/cli/src/index.ts`

```ts
#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import chokidar from "chokidar";
import type { CreateProjectRes, ScriptRecord } from "@poc/shared";

const SERVER = process.env.GENEX_SERVER ?? "http://localhost:5174";
const CONFIG = ".genex.json";

interface LocalConfig { projectId: string; server: string; }

const program = new Command();
program.name("genex").description("Extract & sync PoC project scripts");

program
  .command("create [dir]")
  .description("Create or attach a project in <dir> and start watching")
  .action(async (dir = ".") => {
    const absDir = resolve(process.cwd(), dir);
    await mkdir(absDir, { recursive: true });
    const cfgPath = `${absDir}/${CONFIG}`;
    let cfg: LocalConfig | null = existsSync(cfgPath)
      ? JSON.parse(await readFile(cfgPath, "utf8"))
      : null;

    let projectId: string;
    let scripts: ScriptRecord[];

    if (!cfg) {
      const r = await fetch(`${SERVER}/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Local Project" }),
      });
      const body = (await r.json()) as CreateProjectRes;
      projectId = body.projectId;
      scripts = body.scripts;
      cfg = { projectId, server: SERVER };
      await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
      console.log(`[genex] created project ${projectId}`);
    } else {
      projectId = cfg.projectId;
      const r = await fetch(`${SERVER}/projects/${projectId}`);
      if (!r.ok) {
        console.error(`[genex] server has no project ${projectId} \u2014 delete ${CONFIG} and re-run`);
        process.exit(1);
      }
      const body = await r.json();
      scripts = body.scripts;
      console.log(`[genex] attached to project ${projectId}`);
    }

    for (const s of scripts) {
      const p = `${absDir}/${s.filename}`;
      if (!existsSync(p)) await writeFile(p, s.source);
    }

    await fetch(`${SERVER}/projects/${projectId}/cli`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ absPath: absDir }),
    });
    console.log(`[genex] registered abs path ${absDir}`);

    const watcher = chokidar.watch(`${absDir}/*.ts`, {
      usePolling: true,
      interval: 1000,
      ignoreInitial: true,
    });

    const pending = new Map<string, NodeJS.Timeout>();
    const debounce = (file: string, fn: () => void) => {
      clearTimeout(pending.get(file));
      pending.set(file, setTimeout(fn, 200));
    };

    const upload = async (file: string) => {
      const id = file.split("/").pop()!.replace(/\.ts$/, "");
      const source = await readFile(file, "utf8");
      const r = await fetch(`${SERVER}/projects/${projectId}/scripts/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source }),
      });
      if (r.ok) console.log(`[genex] synced ${id}.ts`);
      else console.error(`[genex] failed to sync ${id}.ts: ${r.status}`);
    };

    watcher.on("change", (f) => debounce(f, () => upload(f)));
    watcher.on("add", (f) => debounce(f, () => upload(f)));

    console.log(`[genex] watching ${absDir}/*.ts (poll 1s) \u2014 Ctrl+C to stop`);
  });

program.parseAsync();
```

#### 3. Pulling new server-side scripts down to disk

For the PoC the CLI only **pulls on startup** and **pushes on file change**. New scripts created in the editor *while the CLI is running* are not auto-written to disk in this minimal scope. If needed, the CLI can subscribe to the WS and write new files on `script:created` — but per the non-goals this is omitted unless trivial. **We include the subscription**, since it is small and makes the round-trip demo cleaner:

Add to `apps/cli/src/index.ts` after registering the abs path:

```ts
const { WebSocket } = await import("ws");
const ws = new WebSocket(`${SERVER.replace(/^http/, "ws")}/ws`);
ws.on("open", () => ws.send(JSON.stringify({ type: "subscribe", projectId })));
ws.on("message", async (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "script:created") {
    const p = `${absDir}/${msg.script.filename}`;
    if (!existsSync(p)) {
      await writeFile(p, msg.script.source);
      console.log(`[genex] received new script ${msg.script.id}.ts`);
    }
  }
});
```

Add `"ws": "^8.18.0"` and `"@types/ws": "^8.5.10"` to the CLI's deps.

### Success Criteria

#### Automated Verification
- [x] `npm --workspace apps/cli run build` succeeds; `apps/cli/dist/index.js` exists and starts with the shebang.
- [x] `npx --workspace apps/cli genex --help` prints the `create` command.

#### Manual Verification
- [ ] In a clean folder, run `node apps/cli/dist/index.js create ./game-scripts`. A `game-scripts/` folder is created with `.genex.json` inside.
- [ ] If scripts already exist on the server (created via the editor), they appear as `.ts` files inside `game-scripts/`.
- [ ] The editor toolbar shows the absolute path next to "CLI:" within ~1 second.
- [ ] Click a script link in the editor inspector — VS Code opens that file at `<game-scripts>/<Script>.ts`.
- [ ] Edit a `.ts` file in VS Code, save → within ~1.2 s, `[genex] synced <id>.ts` is logged AND the editor's in-memory `scripts` map updates (visible by entering Play Mode and observing behavior change).
- [ ] Create a new script in the editor via `+ New script` → CLI logs `[genex] received new script …` and a new `.ts` file appears in `game-scripts/`.
- [ ] Kill the CLI, restart it with the same folder → it reads `.genex.json`, re-attaches to the same `projectId`, re-registers its abs path, deep links still work.

**Implementation Note**: Pause and run the full round-trip demo as described.

---

## Testing Strategy

### Unit-style sanity checks (no test framework needed for PoC)

- `packages/shared`: type-check passes — that's the spec.
- `apps/server`: hit each REST route once with `curl`; observe broadcast via `wscat`.
- `apps/editor`: `tsc --noEmit` for type safety; manual viewport check.
- `apps/cli`: hit `create` in a fresh dir, verify file I/O, kill+restart.

### Integration test (manual, end-to-end)

This is the canonical demo for the PoC and should be run after every phase that touches more than one app:

1. Fresh repo. `npm install`. `npm run dev` (server + editor).
2. Open editor. Add three objects (`A` cube, `B` sphere, `C` cylinder). Set distinct positions.
3. Inspector → `+ New script` on `A` → name it `Spinner` → leave default `update()` empty for now.
4. Inspector → `+ New script` on `B` → `Bouncer`.
5. In another terminal: `node apps/cli/dist/index.js create ./scripts-tmp`.
6. Toolbar shows the CLI path. Click `Spinner.ts` → VS Code opens.
7. In VS Code, edit `Spinner.ts` to set `update(dt) { this.o.rotation.y += dt; }` (after wiring `handle` constructor arg).
8. Save. CLI logs sync. Editor receives WS update.
9. Press **Tab** → `A` spins; `B`, `C` are still.
10. While running, edit `Spinner.ts` to flip rotation direction. Save. Spin direction reverses live.
11. Press **Tab** again → all objects snap back to original transforms. `runtimeSnapshot` is `null`.
12. Refresh browser → state persists (same `projectId`, same objects, same scripts).

### Edge cases to verify manually

- Two objects sharing the same script id both update on hot-reload.
- Detaching a script does not crash Play Mode.
- A syntactically invalid `.ts` edit logs an error in the browser console but doesn't crash the runtime; the previous instance remains.
- Deleting a `.ts` file locally (handled as `change` failure or unlink — for PoC: ignore, leave server copy).
- Killing the CLI sets `cliAbsPath` back via `cli:disconnected`? — **not implemented** in PoC; the toolbar will continue to show the last reported path. Documented as a known limitation.

## Performance Considerations

Not in scope. The runtime is a `requestAnimationFrame` loop running plain JS. No instancing, no perf tuning. A handful of objects per scene is the expected size.

## Migration Notes

Greenfield project — no migration. The `.genex.json` file inside the script folder is the only persistent local artifact and is `.gitignore`d.

## References

- Three.js skill: `.claude/skills/threejs/SKILL.md`
- R3F fundamentals skill: `.claude/skills/r3f-fundamentals/SKILL.md`
- User's PoC requirements: provided in the prompt that initiated this plan.
