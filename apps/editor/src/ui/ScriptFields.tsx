import { useEffect, useState } from "react";
import type {
  GameObjectDef,
  InspectorField,
  InspectorFieldValue,
  ScriptRecord,
  Vec3,
} from "@poc/shared";
import { introspectScript } from "../runtime/scriptLoader";
import { useEditor } from "../state/store";

interface Props {
  obj: GameObjectDef;
  rec: ScriptRecord;
}

/**
 * Renders the inspector fields for a single (object, script) pair.
 * Introspects the script's probe instance to discover supported public
 * fields, then renders one editor per field. Edits flow through the store
 * (which persists to `gameDefinition.json`) and, if running, into the live
 * script instance via the runtime.
 */
export function ScriptFields({ obj, rec }: Props) {
  const [fields, setFields] = useState<InspectorField[] | null>(null);
  const { setScriptValue } = useEditor();
  const stored = obj.scriptValues?.[rec.id] ?? {};

  useEffect(() => {
    let cancelled = false;
    introspectScript(rec).then((f) => {
      if (!cancelled) setFields(f);
    });
    return () => {
      cancelled = true;
    };
  }, [rec.id, rec.updatedAt]);

  if (fields == null) {
    return <div style={{ opacity: 0.5, fontSize: 12 }}>introspecting…</div>;
  }
  if (fields.length === 0) {
    return (
      <div style={{ opacity: 0.5, fontSize: 12 }}>
        no public fields
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {fields.map((f) => {
        const current =
          f.name in stored
            ? (stored[f.name] as InspectorFieldValue)
            : f.defaultValue;
        return (
          <FieldRow
            key={f.name}
            field={f}
            value={current}
            onChange={(v) => setScriptValue(obj.id, rec.id, f.name, v)}
          />
        );
      })}
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: InspectorField;
  value: InspectorFieldValue;
  onChange: (v: InspectorFieldValue) => void;
}) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 2fr",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
      }}
    >
      <span style={{ opacity: 0.7 }} title={field.type}>
        {field.name}
      </span>
      {renderInput(field, value, onChange)}
    </label>
  );
}

function renderInput(
  field: InspectorField,
  value: InspectorFieldValue,
  onChange: (v: InspectorFieldValue) => void,
) {
  switch (field.type) {
    case "number":
      return (
        <input
          type="number"
          step="0.1"
          value={value as number}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );
    case "string":
      return (
        <input
          type="text"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={value as boolean}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "vec3": {
      const v = value as Vec3;
      const update = (axis: keyof Vec3, n: number) =>
        onChange({ ...v, [axis]: n });
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 2 }}>
          {(["x", "y", "z"] as const).map((axis) => (
            <input
              key={axis}
              type="number"
              step="0.1"
              value={v[axis]}
              onChange={(e) => update(axis, Number(e.target.value))}
            />
          ))}
        </div>
      );
    }
  }
}
