# Animation Architecture Patterns

This reference reflects `thoughts/shared/plans/2026-04-28-animation-system-refactor-state-machine.md`.

## Runtime Shape

```text
PlayerModel
  usePlayerAnimations
    shared THREE.AnimationMixer
  useEquipmentAnimations
    state-machine/
      createAnimationStateMachine
      animationMachineDefinition
      useAnimationStateMachine
    controllers/
      attackController
      guardController
      dodgeController
      deathController
      packSwitchController
      safetyNetController
      useMixerFinishedHandler
      useSwimSuppression
    action-plan/
      executeActionPlan
      types
    debug/
      snapshotBuilder
    remote/
      remoteMovementFlags
      remoteDirectionalSafety
    useGenericAnimationLoader
    useGenericTransitions
    useGenericLocomotion
    useGenericJumpSystem
```

`useEquipmentAnimations` is the runtime orchestrator. Controllers own action domains; hooks own React/event boundaries; the FSM records observable state; action plans express repeated weight operations.

## Shared Mixer

Every animated character skeleton uses one `THREE.AnimationMixer` created by `usePlayerAnimations`. Equipment/base/remote/debug code must use that mixer and must not call `mixer.update` outside the single frame update path.

Actions are created during loading with `mixer.clipAction(clip)` and stored in `GenericActionRefs`. Controllers may mutate action lifecycle and weights, but they must not create actions in frame ticks.

## Pack Data

Animation content starts as `AnimationPackDef` in `packages/shared/src/runtime/module-configs.ts`. The converter derives runtime maps and semantic keys:

```text
AnimationPackDef
  idles / directionalSets / jumpVariants / fireClips / guardClips / dodgeClips
  equipClip / unequipClip / reloadClip / deathClip / turnClips
  feature flags and blend settings
    -> packConverter.ts
    -> AnimationPack
```

`packs/index.ts` fingerprints all reload-relevant clip categories, including guard, dodge, unequip, body split, loop, start offset, clip name, and structural params. Speed is intentionally excluded because speed can be live-patched.

## Local And Remote Parity

Local and remote animation share `useEquipmentAnimations`. The parity boundary is `AnimFrameContext`:

- local context reads input/physics directly.
- remote context is supplied by `PlayerModel` from networked locomotion/equipment state.
- remote helper modules provide movement flag resolution and directional idle safety.

There is no active separate remote locomotion hook. Do not recreate one.

## Controller Boundaries

Controllers should accept typed context and services, mutate only the relevant `GenericActionRefs`, emit trace/FSM events through provided observers, and return explicit results. If a controller needs unrelated dependencies from every subsystem, the boundary is too broad.

Use action plans when the same weight pattern appears more than once and the declarative shape is clearer than imperative mutation.

## Debug Observability

Debug snapshots are built in `debug/snapshotBuilder.ts` and published through `animationDebug.store.ts`. Snapshots include FSM state fields and action summaries. Timeline data preparation belongs in debug UI selectors/components, not runtime frame paths.

The F7 inspector has Live, Timeline, and Remote tabs. Timeline replay must remain read-only and visualization-only.

## Legacy Template

Older references that described creating `use{Name}Animations`, `use{Name}AnimationLoader`, `use{Name}Transitions`, and `use{Name}Locomotion` for each equipment type are legacy pre-refactor guidance. New animation features should plug into pack data, controllers, FSM events, action plans, and generic loader/locomotion paths first.
