---
name: colyseus-state
description: "Colyseus Schema-based state synchronization reference. Covers @colyseus/schema decorators (@type), all primitive types (string, number, boolean, int8-int64, uint8-uint64, float32, float64), collection types (MapSchema, ArraySchema, SetSchema, CollectionSchema), nested schemas, schema inheritance, client-side callbacks (getStateCallbacks, onChange, listen, onAdd, onRemove), change tracking rules, JSON-in-Schema pattern, discriminated unions, deprecated fields, State View for per-client visibility, and bandwidth optimization. Use when defining networked state, adding schema fields, listening for state changes, debugging sync issues, or optimizing state size."
---

# Colyseus Schema State Reference

Reference for `@colyseus/schema` — the automatic delta synchronization system.

## Core Architecture

Colyseus uses a **server-authoritative** state model:
- Server mutates state via `@type()`-decorated fields
- Only changed fields are tracked and sent (delta encoding)
- Client receives patches and applies them automatically
- Property-level tracking: only the **latest mutation** of each field per patch interval is sent

## Schema Class

```typescript
import { Schema, type } from '@colyseus/schema';

class MyState extends Schema {
  @type('string') name: string = '';
  @type('number') value: number = 0;
}
```

**Rules:**
- All synchronized fields **must** have `@type()` decorator
- Fields **must** have default values (Schema constructor doesn't accept args by default)
- Non-decorated fields exist only on the server (not synced to clients)
- Maximum **64 serialized fields** per Schema structure

## Primitive Types

| Type | Bytes | Range | Use |
|------|-------|-------|-----|
| `'string'` | variable | UTF-8 | IDs, names |
| `'number'` | 8 | float64 | General numbers |
| `'boolean'` | 1 | true/false | Flags |
| `'int8'` | 1 | -128 to 127 | Small signed ints |
| `'uint8'` | 1 | 0 to 255 | Small unsigned ints |
| `'int16'` | 2 | -32768 to 32767 | Medium signed ints |
| `'uint16'` | 2 | 0 to 65535 | Medium unsigned ints |
| `'int32'` | 4 | -2^31 to 2^31-1 | Large signed ints |
| `'uint32'` | 4 | 0 to 2^32-1 | Large unsigned ints |
| `'int64'` | 8 | -2^63 to 2^63-1 | Very large signed ints |
| `'uint64'` | 8 | 0 to 2^64-1 | Very large unsigned ints |
| `'float32'` | 4 | ~7 decimal digits | Lower-precision floats (saves bandwidth) |
| `'float64'` | 8 | ~15 decimal digits | Same as `'number'` |

**Tip**: Use `'float32'` for positions/rotations where full float64 precision is unnecessary. Saves 50% bandwidth per field.

**Limitations**: `NaN` and `Infinity` encode as `0`.

## Nested Schemas

```typescript
class Vec3State extends Schema {
  @type('float32') x: number = 0;
  @type('float32') y: number = 0;
  @type('float32') z: number = 0;
}

class TransformState extends Schema {
  @type(Vec3State) translate: Vec3State = new Vec3State();
  @type(Vec3State) scale: Vec3State = new Vec3State();
}

class CharacterState extends Schema {
  @type('string') id: string = '';
  @type(TransformState) transform: TransformState = new TransformState();
}
```

Nested schemas support **deep change tracking** — modifying `player.weapon.quantity` on the server automatically syncs to clients.

## Collection Types

### MapSchema

Key-value collection. Keys are always strings.

```typescript
import { MapSchema } from '@colyseus/schema';

class GameState extends Schema {
  // Schema values
  @type({ map: CharacterState })
  characters: MapSchema<CharacterState> = new MapSchema();

  // Primitive values
  @type({ map: 'number' })
  scores: MapSchema<number> = new MapSchema();
}

// Server usage
state.characters.set('player-1', new CharacterState());
state.characters.get('player-1');
state.characters.delete('player-1');
state.characters.has('player-1');
state.characters.size;
state.characters.forEach((value, key) => { /* ... */ });
```

### ArraySchema

Ordered list.

```typescript
import { ArraySchema } from '@colyseus/schema';

class GameState extends Schema {
  @type([CharacterState])
  players: ArraySchema<CharacterState> = new ArraySchema();

  @type(['string'])
  messages: ArraySchema<string> = new ArraySchema();
}

// Server usage
state.players.push(new CharacterState());
state.players.splice(index, 1);
state.players.at(0);
state.players.length;
```

### SetSchema

Unordered unique collection.

```typescript
import { SetSchema } from '@colyseus/schema';

class GameState extends Schema {
  @type({ set: 'string' })
  tags: SetSchema<string> = new SetSchema();
}

// Server usage
state.tags.add('vip');
state.tags.delete('vip');
state.tags.has('vip');
```

### CollectionSchema

Unordered collection (like Set but allows duplicates, has numeric keys).

```typescript
import { CollectionSchema } from '@colyseus/schema';

class GameState extends Schema {
  @type({ collection: PlayerState })
  npcs: CollectionSchema<PlayerState> = new CollectionSchema();
}
```

## Schema Inheritance

```typescript
class BaseEntity extends Schema {
  @type('string') id: string = '';
  @type('float32') x: number = 0;
  @type('float32') y: number = 0;
}

class PlayerEntity extends BaseEntity {
  @type('string') name: string = '';
  @type('uint8') health: number = 100;
}

class NPCEntity extends BaseEntity {
  @type('string') dialogueId: string = '';
}
```

When using inheritance in collections, declare the **parent type**:

```typescript
class GameState extends Schema {
  @type({ map: BaseEntity })
  entities: MapSchema<BaseEntity> = new MapSchema();
}

// Can store child types
state.entities.set('p1', new PlayerEntity());
state.entities.set('npc1', new NPCEntity());
```

## Client-Side Callbacks (getStateCallbacks)

The modern API for listening to state changes:

```typescript
import { getStateCallbacks } from 'colyseus.js';

const $ = getStateCallbacks(room);

// MapSchema: onAdd / onRemove
$(room.state).characters.onAdd((character, key) => {
  console.log('Player joined:', key);

  // Nested schema onChange (any field changed)
  $(character.transform.translate).onChange(() => {
    updatePosition(key, character.transform.translate);
  });

  // Specific field listener
  $(character).listen('health', (newVal, oldVal) => {
    showDamageNumber(key, oldVal - newVal);
  });
});

$(room.state).characters.onRemove((character, key) => {
  removePlayer(key);
});

// ArraySchema: onAdd / onRemove
$(room.state).messages.onAdd((msg, index) => { /* ... */ });
$(room.state).messages.onRemove((msg, index) => { /* ... */ });

// Schema onChange (any field)
$(room.state.player).onChange(() => { /* ... */ });
```

**All callbacks return a disposer function:**

```typescript
const unsub = $(player).listen('health', (val) => { /* ... */ });
// Later:
unsub();
```

### Alternative: callbacks object pattern

```typescript
const callbacks = getStateCallbacks(room);

callbacks.onAdd("players", (player, sessionId) => {
  callbacks.listen(player, "x", (x, prevX) => {
    console.log('Changed:', x, "from", prevX);
  });
});
```

### onStateChange (Legacy but useful)

```typescript
// Called on every state patch
room.onStateChange((state) => {
  console.log('State updated:', state);
});

// Called only on first state receive
room.onStateChange.once((state) => {
  console.log('Initial state:', state);
});
```

## Change Tracking Rules

### Always assign fields individually

```typescript
// GOOD — triggers change tracking
character.transform.translate.x = pos.x;
character.transform.translate.y = pos.y;
character.transform.translate.z = pos.z;

// BAD — may not trigger change detection
Object.assign(character.transform.translate, pos);
```

### Default values are required

```typescript
// GOOD
@type('number') health: number = 100;

// BAD — will cause serialization issues
@type('number') health!: number;
```

### Schemas must be instantiated with new

```typescript
// GOOD
const player = new PlayerState();
state.players.set(id, player);

// BAD — plain objects don't serialize
state.players.set(id, { name: 'test', health: 100 });
```

### State is mutable — never reassign

```typescript
// GOOD — mutate in place
this.state.score = 10;

// BAD — don't reassign the state object
this.state = new GameState(); // Only do this once in onCreate
```

### Schema field order must match

Field declaration order must be identical between server and client schema definitions when sharing types. Using the same TypeScript source file avoids this issue.

## Advanced Patterns

### JSON-in-Schema (Dynamic Data)

For complex dynamic data that doesn't fit the fixed schema model:

```typescript
class ModuleStateEntry extends Schema {
  @type('string') moduleId: string = '';
  @type('string') key: string = '';
  @type('string') state: string = '{}'; // JSON string

  setState(payload: Record<string, unknown>): void {
    this.state = JSON.stringify(payload);
  }

  getState<T>(): T {
    return JSON.parse(this.state) as T;
  }
}
```

### Discriminated Union Pattern

```typescript
class ObjectState extends Schema {
  @type('string') type: 'sphere' | 'box' | 'capsule' = 'box';
  @type(SphereState) sphere?: SphereState;
  @type(BoxState) box?: BoxState;
  @type(CapsuleState) capsule?: CapsuleState;

  static fromDefinition(def: ObjectDef): ObjectState {
    const obj = new ObjectState();
    obj.type = def.type;
    if (def.type === 'sphere') {
      obj.sphere = new SphereState();
      obj.sphere.radius = def.radius;
    }
    return obj;
  }
}
```

### Deprecated Fields

```typescript
import { deprecated } from '@colyseus/schema';

class PlayerState extends Schema {
  @deprecated() @type('number') hp: number = 100;  // Old field
  @type('number') health: number = 100;             // New field
}
```

Deprecated fields still serialize for backward compatibility but log warnings.

## Bandwidth Optimization

| Strategy | Savings | Example |
|----------|---------|---------|
| Use `float32` instead of `number` | 4 bytes/field | Positions, rotations |
| Use `uint8`/`int8` for small values | 7 bytes/field | Health 0-255, team 0-7 |
| Avoid syncing computed values | Full field | Compute client-side instead |
| Split frequently-changing from rarely-changing state | Reduced patches | Transform vs metadata |
| Use JSON-in-string for dynamic data | No field-level overhead | Module state, configs |
| Reduce `patchRate` | Fewer sends/sec | Increase from 50ms if acceptable |

### TypeScript Configuration

Required `tsconfig.json` settings for schema decorators:

```json
{
  "compilerOptions": {
    "useDefineForClassFields": false,
    "experimentalDecorators": true,
    "strict": true
  }
}
```

**Important:** `useDefineForClassFields: false` is required for ES2022+ targets, otherwise decorators don't work correctly.

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| State changes not syncing | Using `Object.assign` on schema | Assign fields individually |
| "Schema not found" | Schema class not imported on client | Import all schema classes in client entry |
| "Buffer overflow" | State too large | Increase `Encoder.BUFFER_SIZE` |
| Large state causing lag | Too frequent patches | Increase `setPatchRate()`, reduce state size |
| Fields not tracking changes | Missing default value | Add `= defaultValue` to all `@type` fields |
| Decorators not working | Wrong tsconfig | Set `useDefineForClassFields: false` |

## Additional Resources

- [Server & Room reference](../colyseus-server/SKILL.md)
- [Client SDK reference](../colyseus-client/SKILL.md)
- [Official Schema docs](https://docs.colyseus.io/state/)
