export type MeshType = "none" | "cube" | "sphere" | "cylinder";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Transform {
  position: Vec3;
  rotation: Vec3; // Euler XYZ radians
  scale: Vec3;
}

/**
 * Inspector field shape, supported subset.
 * The runtime infers the type from the default value an instance reports
 * after construction: e.g. `0` => number, `""` => string, `{ x, y, z }` =>
 * vec3, etc.
 */
export type InspectorFieldType = "number" | "string" | "boolean" | "vec3";
export type InspectorFieldValue = number | string | boolean | Vec3;

export interface InspectorField {
  name: string;
  type: InspectorFieldType;
  defaultValue: InspectorFieldValue;
}

/** Persisted per-object overrides for inspector-exposed script fields. */
export type ScriptValueMap = Record<string, InspectorFieldValue>;
export type ObjectScriptValues = Record<string, ScriptValueMap>;

export interface GameObjectDef {
  id: string;
  name: string;
  transform: Transform;
  meshType: MeshType;
  scriptIds: string[];
  /**
   * Inspector overrides per script. Missing fields fall back to the script's
   * class defaults. Optional for backward compat with v1 definitions.
   */
  scriptValues?: ObjectScriptValues;
}

export interface GameDefinition {
  projectId: string;
  name: string;
  objects: GameObjectDef[];
}

export interface ScriptRecord {
  id: string; // e.g. "PlayerController"
  filename: string; // e.g. "PlayerController.ts"
  source: string;
  updatedAt: number;
}

export interface ProjectSummary {
  projectId: string;
  name: string;
  cliAbsPath: string | null; // set by CLI on registration
}

// ----------------------------------------------------------------------------
// Runtime API surface that scripts see at runtime. These types are imported by
// the editor's runtime; satellite projects re-declare ambient versions of them
// in `engine-types.d.ts` so user scripts get IntelliSense without imports.
// ----------------------------------------------------------------------------

/** Mutable view of a single scene object that a script can read and write. */
export interface ObjectHandle {
  readonly id: string;
  readonly meshType: MeshType;
  name: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export interface CreateObjectOptions {
  name: string;
  meshType?: MeshType;
  position?: Partial<Vec3>;
  rotation?: Partial<Vec3>;
  scale?: Partial<Vec3>;
  scriptIds?: string[];
}

/**
 * The shared, namespace-flat scene API injected into every script as the
 * second constructor argument.
 *
 * Name semantics:
 *   - Names are not unique. `find` returns the **first** match in scene
 *     iteration order. `findAll` returns every match.
 *   - Mutations on a returned handle affect the real object. Handles are not
 *     copies.
 */
export interface SceneApi {
  find(name: string): ObjectHandle | null;
  findAll(name: string): ObjectHandle[];
  all(): ObjectHandle[];
  create(opts: CreateObjectOptions): ObjectHandle;
  destroy(target: ObjectHandle | string): void;
}

export interface ScriptInstance {
  start?: () => void;
  update?: (dt: number) => void;
  // Inspector-visible public fields live alongside these on the same instance.
  [key: string]: unknown;
}

export interface ScriptCtor {
  new (self: ObjectHandle, scene: SceneApi): ScriptInstance;
}

// ---- Wire types ------------------------------------------------------------

export interface CreateProjectReq {
  name?: string;
}
export interface CreateProjectRes {
  projectId: string;
  definition: GameDefinition;
  scripts: ScriptRecord[];
}

export interface RegisterCliReq {
  absPath: string;
}
export interface RegisterCliRes {
  ok: true;
}

export interface PutScriptReq {
  source: string;
  origin?: string;
}
export interface CreateScriptReq {
  id: string;
}

export interface PutDefinitionReq {
  definition: GameDefinition;
  origin: string;
}

export type WsServerMsg =
  | { type: "hello"; projectId: string }
  | { type: "script:updated"; script: ScriptRecord; origin: string }
  | { type: "script:created"; script: ScriptRecord; origin: string }
  | { type: "definition:updated"; definition: GameDefinition; origin: string }
  | { type: "cli:registered"; absPath: string }
  | { type: "cli:disconnected" };

export type WsClientMsg = { type: "subscribe"; projectId: string };

export const DEFAULT_SCRIPT_TEMPLATE = (id: string) => `// ${id}.ts
// Runs while in Play Mode. Edit this file in your IDE \u2014 changes hot-reload.

export default class ${id} {
  // Public fields appear in the inspector. Default values pick the type:
  //   number, string, boolean, { x, y, z } vector.
  speed: number = 1;

  // self  = handle to the object this script is attached to
  // scene = shared scene API (scene.find, scene.all, scene.create, ...)
  constructor(private self: any, private scene: any) {}

  start() {
    console.log("[${id}] start on", this.self.name);
  }

  update(dt: number) {
    this.self.rotation.y += this.speed * dt;
  }
}
`;
