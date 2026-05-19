---
name: colyseus-react
description: "Colyseus React integration patterns. Covers raw useEffect connection pattern, RoomContext provider for centralized room management, AuthContext provider for authentication state, Zustand network store pattern, singleton ColyseusService with React Strict Mode protection, NetworkBridge pattern (Colyseus state to Zustand), useFrame access pattern for R3F (non-hook room access), state callback cleanup in useEffect, reconnection token caching, and two-tier update strategy (React renders for structural changes, imperative mutation for positional updates). Use when integrating Colyseus with React, managing connection lifecycle in components, bridging server state to UI state stores, or building real-time multiplayer UIs."
---

# Colyseus React Integration Reference

Patterns for integrating Colyseus with React, Zustand, and React Three Fiber (R3F).

## Installation

```bash
npm install --save @colyseus/sdk
# or
npm install --save colyseus.js
```

## Pattern 1: Raw useEffect (Simplest)

Direct connection management with hooks:

```typescript
import { Client, Room } from '@colyseus/sdk';
import { useEffect, useRef, useState } from 'react';

const client = new Client('ws://localhost:2567');

function GameComponent() {
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [players, setPlayers] = useState<Map<string, PlayerData>>(new Map());

  useEffect(() => {
    let mounted = true;

    async function connect() {
      try {
        const room = await client.joinOrCreate('sandbox', { worldId: 'main' });
        if (!mounted) {
          room.leave();
          return;
        }

        roomRef.current = room;
        setStatus('connected');

        // Set up state callbacks
        const $ = getStateCallbacks(room);

        $(room.state).players.onAdd((player, key) => {
          setPlayers((prev) => new Map(prev).set(key, extractPlayer(player)));

          $(player).onChange(() => {
            setPlayers((prev) => new Map(prev).set(key, extractPlayer(player)));
          });
        });

        $(room.state).players.onRemove((_, key) => {
          setPlayers((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        });

        room.onLeave(() => {
          if (mounted) setStatus('connecting');
        });
      } catch (e) {
        if (mounted) setStatus('error');
      }
    }

    connect();

    return () => {
      mounted = false;
      roomRef.current?.leave();
      roomRef.current = null;
    };
  }, []);

  return <div>Status: {status}, Players: {players.size}</div>;
}
```

## Pattern 2: RoomContext Provider

Centralized room management with React Context:

```typescript
import { createContext, useContext, useCallback, useRef, useState, useEffect } from 'react';
import { Client, Room, getStateCallbacks } from '@colyseus/sdk';

interface RoomContextValue {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  room: Room<GameState> | null;
  sessionId: string | null;
  join: (worldId: string) => Promise<void>;
  leave: () => Promise<void>;
}

const RoomContext = createContext<RoomContextValue | null>(null);

const client = new Client('ws://localhost:2567');

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<RoomContextValue['status']>('disconnected');
  const [room, setRoom] = useState<Room<GameState> | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const isJoining = useRef(false); // React Strict Mode protection

  const join = useCallback(async (worldId: string) => {
    if (isJoining.current || room) return;
    isJoining.current = true;
    setStatus('connecting');

    try {
      // Try reconnecting with cached token first
      const cachedToken = localStorage.getItem('reconnectionToken');
      let newRoom: Room<GameState>;

      if (cachedToken) {
        try {
          newRoom = await client.reconnect<GameState>(cachedToken);
        } catch {
          newRoom = await client.joinOrCreate<GameState>('sandbox', { worldId });
        }
      } else {
        newRoom = await client.joinOrCreate<GameState>('sandbox', { worldId });
      }

      // Cache reconnection token
      localStorage.setItem('reconnectionToken', newRoom.reconnectionToken);

      setRoom(newRoom);
      setSessionId(newRoom.sessionId);
      setStatus('connected');

      newRoom.onLeave(() => {
        setRoom(null);
        setSessionId(null);
        setStatus('disconnected');
        localStorage.removeItem('reconnectionToken');
      });
    } catch (e) {
      setStatus('error');
    } finally {
      isJoining.current = false;
    }
  }, [room]);

  const leave = useCallback(async () => {
    await room?.leave();
    setRoom(null);
    setSessionId(null);
    setStatus('disconnected');
  }, [room]);

  return (
    <RoomContext.Provider value={{ status, room, sessionId, join, leave }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used within RoomProvider');
  return ctx;
}
```

## Pattern 3: Zustand Network Store

Performance-optimized pattern separating connection state from game state:

```typescript
import { create } from 'zustand';
import type { Room } from '@colyseus/sdk';

type Status = 'disconnected' | 'connecting' | 'reconnecting' | 'connected' | 'error';

interface NetworkState {
  status: Status;
  room: Room<GameState> | null;
  sessionId: string | null;

  setConnected: (room: Room<GameState>, sessionId: string) => void;
  setDisconnected: () => void;
  setStatus: (status: Status) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  status: 'disconnected',
  room: null,
  sessionId: null,

  setConnected: (room, sessionId) =>
    set({ status: 'connected', room, sessionId }),
  setDisconnected: () =>
    set({ status: 'disconnected', room: null, sessionId: null }),
  setStatus: (status) => set({ status }),
}));

// Non-hook access for performance-critical paths (useFrame, callbacks)
export const getNetwork = () => useNetworkStore.getState();
```

## Pattern 4: Singleton Connection Service

Wraps `Client` with reconnection logic, safe for React Strict Mode:

```typescript
class ColyseusService {
  private client: Client;
  private room: Room<GameState> | null = null;
  private isJoining = false; // React Strict Mode protection
  private joinPromise: Promise<Room<GameState>> | null = null;

  constructor(wsUrl: string) {
    this.client = new Client(wsUrl);
  }

  async joinRoom(worldId: string, opts?: JoinOpts): Promise<Room<GameState>> {
    if (this.isJoining && this.joinPromise) {
      return this.joinPromise; // Wait for in-flight join
    }
    if (this.room) return this.room;

    this.isJoining = true;
    this.joinPromise = this._doJoin(worldId, opts);

    try {
      const room = await this.joinPromise;
      this.room = room;
      return room;
    } finally {
      this.isJoining = false;
      this.joinPromise = null;
    }
  }

  private async _doJoin(worldId: string, opts?: JoinOpts): Promise<Room<GameState>> {
    const room = await this.client.joinOrCreate('sandbox', { worldId, ...opts });
    this.setupHandlers(room);
    return room;
  }

  private setupHandlers(room: Room<GameState>) {
    room.onLeave((code) => {
      this.room = null;
      if (code !== 1000) {
        // Attempt reconnect for abnormal disconnects
        this.attemptReconnect(room.reconnectionToken);
      }
    });
  }

  private async attemptReconnect(token: string) {
    for (let i = 0; i < 5; i++) {
      await sleep(Math.min(1000 * Math.pow(2, i), 16000));
      try {
        const room = await this.client.reconnect<GameState>(token);
        this.room = room;
        this.setupHandlers(room);
        getNetwork().setConnected(room, room.sessionId);
        return;
      } catch { /* retry */ }
    }
    getNetwork().setDisconnected();
  }

  getRoom(): Room<GameState> | null {
    return this.room;
  }

  async leaveRoom(): Promise<void> {
    await this.room?.leave();
    this.room = null;
  }
}

export const colyseusService = new ColyseusService(API_CONFIG.wsUrl);
```

## Pattern 5: NetworkBridge (State -> Zustand)

A React component that bridges Colyseus state callbacks to Zustand stores.
Renders nothing — pure side-effects:

```typescript
import { getStateCallbacks } from '@colyseus/sdk';
import { useEffect } from 'react';

function NetworkBridge(): null {
  const room = useNetworkStore((s) => s.room);
  const sessionId = useNetworkStore((s) => s.sessionId);

  useEffect(() => {
    if (!room || !sessionId) return;

    const $ = getStateCallbacks(room);
    const disposers: (() => void)[] = [];
    const entityDisposers = new Map<string, (() => void)[]>();

    // Bridge MapSchema → Zustand store
    disposers.push(
      $(room.state).characters.onAdd((char, key) => {
        if (key === sessionId) return; // Skip local player
        remotePlayersStore.getState().addPlayer(key, extractData(char));

        // Per-entity listeners
        const charUnsubs: (() => void)[] = [];
        charUnsubs.push(
          $(char.transform.translate).onChange(() => {
            remotePlayersStore.getState().updatePlayer(key, {
              position: extractVec3(char.transform.translate),
            });
          })
        );
        entityDisposers.set(key, charUnsubs);
      }),
    );

    disposers.push(
      $(room.state).characters.onRemove((_, key) => {
        remotePlayersStore.getState().removePlayer(key);
        // Clean up per-entity listeners
        entityDisposers.get(key)?.forEach((d) => d());
        entityDisposers.delete(key);
      }),
    );

    return () => {
      disposers.forEach((d) => d());
      entityDisposers.forEach((unsubs) => unsubs.forEach((d) => d()));
      entityDisposers.clear();
    };
  }, [room, sessionId]);

  return null; // Renders nothing
}
```

## Pattern 6: useFrame Access (R3F Performance)

For performance-critical game loops, access room directly without hooks to avoid re-renders:

```typescript
import { useFrame } from '@react-three/fiber';
import { getNetwork } from '../stores/network.store';

// In an R3F component:
function PlayerController() {
  const lastSend = useRef(0);
  const SEND_INTERVAL = 50; // ms

  useFrame((_, delta) => {
    const { room } = getNetwork();
    if (!room) return;

    const now = performance.now();
    if (now - lastSend.current >= SEND_INTERVAL) {
      room.send('move', buildMoveMessage());
      lastSend.current = now;
    }
  });

  return <mesh>{/* player mesh */}</mesh>;
}
```

**Key rule:** Never call `useState` setters or Zustand `set()` inside `useFrame`. Use `getState()` for reads and refs for writes.

## Two-Tier Update Strategy

The recommended architecture for game UIs:

| Layer | Responsibility | Trigger | Example |
|-------|---------------|---------|---------|
| **React renders** | Structural changes | `onAdd` / `onRemove` | Add/remove player from scene |
| **Imperative mutation** | Positional updates | `onChange` / `useFrame` | Move player mesh every frame |

```typescript
// Structural: React re-render when player joins/leaves
$(room.state).characters.onAdd((char, key) => {
  // Triggers React re-render to add player component
  usePlayersStore.getState().addPlayer(key);
});

// Positional: Imperative mutation in useFrame (no re-render)
useFrame(() => {
  const players = usePlayersStore.getState().players;
  players.forEach((data, key) => {
    const mesh = meshRefs.current.get(key);
    if (mesh) {
      mesh.position.set(data.x, data.y, data.z);
    }
  });
});
```

## React Strict Mode Protection

React Strict Mode double-invokes effects in development. Prevent double-joining:

```typescript
const isJoining = useRef(false);

useEffect(() => {
  if (isJoining.current) return;
  isJoining.current = true;

  client.joinOrCreate('sandbox', options).then((room) => {
    // ... setup
  }).finally(() => {
    isJoining.current = false;
  });

  return () => {
    roomRef.current?.leave();
  };
}, []);
```

## State Callback Cleanup

Always return disposer functions in useEffect:

```typescript
useEffect(() => {
  if (!room) return;

  const $ = getStateCallbacks(room);
  const unsubs: (() => void)[] = [];

  unsubs.push($(room.state).players.onAdd((p, k) => { /* ... */ }));
  unsubs.push($(room.state).players.onRemove((p, k) => { /* ... */ }));
  unsubs.push($(room.state).listen('phase', (v) => { /* ... */ }));

  // Cleanup all listeners on unmount
  return () => unsubs.forEach((fn) => fn());
}, [room]);
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Double join in development | React Strict Mode | Use `isJoining` ref flag |
| State updates after unmount | Missing cleanup | Return disposers from useEffect |
| Laggy UI from state updates | Re-rendering on every position change | Use two-tier updates (React for structure, refs for position) |
| Room is null in useFrame | Checking `useNetworkStore()` hook | Use `getNetwork()` (non-hook) instead |
| Memory leak from listeners | Not cleaning up entity disposers | Track per-entity disposers in Map, clean on remove |

## Additional Resources

- [Client SDK reference](../colyseus-client/SKILL.md)
- [Server & Room reference](../colyseus-server/SKILL.md)
- [Schema state reference](../colyseus-state/SKILL.md)
- [Official React docs](https://docs.colyseus.io/getting-started/react/)
