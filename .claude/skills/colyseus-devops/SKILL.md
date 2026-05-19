---
name: colyseus-devops
description: "Colyseus deployment, scaling, and monitoring reference. Covers single-process setup, multi-process scaling (RedisPresence, RedisDriver, publicAddress), PM2 configuration (fork mode, multiple instances), NGINX reverse proxy (sticky sessions, WebSocket upgrade, SSL), Docker deployment, Heroku, Vultr Marketplace, Colyseus Cloud, Colyseus Monitor dashboard, Colyseus Playground testing tool, CORS configuration, graceful shutdown (onBeforeShutdown, onShutdown, SIGTERM/SIGINT), room caching (onCacheRoom, onRestoreRoom), latency simulation, performance tuning (patchRate, simulationInterval, buffer size, seat reservation), and self-hosting best practices. Use when deploying a Colyseus server, scaling to multiple processes, setting up reverse proxies, monitoring rooms, or optimizing server performance."
---

# Colyseus Deployment, Scaling & Monitoring Reference

Reference for deploying, scaling, and monitoring Colyseus servers in production.

## Single Process (Development)

Default setup — all rooms run in one Node.js process:

```typescript
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('sandbox', SandboxRoom).filterBy(['worldId']);
gameServer.listen(2567);
```

## Multi-Process Scaling

### Core Principles

- Each Room belongs to a **single** Colyseus process
- Increasing processes = more room capacity (rooms are equally distributed)
- Client connections are directly associated with the process that created the room
- **Redis is mandatory** for multi-process deployments

### Connection Flow (Multi-Process)

1. Client requests seat reservation → handled by **any** process via Redis pub/sub
2. Client establishes WebSocket → connects **directly** to the process that owns the room

### Redis Presence + Driver

```typescript
import { Server } from '@colyseus/core';
import { RedisPresence } from '@colyseus/redis-presence';
import { RedisDriver } from '@colyseus/redis-driver';

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
  presence: new RedisPresence({ url: 'redis://localhost:6379' }),
  driver: new RedisDriver({ url: 'redis://localhost:6379' }),
  publicAddress: `backend.yourdomain.com/${portOffset}`,
});
```

| Component | Purpose |
|-----------|---------|
| `RedisPresence` | Shares presence data (who's online, room metadata) across processes |
| `RedisDriver` | Stores room listings and matchmaking data in Redis |
| `publicAddress` | External address clients use to connect directly to this process |

### Public Address

Each process needs a unique public address. Common pattern using PM2's `NODE_APP_INSTANCE`:

```typescript
const portOffset = Number(process.env.PORT) + Number(process.env.NODE_APP_INSTANCE || 0);
publicAddress: `backend.yourdomain.com/${portOffset}`,
```

## PM2 Configuration

Use **fork mode** (not cluster mode) — Colyseus manages its own room distribution:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'game-server',
    script: 'dist/index.js',
    instances: 4,           // Number of processes
    exec_mode: 'fork',      // MUST be fork, not cluster
    env: {
      NODE_ENV: 'production',
      REDIS_URL: 'redis://localhost:6379',
    },
  }],
};
```

**Important:** Do **not** use PM2 cluster mode — it interferes with Colyseus's internal process management.

### PM2 Commands

```bash
# Start with config
pm2 start ecosystem.config.js

# Reload (zero-downtime)
pm2 reload game-server

# Logs
pm2 logs game-server

# Monitor
pm2 monit
```

## NGINX Reverse Proxy

```nginx
upstream colyseus {
  # Sticky sessions required for WebSocket
  ip_hash;
  server 127.0.0.1:2567;
  server 127.0.0.1:2568;
  server 127.0.0.1:2569;
  server 127.0.0.1:2570;
}

server {
  listen 80;
  server_name game.example.com;

  location / {
    proxy_pass http://colyseus;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 86400;  # 24h timeout for WebSocket
    proxy_send_timeout 86400;  # 24h timeout for WebSocket
  }
}
```

**Key settings:**
- `ip_hash` provides sticky sessions so WebSocket upgrades hit the same process
- `proxy_http_version 1.1` + `Upgrade` headers are required for WebSocket
- Long timeouts (86400s) prevent proxy from closing idle WebSocket connections

### SSL with Let's Encrypt

```nginx
server {
  listen 443 ssl;
  server_name game.example.com;

  ssl_certificate /etc/letsencrypt/live/game.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/game.example.com/privkey.pem;

  location / {
    proxy_pass http://colyseus;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
  }
}
```

### Apache (Alternative)

Required modules: `ssl`, `proxy`, `proxy_http`, `proxy_html`, `proxy_wstunnel`.

## Docker

```dockerfile
FROM node:22-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

ENV PORT=2567
EXPOSE 2567

CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
services:
  game-server:
    build: .
    ports:
      - "2567:2567"
    environment:
      - PORT=2567
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

Use `.dockerignore` to exclude `node_modules/` to prevent local modules overwriting container installations.

## Hosting Options

| Platform | Best For | Scaling Support |
|----------|----------|----------------|
| **Colyseus Cloud** | Managed hosting, easy deploy | Full horizontal scaling |
| **Vultr Marketplace** | Pre-configured VPS | Manual with PM2/nginx |
| **Docker + K8s** | Container orchestration | Full horizontal scaling |
| **Self-hosted VPS** | Full control | Manual with PM2/nginx |
| **Heroku** | Prototyping only | No multi-process scaling |

## Monitoring

### Colyseus Monitor

Built-in dashboard for inspecting rooms and clients:

```typescript
import { monitor } from '@colyseus/monitor';

// Mount after room definitions
app.use('/colyseus', monitor());
```

Access at `http://localhost:2567/colyseus` — shows:
- Active rooms and their state
- Connected clients per room
- Room creation/disposal events
- Message traffic

### Colyseus Playground

Testing interface for joining rooms manually:

```typescript
import { playground } from '@colyseus/playground';

app.use('/playground', playground());
```

Access at `http://localhost:2567/playground` — allows:
- Joining rooms with custom options
- Sending messages manually
- Inspecting state changes in real-time

**Note:** Disable both monitor and playground in production.

## CORS Configuration

```typescript
import { Server } from '@colyseus/core';

// Colyseus-level CORS (for REST endpoints like room listing)
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
  getCorsHeaders: (req) => ({
    'Access-Control-Allow-Origin': 'https://game.example.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }),
});

// Express-level CORS (separate)
import cors from 'cors';
app.use(cors({ origin: 'https://game.example.com' }));
```

## Graceful Shutdown

```typescript
// Custom shutdown callbacks
gameServer.onBeforeShutdown(async () => {
  // Notify rooms, allow in-flight operations to complete
  console.log('Server shutting down...');
});

gameServer.onShutdown(async () => {
  // Final cleanup: close DB connections, flush logs
  await database.disconnect();
});

// Handle process signals
process.on('SIGTERM', () => gameServer.gracefullyShutdown());
process.on('SIGINT', () => gameServer.gracefullyShutdown());
```

## Room Caching (Cross-Process Transfer)

For moving rooms between processes during scaling:

```typescript
class SandboxRoom extends Room<GameState> {
  override async onCacheRoom(): Promise<any> {
    // Called when room is being moved to another process
    return {
      worldId: this.worldId,
      // Serialize any non-schema state
    };
  }

  override async onRestoreRoom(cachedData: any): Promise<void> {
    // Restore state from cache
    this.worldId = cachedData.worldId;
  }
}
```

## Performance Tuning

| Setting | Default | Recommendation |
|---------|---------|----------------|
| `setPatchRate(ms)` | 50ms (20 Hz) | Keep default or increase for fast-paced games |
| `setSimulationInterval(cb, ms)` | — | 16ms (60 Hz) for physics, 33ms (30 Hz) for turn-based |
| `Encoder.BUFFER_SIZE` | 4096 | Increase to 16384+ for large state |
| `setSeatReservationTime(sec)` | 15 | Increase for slow-loading clients |
| `maxClients` | unlimited | Set per room type to prevent overload |

### Capacity Guidelines

A small cloud server (1 vCPU, 1GB RAM) can typically handle:
- **1,000-2,000** concurrent connections for simple games
- RAM usage: ~2-5KB per connection
- CPU: depends on game logic complexity (physics, AI, etc.)

### Latency Simulation (Development)

```typescript
// Add artificial latency for testing
gameServer.simulateLatency(200); // 200ms round-trip delay
```

### Custom Process Selection

Control which process creates a room:

```typescript
gameServer.define('sandbox', SandboxRoom)
  .filterBy(['worldId'])
  .selectProcessIdToCreateRoom = async (roomName, options) => {
    // Custom logic to select process
    return processId;
  };
```

## Additional Resources

- [Presence API](references/presence-api.md) — Full interface for cross-process communication, pub/sub, key-value, sets, hashes
- [Load testing](references/load-testing.md) — @colyseus/loadtest CLI, bot scripts, monitor options
- [Server & Room reference](../colyseus-server/SKILL.md)
- [Official Colyseus docs](https://docs.colyseus.io/)
- [Scalability guide](https://docs.colyseus.io/scalability/)
