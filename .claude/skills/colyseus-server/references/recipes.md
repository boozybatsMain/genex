# Colyseus Server Recipes

Practical patterns from the official Colyseus documentation.

## Command Pattern (@colyseus/command)

Decouple game logic into discrete, testable commands:

```bash
npm install --save @colyseus/command
```

```typescript
import { Command, Dispatcher } from '@colyseus/command';
import { Room } from '@colyseus/core';

// Define a command
class OnJoinCommand extends Command<MyRoom, { sessionId: string }> {
  execute({ sessionId }: { sessionId: string }) {
    const player = new Player();
    player.id = sessionId;
    this.state.players.set(sessionId, player);
  }
}

class AttackCommand extends Command<MyRoom, { sessionId: string; targetId: string }> {
  execute({ sessionId, targetId }) {
    const attacker = this.state.players.get(sessionId);
    const target = this.state.players.get(targetId);
    if (!attacker || !target) return;

    target.health -= attacker.damage;

    // Return another command to chain
    if (target.health <= 0) {
      return [new OnDeathCommand().setPayload({ targetId })];
    }
  }
}

// Use in room
class MyRoom extends Room<GameState> {
  dispatcher = new Dispatcher(this);

  override async onCreate() {
    this.state = new GameState();

    this.onMessage('attack', (client, msg) => {
      this.dispatcher.dispatch(new AttackCommand(), {
        sessionId: client.sessionId,
        targetId: msg.targetId,
      });
    });
  }

  override async onJoin(client: Client) {
    this.dispatcher.dispatch(new OnJoinCommand(), {
      sessionId: client.sessionId,
    });
  }

  override async onDispose() {
    this.dispatcher.stop(); // Required cleanup
  }
}
```

**Benefits:**
- Decouples operation invocation from execution
- Commands can be queued, chained, and tested independently
- Enhances code readability for complex game logic
- Easy to extend without modifying existing code

## Custom Room IDs

Generate human-readable room IDs (e.g., for invite codes) using the Presence API:

```typescript
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class MyRoom extends Room {
  LOBBY_CHANNEL = '$mylobby';

  generateRoomIdSingle(): string {
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += LETTERS.charAt(Math.floor(Math.random() * LETTERS.length));
    }
    return result;
  }

  async generateRoomId(): Promise<string> {
    const currentIds = await this.presence.smembers(this.LOBBY_CHANNEL);
    let id: string;
    do {
      id = this.generateRoomIdSingle();
    } while (currentIds.includes(id));

    await this.presence.sadd(this.LOBBY_CHANNEL, id);
    return id;
  }

  override async onCreate(options: any) {
    this.roomId = await this.generateRoomId();
    // ... rest of onCreate
  }

  override async onDispose() {
    this.presence.srem(this.LOBBY_CHANNEL, this.roomId);
  }
}
```

**Note:** Minor race condition possible if two rooms create simultaneously — extremely unlikely in practice.

## Password-Protected Rooms

```typescript
// Server: define with filterBy
gameServer.define('battle', BattleRoom).filterBy(['password']);

// or with defineServer:
rooms: {
  battle: defineRoom(BattleRoom).filterBy(['password']),
}

// Room: set private when password is provided
export class BattleRoom extends Room {
  override async onCreate(options: any) {
    if (options.password) {
      this.setPrivate(); // Room won't appear in listings
    }
    // ... rest of onCreate
  }
}

// Client: join with password
const room = await client.joinOrCreate('battle', { password: 'secret123' });

// Client: join without password (only matches rooms without password)
const room = await client.joinOrCreate('battle', {});
```

## Deny Player Join

Throw errors in `onAuth()` or `onJoin()` to reject connections:

```typescript
export class BattleRoom extends Room {
  levelRequired = 10;

  override async onAuth(client: Client, options: any) {
    const userId = verifyToken(options.token)._id;
    const hero = await Hero.findOne({ userId });

    if (!hero) {
      throw new Error('Hero not found in database');
    }

    if (hero.level < this.levelRequired) {
      throw new Error('Player does not meet level requirement');
    }

    return hero; // Available as client.auth
  }
}

// Client: error handling
try {
  const room = await client.joinOrCreate('battle', { token });
} catch (e) {
  console.log(e.message); // "Player does not meet level requirement"
}
```

## Inter-Room Communication via Presence

Rooms can communicate across processes using the Presence pub/sub:

```typescript
// Room A: publish event
await this.presence.publish('global:chat', {
  sender: client.sessionId,
  text: 'Hello from Room A',
});

// Room B: subscribe to events
this.presence.subscribe('global:chat', (message) => {
  this.broadcast('chat', message);
});

// Cleanup
override async onDispose() {
  this.presence.unsubscribe('global:chat');
}
```

## Separate Room Types for Game Modes

```typescript
// Define different room types for different game modes
gameServer.define('lobby', LobbyRoom);
gameServer.define('deathmatch', DeathMatchRoom);
gameServer.define('capture-flag', CTFRoom);

// Client selects mode
const room = await client.joinOrCreate('deathmatch', { map: 'arena' });
```

## Data Persistence

Colyseus rooms are ephemeral — use an external database for persistence:

```typescript
override async onDispose() {
  // Save final state before room destroys
  await db.gameResults.create({
    data: {
      roomId: this.roomId,
      winner: this.state.winnerId,
      scores: Object.fromEntries(this.state.scores),
      duration: this.clock.currentTime,
    },
  });
}
```
