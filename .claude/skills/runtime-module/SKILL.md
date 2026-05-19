---
name: runtime-module
description: Complete guide and code templates for creating runtime modules. Use when implementing any new game mechanic as a runtime module.
---

# Runtime Module Creation Guide

## Overview

A **runtime module** is a self-contained game mechanic that runs on the server inside `RuntimeEngine`. Each module follows a **two-file pattern**:

1. **Core class** (`xxxModule.ts`) — all game logic, event subscriptions, state writing
2. **Adapter** (`xxxModule.adapter.ts`) — bridges the core class to the module registry, declares actions/config/metadata

**Module ID convention**: `Category/Name@version` (e.g., `Racing/LapTracker@1`, `Objectives/CaptureFlag@1`)

**State flow**: Core class → `RuntimeStore.setModuleState()` → Colyseus Schema sync → `NetworkBridge` (client) → `useModuleStateStore` (Zustand) → Widget components

## Quick Start Checklist

All 14 registration points for a new module:

### Shared Package (`packages/shared/src/runtime/module-configs.ts`)
1. [ ] Define Zod config schema with `.meta()` labels
2. [ ] Export inferred TypeScript type
3. [ ] Add module ID to `runtimeModuleIds` array
4. [ ] Add schema to `runtimeModuleConfigSchemas` map
5. [ ] Add entry to `runtimeModuleObjectEntrySchema` discriminated union

### Runtime Package (`packages/runtime/`)
6. [ ] Add events to `RuntimeEventMap` in `src/runtimeEvents.ts`
7. [ ] Create core module class in `src/modules/xxxModule.ts`
8. [ ] Create adapter in `src/modules/xxxModule.adapter.ts`
9. [ ] Add side-effect import to `src/registerModules.ts`
10. [ ] Add side-effect import to `src/registerBuiltInRuntimeModules.ts`
11. [ ] Export snapshot type from `src/index.ts`

### Client (optional, for HUD widget)
12. [ ] Add `containerType` to enum in `packages/shared/src/game/gameDefinition/gameDefinition.schema.ts`
13. [ ] Create specialized widget component in `apps/client1/src/components/widgets/specialized/`
14. [ ] Register in `WidgetRenderer.tsx` (CORNER_TYPES, DEFAULT_CORNER_POSITIONS, switch case)

---

## Step 1: Config Schema

**File**: `packages/shared/src/runtime/module-configs.ts`

Add your config schema after the last existing module schema (currently `captureFlagConfigSchema`). Four registration points in this file:

### 1a. Schema Definition

```typescript
// Category/ModuleName Module
export const myModuleConfigSchema = z.object({
  someSetting: z.string().default('default_value')
    .meta({ label: 'Setting label', hint: 'Tooltip hint for editor' }),
  someNumber: z.number().min(0).default(10)
    .meta({ label: 'Number setting' }),
  someBoolean: z.boolean().default(false)
    .meta({ label: 'Toggle label' }),
  someArray: z.array(z.string().min(1)).min(1)
    .meta({ label: 'Array setting', hint: 'Description' }),
  someEnum: z.enum(['option1', 'option2']).default('option1')
    .meta({ label: 'Enum setting' }),
});
export type MyModuleConfig = z.infer<typeof myModuleConfigSchema>;
```

**Key patterns:**
- Always use `.meta({ label: '...' })` — the editor reads these for the UI
- Use `.default()` for optional fields — modules parse config with `schema.parse(rawConfig ?? {})`
- Use `.min()` for validation constraints

### 1b. Module ID Registration

Add to `runtimeModuleIds` array:
```typescript
export const runtimeModuleIds = [
  // ... existing modules
  'Category/ModuleName@1',  // ← add here
] as const;
```

### 1c. Config Schema Map

Add to `runtimeModuleConfigSchemas`:
```typescript
export const runtimeModuleConfigSchemas: Record<RuntimeModuleId, z.ZodTypeAny> = {
  // ... existing entries
  'Category/ModuleName@1': myModuleConfigSchema,  // ← add here
};
```

### 1d. Discriminated Union Entry

Add to `runtimeModuleObjectEntrySchema`:
```typescript
export const runtimeModuleObjectEntrySchema = z.discriminatedUnion('id', [
  // ... existing entries
  z.object({
    id: z.literal('Category/ModuleName@1'),
    config: myModuleConfigSchema.optional(),
  }),  // ← add here
]);
```

---

## Step 2: Event Declarations

**File**: `packages/runtime/src/runtimeEvents.ts`

Add new events to the `RuntimeEventMap` type. Events are organized by category with comments.

```typescript
export type RuntimeEventMap = {
  // ... existing events

  // MyModule events
  'mymodule.started': RuntimeEventPayload;
  'mymodule.completed': {
    playerId: string;
    score: number;
  };
};
```

**Guidelines:**
- Use `RuntimeEventPayload` (`Record<string, unknown>`) for loosely-typed events
- Use explicit interfaces for events consumed by other modules (type safety)
- Event names use dot notation: `category.action` (e.g., `race.checkpoint`, `flag.captured`)

---

## Step 3: Core Module Class

**File**: `packages/runtime/src/modules/xxxModule.ts`

```typescript
import { EventBus } from '../eventBus';
import type { RuntimeEventMap, RuntimeEventPayload } from '../runtimeEvents';
import type { RuntimeContext } from '../types';
import type { MyModuleConfig } from '@not-ai-game/shared';

const MODULE_STATE_KEY = 'Category/ModuleName@1';

// Internal state types (not exported)
type InternalPlayerState = {
  score: number;
  // ...
};

// Exported snapshot type — this is what widgets/consumers read
export type MyModuleSnapshot = {
  phase: 'idle' | 'active' | 'finished';
  players: Record<string, InternalPlayerState>;
  // ...
};

export class MyModule {
  private readonly subscriptions: Array<() => void> = [];
  private readonly players = new Map<string, InternalPlayerState>();
  // ... other internal state

  constructor(
    private readonly bus: EventBus<RuntimeEventMap>,
    private readonly config: MyModuleConfig,
  ) {}

  /**
   * Subscribe to events and initialize state.
   * Called once when the module is registered by the adapter.
   */
  register(context: RuntimeContext): void {
    // Subscribe to typed events via bus.on()
    this.subscriptions.push(
      this.bus.on('volume.enter', (payload, ctx) => this.handleVolumeEnter(payload, ctx)),
      this.bus.on('player.joined', (payload, ctx) => this.handlePlayerJoined(payload, ctx)),
      this.bus.on('player.left', (payload, ctx) => this.handlePlayerLeft(payload, ctx)),
    );

    // Subscribe to untyped/dynamic events via bus.onAny()
    this.subscriptions.push(
      this.bus.onAny(this.config.startOnEvent, (_payload, ctx) => this.handleStart(ctx)),
      this.bus.onAny('vehicle.state', (payload, ctx) => this.handleVehicleState(payload, ctx)),
    );

    // Publish initial state
    this.syncModuleState(context);
  }

  /**
   * Called every simulation tick (16ms default).
   * Use for time-based logic (timers, countdowns, elapsed tracking).
   */
  tick(dt: number, context: RuntimeContext): void {
    // Update timers, countdowns, etc.
    // Call syncModuleState() to push updates to clients
    this.syncModuleState(context);
  }

  /**
   * Cleanup all event subscriptions.
   */
  dispose(): void {
    for (const unsub of this.subscriptions) {
      unsub();
    }
    this.subscriptions.length = 0;
  }

  // --- Public action handlers (called from adapter) ---

  handleStart(context: RuntimeContext): void {
    // Initialize game state, transition phase
    this.syncModuleState(context);
  }

  handleReset(context: RuntimeContext): void {
    // Reset all state
    this.players.clear();
    this.syncModuleState(context);
  }

  // --- Private event handlers ---

  private handleVolumeEnter(
    payload: RuntimeEventMap['volume.enter'],
    context: RuntimeContext,
  ): void {
    const { objectId, actorId, objectTags } = payload;
    if (!actorId) return;
    // Match by objectTags for flexibility (vs objectId for exact match)
    // ...
  }

  private handlePlayerJoined(
    payload: RuntimeEventMap['player.joined'],
    context: RuntimeContext,
  ): void {
    const { playerId } = payload;
    // Add to tracking
  }

  private handlePlayerLeft(
    payload: RuntimeEventMap['player.left'],
    context: RuntimeContext,
  ): void {
    const { playerId } = payload;
    // Remove from tracking, recompute state
  }

  private handleVehicleState(
    payload: RuntimeEventPayload,
    context: RuntimeContext,
  ): void {
    // Cache vehicle telemetry (speed, etc.)
    const driverId = payload.driverId as string | undefined;
    const telemetry = payload.telemetry as { speed?: number } | undefined;
    // ...
  }

  // --- State publishing ---

  private syncModuleState(context: RuntimeContext): void {
    const snapshot: MyModuleSnapshot = {
      phase: 'active',
      players: Object.fromEntries(this.players),
    };
    context.runtimeStore.setModuleState(
      MODULE_STATE_KEY,
      snapshot as unknown as Record<string, unknown>,
    );
  }
}
```

**Key patterns:**
- `bus.on('event', handler)` — typed events (events declared with explicit payload types in RuntimeEventMap)
- `bus.onAny('event', handler)` — untyped/dynamic events (e.g., configurable event names, `RuntimeEventPayload`)
- Always push subscription unsubscribe functions to `this.subscriptions` array
- `dispose()` iterates and calls all unsubscribers, then clears the array
- `syncModuleState()` writes the full snapshot to `RuntimeStore` — this triggers Colyseus schema sync

---

## Step 4: Adapter

**File**: `packages/runtime/src/modules/xxxModule.adapter.ts`

```typescript
import { z } from 'zod';
import { myModuleConfigSchema, type MyModuleConfig } from '@not-ai-game/shared';
import { registerRuntimeModule } from '../moduleRegistry';
import type { RuntimeModule, RuntimeModuleHandle } from '../types';
import { MyModule } from './myModule';

// Action payload validators (optional, for actions with parameters)
const someActionSchema = z.object({
  playerId: z.string().min(1),
});

export const createMyModuleAdapter = ({
  bus,
}: { bus: any }): RuntimeModule<MyModuleConfig> => {
  return {
    id: 'Category/ModuleName@1',
    register(context, rawConfig) {
      const config = myModuleConfigSchema.parse(rawConfig ?? {});
      const module = new MyModule(bus, config);
      module.register(context);

      const handle: RuntimeModuleHandle = {
        dispose: () => module.dispose(),
        tick: (dt, ctx) => module.tick(dt, ctx),
        actions: {
          'mymodule.start': async (ctx, _payload) => module.handleStart(ctx),
          'mymodule.reset': async (ctx, _payload) => module.handleReset(ctx),
        },
        actionValidators: {
          // Only needed for actions with parameters
          'mymodule.someAction': (payload) => someActionSchema.parse(payload),
        },
      };
      return handle;
    },
  };
};

// Side-effect registration — runs when file is imported
registerRuntimeModule('Category/ModuleName@1', createMyModuleAdapter, {
  actions: ['mymodule.start', 'mymodule.reset'],
  actionSchemas: {
    'mymodule.start': { type: 'object', properties: {} },
    'mymodule.reset': { type: 'object', properties: {} },
  },
  configSchema: z.toJSONSchema(myModuleConfigSchema, { target: 'draft-7' }),
  stateSurface: ['moduleState.Category/ModuleName@1'],
  dependencies: ['Interaction/TriggerVolume@1'],  // modules this depends on
  events: ['mymodule.started', 'mymodule.completed'],  // events this emits
});
```

**Metadata fields:**
- `actions` — action IDs the trigger system can invoke
- `actionSchemas` — JSON Schema for action payloads (for editor validation)
- `configSchema` — JSON Schema of the config (for editor form generation)
- `stateSurface` — module state keys this writes to (for dependency tracking)
- `dependencies` — other module IDs that must be present for this module to work
- `events` — event names this module emits (for documentation)

---

## Step 5: Registration

Two files need side-effect imports:

### `packages/runtime/src/registerModules.ts`
```typescript
import './modules/myModule.adapter';  // ← add at end
```

### `packages/runtime/src/registerBuiltInRuntimeModules.ts`
```typescript
import './modules/myModule.adapter';  // ← add at end (before closing)
```

### `packages/runtime/src/index.ts`
```typescript
export type { MyModuleSnapshot } from './modules/myModule';  // ← add export
```

---

## Step 6: Widget Integration (Optional)

If the module needs a specialized HUD widget:

### 6a. Add containerType

**File**: `packages/shared/src/game/gameDefinition/gameDefinition.schema.ts`

Add to the `containerType` enum:
```typescript
containerType: z.enum([
  'modal', 'panel-left', 'panel-right', 'corner',
  // ... existing types
  'my-widget',  // ← add here
])
```

### 6b. MODULE_ID_MAPPING (optional)

**File**: `apps/client1/src/hooks/world/useWidgetDataSources.ts`

If widgets need JSONPath data binding to this module's state:
```typescript
const MODULE_ID_MAPPING: Record<string, string> = {
  // ... existing entries
  'Category/ModuleName@1': 'myalias',  // ← add here
};
```

### 6c. Create Specialized Widget

**File**: `apps/client1/src/components/widgets/specialized/MyWidget.tsx`

```tsx
import { memo } from 'react';
import type { ReactNode } from 'react';
import type { UiWidget } from '@not-ai-game/shared';
import { useModuleStateStore } from '@/stores/moduleState.store';
import { useNetworkStore } from '@/stores/network.store';
import { useTestPlayerStore } from '@/stores/testPlayer.store';

export const MyWidget = memo(function MyWidget({
  widget: _widget,
}: { widget: UiWidget }): ReactNode {
  // Read module state directly from Zustand store
  const moduleState = useModuleStateStore((s) => {
    const entry = s.entries.get('Category/ModuleName@1');
    if (!entry) return null;
    return entry.state as Record<string, unknown>;
  });

  // Resolve current player ID — works in BOTH published and draft modes
  // Published (Colyseus): sessionId is the network session ID
  // Draft: sessionId is null, fall back to activeCharacterId ('player-1' or 'test-player-N')
  const networkSessionId = useNetworkStore((s) => s.sessionId);
  const activeCharacterId = useTestPlayerStore((s) => s.activeCharacterId);
  const playerId = networkSessionId ?? activeCharacterId;

  if (!moduleState) return null;

  // Extract typed fields from state
  const phase = moduleState.phase as string;
  const players = moduleState.players as Record<string, Record<string, unknown>> | undefined;
  const myState = playerId && players ? players[playerId] : null;

  return (
    <div className="flex flex-col gap-1.5 font-kode-mono widget-text-shadow pointer-events-none" data-hud>
      {/* Widget content here — cyberpunk minimalist, no backgrounds */}
    </div>
  );
});
```

**CRITICAL — Player ID resolution for draft + published modes:**
- **NEVER** use `useNetworkStore((s) => s.sessionId)` alone — it's `null` in draft mode
- **ALWAYS** fall back to `useTestPlayerStore((s) => s.activeCharacterId)` for draft mode
- Pattern: `const playerId = networkSessionId ?? activeCharacterId;`
- This handles: published mode (Colyseus session ID), draft single player (`'player-1'`), and draft multi-player (`'test-player-N'` when controlling a test character)

**Design guidelines (from ui-widgets skill):**
- Kode Mono font (`font-kode-mono`)
- No widget backgrounds — floating text with `widget-text-shadow`
- Corner radial gradients provide readability (handled by WidgetRenderer)
- `pointer-events-none` + `data-hud` attribute
- Use CSS animations for state transitions (position changes, score bumps)

### 6d. Register in WidgetRenderer

**File**: `apps/client1/src/components/widgets/WidgetRenderer.tsx`

Three changes:

```typescript
// 1. Import
import { MyWidget } from './specialized/MyWidget';

// 2. Add to CORNER_TYPES set
const CORNER_TYPES = new Set([
  'corner', 'stats-bar', 'ammo-counter', 'minimap', 'kill-feed', 'zone-info',
  'my-widget',  // ← add here
]);

// 3. Add default corner position
const DEFAULT_CORNER_POSITIONS: Record<string, CornerPosition> = {
  // ... existing entries
  'my-widget': 'bottom-left',  // ← add here
};

// 4. Add to CornerSpecializedItem switch
case 'my-widget':
  return <MyWidget widget={widget} />;
```

### 6e. CSS Animations (optional)

**File**: `apps/client1/src/components/widgets/widgets.css`

Add animations following existing patterns (see zone-phase-glow, widget-scale-bump).

---

## Step 7: Integration Tests

**File**: `apps/server/src/rooms/ModuleName.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import '@not-ai-game/runtime/registerModules';
import { SandboxRoom } from './SandboxRoom';
import type { GameDefinitionSchemaType, ObjectSchemaType } from '@not-ai-game/shared';
import { globalPrisma } from '../prisma/client';
import { WorldType } from '@prisma/client';

async function resetDb(): Promise<void> {
  await globalPrisma.world.deleteMany();
}

async function upsertWorldDefinition(
  worldId: string,
  definition: GameDefinitionSchemaType,
): Promise<void> {
  await globalPrisma.world.upsert({
    where: { id: worldId },
    create: {
      id: worldId,
      name: worldId,
      slug: worldId,
      ownerId: 'system',
      type: WorldType.PUBLISHED,
      definition: definition as any,
    },
    update: {
      definition: definition as any,
    },
  });
}

// Helper to split objects into prefabs + instances
function prefabizeObjects(objects: ObjectSchemaType[]) {
  return {
    prefabs: objects.map((o) => ({
      id: `prefab-${o.id}`,
      baseObject: { ...o, id: `prefab-${o.id}` },
      variants: [],
    })),
    worldObjects: objects.map((o) => ({
      id: o.id,
      prefabId: `prefab-${o.id}`,
      transform: o.transform,
      overrides: {},
    })),
  };
}

describe('Category/ModuleName@1 integration', () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    await resetDb();
    colyseus = await boot({
      initializeGameServer: (gs) => {
        gs.define('test-world', SandboxRoom);
      },
    });
  });

  afterAll(async () => {
    await colyseus?.shutdown();
  }, 120_000);

  // Setup world definition with modules + objects
  beforeAll(async () => {
    const definition: GameDefinitionSchemaType = {
      metadata: { title: 'Test', authorId: 'system' },
      modules: [
        { id: 'Category/ModuleName@1', config: { /* ... */ } },
      ],
      ...prefabizeObjects([/* test objects */]),
      triggers: [],
      events: [],
      tests: [],
      npcs: [],
      mechanics: [],
      worldSpec: { metadata: { name: 'test', seed: 1 }, generators: [], overrides: [] },
    };
    await upsertWorldDefinition('test-world', definition);
  });

  it('handles basic lifecycle', async () => {
    const room = (await colyseus.createRoom('test-world', {})) as SandboxRoom;
    const client = await colyseus.connectTo(room);

    // Wait for initialization
    for (let i = 0; i < 10; i++) await room.waitForNextPatch();

    // Emit events to simulate gameplay
    room.runtime.emitAny('some.event', { playerId: client.sessionId });

    // Wait for state updates
    for (let i = 0; i < 5; i++) await room.waitForNextPatch();

    // Assert module state
    const state = room.state.moduleState.get('Category/ModuleName@1');
    expect(state).toBeDefined();

    client.leave();
  }, 15_000);
});
```

**Key patterns:**
- `resetDb()` clears test data
- `upsertWorldDefinition()` creates world with modules and objects
- `prefabizeObjects()` converts flat objects to prefab + instance format
- `room.runtime.emitAny()` simulates events (volume.enter, player actions)
- `room.waitForNextPatch()` waits for state sync
- `room.state.moduleState.get()` reads module state

---

## State Writing Patterns

### How state flows through the system

```
Core Module (server)
  → context.runtimeStore.setModuleState(key, snapshot)
  → Colyseus Schema sync (automatic)
  → NetworkBridge (client) subscribes to moduleState changes
  → useModuleStateStore (Zustand) updates entries Map
  → Widget components select from store
```

### setModuleState

```typescript
context.runtimeStore.setModuleState(
  MODULE_STATE_KEY,           // e.g., 'Racing/LapTracker@1'
  snapshot as unknown as Record<string, unknown>,
);
```

- The key should match your module ID
- The snapshot must be a plain object (no Map/Set — serialize to arrays/records)
- Call this in `tick()` for continuous updates, or in event handlers for discrete updates
- Each call triggers a Colyseus schema patch → client receives update

### Composite keys (advanced)

For per-player state visible only to that player, use composite keys:
```typescript
context.runtimeStore.setModuleState(`${MODULE_STATE_KEY}:${playerId}`, playerState);
```

---

## Common Pitfalls

1. **Using `useNetworkStore` sessionId without draft-mode fallback** — `useNetworkStore((s) => s.sessionId)` is `null` in draft mode (no Colyseus). Per-player widget lookups like `racers[sessionId]` silently fail and return `undefined`. **ALWAYS** use:
   ```tsx
   const networkSessionId = useNetworkStore((s) => s.sessionId);
   const activeCharacterId = useTestPlayerStore((s) => s.activeCharacterId);
   const playerId = networkSessionId ?? activeCharacterId;
   ```
   This handles published mode (Colyseus session ID), draft single-player (`'player-1'`), and draft multi-player (`'test-player-N'`).

2. **Forgetting a registration point** — There are 4 places in `module-configs.ts` (schema, type, ids array, config map, union). Missing any one causes type errors or runtime registration failures.

2. **Not serializing Maps/Sets** — `setModuleState` needs plain objects. Use `Object.fromEntries(map)` and `[...set]`.

3. **Subscribing without tracking** — Every `bus.on()` / `bus.onAny()` must push its return value to `this.subscriptions`. Forgetting causes memory leaks and ghost handlers after dispose.

4. **Using `bus.on()` for dynamic event names** — `bus.on()` only works for events in `RuntimeEventMap`. For configurable event names (like `config.startOnEvent`), use `bus.onAny()`.

5. **Missing side-effect imports** — Both `registerModules.ts` AND `registerBuiltInRuntimeModules.ts` need the adapter import. Missing either causes "module not found" errors depending on the entry point.

6. **Not calling `syncModuleState()` after state changes** — State only reaches clients when you explicitly write to `RuntimeStore`. Every event handler that modifies internal state should call `syncModuleState()`.

7. **Triggering React re-renders from useFrame** — Widget components reading from `useModuleStateStore` are fine (Zustand handles this). But never call `setState` inside `useFrame`.

8. **Missing containerType in schema** — If you add a new widget type, it must be in the `containerType` enum in `gameDefinition.schema.ts` or the editor will reject it.

9. **Checkpoint detection: objectId vs objectTags** — Use `objectTags` array matching for flexibility (designer-friendly). Use `objectId` matching only when you need exact object identity (like CTF flag spawns).

10. **Sequential validation** — For ordered checkpoint systems, validate that the player hit checkpoint N-1 before accepting checkpoint N. Without this, players can skip checkpoints.

---

## Multiplayer Phase-Gating & Late Joiners

When a module uses phase-gating (e.g., only registering players during `idle`/`countdown`), late joiners who connect during `racing` or `finished` will be silently ignored. This causes bugs where late players see stale state (0 km/h, stuck at lap 1/3).

### The `lateJoiners` Pattern

Both `eliminationModule.ts` and `lapTrackerModule.ts` use a `lateJoiners: Set<string>` to track players who joined after the active phase started:

```typescript
private readonly lateJoiners = new Set<string>();

private handlePlayerJoined(payload, context): void {
  const playerId = String(payload.playerId ?? '');
  if (!playerId) return;

  if (this.phase === 'idle' || this.phase === 'countdown') {
    this.ensurePlayer(playerId);  // Full registration
  } else if (this.phase === 'racing' || this.phase === 'finished') {
    this.lateJoiners.add(playerId);  // Track but don't register
  }
  this.syncModuleState(context);
}
```

**Key rules:**
- Clear `lateJoiners` in `handleReset()` alongside other state
- Remove from `lateJoiners` in `handlePlayerLeft()`
- Serialize to array in snapshot: `lateJoiners: [...this.lateJoiners]`
- Batch register all connected players at phase transitions using `context.physics.getCharacters()`

### Client-Side Spectator Integration

Late joiners enter spectator mode via `useSpectatorMode.ts`:
- Watch for local player in `lateJoiners` array from module state
- Enter spectator immediately (no delay) targeting the first active player
- On phase reset to `idle`, clear spectator and death lock
- Cycling targets fall back from elimination `alivePlayers` to racing active racers

### Snapshot Fields for Lobby State

Include lobby information in the module snapshot so widgets can show appropriate UI:
```typescript
lobbyWaiting: this.phase === 'idle' && characters.length < this.config.minPlayers,
connectedPlayerCount: characters.length,
minPlayers: this.config.minPlayers,
lateJoiners: [...this.lateJoiners],
finishedRacers: [...this.racers.values()].filter(r => r.finished).map(r => r.playerId),
```

---

## Reference Example: Racing/LapTracker@1

The Racing/LapTracker@1 module serves as the canonical example:

| Component | File |
|-----------|------|
| Config schema | `packages/shared/src/runtime/module-configs.ts` (search for `lapTrackerModuleConfigSchema`) |
| Events | `packages/runtime/src/runtimeEvents.ts` (search for `race.`) |
| Core class | `packages/runtime/src/modules/lapTrackerModule.ts` |
| Adapter | `packages/runtime/src/modules/lapTrackerModule.adapter.ts` |
| Widget | `apps/client1/src/components/widgets/specialized/RaceHudWidget.tsx` |
| Tests | `apps/server/src/rooms/Racing.test.ts` |

Other good reference modules:
- **Volume-based detection**: `captureFlagModule.ts` — uses `bus.on('volume.enter', ...)` with `objectId` matching
- **Per-player tracking**: `eliminationModule.ts` — tracks alive/eliminated sets, handles joins/leaves
- **Time-based logic**: `timerModule.ts` — countdown/stopwatch in `tick()`
- **Widget pattern**: `ZoneInfoWidget.tsx` — reads multiple module states directly from Zustand store
