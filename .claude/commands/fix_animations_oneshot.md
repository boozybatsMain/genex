---
description: Diagnose and fix animation bugs in a single pass — no phase gates, no stops. Research → Plan → Implement all at once.
---

# Fix Animations (Oneshot)

You are tasked with diagnosing and fixing animation bugs in the player character system. Unlike `/fix_animations`, this command **skips all phase gates** and attempts to research, diagnose, plan, and fix the bug in a single pass. Do NOT stop for user approval between phases — go straight through.

## FIRST: Load the Animation Subsystem Skill

Read the skill file IMMEDIATELY before doing anything else:

```
.claude/skills/animation-subsystem/SKILL.md
```

Then read the bug prevention rules:

```
.claude/skills/animation-subsystem/references/03-bug-prevention-rules.md
```

These two files are your primary knowledge base for diagnosis.

## Initial Response — Detect Input Type

When invoked, classify what the user provided:

### Input Type 1: Research document provided
The user attached a research file. **Extract the root cause and affected files, then jump straight to implementation.**

### Input Type 2: Plan document provided
The user attached a plan file. **Extract the proposed changes, then jump straight to implementation.**

### Input Type 3: Bug description provided (text)
The user described the bug. **Begin the full oneshot flow below.**

### Input Type 4: No input provided

```
I'll help diagnose and fix animation issues. Please describe:

1. **What you see** — The visual symptom
2. **When it happens** — The trigger condition
3. **Reproducibility** — Always? Sometimes? Only in multiplayer?
```

Wait for user input before proceeding.

---

## Oneshot Flow — Research + Plan + Implement in One Pass

Once you have the bug description, execute ALL of the following without stopping. Do your thinking internally and proceed to the fix.

### Step 1: Gather Context (Parallel Sub-Agents)

Launch these investigations simultaneously:

**Agent 1 — Fresh Codebase Analysis**:
```
Read these files looking for ANYTHING suspicious related to the reported bug:
- apps/client1/src/components/canvas/player/PlayerModel.tsx
- The specific subsystem hooks mentioned in the bug report
- Recent changes: git log --oneline -20 -- 'apps/client1/src/components/canvas/player/**'

Look for:
- Weight inconsistencies
- State not cleaned up on transition
- Race conditions between hooks
- Wrong execution order assumptions
- Recent code changes
- Missing null checks or edge cases
```

**Agent 2 — Build Health Check**:
```
Run pnpm type-check and pnpm build. Report any animation-related errors.
```

**Agent 3 — Historical Context**:
```
Search thoughts/shared/research/ for documents with similar symptom keywords.
Search git log for similar bugs that were fixed before.
Return: matching documents with their root cause and fix.
```

### Step 2: Internal Diagnosis (Do NOT Present to User — Just Think)

After receiving sub-agent results, internally:

1. **Formulate at least 3 hypotheses** including a wildcard
2. **Read the specific code paths** involved in the bug — trace weights, states, transitions
3. **Eliminate hypotheses** based on evidence
4. **Apply 5 Whys** on the confirmed hypothesis to find the root cause
5. **Decide on the fix** — fix the root cause, not the symptom

Use the historical bug taxonomy from the full `/fix_animations` command as reference context (NOT as a prescription). Known patterns:

| Symptom | Pattern ID | Past Root Cause |
|---------|-----------|-----------------|
| T-pose flash on mode enter/exit | TPOSE-WEIGHT | Weight dropping to 0 → bind pose |
| Crab pose / twisted body | CRAB-BLEND | State machine gap or stale full-body actions |
| Arms spread wide (remote only) | REMOTE-5050 | 50/50 blend from missing remote fadeout |
| Character sinks / lies flat | PELVIS-STRIP | Pelvis quaternion stripped from clip |
| Body distortion at camera pitch | AIM-ADDITIVE | Additive aim rotations exceeding limits |
| Jump animation cuts off | JUMP-PHASE | Land phase too short or isGrounded flip |
| Wrong direction animation | DIR-ANGLE | Movement angle calc or X-axis sign error |
| Idle jitter / mode oscillation | GRACE-MISSING | No grace period on directional→idle |
| Stale action from previous mode | STALE-ACTION | Action not stopped on mode exit |
| Rotation oscillation loop | TURN-OVERSHOOT | Turn-in-place step overshoots trigger threshold |
| Crab pose during crouch | CROUCH-PROXY | Proxy refs reference wrong mode variant |
| Crab pose on ledge jump | CLAMP-PERSIST | Land action clamps while airborne |
| Spine collapse on idle→move | WEIGHT-GAP-TRANSITION | Total weight < 1 during directional ramp-up |
| Crouch speed stuck (sword) | CROUCH-LEAK-SWORD | Crouch state not cleared on sword enter |

### Step 3: Implement the Fix

Apply the fix directly. Follow these rules:

1. **Fix the root cause, not the symptom.** No compensating mechanisms.
2. **After every file change**, verify against prevention rules:
   - Clips cloned before body splitting?
   - Track names verified?
   - No track overlap between simultaneous actions?
   - Pelvis quaternion intact?
   - Crossfade durations ≤ 0.3s for transitions, ≤ 0.2s for jumps?
   - No state machine gaps?
   - Remote player mirrored?
   - Action cleanup checks `getEffectiveWeight() > 0`, not just `isRunning()`?
   - Mode transition maintains total weight ≥ 1?
3. **Clean up any debug code.**
4. **If the fix touches remote player code**, verify it applies symmetrically.

### Step 4: Verify

Run automated checks:

```bash
pnpm type-check && pnpm lint && pnpm build
```

All three must pass with zero animation-related errors.

### Step 5: Present Results

After implementation, present a single summary:

```markdown
## Oneshot Fix Complete

**Symptom**: [What was reported]
**Root Cause**: [The actual underlying problem]
**How confirmed**: [Evidence that confirmed it]
**Eliminated hypotheses**: [Other hypotheses considered and why ruled out]

**Changes Made**:
1. [File — what changed and why]
2. [...]

**Automated Checks**: [Pass/Fail]

**Manual Verification** — Please test:
1. Reproduce the original bug — Does it still happen?
2. [Specific actions to test based on the fix]
3. Regression check:
   - Enter/exit weapon mode — smooth transitions, no T-pose
   - Enter/exit spell mode — smooth transitions
   - Jump in all modes — 3-phase plays correctly
   - Sprint in all directions — directional blending correct
   - Rapid mode switching — no crab pose or stale animations
```

If automated checks fail, fix them before presenting.

---

## If the Fix Doesn't Work

If after implementation you discover the fix is wrong (type errors, contradictory evidence, etc.), iterate internally — don't ask the user. Apply loop detection:

1. Am I changing the same file again? → Investigate a different area
2. Am I parameter-tuning? → Rethink the root cause
3. Am I adding safety nets? → Fix root cause instead
4. Have I made 2+ attempts without runtime evidence? → Add diagnostic logs and ask the user to reproduce

If after 2 internal iterations you can't converge, escalate:

```
I wasn't able to fix this in one shot. Here's what I found:

**Investigated**: [areas checked]
**Hypotheses tried**: [what was attempted]
**Remaining suspects**: [what still looks promising]

I recommend running `/fix_animations` with the full phased workflow for deeper investigation.
```

---

## Quick Reference: File Locations

| What | Where |
|------|-------|
| Player animation orchestrator | `apps/client1/src/components/canvas/player/usePlayerAnimations.ts` |
| Player model + hook composition | `apps/client1/src/components/canvas/player/PlayerModel.tsx` |
| Weapon subsystem | `apps/client1/src/components/canvas/player/weapon-animations/` |
| Sword subsystem | `apps/client1/src/components/canvas/player/sword-animations/` |
| Sword orchestrator | `apps/client1/src/components/canvas/player/useSwordAnimations.ts` |
| Sword constants | `apps/client1/src/components/canvas/player/constants/sword.constants.ts` |
| Spell-cast subsystem | `apps/client1/src/components/canvas/player/spell-cast-animations/` |
| Animation constants | `apps/client1/src/components/canvas/player/constants/animation.constants.ts` |
| Weapon constants | `apps/client1/src/components/canvas/player/constants/weapon.constants.ts` |
| Skeleton utilities | `apps/client1/src/components/canvas/player/skeleton.utils.ts` |
| Direction utilities | `apps/client1/src/components/canvas/player/directionUtils.ts` |
| Remote player state | `apps/client1/src/components/canvas/player/useRemotePlayerState.ts` |
| Remote weapon locomotion | `apps/client1/src/components/canvas/player/weapon-animations/useRemoteWeaponLocomotion.ts` |
| Remote spine yaw | `apps/client1/src/components/canvas/player/useRemoteSpineYaw.ts` |
| Aim offset | `apps/client1/src/components/canvas/player/useAimOffset.ts` |
| Turn-in-place | `apps/client1/src/components/canvas/player/useTurnInPlace.ts` |
| Movement system | `apps/client1/src/systems/MovementSystem.ts` |
| CharacterState schema | `packages/shared/src/game/character/character.state.ts` |
| Loading store | `apps/client1/src/stores/loading.store.ts` |
| Animation tuning page | `apps/client1/src/app/animation-tuning/` |
