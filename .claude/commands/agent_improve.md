---
description: Run autonomous agent evaluation — test, profile traces, analyze performance, and propose improvements
model: opus
---

# Agent Improve

You are orchestrating an autonomous agent evaluation and improvement cycle for the in-game AI agent. This covers both output quality AND performance efficiency.

## Phase 0: Load Context (MANDATORY — run before ANY mode)

> **If the user pasted a UUID (e.g. `019dddaa-dcc9-7b50-9a27-f665327bfed0`) — treat it as a LangSmith trace ID and follow the "Mandatory: Trace ID auto-analysis" rule in the root [CLAUDE.md](../../CLAUDE.md) BEFORE running the steps below. Do not skip the fetch.**

Before doing anything else, always execute these two steps:

1. **Load Deep Agent skill**: `Skill("langchain-deep-agent")` — gives you deep understanding of DeepAgentClient, create_deep_agent(), ChatAnthropic with adaptive thinking, astream() streaming, middleware (ModelRetryMiddleware, ToolMetricsMiddleware), LangGraph traces, and known issues. This is essential for interpreting LangSmith traces correctly.

2. **Read learnings ledger**: Read `.claude/agent-improve-learnings.md` — contains findings from previous `/agent_improve` runs. Use this to:
   - Skip re-discovering known issues (check OPEN and FIX_APPLIED entries)
   - Detect regressions (if a VERIFIED fix is now failing again)
   - Focus on genuinely new findings

After Phase 0, proceed to the mode-specific execution below.

## Prerequisites Check

Before starting, verify:
1. LangSmith credentials are configured — verify `.env` has `LANGSMITH_API_KEY` set:
   ```bash
   python -c "from dotenv import load_dotenv; load_dotenv(); import os; print('OK' if os.environ.get('LANGSMITH_API_KEY') else 'MISSING')"
   ```
2. For test modes: The in-game agent is running: `curl -s http://localhost:8000/api/claude-agent/ | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Agent running: {d[\"session_count\"]} sessions')"` — if this fails, tell the user to run `pnpm dev:agent` first.

## Mode Detection

Parse the arguments to determine which mode to run:

### `/agent_improve` (no args) — Full Evaluation
- Run a COMPREHENSIVE evaluation: test 5-8 diverse game types, fetch traces, profile performance, analyze quality, create improvement plan

### `/agent_improve test <area>` — Targeted Testing
- Design 3-5 test prompts focused on the specified area
- Run tests, fetch traces, profile, analyze, create plan

### `/agent_improve analyze` — Analyze Recent Runs
- NO new tests — analyze existing LangSmith traces
- Fetch the most recent 5-10 root runs from `not-ai-game` project
- Profile each trace with `analyze_trace.py`
- Compare across runs, identify patterns, propose improvements

### `/agent_improve analyze <trace-id>` — Analyze Specific Trace
- Fetch the full span tree for the given trace ID
- Run deep performance profiling with `analyze_trace.py`
- Present detailed breakdown and recommendations

### `/agent_improve compare` — Compare Recent Runs
- Fetch the most recent 5-10 root runs
- Build a comparison table (duration, tokens, cost, cache efficiency)
- Identify outliers and patterns
- No improvement plan — just the comparison report

### Trace Filtering (applies to analyze and compare modes)
When used with Cloud Oracle, traces can be filtered by worker metadata:
- `--worker <worker-id>` — Filter traces tagged with `oracle:<worker-id>`
- `--branch <branch-name>` — Filter traces tagged with `branch:<branch-name>`
- `--issue <issue-id>` — Filter traces tagged with `issue:<issue-id>`

Example: `/agent_improve analyze --worker worker-1` to analyze only traces from a specific oracle worker.

## Execution (Test & Improve / Full Evaluation)

0. **Phase 0**: Load `langchain-deep-agent` skill and read `.claude/agent-improve-learnings.md`
1. **Design test prompts** — Write them to `thoughts/shared/research/YYYY-MM-DD-agent-eval-[topic].md`
2. **Create workspace directories**:
   ```bash
   mkdir -p game_data/worlds/prompt-eval-001/game
   ```
3. **Run each test** sequentially:
   ```bash
   python apps/claude-agent/scripts/run_test_prompt.py \
     --world-id prompt-eval-NNN \
     --prompt "user prompt here" \
     --new-chat \
     --timeout 300
   ```
4. **Fetch & save traces** — For each test, fetch the complete trace:
   ```bash
   python apps/claude-agent/scripts/fetch_trace.py --world-id <world_id> > /tmp/trace_<world_id>.json
   ```
5. **Agent reasoning** — Already included in the trace JSON. Find LLM spans (`run_type: "llm"`, name `"ChatAnthropic"`). Thinking blocks are nested at: `outputs.generations[0][0].message.kwargs.content[]` — look for items with `"type": "thinking"`, the reasoning is in the `thinking` field. **Read these carefully** — they reveal:
   - Why the agent chose a specific approach (e.g. terrain vs splat, game type interpretation)
   - Where the agent hesitated or considered alternatives
   - Misunderstandings of the user prompt or game requirements
   - Whether the agent followed the workflow order from the system prompt
   - Decision-making errors that led to wrong outputs (wrong theme, missing features)
   This is the most valuable signal for prompt improvements — it shows the agent's internal logic.
6. **Profile each trace**:
   ```bash
   python apps/claude-agent/scripts/analyze_trace.py --file /tmp/trace_<world_id>.json
   ```
   Or piped: `python apps/claude-agent/scripts/fetch_trace.py --world-id <id> | python apps/claude-agent/scripts/analyze_trace.py --stdin`
8. **Cross-run comparison** — Build a table comparing all runs
9. **Read current prompts** — `apps/claude-agent/src/agent/system_prompt.py` and prompt chunks
9. **Write analysis** to `thoughts/shared/research/YYYY-MM-DD-agent-eval-[topic].md`
10. **Create improvement plan** — follow `/create_plan` process

## Execution (Analyze / Compare modes)

0. **Phase 0**: Load `langchain-deep-agent` skill and read `.claude/agent-improve-learnings.md`
1. **Fetch traces** — For each trace ID or world_id:
   ```bash
   python apps/claude-agent/scripts/fetch_trace.py --id <trace_id> > /tmp/trace_<n>.json
   ```
   For tag-based filtering (`--worker`, `--branch`, `--issue`): use the world_ids from the specific runs.
2. **Agent reasoning** — In the trace JSON, LLM spans (`"ChatAnthropic"`) have thinking at: `outputs.generations[0][0].message.kwargs.content[]` — look for items with `"type": "thinking"`, reasoning is in the `thinking` field.
3. **Profile** — pipe each trace through analyzer:
   ```bash
   python apps/claude-agent/scripts/analyze_trace.py --file /tmp/trace_<n>.json
   ```
4. **Present results** — performance report or comparison table

## Learnings Ledger Update

After completing analysis (all modes), update `.claude/agent-improve-learnings.md`:

1. **Append NEW findings** — each entry is exactly 3 lines:
   ```
   ### [YYYY-MM-DD] [category] short-title
   - Finding: one-sentence description of what was discovered
   - Status: OPEN
   ```
   Categories: `prompt`, `performance`, `ux`, `sdk`, `regression`, `anti-pattern`

2. **Promote past fixes** — if this run confirms a FIX_APPLIED entry is working:
   ```
   - Status: VERIFIED 2026-03-29
   ```

3. **Flag regressions** — if a VERIFIED entry is failing again:
   ```
   - Status: OPEN (regression — was VERIFIED 2026-03-28, now failing again)
   ```

4. **Prune** — if ledger exceeds 50 entries, remove the oldest VERIFIED entries

5. **Do NOT duplicate** — check if a finding already exists before appending

## Output Format

When complete, present:

```
Agent Evaluation Complete

Mode: [test/analyze/compare]
Runs Analyzed: N
Area: [specific area or "comprehensive" or "recent runs"]

Performance Summary:
- Avg duration: Xs | Avg tokens: N | Avg cost: $X
- Cache efficiency: X% (range: X%-X%)
- Top bottleneck: [category] at X% of total time

Key Findings:
- [Finding 1 with trace evidence]
- [Finding 2 with trace evidence]
- [Finding 3 with trace evidence]

Improvement Plan: thoughts/shared/plans/YYYY-MM-DD-agent-improvements-[topic].md

Top 3 Proposed Changes:
1. [Highest impact change — estimated savings]
2. [Second highest]
3. [Third highest]
```

ARGUMENTS: $ARGUMENTS
