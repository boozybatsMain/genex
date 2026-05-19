# Joints and Motors Reference

Joints constrain the relative motion between two rigid bodies.

## Joint Types Overview

| Joint | Allowed DOF (3D) | Use Case |
|-------|------------------|----------|
| Fixed | None | Breakable connections, welding |
| Spherical | 3 rotations | Ragdoll shoulders, pendulums |
| Revolute | 1 rotation | Wheels, fans, hinges |
| Prismatic | 1 translation | Pistons, sliding doors |
| Generic | Configurable | Custom constraints |

## Creating Joints

All joints are created via `world.createImpulseJoint()`:

```typescript
const params = RAPIER.JointData.fixed(...);
const joint = world.createImpulseJoint(params, body1, body2, true);
// true = wake up both bodies
```

## Fixed Joint

No relative motion. Makes two bodies move as one.

```typescript
const params = RAPIER.JointData.fixed(
  { x: 0, y: 0, z: 0 },                  // local anchor on body1
  { w: 1, x: 0, y: 0, z: 0 },            // local frame rotation on body1
  { x: 0, y: -2, z: 0 },                 // local anchor on body2
  { w: 1, x: 0, y: 0, z: 0 }             // local frame rotation on body2
);
```

**Note**: Attaching multiple colliders to a single body is more efficient than fixed joints between separate bodies. Use fixed joints only when you need to read joint forces (e.g., for breakable joints).

## Spherical Joint (Ball-in-Socket)

Free rotation, no translation. Two local anchor points must coincide.

```typescript
const params = RAPIER.JointData.spherical(
  { x: 0, y: 0, z: 1 },   // anchor on body1 (local space)
  { x: 0, y: 0, z: -3 }   // anchor on body2 (local space)
);
```

Use for: ragdoll shoulders, chain links, pendulums.

## Revolute Joint (Hinge)

Rotation around exactly one axis. No translation, no off-axis rotation.

```typescript
const params = RAPIER.JointData.revolute(
  { x: 0, y: 0, z: 1 },   // anchor on body1
  { x: 0, y: 0, z: -3 },  // anchor on body2
  { x: 1, y: 0, z: 0 }    // rotation axis
);
```

Use for: doors, wheels, fans, hinges.

## Prismatic Joint (Slider)

Translation along exactly one axis. No rotation.

```typescript
const params = RAPIER.JointData.prismatic(
  { x: 0, y: 0, z: 1 },   // anchor on body1
  { x: 1, y: 0, z: 0 },   // free axis direction
  { x: 0, y: 0, z: 1 }    // tangent axis (controls fixed orientation, auto-computed if zero)
);

// Optional: limits on translation range
params.limitsEnabled = true;
params.limits = [-2.0, 5.0]; // min, max signed distance along free axis
```

Use for: elevators, pistons, sliding doors.

## Joint Motors

Spherical, revolute, and prismatic joints support motors — PD controllers that drive relative motion.

### Velocity Motor

Drive to a target relative velocity:

```typescript
const joint = world.createImpulseJoint(params, body1, body2, true);
const typed = joint as RAPIER.RevoluteImpulseJoint;

typed.configureMotorVelocity(
  1.0,   // target velocity (rad/s for revolute, m/s for prismatic)
  0.5    // damping
);
```

### Position Motor

Drive to a target relative position:

```typescript
typed.configureMotorPosition(
  Math.PI / 2,  // target position (radians for revolute, meters for prismatic)
  100.0,         // stiffness (spring strength)
  10.0           // damping
);
```

### Full Motor Control

```typescript
typed.configureMotor(
  Math.PI / 2,  // target position
  1.0,           // target velocity
  100.0,         // stiffness
  10.0           // damping
);
```

### Motor Model

```typescript
typed.configureMotorModel(RAPIER.MotorModel.AccelerationBased);
// or
typed.configureMotorModel(RAPIER.MotorModel.ForceBased);
```

- **AccelerationBased**: motor strength independent of body mass (easier to tune)
- **ForceBased**: motor applies raw force (mass-dependent)

## Joint Removal

```typescript
world.removeImpulseJoint(joint, true); // true = wake up attached bodies
```

## Multibody Joints

Alternative to impulse joints — more accurate for articulated structures (robots, ragdolls):

```typescript
const joint = world.createMultibodyJoint(params, body1, body2, true);
world.removeMultibodyJoint(joint, true);
```

Multibody joints are more numerically stable for long chains of joints but less flexible than impulse joints.

## Common Patterns

### Breakable Joint

```typescript
// Check force on joint each frame
const joint = world.createImpulseJoint(fixedParams, body1, body2, true);

// In game loop, check if joint should break
// (Rapier doesn't have built-in breaking, implement manually)
function checkBreakable(joint: RAPIER.ImpulseJoint, threshold: number) {
  // Read the force/torque applied by the joint
  // If exceeded, remove it
  // Note: reading joint forces requires accessing contact data
  world.removeImpulseJoint(joint, true);
}
```

### Ragdoll Chain

```typescript
function createChain(world: RAPIER.World, count: number) {
  const bodies: RAPIER.RigidBody[] = [];

  for (let i = 0; i < count; i++) {
    const desc = i === 0
      ? RAPIER.RigidBodyDesc.fixed().setTranslation(0, 10, 0)
      : RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 10 - i * 2, 0);

    const body = world.createRigidBody(desc);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 1, 0.2), body);
    bodies.push(body);

    if (i > 0) {
      const params = RAPIER.JointData.spherical(
        { x: 0, y: -1, z: 0 },  // bottom of previous body
        { x: 0, y: 1, z: 0 }    // top of current body
      );
      world.createImpulseJoint(params, bodies[i - 1], body, true);
    }
  }
}
```
