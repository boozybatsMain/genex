---
name: rapier-physics
description: Rapier 3D physics engine reference for JavaScript/TypeScript (WASM). Covers world setup, rigid bodies (dynamic/kinematic/fixed), colliders (shapes, sensors, mass, friction, collision groups), scene queries (raycasting, shape-casting, intersection tests), joints (fixed, revolute, spherical, prismatic, motors), collision events, and simulation tuning. Use when implementing physics features, debugging collision issues, adding rigid bodies, creating sensors/triggers, performing raycasts, or tuning physics parameters. Complements rapier-character-controller skill.
---

# Rapier 3D Physics Engine (JavaScript/TypeScript)

Reference for `@dimforge/rapier3d-compat` v0.19+ (WASM build). All examples are 3D TypeScript.

## Initialization

```typescript
import RAPIER from '@dimforge/rapier3d-compat';

// WASM must be initialized before any API use
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
```

**Important**: `RAPIER.init()` is async (loads WASM). Call once at app startup.

## Rigid Bodies

Four types via `RigidBodyType`:

| Type | Use Case | Affected by Forces? |
|------|----------|-------------------|
| `dynamic()` | Physics-simulated objects | Yes |
| `fixed()` | Static environment (ground, walls) | No (infinite mass) |
| `kinematicPositionBased()` | Player characters, moving platforms | No (user-controlled position) |
| `kinematicVelocityBased()` | Moving platforms (velocity-controlled) | No (user-controlled velocity) |

### Creation

```typescript
const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
  .setTranslation(0, 5, 1)
  .setRotation({ w: 1, x: 0, y: 0, z: 0 })  // quaternion
  .setLinvel(0, 0, 0)
  .setAngvel({ x: 0, y: 0, z: 0 })
  .setGravityScale(1.0)
  .setLinearDamping(0.2)
  .setAngularDamping(1.5)
  .setCanSleep(true)
  .setCcdEnabled(false);

const body = world.createRigidBody(bodyDesc);
```

### Position & Velocity

```typescript
// Read
const pos = body.translation();    // { x, y, z }
const rot = body.rotation();       // { w, x, y, z }
const linvel = body.linvel();      // { x, y, z }

// Dynamic bodies: use forces/impulses (not setTranslation)
body.setLinvel({ x: 1, y: 0, z: 0 }, true);  // true = wakeUp
body.setAngvel({ x: 0, y: 3, z: 0 }, true);

// Kinematic position-based: use setNextKinematic*
body.setNextKinematicTranslation({ x: 1, y: 2, z: 3 });
body.setNextKinematicRotation({ w: 1, x: 0, y: 0, z: 0 });

// Teleport (non-physical, use sparingly)
body.setTranslation({ x: 0, y: 5, z: 1 }, true);
body.setRotation({ w: 1, x: 0, y: 0, z: 0 }, true);
```

### Forces & Impulses

```typescript
// Forces (persistent across steps, call resetForces to clear)
body.addForce({ x: 0, y: 1000, z: 0 }, true);
body.addTorque({ x: 100, y: 0, z: 0 }, true);
body.addForceAtPoint({ x: 0, y: 1000, z: 0 }, { x: 1, y: 2, z: 3 }, true);
body.resetForces(true);
body.resetTorques(true);

// Impulses (instantaneous velocity change)
body.applyImpulse({ x: 0, y: 1000, z: 0 }, true);
body.applyTorqueImpulse({ x: 100, y: 0, z: 0 }, true);
body.applyImpulseAtPoint({ x: 0, y: 1000, z: 0 }, { x: 1, y: 2, z: 3 }, true);
```

### Locking DOF & Other Properties

```typescript
body.lockTranslations(true, true);   // lock, wakeUp
body.lockRotations(true, true);
body.setEnabledRotations(true, false, false, true); // x, y, z, wakeUp

body.setGravityScale(2.0, true);     // 0 = no gravity, negative = reverse
body.setDominanceGroup(10);          // higher dominance = immovable in contacts
body.enableCcd(true);                // prevent tunneling for fast bodies

// Body type change at runtime
body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
body.wakeUp();
```

### Sleeping

Bodies that stop moving are auto-slept. Slept bodies skip simulation.

```typescript
body.isSleeping();   // check
body.wakeUp();       // manual wake
body.sleep();        // manual sleep
```

**Tip**: Always pass `true` for the `wakeUp` parameter on setters unless you specifically want sleeping behavior.

### Removal

```typescript
world.removeRigidBody(body); // also removes attached colliders
```

## Colliders

Colliders define shape, generate contacts/intersections. Attach to rigid bodies for physics.

### Shape Types

| Shape | Constructor | Parameters |
|-------|------------|------------|
| Ball | `ColliderDesc.ball(radius)` | `0.5` |
| Cuboid | `ColliderDesc.cuboid(hx, hy, hz)` | half-extents |
| Capsule | `ColliderDesc.capsule(halfHeight, radius)` | Y-axis aligned |
| Cylinder | `ColliderDesc.cylinder(halfHeight, radius)` | |
| Cone | `ColliderDesc.cone(halfHeight, radius)` | |
| ConvexHull | `ColliderDesc.convexHull(points)` | `Float32Array` |
| Trimesh | `ColliderDesc.trimesh(vertices, indices)` | `Float32Array`, `Uint32Array` |
| Heightfield | `ColliderDesc.heightfield(nrows, ncols, heights, scale)` | |

For detailed shape docs, see [references/collider-shapes.md](references/collider-shapes.md).

### Creation & Properties

```typescript
const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3)
  .setTranslation(0, 1, 0)                    // offset from parent body
  .setRotation({ w: 1, x: 0, y: 0, z: 0 })
  .setDensity(1.0)                             // auto-computes mass from shape
  .setMass(5.0)                                // explicit mass (overrides density)
  .setFriction(0.5)                            // 0-1+, default 0.5
  .setRestitution(0.3)                         // bounciness, 0-1
  .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
  .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
  .setSensor(false);                           // true = trigger only, no contacts

// Attach to rigid body
const collider = world.createCollider(colliderDesc, body);

// Or create without body (static collider)
const staticCollider = world.createCollider(colliderDesc);
```

### Sensors (Triggers)

Sensors generate intersection events but no contact forces.

```typescript
const sensorDesc = RAPIER.ColliderDesc.cuboid(2, 2, 2)
  .setSensor(true)
  .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

const sensor = world.createCollider(sensorDesc, body);
```

### Collision Groups & Solver Groups

16-bit membership + 16-bit filter packed into a 32-bit integer.

```typescript
// Bits 0-15: membership (what groups this collider belongs to)
// Bits 16-31: filter (what groups this collider can interact with)
const membership = 0x0001;  // group 1
const filter = 0x0002;      // can interact with group 2
const groups = (filter << 16) | membership;

colliderDesc.setCollisionGroups(groups);  // affects collision detection
colliderDesc.setSolverGroups(groups);     // affects force computation only
```

### Active Events & Hooks

```typescript
// Enable collision events for this collider
colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
// Enable contact force events
colliderDesc.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
// Both
colliderDesc.setActiveEvents(
  RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS
);

// Active collision types (what pairs generate events)
colliderDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
```

### Runtime Updates

```typescript
collider.setFriction(0.8);
collider.setRestitution(0.5);
collider.setMass(10);
collider.setSensor(true);
collider.setCollisionGroups(newGroups);
```

### Removal

```typescript
world.removeCollider(collider, true); // true = wakeUp parent body
```

## World Stepping

```typescript
// Fixed timestep (recommended for determinism)
const FIXED_DT = 1 / 60;

function physicsLoop() {
  world.timestep = FIXED_DT;
  world.step();
}

// Access integration parameters
world.integrationParameters.numSolverIterations = 4; // default: 4
```

## Scene Queries

All queries are methods on `World`. See [references/scene-queries.md](references/scene-queries.md) for full details.

### Raycasting

```typescript
const ray = new RAPIER.Ray({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 });
const maxToi = 100;
const solid = true;

// Closest hit only
const hit = world.castRay(ray, maxToi, solid);
if (hit) {
  const hitPoint = ray.pointAt(hit.timeOfImpact);
  const hitCollider = hit.collider;
}

// Closest hit with normal
const hitNormal = world.castRayAndGetNormal(ray, maxToi, solid);
if (hitNormal) {
  console.log(hitNormal.normal); // { x, y, z }
}

// All hits (callback)
world.intersectionsWithRay(ray, maxToi, solid, (hit) => {
  const point = ray.pointAt(hit.timeOfImpact);
  return true; // continue searching (false = stop)
});
```

### Query Filters

```typescript
// All query methods accept optional filter parameters:
world.castRay(
  ray, maxToi, solid,
  filterFlags,             // QueryFilterFlags
  filterGroups,            // collision groups bitmask
  excludeCollider,         // specific collider to ignore
  excludeRigidBody,        // specific body to ignore
  predicate                // (collider) => boolean
);

// Common flags
RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC
RAPIER.QueryFilterFlags.EXCLUDE_FIXED
RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC
```

### Shape-Casting (Sweep Tests)

```typescript
const shape = new RAPIER.Cuboid(0.5, 0.5, 0.5);
const shapePos = { x: 0, y: 5, z: 0 };
const shapeRot = { w: 1, x: 0, y: 0, z: 0 };
const shapeVel = { x: 0, y: -1, z: 0 };
const maxToi = 100;

const hit = world.castShape(shapePos, shapeRot, shapeVel, shape, 0, maxToi, true);
if (hit) {
  console.log(hit.collider, hit.time_of_impact, hit.witness1, hit.normal1);
}
```

### Intersection Tests

```typescript
// All colliders intersecting a shape
const shape = new RAPIER.Ball(2.0);
world.intersectionsWithShape({ x: 0, y: 0, z: 0 }, { w: 1, x: 0, y: 0, z: 0 }, shape, (collider) => {
  console.log('Intersecting:', collider.handle);
  return true; // continue
});

// Point containment
world.intersectionsWithPoint({ x: 1, y: 2, z: 3 }, (collider) => {
  console.log('Contains point:', collider.handle);
  return true;
});

// Closest point on any collider to a point
const proj = world.projectPoint({ x: 1, y: 2, z: 3 }, true);
if (proj) {
  console.log(proj.point, proj.isInside, proj.collider);
}

// AABB broad-phase query (fast, approximate)
world.collidersWithAabbIntersectingAabb(
  { x: -1, y: -1, z: -1 }, // center
  { x: 1, y: 1, z: 1 },    // half-extents
  (collider) => { return true; }
);
```

## Joints

Connect two rigid bodies with constrained relative motion. See [references/joints-and-motors.md](references/joints-and-motors.md).

### Quick Reference

```typescript
// Fixed: no relative motion
const fixed = RAPIER.JointData.fixed(
  { x: 0, y: 0, z: 0 }, { w: 1, x: 0, y: 0, z: 0 },  // anchor1, frame1
  { x: 0, y: -2, z: 0 }, { w: 1, x: 0, y: 0, z: 0 }   // anchor2, frame2
);

// Spherical: free rotation, no translation (ball-in-socket)
const spherical = RAPIER.JointData.spherical(
  { x: 0, y: 0, z: 1 },   // local anchor on body1
  { x: 0, y: 0, z: -3 }   // local anchor on body2
);

// Revolute: rotation around one axis
const revolute = RAPIER.JointData.revolute(
  { x: 0, y: 0, z: 1 },   // anchor1
  { x: 0, y: 0, z: -3 },  // anchor2
  { x: 1, y: 0, z: 0 }    // axis
);

// Prismatic: translation along one axis
const prismatic = RAPIER.JointData.prismatic(
  { x: 0, y: 0, z: 1 },   // anchor1
  { x: 1, y: 0, z: 0 },   // axis
  { x: 0, y: 0, z: 1 }    // tangent axis (optional, auto-computed if zero)
);
prismatic.limitsEnabled = true;
prismatic.limits = [-2.0, 5.0];

// Create joint
const joint = world.createImpulseJoint(fixed, body1, body2, true);

// Remove joint
world.removeImpulseJoint(joint, true);
```

### Motors (Revolute & Prismatic)

```typescript
const joint = world.createImpulseJoint(revolute, body1, body2, true);
const typedJoint = joint as RAPIER.RevoluteImpulseJoint;

typedJoint.configureMotorVelocity(1.0, 0.5);            // targetVel, damping
typedJoint.configureMotorPosition(Math.PI, 100, 10);     // targetPos, stiffness, damping
typedJoint.configureMotor(Math.PI, 1.0, 100, 10);        // targetPos, targetVel, stiffness, damping
```

## Collision Events

Events require `ActiveEvents` flags on at least one collider in the pair.

```typescript
// Setup: enable events on collider
colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
colliderDesc.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);

// Read events after world.step()
const eventQueue = new RAPIER.EventQueue(true);
world.step(eventQueue);

// Collision events (start/stop contact or sensor overlap)
eventQueue.drainCollisionEvents((handle1, handle2, started) => {
  const collider1 = world.getCollider(handle1);
  const collider2 = world.getCollider(handle2);
  if (started) {
    console.log('Collision started');
  } else {
    console.log('Collision stopped');
  }
});

// Contact force events (when force exceeds threshold)
eventQueue.drainContactForceEvents((event) => {
  console.log('Force between', event.collider1(), event.collider2());
  console.log('Total force magnitude:', event.totalForceMagnitude());
});
```

## Common Patterns

### Entity Handle Lookup

Map Rapier handles back to game entities:

```typescript
const handleToEntity = new Map<number, string>();

// On creation
const collider = world.createCollider(desc, body);
handleToEntity.set(collider.handle, entityId);

// On query/event
const entityId = handleToEntity.get(hit.collider.handle);
```

### Collision Filtering with Predicate

```typescript
controller.computeColliderMovement(
  collider,
  movement,
  RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
  null,
  (c) => {
    // Custom filter: ignore specific colliders
    return !ignoredHandles.has(c.handle);
  }
);
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Body doesn't move | Zero mass / no collider | Attach collider with density > 0 |
| Body doesn't fall | Fixed/kinematic type, or gravityScale = 0 | Use dynamic, check gravityScale |
| Fast body goes through walls | Tunneling | Enable CCD: `setCcdEnabled(true)` |
| Contacts not detected | Missing collision groups or events | Check `setActiveEvents`, `setCollisionGroups` |
| Force has no effect | Body sleeping or zero mass | Pass `true` for wakeUp, check mass |
| Sensors don't fire events | Missing ActiveEvents flag | Add `COLLISION_EVENTS` to sensor |
| Trimesh body falls through | Trimesh on dynamic body | Use convexHull for dynamic, trimesh for fixed |

## Additional Resources

- [Collider shapes reference](references/collider-shapes.md)
- [Scene queries reference](references/scene-queries.md)
- [Joints and motors reference](references/joints-and-motors.md)
- [Advanced collision detection](references/advanced-collision.md)
- [Character controller skill](../rapier-character-controller/SKILL.md) — for kinematic character movement
- [Official Rapier JS docs](https://rapier.rs/docs/user_guides/javascript/getting_started)
- `packages/physics/src/PhysicsManager.ts` — This project's physics integration
- `packages/physics/src/utils.ts` — Body, collider, and controller factory helpers
