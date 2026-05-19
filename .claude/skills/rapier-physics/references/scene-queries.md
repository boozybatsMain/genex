# Scene Queries Reference

Geometric queries against all colliders in the physics world.

## Raycasting

A ray is a point + direction. `maxToi` limits the ray length: `[origin, origin + dir * maxToi]`.

### Closest Hit

```typescript
const ray = new RAPIER.Ray(
  { x: 0, y: 10, z: 0 },  // origin
  { x: 0, y: -1, z: 0 }   // direction (doesn't need to be normalized)
);
const maxToi = 100;
const solid = true; // true = hit at origin if inside shape (toi=0)

const hit = world.castRay(ray, maxToi, solid);
if (hit) {
  const hitPoint = ray.pointAt(hit.timeOfImpact);
  const collider = hit.collider;
  console.log('Hit at distance:', hit.timeOfImpact);
}
```

### Closest Hit with Normal

```typescript
const hit = world.castRayAndGetNormal(ray, maxToi, solid);
if (hit) {
  const hitPoint = ray.pointAt(hit.timeOfImpact);
  const normal = hit.normal; // { x, y, z } - surface normal at hit
}
```

### All Hits (Callback)

```typescript
world.intersectionsWithRay(ray, maxToi, solid, (hit) => {
  const point = ray.pointAt(hit.timeOfImpact);
  const normal = hit.normal;
  return true; // return false to stop iteration
});
```

### The `solid` Parameter

Controls behavior when ray origin is **inside** a shape:

- `solid = true`: hit point = origin (toi = 0), treats shape interior as filled
- `solid = false`: hit point = first boundary crossing, treats shape as hollow

## Shape-Casting (Sweep Tests)

Move an entire shape along a direction and find the first obstacle hit.

```typescript
const shape = new RAPIER.Ball(0.5);
const shapePos = { x: 0, y: 10, z: 0 };
const shapeRot = { w: 1, x: 0, y: 0, z: 0 };
const shapeVel = { x: 0, y: -1, z: 0 };  // direction of travel
const targetDistance = 0.0;
const maxToi = 100;
const stopAtPenetration = true;

const hit = world.castShape(
  shapePos, shapeRot, shapeVel, shape, targetDistance, maxToi,
  stopAtPenetration
  // optional: filterFlags, filterGroups, excludeCollider, excludeRigidBody
);

if (hit) {
  console.log('Collider:', hit.collider);
  console.log('Time of impact:', hit.time_of_impact);
  console.log('Contact point (collider local):', hit.witness1);
  console.log('Contact point (shape local):', hit.witness2);
  console.log('Contact normal (collider local):', hit.normal1);
  console.log('Contact normal (shape local):', hit.normal2);
}
```

Available shapes for casting: `Ball`, `Cuboid`, `Capsule`, `Cylinder`, `Cone`, `ConvexPolyhedron`.

## Point Queries

### Project Point (Closest Surface Point)

```typescript
const point = { x: 1, y: 2, z: 3 };
const solid = true;

const proj = world.projectPoint(point, solid);
if (proj) {
  console.log('Closest collider:', proj.collider);
  console.log('Projected point:', proj.point);
  console.log('Inside shape?', proj.isInside);
}
```

### All Colliders Containing Point

```typescript
world.intersectionsWithPoint({ x: 1, y: 2, z: 3 }, (collider) => {
  console.log('Contains point:', collider.handle);
  return true; // continue
});
```

## Intersection Tests

### Shape Intersection

Find all colliders intersecting a given shape at a position:

```typescript
const shape = new RAPIER.Ball(5.0); // detection sphere
const pos = { x: 0, y: 0, z: 0 };
const rot = { w: 1, x: 0, y: 0, z: 0 };

world.intersectionsWithShape(pos, rot, shape, (collider) => {
  console.log('Intersecting:', collider.handle);
  return true; // continue (false = stop)
});
```

### AABB Intersection (Broad-Phase, Fast)

Approximate test using axis-aligned bounding boxes only:

```typescript
world.collidersWithAabbIntersectingAabb(
  { x: 0, y: 0, z: 0 },   // AABB center
  { x: 5, y: 5, z: 5 },   // AABB half-extents
  (collider) => {
    console.log('AABB overlaps:', collider.handle);
    return true;
  }
);
```

This doesn't check actual shapes — only bounding boxes. Much faster for broad queries.

## Query Filters

All scene queries accept optional filter parameters (after the required args):

```typescript
world.castRay(
  ray,
  maxToi,
  solid,
  filterFlags?,           // RAPIER.QueryFilterFlags
  filterGroups?,          // collision group bitmask
  excludeCollider?,       // single collider to skip
  excludeRigidBody?,      // single body (all its colliders) to skip
  predicate?              // (collider: Collider) => boolean
);
```

### Filter Flags

| Flag | Effect |
|------|--------|
| `EXCLUDE_SENSORS` | Skip sensor colliders |
| `EXCLUDE_DYNAMIC` | Skip colliders on dynamic bodies |
| `EXCLUDE_FIXED` | Skip colliders on fixed bodies |
| `EXCLUDE_KINEMATIC` | Skip colliders on kinematic bodies |

Combine with bitwise OR:

```typescript
const flags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
            | RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC;
```

### Custom Predicate

Most flexible — apply arbitrary logic:

```typescript
const ignoredIds = new Set([colliderA.handle, colliderB.handle]);

world.castRay(ray, maxToi, solid,
  RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
  null,  // no group filter
  null,  // no single collider exclude
  null,  // no single body exclude
  (collider) => !ignoredIds.has(collider.handle)
);
```

## Performance Tips

| Query | Cost | Use When |
|-------|------|----------|
| `castRay` | Cheapest | Need only distance + collider |
| `castRayAndGetNormal` | Low | Need surface normal too |
| `intersectionsWithRay` | Medium | Need all hits (not just first) |
| `castShape` | Medium-High | Need swept collision (character movement) |
| `intersectionsWithShape` | Medium | Need overlap detection |
| `collidersWithAabbIntersectingAabb` | Low | Broad pre-filter before expensive checks |
| `projectPoint` | Low | Find nearest surface |
| `intersectionsWithPoint` | Low | Check if point is inside any collider |

**Tips**:
- Use filter flags to skip unnecessary colliders early
- Use AABB queries as a broad phase before expensive shape queries
- For character controllers, prefer the built-in `computeColliderMovement` over manual shape-casts
