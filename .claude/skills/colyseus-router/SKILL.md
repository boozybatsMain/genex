---
name: colyseus-router
description: "Decision framework for Colyseus multiplayer game development. Routes to specialized Colyseus skills (server, state, client, auth, devops, react) based on task requirements. Use when implementing multiplayer features, deciding which Colyseus skill to load, or needing guidance on which skills to combine."
---

# Colyseus Router

Routes to 6 specialized Colyseus multiplayer framework skills based on task requirements.

## Routing Protocol

1. **Classify** — Identify primary task type from user request
2. **Match** — Find skill(s) with highest signal match
3. **Combine** — Most Colyseus tasks need 2-3 skills together
4. **Load** — Read matched SKILL.md files before implementation

## Quick Route

### Tier 1: Core (Always Consider)

| Task Type | Skill | Primary Signal Words |
|-----------|-------|---------------------|
| Room logic | `colyseus-server` | room, onCreate, onJoin, onLeave, lifecycle, simulation, broadcast, message handler, clock, timer |
| Networked state | `colyseus-state` | schema, @type, MapSchema, ArraySchema, state sync, delta, onChange, listen, onAdd, onRemove |
| Client connection | `colyseus-client` | joinOrCreate, room.send, onMessage, reconnect, getStateCallbacks, sessionId, client SDK |

### Tier 2: Domain-Specific (Add When Needed)

| Task Type | Skill | Primary Signal Words |
|-----------|-------|---------------------|
| Authentication | `colyseus-auth` | onAuth, JWT, OAuth, login, signIn, token, password, anonymous, middleware |
| Deployment/Scaling | `colyseus-devops` | deploy, scale, Redis, PM2, nginx, Docker, monitor, playground, CORS, production |
| React integration | `colyseus-react` | useEffect, Zustand, NetworkBridge, useFrame, Context, provider, React Strict Mode |

## Signal Matching Rules

### Priority Order

When multiple signals present, resolve by priority:

1. **Explicit API** — "add onAuth" → `colyseus-auth`
2. **Specific technique** — "implement state callbacks" → `colyseus-state`
3. **Problem domain** — "deploy to production" → `colyseus-devops`
4. **Default** — Fall back to `colyseus-server` + `colyseus-client`

### Confidence Scoring

- **High (3+ signals)** — Route immediately
- **Medium (1-2 signals)** — Route with `colyseus-server` as base
- **Low (0 signals)** — Ask user for clarification

## Common Combinations

### New Room Type (3 skills)

```
colyseus-server → Room lifecycle, message handlers, simulation loop
colyseus-state  → Schema definition, collections, nested schemas
colyseus-client → Join flow, state listening, message sending
```

Wiring: Server defines room logic, state defines what syncs, client connects and listens.

### Multiplayer UI Feature (3 skills)

```
colyseus-client → Message sending/receiving, state callbacks
colyseus-state  → Schema fields for the feature
colyseus-react  → Bridge state to React/Zustand, cleanup patterns
```

Wiring: Client handles protocol, state defines data, React renders UI.

### Add Authentication (2-3 skills)

```
colyseus-auth   → Auth module setup, onAuth, JWT, OAuth
colyseus-server → Room-level onAuth integration
colyseus-client → Token management, auth API calls
```

Wiring: Auth module handles identity, server validates on join, client manages tokens.

### Real-Time Game Loop (3 skills)

```
colyseus-server → setSimulationInterval, input collection, physics sync
colyseus-state  → Transform schemas, bandwidth optimization (float32)
colyseus-react  → useFrame access, two-tier updates, NetworkBridge
```

Wiring: Server runs authoritative simulation, state syncs positions, React renders without re-renders.

### Deploy to Production (2 skills)

```
colyseus-devops → Redis, PM2, nginx, Docker, monitoring
colyseus-server → Graceful shutdown, devMode, buffer size
```

Wiring: DevOps handles infrastructure, server handles application-level production config.

### Add Reconnection (2 skills)

```
colyseus-client → reconnect(), reconnectionToken, onDrop/onReconnect
colyseus-server → onDrop, onReconnect lifecycle, setSeatReservationTime
```

Wiring: Client stores token and retries, server holds seat and restores state.

## Decision Table

| Scenario | Server | State | Client | Auth | DevOps | React | Route To |
|----------|--------|-------|--------|------|--------|-------|----------|
| New room type | Yes | Yes | Yes | No | No | No | server + state + client |
| Add schema field | No | Yes | Maybe | No | No | No | state (+ client if listening) |
| Message handler | Yes | No | Yes | No | No | No | server + client |
| Login/signup | No | No | Yes | Yes | No | Maybe | auth + client (+ react) |
| Deploy | Maybe | No | No | No | Yes | No | devops (+ server) |
| React UI for state | No | Maybe | Yes | No | No | Yes | react + client (+ state) |
| Game physics sync | Yes | Yes | No | No | No | Yes | server + state + react |
| Room filtering | Yes | No | Yes | No | No | No | server + client |
| Debug state sync | No | Yes | Yes | No | No | No | state + client |
| Performance tune | Yes | Yes | No | No | Maybe | Maybe | server + state |

## Skill Dependencies

```
colyseus-server (foundation)
├── colyseus-state (extends server — defines what syncs)
├── colyseus-client (connects to server)
│   └── colyseus-react (extends client — React patterns)
├── colyseus-auth (extends server — authentication)
└── colyseus-devops (deploys server — infrastructure)
```

- `colyseus-server` is the foundation — almost always relevant
- `colyseus-state` and `colyseus-client` are the most common pair
- `colyseus-react` extends `colyseus-client` with React-specific patterns
- `colyseus-auth` is standalone but integrates with server and client
- `colyseus-devops` is standalone for deployment/infrastructure

## Quick Decision Flowchart

```
User Request
     │
     ▼
┌───────────────────────┐
│ Server-side logic?    │──Yes──▶ colyseus-server
└───────────────────────┘
     │ No
     ▼
┌───────────────────────┐
│ Schema/state changes? │──Yes──▶ colyseus-state
└───────────────────────┘
     │ No
     ▼
┌───────────────────────┐
│ Client connection?    │──Yes──▶ colyseus-client
└───────────────────────┘
     │ No
     ▼
┌───────────────────────┐
│ Authentication?       │──Yes──▶ colyseus-auth
└───────────────────────┘
     │ No
     ▼
┌───────────────────────┐
│ Deploy/scale/monitor? │──Yes──▶ colyseus-devops
└───────────────────────┘
     │ No
     ▼
┌───────────────────────┐
│ React/Zustand/R3F?    │──Yes──▶ colyseus-react
└───────────────────────┘
     │ No
     ▼
colyseus-server + colyseus-client (default)
```

## Fallback Behavior

- **Unknown task type** → Start with `colyseus-server` + `colyseus-client`
- **No clear signals** → Ask: "Is this server-side or client-side?" and "Does it involve state sync?"
- **Conflicting signals** → Prefer the more specific skill (auth > server, react > client)

## Reference

See individual skill files for detailed patterns:

- `.claude/skills/colyseus-server/SKILL.md`
- `.claude/skills/colyseus-state/SKILL.md`
- `.claude/skills/colyseus-client/SKILL.md`
- `.claude/skills/colyseus-auth/SKILL.md`
- `.claude/skills/colyseus-devops/SKILL.md`
- `.claude/skills/colyseus-react/SKILL.md`
