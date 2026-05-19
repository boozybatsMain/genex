import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  GameDefinition,
  GameObjectDef,
  InspectorFieldValue,
  MeshType,
  ScriptRecord,
  Transform,
} from "@poc/shared";
import { BUILTIN_CAMERA_ID, ensureBuiltins } from "@poc/shared";
import { getActiveRuntime } from "../runtime/RuntimeWorld";

export type Mode = "edit" | "play";

interface EditorState {
  projectId: string | null;
  definition: GameDefinition | null;
  /** Set when the most recent definition change came from a remote source (CLI). */
  lastDefinitionChangeWasRemote: boolean;
  scripts: Map<string, ScriptRecord>;
  cliAbsPath: string | null;
  selectedId: string | null;
  mode: Mode;
  runtimeSnapshot: GameDefinition | null;

  setProject: (
    def: GameDefinition,
    scripts: ScriptRecord[],
    cliAbsPath: string | null,
  ) => void;
  applyRemoteDefinition: (def: GameDefinition) => void;
  upsertScript: (s: ScriptRecord) => void;
  setCliAbsPath: (p: string | null) => void;

  addObject: () => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  patchObject: (id: string, patch: Partial<Omit<GameObjectDef, "id">>) => void;
  attachScript: (objectId: string, scriptId: string) => void;
  detachScript: (objectId: string, scriptId: string) => void;
  setScriptValue: (
    objectId: string,
    scriptId: string,
    field: string,
    value: InspectorFieldValue,
  ) => void;

  setMode: (m: Mode) => void;
  setRuntimeSnapshot: (d: GameDefinition | null) => void;
}

const defaultTransform = (): Transform => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

export const useEditor = create<EditorState>((set) => ({
  projectId: null,
  definition: null,
  lastDefinitionChangeWasRemote: false,
  scripts: new Map(),
  cliAbsPath: null,
  selectedId: null,
  mode: "edit",
  runtimeSnapshot: null,

  setProject: (definition, scripts, cliAbsPath) => {
    const withBuiltins = ensureBuiltins(definition);
    set({
      projectId: withBuiltins.projectId,
      definition: withBuiltins,
      // Even if we injected the camera locally, this is still effectively a
      // "remote-ish" load so we don't want to immediately bounce it back to
      // the server in the same tick. The next user edit clears the flag.
      lastDefinitionChangeWasRemote: withBuiltins === definition,
      scripts: new Map(scripts.map((s) => [s.id, s])),
      cliAbsPath,
    });
  },

  applyRemoteDefinition: (definition) =>
    set({
      definition: ensureBuiltins(definition),
      lastDefinitionChangeWasRemote: true,
    }),

  upsertScript: (s) =>
    set((st) => {
      const next = new Map(st.scripts);
      next.set(s.id, s);
      return { scripts: next };
    }),

  setCliAbsPath: (p) => set({ cliAbsPath: p }),

  addObject: () =>
    set((st) => {
      if (!st.definition) return st;
      const obj: GameObjectDef = {
        id: nanoid(6),
        name: `Object ${st.definition.objects.length + 1}`,
        transform: defaultTransform(),
        meshType: "cube" as MeshType,
        scriptIds: [],
      };
      return {
        definition: {
          ...st.definition,
          objects: [...st.definition.objects, obj],
        },
        selectedId: obj.id,
        lastDefinitionChangeWasRemote: false,
      };
    }),

  removeObject: (id) =>
    set((st) => {
      if (!st.definition) return st;
      const target = st.definition.objects.find((o) => o.id === id);
      // Built-in objects (e.g. the default Camera) can't be removed.
      if (!target || target.builtin || id === BUILTIN_CAMERA_ID) return st;
      return {
        definition: {
          ...st.definition,
          objects: st.definition.objects.filter((o) => o.id !== id),
        },
        selectedId: st.selectedId === id ? null : st.selectedId,
        lastDefinitionChangeWasRemote: false,
      };
    }),

  selectObject: (id) => set({ selectedId: id }),

  patchObject: (id, patch) =>
    set((st) => ({
      definition: st.definition
        ? {
            ...st.definition,
            objects: st.definition.objects.map((o) => {
              if (o.id !== id) return o;
              // Keep meshType/builtin pinned on builtin objects so the user
              // can't accidentally turn the Camera into a cube.
              if (o.builtin) {
                const { meshType: _ignored, builtin: _b, ...safe } = patch as Partial<GameObjectDef>;
                return { ...o, ...safe };
              }
              return { ...o, ...patch };
            }),
          }
        : null,
      lastDefinitionChangeWasRemote: false,
    })),

  attachScript: (objectId, scriptId) =>
    set((st) => ({
      definition: st.definition
        ? {
            ...st.definition,
            objects: st.definition.objects.map((o) =>
              o.id === objectId && !o.scriptIds.includes(scriptId)
                ? { ...o, scriptIds: [...o.scriptIds, scriptId] }
                : o,
            ),
          }
        : null,
      lastDefinitionChangeWasRemote: false,
    })),

  detachScript: (objectId, scriptId) =>
    set((st) => ({
      definition: st.definition
        ? {
            ...st.definition,
            objects: st.definition.objects.map((o) => {
              if (o.id !== objectId) return o;
              const nextValues = { ...(o.scriptValues ?? {}) };
              delete nextValues[scriptId];
              return {
                ...o,
                scriptIds: o.scriptIds.filter((s) => s !== scriptId),
                scriptValues: nextValues,
              };
            }),
          }
        : null,
      lastDefinitionChangeWasRemote: false,
    })),

  setScriptValue: (objectId, scriptId, field, value) => {
    set((st) => ({
      definition: st.definition
        ? {
            ...st.definition,
            objects: st.definition.objects.map((o) => {
              if (o.id !== objectId) return o;
              const existing = o.scriptValues ?? {};
              const existingForScript = existing[scriptId] ?? {};
              return {
                ...o,
                scriptValues: {
                  ...existing,
                  [scriptId]: { ...existingForScript, [field]: value },
                },
              };
            }),
          }
        : null,
      lastDefinitionChangeWasRemote: false,
    }));
    // If we're currently in Play Mode, push the change to the live instance
    // too so the field updates without restarting the script.
    const w = getActiveRuntime();
    if (w) w.applyScriptValue(objectId, scriptId, field, value);
  },

  setMode: (mode) => set({ mode }),
  setRuntimeSnapshot: (runtimeSnapshot) => set({ runtimeSnapshot }),
}));
