import { useState } from "react";

const CREATE_CMD = "npx @boozybats/genex create ./my-game";
const EDIT_CMD = "npx @boozybats/genex edit ./my-game";

export function NoProjectModal({ error }: { error?: string | null }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 10, 12, 0.85)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#e6e6e6",
      }}
    >
      <div
        style={{
          width: "min(560px, 92vw)",
          background: "#1a1a1d",
          border: "1px solid #2e2e34",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          padding: 28,
          lineHeight: 1.5,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>No project open</h2>
        <p style={{ margin: "0 0 20px", opacity: 0.75, fontSize: 14 }}>
          The editor needs a project before you can do anything. Open a
          terminal in the folder where you want your game to live and run one
          of the commands below — the CLI will create or attach a project and
          re-open this page with the right URL.
        </p>

        <Section
          title="Start a new project"
          hint="Scaffolds gameDefinition.json, scripts/, README.md and engine-types.d.ts. Re-running in the same folder safely re-attaches."
          command={CREATE_CMD}
        />

        <div style={{ height: 16 }} />

        <Section
          title="Continue an existing project"
          hint="Requires a .genex.json file in the folder (created by `genex create`). Re-attaches to the same server-side project and starts watching."
          command={EDIT_CMD}
        />

        {error ? (
          <div
            style={{
              marginTop: 20,
              padding: "10px 12px",
              background: "#3a1d1d",
              border: "1px solid #6b2a2a",
              borderRadius: 8,
              color: "#ffb4b4",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        <p style={{ marginTop: 24, marginBottom: 0, fontSize: 12, opacity: 0.5 }}>
          Need Node.js ≥ 18.17. The CLI opens this page with the project loaded
          once it’s done.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  command,
}: {
  title: string;
  hint: string;
  command: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>{hint}</div>
      <CommandBlock command={command} />
    </div>
  );
}

function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        background: "#0d0d10",
        border: "1px solid #2a2a30",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <code
        style={{
          flex: 1,
          padding: "10px 12px",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          color: "#c7d3e0",
          whiteSpace: "pre",
          overflowX: "auto",
        }}
      >
        {command}
      </code>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            // ignore
          }
        }}
        style={{
          background: copied ? "#1f3a2a" : "#1c1c22",
          color: copied ? "#9ae6b4" : "#cfcfd6",
          border: "none",
          borderLeft: "1px solid #2a2a30",
          padding: "0 14px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
