export type MeshType = "none" | "cube" | "sphere" | "cylinder" | "camera";

/**
 * Stable id for the built-in scene Camera. Always present in every project,
 * cannot be removed via the editor, and is the view used by Play Mode.
 */
export const BUILTIN_CAMERA_ID = "__camera__";

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
  /**
   * Built-in objects (e.g. the default Camera) carry `builtin: true`. The
   * editor surface hides delete/rename affordances and the runtime treats
   * them specially. User scripts can attach to them like any other object.
   */
  builtin?: boolean;
}

/**
 * Default Camera object inserted into every project. Acts as the Play Mode
 * view; in Edit Mode the user navigates with OrbitControls and sees a gizmo
 * for this object so they can place it.
 */
export function makeBuiltinCamera(): GameObjectDef {
  return {
    id: BUILTIN_CAMERA_ID,
    name: "Camera",
    transform: {
      position: { x: 4, y: 3, z: 6 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    meshType: "camera",
    scriptIds: [],
    scriptValues: {},
    builtin: true,
  };
}

/**
 * Ensure a definition has the built-in Camera. Mutates a fresh copy of the
 * incoming definition; returns it (same ref if no change was needed).
 */
export function ensureBuiltins(def: GameDefinition): GameDefinition {
  const hasCamera = def.objects.some((o) => o.id === BUILTIN_CAMERA_ID);
  if (hasCamera) {
    // Defensive: make sure the existing entry is still flagged builtin so
    // older projects upgrade in place.
    let mutated = false;
    const objects = def.objects.map((o) => {
      if (o.id !== BUILTIN_CAMERA_ID) return o;
      if (o.builtin && o.meshType === "camera") return o;
      mutated = true;
      return { ...o, builtin: true, meshType: "camera" as MeshType };
    });
    return mutated ? { ...def, objects } : def;
  }
  return { ...def, objects: [makeBuiltinCamera(), ...def.objects] };
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
  /** Built-in Camera handle. Mutating its transform moves the Play view. */
  readonly camera: ObjectHandle;
  /** Input snapshot for the current frame. Refreshed by the runtime each tick. */
  readonly input: InputApi;
}

/**
 * Keyboard / mouse / pointer input exposed to scripts. The runtime polls the
 * browser and exposes the current frame as a stable snapshot — `mouseDeltaX`,
 * `mouseDeltaY`, and `wheelDelta` are zeroed between frames so scripts only
 * see the motion that happened since their last `update`.
 */
export interface InputApi {
  /** True if the key is currently held. Keys use `KeyboardEvent.code`, e.g. "KeyW", "Space". */
  key(code: string): boolean;
  /** True the frame a key transitioned from up to down. */
  keyPressed(code: string): boolean;
  /** True the frame a key transitioned from down to up. */
  keyReleased(code: string): boolean;
  /** Mouse button held: 0 = left, 1 = middle, 2 = right. */
  mouseButton(btn: number): boolean;
  /** Mouse motion since last frame, in CSS pixels (or pointer-lock deltas). */
  readonly mouseDeltaX: number;
  readonly mouseDeltaY: number;
  /** Scroll wheel delta accumulated this frame. */
  readonly wheelDelta: number;
  /** Request pointer lock — useful for mouselook in FPS-style games. */
  lockPointer(): void;
  /** Release pointer lock. */
  unlockPointer(): void;
  /** Whether the pointer is currently locked. */
  readonly pointerLocked: boolean;
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
