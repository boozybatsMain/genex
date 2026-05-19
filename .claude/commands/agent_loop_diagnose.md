# Agent-Loop Diagnose: Interactive Score Analysis

Spawn the agent-loop worker for interactive diagnosis of eval scores. Does NOT make changes — only analyzes and recommends.

## Usage
`/agent_loop_diagnose` — analyze latest scores interactively
`/agent_loop_diagnose path/to/scores.json` — analyze specific score file

## Workflow

1. Read the score file (default: `eval-results/runs/aggregate.json`)
2. Spawn the `agent-loop-worker` sub-agent with:
   - The full score report
   - Instructions to ONLY analyze, not edit
   - Request for: worst metric, root cause theory, proposed fix, expected impact
3. Present the agent's analysis to the user
4. Allow follow-up questions

## Arguments
$ARGUMENTS
