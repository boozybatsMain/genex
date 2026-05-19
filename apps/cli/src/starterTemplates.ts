import type { GameDefinition } from "@poc/shared";
import { BUILTIN_CAMERA_ID, ensureBuiltins } from "@poc/shared";

/**
 * Ambient TypeScript declarations dropped into each new project so user
 * scripts get IntelliSense without needing to install `@poc/shared` locally.
 * The runtime ignores types entirely; this file is for the IDE only.
 */
export const ENGINE_TYPES_DTS = `// Ambient types for user scripts. The runtime strips TS before execution;
// these declarations are here purely for editor IntelliSense.

declare type MeshType = "none" | "cube" | "sphere" | "cylinder" | "camera";

declare interface Vec3 {
  x: number;
  y: number;
  z: number;
}

declare interface ObjectHandle {
  readonly id: string;
  readonly meshType: MeshType;
  name: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

declare interface CreateObjectOptions {
  name: string;
  meshType?: MeshType;
  position?: Partial<Vec3>;
  rotation?: Partial<Vec3>;
  scale?: Partial<Vec3>;
  scriptIds?: string[];
}

declare interface InputApi {
  /** True if the key is currently held. Use \`KeyboardEvent.code\` values
   *  like "KeyW", "ArrowUp", "Space", "ShiftLeft". */
  key(code: string): boolean;
  /** True only on the frame the key was first pressed. */
  keyPressed(code: string): boolean;
  /** True only on the frame the key was released. */
  keyReleased(code: string): boolean;
  /** Mouse button held: 0 = left, 1 = middle, 2 = right. */
  mouseButton(btn: number): boolean;
  mouseButtonPressed(btn: number): boolean;
  mouseButtonReleased(btn: number): boolean;
  /** Mouse motion since last frame (pixels, or pointer-lock deltas). */
  readonly mouseDeltaX: number;
  readonly mouseDeltaY: number;
  /** Scroll wheel delta accumulated this frame. */
  readonly wheelDelta: number;
  /** Capture the mouse for FPS-style mouselook. */
  lockPointer(): void;
  unlockPointer(): void;
  readonly pointerLocked: boolean;
}

declare interface SceneApi {
  find(name: string): ObjectHandle | null;
  findAll(name: string): ObjectHandle[];
  all(): ObjectHandle[];
  create(opts: CreateObjectOptions): ObjectHandle;
  destroy(target: ObjectHandle | string): void;
  /** The built-in Camera. Mutate its transform to move the Play view. */
  readonly camera: ObjectHandle;
  /** Per-frame input snapshot — keys, mouse, wheel, pointer lock. */
  readonly input: InputApi;
}
`;

export const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": false,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": false,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["scripts/**/*.ts", "engine-types.d.ts"]
}
`;

export const STARTER_SCRIPT_ID = "PlayerCharacter";
export const STARTER_SCRIPT_FILENAME = `${STARTER_SCRIPT_ID}.ts`;

export const STARTER_SCRIPT_SOURCE = `// PlayerCharacter.ts
//
// Starter script: rotates the object it is attached to, and orbits around
// another object whose name is set in the inspector. Demonstrates inspector
// fields and the Scene API.

export default class PlayerCharacter {
  // Inspector fields ---------------------------------------------------------
  speed: number = 1.5;
  orbitRadius: number = 2;
  orbitTargetName: string = "Sun";
  spin: boolean = true;

  // Internal state. Names starting with "_" are hidden from the inspector.
  private _t: number = 0;

  constructor(private self: ObjectHandle, private scene: SceneApi) {}

  start() {
    console.log("[PlayerCharacter] start on", this.self.name);
  }

  update(dt: number) {
    this._t += dt * this.speed;

    const target = this.scene.find(this.orbitTargetName);
    if (target) {
      this.self.position.x = target.position.x + Math.cos(this._t) * this.orbitRadius;
      this.self.position.z = target.position.z + Math.sin(this._t) * this.orbitRadius;
    }

    if (this.spin) {
      this.self.rotation.y += dt * 2;
    }
  }
}
`;

export const CAMERA_CONTROLLER_SCRIPT_ID = "CameraController";
export const CAMERA_CONTROLLER_SCRIPT_FILENAME = `${CAMERA_CONTROLLER_SCRIPT_ID}.ts`;

/**
 * Default first-person controller for the built-in Camera. Implements
 * WASD movement, mouse-look (with pointer lock via left-click) and
 * Space / Shift for vertical motion. Users can tweak the inspector fields
 * or replace the script entirely.
 */
export const CAMERA_CONTROLLER_SCRIPT_SOURCE = `// CameraController.ts
//
// Drives the built-in Camera in Play Mode. WASD = move, mouse = look
// (left-click to capture, Esc to release), Space / Shift = up/down,
// Q / E = roll. Replace this script or tweak the fields below to taste.

export default class CameraController {
  // Inspector ---------------------------------------------------------------
  moveSpeed: number = 5;
  sprintMultiplier: number = 2.5;
  mouseSensitivity: number = 0.0025;
  invertY: boolean = false;

  // Internals ---------------------------------------------------------------
  private _yaw: number = 0;
  private _pitch: number = 0;

  constructor(private self: ObjectHandle, private scene: SceneApi) {}

  start() {
    // Seed yaw/pitch from the initial transform so the user can pose the
    // camera in the editor and have it pick up from there.
    this._yaw = this.self.rotation.y;
    this._pitch = this.self.rotation.x;
  }

  update(dt: number) {
    const input = this.scene.input;

    // Arm pointer-lock on press; the runtime acquires it on this very
    // mousedown so the gesture-required browser policy is satisfied.
    if (input.mouseButtonPressed(0) && !input.pointerLocked) {
      input.lockPointer();
    }

    // Mouselook --------------------------------------------------------------
    if (input.pointerLocked) {
      this._yaw -= input.mouseDeltaX * this.mouseSensitivity;
      const dy = input.mouseDeltaY * this.mouseSensitivity * (this.invertY ? -1 : 1);
      this._pitch -= dy;
      // Clamp pitch so we can't somersault.
      const HALF_PI = Math.PI / 2 - 0.01;
      if (this._pitch > HALF_PI) this._pitch = HALF_PI;
      if (this._pitch < -HALF_PI) this._pitch = -HALF_PI;
    }
    this.self.rotation.x = this._pitch;
    this.self.rotation.y = this._yaw;

    // Movement (camera-relative) ---------------------------------------------
    const speed =
      this.moveSpeed *
      (input.key("ShiftLeft") || input.key("ShiftRight")
        ? this.sprintMultiplier
        : 1);

    let fx = 0;
    let fz = 0;
    if (input.key("KeyW") || input.key("ArrowUp")) fz -= 1;
    if (input.key("KeyS") || input.key("ArrowDown")) fz += 1;
    if (input.key("KeyA") || input.key("ArrowLeft")) fx -= 1;
    if (input.key("KeyD") || input.key("ArrowRight")) fx += 1;

    if (fx !== 0 || fz !== 0) {
      const len = Math.hypot(fx, fz);
      fx /= len;
      fz /= len;
      const sin = Math.sin(this._yaw);
      const cos = Math.cos(this._yaw);
      const wx = fx * cos + fz * sin;
      const wz = -fx * sin + fz * cos;
      this.self.position.x += wx * speed * dt;
      this.self.position.z += wz * speed * dt;
    }

    if (input.key("Space")) this.self.position.y += speed * dt;
    if (input.key("ControlLeft") || input.key("ControlRight"))
      this.self.position.y -= speed * dt;
  }
}
`;

/**
 * Build a sensible starter scene with two objects, one of which references
 * the starter script and has an inspector value override. The built-in
 * Camera is guaranteed by \`ensureBuiltins\` and arrives pre-wired with the
 * \`CameraController\` script so Play Mode is immediately playable.
 */
export function buildStarterDefinition(
  base: GameDefinition,
): GameDefinition {
  if (base.objects.length > 0) return ensureBuiltins(base);
  const seeded: GameDefinition = ensureBuiltins({
    ...base,
    objects: [
      {
        id: "sun_001",
        name: "Sun",
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        meshType: "sphere",
        scriptIds: [],
        scriptValues: {},
      },
      {
        id: "player_001",
        name: "Player",
        transform: {
          position: { x: 2, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        meshType: "cube",
        scriptIds: [STARTER_SCRIPT_ID],
        scriptValues: {
          [STARTER_SCRIPT_ID]: {
            speed: 1.5,
            orbitRadius: 2,
            orbitTargetName: "Sun",
            spin: true,
          },
        },
      },
    ],
  });
  // Attach the CameraController to the freshly-injected built-in camera.
  return {
    ...seeded,
    objects: seeded.objects.map((o) =>
      o.id === BUILTIN_CAMERA_ID && o.scriptIds.length === 0
        ? {
            ...o,
            scriptIds: [CAMERA_CONTROLLER_SCRIPT_ID],
            scriptValues: {
              [CAMERA_CONTROLLER_SCRIPT_ID]: {
                moveSpeed: 5,
                sprintMultiplier: 2.5,
                mouseSensitivity: 0.0025,
                invertY: false,
              },
            },
          }
        : o,
    ),
  };
}
