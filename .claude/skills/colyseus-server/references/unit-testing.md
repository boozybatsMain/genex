# Colyseus Unit Testing Reference

Testing Colyseus rooms with `@colyseus/testing`.

## Installation

```bash
npm install --save-dev @colyseus/testing
```

## Setup

```typescript
import { ColyseusTestServer, boot } from '@colyseus/testing';
import appConfig from '../src/app.config';

describe('Game Room', () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(appConfig);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  beforeEach(async () => {
    await colyseus.cleanup(); // Clean up rooms between tests
  });
});
```

## ColyseusTestServer API

```typescript
// Boot the test server from app config
async function boot(appConfig): Promise<ColyseusTestServer>

// Create a server-side room instance
async function createRoom(roomName: string, options?: any): Promise<Room>

// Connect a client to a room (returns client-side Room from JS SDK)
async function connectTo(room: Room, options?: any): Promise<ClientRoom>

// Access to the full Colyseus JS SDK
colyseus.sdk  // has .joinOrCreate(), .join(), etc.
```

## Server-Side Waiting Methods

Available on the Room instance returned by `createRoom()`:

```typescript
// Wait for the server to process any next message
await room.waitForNextMessage();

// Wait for a specific message type (returns [client, message] tuple)
const [client, message] = await room.waitForMessage('move');

// Wait for state patch to be sent to clients
await room.waitForNextPatch();

// Wait for one simulation tick (requires setSimulationInterval)
await room.waitForNextSimulationTick();
```

## Client-Side Waiting Methods

```typescript
// Wait for client state to sync with server
await client.waitForNextPatch();
```

## Full Test Example

```typescript
it('should handle player movement', async () => {
  const room = await colyseus.createRoom('sandbox', {});
  const client1 = await colyseus.connectTo(room);
  const client2 = await colyseus.connectTo(room);

  expect(client1.sessionId).toEqual(room.clients[0].sessionId);

  // Send a message
  client1.send('move', { x: 10, z: 5 });
  await room.waitForNextMessage();

  // Wait for state to sync
  await room.waitForNextPatch();

  // Verify state is synchronized
  expect(client1.state.toJSON()).toEqual(room.state.toJSON());
});

it('should authenticate and reject invalid users', async () => {
  const room = await colyseus.createRoom('sandbox', {});

  // Connect with valid auth
  const client = await colyseus.connectTo(room, { token: validToken });
  expect(client.sessionId).toBeTruthy();

  // Connect with invalid auth should throw
  await expect(
    colyseus.connectTo(room, { token: 'invalid' })
  ).rejects.toThrow();
});

// Using SDK directly (tests full matchmaking flow)
it('should joinOrCreate battle_room', async () => {
  const client = await colyseus.sdk.joinOrCreate('battle_room', { team: 'red' });
  expect(client.sessionId).toBeTruthy();
});
```
