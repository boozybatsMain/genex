# Advanced Collision Detection Reference

Collision pipeline internals, events, hooks, and CCD.

## Collision Pipeline Overview

```
Broad Phase → Narrow Phase → Solver → Events
     ↓              ↓           ↓         ↓
  AABB pairs    Contact     Forces    Callbacks
              manifolds   computed
```

1. **Broad Phase**: finds potentially-colliding pairs via AABB overlap
2. **Narrow Phase**: computes exact contacts/intersections
3. **Solver**: computes forces from contacts
4. **Events**: fires collision/force callbacks

## Event Queue

Events are collected during `world.step()` and drained afterward:

```typescript
const eventQueue = new RAPIER.EventQueue(true); // true = auto-drain previous

world.step(eventQueue);

// Drain collision events
eventQueue.drainCollisionEvents((handle1, handle2, started) => {
  // started = true: collision began
  // started = false: collision ended
});

// Drain contact force events
eventQueue.drainContactForceEvents((event) => {
  const c1 = event.collider1();
  const c2 = event.collider2();
  const force = event.totalForceMagnitude();
  const forceDir = event.totalForce(); // { x, y, z }
});
```

## Enabling Events

Events only fire if at least one collider in the pair has the appropriate flag:

```typescript
// Collision events (start/stop contact or sensor overlap)
colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

// Contact force events (fires when force magnitude exceeds threshold)
colliderDesc.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);

// Set force threshold (default: 0, meaning every contact fires)
colliderDesc.setContactForceEventThreshold(100.0);

// Active collision types: which pair types generate events
colliderDesc.setActiveCollisionTypes(
  RAPIER.ActiveCollisionTypes.DEFAULT        // dynamic-dynamic, dynamic-kinematic, dynamic-fixed
  // or
  RAPIER.ActiveCollisionTypes.ALL            // all combinations including kinematic-kinematic
  // or specific combinations:
  RAPIER.ActiveCollisionTypes.DYNAMIC_DYNAMIC
  | RAPIER.ActiveCollisionTypes.DYNAMIC_KINEMATIC
  | RAPIER.ActiveCollisionTypes.DYNAMIC_FIXED
  | RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC
  | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED
  | RAPIER.ActiveCollisionTypes.FIXED_FIXED
);
```

## Contact Graph (Non-Sensor Pairs)

Read contact information between non-sensor colliders:

```typescript
// Check if two specific colliders are in contact
world.contactPair(collider1, collider2, (manifold, flipped) => {
  // manifold contains contact points
  // flipped = true if collider1/collider2 are swapped in the manifold

  // Iterate solver contacts
  for (let i = 0; i < manifold.numSolverContacts(); i++) {
    const contact = manifold.solverContactPoint(i);
    const dist = manifold.solverContactDist(i);
    const friction = manifold.solverContactFriction(i);
  }

  // Contact normal (local to each collider)
  const normal = manifold.localNormalA(); // or localNormalB()
});

// All contacts involving a specific collider
world.contactsWith(collider, (otherCollider) => {
  // otherCollider is in contact with our collider
});
```

## Intersection Graph (Sensor Pairs)

Read intersection status between sensor and other colliders:

```typescript
// Check if two colliders intersect (at least one must be sensor)
const intersecting = world.intersectionPair(collider1, collider2);

// All colliders intersecting a specific collider
world.intersectionsWith(collider, (otherCollider) => {
  // otherCollider is intersecting our collider
});
```

## Collision Groups & Solver Groups

Two independent 32-bit group systems:

- **Collision groups**: affect collision detection (whether contacts are computed)
- **Solver groups**: affect force computation (whether forces are applied)

Each 32-bit value encodes:
- Bits 0-15: **membership** (what groups this collider belongs to)
- Bits 16-31: **filter** (what groups this collider interacts with)

Two colliders interact only if each one's filter includes the other's membership:

```
colliderA.membership & colliderB.filter != 0
  AND
colliderB.membership & colliderA.filter != 0
```

```typescript
// Helper to create group value
function collisionGroup(membership: number, filter: number): number {
  return (filter << 16) | membership;
}

// Example: Player in group 1, can collide with environment (2) and projectiles (4)
const PLAYER = 0x0001;
const ENVIRONMENT = 0x0002;
const PROJECTILE = 0x0004;

playerCollider.setCollisionGroups(collisionGroup(PLAYER, ENVIRONMENT | PROJECTILE));
wallCollider.setCollisionGroups(collisionGroup(ENVIRONMENT, PLAYER | PROJECTILE));
bulletCollider.setCollisionGroups(collisionGroup(PROJECTILE, PLAYER | ENVIRONMENT));
```

## Physics Hooks

Custom callbacks for advanced filtering and contact modification.

### Contact Filtering

Enable via `ActiveHooks`:

```typescript
colliderDesc.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
// or for sensor pairs:
colliderDesc.setActiveHooks(RAPIER.ActiveHooks.FILTER_INTERSECTION_PAIR);
```

Implement in the event handler passed to `world.step()`:

```typescript
const physicsHooks = {
  filterContactPair(collider1, collider2, body1, body2) {
    // Return null to ignore this pair
    // Return SolverFlags to allow it
    return RAPIER.SolverFlags.COMPUTE_IMPULSES;
  },
  filterIntersectionPair(collider1, collider2, body1, body2) {
    // Return true to test intersection, false to skip
    return true;
  },
};
```

### Contact Modification

Modify solver contacts before force computation:

```typescript
colliderDesc.setActiveHooks(RAPIER.ActiveHooks.MODIFY_SOLVER_CONTACTS);
```

Use cases:
- **Conveyor belts**: modify `tangentVelocity` of solver contacts
- **One-way platforms**: delete contacts based on normal direction
- **Variable friction**: set different friction per contact point

## Continuous Collision Detection (CCD)

Prevents fast bodies from tunneling through thin objects.

### How It Works

1. After regular stepping, CCD checks if any CCD-enabled body crossed through colliders
2. If tunneling detected, the body is moved back to the time of impact
3. Substeps resolve the remaining motion

### Enabling CCD

```typescript
// On rigid body creation
RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true);

// After creation
body.enableCcd(true);

// Tune substeps (more = more accurate but slower)
world.integrationParameters.maxCcdSubsteps = 2; // default: 1
```

### When to Use CCD

- Projectiles and bullets
- Fast-moving dynamic objects
- Any body that might tunnel at high velocities

**Don't use on**: fixed bodies, slow-moving bodies (unnecessary overhead).

## Contact Manifolds

A contact pair between two colliders may have multiple manifolds (when one shape is composite like trimesh). Each manifold has:

```typescript
world.contactPair(c1, c2, (manifold, flipped) => {
  // Geometric contacts (narrow phase)
  manifold.numContacts();           // number of contact points
  manifold.localContactPoint(i, 1); // contact point in collider1's local space
  manifold.localContactPoint(i, 2); // contact point in collider2's local space
  manifold.contactDist(i);          // signed penetration depth

  // Contact normal
  manifold.localNormalA();          // normal in collider1's local space
  manifold.localNormalB();          // normal in collider2's local space

  // Solver contacts (world-space, used for force computation)
  manifold.numSolverContacts();
  manifold.solverContactPoint(i);   // world-space contact point
  manifold.solverContactDist(i);
  manifold.solverContactFriction(i);

  // Check if any active contact exists
  // (broad-phase pair might exist without actual touching)
  const touching = manifold.numSolverContacts() > 0;
});
```

**Important**: The digit 1/2 in field names corresponds to `contactPair.collider1`/`collider2`, which may be swapped from the order you passed to `contactPair()`. Check the `flipped` parameter.
