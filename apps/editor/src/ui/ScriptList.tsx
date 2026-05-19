import type { GameObjectDef } from "@poc/shared";
import { useEditor } from "../state/store";
import { createScript } from "../net/api";
import { ScriptFields } from "./ScriptFields";

export function ScriptList({ obj }: { obj: GameObjectDef }) {
  const {
    scripts,
    cliAbsPath,
    projectId,
    attachScript,
    detachScript,
    upsertScript,
  } = useEditor();
  const all = Array.from(scripts.values());
  const unattached = all.filter((s) => !obj.scriptIds.includes(s.id));

  function deepLink(scriptId: string): string | null {
    if (!cliAbsPath) return null;
    const sep = cliAbsPath.endsWith("/") ? "" : "/";
    // CLI lays scripts out under <absPath>/scripts/<id>.ts
    return `cursor://file${cliAbsPath}${sep}scripts/${scriptId}.ts`;
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {obj.scriptIds.map((sid) => {
        const link = deepLink(sid);
        const rec = scripts.get(sid);
        return (
          <div
            key={sid}
            style={{
              border: "1px solid #333",
              borderRadius: 4,
              padding: 6,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {link ? (
                <a
                  href={link}
                  title="Open in Cursor"
                  style={{ color: "#88c0ff" }}
                >
                  {sid}.ts
                </a>
              ) : (
                <span
                  title="Run `genex` locally to enable deep link"
                  style={{ opacity: 0.6 }}
                >
                  {sid}.ts
                </span>
              )}
              <button onClick={() => detachScript(obj.id, sid)}>×</button>
            </div>
            {rec ? (
              <ScriptFields obj={obj} rec={rec} />
            ) : (
              <div style={{ opacity: 0.5, fontSize: 12 }}>
                script not yet loaded
              </div>
            )}
          </div>
        );
      })}
      <button onClick={onCreate}>+ New script</button>
      {unattached.length > 0 && (
        <select
          onChange={(e) => {
            if (e.target.value) attachScript(obj.id, e.target.value);
          }}
          defaultValue=""
        >
          <option value="">Attach existing…</option>
          {unattached.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
