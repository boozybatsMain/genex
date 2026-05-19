import express from "express";
import cors from "cors";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import {
  DEFAULT_SCRIPT_TEMPLATE,
  type CreateProjectReq,
  type CreateProjectRes,
  type CreateScriptReq,
  type PutDefinitionReq,
  type PutScriptReq,
  type RegisterCliReq,
  type WsServerMsg,
} from "@poc/shared";
import {
  createProject,
  getProject,
  listScripts,
  setCliPath,
  upsertScript,
} from "./store.js";

const app = express();

// CORS allowlist:
//   - In dev (no GENEX_CORS_ORIGIN set), allow everything — local CLIs and
//     editors connect from `http://localhost:*`.
//   - In prod, set GENEX_CORS_ORIGIN to a comma-separated list of allowed
//     origins, e.g. "https://genex.vercel.app,https://my-fork.vercel.app".
//     CLI requests are server-to-server (no Origin header) so they're always
//     allowed.
const corsAllowlistRaw = process.env.GENEX_CORS_ORIGIN?.trim();
if (corsAllowlistRaw) {
  const allowlist = new Set(
    corsAllowlistRaw.split(",").map((s) => s.trim()).filter(Boolean),
  );
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true); // CLI / curl / same-origin
        if (allowlist.has(origin)) return cb(null, true);
        return cb(new Error(`Origin ${origin} not allowed`));
      },
    }),
  );
} else {
  app.use(cors());
}

app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

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
  const body = req.body as PutDefinitionReq;
  // Accept legacy shape (bare GameDefinition) as well as { definition, origin }.
  const definition = "definition" in body ? body.definition : (body as any);
  const origin = "origin" in body ? body.origin : "unknown";
  p.definition = definition;
  broadcast(req.params.id, { type: "definition:updated", definition, origin });
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
  const origin = ((req.body as CreateScriptReq & { origin?: string }).origin) ?? "unknown";
  broadcast(req.params.id, { type: "script:created", script: rec, origin });
  res.json(rec);
});

app.put("/projects/:id/scripts/:scriptId", (req, res) => {
  const { source, origin } = req.body as PutScriptReq;
  const rec = upsertScript(req.params.id, req.params.scriptId, source);
  broadcast(req.params.id, {
    type: "script:updated",
    script: rec,
    origin: origin ?? "unknown",
  });
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
        const projectId: string = msg.projectId;
        currentProject = projectId;
        if (!subscribers.has(projectId)) subscribers.set(projectId, new Set());
        subscribers.get(projectId)!.add(ws);
        ws.send(JSON.stringify({ type: "hello", projectId } satisfies WsServerMsg));
      }
    } catch {
      /* ignore malformed */
    }
  });
  ws.on("close", () => {
    if (currentProject) subscribers.get(currentProject)?.delete(ws);
  });
});

const PORT = Number(process.env.PORT ?? 5174);
const HOST = process.env.HOST ?? "0.0.0.0";
server.listen(PORT, HOST, () =>
  console.log(`[server] listening on http://${HOST}:${PORT}`),
);
