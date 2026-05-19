---
description: Research domain changes and propagate knowledge across the agent improvement ecosystem
model: opus
---

# Agent Learn: Knowledge Injection for Agent Ecosystem

Teach the agent improvement ecosystem about domain changes — new features, redesigned systems, or updated schemas. Uses a 3-phase workflow: research the change, plan the knowledge propagation, implement the plan.

## Usage
- `/agent_learn research "description of what changed"` — research the change, find all affected files, produce research doc
- `/agent_learn plan thoughts/shared/research/YYYY-MM-DD-*.md` — read research doc, produce implementation plan
- `/agent_learn implement thoughts/shared/plans/YYYY-MM-DD-*.md` — execute the plan (delegates to /implement_plan)

## Mode Detection

Parse `$ARGUMENTS` to determine mode:
- Starts with `research` → RESEARCH MODE
- Starts with `plan` → PLAN MODE
- Starts with `implement` → IMPLEMENT MODE
- Empty or unrecognized → print usage and stop

---

## RESEARCH MODE

> **If the change description includes a UUID (e.g. `019dddaa-dcc9-7b50-9a27-f665327bfed0`) — fetch + analyze that trace FIRST using the "Mandatory: Trace ID auto-analysis" rule in the root [CLAUDE.md](../../CLAUDE.md). Trace evidence is usually the source of the change being researched, and skipping the fetch means researching the wrong thing.**

**Goal:** Understand what changed, discover all files across the 5-tier knowledge system that need updating, and produce a research document.

### The 5 Tiers
Every domain change can affect files in these tiers:

1. **Agent Knowledge** — what the game agent knows how to do

   - **Recipe-shaped trace** (failure tied to one canonical game shape:
     TDM, duel, racing, melee arena, NPC world, platformer, etc.) →
     `apps/claude-agent/.claude/skills/game-recipes/<recipe>.md`
   - **Cross-cutting trace** (gotcha that applies to many shapes:
     score.modify identifier, restart-trigger races, VFX position
     lanes, missing operator, melee binding mismatch, etc.) →
     `apps/claude-agent/.claude/skills/fix-knowledge/SKILL.md`
   - **Domain knowledge** (canonical engine fact about a subsystem) →
     `apps/claude-agent/.claude/skills/<domain>/SKILL.md` (one of 16
     skills: triggers, game-modules, ui-widgets, spawn-vfx,
     attachments, environment, geometry, npcs, vehicles, terrain,
     audio-3d-models, mechanics, game-examples, game-runtime-system,
     game-recipes, fix-knowledge)
   - **Workflow / communication / response-format change** →
     `apps/claude-agent/src/agent/prompts/base.py` (NOT recipes — those
     are skills now)
   - **Schema / prefab template change** →
     `apps/claude-agent/src/agent/prompts/schemas.py`

   ⚠️ NEVER add new trace-driven bullets to `prompts/base.py` or
   `system_prompt.py`. The prompt is for workflow + always-needed
   anchors only. Trace knowledge ALWAYS lands in a skill.

2. **Eval System** — how we measure quality
   - `apps/claude-agent/src/eval/scenarios.py` (prompt pools, scenario types)
   - `apps/claude-agent/src/eval/game_def_audit.py` (structural + scenario checks, keyword classification)
   - `apps/claude-agent/src/eval/rule_checks.py` (trace metric thresholds)
   - `apps/claude-agent/src/eval/speed_metrics.py` (timing thresholds)
   - `apps/claude-agent/src/eval/utils.py` (tool name list)

3. **Judge Agent** — how quality is evaluated qualitatively
   - `.claude/agents/agent-loop-judge.md` (rubric, deep knowledge, scenario adjustments)
   - `.claude/agent-improve-learnings.md` (accumulated findings)
   - `.claude/agents/agent-loop-file-map.md` (file inventory)

4. **Agent Improver** — how we test and analyze
   - `.claude/agents/agent-improver.md` (anti-pattern list, correctness metrics)
   - `.claude/commands/agent_improve.md` (modes, execution steps)

5. **Orchestration** — how the loop runs
   - `.claude/commands/agent_loop.md` (workflow steps)
   - `apps/claude-agent/scripts/run_agent_loop.py` (helpers)

### Research Workflow

1. **Parse the change description** from arguments (everything after "research")

2. **Explore the change in the codebase:**
   Spawn parallel sub-agents:

   a. **codebase-analyzer**: "Research what changed in the codebase regarding: {description}. Read the relevant source files (packages/shared/, apps/server/src/, apps/client1/src/). Document the current implementation — what interfaces exist, what schemas are defined, what the runtime behavior is. Return file paths and key code snippets."

   b. **codebase-pattern-finder**: "Find all references to concepts related to: {description}. Search across: agent prompts (apps/claude-agent/src/agent/prompts/), skills (.claude/skills/), eval system (apps/claude-agent/src/eval/), judge agent (.claude/agents/), MCP tools (apps/claude-agent/src/mcp/). Return every file that mentions these concepts with the relevant lines."

3. **For each file found, assess impact:**
   - Does this file contain knowledge that is now stale?
   - Does it reference concepts, schemas, or behaviors that changed?
   - Does it need new information added (new scenario type, new module, new tool)?
   - Classify as: NEEDS_UPDATE, NEEDS_NEW_CONTENT, NO_CHANGE

4. **Write research document** to `thoughts/shared/research/YYYY-MM-DD-agent-learn-{topic}.md`:

   Use this structure:
   ```
   ---
   date: [ISO timestamp]
   researcher: Claude
   topic: "Agent Learn: {description}"
   tags: [agent-learn, knowledge-injection, {domain-tags}]
   status: complete
   ---

   # Agent Learn Research: {description}

   ## Change Summary
   [What changed in the codebase and why]

   ## Codebase Analysis
   [Current implementation details with file:line references]

   ## Affected Files by Tier

   ### Tier 1: Agent Knowledge
   | File | Status | What needs changing |
   |------|--------|-------------------|
   | path/to/file | NEEDS_UPDATE / NEEDS_NEW_CONTENT / NO_CHANGE | Description |

   Tier 1 destination cheat-sheet (Phase 6 routing):
   - Recipe-shaped fix → `apps/claude-agent/.claude/skills/game-recipes/<recipe>.md`
   - Cross-cutting trace fix → `apps/claude-agent/.claude/skills/fix-knowledge/SKILL.md`
   - Domain knowledge → `apps/claude-agent/.claude/skills/<domain>/SKILL.md`
   - Workflow/communication only → `apps/claude-agent/src/agent/prompts/base.py`
   - Schema/template only → `apps/claude-agent/src/agent/prompts/schemas.py`
   ⚠️ NEVER add new trace-driven bullets to `prompts/base.py` or `system_prompt.py`.

   ### Tier 2: Eval System
   [same table format]

   ### Tier 3: Judge Agent
   [same table format]

   ### Tier 4: Agent Improver
   [same table format]

   ### Tier 5: Orchestration
   [same table format]

   ## Cross-Domain Dependencies Discovered
   [Connections found between different tiers/skills]

   ## Recommended Priority
   [Which tiers are most critical to update first]
   ```

5. **Present summary to developer** with the research doc path and a brief overview of which tiers are affected.

---

## PLAN MODE

**Goal:** Read the research document and produce an implementation plan for propagating the knowledge.

### Plan Workflow

1. **Read the research document** provided as argument (full read, no limit/offset)

2. **For each NEEDS_UPDATE / NEEDS_NEW_CONTENT file**, determine the specific changes:
   - Read the current file content
   - Based on the research findings, draft the exact additions/modifications
   - For skills: what new sections, rules, or examples to add
   - For eval: what new keywords, checks, or thresholds to add
   - For judge: what new rubric guidance or deep knowledge to add
   - For scenarios: what new prompt pools or scenario types to add (pattern-match from existing ones — read `scenarios.py` to see how current types are structured and replicate the pattern)

3. **Write implementation plan** to `thoughts/shared/plans/YYYY-MM-DD-agent-learn-{topic}.md` following the standard plan template:
   - Phase per tier (only tiers that need changes)
   - Specific file edits with before/after
   - Success criteria per phase
   - Ordered by priority (agent knowledge first, then eval, then judge)

4. **Present plan summary** to developer with the plan doc path.

---

## IMPLEMENT MODE

**Goal:** Execute the plan. Delegates to `/implement_plan`.

### Workflow

1. Read the plan path from arguments
2. Invoke: `Skill("implement_plan", args="{plan_path}")`

That's it. The plan document contains all the tier-specific instructions.

---

## Arguments
$ARGUMENTS
