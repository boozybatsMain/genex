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
type MeshType = "none" | "cube" | "sphere" | "cylinder" | "camera";

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
  builtin?: boolean;                  // engine-managed, can't be deleted
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
- \`builtin: true\` objects (currently just the default Camera, id
  \`"__camera__"\`) are inserted by the engine, can't be removed from the
  hierarchy, and have a pinned \`meshType\`. You CAN attach scripts to them
  and edit their transform / scriptValues like any other object.

## meshType values

| value      | rendered as                                    |
| ---------- | ---------------------------------------------- |
| \`none\`     | invisible (logic-only object)                  |
| \`cube\`     | 1x1x1 box                                      |
| \`sphere\`   | radius 0.5 UV sphere                           |
| \`cylinder\` | radius 0.5, height 1 cylinder                  |
| \`camera\`   | reserved for the built-in Camera object — the  |
|            | play-mode view. Renders as a wireframe gizmo   |
|            | in Edit Mode, invisible in Play Mode.          |

## The built-in Camera + Play Mode

Every project has an undeletable object named \`Camera\` with id
\`"__camera__"\` and \`meshType: "camera"\`. **Its transform IS the Play Mode
view.** When the user presses Tab to enter Play Mode:

- The editor hides all UI panels (hierarchy, inspector, toolbar) and the
  viewport takes over the entire window. The only way out is Tab.
- The editor's camera snaps to the built-in Camera object's pose and
  tracks it every frame. Scene-object selection clicks are disabled —
  every mouse / keyboard event flows into \`scene.input\`.
- The CameraController (or whichever script you attach to the camera)
  drives the view from there.

Scripts can drive the camera the same way they drive any other object —
by mutating \`this.self.position\` and \`this.self.rotation\` on a script
attached to the Camera, or by mutating \`scene.camera.position\` etc. from
any other script.

Fresh projects ship with a \`CameraController.ts\` script attached to the
camera that implements WASD + mouse-look + Space/Ctrl for vertical motion.
Replace it, tweak its inspector fields, or detach it and write your own.

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
  readonly camera: ObjectHandle;               // built-in Camera handle
  readonly input: InputApi;                    // per-frame input snapshot
}
\`\`\`

\`scene.create\` adds an object to the running scene only. Created objects do
not write back to \`gameDefinition.json\` and disappear when Play Mode stops.
For permanent objects, edit the JSON instead.

\`scene.camera\` is the live handle for the built-in Camera object. It's the
same handle you'd get from \`scene.find("Camera")\`; provided as a stable
shortcut so a script that doesn't own the camera can still drive the view
(e.g. cinematic cutscenes, screen-shake, third-person rigs).

\`scene.destroy\` refuses to destroy the built-in Camera.

## Player input — keyboard, mouse, wheel, pointer lock

**The engine has a first-class input API.** Scripts read keyboard, mouse,
and wheel state from \`scene.input\` every \`update(dt)\`. This is the
ONLY supported way to read raw user input — but it's a complete one. Build
WASD movers, FPS aim, RTS click-to-move, racing games, anything.

\`\`\`ts
interface InputApi {
  // Held state. Use KeyboardEvent.code values, e.g. "KeyW", "Space",
  // "ShiftLeft", "ArrowUp", "Digit1".
  key(code: string): boolean;
  // True only on the frame the key transitioned up -> down / down -> up.
  // Use for "fire on press", menu toggles, jump impulses, etc.
  keyPressed(code: string): boolean;
  keyReleased(code: string): boolean;

  // Mouse buttons: 0 = left, 1 = middle, 2 = right.
  mouseButton(btn: number): boolean;
  // True only on the frame the button transitioned up -> down / down -> up.
  mouseButtonPressed(btn: number): boolean;
  mouseButtonReleased(btn: number): boolean;

  // Mouse motion since last frame, in pixels. With pointer lock enabled
  // (typical FPS pattern), these are raw movement deltas with no cursor
  // bounds.
  readonly mouseDeltaX: number;
  readonly mouseDeltaY: number;

  // Scroll wheel delta accumulated this frame (positive = scroll down).
  readonly wheelDelta: number;

  // FPS-style mouselook: capture the cursor so the user can rotate freely
  // without hitting screen edges. Press Esc to release. Most controllers
  // call lockPointer() on the first left-click.
  lockPointer(): void;
  unlockPointer(): void;
  readonly pointerLocked: boolean;
}
\`\`\`

Key codes follow the DOM \`KeyboardEvent.code\` spec — physical key, not the
character produced. \`"KeyW"\` is W regardless of the layout. Full reference:
https://developer.mozilla.org/docs/Web/API/UI_Events/Keyboard_event_code_values

### Minimal WASD + mouselook camera

\`\`\`ts
// scripts/MyCamera.ts — attach to the built-in Camera.
export default class MyCamera {
  speed: number = 5;
  sensitivity: number = 0.0025;

  private _yaw = 0;
  private _pitch = 0;

  constructor(private self: ObjectHandle, private scene: SceneApi) {}

  start() {
    this._yaw = this.self.rotation.y;
    this._pitch = this.self.rotation.x;
  }

  update(dt: number) {
    const inp = this.scene.input;

    if (inp.mouseButtonPressed(0) && !inp.pointerLocked) inp.lockPointer();
    if (inp.pointerLocked) {
      this._yaw -= inp.mouseDeltaX * this.sensitivity;
      this._pitch -= inp.mouseDeltaY * this.sensitivity;
    }
    this.self.rotation.x = this._pitch;
    this.self.rotation.y = this._yaw;

    let fx = 0, fz = 0;
    if (inp.key("KeyW")) fz -= 1;
    if (inp.key("KeyS")) fz += 1;
    if (inp.key("KeyA")) fx -= 1;
    if (inp.key("KeyD")) fx += 1;
    if (fx || fz) {
      const len = Math.hypot(fx, fz);
      const cos = Math.cos(this._yaw), sin = Math.sin(this._yaw);
      this.self.position.x += ((fx/len) * cos + (fz/len) * sin) * this.speed * dt;
      this.self.position.z += (-(fx/len) * sin + (fz/len) * cos) * this.speed * dt;
    }
    if (inp.key("Space")) this.self.position.y += this.speed * dt;
    if (inp.key("ControlLeft")) this.self.position.y -= this.speed * dt;
  }
}
\`\`\`

### Input idioms

| pattern                | code                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| Hold to move           | \`if (inp.key("KeyW")) pos.z -= speed * dt\`                       |
| Fire on press          | \`if (inp.keyPressed("Space")) shoot()\`                           |
| Toggle on release      | \`if (inp.keyReleased("KeyM")) showMap = !showMap\`                |
| Right-click to aim     | \`if (inp.mouseButton(2)) zoom = 0.5\`                             |
| Zoom on scroll         | \`this.fov -= inp.wheelDelta * 0.01\`                              |
| Hotbar 1..9            | \`for (let i=1;i<=9;i++) if (inp.keyPressed(\\\`Digit\${i}\\\`)) ...\` |
| Sprint w/ Shift        | \`const s = inp.key("ShiftLeft") ? 2 : 1\`                         |

### Direct \`window\` / \`document\` access

Scripts run in the same JS realm as the editor — every browser global is
reachable. The \`scene.input\` API is the recommended path because the
runtime polls it at the right phase (between frames) and zeroes deltas
for you, but you are NOT sandboxed. You can do any of the following if
you need something the input API doesn't surface:

\`\`\`ts
start() {
  this._onTouch = (e: TouchEvent) => { /* mobile */ };
  window.addEventListener("touchstart", this._onTouch);

  this._onPaste = (e: ClipboardEvent) => { /* read clipboard */ };
  window.addEventListener("paste", this._onPaste);

  // Gamepads
  this._pollGamepad = () => {
    const pads = navigator.getGamepads();
    if (pads[0]) this.stickX = pads[0].axes[0];
  };
}

update(dt: number) {
  this._pollGamepad();
}
\`\`\`

**You MUST remove every listener you add.** The runtime tears down the
script class on Play Mode stop and on hot reload, but it cannot reach
listeners you registered on \`window\`. Save the function reference and
remove it in a custom cleanup (call it from the next \`start()\` of the
re-instantiated class, since \`start\` runs again on hot reload):

\`\`\`ts
start() {
  // Hot reload re-runs start() on a fresh instance, but the previous
  // instance's listeners are still attached. Clean them up via a known
  // global key so the new instance can find and remove them.
  const KEY = "__myScriptCleanup__";
  if ((window as any)[KEY]) (window as any)[KEY]();

  const onKey = (e: KeyboardEvent) => { /* ... */ };
  window.addEventListener("keydown", onKey);

  (window as any)[KEY] = () => window.removeEventListener("keydown", onKey);
}
\`\`\`

Other globals worth knowing about:

- \`navigator.getGamepads()\` — gamepad axes & buttons. Standard mapping at
  https://developer.mozilla.org/docs/Web/API/Gamepad_API.
- \`window.matchMedia\`, \`window.innerWidth\`/\`innerHeight\` — adapt to
  viewport size. There is no per-frame "resize" event in the input API,
  poll if you need it.
- \`document.visibilityState\` — pause the game when the tab is hidden.
- \`navigator.clipboard.readText()\` — gated by the browser permission
  prompt; only useful as a deliberate user action.
- \`Audio\`, \`AudioContext\` — yes, you can play sound by constructing an
  \`Audio\` element or an \`AudioContext\` in \`start()\`. The engine does not
  ship an audio asset pipeline, but you can use data URIs or fetch
  bundled samples from a CDN.
- \`fetch\` — talk to any HTTP API. Useful for high-scores, multiplayer
  rooms, LLM-driven NPCs, etc.

If a feature only exists in the browser globals, USE the browser globals.
Don't refuse the feature; just remember the cleanup contract.

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

A script's complete I/O surface, per frame:

1. **\`dt\`** \u2014 seconds since last frame, passed to \`update(dt)\`. The only
   timer the engine provides; build any other timing on top.
2. **\`scene.input\`** \u2014 keyboard, mouse, wheel, and pointer-lock state. See
   the "Player input" section above. This is the primary channel for
   real-time player control (WASD, mouse-aim, hotkeys, shooting, etc.).
3. **Its own inspector fields** \u2014 \`this.foo\` reads the current value,
   \`this.foo = x\` writes it. Edits made by the human in the inspector
   during Play Mode propagate to the live instance **before the next
   \`update()\`**. Edits made by other scripts via the field write back
   immediately to the same instance. Inspector fields are good for tuning
   constants live (speeds, radii, modes) and for debug overrides;
   keyboard / mouse are the right channel for second-by-second input.
4. **The owning object's transform** \u2014 \`this.self.position / rotation /
   scale\` are live and mutable.
5. **Every other object** \u2014 via \`scene.find\`, \`scene.findAll\`, \`scene.all\`.
   Returned handles are live: reading sees current values, writing mutates
   the real object. Scripts on the other object will see the new values on
   their next \`update()\`.
6. **The built-in Camera** \u2014 via \`scene.camera\` (or
   \`scene.find("Camera")\`). Mutating its transform moves the Play view.
7. **Existence** \u2014 \`scene.create\` to spawn a new runtime object (with a
   transform, a mesh, optional scripts), \`scene.destroy\` to remove one.
8. **Browser globals** \u2014 \`window\`, \`document\`, \`navigator\`, \`fetch\`,
   \`Audio\`, etc. are all reachable. Use them for things outside the
   built-in input API (gamepads, touch, clipboard, network calls,
   sound). See "Direct \`window\` / \`document\` access" above for the
   cleanup contract.

That is the whole channel list.

## Inspector as a live debug surface

In addition to real-time input via \`scene.input\`, **during Play Mode the
inspector is a live control surface for tuning script fields.** Every
inspector edit on a script field is delivered to the running instance
before the next \`update()\`. Use it to:

- Tune numbers live (movement speed, jump height, enemy aggression) while
  the player is actually playing.
- Toggle debug visualisations on/off via a \`boolean\` field.
- Drive an in-progress feature with a manual slider before wiring it up
  to a real input.
- Override state for testing (set \`health: 9999\` for a god-mode pass).

Inspector fields are NOT a substitute for real input. Player-facing input
goes through the keyboard / mouse API. Inspector fields are for the
**developer** (and the AI agent) to peek and poke at the running game.

| inspector field type   | typical use                                 |
| ---------------------- | ------------------------------------------- |
| \`boolean\`              | feature flag / debug toggle / cheat        |
| \`number\`               | tuning constant (speed, radius, etc.)       |
| \`{ x, y, z }\` (Vec3)   | spawn point / target waypoint               |
| \`string\`               | mode name, target name, debug command       |

## What is genuinely unavailable

The list below is the **complete** set of things this engine does not
provide as a first-class feature. Anything not on this list is
implementable as a script (and most of the items below are still
implementable via direct browser-global access, just without engine
support).

- **No per-object materials.** Color, opacity, metalness, and any other
  material parameter are not exposed. All objects render in the default
  shading.
- **No shaders.** You cannot write GLSL, TSL, or any custom shader.
- **No textures or model loading.** No image assets, no \`.gltf\`, no
  \`.fbx\`, no \`.obj\`, no fonts. (You can still \`fetch\` data and use it.)
- **No raycasts.** Implement intersection tests yourself if you need them
  (see "Patterns" below for collisions).
- **No engine-managed audio assets.** You CAN play sounds by constructing
  an \`Audio\` / \`AudioContext\` directly in \`start()\` \u2014 the engine just
  doesn't bundle an asset pipeline for them.
- **No persistence of \`scene.create\`'d objects.** Anything spawned with
  \`scene.create\` exists only for the current Play Mode session. For
  permanent objects, edit \`gameDefinition.json\`.
- **No live edits to non-scriptValue state during Play Mode.** Edits to
  object transforms, mesh types, names, scriptIds, or the object list
  itself update \`gameDefinition.json\` immediately but take effect only on
  the next Play Mode session (Tab to Edit, Tab back to Play). Inspector
  \`scriptValues\` edits ARE live; the rest are not.

That is the full list. Everything else \u2014 input, collisions, physics,
timers, scoring, camera control, save/load, AI, cross-script
communication, state machines, networking, audio \u2014 is in scope and is
built as user-space scripts.

## Patterns: building "missing" features as scripts

Each row maps a classical engine feature to the user-space pattern that
implements it on top of the I/O surface above. None of these require any
engine change.

| feature                | pattern                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| WASD movement          | \`scene.input.key("KeyW") / "KeyA" / "KeyS" / "KeyD"\` in \`update\`, integrate into \`this.self.position\`. |
| Jump / fire on press   | \`if (scene.input.keyPressed("Space")) ...\` for one-shot actions.                                   |
| Mouse aim / FPS look   | \`scene.input.lockPointer()\` on first click, then \`mouseDeltaX / mouseDeltaY\` each frame.            |
| Mouse-look on the camera | Attach the script to the built-in Camera and mutate \`this.self.rotation\`. See \`CameraController.ts\`. |
| Camera follow / chase   | Any script can do \`scene.camera.position.x = player.position.x + offset\` each frame.                |
| Gamepad                | \`navigator.getGamepads()\` polled in \`update\`. Axes 0/1 = left stick, 2/3 = right stick (standard mapping). |
| Touch / mobile         | \`window.addEventListener("touchstart", ...)\` in \`start()\`, remember to remove on hot reload.       |
| Debug tuning           | \`number\` / \`boolean\` inspector field read every \`update\` \u2014 lets the dev/AI tune the game while it runs. |
| Collision detection    | A \`Collider\` script holding a \`radius: number\` per object + a single \`CollisionManager\` script on an empty (\`meshType: "none"\`) object iterating \`scene.all()\` each frame. |
| Physics (gravity etc.) | A \`Body\` script holding \`velocity = { x, y, z }\`, integrating against \`this.self.position\` each frame; a manager script applies forces. |
| Timers / cooldowns     | Accumulate \`dt\` into a \`_cooldown\` field on the script. No global timer API needed.                 |
| Scoring / HUD          | A \`Score\` script on an empty object with public \`score: number\`. Other scripts \`scene.find("Score").position.x = 0\` or mutate inspector fields directly via \`scene.find(...).scale.x\` etc. The score VALUE is human-readable in the inspector. |
| Save / load            | Read \`gameDefinition.json\` as the save file. Inspector fields are persisted there automatically. For runtime saves use \`localStorage\`. |
| Cross-script comms     | Put shared state on a well-known object (e.g. \`scene.find("GameState")\`) and read/write via its inspector fields or transform components. There is no event bus; use polling. |
| AI / enemy behavior    | A script per agent reading \`scene.find("Player").position\` each frame, mutating its own transform.   |
| State machines         | A \`mode: string\` inspector field + a switch in \`update\`. The human can override the mode for debug. |
| Audio                  | Construct an \`Audio\` element in \`start()\` and call \`.play()\` from \`update\` on the right events. Clean up the element on hot reload. |
| Networking / HTTP      | \`fetch\` from \`start()\` or \`update\` to talk to any HTTP API \u2014 leaderboards, multiplayer rooms, LLM endpoints, etc. |

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
  input, collisions, physics, scoring, AI, state machines, save/load,
  audio, networking \u2014 is in scope and is built as user-space scripts on
  top of \`scene.input\`, the Scene API, and direct browser globals.
- **The default interaction model is keyboard + mouse, NOT inspector
  fields.** If the user asks for an interactive game, your default is
  \`scene.input.key(...)\` / \`mouseDeltaX\` / \`keyPressed\`, with the
  CameraController-style pattern. Reach for inspector fields only when
  the input is a tuning constant (sensitivity, speed) or a debug toggle,
  not when it's a per-frame player action.
- **Antipattern.** If the user describes an interactive game and you ship
  a version that needs the human to toggle a checkbox to fire or drag a
  number to walk, you have misread this document. Stop and use the
  keyboard / mouse API. Inspector fields are for the developer to tune
  the live game, not for the player to play it.
- The built-in Camera (\`name: "Camera"\`, \`id: "__camera__"\`) is the Play
  Mode view. You CAN attach scripts to it. The default project ships with
  \`CameraController.ts\` already attached; replace, extend, or detach it
  as needed. You cannot delete the Camera object itself.
- Scripts can register listeners on \`window\` / \`document\` / \`navigator\`
  but MUST clean them up across hot reload (see "Direct window / document
  access" above). The runtime cannot reach them for you.
- Keep \`README.md\` accurate. If you grow the engine, update the
  "What is genuinely unavailable" list in the same change.
`;
}
