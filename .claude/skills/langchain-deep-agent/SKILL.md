---
name: langchain-deep-agent
description: >
  LangChain Deep Agents reference — create_deep_agent(), ChatAnthropic (adaptive thinking),
  FilesystemBackend, middleware (ModelRetryMiddleware, SummarizationMiddleware, PromptCaching),
  MemorySaver checkpointer, astream() with messages+updates, AIMessage/ToolMessage/HumanMessage,
  usage_metadata, LangSmith tracing, skills (SKILL.md progressive disclosure), subagents,
  custom @tool functions, recursion_limit, and our DeepAgentClient wrapper architecture.
  Use when building, analyzing, debugging, or improving applications on LangChain Deep Agents
  — especially apps/claude-agent/.
---

# LangChain Deep Agents Reference

Build production AI agents with LangChain Deep Agents. The framework provides planning, file management, subagents, context management, and middleware — all built on LangGraph.

## 1. Overview

**Package:** `pip install deepagents` (or `uv add deepagents`)

**Core function:** `create_deep_agent()` returns a compiled LangGraph `CompiledStateGraph`.

```python
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from langchain_anthropic import ChatAnthropic
from langgraph.checkpoint.memory import MemorySaver

model = ChatAnthropic(
    model="claude-sonnet-4-6",
    max_tokens=16000,
    thinking={"type": "adaptive"},
    effort="medium",
)

agent = create_deep_agent(
    model=model,
    tools=[my_tool_1, my_tool_2],
    system_prompt="You are a game creation agent...",
    backend=FilesystemBackend(root_dir="/path/to/workspace"),
    skills=["/path/to/skills/"],
    checkpointer=MemorySaver(),
    middleware=[ModelRetryMiddleware(max_retries=3), MyCustomMiddleware()],
)
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | `str \| BaseChatModel` | Model string (`"anthropic:claude-sonnet-4-6"`) or LangChain model instance |
| `tools` | `list[BaseTool \| Callable]` | Custom tools (plain functions or `@tool` decorated) |
| `system_prompt` | `str` | Custom system prompt (appended to built-in harness prompt) |
| `backend` | `Backend` | Virtual filesystem backend (`FilesystemBackend`, `StateBackend`, etc.) |
| `skills` | `list[str]` | Skill directory paths (contain `SKILL.md` files) |
| `checkpointer` | `BaseCheckpointSaver` | State persistence (`MemorySaver` for in-memory) |
| `middleware` | `list[AgentMiddleware]` | Custom middleware for tool/model interception |
| `subagents` | `list[dict \| CompiledSubAgent]` | Subagent definitions for task delegation |
| `memory` | `list[str]` | AGENTS.md file paths (always loaded, unlike skills) |
| `interrupt_on` | `dict[str, bool]` | Human-in-the-loop per tool |
| `response_format` | `BaseModel` | Pydantic model for structured output |

## 2. Model Configuration

### ChatAnthropic with Adaptive Thinking

For `claude-sonnet-4-6`, use adaptive thinking (NOT `budget_tokens` which is deprecated):

```python
from langchain_anthropic import ChatAnthropic

model = ChatAnthropic(
    model="claude-sonnet-4-6",
    max_tokens=16000,
    thinking={"type": "adaptive"},  # NOT {"type": "enabled", "budget_tokens": N}
    effort="medium",                # "low" | "medium" | "high"
)
```

**Effort levels:**
- `"low"` — minimal reasoning, fast (file lookups, simple edits)
- `"medium"` — balanced (routine game creation, most tasks)
- `"high"` — thorough analysis (complex debugging, multi-step problems)

**Connection resilience:** LangChain models auto-retry up to 6 times for network errors, rate limits (429), and 5xx. Adjust with `max_retries` parameter.

### Model string format

When passing a string instead of instance: `"provider:model"` format.
- `"anthropic:claude-sonnet-4-6"` — creates ChatAnthropic with defaults
- `"openai:gpt-5.2"` — creates ChatOpenAI

## 3. Running the Agent

### Invoke (blocking)

```python
result = agent.invoke(
    {"messages": [HumanMessage(content="Create a TDM game")]},
    config={
        "configurable": {"thread_id": "world-123"},
        "recursion_limit": 300,
    },
)
```

### Stream (async)

```python
async for chunk in agent.astream(
    {"messages": [HumanMessage(content=message)]},
    stream_mode=["messages", "updates"],
    version="v2",
    config={
        "metadata": {"world_id": world_id},
        "tags": [world_id],
        "recursion_limit": 300,
        "configurable": {"thread_id": world_id},
    },
):
    if chunk["type"] == "messages":
        token, metadata = chunk["data"]
        # token is AIMessage, ToolMessage, or HumanMessage
    elif chunk["type"] == "updates":
        # Graph node completions with usage_metadata
        data = chunk.get("data", {})
```

**Key config options:**
- `recursion_limit`: Max graph steps (default 25 — too low for Deep Agents with middleware). Set to 300+.
- `configurable.thread_id`: Required for checkpointer. MemorySaver uses this to maintain conversation history.
- `metadata`: Arbitrary dict passed to LangSmith traces.
- `tags`: String tags for LangSmith filtering.

### Why recursion_limit must be high

LangGraph counts each middleware wrapper as a graph node. With 7 default middleware per model call, 26 LLM calls + 33 tool calls = 59 visible steps but ~80+ internal graph nodes. Set `recursion_limit: 300` to avoid `GRAPH_RECURSION_LIMIT` errors.

## 4. Message Types

### AIMessage

Agent responses. `content` can be `str` or `list` of content blocks:

```python
from langchain_core.messages import AIMessage

if isinstance(token, AIMessage):
    content = token.content
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict):
                if block["type"] == "text":
                    print(block["text"])
                elif block["type"] == "thinking":
                    pass  # Internal reasoning (adaptive thinking)
            elif isinstance(block, str):
                print(block)
    elif isinstance(content, str):
        print(content)

    # Tool calls
    if token.tool_call_chunks:
        for tc in token.tool_call_chunks:
            name = tc.get("name")       # Tool name (first chunk only)
            tool_id = tc.get("id", "")   # Tool call ID
            args = tc.get("args")        # Args (may be chunked JSON string)
```

### ToolMessage

Tool execution results:

```python
from langchain_core.messages import ToolMessage

if isinstance(token, ToolMessage):
    tool_call_id = token.tool_call_id  # Matches tc["id"] from AIMessage
    content = token.content            # str result (may be JSON)
```

### HumanMessage

User input:

```python
from langchain_core.messages import HumanMessage

# Text only
msg = HumanMessage(content="Create a battle arena")

# Multimodal (text + images)
msg = HumanMessage(content=[
    {"type": "text", "text": "Create a game based on this image"},
    {"type": "image_url", "image_url": {"url": "https://..."}}
])
```

### Token Usage (from updates stream)

```python
if chunk["type"] == "updates":
    data = chunk.get("data", {})
    for node_name, node_output in data.items():
        if isinstance(node_output, dict):
            for msg in node_output.get("messages", []):
                if hasattr(msg, "usage_metadata") and msg.usage_metadata:
                    um = msg.usage_metadata
                    input_tokens = um.get("input_tokens", 0)
                    output_tokens = um.get("output_tokens", 0)
                    cache_read = um.get("cache_read_input_tokens", 0)
                    cache_creation = um.get("cache_creation_input_tokens", 0)
```

## 5. Built-in Tools (Harness)

Deep Agents automatically include these tools (no configuration needed):

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with line numbers, supports offset/limit and images |
| `write_file` | Create new files |
| `edit_file` | Exact string replacements in files |
| `ls` | List directory contents with metadata |
| `glob` | Find files matching patterns |
| `grep` | Search file contents (files only, content with context, or counts) |
| `write_todos` | Maintain structured task lists (planning) |
| `task` | Spawn subagents for isolated subtasks |

**Tool naming:** Plain function names. No `mcp__` prefix. Custom tools also use plain names:
- `publish_world` (not `mcp__game-tools__publish_world`)
- `meshy_create_model` (not `mcp__meshy-tools__meshy_create_model`)

### Internal tools (filtered from UI)

These are used internally by the harness and should never be shown to users:
- `write_todos` — planning tool
- `task` — subagent spawning

## 6. Custom Tools

Define tools as plain Python functions with `@tool` decorator:

```python
from langchain_core.tools import tool

@tool
def publish_world(world_id: str) -> str:
    """Publish the game world to the database."""
    result = await publish_world_to_db(world_id, game_def)
    return json.dumps(result)

@tool
def validate_workspace(world_id: str) -> str:
    """Validate all game files in the workspace."""
    validation = await validate_workspace(world_id)
    return json.dumps(validation)
```

Pass to `create_deep_agent(tools=[publish_world, validate_workspace, ...])`.

**Error handling:** Return error info as string content. The agent sees errors as data and can retry/adapt. Exceptions from tools are caught by the framework.

## 7. Middleware

### Default middleware (always active)

| Middleware | Purpose |
|-----------|---------|
| `TodoListMiddleware` | Planning via `write_todos` tool |
| `FilesystemMiddleware` | File system tools (read/write/edit/glob/grep) |
| `SubAgentMiddleware` | Subagent spawning via `task` tool |
| `SummarizationMiddleware` | Auto-summarizes when context approaches limit (~100-150k tokens) |
| `AnthropicPromptCachingMiddleware` | Automatic prompt caching for Anthropic models |
| `PatchToolCallsMiddleware` | Fixes interrupted tool calls in message history |

### Custom middleware

```python
from langchain.agents.middleware import AgentMiddleware, ModelRetryMiddleware
from langchain.agents.middleware.types import ToolCallRequest

class ToolMetricsMiddleware(AgentMiddleware):
    """Log tool call timing and success."""

    async def awrap_tool_call(self, request: ToolCallRequest, handler):
        tool_name = request.tool_call.get("name", "unknown")
        start = time.monotonic()
        try:
            result = await handler(request)
            duration_ms = int((time.monotonic() - start) * 1000)
            print(f"[ToolMetrics] {tool_name}: {duration_ms}ms")
            return result
        except Exception as e:
            print(f"[ToolMetrics] {tool_name}: ERROR: {e}")
            raise

agent = create_deep_agent(
    middleware=[
        ModelRetryMiddleware(max_retries=3),
        ToolMetricsMiddleware(),
    ],
)
```

**Available hooks:**
- `awrap_tool_call(request, handler)` — intercept tool calls
- `abefore_agent(state, runtime)` — run before each agent step
- `aafter_agent(state, runtime)` — run after each agent step

**Warning:** Do NOT mutate middleware instance attributes. Use graph state for cross-invocation tracking.

## 8. Backends

| Backend | Description | Use case |
|---------|-------------|----------|
| `StateBackend` | Ephemeral, in LangGraph state | Default, single conversation |
| `FilesystemBackend` | Local disk access | Our setup — workspace files |
| `StoreBackend` | Persistent across conversations | Long-term memory |
| `CompositeBackend` | Mix multiple backends | Ephemeral + persistent routes |

Our setup:
```python
from deepagents.backends import FilesystemBackend

backend = FilesystemBackend(root_dir=workspace_path)
```

## 9. Checkpointer & Conversation Continuity

```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()

agent = create_deep_agent(checkpointer=checkpointer, ...)

# Each invocation uses thread_id for conversation continuity
config = {"configurable": {"thread_id": world_id}}
```

The checkpointer manages conversation history automatically. Send only the new `HumanMessage` — previous messages are loaded from the checkpoint:

```python
# First message
await agent.astream(
    {"messages": [HumanMessage(content="Create a TDM game")]},
    config={"configurable": {"thread_id": "world-1"}},
)

# Second message — full history preserved via checkpointer
await agent.astream(
    {"messages": [HumanMessage(content="Add healing potions")]},
    config={"configurable": {"thread_id": "world-1"}},
)
```

## 10. Skills

Skills are `SKILL.md` files in directories. Loaded progressively — agent reads frontmatter at startup, loads full content only when relevant.

```python
agent = create_deep_agent(
    backend=FilesystemBackend(root_dir=workspace_path),
    skills=["/path/to/skills/"],
)
```

Each skill directory has a `SKILL.md` with YAML frontmatter:
```markdown
---
name: combat-mechanics
description: Weapon configs, damage, triggers, combat modules...
---
# Combat Mechanics
...detailed instructions...
```

## 11. Subagents

Delegate tasks to isolated agents (context quarantine):

```python
research_subagent = {
    "name": "research-agent",
    "description": "Research game mechanics and modules",
    "system_prompt": "You are a game research specialist...",
    "tools": [read_file, glob, grep],
    "model": "anthropic:claude-sonnet-4-6",
}

agent = create_deep_agent(subagents=[research_subagent])
```

A default `general-purpose` subagent is always available — inherits main agent's tools and skills.

## 12. LangSmith Tracing

LangGraph automatically traces to LangSmith when `LANGSMITH_API_KEY` is set. Configure via env vars:

```bash
LANGSMITH_API_KEY=ls_...
LANGSMITH_PROJECT=not-ai-game
LANGSMITH_TRACING=true
```

**Trace structure (different from old SDK):**
- Root run = full agent invocation (graph run)
- Child runs = individual LLM calls and tool executions
- LLM runs contain thinking blocks in `outputs.content` as `{"type": "thinking", "thinking": "..."}`
- Tool runs show name, inputs, outputs, duration
- Tags and metadata from config propagate to all child runs

**Key concepts:**
- `trace_id` = root run ID. All child spans share the same `trace_id`
- `run_id` = any single span. Could be root or child
- When given any ID, `fetch_trace.py` auto-detects and resolves

**Fetching traces** (via standalone CLI, uses Python langsmith SDK):
```bash
# By any run/trace ID (auto-detects root vs child)
python apps/claude-agent/scripts/fetch_trace.py --id <any_id>

# By world_id tag
python apps/claude-agent/scripts/fetch_trace.py --world-id <world_id>

# Pipe to analyzer for performance report
python apps/claude-agent/scripts/fetch_trace.py --id <id> | python apps/claude-agent/scripts/analyze_trace.py --stdin
```

**Reading agent reasoning from trace JSON:**
LangChain serializes LLM outputs in a nested structure. To find thinking blocks:
```
span.outputs.generations[0][0].message.kwargs.content[]
```
Each item in the `content` array has a `type` field:
- `"thinking"` — agent reasoning in the `thinking` field (ALWAYS read these)
- `"text"` — text response to user
- `"tool_use"` — tool call with `name` and `input`

Example: to extract all reasoning from a trace JSON file:
```python
for span in spans:
    if span["run_type"] != "llm": continue
    content = span["outputs"]["generations"][0][0]["message"]["kwargs"]["content"]
    for block in content:
        if block.get("type") == "thinking":
            print(block["thinking"])
```

## 13. Our Architecture (apps/claude-agent)

### DeepAgentClient (`src/agent/deep_agent_client.py`)

Wraps `create_deep_agent()` for game creation:

```python
@dataclass
class DeepAgentClient:
    world_id: str
    user_id: str
    cwd: str
    session_ref: Any = None

    def _create_agent(self):
        model = ChatAnthropic(
            model="claude-sonnet-4-6",
            max_tokens=16000,
            thinking={"type": "adaptive"},
            effort="medium",
        )
        tools = create_all_tools(self.world_id, session_ref=self.session_ref)
        system_prompt = build_system_prompt(self.world_id)
        self._checkpointer = MemorySaver()

        return create_deep_agent(
            model=model,
            tools=tools,
            system_prompt=system_prompt,
            backend=FilesystemBackend(root_dir=workspace_path),
            skills=[_SKILLS_DIR],
            checkpointer=self._checkpointer,
            middleware=[
                ModelRetryMiddleware(max_retries=settings.agent_max_retries),
                ToolMetricsMiddleware(world_id=self.world_id),
            ],
        )

    async def run_streamed(self, message: str | list) -> AsyncIterator[StreamEvent]:
        async for chunk in self._agent.astream(
            {"messages": [HumanMessage(content=message)]},
            stream_mode=["messages", "updates"],
            version="v2",
            config={
                "recursion_limit": 300,
                "configurable": {"thread_id": self.world_id},
            },
        ):
            # Process chunks → yield StreamEvents
            ...
```

**Key behaviors:**
- Lazy agent creation via `connect()` (early-return if already connected)
- Conversation continuity via `MemorySaver` with `thread_id=world_id`
- Internal tool filtering (`write_todos`, `task` never shown in UI)
- `ask_questions` chunked arg accumulation for QUESTION SSE events
- Auto-publish with terrain reset after `generate_terrain_features`
- Token usage extraction from `usage_metadata` on AIMessage

### Text Streaming Pattern (`_accumulated_text`)

`run_streamed()` accumulates text from `AIMessage` chunks into a local `_accumulated_text`
variable and yields `StreamEvent(type=MESSAGE, text=_accumulated_text, is_partial=False)`.
Each MESSAGE event is a **full snapshot**, not a delta.

**Reset behavior**: `_accumulated_text` resets to `""` when the next text chunk arrives
after a `ToolMessage` (tracked via `_last_was_tool_result` flag). This ensures each
"phase" (text between tool batches) starts fresh — the user only sees the latest status.

**Why this matters**: Without the reset, all intermediate status messages accumulate into
a growing wall of text. The client calls `setTextContent(event.text)` (full replacement),
so the entire accumulated blob displays each time a MESSAGE event arrives.

**Client-side handling** (`apps/client1/src/stores/agent.store.ts`):
- `is_partial=False` → `setTextContent()` — replaces last text block entirely (current path)
- `is_partial=True` → `appendTextContent()` — delta append (exists but unused by current agent)

**If you modify `run_streamed()` text handling**: Ensure the reset-on-tool-result behavior
is preserved. Test with a multi-tool-call prompt and verify the user sees only the latest
status message, not accumulated text from all prior phases.

### StreamingSession (`src/agent/streaming_session.py`)

Session lifecycle manager:
- Message queue (asyncio.Queue)
- SSE event broadcasting
- Interrupt handling
- Batched message concatenation
- Multimodal image support via `_build_message_content()`

### Custom Tools (`src/tools/`)

Plain `@tool` functions organized by domain:

| File | Tools |
|------|-------|
| `game_tools.py` | `publish_world`, `validate_workspace`, `modules_list`, `module_detail`, `workspace_stats`, `get_schemas`, `delete_file`, `focus_entity`, `reset_game` |
| `worldlabs_tools.py` | `worldlabs_generate_world`, `worldlabs_check_status` |
| `meshy_tools.py` | `meshy_create_model`, `meshy_check_status`, `meshy_rig_character`, `meshy_check_rigging_status`, `meshy_add_animation`, `meshy_check_animation_status`, `meshy_list_animations`, `meshy_compute_vehicle_params` |
| `asset_tools.py` | `skybox_generate` (fire-and-forget → `/apply-skybox` callback), `skybox_list_styles`, `texture_generate` (blocking), `generate_terrain_theme` (fire-and-forget → `/apply-terrain-theme` callback), `spell_icon_generate` (blocking) |
| `elevenlabs_tools.py` | `elevenlabs_generate_sfx` (blocking), `elevenlabs_generate_music` (fire-and-forget → `/apply-music` callback), `elevenlabs_search_voices` |
| `terrain_tools.py` | `generate_terrain_features`, `scan_terrain_summary`, `sample_terrain_height` |
| `splat_tools.py` | `sample_splat_height` |
| `questions_tool.py` | `ask_questions` |
| `npc_tools.py` | `npc_create`, `npc_check_status` |

## 14. Known Issues & Troubleshooting

### Recursion limit hit

Symptom: `GRAPH_RECURSION_LIMIT` error after ~25-80 steps.
Cause: Default `recursion_limit=25` is too low. Middleware wrappers inflate graph node count.
Fix: Set `recursion_limit: 300` in config.

### Thinking blocks not visible in LangSmith UI

LangSmith platform has no dedicated renderer for Anthropic `type: "thinking"` content blocks. They appear as raw JSON in `outputs.content`. Read thinking via API: `fetch_runs(run_type="llm", preview_chars=10000)`.

### Stale async callbacks after new-chat

Meshy/WorldLabs BullMQ callbacks keyed by `world_id` only. After "new chat" on same world, stale callbacks from previous chat can contaminate the new session.

### Tool call chunks are streamed incrementally

Tool call `args` arrive as chunked JSON strings across multiple `tool_call_chunks`. Accumulate args by `id` until `ToolMessage` arrives, then parse complete JSON.

### Summarization threshold

`SummarizationMiddleware` auto-compacts at ~100-150k tokens. Usually not triggered for typical game creation (max ~67k per call observed). If hit, older messages are summarized — planning todos and file contents may be lost from context.
