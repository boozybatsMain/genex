export function renderReadme(projectId: string, editorUrl: string): string {
  return `# PoC Game Project

You are reading this file because you opened a folder produced by the PoC
engine's \`genex create\` command. This document is the complete contract for
working in this folder. There is no other source you need to read first.

## What this folder is

A satellite project that mirrors a single project hosted by the PoC sync
server. The browser editor at the URL below is a view on the same state.

- Editor: ${editorUrl}
- Project id: \`${projectId}\`

## What this folder is NOT

- Not the engine source. Engine code lives elsewhere; you cannot see it from
  here and you do not need to.
- Not a bundler input. Scripts are loaded individually by the runtime as
  isolated ES modules. There is no shared import graph between user scripts.
- Not a typechecked build. TypeScript types are stripped at load time. The
  IDE provides hints; the runtime does not enforce them.

## File layout

\`\`\`
.
\u251c\u2500\u2500 .genex.json            CLI config. Don't edit.
\u251c\u2500\u2500 gameDefinition.json    Scene. Single source of truth.
\u251c\u2500\u2500 engine-types.d.ts      Ambient TS declarations for IDE.
\u251c\u2500\u2500 tsconfig.json          Picks up engine-types.d.ts globally.
\u251c\u2500\u2500 README.md              This file.
\u251c\u2500\u2500 .claude/skills/        Three.js + R3F reference for AI agents.
\u2514\u2500\u2500 scripts/               *.ts files. Filename = script id.
\`\`\`

## gameDefinition.json schema

Copied verbatim from \`@poc/shared\`:

\`\`\`ts
type MeshType = "none" | "cube" | "sphere" | "cylinder";

interface Vec3 { x: number; y: number; z: number; }

interface Transform {
  position: Vec3;
  rotation: Vec3;   // Euler XYZ in radians
  scale: Vec3;
}

interface GameObjectDef {
  id: string;                         // stable, unique
  name: string;                       // not unique; used by scene.find
  transform: Transform;
  meshType: MeshType;
  scriptIds: string[];                // filenames in scripts/, no .ts
  scriptValues?: {                    // optional, omit for defaults
    [scriptId: string]: {
      [fieldName: string]: number | string | boolean | Vec3
    }
  };
}

interface GameDefinition {
  projectId: string;
  name: string;
  objects: GameObjectDef[];
}
\`\`\`

Rules:

- \`id\` must be unique within the file. Use a short random base62 string,
  e.g. \`"a7k3qm"\`. Do not reuse ids.
- \`name\` does NOT have to be unique. \`scene.find\` returns the first match
  in declaration order.
- A script id in \`scriptIds\` must reference a file at
  \`scripts/<scriptId>.ts\`. A script file that is not referenced by any
  object is dead code and may be deleted.
- \`scriptValues\` is sparse. Keys that are absent fall back to the class
  default declared in the script.

## meshType values

| value      | rendered as                          |
| ---------- | ------------------------------------ |
| \`none\`     | invisible (logic-only object)        |
| \`cube\`     | 1x1x1 box                            |
| \`sphere\`   | radius 0.5 UV sphere                 |
| \`cylinder\` | radius 0.5, height 1 cylinder        |

## Script contract

Each \`scripts/<Id>.ts\` file must \`export default\` a class. The runtime
instantiates one instance per object that references the script.

Constructor signature:

\`\`\`ts
constructor(self: ObjectHandle, scene: SceneApi);
\`\`\`

The runtime calls \`start()\` once after construction, then \`update(dt)\` every
frame while in Play Mode. \`dt\` is seconds since the last frame, clamped at
0.1.

Minimal script:

\`\`\`ts
// scripts/Rotator.ts
export default class Rotator {
  speed: number = 1;                        // inspector field

  constructor(private self: ObjectHandle, private scene: SceneApi) {}

  start() {}

  update(dt: number) {
    this.self.rotation.y += this.speed * dt;
  }
}
\`\`\`

Full-surface example (uses inspector field, scene lookup, cross-object
mutation):

\`\`\`ts
// scripts/FollowTarget.ts
export default class FollowTarget {
  targetName: string = "Player";            // inspector field
  smoothing: number = 4;                    // inspector field

  constructor(private self: ObjectHandle, private scene: SceneApi) {}

  start() {}

  update(dt: number) {
    const t = this.scene.find(this.targetName);
    if (!t) return;
    const k = Math.min(this.smoothing * dt, 1);
    this.self.position.x += (t.position.x - this.self.position.x) * k;
    this.self.position.y += (t.position.y - this.self.position.y) * k;
    this.self.position.z += (t.position.z - this.self.position.z) * k;
  }
}
\`\`\`

### Script rules

- Filename without the \`.ts\` extension IS the script id. Rename a script by
  renaming the file *and* updating every \`scriptIds\` reference.
- One \`export default class\` per file. No named exports are used.
- No \`import\` from any other user script. Each script is its own module.
  Compose behavior through \`scene.find\` and shared object names.
- Keep constructor work cheap and side-effect-free; the runtime probes a
  throwaway instance in Edit Mode to discover inspector fields.
- TypeScript types in scripts are advisory. They are stripped by \`sucrase\`
  before the script runs.

## Inspector fields

Public class fields with a default value of one of these JS types become
editable in the inspector:

| TS type / default        | inspector control          |
| ------------------------ | -------------------------- |
| \`number = 1.5\`           | numeric input              |
| \`string = "Player"\`      | text input                 |
| \`boolean = true\`         | checkbox                   |
| \`{ x, y, z } = ...\`      | three numeric inputs       |

Examples:

\`\`\`ts
export default class Demo {
  speed: number = 2;
  label: string = "Enemy";
  enabled: boolean = true;
  offset = { x: 0, y: 1, z: 0 };
  constructor(self: ObjectHandle, scene: SceneApi) {}
}
\`\`\`

Rules:

- Inferred from the value the instance reports after construction. A field
  initialized to \`null\` or \`undefined\` is NOT shown. Pick a real default.
- Fields starting with \`_\` are hidden by convention.
- The lifecycle methods \`start\` and \`update\` are skipped.
- Object references are not a supported field type in v1. Use a \`string\`
  field and look the object up at runtime via \`scene.find(this.target)\`.
- Inspector edits are persisted in \`gameDefinition.json\` under
  \`scriptValues[scriptId][fieldName]\`. They override the class default
  on every \`start()\` and on hot reload.

## Scene API

The second constructor argument is the shared, namespace-flat \`SceneApi\`.
Names are NOT unique. All handles are live: mutating \`position\`, \`rotation\`,
\`scale\`, or \`name\` on a handle mutates the real object.

\`\`\`ts
interface ObjectHandle {
  readonly id: string;
  readonly meshType: MeshType;
  name: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

interface CreateObjectOptions {
  name: string;
  meshType?: MeshType;                // default "cube"
  position?: Partial<Vec3>;
  rotation?: Partial<Vec3>;
  scale?: Partial<Vec3>;
  scriptIds?: string[];
}

interface SceneApi {
  find(name: string): ObjectHandle | null;     // first match
  findAll(name: string): ObjectHandle[];       // every match
  all(): ObjectHandle[];                       // every object, scene order
  create(opts: CreateObjectOptions): ObjectHandle;
  destroy(target: ObjectHandle | string): void;
}
\`\`\`

\`scene.create\` adds an object to the running scene only. Created objects do
not write back to \`gameDefinition.json\` and disappear when Play Mode stops.
For permanent objects, edit the JSON instead.

## Hot reload

While the editor is in Play Mode, saving any file in this folder:

1. The CLI uploads the change to the sync server.
2. The server broadcasts over WebSocket.
3. The editor applies the change. For scripts: the class is reloaded, every
   instance is re-created, persisted \`scriptValues\` are re-applied (fields
   that no longer exist are dropped, new fields keep their class defaults),
   and \`start()\` runs again.
4. For \`gameDefinition.json\`: the editor patches its state. The R3F viewport
   updates immediately in Edit Mode. See the next section for what is and
   isn't live during Play Mode.

## The script I/O surface

> **Anything observable to a script is reactable by a script.** This engine
> has no special input subsystem because it does not need one. Everything
> a human can change at runtime flows through script inspector fields, and
> scripts can read and mutate every other object's live state. The only
> genuinely unavailable primitives are visual / asset-level.

A script's complete I/O surface, per frame:

1. **\`dt\`** \u2014 seconds since last frame, passed to \`update(dt)\`. The only
   timer the engine provides; build any other timing on top.
2. **Its own inspector fields** \u2014 \`this.foo\` reads the current value,
   \`this.foo = x\` writes it. Edits made by the human in the inspector
   during Play Mode propagate to the live instance **before the next
   \`update()\`**. Edits made by other scripts via the field write back
   immediately to the same instance.
3. **The owning object's transform** \u2014 \`this.self.position / rotation /
   scale\` are live and mutable.
4. **Every other object** \u2014 via \`scene.find\`, \`scene.findAll\`, \`scene.all\`.
   Returned handles are live: reading sees current values, writing mutates
   the real object. Scripts on the other object will see the new values on
   their next \`update()\`.
5. **Existence** \u2014 \`scene.create\` to spawn a new runtime object (with a
   transform, a mesh, optional scripts), \`scene.destroy\` to remove one.

That is the whole channel list. Nothing else needs to exist to build an
interactive game in this engine.

## The inspector is the input device

The single most overlooked fact in this engine: **during Play Mode the
inspector is a live control surface, not a configuration form.** Every
inspector edit on a script field is delivered to the running instance
before the next \`update()\`. There is no separate input API because there
does not need to be.

Equivalences:

| inspector field type   | acts as                                     |
| ---------------------- | ------------------------------------------- |
| \`boolean\`              | button / toggle (read the value each frame; track \`_prev\` for edge detection) |
| \`number\`               | analog axis (slider, throttle, dial)        |
| \`{ x, y, z }\` (Vec3)   | 3D pointer / target / aim vector            |
| \`string\`               | text command channel ("fire", "reload", \u2026) |

Patterns:

- **Momentary button.** Declare \`fire: boolean = false\` and \`_prevFire:
  boolean = false\`. In \`update\`, fire the action on the rising edge:
  \`if (this.fire && !this._prevFire) { doShoot(); } this._prevFire = this.fire;\`
  The human toggles the checkbox to fire. Reset by toggling off.
- **Analog axis.** Declare \`throttle: number = 0\`. In \`update\`, integrate:
  \`this.self.position.z += this.throttle * dt\`. The human drags the
  number to drive the object.
- **3D pointer.** Declare \`targetPos = { x: 0, y: 0, z: 0 }\`. In \`update\`,
  move toward it: \`this.self.position.x += (this.targetPos.x \u2212 this.self.position.x) * dt\`.
  The human edits the vector to steer.
- **Command channel.** Declare \`command: string = ""\`. In \`update\`, parse
  and dispatch. The human types commands; clear the field after handling.

The inspector lives in the editor at the URL above. You do not need
keyboard or mouse APIs to make the game interactive \u2014 the inspector is
the interaction.

## What is genuinely unavailable

The list below is the **complete** set of things this engine does not
provide. It is short, and it is almost entirely visual / asset-level.
Anything not on this list is implementable as a script.

- **No per-object materials.** Color, opacity, metalness, and any other
  material parameter are not exposed. All objects render in the default
  shading.
- **No shaders.** You cannot write GLSL, TSL, or any custom shader.
- **No textures or model loading.** No image assets, no \`.gltf\`, no
  \`.fbx\`, no \`.obj\`, no fonts.
- **No camera control from scripts.** The camera is controlled by the
  editor's orbit controls only.
- **No raycasts.** Implement intersection tests yourself if you need them
  (see "Patterns" below for collisions).
- **No real host audio.** No \`AudioContext\` integration, no sound assets.
- **No persistence of \`scene.create\`'d objects.** Anything spawned with
  \`scene.create\` exists only for the current Play Mode session. For
  permanent objects, edit \`gameDefinition.json\`.
- **No live edits to non-scriptValue state during Play Mode.** Edits to
  object transforms, mesh types, names, scriptIds, or the object list
  itself update \`gameDefinition.json\` immediately but take effect only on
  the next Play Mode session (Tab to Edit, Tab back to Play). Inspector
  \`scriptValues\` edits ARE live; the rest are not.

That is the full list. Everything else \u2014 input, collisions, physics,
timers, scoring, save/load, AI, cross-script communication, state
machines \u2014 is in scope and is built as user-space scripts.

## Patterns: building "missing" features as scripts

Each row maps a classical engine feature to the user-space pattern that
implements it on top of the I/O surface above. None of these require any
engine change.

| feature                | pattern                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Buttons / fire / pause | \`boolean\` inspector field + \`_prev\` rising-edge detection in \`update\`.                              |
| Joysticks / throttle   | \`number\` or \`Vec3\` inspector field read every \`update\`.                                             |
| Aiming / target        | \`Vec3\` inspector field interpreted as world-space pointer.                                          |
| Text commands          | \`string\` inspector field parsed in \`update\`; clear after handling.                                  |
| Collision detection    | A \`Collider\` script holding a \`radius: number\` per object + a single \`CollisionManager\` script on an empty (\`meshType: "none"\`) object iterating \`scene.all()\` each frame. |
| Physics (gravity etc.) | A \`Body\` script holding \`velocity = { x, y, z }\`, integrating against \`this.self.position\` each frame; a manager script applies forces. |
| Timers / cooldowns     | Accumulate \`dt\` into a \`_cooldown\` field on the script. No global timer API needed.                 |
| Scoring / HUD          | A \`Score\` script on an empty object with public \`score: number\`. Other scripts \`scene.find("Score").position.x = 0\` or mutate inspector fields directly via \`scene.find(...).scale.x\` etc. The score VALUE is human-readable in the inspector. |
| Save / load            | Read \`gameDefinition.json\` as the save file. Inspector fields are persisted there automatically.    |
| Cross-script comms     | Put shared state on a well-known object (e.g. \`scene.find("GameState")\`) and read/write via its inspector fields or transform components. There is no event bus; use polling. |
| AI / enemy behavior    | A script per agent reading \`scene.find("Player").position\` each frame, mutating its own transform.   |
| State machines         | A \`mode: string\` inspector field + a switch in \`update\`. The human can override the mode for debug. |
| Audio (visual only)    | You cannot play sound, but you CAN show "audio" cues by mutating an object's \`scale\` (visual ping) or by setting a \`string\` field on a HUD object. |

Worked example: sphere-vs-sphere overlap detection.

\`\`\`ts
// scripts/Collider.ts
export default class Collider {
  radius: number = 0.5;                              // inspector field
  constructor(self: ObjectHandle, scene: SceneApi) {}
}
\`\`\`

\`\`\`ts
// scripts/CollisionManager.ts
export default class CollisionManager {
  constructor(private self: ObjectHandle, private scene: SceneApi) {}

  start() {}

  update(_dt: number) {
    const objs = this.scene.all();
    for (let i = 0; i < objs.length; i++) {
      for (let j = i + 1; j < objs.length; j++) {
        const a = objs[i], b = objs[j];
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const dz = a.position.z - b.position.z;
        if (dx*dx + dy*dy + dz*dz < 1.0) this.onOverlap(a, b);
      }
    }
  }

  onOverlap(a: ObjectHandle, b: ObjectHandle) {
    a.position.x += 0.05;
    b.position.x -= 0.05;
  }
}
\`\`\`

Attach \`Collider\` to every object that should collide; attach
\`CollisionManager\` to one dedicated empty (\`meshType: "none"\`) object.

Worked example: an interactive game with a human-in-the-loop.

\`\`\`ts
// scripts/PlayerRod.ts
// A "fishing rod". The human casts and reels by toggling inspector fields.
export default class PlayerRod {
  castNow: boolean = false;         // toggle ON to cast (rising edge fires)
  reelSpeed: number = 0;            // analog: how fast to reel in
  aim = { x: 0, y: 0, z: 1 };       // 3D pointer: cast direction

  private _prevCast: boolean = false;
  private _line: number = 0;        // current line length

  constructor(private self: ObjectHandle, private scene: SceneApi) {}

  update(dt: number) {
    if (this.castNow && !this._prevCast) {
      this._line = 5;
      this.scene.create({
        name: "Hook",
        meshType: "sphere",
        position: {
          x: this.self.position.x + this.aim.x * this._line,
          y: this.self.position.y + this.aim.y * this._line,
          z: this.self.position.z + this.aim.z * this._line,
        },
      });
    }
    this._prevCast = this.castNow;

    this._line = Math.max(0, this._line - this.reelSpeed * dt);
    const hook = this.scene.find("Hook");
    if (hook) {
      hook.position.x = this.self.position.x + this.aim.x * this._line;
      hook.position.y = this.self.position.y + this.aim.y * this._line;
      hook.position.z = this.self.position.z + this.aim.z * this._line;
      if (this._line === 0) this.scene.destroy(hook);
    }
  }
}
\`\`\`

The human casts by toggling \`castNow\`, aims by editing \`aim\`, and reels
by dragging \`reelSpeed\` up and back to zero. No autonomous behavior \u2014
the game is fully driven by the human's inspector edits, which is the
intended way to make any interactive game in this engine.

## Workflow

\`\`\`
1. Start the editor:   npm run dev                          (in the monorepo)
2. Open this project:  genex create .                       (in this folder)
3. Edit files in your IDE. Save.
4. Press Tab in the editor to toggle Play Mode.
5. While in Play Mode, edit inspector fields to interact with the game.
\`\`\`

## You may, and should, modify the scene

You are expected to:

- Add new objects directly to \`gameDefinition.json\`. Assign a fresh random
  id, e.g. \`"q2x8af"\`. Names may repeat.
- Create new files in \`scripts/\`. The filename without \`.ts\` is the id.
- Wire them up by adding the id to one or more objects' \`scriptIds\` array.
- Seed initial inspector values via \`scriptValues\`. Omit \`scriptValues\` or
  any subkey to fall back to the class default.
- Delete objects you no longer need.
- Delete script files that are no longer referenced by any object.

The CLI's file watcher will pick up your changes and propagate them to the
editor within ~200 ms. There is no separate "apply" step.

## Conventions for AI agents

- \`gameDefinition.json\` is the source of truth for the scene. Never infer
  scene state from script source.
- Filename = script id. Rename the file AND every \`scriptIds\` reference
  together, in a single change.
- Do not \`import\` between user scripts. Use \`scene.find\` or shared object
  names instead.
- Inspector fields are inferred from the value the instance holds after
  construction. Always give a real default; \`null\` / \`undefined\` hides the
  field.
- A script not referenced by any object's \`scriptIds\` is dead code.
- **Do not refuse or downgrade a game feature on the grounds that "the
  engine doesn't support it" without first checking the script I/O surface
  and the "Patterns" table above.** The only true prohibitions are the
  short list under "What is genuinely unavailable". Everything else \u2014
  input, collisions, physics, scoring, AI, state machines, save/load \u2014 is
  in scope and is built as user-space scripts on top of script inspector
  fields and the Scene API.
- **Antipattern.** If you find yourself building an autonomous version of
  a game the user described as interactive (e.g. fish that auto-catch
  themselves, a car that drives itself, a fight that resolves with no
  input), you have misread this document. Stop, reread "The inspector is
  the input device" and the "Patterns" table, and redesign the game so a
  human drives it via inspector fields. The inspector is the interaction.
- Keep \`README.md\` accurate. If you grow the engine, update the
  "What is genuinely unavailable" list in the same change.
`;
}
