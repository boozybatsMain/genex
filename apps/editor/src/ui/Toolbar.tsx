import { useEditor } from "../state/store";

export function Toolbar() {
  const { mode, setMode, cliAbsPath, projectId } = useEditor();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 8px",
        height: "100%",
      }}
    >
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
