import type { MeshType, GameObjectDef } from "@poc/shared";
import { useEditor } from "../state/store";
import { ScriptList } from "./ScriptList";

const MESH_TYPES: MeshType[] = ["none", "cube", "sphere", "cylinder"];

export function Inspector() {
  const { definition, selectedId, patchObject } = useEditor();
  if (!definition) return null;
  const obj = definition.objects.find((o) => o.id === selectedId);
  if (!obj) return <div style={{ padding: 8, opacity: 0.6 }}>No selection</div>;

  return (
    <div
      style={{
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Field label="Name">
        <input
          value={obj.name}
          onChange={(e) => patchObject(obj.id, { name: e.target.value })}
        />
      </Field>
      <Field label="Mesh">
        <select
          value={obj.meshType}
          onChange={(e) =>
            patchObject(obj.id, { meshType: e.target.value as MeshType })
          }
        >
          {MESH_TYPES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Vec3Field label="Position" obj={obj} field="position" />
      <Vec3Field label="Rotation" obj={obj} field="rotation" />
      <Vec3Field label="Scale" obj={obj} field="scale" />
      <Field label="Scripts">
        <ScriptList obj={obj} />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{label}</span>
      {children}
    </label>
  );
}

function Vec3Field({
  obj,
  field,
  label,
}: {
  obj: GameObjectDef;
  field: "position" | "rotation" | "scale";
  label: string;
}) {
  const { patchObject } = useEditor();
  const v = obj.transform[field];
  return (
    <Field label={label}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 4,
        }}
      >
        {(["x", "y", "z"] as const).map((axis) => (
          <input
            key={axis}
            type="number"
            step="0.1"
            value={v[axis]}
            onChange={(e) =>
              patchObject(obj.id, {
                transform: {
                  ...obj.transform,
                  [field]: { ...v, [axis]: Number(e.target.value) },
                },
              })
            }
          />
        ))}
      </div>
    </Field>
  );
}
