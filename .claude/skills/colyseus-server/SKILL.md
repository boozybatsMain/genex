---
name: colyseus-server
description: Colyseus server configuration and Room lifecycle reference. Covers defineServer(), Server class, room definition (filterBy, sortBy, enableRealtimeListing), Room lifecycle hooks (onCreate, onAuth, onJoin, onDrop, onReconnect, onLeave, onDispose, onBeforePatch, onBeforeShutdown), message handling (onMessage with Zod validation), broadcasting, simulation intervals, clock timers, client management, graceful shutdown, and devMode. Use when setting up a Colyseus server, creating room handlers, managing room lifecycle, handling messages, or configuring the simulation loop.
---

# Colyseus Server & Room Reference

Reference for Colyseus 0.15+ server-side APIs: `@colyseus/core`, `Server`, `Room`, and room lifecycle.

## Server Setup

### defineServer (Recommended)

```typescript
import { defineServer } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { playground } from '@colyseus/playground';
import { monitor } from '@colyseus/monitor';

export default defineServer({
  // Room definitions
  rooms: {
    sandbox: SandboxRoom,
    lobby: LobbyRoom,
  },

  // Express middleware & routes
  express: (app) => {
    app.use('/playground', playground());
    app.use('/monitor', monitor());
  },

  // Server options
  options: {
    devMode: process.env.NODE_ENV !== 'production',
    transport: new WebSocketTransport({ /* ... */ }),
  },
});
```

### Manual Server Setup

```typescript
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'http';
import express from 'express';

const app = express();
const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Register rooms
gameServer.define('sandbox', SandboxRoom).filterBy(['worldId']);

gameServer.listen(PORT);
```

### Server Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transport` | Transport | WebSocketTransport | Bidirectional communication layer |
| `presence` | Presence | LocalPresence | Cross-process communication (use `RedisPresence` for multi-process) |
| `driver` | Driver | LocalDriver | Room storage for matchmaking (use `RedisDriver` for multi-process) |
| `devMode` | boolean | `false` | Restore previous room states on server restart |
| `gracefullyShutdown` | boolean | `true` | Auto-register shutdown routines |
| `publicAddress` | string | — | External address for clients (required for multi-process) |
| `selectProcessIdToCreateRoom` | Function | — | Custom callback to choose which process creates a room |

### Buffer Size

For large state payloads, increase the schema buffer:

```typescript
import { Encoder } from '@colyseus/schema';
Encoder.BUFFER_SIZE = 16 * 1024; // 16KB (default is 4KB)
```

## Room Definition

### Registering Rooms

```typescript
// In defineServer rooms config or manually:
gameServer.define('sandbox', SandboxRoom)
  .filterBy(['worldId'])           // Matchmaking filter options
  .sortBy({ clients: -1 })        // Sort by field (-1 = descending)
  .enableRealtimeListing();        // Push room updates to lobby

// Lifecycle listeners on room type
gameServer.define('sandbox', SandboxRoom)
  .on('create', (room) => console.log('Room created:', room.roomId))
  .on('dispose', (room) => console.log('Room disposed:', room.roomId))
  .on('join', (room, client) => console.log('Client joined'))
  .on('leave', (room, client) => console.log('Client left'))
  .on('lock', (room) => console.log('Room locked'))
  .on('unlock', (room) => console.log('Room unlocked'));
```

### filterBy

Stores specific client options for matchmaking. Clients with the same filter values join the same room:

```typescript
gameServer.define('sandbox', SandboxRoom).filterBy(['worldId']);

// Client: worldId determines which room to join
const room = await client.joinOrCreate('sandbox', { worldId: 'world-123' });
```

### sortBy

Controls room priority during matchmaking:

```typescript
// Fill rooms to capacity before creating new ones
gameServer.define('sandbox', SandboxRoom).sortBy({ clients: -1 });
```

## Room Lifecycle

Rooms extend `Room<StateType>` and implement lifecycle hooks:

```typescript
import { Room, Client } from '@colyseus/core';

export class GameRoom extends Room<GameState> {
  // 1. Room created — initialize state, handlers, simulation
  override async onCreate(options: JoinOptions) {
    this.state = new GameState();
    this.setSeatReservationTime(60);
    this.setSimulationInterval(this.gameLoop.bind(this), 1000 / 60);
  }

  // 2. Authentication (optional) — return truthy to allow, throw to reject
  static async onAuth(token: string, options: any, context: any) {
    const user = await JWT.verify(token);
    if (!user) throw new ServerError(401, 'Unauthorized');
    return user; // Available as client.auth and 3rd arg in onJoin
  }

  // 3. Client joined successfully
  override async onJoin(client: Client, options: JoinOptions, auth: User) {
    const character = new CharacterState();
    character.id = client.sessionId;
    this.state.characters.set(client.sessionId, character);
  }

  // 4. Unexpected disconnection (supports reconnection window)
  override async onDrop(client: Client) {
    // Client unexpectedly disconnected
    // Return number of seconds to wait for reconnection, or void to not wait
    return 30; // Allow 30 seconds for reconnection
  }

  // 5. Client reconnected after drop
  override async onReconnect(client: Client) {
    console.log(`${client.sessionId} reconnected`);
  }

  // 6. Client intentionally left
  override async onLeave(client: Client, consented: boolean) {
    this.state.characters.delete(client.sessionId);
  }

  // 7. Before state patch is sent (every patchRate interval)
  override onBeforePatch() {
    // Runs before state delta is computed and sent
  }

  // 8. Before graceful shutdown
  override async onBeforeShutdown() {
    // Notify clients, save state, etc.
    this.broadcast('shutdown', { countdown: 10 });
  }

  // 9. Room has no clients, about to be destroyed
  override async onDispose() {
    // Cleanup: dispose physics, close DB connections
  }

  // Error handling
  override onUncaughtException(error: Error, methodName: string) {
    console.error(`[${methodName}]`, error);
  }
}
```

### Lifecycle Hook Order

```
onCreate(options)
  → onAuth(token, options, context)     [optional, per-client]
    → onJoin(client, options, auth)     [per-client]
      → onDrop(client)                  [unexpected disconnect]
        → onReconnect(client)           [if reconnected within window]
      → onLeave(client, consented)      [intentional leave]
    → onBeforePatch()                   [every patchRate interval]
  → onBeforeShutdown()                  [graceful shutdown]
→ onDispose()                           [room destroyed]
```

### onAuth — Static vs Instance

```typescript
// Static onAuth (recommended) — no room instance access
static async onAuth(token: string, options: any, context: AuthContext) {
  const user = await JWT.verify(context.token);
  return user;
}

// Instance onAuth — has access to room state (legacy)
async onAuth(client: Client, options: any, context: AuthContext) {
  const user = await JWT.verify(context.token);
  return user;
}
```

**AuthContext properties:**
- `context.token` — Authentication token from client
- `context.headers` — HTTP request headers
- `context.ip` — Client IP address (`X-Real-IP`, `X-Forwarded-For`, or `remoteAddress`)

## Room Properties

| Property | Type | Description |
|----------|------|-------------|
| `this.state` | Schema | Synchronized state object |
| `this.roomId` | string | Unique room instance ID |
| `this.roomName` | string | Room type name (e.g., `'sandbox'`) |
| `this.clients` | Client[] | Connected clients array |
| `this.maxClients` | number | Maximum allowed clients |
| `this.patchRate` | number | State sync interval in ms (default: 50) |
| `this.autoDispose` | boolean | Auto-destroy when empty (default: true) |
| `this.clock` | ClockTimer | Room clock for timers/intervals |
| `this.presence` | Presence | Cross-process communication |
| `this.seatReservationTimeout` | number | Seat hold duration in seconds (default: 15) |

## Room Methods

### State & Sync

```typescript
// Set the synchronized state (call in onCreate)
this.state = new GameState();

// Control patch broadcast interval (default 50ms = 20Hz)
this.setPatchRate(50);

// Set max clients (auto-locks room when reached)
this.maxClients = 16;

// Manually lock/unlock room (prevents new joins)
this.lock();
this.unlock();

// Set room metadata (visible in room listings)
await this.setMetadata({ mode: 'deathmatch', map: 'arena' });

// Enable/disable auto-dispose when empty
this.autoDispose = false;
```

### Seat Reservation

```typescript
// Time to hold a reserved seat (in seconds)
this.setSeatReservationTime(60);
// Or set as property
this.seatReservationTimeout = 60;
```

## Message Handling

### Defining Handlers

Messages are defined as an object in the room class:

```typescript
export class GameRoom extends Room<GameState> {
  // Message handlers object
  messages = {
    // Simple handler
    'move': (client: Client, message: MoveMessage) => {
      this.processInput(client.sessionId, message);
    },

    // With Zod validation
    'chat': {
      schema: z.object({
        text: z.string().max(200),
        channel: z.enum(['global', 'team']),
      }),
      handler: (client: Client, message: ChatMessage) => {
        this.broadcast('chat', {
          sender: client.sessionId,
          ...message,
        });
      },
    },

    // Wildcard handler (catch-all)
    '*': (client: Client, type: string, message: any) => {
      console.log(`Unhandled message: ${type}`, message);
    },
  };
}
```

### Legacy onMessage (in onCreate)

```typescript
override async onCreate(options: JoinOptions) {
  this.onMessage<MoveMessage>('move', (client, message) => {
    const sanitized: MoveMessage = {
      x: Number(message.x ?? 0),
      z: Number(message.z ?? 0),
      sprint: Boolean(message.sprint),
    };
    this.processInput(client.sessionId, sanitized);
  });

  // Wildcard handler
  this.onMessage('*', (client, type, message) => {
    console.log(`Unhandled: ${type}`, message);
  });
}
```

### Broadcasting

```typescript
// To all clients
this.broadcast('chat', { sender: 'System', text: 'Welcome!' });

// To all except sender
this.broadcast('chat', { sender: username, text }, { except: client });

// To specific client
client.send('error', { message: 'Invalid action' });

// Send raw bytes
client.sendBytes('binary', new Uint8Array([1, 2, 3]));
```

### Input Sanitization (Anti-Cheat)

Always validate client input and overwrite identity fields server-side:

```typescript
this.onMessage('move', (client, msg) => {
  const sanitized = {
    x: clamp(Number(msg.x ?? 0), -1, 1),
    z: clamp(Number(msg.z ?? 0), -1, 1),
    sprint: Boolean(msg.sprint),
    sessionId: client.sessionId, // Force server-known identity
  };
  this.inputs.set(client.sessionId, sanitized);
});
```

## Clock & Simulation

### Simulation Interval

Fixed-rate game loop that runs independently of client connections:

```typescript
this.setSimulationInterval((deltaTime) => {
  this.applyInputs();
  this.physics.step();
  this.syncState();
}, 1000 / 60); // 60 Hz = ~16.67ms
```

### Room Clock

```typescript
// Delayed action
const delayed = this.clock.setTimeout(() => {
  this.endRound();
}, 30_000); // 30 seconds

// Repeating action
const interval = this.clock.setInterval(() => {
  this.spawnPowerup();
}, 10_000); // Every 10 seconds

// Cancel
delayed.clear();
interval.clear();

// Pause/resume
delayed.pause();
delayed.resume();

// Current time
const elapsed = this.clock.currentTime; // ms since room creation
const dt = this.clock.deltaTime;        // ms since last tick
```

**Note:** All clock timers are automatically disposed when the room is destroyed.

## Client Object

The `Client` instance represents a connected player:

| Property | Type | Description |
|----------|------|-------------|
| `client.sessionId` | string | Unique session identifier |
| `client.auth` | any | Return value from `onAuth` |
| `client.userData` | any | Custom per-client data storage |
| `client.reconnectionToken` | string | Token for reconnection |

```typescript
// Store custom data on the client
client.userData = { team: 'red', role: 'attacker' };

// Send message to specific client
client.send('notification', { text: 'You were hit!' });

// Disconnect client with custom code
client.leave(4001); // code >= 4000 for custom application codes
```

## Server-Authoritative Game Loop Pattern

The canonical pattern: Input Collection -> Physics -> State Sync

```
Client sends input → Server stores input
  → Simulation tick: apply inputs → step physics → sync state to schema
  → Colyseus broadcasts state patches to all clients
```

```typescript
// Store inputs (not immediately applied)
this.onMessage('move', (client, msg) => {
  this.inputs.set(client.sessionId, {
    message: msg,
    timestamp: Date.now(),
  });
});

// Simulation interval
this.setSimulationInterval(() => {
  // 1. Apply stored inputs to physics
  this.inputs.forEach((input, sessionId) => {
    this.physics.setCharacterInput(sessionId, input.message);
  });

  // 2. Step physics
  this.physics.step();

  // 3. Sync physics results → schema state
  this.state.characters.forEach((char, id) => {
    const pos = this.physics.getPosition(id);
    char.transform.translate.x = pos.x;
    char.transform.translate.y = pos.y;
    char.transform.translate.z = pos.z;
  });
}, 1000 / 60);
```

## Server Methods

```typescript
// Remove a room type at runtime
gameServer.removeRoomType('deprecated_room');

// Simulate latency (development only)
gameServer.simulateLatency(200); // 200ms delay

// Shutdown callbacks
gameServer.onBeforeShutdown(async () => {
  // Notify rooms, save state
});

gameServer.onShutdown(async () => {
  // Cleanup DB connections, etc.
  await database.disconnect();
});

// Trigger graceful shutdown manually
gameServer.gracefullyShutdown();

// Handle process signals
process.on('SIGTERM', () => gameServer.gracefullyShutdown());
process.on('SIGINT', () => gameServer.gracefullyShutdown());
```

## devMode

When `devMode: true`, Colyseus restores previous room states on server restart. Useful during development:

```typescript
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
  devMode: process.env.NODE_ENV !== 'production',
});
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Message handler not firing | Handler registered after `onCreate` | Register all handlers in `onCreate` or use `messages` object |
| onLeave cleanup missed | Async operations in onLeave | Use `try/finally`, handle graceful vs ungraceful |
| "seat reservation expired" | Client didn't connect within timeout | Increase `setSeatReservationTime()`, check server overload |
| Double join in dev | React Strict Mode | Use `isJoining` lock flag |
| Room not disposing | `autoDispose` set to false | Set `autoDispose = true` or manually call `this.disconnect()` |

## Additional Resources

- [Server recipes](references/recipes.md) — Command pattern, custom room IDs, password-protected rooms, deny join
- [Matchmaker API](references/matchmaker-api.md) — Server-side matchmaking, seat reservations, room queries, stats
- [Unit testing](references/unit-testing.md) — @colyseus/testing, ColyseusTestServer, waiting methods
- [Schema state reference](../colyseus-state/SKILL.md)
- [Client SDK reference](../colyseus-client/SKILL.md)
- [Authentication](../colyseus-auth/SKILL.md)
- [Official Colyseus docs](https://docs.colyseus.io/)
