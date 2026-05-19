# Collider Shapes Reference

Detailed reference for all Rapier 3D collider shapes in JavaScript/TypeScript.

## Primitive Shapes

### Ball (Sphere)

```typescript
RAPIER.ColliderDesc.ball(radius: number)

// Example: sphere with radius 0.5
const desc = RAPIER.ColliderDesc.ball(0.5);
```

Fastest shape for collision detection. Use for projectiles, simple NPCs.

### Cuboid (Box)

```typescript
RAPIER.ColliderDesc.cuboid(halfExtentX: number, halfExtentY: number, halfExtentZ: number)

// Example: 2x1x2 box (full dimensions, not half)
const desc = RAPIER.ColliderDesc.cuboid(1.0, 0.5, 1.0);
```

Parameters are **half-extents**, so a cuboid(1, 0.5, 1) creates a 2x1x2 box.

### Capsule

```typescript
RAPIER.ColliderDesc.capsule(halfHeight: number, radius: number)

// Example: capsule with total height = 2*0.4 + 2*0.3 = 1.4
const desc = RAPIER.ColliderDesc.capsule(0.4, 0.3);
```

Principal axis is **Y**. Total height = `2 * halfHeight + 2 * radius`. Best shape for humanoid characters (smooth slope/stair interaction).

```
      ╭───╮
      │   │  ← radius (hemisphere)
      │   │
      │   │  ← halfHeight (cylinder portion)
      │   │
      ╰───╯  ← radius (hemisphere)
```

### Cylinder

```typescript
RAPIER.ColliderDesc.cylinder(halfHeight: number, radius: number)

const desc = RAPIER.ColliderDesc.cylinder(1.0, 0.5);
```

Y-axis aligned. Flat top and bottom (unlike capsule).

### Cone

```typescript
RAPIER.ColliderDesc.cone(halfHeight: number, radius: number)

const desc = RAPIER.ColliderDesc.cone(1.0, 0.5);
```

Tip at +Y, base at -Y.

## Complex Shapes

### Convex Hull

```typescript
RAPIER.ColliderDesc.convexHull(points: Float32Array): ColliderDesc | null

// Compute the convex hull of arbitrary points
const points = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
]);
const desc = RAPIER.ColliderDesc.convexHull(points);
```

Automatically computes the smallest convex shape containing all points. Returns `null` if the points are degenerate. Suitable for **dynamic** bodies with complex shapes.

### Convex Mesh (Pre-computed)

```typescript
RAPIER.ColliderDesc.convexMesh(vertices: Float32Array, indices: Uint32Array): ColliderDesc | null
```

Like convexHull but assumes the mesh is **already convex**. Faster creation since no hull computation needed. Incorrect results if input isn't convex.

### Triangle Mesh (Trimesh)

```typescript
RAPIER.ColliderDesc.trimesh(vertices: Float32Array, indices: Uint32Array): ColliderDesc

const vertices = new Float32Array([...]);
const indices = new Uint32Array([...]);
const desc = RAPIER.ColliderDesc.trimesh(vertices, indices);
```

Can represent **any** shape (non-convex, with holes, open surfaces). No thickness — has no interior.

**Warning**: Only use on **fixed** rigid bodies. Dynamic trimesh bodies can have objects get stuck inside them. For dynamic non-convex objects, use convex decomposition with compound shapes.

Optional flags for ghost collision fixing:
```typescript
RAPIER.ColliderDesc.trimesh(vertices, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
```

### Heightfield

```typescript
RAPIER.ColliderDesc.heightfield(
  nrows: number,        // subdivisions along X
  ncols: number,        // subdivisions along Z
  heights: Float32Array, // altitude values (nrows * ncols)
  scale: Vector3         // dimensions of the X-Z rectangle
)

const heights = new Float32Array(10 * 10); // 10x10 grid
const desc = RAPIER.ColliderDesc.heightfield(10, 10, heights, { x: 100, y: 1, z: 100 });
```

Memory-efficient terrain representation. Subdivides an X-Z plane rectangle with Y heights.

## Round Shapes

Add a small border radius for smoother collision response. **Round cylinders/cones/convex shapes** are **faster** than non-round counterparts; **round cuboids** are **slower**.

```typescript
RAPIER.ColliderDesc.roundCuboid(halfExtentX, halfExtentY, halfExtentZ, borderRadius)
RAPIER.ColliderDesc.roundCylinder(halfHeight, radius, borderRadius)
RAPIER.ColliderDesc.roundCone(halfHeight, radius, borderRadius)
```

## Shape Selection Guide

| Use Case | Recommended Shape | Why |
|----------|------------------|-----|
| Characters | Capsule | Smooth slope/stair traversal |
| Projectiles | Ball | Fastest, rotation-invariant |
| Boxes/Crates | Cuboid | Exact fit, fast |
| Terrain | Trimesh or Heightfield | Arbitrary geometry |
| Dynamic complex objects | ConvexHull | Safe for dynamics |
| Static environment | Trimesh | Exact shape representation |
| Rolling objects | Ball or RoundCylinder | Natural rolling behavior |

## Compound Shapes

Attach multiple colliders to one rigid body for compound shapes:

```typescript
const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());

// Main body
world.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.5, 0.5), body);

// Left wing
world.createCollider(
  RAPIER.ColliderDesc.cuboid(0.5, 0.1, 0.3)
    .setTranslation(-1.5, 0, 0),
  body
);

// Right wing
world.createCollider(
  RAPIER.ColliderDesc.cuboid(0.5, 0.1, 0.3)
    .setTranslation(1.5, 0, 0),
  body
);
```

This is much more efficient than using fixed joints between separate bodies.

## Mass Properties from Shapes

When a collider has density > 0, mass properties are auto-computed from shape:

```typescript
// Density-based (default density = 1.0)
RAPIER.ColliderDesc.ball(0.5).setDensity(2.0);

// Explicit mass (overrides density-based calculation)
RAPIER.ColliderDesc.ball(0.5).setMass(5.0);

// Full manual control
RAPIER.ColliderDesc.ball(0.5).setMassProperties(
  5.0,                                    // mass
  { x: 0, y: 0, z: 0 },                 // center of mass
  { x: 0.3, y: 0.2, z: 0.1 },           // principal angular inertia
  { w: 1, x: 0, y: 0, z: 0 }            // angular inertia frame
);
```

## Combine Rules

Control how friction/restitution are combined when two colliders interact:

```typescript
RAPIER.CoefficientCombineRule.Average  // (a + b) / 2
RAPIER.CoefficientCombineRule.Min      // min(a, b)
RAPIER.CoefficientCombineRule.Multiply // a * b
RAPIER.CoefficientCombineRule.Max      // max(a, b)

colliderDesc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max);
colliderDesc.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average);
```

Priority order: Max > Multiply > Average > Min. The highest-priority rule from either collider wins.
