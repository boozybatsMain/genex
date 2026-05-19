---
name: rapier-character-controller
description: Rapier physics character controller for kinematic bodies—move-and-slide, slope handling, autostep, snap-to-ground, collision filtering, and platform interaction. Use when implementing player movement, NPC locomotion, or any kinematic body that needs to navigate obstacles, climb slopes, or interact with dynamic objects in a Rapier physics world.
---

# Rapier Character Controller

Kinematic Character Controllers provide high-level movement for game characters that need to defy physics (floating platforms, playable characters, NPCs). Unlike dynamic bodies, kinematic bodies are immune to forces—you control trajectory directly, but must handle collision detection manually.

Rapier's built-in character controller handles ray/shape-casting and trajectory adjustment automatically via the **move-and-slide** pattern.

## Core Concept

```
User Input → Desired Movement → Character Controller → Adjusted Movement → Apply to Body
                                      ↓
                            (ray/shape-casting)
                            (slope detection)
                            (step climbing)
                            (ground snapping)
```

## Quick Start (JavaScript/TypeScript)

```typescript
import RAPIER from '@dimforge/rapier3d-compat';

// Initialize Rapier
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

// Create kinematic body for character
const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
  .setTranslation(0, 1, 0);
const body = world.createRigidBody(bodyDesc);

// Create capsule collider (recommended shape)
const colliderDesc = RAPIER.ColliderDesc.capsule(0.5, 0.3); // halfHeight, radius
const collider = world.createCollider(colliderDesc, body);

// Create character controller with offset
const controller = world.createCharacterController(0.01); // offset for numerical stability

// Configure controller
controller.setSlideEnabled(true);
controller.setMaxSlopeClimbAngle(Math.PI / 4);     // 45 degrees
controller.setMinSlopeSlideAngle(Math.PI / 6);     // 30 degrees
controller.enableAutostep(0.5, 0.2, true);         // maxHeight, minWidth, includeDynamic
controller.enableSnapToGround(0.5);                 // maxDistance
controller.setApplyImpulsesToDynamicBodies(true);
controller.setCharacterMass(1.0);

// Game loop
function update(dt: number) {
  // 1. Calculate desired movement (your input handling)
  const desiredMovement = { x: inputX * speed * dt, y: gravity * dt, z: inputZ * speed * dt };

  // 2. Compute collision-adjusted movement
  controller.computeColliderMovement(
    collider,
    desiredMovement,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    null,
    (c) => !c.isSensor()
  );

  // 3. Get corrected movement
  const correctedMovement = controller.computedMovement();

  // 4. Apply to body
  const currentPos = body.translation();
  body.setNextKinematicTranslation({
    x: currentPos.x + correctedMovement.x,
    y: currentPos.y + correctedMovement.y,
    z: currentPos.z + correctedMovement.z,
  });

  // 5. Check ground state
  const grounded = controller.computedGrounded();

  // 6. Process collisions
  for (let i = 0; i < controller.numComputedCollisions(); i++) {
    const collision = controller.computedCollision(i);
    // Handle collision events (sounds, damage, etc.)
  }

  world.step();
}
```

## Character Offset

The controller maintains a small gap between character and environment for numerical stability. Too small = getting stuck; too large = visible gap.

```typescript
// Absolute offset (fixed distance)
const controller = world.createCharacterController(0.01);

// Good values: 0.001 to 0.02 depending on scale
```

**Warning**: Don't change offset after creation—it can cause instability.

## Up Vector

Defines what "vertical" means. Default is positive Y axis.

```typescript
// Standard (Y-up)
controller.setUp({ x: 0, y: 1, z: 0 });

// Custom (e.g., for spherical worlds or wall-walking)
controller.setUp({ x: 0, y: 0, z: 1 }); // Z-up
```

The horizontal plane is orthogonal to this vector. Slope angles are measured relative to it.

## Slopes

Control climbing and sliding behavior on inclined surfaces.

```typescript
// Maximum climbable slope (radians)
controller.setMaxSlopeClimbAngle(45 * Math.PI / 180); // 45 degrees

// Minimum angle for automatic sliding
controller.setMinSlopeSlideAngle(30 * Math.PI / 180); // 30 degrees
```

| Parameter | Effect |
|-----------|--------|
| `maxSlopeClimbAngle` | Steeper slopes block movement |
| `minSlopeSlideAngle` | Shallower slopes don't cause sliding |

Typical values:
- Platformer: 45° max climb, 30° min slide
- Realistic: 50° max climb, 20° min slide
- Arcade: 60° max climb, 45° min slide

## Autostep (Stairs & Obstacles)

Automatically teleports character over small obstacles and stairs.

```typescript
controller.enableAutostep(
  0.5,    // maxHeight: Maximum step height
  0.2,    // minWidth: Minimum platform width at top
  true    // includeDynamicBodies: Step over dynamic objects?
);

// Disable autostepping
controller.disableAutostep();
```

**Conditions for autostep activation**:
1. Character must be touching ground before obstacle
2. Obstacle height ≤ maxHeight
3. Platform width at top ≥ minWidth

```
     ┌─────────────┐
     │   minWidth  │  ← Must have enough space on top
     │             │
     ├─────────────┤
     │             │
     │  maxHeight  │  ← Step must be shorter than this
     │             │
─────┴─────────────┴─────
       Character→ ○
```

## Snap-to-Ground

Keeps character grounded when walking downhill or down stairs.

```typescript
// Snap if ground is within 0.5 units below
controller.enableSnapToGround(0.5);

// Disable snapping
controller.disableSnapToGround();
```

**Activation conditions** (all must be true):
1. Character touching ground at movement start
2. Movement has downward component
3. Final position would be within snap distance of ground

## Filtering

Control which obstacles the character interacts with.

```typescript
controller.computeColliderMovement(
  collider,
  desiredMovement,
  // Filter flags
  RAPIER.QueryFilterFlags.EXCLUDE_SENSORS |
  RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC,
  // Collision groups (optional)
  null,
  // Custom predicate (optional)
  (collider) => {
    // Return false to ignore this collider
    return !collider.isSensor();
  }
);
```

### Filter Flags

| Flag | Effect |
|------|--------|
| `EXCLUDE_SENSORS` | Ignore sensor colliders |
| `EXCLUDE_DYNAMIC` | Ignore dynamic rigid bodies |
| `EXCLUDE_FIXED` | Ignore fixed rigid bodies |
| `EXCLUDE_KINEMATIC` | Ignore kinematic rigid bodies |

### Collision Groups

```typescript
// Using collision groups for filtering
const PLAYER_GROUP = 0x0001;
const ENEMY_GROUP = 0x0002;
const PLATFORM_GROUP = 0x0004;

// Only collide with platforms
const filterGroups = PLATFORM_GROUP;
controller.computeColliderMovement(collider, movement, flags, filterGroups);
```

## Collision Events

Access collision information after computing movement.

```typescript
controller.computeColliderMovement(collider, movement);

// Was movement blocked?
const grounded = controller.computedGrounded();

// Get all collisions (in chronological order)
const numCollisions = controller.numComputedCollisions();
for (let i = 0; i < numCollisions; i++) {
  const collision = controller.computedCollision(i);

  // collision properties:
  // - collider: The collider that was hit
  // - toi: Time of impact (0-1)
  // - normal1/normal2: Contact normals
  // - point1/point2: Contact points
}
```

## Pushing Dynamic Bodies

By default, kinematic characters don't push dynamic objects. Enable impulse application:

```typescript
controller.setApplyImpulsesToDynamicBodies(true);
controller.setCharacterMass(70.0); // Mass affects push strength
```

Without this, dynamic bodies won't react to character collisions due to the offset gap preventing actual contacts.

## Gravity Handling

You're responsible for applying gravity—add it to the movement vector:

```typescript
let verticalVelocity = 0;

function update(dt: number) {
  const grounded = controller.computedGrounded();

  if (grounded) {
    verticalVelocity = 0; // Reset when grounded
  } else {
    verticalVelocity -= 9.81 * dt; // Apply gravity
  }

  const movement = {
    x: inputX * speed * dt,
    y: verticalVelocity * dt,
    z: inputZ * speed * dt,
  };

  controller.computeColliderMovement(collider, movement);
  // ... apply movement
}
```

## Recommended Shapes

| Shape | Use Case | Performance |
|-------|----------|-------------|
| Capsule | Characters (best for stairs/slopes) | Fast |
| Ball | Rolling characters, simple NPCs | Fastest |
| Cuboid | Box-shaped characters, vehicles | Fast |

```typescript
// Capsule (recommended for humanoids)
RAPIER.ColliderDesc.capsule(halfHeight, radius);

// Ball
RAPIER.ColliderDesc.ball(radius);

// Cuboid
RAPIER.ColliderDesc.cuboid(halfExtentX, halfExtentY, halfExtentZ);
```

**Avoid**: Complex shapes (trimesh, convexHull) for character controllers—they're slower and can cause numerical issues.

## Complete Example

```typescript
import RAPIER from '@dimforge/rapier3d-compat';

class CharacterController {
  private world: RAPIER.World;
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;
  private verticalVelocity = 0;

  constructor(world: RAPIER.World, position: { x: number; y: number; z: number }) {
    this.world = world;

    // Kinematic position-based body
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z);
    this.body = world.createRigidBody(bodyDesc);

    // Capsule collider: total height = 2 * halfHeight + 2 * radius
    const halfHeight = 0.4;
    const radius = 0.3;
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, radius);
    this.collider = world.createCollider(colliderDesc, this.body);

    // Character controller
    this.controller = world.createCharacterController(0.01);
    this.controller.setSlideEnabled(true);
    this.controller.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    this.controller.setMinSlopeSlideAngle(20 * Math.PI / 180);
    this.controller.enableAutostep(0.5, 0.2, true);
    this.controller.enableSnapToGround(0.3);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(70);
  }

  update(dt: number, input: { x: number; z: number; jump: boolean }) {
    const speed = 5;
    const gravity = 20;
    const jumpStrength = 8;

    // Check grounded state from previous frame
    const grounded = this.controller.computedGrounded();

    // Handle jumping
    if (grounded) {
      this.verticalVelocity = input.jump ? jumpStrength : 0;
    } else {
      this.verticalVelocity -= gravity * dt;
    }

    // Build movement vector
    const movement = {
      x: input.x * speed * dt,
      y: this.verticalVelocity * dt,
      z: input.z * speed * dt,
    };

    // Compute adjusted movement
    this.controller.computeColliderMovement(
      this.collider,
      movement,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      null,
      (c) => !c.isSensor()
    );

    // Apply movement
    const corrected = this.controller.computedMovement();
    const pos = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: pos.x + corrected.x,
      y: pos.y + corrected.y,
      z: pos.z + corrected.z,
    });

    // Clamp vertical velocity if we hit something
    if (corrected.y < movement.y * 0.5 && this.verticalVelocity < 0) {
      this.verticalVelocity = 0; // Hit ground
    }
    if (corrected.y > movement.y * 0.5 && this.verticalVelocity > 0) {
      this.verticalVelocity = 0; // Hit ceiling
    }
  }

  getPosition() {
    return this.body.translation();
  }

  isGrounded() {
    return this.controller.computedGrounded();
  }
}
```

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Character gets stuck | Offset too small | Increase offset (0.01-0.02) |
| Visible gap from walls | Offset too large | Decrease offset |
| Falls through floor | Missing ground collider or wrong filter | Check collision groups, disable EXCLUDE_FIXED |
| Can't climb stairs | Step too high or autostep disabled | Increase maxHeight or enable autostep |
| Slides on flat ground | minSlopeSlideAngle too low | Increase to 15-30 degrees |
| Jitters on slopes | Ground snapping fighting gravity | Tune snap distance or disable during jumps |
| Can't push objects | Impulses disabled | Enable setApplyImpulsesToDynamicBodies(true) |
| Rotates unexpectedly | Using dynamic body | Use kinematicPositionBased instead |

## Limitations

1. **No rotational movement**: Character controllers only support translation. Handle rotation separately via body.setRotation().

2. **Bevy-specific features**: The KinematicCharacterController component and CharacterLength enum are Bevy plugin features. In JavaScript/TypeScript, use world.createCharacterController() directly.

3. **Custom is often better**: The built-in controller is a starting point. For game-specific feel (especially player characters), consider copying and customizing the implementation.

## API Reference

### Creation
```typescript
world.createCharacterController(offset: number): KinematicCharacterController
```

### Configuration
```typescript
controller.setUp(up: Vector)
controller.setSlideEnabled(enabled: boolean)
controller.setMaxSlopeClimbAngle(radians: number)
controller.setMinSlopeSlideAngle(radians: number)
controller.enableAutostep(maxHeight: number, minWidth: number, includeDynamic: boolean)
controller.disableAutostep()
controller.enableSnapToGround(distance: number)
controller.disableSnapToGround()
controller.setApplyImpulsesToDynamicBodies(apply: boolean)
controller.setCharacterMass(mass: number)
```

### Movement
```typescript
controller.computeColliderMovement(
  collider: Collider,
  desiredMovement: Vector,
  filterFlags?: QueryFilterFlags,
  filterGroups?: number,
  predicate?: (collider: Collider) => boolean
)
controller.computedMovement(): Vector
controller.computedGrounded(): boolean
controller.numComputedCollisions(): number
controller.computedCollision(index: number): CharacterCollision
```

## File Structure

```
rapier-character-controller/
├── SKILL.md
├── _meta.json
└── references/
    ├── movement-patterns.md      # Jump, dash, wall-slide implementations
    ├── platform-handling.md      # Moving platforms, elevators
    └── advanced-filtering.md     # Complex collision group setups
```

## Reference

- [Rapier Character Controller Docs](https://rapier.rs/docs/user_guides/javascript/character_controller)
- `packages/physics/src/utils.ts` — This project's character controller setup
- `packages/physics/src/PhysicsManager.ts` — Full physics integration example
