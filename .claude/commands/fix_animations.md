---
description: Diagnose and fix animation bugs with fresh investigation, historical context, and multi-hypothesis root cause analysis
---

# Fix Animations

You are tasked with diagnosing and fixing animation bugs in the player character system. This command follows the project's **Research → Plan → Implement** workflow with explicit phase gates. Each phase MUST stop and present findings to the user before continuing.

Historical bug patterns (140+ documents, 8 critical anti-patterns) are used as **context and reference** — not as a prescriptive checklist. Every bug gets a fresh investigation because the most expensive mistakes in this project came from assuming a bug matched a known pattern when it didn't.

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

## Initial Response — Detect Input Type and Route to Correct Phase

When invoked, FIRST classify what the user provided. This determines which phase you start at.

### Input Type 1: Research document provided
The user attached or pasted a **research file** (from `thoughts/shared/research/`, or any document containing root cause analysis, hypotheses, investigation findings, or bug diagnosis).

**How to detect**: The input contains a file path to `thoughts/*/research/`, OR the content includes sections like "Root Cause", "Hypotheses", "Investigation", "Evidence", "5 Whys", or similar research artifacts.

**Action**: **SKIP Phase 1 entirely. Go directly to Phase 2 (PLAN).**
- Read the research document thoroughly
- Extract the confirmed root cause, affected files, and evidence
- Use it as your research foundation — do NOT re-investigate from scratch
- Begin Phase 2 immediately: produce a fix plan based on the research findings

### Input Type 2: Plan document provided
The user attached or pasted a **plan file** (from `thoughts/shared/plans/`, or any document containing a fix plan, proposed changes, implementation steps).

**How to detect**: The input contains a file path to `thoughts/*/plans/`, OR the content includes sections like "Fix Plan", "Proposed Changes", "Implementation Steps", or similar planning artifacts.

**Action**: **SKIP Phase 1 AND Phase 2 entirely. Go directly to Phase 3 (IMPLEMENT).**
- Read the plan document thoroughly
- Extract the root cause, proposed changes, affected files, and verification steps
- Use it as your implementation blueprint — do NOT re-plan from scratch
- Begin Phase 3 immediately: implement the changes described in the plan

### Input Type 3: Bug description provided (text)
The user provided a bug description (e.g., `/fix_animations character has crab pose when bunny hopping`).

**Action**: Begin Phase 1 (RESEARCH) immediately with the description as input.

### Input Type 4: No input provided

```
I'll help diagnose and fix animation issues. Please describe:

1. **What you see** — The visual symptom (e.g., "arms spread wide", "T-pose flash", "character sinks", "jittery transitions")
2. **When it happens** — The trigger condition (e.g., "when switching from weapon to unarmed", "after 2+ jumps", "only on remote players")
3. **Reproducibility** — Always? Sometimes? Only in multiplayer?

Or provide a research/plan document to skip ahead to the appropriate phase.
```

Wait for user input before proceeding.

### ⚠️ CRITICAL: Do NOT re-do completed phases
If the user gave you research → the research is DONE. Plan next.
If the user gave you a plan → research AND planning are DONE. Implement next.
NEVER go backwards to a phase that the provided document already covers.

---

## ⚠️ MANDATORY: LEARN Phase Runs After EVERY Fix — No Exceptions

**Regardless of how the bug gets fixed — by you, by the user, or resolved on its own — you MUST run Phase 4 (LEARN) before ending the session.**

This is the #1 most commonly skipped phase. Do NOT end the session after a fix is confirmed without running Phase 4. **However**, like all other phases, Phase 4 waits for the user to say "continue" after Phase 3 (IMPLEMENT) completes. The user controls when each phase runs.

If the user fixed the bug themselves and you don't know the root cause, ask before running Phase 4:

```
Before I wrap up, I need to update the knowledge base. Can you briefly describe:
- What was the root cause?
- What was the fix? (which file(s), what changed)
```

Then run Phase 4 with whatever information you have.

---

# Phase 1: RESEARCH — Investigate the Bug

**Important**: Do NOT jump to conclusions based on symptom keywords. The #1 lesson from 140+ bug investigations is that wrong diagnosis → compensating mechanisms → weeks of wasted work. Every bug deserves a fresh investigation even if it *looks* familiar.

## 1a. Find Similar Historical Bugs (Context, NOT Prescription)

Search for bugs with similar symptoms in the known taxonomy below. These are **reference points for context** — they tell you what *has* caused similar symptoms before, but the current bug may have a completely different root cause.

<details>
<summary>Historical Bug Taxonomy (click to expand)</summary>

| Symptom | Pattern ID | Past Root Cause (may differ for your bug) | Files That Were Relevant |
|---------|-----------|-------------------------------------------|--------------------------|
| **T-pose flash** on mode enter/exit | TPOSE-WEIGHT | Weight dropping to 0 → bind pose | Transitions hook, fadeout order |
| **T-pose on load** (remote player) | TPOSE-LOAD | Animations not ready when player mounts | `PlayerModel.tsx` loading gates |
| **Crab pose** / twisted body | CRAB-BLEND | State machine gap or stale full-body actions | Locomotion hook, jump↔locomotion gap |
| **Arms spread wide** (remote only) | REMOTE-5050 | 50/50 blend from missing remote fadeout | Remote locomotion hook vs local |
| **Character sinks / lies flat** | PELVIS-STRIP | Pelvis quaternion stripped from clip | Loader body-split, `skeleton.utils.ts` |
| **Character floats above ground** | Y-OFFSET | Collider mismatch or Y correction wrong | `RemotePlayer.tsx`, physics setup |
| **Body distortion** at camera pitch | AIM-ADDITIVE | Additive aim rotations exceeding limits | `useAimOffset.ts`, pitch caps |
| **Jump animation cuts off** | JUMP-PHASE | Land phase too short or isGrounded flip | Jump system hook, physics timing |
| **Jump animation freezes** | JUMP-CLAMP | Clamped action stuck at full weight | Jump exit cleanup, `action.reset()` |
| **Wrong direction animation** | DIR-ANGLE | Movement angle calc or X-axis sign error | `getDirectionBlendWeights` input |
| **Idle jitter / mode oscillation** | GRACE-MISSING | No grace period on directional→idle | `MOVEMENT_GRACE_PERIOD` |
| **Snappy/jarring transition** | XFADE-SHORT | Crossfade too short | Constants crossfade durations |
| **Floaty/mushy transition** | XFADE-LONG | Crossfade too long (>0.5s) | Constants crossfade durations |
| **Animation plays once then stops** | LOOP-MODE | `LoopOnce` instead of `LoopRepeat` | Loader clip config, action setup |
| **Stale action from previous mode** | STALE-ACTION | Action not stopped on mode exit | Mode exit cleanup in transitions |
| **UUID collision / self-crossfade** | UUID-CLONE | Shared UUID → same action → self-crossfade | Loader `clip.clone()` |
| **Dead filter / empty clip** | FILTER-DEAD | Track filter targets wrong bone names | Bone name verification |
| **Remote animations lag behind** | REMOTE-LAG | Stale velocity or missing sync field | `MoveMessage`, `CharacterState` |
| **Remote direction mismatch** | REMOTE-DIR | X-axis sign in world→local conversion | `getRemoteMovementAngle` |
| **Double mixer update artifacts** | MIXER-DOUBLE | Mixer updated twice per frame | `PlayerModel.tsx` (intentional) |
| **Rotation oscillation loop** (weapon idle) | TURN-OVERSHOOT | Turn-in-place 90° step overshoots 40° trigger threshold → immediate re-trigger in opposite direction | `useTurnInPlace.ts`, `animation.constants.ts` |
| **Crab pose during crouch** (remote weapon) | CROUCH-PROXY | Turn-in-place proxy refs always reference standing animations, blending standing weaponUpperBody over crouchIdle on remote players | `useRemoteSpineYaw.ts`, `PlayerModel.tsx` |
| **Crab pose on ledge jump** (fall + jump) | CLAMP-PERSIST | Land action clamps (LoopOnce + clampWhenFinished) while airborne; cleanup gates on `isRunning()` miss clamped actions, leaving weight 1.0 on lower body | `useWeaponLocomotion.ts` jump phase cleanup |
| **Jagged/snappy remote crouch transition** | INVARIANT-KILL | Per-frame mode invariant `stopInstant()`s fading standing actions at `weight > 0`, destroying the `fadeOut()` interpolant from the mode transition 1 frame earlier; also 0.6s generic crossfade too slow for crouch | `useRemoteWeaponLocomotion.ts` crouch invariant, `animation.constants.ts` |
| **Crouch non-interruptible / delayed response** | TIMER-GATE | Physics transition timer gates animation state; `isUnarmedCrouchActive()` returns true for entire timer duration, blocking input response. Also: `setEffectiveWeight(1)` snaps mid-fade actions, causing jerk on rapid toggle | `usePlayerState.ts`, `InputSystem.ts`, `PlayerModel.tsx` |
| **Micro-jump on crouch** (audible landing sound) | COLLIDER-OFFSET-BOUNCE | Collider offset change in `setCharacterCrouching` shifts the collider's world-space center; Rapier resolves the resulting ground overlap by pushing the rigid body upward, creating a physical bounce + false landing | `PhysicsManager.ts` `setCharacterCrouching()` |
| **Distorted pose on weapon→weapon swap** (moving) | EQUIP-LAG-RACE | `getLocalEquipmentType()` reads server-confirmed state, lags behind key press. Old weapon's equip animation fires before server confirms new type — two subsystems fight. | `useWeaponAnimations.ts`, `useSwordAnimations.ts`, `useEquipmentAutoActivation.ts` |
| **Spine collapse / bind pose flash** on idle→move | WEIGHT-GAP-TRANSITION | Directional actions start at weight 0 and ramp up via lerp while idle fades out — total weight < 1 for several frames, skeleton partially collapses to bind pose | Locomotion hooks — initial weight setup on mode entry |
| **Crouch speed stuck permanently** (sword mode) | CROUCH-LEAK-SWORD | Rifle crouch state (`crouchActive`, `crouchTransitionState`) not cleared on sword enter — `weaponCrouchEffective` stays true, applying slow speed until mode change | `useSwordTransitions.ts`, `InputSystem.ts`, `MovementSystem.ts` |

</details>

Note which patterns have similar symptoms — but **do not assume any of them is the cause**. Record them as:

```
Similar historical patterns: [PATTERN-IDs with brief note on similarity]
But this could also be: [1-2 alternative hypotheses based on the specific description]
```

## 1b. Launch Parallel Investigation (Fresh Eyes + Historical Context)

Gather evidence from multiple angles simultaneously:

**Agent 1 — Fresh Codebase Analysis** (no historical bias):
```
Read these files looking for ANYTHING suspicious — don't just look for known patterns:
- apps/client1/src/components/canvas/player/PlayerModel.tsx (hook composition, mixer setup)
- The specific subsystem hooks mentioned in the bug report
- Recent changes: git log --oneline -20 -- 'apps/client1/src/components/canvas/player/**'

Look broadly for:
- Weight inconsistencies (actions at unexpected weights)
- State that isn't cleaned up on transition
- Race conditions between hooks
- Assumptions about execution order
- Any code that was recently changed
- Missing null checks or edge case handling
```

**Agent 2 — Build Health Check**:
```
Run pnpm type-check and pnpm build. Report any animation-related errors.
Also run pnpm lint on the player animation files directory.
```

**Agent 3 — Historical Context** (reference only):
```
Search thoughts/shared/research/ for documents with similar symptom keywords.
Search git log for similar bugs that were fixed before.
Return: matching documents with their root cause and fix.
BUT ALSO: note any cases where a similar symptom had a DIFFERENT root cause
than expected — these surprise cases are the most valuable.
```

## 1c. Formulate Multiple Hypotheses

After receiving sub-agent results, create **at least 3 hypotheses** — never just one:

```markdown
## Hypotheses (ranked by evidence strength)

### H1: [Most likely based on evidence]
- Evidence for: [what supports this]
- Evidence against: [what doesn't fit]
- How to confirm: [specific check]

### H2: [Second possibility]
- Evidence for: [...]
- Evidence against: [...]
- How to confirm: [...]

### H3: [Wildcard — something completely different]
- Evidence for: [...]
- This would explain: [symptom aspects H1/H2 don't explain]
- How to confirm: [...]
```

**The wildcard hypothesis (H3) is mandatory.** Force yourself to think: "What if this has nothing to do with what I think it's about?" Historical patterns can create tunnel vision — the most costly bugs in this project were misdiagnosed because the symptom *looked* like a known pattern but had a completely different root cause.

## 1d. Targeted Code Reading — Confirm or Eliminate Hypotheses

For each hypothesis, identify the specific files and code paths to check. Focus investigation on **confirming or eliminating** each hypothesis — not just looking for evidence that supports your favorite one.

Use these investigation techniques based on what you're looking for:

**For weight/blend issues**:
- Trace every `fadeIn`, `fadeOut`, `crossFadeFrom`, `setEffectiveWeight` call in the affected code path
- Check: can total weight on any bone reach 0 during the transition?
- Check: are two actions at weight 1.0 competing on overlapping bones?

**For state machine issues**:
- Trace the mode resolution logic frame by frame during the trigger scenario
- Check: is there any frame where the resolved mode differs from what's expected?
- Check: are there gap frames between clearing one state and entering the next?

**For clip/loading issues**:
- Verify actual bone names in clips vs what filters expect
- Check: are clips cloned before body splitting?
- Check: are all necessary tracks present after filtering?

**For remote player issues**:
- Compare the local player code path side-by-side with the remote path
- Find every protection mechanism (fadeout, gate, weight reset) in the local path
- Check: does the remote path have equivalent protections?

**For timing/physics issues**:
- Check the interaction between physics state (isGrounded, velocity) and animation state
- Check: could the physics state flip at a time that the animation system doesn't handle?

**For interactions between subsystems**:
- Check: could another hook or system be modifying the same bones/actions?
- Check: is execution order between hooks guaranteed or could it vary?

**For rotation/turn-in-place oscillation**:
- Check: does a fixed-step rotation (e.g., 90° turn) overshoot the trigger threshold?
- Math test: if threshold is T and step is S, oscillation occurs when `S - T ≥ T` (i.e., `S ≥ 2T`)
- Check: is there a cooldown or hysteresis mechanism after turn completion?
- Check: could the turn completion and re-trigger happen in the same frame?

**For collider offset / micro-jump issues**:
- Check: does `setCharacterCrouching` or any collider resize change `translationWrtParent` without compensating the rigid body position?
- Check: is `setTranslation()` (immediate) used rather than `setNextKinematicTranslation()` (deferred)?
- Check: does the offset delta push the collider into the ground, causing Rapier to resolve overlap by bouncing the body up?

**For proxy ref / mode-awareness issues**:
- Check: do proxy refs (e.g., weaponIdleRef, weaponUpperBodyRef) always point to the correct animation variant for the current mode (standing vs crouching vs aiming)?
- Check: does a subsystem (turn-in-place, jump, etc.) start standing-only animations when the player is in a different mode (crouch, swim)?
- Check: when a mode change happens (stand→crouch), do all subsystems that reference mode-specific actions get notified or gated?

## 1e. Ask Operator for Runtime Evidence (when static analysis isn't conclusive)

If code reading doesn't definitively confirm one hypothesis, ask for runtime evidence:

```
I have [N] hypotheses and need runtime evidence to narrow down. Please do the following:

**Quick diagnostic** — Add this temporary code to PlayerModel.tsx inside the useFrame callback:

```typescript
// TEMPORARY DEBUG — remove after fixing
if (mixer) {
  const activeActions = mixer._actions.filter(a => a.isRunning());
  const summary = activeActions.map(a => ({
    clip: a.getClip().name,
    weight: a.getEffectiveWeight().toFixed(3),
    time: a.time.toFixed(2),
  }));
  if (frameCountRef.current % 60 === 0) {
    console.log('[AnimDebug]', JSON.stringify(summary, null, 2));
  }
}
```

Then reproduce the bug and paste the console output here. I need to see:
1. Which actions are running simultaneously
2. Their effective weights
3. Whether any unexpected actions have non-zero weight

Also check:
- Does the issue happen for local player, remote player, or both?
- Does it happen in the animation tuning page?
```

## 1f. Eliminate Hypotheses

After gathering evidence, score each hypothesis:

```
H1: [CONFIRMED / ELIMINATED / INCONCLUSIVE] — [why]
H2: [CONFIRMED / ELIMINATED / INCONCLUSIVE] — [why]
H3: [CONFIRMED / ELIMINATED / INCONCLUSIVE] — [why]
```

If all are eliminated, generate new hypotheses based on what you learned. If inconclusive, request more specific runtime evidence.

**If a hypothesis is confirmed, also verify it's the ROOT cause — not just a contributing factor.** A true root cause explains ALL symptoms. If your hypothesis explains some symptoms but not others, there may be multiple issues or a deeper cause.

## 1g. Root Cause — Apply the 5 Whys

After confirming a hypothesis, determine the root cause:

```
Symptom: [What the user sees]
Why 1: [Immediate technical cause]
Why 2: [Why that cause exists]
Why 3: [Why that condition was possible]
Why 4: [Why the protection didn't catch it]
Why 5: [The actual root cause — usually an architectural gap or false assumption]
```

### ⛔ PHASE GATE 1 — STOP HERE

**YOU MUST STOP NOW.** Do not proceed to Phase 2. Present your research findings to the user:

```markdown
## Research Complete — Bug Investigation Findings

**Symptom**: [What was reported]
**Root Cause**: [The actual underlying problem]
**How confirmed**: [Hypothesis that was confirmed, evidence that confirmed it]
**Eliminated hypotheses**: [Other hypotheses considered and why they were ruled out]
**Similar to historical pattern?**: [Pattern ID if similar, or "Novel — no matching historical pattern"]
  - If similar: [How this differs from the historical case]

Please review these findings. When you're ready, say "continue" to see my proposed fix plan, or give me feedback if you think the diagnosis is wrong.
```

**Wait for the user to respond before proceeding to Phase 2.**

### ON USER "CONTINUE" → Execute Phase 2 (PLAN) immediately. Do NOT repeat research. Do NOT ask clarifying questions. Go produce the fix plan NOW.

---

# Phase 2: PLAN — Propose the Fix

Based on the confirmed root cause from Phase 1, present a detailed fix plan:

```markdown
## Fix Plan

**Root Cause** (from research): [summary]

**Proposed Changes**:
1. [Specific change 1 — file, what to change, why]
2. [Specific change 2 — if needed]
3. [...]

**Risk Assessment**:
- Regression risk: [Low/Medium/High] — [why]
- Files touched: [list]
- Affects remote players: [Yes/No]

**NOT doing** (compensating mechanisms avoided):
- [What you're deliberately NOT doing and why — per Rule 7]

**Verification Plan**:
- Automated: `pnpm type-check && pnpm lint && pnpm build`
- Manual: [specific actions to test based on the fix]
```

### ⛔ PHASE GATE 2 — STOP HERE

**YOU MUST STOP NOW.** Do not proceed to Phase 3. Tell the user:

```
Fix plan is ready. Please review the proposed changes — especially the files touched and risk assessment. When you're ready, say "continue" to start implementation, or give me feedback to adjust the plan.
```

**Wait for the user to respond before proceeding to Phase 3.**

### ON USER "CONTINUE" → Execute Phase 3 (IMPLEMENT) immediately. Do NOT repeat research. Do NOT repeat planning. Do NOT re-analyze the plan. Go implement the changes NOW.

---

# Phase 3: IMPLEMENT — Apply Fix + Verify

## 3a. Fix Implementation Rules

1. **Fix the root cause, not the symptom** (Rule 7). If you find yourself adding "safety net" code, re-examine the root cause.

2. **After every file change**, verify against the relevant prevention rules:
   - [ ] Clips cloned before body splitting? (Rule 6)
   - [ ] Track names verified? (Rule 1)
   - [ ] No track overlap between simultaneous actions? (Rule 2)
   - [ ] Pelvis quaternion intact? (Rule 3)
   - [ ] Crossfade durations ≤ 0.3s for transitions, ≤ 0.2s for jumps? (Rule 4)
   - [ ] No state machine gaps? (Rule 8)
   - [ ] Remote player mirrored? (Rule 5)
   - [ ] Loading store keys valid? (Rule 9)
   - [ ] Turn-in-place has overshoot protection? (Rule 11)
   - [ ] Turn-in-place / jump subsystems gated on crouch state? (Rule 13)
   - [ ] Action cleanup checks `getEffectiveWeight() > 0`, not just `isRunning()`? (Rule 14)
   - [ ] Animation state responds to input immediately, not gated by physics timers? (Rule 15)
   - [ ] Mid-crossfade interruption preserves current weight, no snap to 1.0? (Rule 16)
   - [ ] Collider offset changes compensated with immediate body position adjustment? (Rule 17)
   - [ ] Equipment type read via `getPendingEquipmentOverride()` first, not just server state? (Rule 18)
   - [ ] Mode transition maintains total weight ≥ 1 (no bind pose flash)? (Rule 19)

3. **Clean up debug code** — Remove any temporary `console.log` or diagnostic code added during investigation.

4. **Run automated checks**:
   ```bash
   pnpm type-check && pnpm lint && pnpm build
   ```
   All three must pass with zero animation-related errors.

5. **If the fix touches remote player code**, explicitly verify:
   - Does the fix apply symmetrically to local and remote?
   - Does the remote locomotion hook mirror the same protection?

### Reference: Fix Patterns That Have Worked Before

These are proven code patterns from past fixes. Use them as **implementation reference** if your root cause analysis points to a similar underlying issue — but only after you've independently confirmed the root cause.

**Weight-drop fix** (when actions lose weight during transition):
```typescript
// crossFadeFrom atomically manages both actions — prevents weight gap
incomingAction.crossFadeFrom(outgoingAction, duration, false);
incomingAction.play();
```

**State gap fix** (when 1-frame gaps activate wrong animations):
```typescript
// Start next state BEFORE clearing current — overlap, no gap
function handleJumpExit(ctx) {
  const nextMode = resolveGroundedMode(ctx);
  fadeInMode(nextMode);
  fadeOutJumpClips(0.15);
}
```

**Remote protection mirror** (when remote players bypass local safeguards):
```typescript
// Every fadeOut/gate in local path needs equivalent in remote
if (isEnteringWeaponMode && defaultActionsRef.current) {
  Object.values(defaultActionsRef.current).forEach(a => a?.fadeOut(0.2));
}
```

**UUID collision fix** (when shared FBX causes self-crossfade):
```typescript
// Clone BEFORE creating variants
const upperClip = createUpperBodyClip(originalClip.clone());
const lowerClip = createLowerBodyClip(originalClip.clone());
```

## 3b. Verify

### Automated Verification

```bash
pnpm type-check && pnpm lint && pnpm build
```

### Manual Verification Guidance

Present to the operator:

```
Please verify the fix:

1. **Reproduce the original bug** — Does it still happen?
2. **Test local player** — [specific actions to test based on the fix]
3. **Test remote player** — Join with a second client and repeat
4. **Regression check**:
   - Enter/exit weapon mode — smooth transitions, no T-pose
   - Enter/exit spell mode — smooth transitions, no corruption
   - Jump in all modes — 3-phase plays correctly
   - Sprint in all directions — directional blending correct
   - Rapid mode switching — no crab pose or stale animations
   - Idle → move → idle — no jitter or oscillation
```

### After Verification

- **If the problem persists** → Go to the ITERATE section below.
- **If the fix works** → Present verification results and stop. Phase 4 (LEARN) is next but requires user approval like every other phase.
- **If the user fixed it themselves** → Same flow. See "MANDATORY: LEARN Phase Runs After EVERY Fix" section above.

### ⛔ PHASE GATE 3 — STOP HERE

**YOU MUST STOP NOW.** Do not proceed to Phase 4. Present your implementation results to the user:

```
Implementation complete. Automated checks passed.

Please verify the fix manually (see verification steps above). When you're ready, say "continue" to run the LEARN phase (update knowledge base), or report if the bug persists.
```

**Wait for the user to respond before proceeding to Phase 4.**

### ON USER "CONTINUE" → Execute Phase 4 (LEARN) immediately. Do NOT re-implement. Do NOT re-verify. Go update the knowledge base NOW.

---

## ITERATE — If Problem Persists

If the fix doesn't resolve the issue or reveals a new symptom, you MUST follow this structured iteration protocol. **The #1 lesson from 140+ bug investigations: wrong diagnosis → compensating mechanisms → weeks of wasted work. STOP and gather real evidence before guessing again.**

### Attempt Tracking (MANDATORY)

Before each iteration, maintain a mental log of all attempts. After every failed fix, update this tracking:

```markdown
## Fix Attempt Log

### Attempt 1
- **Hypothesis**: [What you thought was wrong]
- **Change**: [What you changed, which files]
- **Result**: [What happened — still broken? Different symptom? Partially fixed?]
- **Evidence used**: [Static analysis only? Runtime logs? User report?]

### Attempt 2
- ...
```

### Loop Detection — CHECK EVERY ITERATION

Before proposing the next fix, **answer these 5 loop-detection questions honestly**:

| # | Question | If YES → You're looping |
|---|----------|------------------------|
| 1 | Am I about to change the **same file** I changed in a previous attempt? | You're probably treating symptoms, not the root cause |
| 2 | Is my new hypothesis a **variation** of a previous one (e.g., "try different crossfade duration" after "try different crossfade duration")? | You're parameter-tuning without understanding why |
| 3 | Am I adding **safety nets / guards / compensating code** instead of understanding why the wrong state occurs? | You're violating Rule 7 — fix root cause, not symptoms |
| 4 | Have I made **2+ attempts without runtime evidence** (relying only on code reading)? | Static analysis has failed — you NEED runtime logs |
| 5 | Am I **reverting a previous fix** to try something else in the same area? | Your mental model of the problem is wrong — stop and re-examine |

**If ANY answer is YES → STOP. Do NOT propose another code fix. Jump to Strategy Pivot.**

### Strategy Pivot — Break the Loop

When loop detection triggers, you MUST switch to one of these alternative strategies. Pick the most appropriate one based on which loop-detection question fired.

#### Strategy A: ADD RUNTIME LOGS (when you lack evidence)

**Use when**: Questions 4 or 5 triggered. You've been guessing from static analysis.

Tell the operator:

```
I've made [N] attempts based on code reading alone and I'm not converging on the fix.
I need to SEE what the animation system is actually doing at runtime.

I'll add temporary diagnostic logging. Please reproduce the bug and paste the console output.
```

Then add ONE of these diagnostic snippets (pick the most relevant):

**Mixer state dump** (general — start here if unsure):
```typescript
// TEMPORARY DEBUG — add to PlayerModel.tsx useFrame
if (mixer) {
  const running = mixer._actions.filter(a => a.isRunning());
  const report = running.map(a => `${a.getClip().name}: w=${a.getEffectiveWeight().toFixed(3)} t=${a.time.toFixed(2)} loop=${a.loop}`);
  if (frameCountRef.current % 60 === 0) {
    console.log('[AnimDebug]', JSON.stringify(report, null, 2));
  }
}
```

**Weight timeline** (for blend/crossfade issues):
```typescript
// TEMPORARY DEBUG — tracks weight changes over 5 seconds
const weightLog: string[] = [];
if (mixer) {
  const activeNames = mixer._actions
    .filter(a => a.getEffectiveWeight() > 0.001)
    .map(a => `${a.getClip().name.slice(0, 20)}=${a.getEffectiveWeight().toFixed(2)}`);
  weightLog.push(`${(performance.now() / 1000).toFixed(2)}s: ${activeNames.join(', ')}`);
  if (weightLog.length > 300) {
    console.log('[WeightTimeline]', weightLog.join('\n'));
    weightLog.length = 0;
  }
}
```

**State machine trace** (for transition/gap bugs):
```typescript
// TEMPORARY DEBUG — logs every mode/phase change
const prevStateStr = `${currentModeRef.current}|${jumpPhaseRef.current}`;
// ... after mode resolution ...
const newStateStr = `${resolvedMode}|${newJumpPhase}`;
if (newStateStr !== prevStateStr) {
  console.log(`[StateTrace] ${prevStateStr} → ${newStateStr} (delta=${delta.toFixed(4)})`);
}
```

**Bone-level debugging** (for distortion/wrong-pose bugs):
```typescript
// TEMPORARY DEBUG — log specific bone transforms after mixer.update()
const bone = skeletonRef.current?.getBoneByName('pelvis');
if (bone && frameCountRef.current % 60 === 0) {
  console.log('[BoneDebug] pelvis', {
    pos: bone.position.toArray().map(v => v.toFixed(3)),
    rot: bone.quaternion.toArray().map(v => v.toFixed(3)),
  });
}
```

Wait for runtime output before proposing any new fix.

#### Strategy B: ASK THE USER TARGETED QUESTIONS (when your mental model is wrong)

**Use when**: Questions 1, 2, or 5 triggered. You're circling the same area.

Tell the operator:

```
I've been investigating [area] but my attempts aren't converging. I need to challenge
my assumptions. Can you help me narrow down?

1. **Timing**: Does the bug happen IMMEDIATELY on [trigger], or after a short delay?
   (Immediate = wrong initial state. Delayed = transition/blend issue.)

2. **Consistency**: Is it 100% reproducible, or intermittent?
   (Intermittent = likely a race condition or timing-dependent. 100% = deterministic state issue.)

3. **Isolation**: Does it happen if you ONLY do [the trigger action] and nothing else?
   Or does it require a sequence of actions first?
   (Sequence-dependent = stale state from a previous action isn't cleaned up.)

4. **Affected bones**: Which body parts look wrong? Upper body? Lower body? Specific limb?
   (This tells me which animation clips are conflicting.)

5. **Recent changes**: Did anything change recently in the animation code or FBX assets?
   (git log --oneline -10 -- 'apps/client1/src/components/canvas/player/**')
```

Use the answers to form a COMPLETELY NEW hypothesis — not a variation of previous ones.

#### Strategy C: INVESTIGATE A DIFFERENT AREA (when the bug isn't where you think)

**Use when**: Question 1 triggered. You keep changing the same file.

```
I've been focused on [file/area] but the bug may originate elsewhere.
Let me investigate upstream/downstream instead.
```

Check these alternative areas:
- **If fixing locomotion**: Check the transitions hook — maybe the mode isn't entered correctly
- **If fixing transitions**: Check the loader — maybe the clips are wrong
- **If fixing the loader**: Check the FBX files — maybe the source data is bad
- **If fixing local player**: Check remote player — maybe the bug is actually on the remote side
- **If fixing client**: Check server sync — maybe the wrong data is being sent
- **If fixing weights/blending**: Check the mode resolution — maybe the wrong mode is selected

#### Strategy D: SIMPLIFY AND ISOLATE (when complexity is overwhelming)

**Use when**: Question 3 triggered. You keep adding more code instead of understanding.

```
The system state is too complex to reason about. I need to isolate the problem.

I'll create a minimal reproduction:
1. Disable all subsystems except the one involved in the bug
2. Comment out non-essential hooks (sound, VFX, aim offset)
3. Reduce to the simplest trigger (e.g., just idle → walk → idle)
4. See if the bug still occurs in this simplified state

If YES → the bug is in the core of this subsystem
If NO → the bug is in the interaction between subsystems
```

#### Strategy E: FULL STOP — ESCALATE TO HUMAN (when truly stuck)

**Use when**: You've exhausted strategies A-D, or after 3+ failed attempts total.

```
## Escalation: I Need Help

I've made [N] attempts and tried [which strategies]. Here's my full investigation record:

**Attempts made**:
1. [Attempt 1 summary + result]
2. [Attempt 2 summary + result]
3. [Attempt 3 summary + result]

**What I've ruled out**: [patterns/hypotheses eliminated with evidence]
**What I still suspect**: [remaining hypothesis, if any]
**Why I'm stuck**: [specific blocker — missing evidence? contradictory symptoms? unknown interaction?]

**To proceed, the most helpful thing would be**:
- [ ] Video recording of the bug (screen capture with DevTools console visible)
- [ ] Animation tuning page test — does the bug happen there too?
- [ ] Minimal reproduction — strip the scene to just the player and test
- [ ] Performance tab recording during the bug (frame-by-frame detail)
- [ ] Pair debugging session — walk through the code together

I'd rather stop and get the right information than keep guessing and making the code more complex.
```

### Post-Pivot: Second Pass Analysis

After receiving new evidence (runtime logs, user answers, or isolated reproduction):

1. **Discard all previous hypotheses** — start fresh with the new data
2. Generate **new hypotheses** from the evidence (Phase 1 format — at least 3, including a wildcard)
3. Look for the **specific** evidence: unexpected actions at non-zero weight, state transitions that shouldn't happen, weight values that don't sum correctly
4. The historical bug taxonomy (Phase 1) is a reference — check if the new evidence points to a known pattern, but remain open to novel causes
5. Apply the **5 Whys** again with the new evidence
6. **Present updated research findings** (Phase Gate 1 format) — get user approval
7. **Present updated fix plan** (Phase Gate 2 format) — get user approval
8. Implement the fix
9. After fix is confirmed → **Stop at Phase Gate 3, then execute Phase 4 (LEARN) when user says "continue"**

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
| Movement system (sends MoveMessage) | `apps/client1/src/systems/MovementSystem.ts` |
| CharacterState schema | `packages/shared/src/game/character/character.state.ts` |
| Server move handler | `apps/server/src/rooms/messages/move.ts` |
| Server room (state sync) | `apps/server/src/rooms/sandbox.room.ts` |
| Remote players store | `apps/client1/src/stores/remotePlayers.store.ts` |
| RemotePlayer component | `apps/client1/src/components/canvas/player/RemotePlayer.tsx` |
| Loading store | `apps/client1/src/stores/loading.store.ts` |
| Animation tuning page | `apps/client1/src/app/animation-tuning/` |

## Quick Reference: Historical Bug Documents

| Bug | Document |
|-----|----------|
| Root cause analysis (all weapon bugs) | `thoughts/shared/research/2026-02-06-weapon-animation-architecture-root-cause-analysis.md` |
| Body distortion + T-pose | `thoughts/shared/research/2026-02-05-weapon-animation-bugs-body-distortion-tpose.md` |
| Remote player corruption | `thoughts/shared/research/2026-02-12-remote-player-weapon-animation-corruption.md` |
| Multiplayer sync bugs | `thoughts/shared/research/2026-02-04-multiplayer-animation-sync-bugs.md` |
| Crab pose + bunny hop | `thoughts/shared/research/2026-03-02-crab-pose-bunny-hop-animation-bug.md` |
| Upper/lower body split | `thoughts/shared/research/2026-01-27-upper-lower-body-animation-split-investigation.md` |
| Animation blending | `thoughts/shared/research/2026-01-29-animation-blending-transition-animations.md` |
| Weapon simplification plan | `thoughts/shared/plans/2026-02-06-weapon-animation-simplification-root-cause-fix.md` |
| Comprehensive research | `thoughts/shared/research/2026-03-04-animation-system-comprehensive-research.md` |

---

# Phase 4: LEARN — Update Knowledge Base (MANDATORY — Do Not Skip)

This phase runs after EVERY confirmed fix. It is not optional. Like all other phases, it runs when the user says "continue" after Phase 3 completes. The session is NOT complete until this phase finishes.

Evaluate whether **new information was discovered** that isn't already captured in the animation skill references. This phase ensures the knowledge base grows with every fix — preventing the team from re-discovering the same bugs.

## 4a. Evaluate Novelty

Ask yourself these questions:

1. **New bug pattern?** — Does this bug have a symptom/root-cause that doesn't match any row in the Phase 1 taxonomy table above?
2. **New prevention rule?** — Did the root cause reveal a new anti-pattern not covered by Rules 1-9 in `references/03-bug-prevention-rules.md`?
3. **Existing rule needs update?** — Did this bug reveal a new edge case or variant of an existing rule?
4. **New investigation technique?** — Did the diagnosis require a technique not in Phase 1's investigation methods?
5. **New file/hook to watch?** — Did this bug originate in a file not in the Quick Reference table?

If ALL answers are "no" — tell the user: "Existing knowledge already covers this bug pattern. No updates needed." Then you're done.

If ANY answer is "yes" — proceed to 4b.

## 4b. Update the Knowledge Files

For each "yes" above, update the corresponding file. **Always read the file first** to find the right insertion point and maintain consistency with existing formatting.

#### New Bug Pattern → Update `fix_animations.md` Phase 1 Taxonomy

Add a new row to the **Known Bug Taxonomy** table in Phase 1:

```markdown
| **[Symptom description]** | [PATTERN-ID] | [Root cause summary] | [Key files] |
```

Also add a matching investigation technique in Phase 1 under `## 1d. Targeted Code Reading`.

#### New Prevention Rule → Update `references/03-bug-prevention-rules.md`

Add a new rule section following the existing format:

```markdown
## Rule [N+1]: [Rule Name]

**Anti-pattern**: [What people do wrong]

**What happens**: [The visible consequence]

**Prevention**:
[Code example showing the correct approach]
```

Then update these files to reference the new rule number:
- `SKILL.md` — "Bug Prevention — The N Critical Rules" table
- `fix_animations.md` — Phase 3 verification checklist (add a checkbox for the new rule)

#### Existing Rule Needs Update → Append to Existing Rule

Add a new subsection or example to the existing rule in `references/03-bug-prevention-rules.md`:

```markdown
### Edge Case: [Description]

This variant was discovered on [date]. [Explanation of the new edge case and how it differs from the base rule.]

```typescript
// [Code example for the edge case]
```
```

#### New Investigation Technique → Update `fix_animations.md` Phase 1

Add a new technique block under `## 1d. Targeted Code Reading` following the existing format (bold header + bullet list of what to check).

#### New File to Watch → Update `fix_animations.md` Quick Reference

Add the file to the "Quick Reference: File Locations" table.

## 4c. Compress If Knowledge Files Are Getting Large

After updating, check whether the knowledge files are becoming bloated. These files are loaded into context at the start of every `/fix_animations` session — every extra line costs tokens across ALL future sessions.

**When to compress**: If any of these files exceed their size budget:
- `fix_animations.md` — over ~900 lines
- `references/03-bug-prevention-rules.md` — over ~400 lines
- `SKILL.md` — over ~300 lines

**How to compress** (do this in the same pass as your knowledge update):

1. **Merge similar taxonomy rows** — If two bug patterns have the same root cause category (e.g., two variants of weight-drop), combine them into one row with both symptoms listed. Don't keep separate rows for minor variations of the same underlying issue.

2. **Trim verbose rule explanations** — Prevention rules should be concise: anti-pattern, consequence, code example. If a rule has accumulated multiple "Edge Case" subsections that all say variations of the same thing, consolidate them into one subsection with a bullet list.

3. **Collapse old investigation techniques** — If a technique block in Phase 1d has grown beyond 5 bullet points, distill it to the 3 most diagnostic checks. The goal is quick pattern-matching, not exhaustive checklists.

4. **Archive detailed post-mortems** — Bug post-mortems in `thoughts/shared/research/` are reference documents, not active knowledge. The taxonomy row + prevention rule should capture the essential lesson. If a post-mortem exists, the taxonomy row can reference it instead of duplicating details.

5. **Remove redundancy between files** — If the same information appears in both `fix_animations.md` and `03-bug-prevention-rules.md`, keep the authoritative version in one place and reference it from the other. Don't duplicate.

**Compression rules**:
- NEVER delete information — compress, merge, or move to a reference document
- ALWAYS preserve: pattern IDs, root cause summaries, code examples, file paths
- CAN remove: verbose prose explaining why a pattern matters, duplicate explanations, historical narrative

## 4d. Confirm Updates

After making updates, tell the operator:

```
## Knowledge Base Updated

I've updated the animation skill references with new knowledge from this fix:

- **[What was updated]**: [Brief description of the new knowledge]
- **File(s) changed**: [list of files modified]
- **Compressed**: [Yes/No — if yes, what was consolidated]

This will help prevent the same bug from recurring and make future diagnosis faster.
```

## 4e. Optional: Write a Bug Post-Mortem

If the bug was particularly tricky (took >1 investigation round, or was a novel pattern), create a short post-mortem in `thoughts/shared/research/`:

```markdown
---
date: [ISO date]
researcher: claude
topic: "[Bug symptom] animation bug post-mortem"
tags: [animation, bug, post-mortem]
status: complete
---

# Post-Mortem: [Bug symptom]

## Symptom
[What was reported]

## Root Cause
[The actual underlying problem]

## Fix
[What was changed and why]

## New Knowledge
[What was learned that wasn't known before]

## Prevention Rule
[Reference to the new/updated rule in 03-bug-prevention-rules.md]
```

---

## Important Rules

### Phase Gates and Transitions (HIGHEST PRIORITY)

- **NEVER proceed past a ⛔ PHASE GATE without explicit user approval**
- **NEVER combine research + plan + implementation in one response**
- **ALWAYS stop after completing each phase and wait for user to say "continue"**
- **ALWAYS present your output for review before moving to the next phase**
- If the user gives feedback at a gate, incorporate it and wait again

### Phase Skipping — When User Provides Pre-completed Work (EQUALLY HIGH PRIORITY)

- **If user provides a RESEARCH document → START at Phase 2 (PLAN). Research is already done.**
- **If user provides a PLAN document → START at Phase 3 (IMPLEMENT). Research and plan are already done.**
- **NEVER re-do a phase that the user's input already covers. That wastes their time.**
- **NEVER ask "should I start with research?" when the user already gave you the research.**
- **Treat provided documents as COMPLETED PHASE OUTPUT — read them, extract what you need, and move to the NEXT phase.**

### Investigation Rules

1. **NEVER assume a bug matches a known pattern just because symptoms look similar** — Always generate multiple hypotheses including a wildcard. The most expensive bugs in this project were misdiagnosed because the symptom *looked* familiar but had a completely different root cause.
2. **ALWAYS present research findings AND fix plan before making changes** — Get operator approval at each phase gate
3. **NEVER add compensating mechanisms** — Fix root causes (Rule 7)
4. **NEVER skip remote player verification** — Most bugs historically appear on remote players (Rule 5)
5. **ALWAYS clean up debug code** after the fix is confirmed
6. **ALWAYS run `pnpm type-check && pnpm lint && pnpm build`** after changes
7. **RUN LOOP DETECTION before every iteration** — If any of the 5 questions is YES, you MUST pivot strategy instead of guessing again. This is the single most important rule for preventing wasted work.
8. **Use sub-agents for file reading** — Preserve main context for reasoning and synthesis
9. **ALWAYS run Phase 4 (LEARN)** after a confirmed fix — this is NOT optional. The knowledge base MUST grow with every fix. Like all phases, Phase 4 waits for user approval at Phase Gate 3 before executing. Do NOT end the session without completing Phase 4. **This applies even when the USER fixed the bug themselves** — ask for root cause details and update knowledge before ending.
10. **Prefer runtime evidence over static analysis** — A single `console.log` output is worth more than 10 minutes of code reading. When in doubt, add logs first.
11. **Historical bugs are context, not recipes** — The taxonomy tells you what *has* caused symptoms before. It doesn't tell you what's causing *this* bug. Always investigate fresh.
