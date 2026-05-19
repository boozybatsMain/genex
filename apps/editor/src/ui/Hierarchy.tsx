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
            }}
          >
            {o.name}
            <button
              style={{ float: "right" }}
              onClick={(e) => {
                e.stopPropagation();
                removeObject(o.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
