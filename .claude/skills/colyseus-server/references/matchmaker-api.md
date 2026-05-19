# Matchmaker API Reference

The `matchMaker` singleton provides server-side matchmaking operations.

## Import

```typescript
import { matchMaker } from 'colyseus';
```

## Core Methods

### Room Operations (Return Seat Reservations)

```typescript
// Join or create a room
async function joinOrCreate(
  roomName: string,
  clientOptions?: ClientOptions,
  authContext?: AuthContext
): Promise<ISeatReservation>

// Create a new room
async function create(
  roomName: string,
  clientOptions?: ClientOptions,
  authContext?: AuthContext
): Promise<ISeatReservation>

// Join an existing room (throws if none available)
async function join(
  roomName: string,
  clientOptions?: ClientOptions,
  authContext?: AuthContext
): Promise<ISeatReservation>

// Join by room ID (throws if not found)
async function joinById(
  roomId: string,
  clientOptions?: ClientOptions,
  authContext?: AuthContext
): Promise<ISeatReservation>

// Reconnect to a room
async function reconnect(
  roomId: string,
  clientOptions?: ClientOptions
): Promise<ISeatReservation>
```

### Room Management

```typescript
// Create room WITHOUT seat reservation (returns room metadata)
async function createRoom(
  roomName: string,
  clientOptions?: ClientOptions
): Promise<IRoomCache>
// Returns: { roomId, processId, name, locked }

// Query cached rooms
async function query<T extends Room = any>(
  conditions?: Partial<IRoomCache>,
  sortOptions?: SortOptions
): Promise<T[]>

// Find one available public unlocked room
async function findOneRoomAvailable(
  roomName: string,
  filterOptions: ClientOptions,
  additionalSortOptions?: SortOptions
): Promise<IRoomCache>

// Get cached room data by ID (safe from any process)
function getRoomById(roomId: string): Promise<IRoomCache>

// Get local room instance (undefined if not on this process)
function getLocalRoomById(roomId: string): Room | undefined
```

### Seat Reservation

```typescript
// Reserve a seat in a specific room
async function reserveSeatFor(
  room: IRoomCache,
  options: ClientOptions,
  authData?: any
): Promise<ISeatReservation>

// Reserve multiple seats at once
async function reserveMultipleSeatsFor(
  room: IRoomCache,
  clientsData: Array<{ sessionId: string; options: ClientOptions; auth: any }>
): Promise<boolean[]>

// Build a seat reservation object (synchronous)
function buildSeatReservation(
  room: IRoomCache,
  sessionId: string
): ISeatReservation
```

### Remote Room Call

Call methods or access properties on rooms in other processes:

```typescript
async function remoteRoomCall<TRoom = Room>(
  roomId: string,
  method: keyof TRoom,
  args?: any[],
  rejectionTimeout?: number
): Promise<any>
```

```typescript
// Examples
await matchMaker.remoteRoomCall('room-id', 'lock');
await matchMaker.remoteRoomCall('room-id', 'setMetadata', [{ mode: 'ranked' }]);
```

### Room Type Management

```typescript
function defineRoomType<T extends Type<Room>>(
  roomName: string,
  klass: T,
  defaultOptions?: any
): RegisteredHandler

function removeRoomType(roomName: string): void
function getAllHandlers(): { [id: string]: RegisteredHandler }
function getHandler(roomName: string): RegisteredHandler
function getRoomClass(roomName: string): Type<Room>
```

## Statistics API

```typescript
// Fetch stats from all processes
const stats = await matchMaker.stats.fetchAll();
// => [ { processId: 'xxx', roomCount: 10, ccu: 100 }, ... ]

// Get total concurrent users across all processes
const globalCCU = await matchMaker.stats.getGlobalCCU();
// => 190
```

## Server-Side Matchmaking Flow

```typescript
// Find a room matching criteria
const room = await matchMaker.findOneRoomAvailable('battle', { mode: 'duo' });
// => { roomId: 'xxx', processId: 'yyy', name: 'battle', locked: false }

// Reserve a seat for a specific player
const reservation = await matchMaker.reserveSeatFor(room, { mode: 'duo' });
// => { sessionId: 'zzz', room: { roomId: 'xxx', ... } }

// Client consumes the reservation
// client-side: await client.consumeSeatReservation(reservation)
```

## Custom Process Selection

```typescript
const server = defineServer({
  selectProcessIdToCreateRoom: async (roomName, clientOptions) => {
    // Select process with fewest rooms
    return (await matchMaker.stats.fetchAll())
      .sort((p1, p2) => p1.roomCount > p2.roomCount ? 1 : -1)[0]
      .processId;
  },
});
```

## Query Examples

```typescript
// Find all battle rooms in duo mode
const rooms = await matchMaker.query({ name: 'battle', mode: 'duo' });

// Find battle rooms sorted by most clients
const rooms = await matchMaker.query({ name: 'battle' }, { clients: -1 });
```
