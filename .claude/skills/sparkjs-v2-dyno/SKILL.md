---
name: sparkjs-v2-dyno
description: SparkJS v2.0 Dyno shader graph system—creating GPU computation graphs, splat modifiers, uniforms, Gsplat manipulation, and the dyno standard library. Use when creating custom splat effects, animations, objectModifier/worldModifier pipelines, or procedural GPU-based splat generation.
---

# SparkJS v2.0 Dyno Shader System

The `dyno` shader graph system lets you create custom GPU computation graphs using JavaScript that compile to GLSL. Powers splat generation, modification, and effects.

## Core Concepts

- **Dyno**: A function block with typed inputs and outputs (like a shader node)
- **DynoVal\<T\>**: A value of GLSL type T in the computation graph
- **DynoBlock**: A "module" containing a subgraph, created via `dyno.dynoBlock()`
- **DynoType**: GLSL types (`"int"`, `"float"`, `"vec3"`, `"vec4"`, `"mat4"`, etc.)
- **Gsplat**: Custom struct type containing all splat attributes

## Gsplat Struct

```glsl
struct Gsplat {
  vec3 center;      // Splat position
  uint flags;       // Bit flags (0x1 = active)
  vec3 scales;      // XYZ scales
  int index;        // Array index
  vec4 quaternion;  // Orientation
  vec4 rgba;        // Color + opacity
};
```

---

## Creating Modifiers

Modifiers are the primary way to add custom effects to splats. Attach to `SplatMesh.objectModifiers[]` (before world transform) or `SplatMesh.worldModifiers[]` (after world transform).

### Basic Modifier Pattern

```typescript
import { dyno } from '@sparkjsdev/spark';

const modifier = dyno.dynoBlock(
  { gsplat: dyno.Gsplat },          // Input types
  { gsplat: dyno.Gsplat },          // Output types
  ({ gsplat }) => {                  // Closure: inputs → outputs
    // Create a Dyno node with custom GLSL
    const node = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, t: 'float' },
      outTypes: { gsplat: dyno.Gsplat },
      statements: ({ inputs, outputs }) =>
        dyno.unindentLines(`
          ${outputs.gsplat} = ${inputs.gsplat};
          ${outputs.gsplat}.rgba.a *= smoothstep(0.0, 1.0, ${inputs.t});
        `),
    });

    const result = node.apply({ gsplat, t: timeUniform });
    return { gsplat: result.gsplat };
  },
);

// Attach to mesh
splatMesh.objectModifier = modifier;   // Single modifier (legacy)
splatMesh.objectModifiers = [mod1, mod2];  // Chained modifiers (v2.0)
splatMesh.updateGenerator();
```

### Reveal Animation Example

```typescript
const animateUniform = dyno.dynoFloat(0);

const reveal = dyno.dynoBlock(
  { gsplat: dyno.Gsplat },
  { gsplat: dyno.Gsplat },
  ({ gsplat }) => {
    const mod = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, t: 'float' },
      outTypes: { gsplat: dyno.Gsplat },
      globals: () => [
        dyno.unindent(`
          vec3 hash(vec3 p) {
            p = fract(p * 0.3183099 + 0.1); p *= 17.0;
            return fract(vec3(p.x*p.y*p.z, p.x+p.y*p.z, p.x*p.y+p.z));
          }
        `),
      ],
      statements: ({ inputs, outputs }) =>
        dyno.unindentLines(`
          ${outputs.gsplat} = ${inputs.gsplat};
          float t = ${inputs.t};
          float s = smoothstep(0., 30., t) * 100.;
          vec3 localPos = ${inputs.gsplat}.center;
          float l = length(localPos.xz);
          float border = abs(s - l - .5);
          vec3 finalScales = mix(
            ${inputs.gsplat}.scales,
            vec3(0.002),
            smoothstep(s - .5, s, l + .5)
          );
          ${outputs.gsplat}.center = localPos;
          ${outputs.gsplat}.scales = finalScales;
          ${outputs.gsplat}.rgba *= step(l, s);
        `),
    });
    return { gsplat: mod.apply({ gsplat, t: animateUniform }).gsplat };
  },
);

mesh.objectModifier = reveal;
mesh.updateGenerator();

// In animation loop:
animateUniform.value += delta * speed;
mesh.updateVersion();
```

---

## Uniform Variables

Uniforms are values that can change every frame without recompilation.

### Creating Uniforms

```typescript
// Scalar types
const t = dyno.dynoFloat(0.0);
const count = dyno.dynoInt(10);
const flag = dyno.dynoBool(true);
const id = dyno.dynoUint(0);

// Vector types
const pos = dyno.dynoVec3([0, 0, 0]);
const color = dyno.dynoVec4([1, 0, 0, 1]);
const offset = dyno.dynoVec2([0.5, 0.5]);

// Matrix types
const mat = dyno.dynoMat4(new THREE.Matrix4());

// Texture samplers
const tex = dyno.dynoSampler2D(myTexture);
const utex = dyno.dynoUsampler2DArray(myDataTexture);
```

### Updating Uniforms

```typescript
// Direct assignment
t.value = clock.elapsedTime;
pos.value = [camera.position.x, camera.position.y, camera.position.z];

// Or construct with update function
const autoTime = dyno.dynoFloat(0, {
  update: () => performance.now() / 1000,
});
```

---

## DynoBlock — Composable Subgraphs

```typescript
// Create a reusable subgraph
const myEffect = dyno.dynoBlock(
  { index: 'int' },          // Inputs
  { gsplat: dyno.Gsplat },   // Outputs
  ({ index }) => {
    // Read a splat from packed data
    let gsplat = dyno.readPackedSplat(myPackedSplats.dyno, index);
    // Modify opacity
    const opacity = dyno.dynoConst('float', 0.5);
    gsplat = dyno.combineGsplat({ gsplat, opacity });
    return { gsplat };
  },
);
```

---

## Dyno Standard Library

### Splat Data Functions

| Function | Description |
|----------|-------------|
| `dyno.readPackedSplat(packed, index)` | Read splat from PackedSplats by index → `DynoVal<Gsplat>` |
| `dyno.readExtSplat(ext, index)` | Read splat from ExtSplats by index → `DynoVal<Gsplat>` |
| `dyno.splitGsplat(gsplat)` | Split Gsplat into `.center`, `.scales`, `.quaternion`, `.rgba`, `.index`, `.flags` |
| `dyno.combineGsplat({ gsplat?, center?, scales?, ... })` | Create/modify Gsplat from components |
| `dyno.gsplatNormal(gsplat)` | Get normal (smallest scale axis) |
| `dyno.transformGsplat(gsplat, { scale?, rotate?, translate?, recolor? })` | Transform a Gsplat |
| `dyno.numPackedSplats(packed)` | Get splat count |

### Math Functions

| Function | Description |
|----------|-------------|
| `dyno.add(a, b)` | Addition |
| `dyno.sub(a, b)` | Subtraction |
| `dyno.mul(a, b)` | Multiplication (supports mat × vec) |
| `dyno.div(a, b)` | Division |
| `dyno.neg(a)` | Negation |
| `dyno.abs(a)` | Absolute value |
| `dyno.sign(a)` | Sign |
| `dyno.floor(a)` / `ceil` / `round` / `trunc` | Rounding |
| `dyno.fract(a)` | Fractional part |
| `dyno.mod(a, b)` | Float modulus |
| `dyno.pow(a, b)` / `exp` / `log` / `sqrt` | Power/exponential |
| `dyno.min(a, b)` / `max` | Min/max |
| `dyno.clamp(a, min, max)` | Clamp |
| `dyno.mix(a, b, t)` | Linear interpolation |
| `dyno.step(edge, x)` | Step function |
| `dyno.smoothstep(e0, e1, x)` | Smooth Hermite interpolation |

### Trigonometry

| Function | Description |
|----------|-------------|
| `dyno.sin` / `cos` / `tan` | Trig functions |
| `dyno.asin` / `acos` / `atan` / `atan2` | Inverse trig |
| `dyno.radians` / `degrees` | Angle conversion |

### Linear Algebra

| Function | Description |
|----------|-------------|
| `dyno.length(a)` | Vector length |
| `dyno.distance(a, b)` | Distance between vectors |
| `dyno.dot(a, b)` | Dot product |
| `dyno.cross(a, b)` | Cross product (vec3) |
| `dyno.normalize(a)` | Normalize vector |
| `dyno.split(v)` | Split vector → `.x`, `.y`, `.z`, `.w` |
| `dyno.combine(...)` | Combine components → vector |
| `dyno.swizzle(v, select)` | Swizzle components |
| `dyno.transpose(m)` / `inverse` / `determinant` | Matrix ops |

### Type Conversion

| Function | Description |
|----------|-------------|
| `dyno.float(v)` / `int` / `uint` / `bool` | Scalar conversion |
| `dyno.vec2` / `vec3` / `vec4` | Float vector construction |
| `dyno.ivec2` / `ivec3` / `ivec4` | Int vector construction |

### Logic

| Function | Description |
|----------|-------------|
| `dyno.and(a, b)` / `or` / `xor` / `not` | Logical/bitwise |
| `dyno.lessThan` / `greaterThan` / `equal` / `notEqual` | Comparison |
| `dyno.select(cond, t, f)` | Ternary selection |

### Hashing & Random

| Function | Description |
|----------|-------------|
| `dyno.hash(v)` | Hash to `uint` |
| `dyno.hashFloat(v)` | Hash to `float` 0..1 |
| `dyno.hashVec2` / `hashVec3` / `hashVec4` | Hash to float vectors |
| `dyno.pcgMix(v)` | Mix into PCG seed |
| `dyno.pcgNext(state)` | Advance PCG RNG |

### Transforms

| Function | Description |
|----------|-------------|
| `dyno.transformPos(pos, { scale?, scales?, rotate?, translate? })` | Transform position |
| `dyno.transformDir(dir, { scale?, scales?, rotate? })` | Transform direction |
| `dyno.transformQuat(quat, { rotate? })` | Rotate quaternion |

### Texture Lookups

| Function | Description |
|----------|-------------|
| `dyno.texture(tex, coord)` | Sample texture at continuous coord |
| `dyno.texelFetch(tex, coord, lod?)` | Fetch discrete texel |
| `dyno.textureSize(tex, lod?)` | Get texture size |

### Constants & Literals

```typescript
// Compile-time constants (change requires recompilation)
const half = dyno.dynoConst('float', 0.5);
const origin = dyno.dynoConst('vec3', new THREE.Vector3(0, 0, 0));

// GLSL literal strings
const pi = dyno.dynoLiteral('float', '3.14159');
```

---

## Helper Functions for GLSL

```typescript
// Remove common indentation from multi-line GLSL
const code = dyno.unindent(`
    float sqr(float x) {
      return x * x;
    }
`);

// Same but returns string[]
const lines = dyno.unindentLines(`
    ${outputs.gsplat} = ${inputs.gsplat};
    ${outputs.gsplat}.rgba.a *= 0.5;
`);
```

---

## Custom Dyno Node

```typescript
const myNode = new dyno.Dyno({
  inTypes: { gsplat: dyno.Gsplat, time: 'float', color: 'vec3' },
  outTypes: { gsplat: dyno.Gsplat },

  // Global GLSL definitions (deduplicated across program)
  globals: () => [
    dyno.unindent(`
      float myHelper(float x) { return x * x; }
    `),
  ],

  // Per-invocation GLSL statements
  statements: ({ inputs, outputs }) =>
    dyno.unindentLines(`
      ${outputs.gsplat} = ${inputs.gsplat};
      float t = ${inputs.time};
      ${outputs.gsplat}.rgba.rgb = ${inputs.color} * myHelper(t);
    `),

  // Optional: called before each program execution
  update: () => {
    // Update any state before shader runs
  },
});

// Use the node
const result = myNode.apply({ gsplat: inputGsplat, time: tUniform, color: cUniform });
const outputGsplat = result.gsplat;
```

---

## Explosion + Brush Effect Example

```typescript
const uniforms = {
  time: dyno.dynoFloat(0),
  startTime: dyno.dynoFloat(999999),
  strength: dyno.dynoFloat(5.0),
  gravity: dyno.dynoFloat(9.8),
  brushPos: dyno.dynoVec3([99999, 99999, 99999]),
  brushRadius: dyno.dynoFloat(0.5),
  brushColor: dyno.dynoVec3([1, 0, 0]),
};

const effect = dyno.dynoBlock(
  { gsplat: dyno.Gsplat },
  { gsplat: dyno.Gsplat },
  ({ gsplat }) => {
    const shader = new dyno.Dyno({
      inTypes: {
        gsplat: dyno.Gsplat,
        time: 'float', startTime: 'float',
        strength: 'float', gravity: 'float',
        brushPos: 'vec3', brushRadius: 'float', brushColor: 'vec3',
      },
      outTypes: { gsplat: dyno.Gsplat },
      globals: () => [
        dyno.unindent(`
          float hash(vec3 p) {
            return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453);
          }
        `),
      ],
      statements: ({ inputs, outputs }) =>
        dyno.unindentLines(`
          ${outputs.gsplat} = ${inputs.gsplat};
          float t = max(0.0, ${inputs.time} - ${inputs.startTime});
          vec3 pos = ${inputs.gsplat}.center;
          if (t > 0.0) {
            vec3 dir = vec3(hash(pos)-0.5, hash(pos+1.0)*0.5+0.2, hash(pos+2.0)-0.5);
            pos += dir * ${inputs.strength} * t;
            pos.y -= 0.5 * ${inputs.gravity} * t * t;
            ${outputs.gsplat}.center = pos;
            ${outputs.gsplat}.scales *= exp(-t * 2.0);
          }
          if (distance(pos, ${inputs.brushPos}) < ${inputs.brushRadius}) {
            ${outputs.gsplat}.rgba = vec4(${inputs.brushColor}, 1.0);
          }
        `),
    });
    gsplat = shader.apply({ gsplat, ...uniforms }).gsplat;
    return { gsplat };
  },
);

mesh.worldModifier = effect;
mesh.updateGenerator();
```

---

## Key Patterns

1. **Always call `updateGenerator()`** after changing `objectModifier(s)` or `worldModifier(s)`
2. **Always call `updateVersion()`** each frame if uniforms change and splats need re-rendering
3. **Use `dynoBlock` for composable subgraphs**, `new Dyno` for custom GLSL nodes
4. **Uniforms for per-frame values**, `dynoConst` for compile-time constants
5. **`globals()` are deduplicated** — always declare all globals your node needs
6. **Modifiers can be chained** in v2.0 via `objectModifiers: [mod1, mod2]`
