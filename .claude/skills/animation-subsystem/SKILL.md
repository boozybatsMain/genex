# Animation Subsystem - Knowledge Reference

Domain knowledge for the character animation system. Use this when working with character animation, Three.js `AnimationMixer`/`AnimationAction`, body splits, animation packs, combat actions, remote animation sync, or F7 animation debugging.

This skill reflects the controller/FSM/action-plan refactor in `thoughts/shared/plans/2026-04-28-animation-system-refactor-state-machine.md`.

## Current Architecture

The player animation system is a single shared-mixer architecture:

1. Base layer: unarmed locomotion clips from `usePlayerAnimations`.
2. Equipment layer: `useEquipmentAnimations` orchestrates data-driven `AnimationPackDef` packs, controllers, the observable FSM, action plans, loader/transitions, locomotion, jump, and debug publishing.

Do not create a second `THREE.AnimationMixer`. Do not add a new per-equipment hook family as the default extension path.

## Main Runtime Flow

```text
PlayerModel
  usePlayerAnimations -> shared AnimationMixer
  useEquipmentAnimations
    state-machine/
    controllers/
    action-plan/
    debug/
    remote/
    useGenericAnimationLoader
    useGenericTransitions
    useGenericLocomotion
    useGenericJumpSystem
```

`AnimFrameContext` is the parity boundary for local and remote players. Remote players now feed `useEquipmentAnimations` through a context provider; there is no active `useRemoteGenericLocomotion` runtime path.

## Data-Driven Pack Flow

New animation content starts as `AnimationPackDef` data in `packages/shared/src/runtime/module-configs.ts`.

The pack registry and converter turn pack data into runtime `AnimationPack` objects:

```text
AnimationPackDef
  -> packConverter.ts
  -> registry.ts
  -> useGenericAnimationLoader.ts
  -> GenericActionRefs
  -> controllers + locomotion/transitions
```

For new equipment or creature animation work, prefer:

1. Add or update pack data.
2. Add semantic action keys or controller state only where behavior requires it.
3. Add mixer simulator/controller tests before migrating runtime behavior.
4. Expose trace labels and timeline lanes for the new state/action.
5. Verify in F7 Live/Timeline/Remote.

## Controllers

Controllers own coherent behavior domains and mutate `GenericActionRefs` intentionally:

- `attackController.ts`: attack startup, combo bridge, anticipation, recovery, pose release.
- `guardController.ts`: guard enter, idle, hit reaction, impact recovery, exit.
- `dodgeController.ts`: dodge gates, direction selection, action handoff, impulse/event broadcast.
- `deathController.ts`: death ownership and reset behavior.
- `packSwitchController.ts`: pack enter/exit, unresolved hold cleanup, outgoing pack kill plans.
- `safetyNetController.ts`: lower-body ownership correction and fallback rules.
- `useSwimSuppression.ts`: swim-state suppression as a hook boundary.
- `useMixerFinishedHandler.ts`: centralized mixer-finished cleanup.

Controllers should not create actions per frame, call `mixer.update`, or write React state.

## FSM And Action Plans

The custom dependency-free FSM lives in `animation-system/state-machine/`. It records state path, previous state, duration, last event, and watchdog traces into debug snapshots.

Action plans live in `animation-system/action-plan/`. Use them for repeated blends that are clearer declaratively, such as zeroing conflicting actions or applying a cosine ramp. Action plans compile to existing `weightLerp` operations and must not call `reset()`, create actions, call `mixer.update`, or mutate React state.

## F7 Timeline

The animation debug store keeps a bounded snapshot ring buffer and trace event buffer. `AnimationInspectorPanel` has Live, Timeline, and Remote tabs.

Timeline replay is visualization-only. It must never drive the real mixer, refs, gameplay stores, or runtime state machine.

## Three.js Invariants

- One `AnimationMixer` per animated character skeleton.
- `mixer.update(delta)` happens once per frame.
- Actions are created through `mixer.clipAction(clip)` during loading, not in controller ticks.
- Actions that own weight must be active with `play()`.
- Do not stop a departing action before replacement ownership exists.
- Use `action.time = 0` for restart-only paths; reserve `reset()` for lifecycle reset.
- Avoid `crossFadeTo(..., warp=true)` unless a timeScale restore policy is explicit.
- Keep total effective weight at least 1 for posed bones; rely on `weightLerp` and the safety net.
- Partial body behavior comes from track-filtered clips or additive clips, not native Three.js layer priority.

## File Map

| Area | Files |
| --- | --- |
| Runtime orchestrator | `apps/client1/src/components/canvas/player/animation-system/useEquipmentAnimations.ts` |
| Controllers | `apps/client1/src/components/canvas/player/animation-system/controllers/` |
| FSM | `apps/client1/src/components/canvas/player/animation-system/state-machine/` |
| Action plans | `apps/client1/src/components/canvas/player/animation-system/action-plan/` |
| Debug snapshots | `apps/client1/src/components/canvas/player/animation-system/debug/` |
| Remote helpers | `apps/client1/src/components/canvas/player/animation-system/remote/` |
| Pack data | `packages/shared/src/runtime/module-configs.ts` |
| Pack converter/registry | `packConverter.ts`, `registry.ts`, `packs/index.ts` |
| Loader/transitions | `useGenericAnimationLoader.ts`, `useGenericTransitions.ts` |
| Locomotion/jump | `useGenericLocomotion.ts`, `useGenericJumpSystem.ts` |
| F7 UI | `apps/client1/src/components/dom/debug/AnimationInspectorPanel.tsx`, `AnimationTimeline.tsx` |
| Tests | `apps/client1/test/components/animation/` |

## Progressive References

Load only the reference needed:

| Reference | Contains |
| --- | --- |
| `references/01-architecture-patterns.md` | Architecture, local/remote parity, shared mixer invariants, directory map |
| `references/02-implementation-patterns.md` | New action/state checklist, action lifecycle, unarmed fighting outline |
| `references/03-bug-prevention-rules.md` | Rules for state ownership, dead hooks, fingerprints, tests, debug UI |

Also use the Three.js animation references when working with mixer internals:

- `.agents/skills/threejs-animations/references/02-animation-action-api.md`
- `.agents/skills/threejs-animations/references/03-blending-crossfading.md`
- `.agents/skills/threejs-animations/references/05-bone-masking-layers.md`
- `.agents/skills/threejs-animations/references/06-state-machines-patterns.md`

## Extension Rule

For the next unarmed fighting task, the expected path is: pack clips, semantic action keys, controller state transitions, mixer simulator tests, trace labels, timeline lanes, and remote event mapping if gameplay-replicated.

Do not start by creating separate hook families for the new equipment type.
