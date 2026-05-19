import { useEditor } from "../state/store";

export function Hierarchy() {
  const { definition, selectedId, selectObject, addObject, removeObject } =
    useEditor();
  if (!definition) return null;
  return (
    <div style={{ padding: 8 }}>
      <button onClick={addObject}>+ Add Object</button>
      <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
        {definition.objects.map((o) => (
          <li
            key={o.id}
            onClick={() => selectObject(o.id)}
            style={{
              padding: "4px 6px",
              cursor: "pointer",
              background: o.id === selectedId ? "#264f78" : "transparent",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {o.meshType === "camera" && <span title="Built-in camera">📷</span>}
            <span style={{ flex: 1 }}>{o.name}</span>
            {!o.builtin && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeObject(o.id);
                }}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
