import { useEffect, useState } from "react";
import { useEditor } from "./state/store";
import { getProject, putDefinition } from "./net/api";
import { connectWs } from "./net/ws";
import { Hierarchy } from "./ui/Hierarchy";
import { Inspector } from "./ui/Inspector";
import { Viewport } from "./ui/Viewport";
import { Toolbar } from "./ui/Toolbar";
import { NoProjectModal } from "./ui/NoProjectModal";
import { useRuntime } from "./runtime/useRuntime";

function readProjectIdFromUrl(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get("projectId");
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
  const [hasProjectIdInUrl] = useState<boolean>(() => readProjectIdFromUrl() != null);
  useRuntime();

  useEffect(() => {
    const urlId = readProjectIdFromUrl();
    if (!urlId) return;
    (async () => {
      const res = await getProject(urlId);
      if (res) {
        setProject(res.definition, res.scripts, res.cliAbsPath);
        connectWs(urlId);
        return;
      }
      setError(
        `No project found for id "${urlId}". Use the CLI to create a new ` +
          `project, or remove the ?projectId= query parameter.`,
      );
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

  // Tab to toggle modes (only when a project is loaded).
  useEffect(() => {
    if (!definition) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setMode(mode === "edit" ? "play" : "edit");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, setMode, definition]);

  if (!hasProjectIdInUrl) return <NoProjectModal />;
  if (error) return <NoProjectModal error={error} />;
  if (!definition) return <div style={{ padding: 16 }}>Loading…</div>;

  // Play Mode hides all UI chrome — the viewport becomes the whole screen
  // and there's nothing to click into except the game. Tab returns to Edit.
  if (mode === "play") {
    return (
      <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <Viewport />
      </div>
    );
  }

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
