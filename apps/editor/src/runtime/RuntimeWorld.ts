import type {
  CreateObjectOptions,
  GameDefinition,
  GameObjectDef,
  MeshType,
  ObjectHandle,
  ObjectScriptValues,
  SceneApi,
  ScriptInstance,
  ScriptRecord,
  ScriptValueMap,
  Vec3,
} from "@poc/shared";
import { loadScript } from "./scriptLoader";

interface RuntimeObject {
  id: string;
  name: string;
  meshType: MeshType;
  scriptIds: string[];
  scriptValues: ObjectScriptValues;
  handle: ObjectHandle;
  scriptInstances: Map<string, ScriptInstance>;
  dynamic: boolean;
}

const VEC3 = (v?: Partial<Vec3> | null, fallback: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 => ({
  x: v?.x ?? fallback.x,
  y: v?.y ?? fallback.y,
  z: v?.z ?? fallback.z,
});

let active: RuntimeWorld | null = null;
export function getActiveRuntime(): RuntimeWorld | null {
  return active;
}

/**
 * Owns the play-mode runtime: simulated object state, script instances, the
 * shared name index that backs the Scene API, and the per-frame tick loop.
 *
 * One instance per Play Mode session. `useRuntime` constructs a fresh one
 * each time the user presses Tab.
 */
export class RuntimeWorld {
  private objects = new Map<string, RuntimeObject>();
  /** name -> [objectId, ...] insertion-order list. */
  private nameIndex = new Map<string, string[]>();
  /** Insertion order across all objects, used by `scene.all()`. */
  private order: string[] = [];

  private running = false;
  private rafId: number | null = null;
  private lastT = 0;
  private listeners = new Set<(snapshot: GameDefinition) => void>();

  constructor(
    private def: GameDefinition,
    private scripts: Map<string, ScriptRecord>,
  ) {}

  // ---- Public lifecycle ----------------------------------------------------

  async start() {
    active = this;
    for (const o of this.def.objects) {
      this.materialize(o, /*dynamic*/ false);
    }
    // Two-phase: instantiate everything first so scripts on object A can
    // already see object B inside their start().
    for (const o of this.def.objects) {
      await this.instantiateScriptsFor(o.id);
    }
    this.running = true;
    this.lastT = performance.now();
    const tick = (t: number) => {
      if (!this.running) return;
      const dt = Math.min((t - this.lastT) / 1000, 0.1);
      this.lastT = t;
      // Snapshot to allow scripts to mutate this.objects via scene.create /
      // scene.destroy without invalidating iteration.
      const ids = this.order.slice();
      for (const id of ids) {
        const ro = this.objects.get(id);
        if (!ro) continue;
        for (const inst of ro.scriptInstances.values()) {
          try {
            inst.update?.(dt);
          } catch (err) {
            console.error("[runtime] update error", err);
          }
        }
      }
      this.emit();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.objects.clear();
    this.nameIndex.clear();
    this.order = [];
    if (active === this) active = null;
  }

  subscribe(cb: (snapshot: GameDefinition) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ---- Hot reload ----------------------------------------------------------

  /** Called when a script source changes while play mode is running. */
  async reloadScript(rec: ScriptRecord) {
    this.scripts.set(rec.id, rec);
    let Ctor;
    try {
      Ctor = await loadScript(rec);
    } catch (err) {
      console.error(`[runtime] failed to hot-reload ${rec.id}`, err);
      return;
    }
    for (const ro of this.objects.values()) {
      if (!ro.scriptInstances.has(rec.id)) continue;
      try {
        const inst = new Ctor(ro.handle, this.makeSceneApi());
        // Re-apply persisted inspector values; fields that no longer exist
        // are silently skipped, new fields keep their class defaults.
        const values = ro.scriptValues[rec.id];
        if (values) applyValues(inst, values);
        inst.start?.();
        ro.scriptInstances.set(rec.id, inst);
      } catch (err) {
        console.error(`[runtime] failed to re-instantiate ${rec.id}`, err);
      }
    }
  }

  /**
   * Apply a new inspector value to a live script instance without restarting
   * it. Called by the editor when the user edits a field while in Play Mode.
   */
  applyScriptValue(objectId: string, scriptId: string, field: string, value: unknown) {
    const ro = this.objects.get(objectId);
    if (!ro) return;
    if (!ro.scriptValues[scriptId]) ro.scriptValues[scriptId] = {};
    (ro.scriptValues[scriptId] as Record<string, unknown>)[field] = value as never;
    const inst = ro.scriptInstances.get(scriptId);
    if (inst) (inst as Record<string, unknown>)[field] = value;
  }

  // ---- Internals -----------------------------------------------------------

  private materialize(o: GameObjectDef, dynamic: boolean): RuntimeObject {
    const handle: ObjectHandle = {
      id: o.id,
      meshType: o.meshType,
      name: o.name,
      position: { ...o.transform.position },
      rotation: { ...o.transform.rotation },
      scale: { ...o.transform.scale },
    };
    const ro: RuntimeObject = {
      id: o.id,
      name: o.name,
      meshType: o.meshType,
      scriptIds: [...o.scriptIds],
      scriptValues: cloneScriptValues(o.scriptValues),
      handle,
      scriptInstances: new Map(),
      dynamic,
    };
    this.objects.set(o.id, ro);
    this.order.push(o.id);
    this.indexAdd(o.name, o.id);
    // If the script accidentally renames `handle.name`, keep the index sane.
    const self = this;
    Object.defineProperty(handle, "name", {
      configurable: true,
      enumerable: true,
      get: () => ro.name,
      set: (next: string) => {
        const v = String(next);
        if (v === ro.name) return;
        self.indexRemove(ro.name, ro.id);
        ro.name = v;
        self.indexAdd(v, ro.id);
      },
    });
    return ro;
  }

  private async instantiateScriptsFor(objectId: string) {
    const ro = this.objects.get(objectId);
    if (!ro) return;
    for (const sid of ro.scriptIds) {
      const rec = this.scripts.get(sid);
      if (!rec) continue;
      try {
        const Ctor = await loadScript(rec);
        const inst = new Ctor(ro.handle, this.makeSceneApi());
        const values = ro.scriptValues[sid];
        if (values) applyValues(inst, values);
        inst.start?.();
        ro.scriptInstances.set(sid, inst);
      } catch (err) {
        console.error(`[runtime] failed to load script ${sid}`, err);
      }
    }
  }

  private indexAdd(name: string, id: string) {
    const list = this.nameIndex.get(name);
    if (list) list.push(id);
    else this.nameIndex.set(name, [id]);
  }

  private indexRemove(name: string, id: string) {
    const list = this.nameIndex.get(name);
    if (!list) return;
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) this.nameIndex.delete(name);
  }

  private makeSceneApi(): SceneApi {
    const self = this;
    return {
      find(name: string) {
        const list = self.nameIndex.get(name);
        if (!list || list.length === 0) return null;
        // Iterate the list, but skip any stale ids whose objects were
        // destroyed without index cleanup (defense in depth).
        for (const id of list) {
          const ro = self.objects.get(id);
          if (ro) return ro.handle;
        }
        return null;
      },
      findAll(name: string) {
        const list = self.nameIndex.get(name);
        if (!list) return [];
        const out: ObjectHandle[] = [];
        for (const id of list) {
          const ro = self.objects.get(id);
          if (ro) out.push(ro.handle);
        }
        return out;
      },
      all() {
        const out: ObjectHandle[] = [];
        for (const id of self.order) {
          const ro = self.objects.get(id);
          if (ro) out.push(ro.handle);
        }
        return out;
      },
      create(opts: CreateObjectOptions) {
        const id = `dyn_${Math.random().toString(36).slice(2, 8)}_${self.order.length}`;
        const def: GameObjectDef = {
          id,
          name: opts.name,
          meshType: opts.meshType ?? "cube",
          transform: {
            position: VEC3(opts.position),
            rotation: VEC3(opts.rotation),
            scale: VEC3(opts.scale, { x: 1, y: 1, z: 1 }),
          },
          scriptIds: opts.scriptIds ? [...opts.scriptIds] : [],
          scriptValues: {},
        };
        const ro = self.materialize(def, /*dynamic*/ true);
        // Fire-and-forget script instantiation for dynamic objects. This
        // means scripts attached to a created object start running on a
        // microtask boundary, not synchronously.
        if (ro.scriptIds.length > 0) {
          void self.instantiateScriptsFor(ro.id);
        }
        return ro.handle;
      },
      destroy(target: ObjectHandle | string) {
        const ro =
          typeof target === "string"
            ? findByNameOrId(self, target)
            : self.objects.get(target.id);
        if (!ro) return;
        ro.scriptInstances.clear();
        self.objects.delete(ro.id);
        self.indexRemove(ro.name, ro.id);
        const i = self.order.indexOf(ro.id);
        if (i >= 0) self.order.splice(i, 1);
      },
    };
  }

  private emit() {
    // Build a GameDefinition snapshot from current runtime state. The
    // viewport renders directly off this; dynamic objects appear here too.
    const objects: GameObjectDef[] = [];
    for (const id of this.order) {
      const ro = this.objects.get(id);
      if (!ro) continue;
      objects.push({
        id: ro.id,
        name: ro.name,
        meshType: ro.meshType,
        transform: {
          position: { ...ro.handle.position },
          rotation: { ...ro.handle.rotation },
          scale: { ...ro.handle.scale },
        },
        scriptIds: ro.scriptIds.slice(),
        scriptValues: cloneScriptValues(ro.scriptValues),
      });
    }
    const snapshot: GameDefinition = { ...this.def, objects };
    for (const cb of this.listeners) cb(snapshot);
  }
}

function findByNameOrId(world: RuntimeWorld, key: string): RuntimeObject | null {
  // Private access via a tiny helper kept inside the same module.
  const ro = (world as unknown as { objects: Map<string, RuntimeObject> }).objects.get(key);
  if (ro) return ro;
  const list = (world as unknown as { nameIndex: Map<string, string[]> }).nameIndex.get(key);
  if (list && list.length > 0) {
    const found = (world as unknown as { objects: Map<string, RuntimeObject> }).objects.get(list[0]);
    return found ?? null;
  }
  return null;
}

function cloneScriptValues(v: ObjectScriptValues | undefined): ObjectScriptValues {
  if (!v) return {};
  const out: ObjectScriptValues = {};
  for (const [sid, fields] of Object.entries(v)) {
    const cloned: ScriptValueMap = {};
    for (const [k, val] of Object.entries(fields)) {
      if (typeof val === "object" && val !== null) cloned[k] = { ...(val as Vec3) };
      else cloned[k] = val;
    }
    out[sid] = cloned;
  }
  return out;
}

function applyValues(inst: ScriptInstance, values: ScriptValueMap) {
  for (const [k, v] of Object.entries(values)) {
    // Only assign keys that already exist on the instance (i.e. that the
    // class declared). New fields stay at their class defaults; orphaned
    // values are dropped silently.
    if (k in inst) (inst as Record<string, unknown>)[k] = v as never;
  }
}
