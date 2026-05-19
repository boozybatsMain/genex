# Changelog

## Unreleased

### Editor requires an explicit project

Opening the editor without a `?projectId=` in the URL no longer silently
creates a fresh project on the server. Instead, the editor shows a blocking
modal with copy-pasteable CLI commands and refuses to render the UI until a
project is loaded. This keeps the server's project list clean and makes the
"the CLI is the way in" story unambiguous.

### CLI: new `edit` command

`npx @boozybats/genex edit <dir>` re-attaches to an existing project in
`<dir>`. It requires `<dir>/.genex.json` to exist (created by `genex create`)
and errors out cleanly otherwise, pointing users at `genex create`. Behaviour
when the project exists is identical to `genex create` re-running on the same
folder — `edit` just enforces the precondition.

### Breaking-ish: new script contract

The script runtime now passes a **second argument** to every user-script
constructor: the shared scene API.

```ts
// old
constructor(self) { ... }

// new
constructor(self, scene) { ... }
```

Old single-argument scripts keep working — JavaScript ignores the extra
argument — but new scripts should accept and store `scene` to use the
cross-script lookup features below.

### Cross-script scene API

A flat, namespace-shared `SceneApi` is injected as the second constructor
argument:

```ts
interface SceneApi {
  find(name: string): ObjectHandle | null;     // first match
  findAll(name: string): ObjectHandle[];       // all matches, scene order
  all(): ObjectHandle[];                        // every object
  create(opts: CreateObjectOptions): ObjectHandle;
  destroy(target: ObjectHandle | string): void;
}
```

- Names are NOT unique. `find` returns the first match in scene-iteration
  order.
- Handles are live — mutating `.position`, `.rotation`, `.scale`, `.name`
  affects the real object.
- `scene.create` adds an object to the running scene only. It is not
  persisted to `gameDefinition.json` and disappears when Play Mode stops.
  For permanent objects, edit the JSON.

### Inspector fields (Unity-style)

Public class fields with primitive defaults (`number`, `string`, `boolean`,
or `{x, y, z}` vector) are now rendered as editable inputs in the editor's
right panel, grouped per script per object. Edits are persisted in
`gameDefinition.json` under a new optional per-object key:

```ts
interface GameObjectDef {
  // ...
  scriptValues?: {
    [scriptId: string]: {
      [fieldName: string]: number | string | boolean | { x: number; y: number; z: number };
    };
  };
}
```

On `start()` the runtime applies `scriptValues` to the instance before user
code runs, overriding the class default. On hot reload, persisted values are
re-applied for fields that still exist; fields that no longer exist are
silently dropped; new fields keep their class defaults.

Editing a field while in Play Mode mutates the running instance immediately,
without restarting it.

Migration: definitions without `scriptValues` continue to load. The field is
optional and defaults to an empty map per object.

### CLI changes

- `genex create <dir>` on a **fresh** folder now seeds a working starter
  scene (one sphere named `"Sun"`, one cube named `"Player"` running
  `PlayerCharacter.ts`) plus the starter script itself. Existing folders
  (with a `.genex.json`) are not re-seeded.
- New files written by `genex create` (if absent):
  - `engine-types.d.ts` — ambient TypeScript declarations for IDE
    IntelliSense (`ObjectHandle`, `SceneApi`, `Vec3`, `MeshType`).
  - `tsconfig.json` — picks up the ambient declarations.
- README template rewritten as a self-contained onboarding doc for an AI
  agent opening the folder cold. Full API surface and a worked
  "implement-missing-features-as-scripts" pattern are inline.

### Wire protocol

`PutScriptReq` gained an optional `origin` field that mirrors the existing
`PutDefinitionReq.origin`, used for echo suppression on `script:updated`
broadcasts. Backward compatible — older clients omit it and the server tags
the broadcast as `origin: "unknown"`.
