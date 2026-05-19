# Presence API Reference

The Presence interface provides cross-process communication, pub/sub messaging, and shared key-value storage. Required for multi-process scaling.

## Installation

```bash
npm install --save @colyseus/redis-presence
```

## Full Interface

```typescript
interface Presence {
  // === Pub/Sub ===
  subscribe(topic: string, callback: (...args: any[]) => void): Promise<this>;
  unsubscribe(topic: string, callback?: Callback): this;
  publish(topic: string, data: any): this;
  channels(pattern?: string): Promise<string[]>;

  // === Key-Value ===
  exists(key: string): Promise<boolean>;
  set(key: string, value: string): void;
  setex(key: string, value: string, seconds: number): void;
  expire(key: string, seconds: number): void;
  get(key: string): string | number | undefined;
  del(key: string): void;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;

  // === Sets ===
  sadd(key: string, value: any): void;
  smembers(key: string): Promise<string[]>;
  sismember(key: string, field: string): Promise<number>;
  srem(key: string, value: any): void;
  scard(key: string): number;
  sinter(...keys: string[]): Promise<string[]>;

  // === Hashes ===
  hset(key: string, field: string, value: string): Promise<boolean>;
  hincrby(key: string, field: string, incrBy: number): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, field: any): Promise<boolean>;
  hlen(key: string): Promise<number>;

  // === Lists ===
  llen(key: string): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  lpop(key: string): Promise<string | null>;
  rpop(key: string): Promise<string | null>;
  brpop(...args: [...keys: string[], timeoutInSeconds: number]): Promise<[string, string] | null>;

  // === Lifecycle ===
  setMaxListeners(number: number): void;
  shutdown(): void;
}
```

## Connection Options

```typescript
import { RedisPresence } from '@colyseus/redis-presence';

// Connection URL
new RedisPresence('redis://username:password@localhost:6379/0');

// Port only (localhost)
new RedisPresence(6379);

// Options object
new RedisPresence({ host: 'localhost', port: 6379 });

// Redis Cluster (high availability)
new RedisPresence(
  [
    { host: 'node1.redis.example.com', port: 6379 },
    { host: 'node2.redis.example.com', port: 6379 },
    { host: 'node3.redis.example.com', port: 6379 },
  ],
  {
    redisOptions: { password: 'your-password' },
  }
);
```

## Common Use Cases

### Inter-Room Communication

```typescript
// Room A: publish event
await this.presence.publish('global:chat', {
  sender: client.sessionId,
  text: 'Hello!',
});

// Room B: subscribe
this.presence.subscribe('global:chat', (message) => {
  this.broadcast('chat', message);
});

// Cleanup in onDispose
this.presence.unsubscribe('global:chat');
```

### Shared Player Data

```typescript
// Store online player data
this.presence.hset('online-players', client.sessionId, JSON.stringify({
  name: auth.name,
  level: auth.level,
}));

// Get all online players (from any room/process)
const players = await this.presence.hgetall('online-players');

// Remove on leave
this.presence.hdel('online-players', client.sessionId);
```

### Global Counters

```typescript
// Increment global match count
const matchNum = await this.presence.incr('total-matches');

// Track players per room type
await this.presence.hincrby('room-stats', 'battle-players', 1);
```
