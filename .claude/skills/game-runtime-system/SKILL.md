---
name: game-runtime-system
description: >
  Deep architectural reference for the game runtime system: RuntimeEngine,e
  EventBus, TriggerEngine, ActionExecutor, module adapter pattern, physics
  event bridges, template variable resolution, scope-based filter evaluation,
  game definition → runtime mapping, server-client event flow, Colyseus state
  sync, and the complete published-world lifecycle. Use this skill to understand
  HOW the trigger/event/module system works internally, not just how to author
  triggers (see triggers skill for authoring patterns).
---

# Game Runtime System — Architecture Reference

================================================================================

## 1. SYSTEM OVERVIEW

================================================================================

The runtime system transforms a static **GameDefinition JSON** into a live,
interactive multiplayer game. The core pipeline is:

```
GameDefinition (JSON)
  → RuntimeEngine (server-side orchestrator)
    → EventBus (synchronous pub/sub)
    → TriggerEngine (evaluates when-conditions)
    → ActionExecutor (dispatches actions to handlers)
    → Module Handles (registered action handlers)
    → Physics Event Bridges (collision → runtime events)
  → Colyseus State Sync (server → client)
    → NetworkBridge (client receives state)
    → Widget Data Sources (UI renders module state)
```

**Key principle:** The runtime runs server-side only. The client receives state
updates via Colyseus schema sync. Triggers never evaluate on the client.

### Source Files

| Component            | File                                                            |
| -------------------- | --------------------------------------------------------------- |
| RuntimeEngine        | `packages/runtime/src/runtimeEngine.ts`                         |
| EventBus             | `packages/runtime/src/eventBus.ts`                              |
| TriggerEngine        | `packages/runtime/src/triggerEngine.ts`                         |
| ActionExecutor       | `packages/runtime/src/actionExecutor.ts`                        |
| Template Utils       | `packages/runtime/src/templateUtils.ts`                         |
| Runtime Events       | `packages/runtime/src/runtimeEvents.ts`                         |
| Module Configs       | `packages/shared/src/runtime/module-configs.ts`                 |
| Action Types         | `packages/shared/src/game/triggers/triggerActionTypes.ts`       |
| Module Registration  | `packages/runtime/src/registerBuiltInRuntimeModules.ts`         |
| Server Room          | `apps/server/src/rooms/sandbox.room.ts`                         |
| Client NetworkBridge | `apps/client1/src/components/canvas/gameplay/NetworkBridge.tsx` |
| Client GameLoop      | `apps/client1/src/components/canvas/gameplay/GameLoop.tsx`      |

================================================================================

## 2. GAME DEFINITION → RUNTIME MAPPING

================================================================================

A GameDefinition (manifest.json) contains the declarative description of the
game. The RuntimeEngine reads this at startup and wires everything together.

### Game Definition Top-Level Structure

```json
{
  "metadata": { "name": "My Game", "description": "...", "version": "1.0.0" },
  "camera": { "type": "shooter", "config": {} },
  "environment": { "preset": "dust2", "skybox": null },
  "modules": [
    { "id": "Social/TeamState@1", "config": { "teams": ["red", "blue"] } },
    { "id": "Vitals/CharacterStats@1", "config": { "stats": [...] } },
    { "id": "Objectives/ScoreTracker@1", "config": {} }
  ],
  "prefabs": [
    { "id": "coin-prefab", "geometry": {...}, "material": {...}, "physics": { "mode": "fixed" }, "isSensor": true, "tags": ["coin"] }
  ],
  "worldObjects": [
    { "id": "coin-1", "prefabId": "coin-prefab", "transform": {...} }
  ],
  "triggers": [
    { "id": "coin-pickup", "when": [...], "actions": [...] }
  ],
  "ui": {
    "widgets": [
      { "type": "team-scoreboard", "config": {...} }
    ]
  }
}
```

### What RuntimeEngine Extracts at Startup

1. **modules[]** → Creates module handles via factory registry
2. **triggers[]** → Normalized through `gameDefinitionTriggerSchema`, then passed to TriggerEngine
3. **worldObjects[]** → Loaded into physics (via PhysicsManager)
4. **prefabs[]** → Referenced by worldObjects for shape/material/physics
5. **Vehicle configs** → Extracted from VehicleModule configs if present

### Module Initialization Order

```
1. registerBuiltInRuntimeModules()     // side-effect imports register factories
2. RuntimeEngine constructor:
   a. Create EventBus
   b. Create ActionExecutor
   c. Normalize triggers from definition (`triggerDefinitionUtils.normalizeTriggerDefinitions`)
   d. Extract vehicle configs
   e. Listen for team.joined events
   f. initializeModulesFromRegistry()  // create module handles, register actions
   g. registerBuiltInActions()         // register core actions (state.set, hitscan.fire, etc.)
   h. registerEventActionBridges()     // wire up event→action flows
   i. Create TriggerEngine (subscribes to events)
   j. mountPhysicsEventBridges()       // physics callbacks → runtime events
```

**Trigger validation boundary:** Runtime normalizes trigger definitions before mounting
so schema defaults such as `filters: []` and `operator: "equals"` are materialized.
Agents must still write explicit filter operators because publish validation rejects
implicit operators; this keeps authored JSON reviewable and prevents trace 019dc03c
style score triggers that silently never fire.

================================================================================

## 3. EVENT BUS (packages/runtime/src/eventBus.ts)

================================================================================

A synchronous publish/subscribe system. Events fire immediately and all
listeners execute synchronously before `emit()` returns.

### API

```typescript
class EventBus {
  // Typed events (from RuntimeEventMap)
  on<K extends keyof RuntimeEventMap>(
    event: K,
    handler: (payload: RuntimeEventMap[K]) => void,
  ): () => void;
  emit<K extends keyof RuntimeEventMap>(event: K, payload: RuntimeEventMap[K]): void;

  // Untyped events (for dynamic event names)
  onAny(event: string, handler: (payload: any) => void): () => void;
  emitAny(event: string, payload: any): void;
}
```

### Key Characteristics

- **Synchronous**: All listeners fire synchronously on emit
- **No queuing**: Events are processed immediately
- **Typed + untyped**: Typed for known events, untyped for dynamic event names
- **Returns unsubscribe**: `on()` returns an unsubscribe function

### Complete Runtime Event Map (RuntimeEventMap)

Events are organized by category. Each event has a typed payload.

#### Input/Action Events

| Event              | Key Payload Fields                       |
| ------------------ | ---------------------------------------- |
| `action.triggered` | actorId, bindingId, direction, actorTeam |
| `action.released`  | actorId, bindingId                       |
| `action.enable`    | actorId, bindingId                       |
| `action.disable`   | actorId, bindingId                       |

#### Physics/Collision Events

| Event              | Key Payload Fields                                                             |
| ------------------ | ------------------------------------------------------------------------------ |
| `volume.enter`     | actorId, objectId, objectTag, objectTags, actorTeam                            |
| `volume.exit`      | actorId, objectId, objectTag, objectTags, actorTeam                            |
| `object.collision` | objectIdA, objectIdB, tagsA, tagsB                                             |
| `projectile.hit`   | characterId, ownerCharacterId, projectilePrefabId, damage, actorTeam, targetId |

#### Combat Events

| Event                  | Key Payload Fields                            |
| ---------------------- | --------------------------------------------- |
| `hitscan.request`      | fromActorId, direction, maxDistance           |
| `hitscan.fire`         | fromActorId, direction, maxDistance, upOffset |
| `hitscan.hit`          | actorId, targetId, hitPoint, damage           |
| `hitscan.fired`        | actorId, direction                            |
| `melee.attack.started` | actorId, attackType                           |
| `melee.attack.ended`   | actorId                                       |

#### Vitals/Stats Events

| Event              | Key Payload Fields                                       |
| ------------------ | -------------------------------------------------------- |
| `vitals.depleted`  | playerId, actorId, statId, current, killerId, killerTeam |
| `vitals.updated`   | playerId, statId, current, delta                         |
| `vitals.recovered` | playerId, statId, current, delta                         |
| `stats.modify`     | playerId, statId, delta                                  |

#### Timer Events

| Event            | Key Payload Fields             |
| ---------------- | ------------------------------ |
| `timer.start`    | timerId, durationMs, playerId? |
| `timer.complete` | timerId, playerId?             |
| `timer.stop`     | timerId                        |

#### Scoring & Match Events

| Event            | Key Payload Fields        |
| ---------------- | ------------------------- |
| `score.modify`   | team? or entityId?, delta |
| `score.updated`  | team?, playerId?, scores  |
| `match.start`    | (empty)                   |
| `match.complete` | winnerTeam?, winnerId?    |

#### Round Events

| Event                | Key Payload Fields   |
| -------------------- | -------------------- |
| `round.start`        | roundNumber?         |
| `round.complete`     | roundNumber?         |
| `round.reset`        | (empty)              |
| `round.phaseChanged` | phase, previousPhase |

#### Player/Team Events

| Event                | Key Payload Fields                |
| -------------------- | --------------------------------- |
| `player.joined`      | playerId, team?                   |
| `player.left`        | playerId                          |
| `player.death`       | playerId, respawnDelay, killerId? |
| `player.respawn`     | playerId                          |
| `team.joined`        | playerId, team                    |
| `team.state.changed` | team, key, value                  |

#### Object Events

| Event                     | Key Payload Fields |
| ------------------------- | ------------------ |
| `object.despawned`        | objectId           |
| `object.motion.started`   | objectId           |
| `object.motion.completed` | objectId           |

#### Zone Events (DynamicZone module)

| Event                     | Key Payload Fields              |
| ------------------------- | ------------------------------- |
| `zone.stageChanged`       | zoneId, stageIndex, totalStages |
| `zone.transitionStart`    | zoneId, stageIndex              |
| `zone.transitionComplete` | zoneId, stageIndex              |
| `zone.completed`          | zoneId                          |

#### Elimination Events (Elimination module)

| Event               | Key Payload Fields             |
| ------------------- | ------------------------------ |
| `player.eliminated` | playerId, placement, killerId? |
| `match.victory`     | winnerId, type                 |

#### Audio/VFX Events

| Event        | Key Payload Fields                     |
| ------------ | -------------------------------------- |
| `audio.play` | url, position?, volume?                |
| `vfx.spawn`  | presetType, position?, targetObjectId? |

#### NPC Events

| Event                   | Key Payload Fields            |
| ----------------------- | ----------------------------- |
| `npc.interact`          | npcId, actorId                |
| `npc.conversation.end`  | npcId, actorId                |
| `npc.ai.died`           | npcId, killerId, killerTeam   |
| `npc.ai.targetAcquired` | npcId, targetId               |
| `npc.spawn`             | npcId, npcTypeId, spawnAreaId |
| `npc.despawn`           | npcId                         |

#### State Events

| Event           | Key Payload Fields                          |
| --------------- | ------------------------------------------- |
| `state.set`     | scope, key, value, playerId?                |
| `state.changed` | scope, key, value, previousValue, playerId? |

================================================================================

## 4. TRIGGER ENGINE (packages/runtime/src/triggerEngine.ts)

================================================================================

The TriggerEngine subscribes to events and evaluates trigger conditions.

### Trigger Structure

```typescript
interface Trigger {
  id: string;
  when: TriggerCondition[]; // Array of conditions (AND semantics for multi-condition)
  actions: TriggerAction[]; // Actions to execute when conditions are met
  cooldownMs?: number; // Minimum time between trigger firings
  priority?: number; // Evaluation order (higher = first)
  metadata?: Record<string, any>;
}

interface TriggerCondition {
  id: string;
  event: string; // Runtime event name to listen for
  filters: TriggerFilter[]; // ALL filters must match (AND)
}

interface TriggerFilter {
  scope: 'player' | 'team' | 'object' | 'global' | 'timer';
  key: string;
  operator: 'equals' | 'in' | 'gte' | 'lte' | 'contains' | 'exists' | 'changed';
  value?: any; // Not required for 'exists' and 'changed'
}
```

### Mount Flow

When TriggerEngine is created, it iterates all triggers and subscribes to their
events via `bus.onAny()`:

```
For each trigger:
  For each condition in trigger.when:
    bus.onAny(condition.event, handleEvent)
```

### Single-Condition Evaluation (handleEvent)

When an event fires:

```
1. Gate dead actors (for action.triggered — dead players can't act)
2. Check cooldown (per-trigger, per-actor)
3. If event is action.triggered with object-scope filters:
   → resolveObjectFromOverlaps():
     Query physics for overlappingObjectIds of the actor
     Find matching sensor objects whose tags satisfy filters
     If found: enrich payload with objectId, objectTag, objectTags
4. Match ALL filters:
   → For each filter: resolveScopedValue(scope, key, payload, physics)
   → Apply operator (equals, contains, gte, lte, in, exists, changed)
5. If ALL filters pass → executeActions(trigger, payload)
```

### Multi-Condition Evaluation (AND across events)

If a trigger has multiple conditions (multiple entries in `when[]`), ALL
conditions must be satisfied by the same actor:

```
1. Track per-actor condition fulfillment
2. When condition N fires for actor X:
   a. Record condition N as met for actor X
   b. Set 10-second TTL for condition expiry
   c. Check if ALL conditions are met for actor X
   d. If yes → executeActions + clear tracking
```

### Scope Resolution (resolveScopedValue)

The scope determines WHERE to look up the filter key's value:

| Scope    | Resolution Strategy                                                            |
| -------- | ------------------------------------------------------------------------------ |
| `player` | Payload fields: actorId, team (from TeamState module), bindingId, statId, etc. |
| `team`   | Payload actorTeam field, or runtimeStore.getScore(key)                         |
| `object` | Payload objectId/objectTag/objectTags, or physics object properties            |
| `global` | runtimeStore scores (`scores.<id>`), payload fields, or round state            |
| `timer`  | Payload timerId field                                                          |

### Key Behavior: action.triggered + Object Scope

When a trigger has `event: "action.triggered"` with `scope: "object"` filters,
the TriggerEngine calls `resolveObjectFromOverlaps()`:

1. Gets all sensor objects the player is currently overlapping (from physics)
2. Checks each object's tags against the object-scope filters
3. If a matching object is found, enriches the payload with objectId/objectTags
4. This enables "press key near tagged object" patterns without volume tracking

### Cooldown Tracking

Cooldowns are tracked per trigger ID + per actor ID:

- `cooldownMap: Map<string, Map<string, number>>`
- Key: `triggerId → actorId → lastFireTimestamp`
- Checked before filter evaluation (fast reject)

================================================================================

## 5. ACTION EXECUTOR (packages/runtime/src/actionExecutor.ts)

================================================================================

Simple handler registry that routes action types to module-registered handlers.

```typescript
class ActionExecutor {
  private handlers: Map<string, RuntimeActionHandler>;

  register(actionType: string, handler: RuntimeActionHandler): void;
  execute(actionType: string, params: Record<string, any>): Promise<void>;
  hasAction(actionType: string): boolean;
  listActions(): string[];
}
```

### Action Execution Flow

```
1. TriggerEngine.executeActions(trigger, payload):
   a. Template the payload (resolve $variables)
   b. For each action in trigger.actions:
      i.   Template action.params (resolve $variables in params)
      ii.  Enrich params with actorId/entityId from payload
      iii. Call ActionExecutor.execute(action.type, enrichedParams)
2. ActionExecutor.execute():
   a. Look up handler from map
   b. If not found → log warning "[ActionExecutor] No handler for: <type>"
   c. If found → call handler(params)
```

### Built-in Actions (registered by RuntimeEngine)

These actions are available without any module:

| Action Type           | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `state.set`           | Set player/global state via StateChannel |
| `object.impulse`      | Apply physics impulse to object          |
| `event.broadcast`     | Emit arbitrary event on the bus          |
| `object.teleport`     | Move object to target position           |
| `object.spawn`        | Create new object from prefab            |
| `object.despawn`      | Remove object (restores on round.reset)  |
| `character.teleport`  | Teleport player character                |
| `spawn.respawn`       | Respawn player at team spawn             |
| `spawn.respawnAll`    | Respawn all players                      |
| `spawn.andImpulse`    | Spawn + apply impulse                    |
| `projectile.shoot`    | Fire a projectile                        |
| `hitscan.fire`        | Fire a raycast weapon                    |
| `character.playAudio` | Play audio at character position         |

### Module-Registered Actions

Each module adapter registers its own actions via:

```typescript
moduleHandle.actions = {
  'score.modify': (params) => { ... },
  'score.set': (params) => { ... },
};
```

These are collected during `initializeModulesFromRegistry()` and registered
with ActionExecutor.

================================================================================

## 6. TEMPLATE VARIABLE RESOLUTION (packages/runtime/src/templateUtils.ts)

================================================================================

Template variables (`$variableName`) in trigger action params are resolved at
execution time from the event payload and runtime context.

### Resolution Process

```typescript
templateValue(value: any, payload: Record<string, any>, context?: RuntimeContext): any
```

1. **Strings**: `$variableName` → look up in payload, then context
2. **Objects**: Recursively template all values
3. **Arrays**: Recursively template all elements
4. **Nested paths**: `$payload.field.subfield` → resolves dot-separated paths

### resolvePath(path, payload, context)

Resolution order:

1. Direct payload lookup (`payload[path]`)
2. Dot-path traversal (`payload.field.subfield`)
3. Runtime context fallbacks:
   - `scores.<id>` → runtime score store
   - `team` → actor's team from TeamState module
   - `actorPosition` → physics position of the actor
   - `objectPosition` → physics position of the object
   - `actorVelocity` → physics velocity of the actor

### Available Template Variables

| Variable            | Source                         | Available In                                  |
| ------------------- | ------------------------------ | --------------------------------------------- |
| `$actorId`          | payload.actorId                | action.triggered, volume.enter/exit           |
| `$actorTeam`        | TeamState module lookup        | action.triggered, volume.enter/exit           |
| `$playerId`         | payload.playerId               | vitals.depleted, timer.complete, player.death |
| `$objectId`         | payload.objectId               | volume.enter/exit, resolved from overlaps     |
| `$objectPosition`   | physics position lookup        | volume.enter/exit                             |
| `$actorPosition`    | physics position lookup        | any event with actorId                        |
| `$cameraDirection`  | payload.direction              | action.triggered                              |
| `$direction`        | payload.direction              | action.triggered                              |
| `$origin`           | payload.origin                 | action.triggered                              |
| `$killerTeam`       | payload.killerTeam             | vitals.depleted                               |
| `$killerId`         | payload.killerId               | vitals.depleted                               |
| `$targetId`         | payload.targetId / characterId | projectile.hit, hitscan.hit                   |
| `$damage`           | payload.damage (negated)       | projectile.hit                                |
| `$ownerCharacterId` | payload.ownerCharacterId       | projectile.hit                                |

**Template resolution is not type validation:** `templateValue` preserves
unresolved placeholders as strings. That means `"$killerTeam"` can remain a
string if used on the wrong event. For identifier fields (`score.modify.team`,
`score.modify.entityId`, score bulk entity ids), unresolved `$...` strings are
invalid blocker validation errors.

**IMPORTANT:** Template math is NOT supported. `$timestampPlus10s` or
`$health + 50` will NOT work. For computed values, use module logic.

================================================================================

## 7. MODULE ADAPTER PATTERN

================================================================================

Modules extend the runtime with domain-specific logic. Each module follows the
adapter pattern:

### Registration Pattern

```
packages/runtime/src/modules/
├── timerModule.ts                 // Module logic
├── timerModule.adapter.ts         // Factory registration (side-effect import)
├── scoreTrackerModule.ts
├── scoreTrackerModule.adapter.ts
├── ...
```

### Adapter Structure

```typescript
// scoreTrackerModule.adapter.ts
import { registerRuntimeModuleFactory } from '../runtimeModuleRegistry';
import { ScoreTrackerModule } from './scoreTrackerModule';

registerRuntimeModuleFactory('Objectives/ScoreTracker@1', (context) => {
  return new ScoreTrackerModule(context);
});
```

### Module Handle Interface

```typescript
interface RuntimeModuleHandle {
  id: string;
  actions?: Record<string, RuntimeActionHandler>; // Action handlers this module provides
  dispose?(): void; // Cleanup on shutdown
}
```

### Registration Chain

```
1. Side-effect import in registerBuiltInRuntimeModules.ts
   → import './modules/scoreTrackerModule.adapter'
2. Adapter calls registerRuntimeModuleFactory(id, factoryFn)
   → Stores factory in global registry
3. RuntimeEngine.initializeModulesFromRegistry():
   → For each module in definition.modules[]:
     a. Look up factory by module.id
     b. Call factory(context) → ModuleHandle
     c. For each action in handle.actions:
        ActionExecutor.register(actionType, handler)
```

### All 18+ Module IDs

```
Progression/Timer@1              Progression/StateChannel@1
Objectives/ScoreTracker@1        Social/TeamState@1
Vitals/CharacterStats@1          Equipment/Weapons@1
Combat/MeleeAttack@1             Interaction/ActionBinding@1
Interaction/TriggerVolume@1      Movement/LocomotionModifier@1
Movement/Vehicle@1               VFX/ParticleEffects@1
Audio/Positional@1               AI/NPC@1
NPC/Agent@1                      NPC/Conversation@1
Interaction/ObjectMotion@1       Gameplay/SpawnPoint@1
Combat/AimAssist@1               Gameplay/DynamicZone@1
Gameplay/Elimination@1           Progression/Rounds@1
```

================================================================================

## 8. PHYSICS EVENT BRIDGES

================================================================================

Physics collision callbacks are bridged to runtime events in
`RuntimeEngine.mountPhysicsEventBridges()`.

### Bridge Mappings

| Physics Callback                                      | Runtime Event      | Payload                                                    |
| ----------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| `onCharacterEnterObject(characterId, objectId)`       | `volume.enter`     | actorId, objectId, objectTag, objectTags, actorTeam        |
| `onCharacterLeaveObject(characterId, objectId)`       | `volume.exit`      | actorId, objectId, objectTag, objectTags, actorTeam        |
| `onObjectEnterObject(objectIdA, objectIdB)`           | `object.collision` | objectIdA, objectIdB, tagsA, tagsB                         |
| `onProjectileHitObject(projectileId, objectId)`       | (varies)           | handled by projectile system                               |
| `onProjectileHitCharacter(projectileId, characterId)` | `projectile.hit`   | characterId, ownerCharacterId, damage, targetId, actorTeam |

### Payload Enrichment

When a physics collision fires, the bridge:

1. Looks up the object's tags from physics metadata
2. Looks up the actor's team from the TeamState module
3. Constructs a rich payload with all available data
4. Emits the event on the EventBus

### isSensor Requirement

For `volume.enter` / `volume.exit` to fire, the object MUST have:

- `"isSensor": true` in its prefab definition
- Sensors don't block movement but DO detect overlaps

Without `isSensor`, the physics engine generates solid collisions that do NOT
trigger `volume.enter/exit` events.

================================================================================

## 9. EVENT-ACTION BRIDGES (Built-in Wiring)

================================================================================

The RuntimeEngine registers several built-in event→action bridges in
`registerEventActionBridges()`. These create automatic behaviors:

### Action Input Bridge

```
action.triggered → Forwards to ActionExecutor (for bound actions)
action.released  → Forwards to ActionExecutor (for release handlers)
action.enable    → Enables a binding
action.disable   → Disables a binding
```

### Hitscan Bridge

```
hitscan.request → hitscan.fire
  (Client sends request, server validates and fires)
```

### Built-in Death/Respawn Handler

**CRITICAL:** If no user-authored `vitals.depleted` trigger exists, the engine
handles death/respawn automatically:

```
vitals.depleted (no user trigger exists):
  1. Set status.isDead = true on player state
  2. Set status.respawnAt = currentTime + respawnDelay
  3. Emit player.death event
  4. setTimeout(respawnDelay):
     a. Teleport to team spawn (via SpawnPoint module)
     b. Reset health to max
     c. Clear isDead and respawnAt
     d. Emit player.respawn event
```

- `respawnDelay` comes from `Gameplay/SpawnPoint@1` config `respawnDelayMs` (default: 2500ms)
- If a user-authored `vitals.depleted` trigger exists, this handler is SKIPPED
- The user must then implement the full death/respawn chain manually

### Health Recovery Handler

```
vitals.updated (health > 0 and was previously dead):
  → Clear isDead state
```

### Round Reset Handler

```
round.reset:
  → Reset all module state to initial
  → Respawn all players
  → Clear all timers
```

================================================================================

## 10. SERVER-SIDE: SANDBOX ROOM INTEGRATION

================================================================================

The Colyseus `SandboxRoom` is where the RuntimeEngine lives on the server.

### Room Lifecycle

```
1. onCreate(options):
   a. Load GameDefinition from database
   b. Initialize PhysicsManager (Rapier3D)
   c. Create RuntimeEngine(definition, physicsManager, colyseusState)
   d. Set up simulation loop (setSimulationInterval)
   e. Register message handlers

2. onJoin(client, options):
   a. Create player in Colyseus state
   b. Create character body in physics
   c. Emit player.joined event on RuntimeEngine.bus
   d. Assign team via TeamState module

3. onMessage handlers:
   a. "action" → Emit action.triggered on bus
   b. "action.release" → Emit action.released on bus
   c. "movement" → Update physics character controller
   d. "hitscan.request" → Emit hitscan.request on bus

4. Simulation loop (every 16ms):
   a. Step physics (PhysicsManager.step())
   b. Sync physics state to Colyseus state
   c. Broadcast state changes to clients

5. onLeave(client):
   a. Emit player.left event
   b. Remove character from physics
   c. Remove player from Colyseus state
```

### Key: Client → Server → Runtime Event Flow

```
Client key press
  → Colyseus message "action" { bindingId, direction }
  → SandboxRoom.onMessage("action")
  → RuntimeEngine.bus.emit("action.triggered", { actorId, bindingId, direction, actorTeam })
  → TriggerEngine evaluates all triggers listening to action.triggered
  → Matching trigger fires actions via ActionExecutor
  → Module handlers modify state (scores, health, etc.)
  → Colyseus syncs modified state to ALL clients
```

================================================================================

## 11. CLIENT-SIDE: EVENT RECEPTION & UI

================================================================================

The client does NOT run triggers or the RuntimeEngine. It receives state
updates via Colyseus schema sync.

### NetworkBridge

`apps/client1/src/components/canvas/gameplay/NetworkBridge.tsx`

- Connects to Colyseus room
- Listens for state changes (schema callbacks)
- Sends player input to server (action messages)
- Syncs module state to local stores

### GameLoop

`apps/client1/src/components/canvas/gameplay/GameLoop.tsx`

- Runs the client-side game loop (useFrame)
- Reads physics state for rendering
- Sends movement input to server

### Widget Data Sources

`apps/client1/src/hooks/world/useWidgetDataSources.ts`

- Maps module state from Colyseus schema to widget props
- UI widgets (scoreboard, health bar, ammo counter) read from these sources
- Updates reactively when server state changes

### Client-Side Event Flow

```
Server state changes (via trigger actions)
  → Colyseus schema sync
  → NetworkBridge receives onChange callbacks
  → Local stores updated (Zustand)
  → React re-renders widgets/UI
  → useFrame reads physics state for 3D rendering
```

================================================================================

## 12. TRIGGER GROUP FLATTENING

================================================================================

Triggers in the GameDefinition can be organized into TriggerGroups:

```json
{
  "triggers": [
    {
      "groupId": "combat-triggers",
      "groupLabel": "Combat",
      "triggers": [
        { "id": "fire-weapon", "when": [...], "actions": [...] },
        { "id": "reload", "when": [...], "actions": [...] }
      ]
    },
    {
      "groupId": "pickup-triggers",
      "triggers": [...]
    }
  ]
}
```

At startup, the RuntimeEngine flattens all trigger groups into a single array
of triggers. The TriggerEngine doesn't know about groups — it only sees the
flat trigger list.

================================================================================

## 13. COMPLETE END-TO-END FLOW EXAMPLES

================================================================================

### Example: Player Picks Up a Coin

```
1. PHYSICS: Player character walks into coin sensor
2. BRIDGE: onCharacterEnterObject(playerId, coinObjectId) fires
3. BRIDGE: Enriches payload: { actorId, objectId, objectTags: ["coin"], actorTeam }
4. EVENTBUS: emit("volume.enter", payload)
5. TRIGGERENGINE: Checks all triggers listening to volume.enter
6. TRIGGERENGINE: Finds "coin-pickup" trigger
7. TRIGGERENGINE: Evaluates filters:
   - scope:object, key:tags, op:contains, value:"coin" → resolves objectTags → ["coin"] contains "coin" → PASS
   - scope:player, key:id, op:exists → actorId exists → PASS
8. TRIGGERENGINE: All filters pass → executeActions()
9. TRIGGERENGINE: Templates action params ($actorTeam → "red", $objectId → "coin-1")
10. ACTIONEXECUTOR: execute("score.modify", { team: "red", delta: 10 })
    → ScoreTracker module increments red team score
11. ACTIONEXECUTOR: execute("vfx.spawn", { presetType: "sparks", position: {x,y,z} })
    → VFX module spawns particle effect
12. ACTIONEXECUTOR: execute("object.teleport", { objectId: "coin-1", target: {translate: {y:-100}} })
    → Physics moves coin underground
13. STATE SYNC: Modified scores sync to all clients via Colyseus
14. CLIENT: Scoreboard widget updates, VFX renders at coin position
```

### Example: Player Fires Weapon

```
1. CLIENT: Player presses left-click (bound to "fire" action)
2. CLIENT: Sends Colyseus message "action" { bindingId: "fire", direction: cameraDir }
3. SERVER: SandboxRoom receives message
4. SERVER: bus.emit("action.triggered", { actorId, bindingId: "fire", direction, actorTeam })
5. TRIGGERENGINE: Evaluates "fire-weapon" trigger
6. TRIGGERENGINE: Filter: scope:player, key:bindingId, op:equals, value:"fire" → PASS
7. TRIGGERENGINE: executeActions()
8. ACTIONEXECUTOR: execute("stats.modify", { playerId, statId: "ammo", delta: -1 })
   → CharacterStats decrements ammo
9. ACTIONEXECUTOR: execute("hitscan.fire", { fromActorId, direction, maxDistance: 100 })
   → Physics performs raycast
   → If hit: emit("hitscan.hit", { actorId, targetId, hitPoint, damage })
   → CharacterStats deals damage to target
10. ACTIONEXECUTOR: execute("vfx.spawn", { presetType: "shotgun-fire", ... })
    → VFX module spawns muzzle flash
11. STATE SYNC: Ammo/health changes sync to clients
```

### Example: Built-in Death & Respawn

```
1. CharacterStats detects health ≤ 0
2. bus.emit("vitals.depleted", { playerId, statId: "health", killerId, killerTeam })
3. RuntimeEngine checks: any user-authored vitals.depleted trigger?
   → NO: Built-in handler activates:
     a. Set player.status.isDead = true
     b. Set player.status.respawnAt = now + respawnDelay
     c. bus.emit("player.death", { playerId, respawnDelay })
     d. setTimeout(respawnDelay):
        - teleportToTeamSpawn(playerId)
        - resetHealth(playerId)
        - clearIsDead(playerId)
        - bus.emit("player.respawn", { playerId })
4. STATE SYNC: isDead/respawnAt sync to client
5. CLIENT: DeathOverlay widget shows countdown
6. After delay: Player respawns, DeathOverlay hides
```

================================================================================

## 14. DEBUGGING TIPS

================================================================================

### "[ActionExecutor] No handler registered for action: <type>"

The module providing this action is missing from `modules[]` in the game
definition. Add the required module.

### Trigger not firing

1. Check the event name matches exactly (case-sensitive)
2. Check all filters have `scope` field
3. Check filter values match actual payload values
4. For volume.enter: ensure prefab has `isSensor: true`
5. For action.triggered with object scope: ensure player is overlapping sensor
6. Check cooldown hasn't blocked the trigger

### Template variable resolves to undefined

The variable name must match a payload field or a known runtime context path.
Check the event's actual payload fields in RuntimeEventMap.

### Built-in death handler fires instead of custom trigger

Your `vitals.depleted` trigger may have a filter that prevents it from matching.
The engine checks if ANY vitals.depleted trigger exists (not if it matches).
If one exists, the built-in handler is skipped for ALL vitals.depleted events.

### Strict known module config validation

Known runtime module IDs must match their declared Zod config schema before publish.
`Progression/Rounds@1` requires `config.phases`; string shorthand or object form
without phases is invalid. `Gameplay/WeaponSpawner@1` requires configured spawners
with stable `id`, `objectId`, and weapon ids. Runtime module registration failures
are fatal, not recoverable; fix validation instead of continuing with a partial
runtime. `score.modify` requires `team` or `entityId`; `playerId` alone is rejected
by the adapter validator. WeaponSpawner is opt-in for pickup/loot/map-control
mechanics, not a default combat dependency.

================================================================================

## 15. RELATIONSHIP TO OTHER SKILLS

================================================================================

| Skill                          | Focus                                                  |
| ------------------------------ | ------------------------------------------------------ |
| **game-runtime-system** (this) | Architecture, internals, data flow                     |
| **triggers**                   | Trigger authoring patterns, anti-patterns, recipes     |
| **game-modules**               | Module configs, dependency rules, config schemas       |
| **game-examples**              | Complete game definition examples (TDM, BR, Spellcast) |
| **spawn-vfx**                  | Spawn points and VFX system details                    |
| **ui-widgets**                 | Widget configuration for the UI layer                  |
