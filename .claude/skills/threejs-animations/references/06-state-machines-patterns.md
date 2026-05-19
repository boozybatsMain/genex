# Animation State Machines & Game Patterns

State machine architectures, R3F/drei integration, performance optimization, disposal, and common pitfalls.

## Animation State Machine

### Simple FSM (No Library)

```typescript
type AnimState = 'idle' | 'walk' | 'run' | 'jump' | 'fall';

class AnimationFSM {
  private mixer: THREE.AnimationMixer;
  private actions: Map<AnimState, THREE.AnimationAction>;
  private current: AnimState = 'idle';
  private currentAction: THREE.AnimationAction | null = null;

  constructor(mixer: THREE.AnimationMixer, clips: Map<AnimState, THREE.AnimationClip>) {
    this.mixer = mixer;
    this.actions = new Map();

    // Pre-create all actions
    clips.forEach((clip, state) => {
      const action = mixer.clipAction(clip);
      action.play();
      action.setEffectiveWeight(state === 'idle' ? 1 : 0);
      this.actions.set(state, action);
    });

    this.currentAction = this.actions.get('idle') ?? null;
  }

  transition(newState: AnimState, fadeDuration = 0.3) {
    if (newState === this.current) return;
    const toAction = this.actions.get(newState);
    if (!toAction) return;

    if (this.currentAction) {
      // Keep departing action enabled during crossfade (prevents T-pose)
      this.currentAction.enabled = true;
      this.currentAction.setEffectiveWeight(1);
      if (!this.currentAction.isRunning()) {
        this.currentAction.play();
      }
    }

    toAction.enabled = true;
    toAction.setEffectiveWeight(1);
    toAction.time = 0;

    if (this.currentAction) {
      toAction.crossFadeFrom(this.currentAction, fadeDuration, false);
    }
    toAction.play();

    this.current = newState;
    this.currentAction = toAction;
  }
}
```

### Priority-Based Pipeline

For game characters with multiple concurrent animation concerns (locomotion, jump, weapon, transitions):

```typescript
// Priority order: transitions > jump > locomotion
function updateAnimations(ctx: FrameContext) {
  // Highest priority: transitions (equip, unequip, crouch)
  const transitionHandled = tickTransitions(ctx);
  if (transitionHandled) return;

  // Medium priority: jump states (airborne)
  const jumpMode = tickJump(ctx);

  // Lowest priority: locomotion (idle, walk, run, directional)
  tickLocomotion(ctx, jumpMode);
}
```

Each tick function returns whether it "consumed" the frame, allowing higher-priority layers to override lower ones.

### Ref-Based State (No React Re-renders)

For R3F game characters, avoid `useState` for animation state:

```typescript
// BAD: causes React re-renders every state change
const [animState, setAnimState] = useState<AnimState>('idle');

// GOOD: ref-based, read in useFrame
const animStateRef = useRef<AnimState>('idle');
const [displayState, setDisplayState] = useState<AnimState>('idle'); // optional, for UI only

function updateState(newState: AnimState) {
  if (newState === animStateRef.current) return;
  animStateRef.current = newState;
  // Only update React state if needed for UI
  setDisplayState(newState);
}
```

## R3F / drei Integration

### useAnimations Hook (drei)

```typescript
import { useAnimations } from '@react-three/drei';

function Character({ url }) {
  const { scene, animations } = useGLTF(url);
  const { actions, mixer, names, clips } = useAnimations(animations, scene);

  useEffect(() => {
    actions?.idle?.play();
    return () => {
      // Cleanup happens automatically when clips change
    };
  }, [actions]);

  return <primitive object={scene} />;
}
```

**What useAnimations does internally:**
1. Creates `AnimationMixer` on the provided root
2. Lazy-creates `AnimationAction` instances via `Object.defineProperty` getters
3. Calls `mixer.update(delta)` every frame via internal `useFrame`
4. Cleans up actions when clips change

**Key behavior**: Since `mixer.update()` is called internally, you do **NOT** need to call it yourself unless you're bypassing the hook.

### Sharing Mixer Across Systems

When you need one mixer for both player and weapon animations:

```typescript
function PlayerModel() {
  const { actions, mixer } = usePlayerAnimations(groupRef);

  // Pass shared mixer to weapon system
  useWeaponAnimations(groupRef, mixer, actions, enabled, characterId);

  // Update mixer once per frame (if NOT using drei's useAnimations auto-update)
  useFrame((_, delta) => {
    if (mixer) mixer.update(delta);
  });
}
```

**Important**: If you pass the mixer to external systems, be aware that drei's `useAnimations` already calls `mixer.update()`. Calling it twice will double the animation speed. Either:
- Let drei handle updates (don't call `mixer.update()` yourself)
- Or extract just the mixer without using `useAnimations`

### Loading FBX Animations in R3F

drei's `useAnimations` expects clips from the same source. When loading separate FBX files:

```typescript
function usePlayerAnimations(groupRef) {
  const [clips, setClips] = useState<THREE.AnimationClip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const loadedClips = await Promise.all(
        ANIMATIONS.map(async (config) => {
          const fbx = await loadFBXCached(config.path);
          const clip = fbx.animations[0];
          clip.name = config.name;

          // Process: remove root motion, filter tracks, trim
          const processed = removeRootMotion(clip);
          return processed;
        })
      );
      setClips(loadedClips.filter(Boolean));
      setIsLoading(false);
    }
    load();
  }, []);

  const { actions, mixer } = useAnimations(clips, groupRef);
  return { actions, mixer, isLoading };
}
```

## Performance Optimization

### 1. FBX/GLTF Caching

```typescript
const fbxCache = new Map<string, Promise<THREE.Group>>();

function loadFBXCached(url: string): Promise<THREE.Group> {
  const cached = fbxCache.get(url);
  if (cached) return cached;
  const promise = fbxLoader.loadAsync(url);
  fbxCache.set(url, promise);
  promise.catch(() => fbxCache.delete(url));
  return promise;
}
```

### 2. Module-Level Preloading

```typescript
// At module level (runs once on import, before render)
preloadFBX([
  '/animations/Idle.fbx',
  '/animations/Walk.fbx',
  '/animations/Run.fbx',
  '/animations/Jump.fbx',
]);
```

### 3. Pre-binding Animation Tracks

First time an action plays, Three.js resolves all `PropertyBinding` paths by searching the scene graph. This causes a frame hitch. Pre-bind during initialization:

```typescript
function prebindAnimations(mixer: THREE.AnimationMixer, clips: THREE.AnimationClip[]) {
  for (const clip of clips) {
    // clipAction() creates the action and resolves bindings
    const action = mixer.clipAction(clip);
    // Optional: play briefly at weight 0 to fully activate internal binding
    action.setEffectiveWeight(0);
    action.play();
    action.stop();
  }
}
```

### 4. WebGL Warmup

Render the model once off-screen to compile shaders:

```typescript
function warmupWebGL(
  gl: THREE.WebGLRenderer,
  model: THREE.Object3D,
  camera: THREE.Camera
) {
  const tempScene = new THREE.Scene();
  tempScene.add(model.clone());
  gl.render(tempScene, camera);
}
```

### 5. Efficient Weight Updates

Avoid setting weights when the change is negligible:

```typescript
const EPSILON = 0.001;

function updateWeight(action: THREE.AnimationAction, newWeight: number, currentWeight: number) {
  if (Math.abs(newWeight - currentWeight) > EPSILON) {
    action.setEffectiveWeight(newWeight);
    return newWeight;
  }
  return currentWeight;
}
```

### 6. Avoid Allocations in Frame Loop

```typescript
// BAD: creates objects every frame
useFrame(() => {
  const weights = getDirectionBlendWeights(angle); // allocates object
  Object.entries(weights).forEach(([dir, w]) => { /* ... */ });
});

// GOOD: reuse pre-allocated structures
const weightsRef = useRef({ dir1: 'F', dir2: 'FR', w1: 1, w2: 0 });
useFrame(() => {
  getDirectionBlendWeights(angle, weightsRef.current); // write to existing object
});
```

## Disposal & Cleanup

### Proper Disposal Order

```typescript
// 1. Stop all actions first
mixer.stopAllAction();

// 2. Uncache in order: actions → clips → root
for (const action of Object.values(actions)) {
  if (action) {
    mixer.uncacheAction(action.getClip());
  }
}
for (const clip of clips) {
  mixer.uncacheClip(clip);
}
mixer.uncacheRoot(root);
```

### R3F Cleanup Pattern

```typescript
useEffect(() => {
  return () => {
    if (action) {
      action.fadeOut(0.1); // Don't stop abruptly
    }
  };
}, [action]);
```

### drei useAnimations Cleanup

drei handles cleanup automatically when clips change:
```typescript
// Internal to drei:
useEffect(() => {
  return () => {
    mixer.stopAllAction();
    Object.values(actions).forEach((action) => {
      mixer.uncacheAction(action, root);
    });
  };
}, [clips]);
```

## AnimationObjectGroup

For sharing animations across multiple identical objects:

```typescript
const group = new THREE.AnimationObjectGroup(mesh1, mesh2, mesh3);
const mixer = new THREE.AnimationMixer(group);
const action = mixer.clipAction(clip);
action.play(); // All three meshes animate identically

// Dynamic membership
group.add(mesh4);
group.remove(mesh2);
```

**Limitation**: For SkinnedMesh, each clone needs its own Skeleton. Use `SkeletonUtils.clone()`:

```typescript
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
const clone = SkeletonUtils.clone(originalModel);
// Properly duplicates skeleton + bone hierarchy
// Geometries and materials are shared by reference
```

## Timer vs Clock

### Clock (Legacy)

```typescript
const clock = new THREE.Clock();
function animate() {
  const delta = clock.getDelta();
  mixer.update(delta);
}
```

**Problem**: `getDelta()` returns different values if called multiple times per frame. After tab switch, returns very large delta causing animations to jump.

### Timer (Modern, r150+)

```typescript
import { Timer } from 'three/addons/misc/Timer.js';
const timer = new Timer();
timer.connect(document); // Handles Page Visibility API

function animate(timestamp) {
  timer.update(timestamp);
  const delta = timer.getDelta();
  mixer.update(delta);
}
renderer.setAnimationLoop(animate);
```

**Advantages**:
- `getDelta()` returns same value if called multiple times per frame
- `connect(document)` prevents large deltas when tab is hidden/restored
- `setTimescale()` for global time scaling

### In R3F

`useFrame` provides frame-rate independent delta automatically:
```typescript
useFrame((state, delta) => {
  mixer.update(delta);
});
```

## Complete Game Character Pattern

Putting it all together for a game character with locomotion, weapon, and aim:

```typescript
function GameCharacter() {
  const { scene, animations } = useGLTF('/models/Character.glb');
  const groupRef = useRef<THREE.Group>(null);

  // Layer 1: Base animations via drei
  const { actions, mixer } = useAnimations(animations, scene);

  // Layer 2: Weapon animations on shared mixer
  const weaponSystem = useWeaponAnimations(groupRef, mixer, actions);

  // State machine (ref-based, no re-renders)
  const stateRef = useRef<AnimState>('idle');

  useFrame((_, delta) => {
    // Read input
    const input = getInput();

    // Determine state
    const newState = computeState(input);

    // Transition if changed
    if (newState !== stateRef.current) {
      const fadeDuration = FADE_DURATIONS[newState] ?? 0.3;
      safeCrossFade(actions[stateRef.current], actions[newState], fadeDuration);
      stateRef.current = newState;
    }

    // Update weapon layer weights
    weaponSystem.updateWeights(delta);

    // mixer.update() called by drei's useAnimations automatically
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}
```

## Common Pitfalls Checklist

| Pitfall | Symptom | Fix |
|---|---|---|
| T-pose flash during crossfade | Brief default pose visible | Keep departing action `enabled=true`, avoid `reset()` |
| Wrong animation speed after crossfade | Animation plays too fast/slow | Call `setEffectiveTimeScale(1)` when reactivating warped actions |
| Rest pose bleeding through | Character partially in T-pose | Ensure total action weights sum to >= 1.0 |
| Animation not playing | Action seems to do nothing | Call `play()` — fadeIn/setWeight alone don't activate |
| Frame hitch on first play | Stutter when animation first activates | Pre-bind all actions during initialization |
| Double-speed animations | Everything too fast in R3F | drei's useAnimations already calls mixer.update — don't call it twice |
| Console warnings about missing bones | "Could not find node with name X" | Filter animation tracks to only include bones that exist on model |
| Memory leak on unmount | Growing memory over time | Stop actions and call uncache* methods in cleanup |
| Jerky transitions after tab switch | Large jump in animation | Use Timer instead of Clock, or drei's built-in delta |
| FBX root motion conflict | Character slides/rotates unexpectedly | Strip hip position/rotation tracks before playing |
