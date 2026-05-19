---
name: sparkjs-v2-editing
description: SparkJS v2.0 splat editing, procedural generation, particle effects, and camera controls—SplatEdit with SDF shapes, constructSplats, pushSplat, text/image splats, grids, spheres, snow/rain particles, SparkControls, FpsMovement, and PointerControls. Use when editing splats, generating procedural content, creating particle effects, or implementing camera navigation.
---

# SparkJS v2.0 Editing, Procedural & Controls

## Splat Editing with SDF Operations

Apply real-time RGBA and displacement edits to splats using Signed Distance Field shapes. Edits evaluate per-splat based on spatial position.

### Creating a SplatEdit

```typescript
import {
  SplatEdit,
  SplatEditSdf,
  SplatEditRgbaBlendMode,
  SplatEditSdfType,
} from '@sparkjsdev/spark';

// Basic edit: multiply RGBA in a sphere region
const edit = new SplatEdit({
  rgbaBlendMode: SplatEditRgbaBlendMode.MULTIPLY,
  softEdge: 0.5,    // Soft transition at boundary (world units)
  sdfSmooth: 0.2,   // Smooth blending between shapes
});

const sphere = new SplatEditSdf({
  type: SplatEditSdfType.SPHERE,
  radius: 2.0,
  opacity: 0.0,    // Multiply by 0 = erase splats in sphere
  color: new THREE.Color(1, 1, 1),
});
sphere.position.set(0, 1, 0);
edit.add(sphere);

scene.add(edit);  // Global edit (applies to all editable SplatMeshes)
```

### Edit Scoping

```typescript
// Global: add to scene (affects all SplatMeshes with editable: true)
scene.add(edit);

// Per-mesh: add as child of SplatMesh
splatMesh.add(edit);

// Or attach via edits array
splatMesh.edits = [edit1, edit2];
```

### RGBA Blend Modes

| Mode | Description |
|------|-------------|
| `MULTIPLY` | RGBA *= SDF value. Use opacity=0 to erase. (default) |
| `SET_RGB` | Override RGB, ignore alpha. Good for recoloring regions. |
| `ADD_RGBA` | Add SDF RGBA to splat. "Light up" areas. |

### SDF Shape Types

| Type | Description | Key Parameters |
|------|-------------|----------------|
| `ALL` | Affects all splats everywhere | None |
| `PLANE` | Infinite plane | position, rotation |
| `SPHERE` | Sphere | position, radius |
| `BOX` | Box (optionally rounded) | position, rotation, scale, radius (corner rounding) |
| `ELLIPSOID` | Ellipsoid | position, rotation, scale |
| `CYLINDER` | Cylinder | position, rotation, scale.y (height) |
| `CAPSULE` | Capsule | position, rotation, scale.y (height) |
| `INFINITE_CONE` | Infinite cone | position, rotation, radius (angle factor) |

### SplatEditSdf Properties

```typescript
const shape = new SplatEditSdf({
  type: SplatEditSdfType.BOX,
  invert: false,       // Swap inside/outside
  opacity: 1.0,        // Alpha value for blend mode
  color: new THREE.Color(1, 0, 0),  // RGB value
  displace: new THREE.Vector3(0, 0.5, 0),  // XYZ displacement
  radius: 0.1,         // Shape-specific (sphere radius, box rounding, etc.)
});

// Transform via standard THREE.js properties
shape.position.set(1, 2, 3);
shape.rotation.set(0, Math.PI / 4, 0);
shape.scale.set(2, 1, 1);
```

### SplatEdit Properties

```typescript
const edit = new SplatEdit({
  name: 'Eraser',
  rgbaBlendMode: SplatEditRgbaBlendMode.MULTIPLY,
  sdfSmooth: 0.3,   // Smooth blending between multiple SDF shapes
  softEdge: 0.5,    // Soft inside/outside boundary
  invert: false,     // Invert all SDFs
  sdfs: [shape1, shape2],  // Explicit shapes (or add as children)
});
```

### Interactive Eraser Example

```typescript
const eraser = new SplatEdit({
  rgbaBlendMode: SplatEditRgbaBlendMode.MULTIPLY,
  softEdge: 0.3,
});
const brush = new SplatEditSdf({
  type: SplatEditSdfType.SPHERE,
  radius: 0.5,
  opacity: 0.0,
});
eraser.add(brush);
scene.add(eraser);

// Move with pointer
canvas.addEventListener('pointermove', (e) => {
  const intersects = raycaster.intersectObjects(scene.children);
  if (intersects.length) {
    brush.position.copy(intersects[0].point);
  }
});
```

### Animated Lighting Example

```typescript
const light = new SplatEdit({
  rgbaBlendMode: SplatEditRgbaBlendMode.ADD_RGBA,
  softEdge: 2.0,
});
const glow = new SplatEditSdf({
  type: SplatEditSdfType.SPHERE,
  radius: 3.0,
  opacity: 0.0,    // Don't make splats more opaque
  color: new THREE.Color(1.0, 0.8, 0.5),
});
light.add(glow);
scene.add(light);

// Animate in render loop
renderer.setAnimationLoop((time) => {
  glow.position.set(Math.sin(time * 0.001) * 5, 2, 0);
  glow.color.setHSL((time * 0.0001) % 1, 1, 0.5);
  renderer.render(scene, camera);
});
```

---

## Procedural Splat Generation

### Manual Construction

```typescript
import { PackedSplats, SplatMesh } from '@sparkjsdev/spark';

const mesh = new SplatMesh({
  constructSplats: (splats) => {
    const center = new THREE.Vector3();
    const scales = new THREE.Vector3(0.01, 0.01, 0.01);
    const quaternion = new THREE.Quaternion();
    const color = new THREE.Color();

    for (let i = 0; i < 10000; i++) {
      center.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      );
      color.setHSL(Math.random(), 1, 0.5);
      splats.pushSplat(center, scales, quaternion, 1.0, color);
    }
  },
});
scene.add(mesh);
```

### Grid

```typescript
import { constructGrid, SplatMesh } from '@sparkjsdev/spark';

const grid = new SplatMesh({
  constructSplats: (splats) => constructGrid({
    splats,
    extents: new THREE.Box3(
      new THREE.Vector3(-10, -10, -10),
      new THREE.Vector3(10, 10, 10),
    ),
    stepSize: 1,              // Grid spacing (default: 1)
    pointRadius: 0.01,        // Splat radius (default: 0.01)
    pointShadowScale: 2.0,    // Shadow splat relative size (default: 2.0)
    opacity: 1.0,
    // color: new THREE.Color(0.5, 0.5, 0.5),  // Or function:
    // color: (color, position) => { color.setHSL(...); },
  }),
});
scene.add(grid);
```

### XYZ Axes

```typescript
import { constructAxes, SplatMesh } from '@sparkjsdev/spark';

const axes = new SplatMesh({
  constructSplats: (splats) => constructAxes({
    splats,
    scale: 0.25,              // Axis length (default: 0.25)
    axisRadius: 0.0075,       // Axis thickness (default: 0.0075)
  }),
});
scene.add(axes);
```

### Sphere

```typescript
import { constructSpherePoints, SplatMesh } from '@sparkjsdev/spark';

const sphere = new SplatMesh({
  constructSplats: (splats) => constructSpherePoints({
    splats,
    radius: 1.0,
    maxDepth: 4,              // Warning: count grows exponentially!
    pointRadius: 0.02,
    pointThickness: 0.001,
    color: new THREE.Color(1, 1, 1),
    // filter: (point) => point.y > 0,  // Optional hemisphere filter
  }),
});
scene.add(sphere);
```

### Text Splats

```typescript
import { textSplats } from '@sparkjsdev/spark';

const text = textSplats({
  text: 'Hello World!',
  fontSize: 48,
  font: 'Arial',
  color: new THREE.Color(1, 0.5, 0),
  dotRadius: 0.8,
  textAlign: 'center',
  lineHeight: 1.2,
});
scene.add(text);
```

### Image Splats

```typescript
import { imageSplats } from '@sparkjsdev/spark';

const image = imageSplats({
  url: './photo.png',
  dotRadius: 0.8,
  subXY: 2,          // 2x downsampling
  forEachSplat: (width, height, index, center, scales, quaternion, opacity, color) => {
    // Return opacity to keep, null to skip
    return opacity >= 0.1 ? opacity : null;
  },
});
scene.add(image);
```

---

## Particle Effects

Stateless dyno-based particle effects using splat index for deterministic randomness.

### Static Box

```typescript
import { generators } from '@sparkjsdev/spark';

const particles = generators.staticBox({
  box: new THREE.Box3(
    new THREE.Vector3(-5, -5, -5),
    new THREE.Vector3(5, 5, 5),
  ),
  // Additional options for customization
});
scene.add(particles);
```

### Snow / Rain

```typescript
import { generators, DEFAULT_SNOW, DEFAULT_RAIN } from '@sparkjsdev/spark';

// Snow
const snowControls = generators.snowBox({
  ...DEFAULT_SNOW,
  box: new THREE.Box3(
    new THREE.Vector3(-10, 0, -10),
    new THREE.Vector3(10, 10, 10),
  ),
  density: 500,
});
scene.add(snowControls.snow);

// Rain
const rainControls = generators.snowBox({
  ...DEFAULT_RAIN,
  box: new THREE.Box3(
    new THREE.Vector3(-10, 0, -10),
    new THREE.Vector3(10, 10, 10),
  ),
});
scene.add(rainControls.snow);
```

### snowBox Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `box` | -1..1 cube | Bounding box for particles |
| `minY` | -Infinity | Ground plane clamp |
| `density` | 100 | Particles per unit volume |
| `numSplats` | from density | Override count |
| `anisoScale` | (1,1,1) | Elongate particles (rain: stretch Y) |
| `minScale` / `maxScale` | 0.001 / 0.005 | Particle size range |
| `fallDirection` | (0,-1,0) | Gravity direction |
| `fallVelocity` | 0.02 | Fall speed |
| `wanderScale` | 0.01 | Wandering amplitude |
| `wanderVariance` | 2 | Randomness in wander |
| `color1` / `color2` | white / light blue | Interpolation endpoints |
| `opacity` | 1.0 | Base opacity |
| `onFrame` | undefined | Per-frame callback |

---

## Controls

### SparkControls (Combined)

```typescript
import { SparkControls } from '@sparkjsdev/spark';

const controls = new SparkControls({ canvas: renderer.domElement });

renderer.setAnimationLoop((time) => {
  renderer.render(scene, camera);
  controls.update(camera);  // Updates both FPS + pointer controls
});
```

### FpsMovement (Keyboard + Gamepad)

```typescript
import { FpsMovement } from '@sparkjsdev/spark';

const fps = new FpsMovement({
  moveSpeed: 1.0,
  rollSpeed: 2.0,
  rotateSpeed: 2.0,
  capsMultiplier: 10.0,    // Caps Lock speed boost
  shiftMultiplier: 5.0,    // Shift speed boost
  ctrlMultiplier: 0.2,     // Ctrl slow-down
  stickThreshold: 0.1,     // Gamepad deadzone
  // xr: renderer.xr,      // WebXR controller support
});

// In animation loop:
fps.update(deltaTime, camera);
```

Default key mappings: WASD + Arrow keys for movement, QE for rotation. Gamepad: twin-stick.

### PointerControls (Mouse + Touch)

```typescript
import { PointerControls } from '@sparkjsdev/spark';

const pointer = new PointerControls({
  canvas: renderer.domElement,
  rotateSpeed: 0.002,
  slideSpeed: 0.006,       // Right-click / two-finger drag
  scrollSpeed: 0.0015,     // Mouse wheel
  reverseRotate: false,
  reverseSlide: false,
  reverseScroll: false,
  moveInertia: 0.15,
  rotateInertia: 0.15,
  doublePress: ({ position, intervalMs }) => {
    console.log('Double tap at', position);
  },
});

// In animation loop:
pointer.update(deltaTime, camera);
```

### Controls GUI (with lil-gui)

```typescript
import GUI from 'lil-gui';

const gui = new GUI({ title: 'Controls' }).close();
const options = { reverseFps: false, reversePan: false };

gui.add(options, 'reverseFps').name('Reverse FPS').onChange((v: boolean) => {
  pointer.reverseRotate = v;
  pointer.reverseScroll = v;
});
gui.add(options, 'reversePan').name('Reverse Pan').onChange((v: boolean) => {
  pointer.reverseSlide = v;
  pointer.reverseSwipe = v;
});
```
