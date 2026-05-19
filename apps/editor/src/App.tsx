import { useEffect, useState } from "react";
import { useEditor } from "./state/store";
import { createProject, getProject, putDefinition } from "./net/api";
import { connectWs } from "./net/ws";
import { Hierarchy } from "./ui/Hierarchy";
import { Inspector } from "./ui/Inspector";
import { Viewport } from "./ui/Viewport";
import { Toolbar } from "./ui/Toolbar";
import { useRuntime } from "./runtime/useRuntime";

function readProjectIdFromUrl(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get("projectId");
}

function setProjectIdInUrl(id: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("projectId", id);
  window.history.replaceState({}, "", url.toString());
}

export function App() {
  const {
    projectId,
    definition,
    lastDefinitionChangeWasRemote,
    setProject,
    mode,
    setMode,
  } = useEditor();
  const [error, setError] = useState<string | null>(null);
  useRuntime();

  useEffect(() => {
    (async () => {
      const urlId = readProjectIdFromUrl();
      if (urlId) {
        const res = await getProject(urlId);
        if (res) {
          setProject(res.definition, res.scripts, res.cliAbsPath);
          connectWs(urlId);
          return;
        }
        setError(
          `No project found for id "${urlId}". Use the CLI (genex create <dir>) ` +
            `to create one, or remove the ?projectId= query parameter to start fresh.`,
        );
        return;
      }
      // No id in the URL — create a new project and put the id into the URL.
      const res = await createProject();
      setProjectIdInUrl(res.projectId);
      setProject(res.definition, res.scripts, null);
      connectWs(res.projectId);
    })();
  }, []);

  // Debounced server sync of definition — but only for *local* changes.
  // Echoes from `definition:updated` set `lastDefinitionChangeWasRemote: true`
  // so we don't bounce them back to the server.
  useEffect(() => {
    if (!projectId || !definition) return;
    if (lastDefinitionChangeWasRemote) return;
    const t = setTimeout(() => putDefinition(projectId, definition), 250);
    return () => clearTimeout(t);
  }, [projectId, definition, lastDefinitionChangeWasRemote]);

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

  if (error) return <div style={{ padding: 16, color: "#f88" }}>{error}</div>;
  if (!definition) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "32px 1fr",
        gridTemplateColumns: "240px 1fr 320px",
        height: "100vh",
      }}
    >
      <div style={{ gridColumn: "1 / span 3", borderBottom: "1px solid #333" }}>
        <Toolbar />
      </div>
      <aside style={{ borderRight: "1px solid #333", overflow: "auto" }}>
        <Hierarchy />
      </aside>
      <main>
        <Viewport />
      </main>
      <aside style={{ borderLeft: "1px solid #333", overflow: "auto" }}>
        <Inspector />
      </aside>
    </div>
  );
}
