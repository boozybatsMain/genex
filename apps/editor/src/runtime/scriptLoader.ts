import type {
  InspectorField,
  InspectorFieldValue,
  ObjectHandle,
  SceneApi,
  ScriptCtor,
  ScriptRecord,
  Vec3,
} from "@poc/shared";
import { stripTs } from "./transpile";

export type { ObjectHandle, SceneApi, ScriptCtor };

const cache = new Map<
  string,
  { url: string; ctor: ScriptCtor; version: number }
>();

const fieldCache = new Map<
  string,
  { fields: InspectorField[]; version: number }
>();

export async function loadScript(rec: ScriptRecord): Promise<ScriptCtor> {
  const existing = cache.get(rec.id);
  if (existing && existing.version === rec.updatedAt) return existing.ctor;
  if (existing) URL.revokeObjectURL(existing.url);

  const js = stripTs(rec.source);
  const blob = new Blob([js], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const mod = await import(/* @vite-ignore */ url);
  const ctor = mod.default as ScriptCtor;
  if (typeof ctor !== "function")
    throw new Error(`Script ${rec.id} has no default export class`);

  cache.set(rec.id, { url, ctor, version: rec.updatedAt });
  return ctor;
}

export function invalidateScript(id: string) {
  const c = cache.get(id);
  if (c) {
    URL.revokeObjectURL(c.url);
    cache.delete(id);
  }
  fieldCache.delete(id);
}

// ---- Introspection ---------------------------------------------------------

function stubHandle(): ObjectHandle {
  return {
    id: "__probe__",
    meshType: "none",
    name: "__probe__",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

function stubScene(): SceneApi {
  return {
    find: () => null,
    findAll: () => [],
    all: () => [],
    create: () => stubHandle(),
    destroy: () => {},
  };
}

function isVec3(v: unknown): v is Vec3 {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Vec3).x === "number" &&
    typeof (v as Vec3).y === "number" &&
    typeof (v as Vec3).z === "number"
  );
}

const RESERVED = new Set(["start", "update", "constructor"]);

/**
 * Construct a probe instance and read its own enumerable, supported public
 * fields. Returns `null` if the script can't be instantiated.
 *
 * Cached by (id, updatedAt). Safe to call repeatedly.
 */
export async function introspectScript(
  rec: ScriptRecord,
): Promise<InspectorField[] | null> {
  const cached = fieldCache.get(rec.id);
  if (cached && cached.version === rec.updatedAt) return cached.fields;

  let Ctor: ScriptCtor;
  try {
    Ctor = await loadScript(rec);
  } catch (err) {
    console.warn(`[introspect] failed to load ${rec.id}`, err);
    return null;
  }

  let probe: object;
  try {
    probe = new Ctor(stubHandle(), stubScene()) as unknown as object;
  } catch (err) {
    console.warn(`[introspect] failed to instantiate ${rec.id}`, err);
    return null;
  }

  const fields: InspectorField[] = [];
  for (const key of Object.keys(probe)) {
    if (RESERVED.has(key)) continue;
    if (key.startsWith("_")) continue;
    const value = (probe as Record<string, unknown>)[key];
    const field = classifyField(key, value);
    if (field) fields.push(field);
  }
  fieldCache.set(rec.id, { fields, version: rec.updatedAt });
  return fields;
}

function classifyField(name: string, value: unknown): InspectorField | null {
  switch (typeof value) {
    case "number":
      return { name, type: "number", defaultValue: value };
    case "string":
      return { name, type: "string", defaultValue: value };
    case "boolean":
      return { name, type: "boolean", defaultValue: value };
    case "object":
      if (isVec3(value)) {
        return {
          name,
          type: "vec3",
          defaultValue: { x: value.x, y: value.y, z: value.z },
        };
      }
      return null;
    default:
      return null;
  }
}

export function coerceFieldValue(
  field: InspectorField,
  raw: unknown,
): InspectorFieldValue {
  switch (field.type) {
    case "number":
      return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    case "string":
      return typeof raw === "string" ? raw : "";
    case "boolean":
      return Boolean(raw);
    case "vec3":
      if (isVec3(raw)) return { x: raw.x, y: raw.y, z: raw.z };
      return { x: 0, y: 0, z: 0 };
  }
}
