import type { GameDefinition } from "@poc/shared";

/**
 * Ambient TypeScript declarations dropped into each new project so user
 * scripts get IntelliSense without needing to install `@poc/shared` locally.
 * The runtime ignores types entirely; this file is for the IDE only.
 */
export const ENGINE_TYPES_DTS = `// Ambient types for user scripts. The runtime strips TS before execution;
// these declarations are here purely for editor IntelliSense.

declare type MeshType = "none" | "cube" | "sphere" | "cylinder";

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

declare interface SceneApi {
  find(name: string): ObjectHandle | null;
  findAll(name: string): ObjectHandle[];
  all(): ObjectHandle[];
  create(opts: CreateObjectOptions): ObjectHandle;
  destroy(target: ObjectHandle | string): void;
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

/**
 * Build a sensible starter scene with two objects, one of which references
 * the starter script and has an inspector value override.
 */
export function buildStarterDefinition(
  base: GameDefinition,
): GameDefinition {
  if (base.objects.length > 0) return base; // don't overwrite real state
  return {
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
  };
}
