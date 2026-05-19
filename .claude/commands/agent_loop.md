# Agent-Loop: Autonomous Agent Improvement

Run the agent improvement loop: baseline (3 parallel) -> fix top 3 with per-fix commits -> re-test (3 parallel) -> smart selective revert -> next loop.

## Usage
- `/agent_loop` — run one improvement iteration, then stop
- `/agent_loop baseline` — establish baseline scores only
- `/agent_loop analyze` — show current scores without making changes
- `/agent_loop N` — run N improvement iterations autonomously
- `/agent_loop advance` — graduate to the next scenario set

## Mode

Parse `$ARGUMENTS` to determine mode:

- **SINGLE-RUN MODE** — if arguments are empty, "baseline", "analyze", or "advance":
  Run one iteration. Present results. Wait for user input before doing anything else.

- **AUTONOMOUS MODE** — if arguments contain a number N:
  Run exactly N iterations. **Do NOT ask the user between iterations.**
  **Do NOT pause for confirmation. Do NOT ask "should I continue?".**
  Continue immediately to the next iteration after completing one.
  The ONLY reasons to stop before N iterations are complete:
  1. `no_progress_count >= 2` (2 consecutive loops with 0 kept fixes)
  2. All N iterations finished
  3. Critical infrastructure failure (agent service crashed and cannot restart)
  Graduation (avg >= 70) is logged but does NOT stop the loop in this mode.

## Workflow

### 0. Reload State + Checkpoint (every iteration)

**IMPORTANT**: All helper functions already exist in `apps/claude-agent/scripts/run_agent_loop.py`. Do NOT recreate this file. Just `cd apps/claude-agent` and import from it.

**Git tag checkpoint** — create a tag at the start of each iteration for instant rollback:
```bash
git tag -f agent-loop-iter-${ITERATION}-start
```

Read these files to reconstruct context (survives context compaction):
- `eval-results/iteration-state.json` — last iteration number, seed, set, scores, no_progress_count, fixes
- `eval-results/best-scores.json` — per-scenario best-ever scores
- `eval-results/current-set.json` — which set we're on
- `eval-results/loop-log.json` — full history (read last 3 entries for recent context)
- `eval-results/fixes.json` — fixes from current iteration (if resuming mid-iteration)

This means: even if context was compacted, we know exactly where we are.
Determine the iteration number from the state file (or start at 1 if none exists).
Use the iteration number as the seed: `SEED = iteration_number`.

Also read `no_progress_count` from the state file (default 0).

### 1. Handle `advance` argument
If the argument is `advance`:
```python
from scripts.run_agent_loop import advance_set
new_idx = advance_set()
```
Print the new set's scenario types and STOP.

### 1b. Clean Service Restart

Kill stale processes and restart with latest code. This ensures the baseline tests against all changes from previous iterations and manual edits.

```bash
# Kill stale agent processes
pkill -f "uvicorn src.main:app" || true
sleep 1

# Restart agent service (EVAL_MOCK_FAST for faster mock callbacks during eval)
cd apps/claude-agent && EVAL_MOCK_FAST=true uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 &
sleep 3
curl -s http://localhost:8000/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('status')=='healthy' else 'FAIL')"
```

If the Node server was also changed in a previous iteration, rebuild and restart it too:
```bash
pnpm build --filter=@not-ai-game/server
```

### 2. Pre-flight & Infrastructure Fixes
```bash
cd apps/claude-agent && uv run python -c "
import asyncio
from src.eval.preflight import run_preflight
failures = asyncio.run(run_preflight())
if failures:
    print('PREFLIGHT FAILED:')
    for f in failures: print(f'  - {f}')
else:
    print('PREFLIGHT PASSED')
"
```

If pre-flight fails due to infrastructure issues (database migrations, Docker, build errors, missing env vars, etc.), **fix them before continuing**. These are NOT agent quality issues — they are blockers that prevent the loop from running at all. Common fixes:
- Database: `pnpm prisma:migrate:deploy` or `pnpm prisma:generate` (local Docker DB, safe to run migrations)
- Build: `pnpm build` if compilation fails
- Agent service: restart with `pnpm dev:agent`
- Node server: restart with `pnpm dev:server`

Infrastructure fixes should be committed separately as `fix(infra): ...` before the loop begins.

### 3. Baseline (smoke test + 3 scenarios in parallel)
```bash
cd apps/claude-agent && uv run python scripts/run_eval_batch.py --seed $SEED --output-dir ./eval-results/runs --skip-preflight
```
This runs a smoke test first (45s), then 3 scenarios from the current set in parallel. Save results.

If the batch exits with code 2 (smoke test failed):
- The agent is fundamentally broken — don't waste time on fixes
- Check recent commits for prompt/config regressions
- Restore from last known good state (git tag)
- Restart and retry

### 4. Analyze Current Scores
Read `eval-results/runs/aggregate.json` and identify the worst-scoring scenarios and layers.

### 5. Judge: Evaluate Baseline + Fix Top 3 Issues

#### 5a. Evaluate baseline (scoring only, NO fixes)

1. Clear previous fixes:
```python
from scripts.run_agent_loop import clear_fixes
clear_fixes()
```

2. Read the full score report from `eval-results/runs/aggregate.json`

3. Spawn the `agent-loop-judge` sub-agent with:
   - The full score report (all scenarios, all layers, all sub-metrics)
   - The per-scenario detail (each scenario's scores and sub-metric breakdown)
   - The list of world_ids so it can read game files and pull LangSmith traces via:
     `python apps/claude-agent/scripts/fetch_trace.py --world-id <world_id>`
   - Instruction: "**Phase 1 ONLY** — evaluate all scenarios, write real llm_judge scores
     to result files. Read game files AND the agent's prompts/skills to understand
     what the agent was trying to do. DO NOT make any fixes yet."

4. After the judge returns:
   - Read `eval-results/runs/aggregate.json` → these are the TRUE baseline scores

#### 5b. Fix top 3 issues

Spawn the `agent-loop-judge` sub-agent again with:
- The real baseline scores from 5a
- Instruction: "**Phase 2-3 ONLY** — identify systemic issues, fix the TOP 3 only.
  Before fixing, research the codebase: read the agent's prompts, skills,
  and tool implementations to understand the root cause. Commit each fix
  individually via commit_fix()."

After the judge returns:
- Read `eval-results/fixes.json` → confirm ≤ 3 commits
- Print how many fixes were committed

#### 5b-guard. Diff guard for prompt changes

After the judge makes fixes, check the diff size:
```bash
DIFF_LINES=$(git diff HEAD~3 -- apps/claude-agent/src/agent/prompts/base.py | wc -l)
if [ "$DIFF_LINES" -gt 100 ]; then
    echo "WARNING: Judge changed $DIFF_LINES lines in base.py (>100). Review before re-testing."
    # In autonomous mode: revert ALL fixes, log as "too many changes"
    # In single-run mode: pause for user review
fi
```

### 5c. Service Restart (if needed)

If the judge made code changes (check fixes.json for changed files):
- **Python files changed** (apps/claude-agent/src/):
  ```bash
  pkill -f "uvicorn src.main:app" || true
  cd apps/claude-agent && EVAL_MOCK_FAST=true uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 &
  sleep 3
  curl -s http://localhost:8000/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('status')=='ok' else 'FAIL')"
  ```
- **TypeScript files changed** (apps/server/src/):
  ```bash
  pnpm build
  # Restart server
  ```
- Verify both services are healthy before proceeding to re-test.

### 6. Re-test (same seed as baseline)
```bash
cd apps/claude-agent && uv run python scripts/run_eval_batch.py --seed $SEED --output-dir ./eval-results/runs-new --skip-preflight
```
Same seed ensures same prompts for fair before/after comparison.

### 7. Judge: Evaluate Re-test + Smart Revert

#### 7a. Evaluate re-test

Spawn the `agent-loop-judge` sub-agent with:
- Re-test results from `eval-results/runs-new/aggregate.json`
- World IDs for the re-test runs
- Instruction: "**Phase 1 ONLY** — evaluate all scenarios, write real llm_judge
  scores to re-test result files. Same rubric as baseline evaluation."

#### 7b. Compare real vs real

1. Read baseline scores from `eval-results/runs/aggregate.json`
2. Read new scores from `eval-results/runs-new/aggregate.json`
   — Both now have real llm_judge scores (not 50.0 stubs).
3. Read fixes list from `eval-results/fixes.json`
4. Compare per-layer and per-sub-metric deltas between baseline and new scores

#### 7c. Smart Attribution & Selective Revert

For each fix, reason about its impact:
- What metric layer did it target?
- Did that layer improve, stay flat, or regress?
- Did any OTHER layer regress after this fix was applied?
- Could the regression be caused by this fix (based on what files it changed)?

Classify each fix:
- **KEEP**: The targeted metric improved and no other metric significantly regressed
- **REVERT**: The targeted metric didn't improve OR another metric regressed and this fix is the likely cause
- **NEUTRAL**: No measurable impact either way → KEEP (benefit of the doubt)

**Self-improvement commit validation**: For any fix that modified `.claude/agents/agent-loop-judge.md`:
1. Read the new version of the file
2. Verify these are UNCHANGED:
   - `model: opus` in frontmatter
   - "What you MUST NOT change" section exists and is intact
   - Tool access list is unchanged
3. If any safety constraint was removed → **REVERT** that fix regardless of score impact
4. If only rubric/strategy/heuristics changed → classify normally based on scores

If any fixes should be reverted:
```python
from scripts.run_agent_loop import revert_fixes
# SHAs must be in reverse chronological order (newest first) for clean reverts
bad_shas = ["sha_newest", "sha_older"]
revert_fixes(bad_shas, "Reverted fixes #N, #M: [reasoning for each]")
```

If NO fixes need reverting, mark all as kept:
```python
from scripts.run_agent_loop import mark_all_kept
mark_all_kept()
```

Use helpers from `scripts/run_agent_loop.py`:
```python
from scripts.run_agent_loop import (
    commit_fix, revert_fixes, load_fixes, clear_fixes, mark_all_kept,
    log_iteration, save_all_best_scores, save_iteration_state,
    get_current_set_index, get_no_progress_count,
    generate_summary,
)
```

### 7b. Graduation Check
If the new average score is >= 70:
- Print: "Current set averaging {avg:.1f} — above graduation threshold (70)."

**SINGLE-RUN MODE**: Print "Ready to graduate. Type `/agent_loop advance` to switch, or keep iterating." STOP and wait for user input.

**AUTONOMOUS MODE**: Print "Graduation threshold reached. Logging and continuing." Continue to next iteration — do NOT stop.

### 8. Log & Save State

```python
from scripts.run_agent_loop import (
    load_fixes, log_iteration, save_iteration_state,
    save_all_best_scores, get_current_set_index, get_no_progress_count,
)

fixes = load_fixes()
kept_count = sum(1 for f in fixes if f.get("status") == "kept")
no_progress = get_no_progress_count()

if kept_count == 0:
    no_progress += 1
else:
    no_progress = 0

log_iteration(
    iteration=ITERATION,
    results=new_results,
    prev_results=baseline_results,
    fixes=fixes,
    seed=SEED,
)
save_iteration_state(
    iteration=ITERATION,
    seed=SEED,
    set_index=get_current_set_index(),
    results=new_results,
    fixes=fixes,
    no_progress_count=no_progress,
)
if kept_count > 0:
    save_all_best_scores(new_results)
```

### 9. No-Progress Guard & Cleanup

If `no_progress_count >= 2` (2 consecutive loops with 0 kept fixes):
**HARD STOP**. Restore to the last successful iteration's tag:
```bash
git reset --hard agent-loop-iter-${LAST_SUCCESSFUL}-start
```
Print a summary of what was attempted across the last 2 iterations and why nothing worked. Halt the loop.

**Then**: If more iterations remain (autonomous mode) and `no_progress_count < 2`, go back to step 0.

### 10. End-of-Loop Report

After all iterations are complete (or the loop stopped due to no_progress_count >= 2):

1. Generate the data report:
```python
from scripts.run_agent_loop import generate_summary
generate_summary()
```
This creates `eval-results/loop-summary.md` with score progression, per-metric trends, and per-fix attribution tables.

2. Read `eval-results/loop-summary.md` and enrich it with deep analysis:
   - **What's Working Well & Why**: For each kept fix, explain:
     - Which specific code change caused the improvement (file, line, what changed)
     - Which metric moved and by how much
     - The causal theory — WHY this change worked
     - Fragility assessment — is this robust or could it regress?
   - **What's Still Stuck**: Metrics that didn't improve, reverted fixes and why they failed
   - **Learnings**: Key takeaways for future runs

3. Append positive findings to `.claude/agent-improve-learnings.md`:
   For each verified positive change (kept fix), add an entry:
   ```
   ### [YYYY-MM-DD] [category] short-title
   - Finding: one-sentence description
   - Why it works: causal explanation of the mechanism
   - Protect: what should not be changed and why
   - Status: VERIFIED YYYY-MM-DD
   ```

### 10b. Graduate Verified Learnings

After updating the learnings ledger, scan for VERIFIED entries that represent permanent rules and promote them into skills/prompts:

1. Read `.claude/agent-improve-learnings.md`
2. For each `VERIFIED` entry:
   - **Skip** if the entry is eval-specific (category `eval` or `sdk`) — these stay in the ledger
   - **Skip** if verified less than 1 iteration ago (too fresh — wait for confirmation)
   - **Graduate**: Determine the target file:
     - `prompt` category → `apps/claude-agent/src/agent/prompts/base.py` or relevant skill
     - `performance` category → relevant skill or `base.py` workflow section
     - `ux` category → relevant skill or prompt
     - `anti-pattern` category → relevant skill or judge rubric
   - Read the target file, find the appropriate section, and append the knowledge in the style of existing content
   - Remove the entry from the ledger
   - Commit: `commit_fix(N, [target_file, ".claude/agent-improve-learnings.md"], "knowledge-graduation", "Graduated VERIFIED learning: {short-title} into {target_file}")`

3. Print summary: "Graduated N learnings into skills/prompts. M entries remain in ledger."

## Arguments
$ARGUMENTS
