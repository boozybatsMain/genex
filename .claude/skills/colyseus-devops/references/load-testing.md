# Colyseus Load Testing Reference

Load test your Colyseus server with `@colyseus/loadtest`.

## Installation

```bash
npm install --save-dev @colyseus/loadtest
```

## CLI Usage

```bash
# Basic usage
npx colyseus-loadtest bot.ts --room my_room --numClients 50

# All options
npx colyseus-loadtest bot.ts \
  --endpoint ws://localhost:2567 \
  --room sandbox \
  --numClients 100 \
  --delay 100 \
  --reestablishAllDelay 5000 \
  --retryFailed 1000 \
  --output ./loadtest.log \
  --logLevel info
```

## Options

```typescript
type Options = {
  endpoint: string;             // WebSocket URL (default: ws://localhost:2567)
  roomName: string;             // Room handler name (--room)
  roomId: string;               // Room ID (--roomId, alternative to roomName)
  numClients: number;           // Number of connections (default: 1)
  delay: number;                // Ms between connections
  logLevel: string;             // Console verbosity
  reestablishAllDelay: number;  // Ms before reconnecting all clients
  retryFailed: number;          // Ms before retrying failed connections
  output: string;               // Log file path
  clientId: number;             // Auto-assigned per connection
  requestJoinOptions?: {
    requestNumber?: number;
  };
};
```

## Writing a Bot Script

```typescript
// bot.ts
import { cli, Options } from '@colyseus/loadtest';
import { Client, Room } from 'colyseus.js';

async function main(options: Options) {
  const client = new Client(options.endpoint);

  const room: Room = await client.joinOrCreate(
    options.roomName,
    options.requestJoinOptions
  );

  console.log('joined successfully!', options.clientId);

  // React to game state
  room.onMessage('*', (type, message) => {
    console.log('onMessage:', type, message);
  });

  // Simulate player behavior
  room.onMessage('tick', ({ tick }) => {
    room.send('move', {
      x: Math.random() * 100,
      z: Math.random() * 100,
    });
  });

  room.onStateChange((state) => {
    console.log(room.sessionId, 'new state:', state);
  });

  room.onError((err) => {
    console.log(room.sessionId, '!! ERROR !!', err.message);
  });

  room.onLeave((code) => {
    console.log(room.sessionId, 'left with code:', code);
  });
}

cli(main);
```

## Performance Notes

- Single load test process: max ~200 reliable connections
- For more, run multiple load test processes on separate machines
- Load testing stresses both client AND server
- Monitor server CPU/RAM during tests to find bottlenecks

## Monitor Dashboard Options

The `@colyseus/monitor` supports custom columns:

```typescript
import { monitor } from '@colyseus/monitor';

app.use('/monitor', monitor({
  columns: [
    'roomId',
    'name',
    'clients',
    { metadata: 'spectators' },  // room.setMetadata({ spectators: n })
    { metadata: 'gameMode' },
    'locked',
    'elapsedTime',
    'processId',
    'publicAddress',
  ],
}));
```

### Password-Protect Monitor

```typescript
import basicAuth from 'express-basic-auth';

const authMiddleware = basicAuth({
  users: { admin: 'secure_password' },
  challenge: true,
});

app.use('/monitor', authMiddleware, monitor());
```
