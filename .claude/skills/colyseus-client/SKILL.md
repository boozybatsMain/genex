---
name: colyseus-client
description: "Colyseus client SDK reference for TypeScript/JavaScript. Covers Client class initialization, room connection methods (joinOrCreate, join, create, joinById, reconnect, consumeSeatReservation), room properties (state, sessionId, roomId), sending messages (room.send, room.sendBytes), receiving messages (room.onMessage), state listening (getStateCallbacks, onChange, listen, onAdd, onRemove), room events (onLeave, onDrop, onReconnect, onError, onStateChange), reconnection with backoff, latency measurement (client.getLatency, room.ping), HTTP utilities (client.http), multi-region selection (Client.selectByLatency), room listings, full-stack type safety, and debug panel. Use when connecting to a Colyseus server, listening for state changes, handling messages, implementing reconnection, or debugging client-server communication."
---

# Colyseus Client SDK Reference

Complete reference for `colyseus.js` / `@colyseus/sdk` client library (TypeScript/JavaScript).

## Installation

```bash
npm install --save @colyseus/sdk
# or
npm install --save colyseus.js
```

The SDK includes TypeScript definitions out of the box.

## Client Initialization

```typescript
import { Client } from '@colyseus/sdk';

// Basic
const client = new Client('ws://localhost:2567');

// With SSL
const client = new Client('wss://game.example.com');

// HTTP URL (auto-detects ws/wss)
const client = new Client('http://localhost:2567');
```

### Full-Stack Type Safety

Import the server's type definition for complete type safety across client and server:

```typescript
import { Client } from '@colyseus/sdk';
import type { server } from '../../server/src/app.config.ts';

const client = new Client<typeof server>('http://localhost:2567');
// Now client.joinOrCreate() has full type inference for room names and state
```

**Note:** `import type` only imports type information at compile time — no server code is included in your client bundle.

### State Type Options

```typescript
// Option 1: State type only
import type { MyState } from '../server/rooms/schema/MyState';
const room = await client.joinOrCreate<MyState>('my_room');

// Option 2: Room type (infers state)
import type { MyRoom } from '../server/rooms/MyRoom';
const room = await client.joinOrCreate<MyRoom>('my_room');

// Option 3: Share schema class (reduced bandwidth — server skips sending structure)
import { MyState } from '../server/rooms/MyState';
const room = await client.joinOrCreate('my_room', {}, MyState);
```

## Joining Rooms

```typescript
// Join or create — most common (ignores locked/private rooms)
const room = await client.joinOrCreate<GameState>('sandbox', {
  worldId: 'world-123',
  username: 'player1',
});

// Join existing room only (throws if none available)
const room = await client.join<GameState>('sandbox', options);

// Create new room (always creates fresh)
const room = await client.create<GameState>('sandbox', options);

// Join specific room by ID (enables "invite links", allows private rooms)
const room = await client.joinById<GameState>('room-id-here', options);

// Reconnect using token from previous session
const room = await client.reconnect<GameState>(reconnectionToken);

// Use server-generated seat reservation
const room = await client.consumeSeatReservation<GameState>(seatReservation);
```

### Join Method Summary

| Method | Behavior | Use Case |
|--------|----------|----------|
| `joinOrCreate(name, opts)` | Join existing or create new | Default matchmaking |
| `join(name, opts)` | Join existing only | When room must exist |
| `create(name, opts)` | Always create new | Custom/private rooms |
| `joinById(roomId, opts)` | Join specific room by ID | Invite links, rejoin |
| `reconnect(token)` | Reconnect after disconnect | Session recovery |
| `consumeSeatReservation(reservation)` | Use pre-reserved seat | Server-side matchmaking |

## Room Properties

```typescript
room.id;                  // Server-assigned room ID (alias: room.roomId)
room.sessionId;           // This client's unique session ID
room.name;                // Room name (e.g., 'sandbox')
room.state;               // Synchronized state object
room.connection;          // WebSocket connection
room.reconnectionToken;   // Token for reconnection
```

## Sending Messages

```typescript
// Send typed message with payload
room.send('move', { x: 1, z: 0, sprint: false });

// Send string-only (no payload)
room.send('ping');

// Send with numeric type (more efficient)
room.send(0, { x: 1, z: 0 });

// Send raw bytes
room.sendBytes('binary', new Uint8Array([1, 2, 3]));
```

## Receiving Messages

```typescript
// Listen for specific message type
const unsub = room.onMessage('chat', (payload) => {
  console.log(payload.sender, payload.text);
});

// Listen for all messages (wildcard)
const unsub = room.onMessage('*', (type, payload) => {
  console.log('Received:', type, payload);
});

// Cleanup
unsub();
```

**Tip**: Register no-op handlers for expected broadcasts to suppress Colyseus "unhandled message" warnings:

```typescript
room.onMessage('hitscan.fired', () => {}); // Suppress warning
```

## State Listening

### getStateCallbacks (Modern API)

```typescript
import { getStateCallbacks } from 'colyseus.js';

const $ = getStateCallbacks(room);

// Schema change (any field)
$(room.state.player).onChange(() => { /* ... */ });

// Specific field listener
$(room.state.player).listen('health', (current, previous) => { /* ... */ });

// MapSchema add/remove
$(room.state).players.onAdd((player, key) => {
  // Set up per-entity listeners
  $(player.transform.translate).onChange(() => {
    updatePosition(key, player.transform.translate);
  });
});
$(room.state).players.onRemove((player, key) => { /* ... */ });

// ArraySchema add/remove
$(room.state).items.onAdd((item, index) => { /* ... */ });
$(room.state).items.onRemove((item, index) => { /* ... */ });
```

### onStateChange

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

## Room Events

```typescript
// Client left the room
room.onLeave((code) => {
  // code 1000 = normal close
  // code 1006 = abnormal (connection lost)
  // code >= 4000 = custom application codes
  console.log('Left room with code:', code);
});

// Unexpected disconnection (temporary)
room.onDrop((code) => {
  // Automatic reconnection is attempted
  console.log('Connection dropped:', code);
});

// Successfully reconnected after drop
room.onReconnect(() => {
  console.log('Reconnected!');
});

// Error occurred
room.onError((code, message) => {
  console.error(`Error ${code}: ${message}`);
});
```

## Reconnection

### Automatic Reconnection (onDrop/onReconnect)

Modern Colyseus supports automatic reconnection via `onDrop`:

```typescript
room.onDrop((code) => {
  console.log('Connection dropped, attempting reconnect...');
});

room.onReconnect(() => {
  console.log('Reconnected successfully!');
});

// Configure reconnection behavior
room.reconnection.maxRetries = 10;
room.reconnection.delay = 1000;       // Initial delay (ms)
room.reconnection.maxDelay = 16000;    // Maximum delay (ms)
```

### Manual Reconnection

```typescript
// Store the token during active session
let reconnectionToken = room.reconnectionToken;

// On disconnect, attempt reconnect
room.onLeave(async (code) => {
  if (code !== 1000) { // Abnormal disconnect
    try {
      const newRoom = await client.reconnect(reconnectionToken);
      console.log('Reconnected!');
    } catch (e) {
      console.error('Reconnection failed:', e);
    }
  }
});
```

### Reconnection with Exponential Backoff

```typescript
async function attemptReconnect(
  client: Client,
  joinFn: () => Promise<Room>,
  maxAttempts = 8,
): Promise<Room | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 16000);
    const jitter = Math.random() * Math.min(baseDelay * 0.5, 3000);

    await sleep(baseDelay + jitter);

    try {
      return await joinFn();
    } catch (e) {
      console.warn(`Reconnect attempt ${attempt}/${maxAttempts} failed`);
    }
  }
  return null;
}
```

## Latency Measurement

```typescript
// Pre-connection latency check
const latency = await client.getLatency();
console.log(`Latency: ${latency}ms`);

// During active session
const ping = await room.ping();
console.log(`Ping: ${ping}ms`);
```

### Multi-Region Selection

Automatically route to the lowest-latency server:

```typescript
const bestClient = await Client.selectByLatency([
  'wss://us-east.game.example.com',
  'wss://eu-west.game.example.com',
  'wss://ap-southeast.game.example.com',
]);

const room = await bestClient.joinOrCreate('sandbox');
```

## HTTP Utilities

The client provides HTTP methods that automatically include authentication tokens:

```typescript
// GET request
const response = await client.http.get('/profile');

// POST request
const response = await client.http.post('/save', { score: 100 });

// PUT request
const response = await client.http.put('/settings', { volume: 0.8 });

// DELETE request
const response = await client.http.delete('/session');
```

## Room Listings

```typescript
// Get available rooms
const rooms = await client.getAvailableRooms('sandbox');
rooms.forEach((room) => {
  console.log(room.roomId, room.clients, room.maxClients, room.metadata);
});
```

## Connection Checking

```typescript
// Check if connection is alive before sending
if (room.connection?.isOpen) {
  room.send('event', data);
}
```

## Debug Panel

Enable the built-in debug panel for development:

```typescript
import '@colyseus/sdk/debug';
```

This provides a visual overlay showing connection state, messages, and state changes.

## Authentication Token

```typescript
// Set auth token before joining (managed automatically if using @colyseus/auth)
client.auth.token = 'YOUR_AUTH_TOKEN';

// Token is automatically sent with joinOrCreate/join/create calls
const room = await client.joinOrCreate('sandbox');
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Schema not found" | Schema class not imported on client | Import all schema classes in client entry |
| Double join in dev | React Strict Mode | Use `isJoining` lock flag |
| "seat reservation expired" | Client didn't connect in time | Check network, increase server timeout |
| Messages not received | No handler registered | Register handler with `room.onMessage()` |
| State stale after reconnect | Old room reference | Use new room from reconnect call |
| WebSocket connection refused | Wrong URL or server not running | Check URL protocol (ws/wss) and port |

## Additional Resources

- [Server & Room reference](../colyseus-server/SKILL.md)
- [Schema state reference](../colyseus-state/SKILL.md)
- [React integration](../colyseus-react/SKILL.md)
- [Official Client SDK docs](https://docs.colyseus.io/sdk/)
