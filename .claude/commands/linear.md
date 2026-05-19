---
description: Manage Linear tickets - create, update, comment, and follow workflow patterns
---

# Linear - Ticket Management

You are tasked with managing Linear tickets, including creating tickets from thoughts documents, updating existing tickets, and following the team's specific workflow patterns.

## Initial Setup

First, verify that Linear MCP tools are available by checking if any `mcp__linear__` tools exist. If not, respond:
```
I need access to Linear tools to help with ticket management. Please run the `/mcp` command to enable the Linear MCP server, then try again.
```

If tools are available, respond based on the user's request:

### For general requests:
```
I can help you with Linear tickets. What would you like to do?
1. Create a new ticket from a thoughts document
2. Add a comment to a ticket (I'll use our conversation context)
3. Search for tickets
4. Update ticket status or details
```

### For specific create requests:
```
I'll help you create a Linear ticket from your thoughts document. Please provide:
1. The path to the thoughts document (or topic to search for)
2. Any specific focus or angle for the ticket (optional)
```

Then wait for the user's input.

## Team Workflow & Status Progression

The team follows this workflow:

1. **Backlog** → All new tickets start here
2. **Todo** → Ticket is ready to be worked on
3. **In Progress** → Active development
4. **In Review** → PR submitted, under code review
5. **Spec** → Needs specification/clarification
6. **Done** → Completed

**Key principle**: Use `thoughts/` documents for research and planning before moving to "In Progress".

## Important Conventions

### URL Mapping for Thoughts Documents
When referencing thoughts documents, provide GitHub links using the `links` parameter:
- `thoughts/shared/...` → `https://github.com/AiNotAGame/not-ai-game-v2/blob/main/thoughts/shared/...`

### Default Values
- **Status**: Always create new tickets in "Backlog" status
- **Project**: Default to "Launch Closed Alpha" (ID: 436105bc-e7b4-4d12-9720-230dcb2f5f76) unless told otherwise
- **Priority**: Default to Medium (3) for most tasks, use best judgment or ask user
  - Urgent (1): Critical blockers, security issues
  - High (2): Important features with deadlines, major bugs
  - Medium (3): Standard implementation tasks (default)
  - Low (4): Nice-to-haves, minor improvements
- **Links**: Use the `links` parameter to attach URLs (not just markdown links in description)

### Automatic Label Assignment
Automatically apply labels based on the ticket content:
- **Back**: For tickets about `apps/server/` (backend/server code)
- **Front**: For tickets about `apps/client1/` (frontend/client code)
- **Research**: For tickets requiring investigation before implementation
- **Bug**: For bug fixes
- **Feature**: For new features
- **Improvement**: For enhancements to existing features

## Action-Specific Instructions

### 1. Creating Tickets from Thoughts

#### Steps to follow after receiving the request:

1. **Locate and read the thoughts document:**
   - If given a path, read the document directly
   - If given a topic/keyword, search thoughts/ directory using Grep to find relevant documents
   - If multiple matches found, show list and ask user to select
   - Create a TodoWrite list to track: Read document → Analyze content → Draft ticket → Get user input → Create ticket

2. **Analyze the document content:**
   - Identify the core problem or feature being discussed
   - Extract key implementation details or technical decisions
   - Note any specific code files or areas mentioned
   - Look for action items or next steps
   - Identify what stage the idea is at (early ideation vs ready to implement)
   - Take time to ultrathink about distilling the essence of this document into a clear problem statement and solution approach

3. **Check for related context (if mentioned in doc):**
   - If the document references specific code files, read relevant sections
   - If it mentions other thoughts documents, quickly check them
   - Look for any existing Linear tickets mentioned

4. **Get Linear workspace context:**
   - List teams: `mcp__linear__list_teams`
   - If multiple teams, ask user to select one
   - List projects for selected team: `mcp__linear__list_projects`

5. **Draft the ticket summary:**
   Present a draft to the user:
   ```
   ## Draft Linear Ticket

   **Title**: [Clear, action-oriented title]

   **Description**:
   [2-3 sentence summary of the problem/goal]

   ## Key Details
   - [Bullet points of important details from thoughts]
   - [Technical decisions or constraints]
   - [Any specific requirements]

   ## Implementation Notes (if applicable)
   [Any specific technical approach or steps outlined]

   ## References
   - Source: `thoughts/[path/to/document.md]` ([View on GitHub](converted GitHub URL))
   - Related code: [any file:line references]
   - Parent ticket: [if applicable]

   ---
   Based on the document, this seems to be at the stage of: [ideation/planning/ready to implement]
   ```

6. **Interactive refinement:**
   Ask the user:
   - Does this summary capture the ticket accurately?
   - Which project should this go in? [show list]
   - What priority? (Default: Medium/3)
   - Any additional context to add?
   - Should we include more/less implementation detail?
   - Do you want to assign it to yourself?

   Note: Ticket will be created in "Triage" status by default.

7. **Create the Linear ticket:**
   ```
   mcp__linear__create_issue with:
   - title: [refined title]
   - description: [final description in markdown]
   - teamId: [selected team]
   - projectId: [use default project from above unless user specifies]
   - priority: [selected priority number, default 3]
   - stateId: [Triage status ID]
   - assigneeId: [if requested]
   - labelIds: [apply automatic label assignment from above]
   - links: [{url: "GitHub URL", title: "Document Title"}]
   ```

8. **Post-creation actions:**
   - Show the created ticket URL
   - Ask if user wants to:
     - Add a comment with additional implementation details
     - Create sub-tasks for specific action items
     - Update the original thoughts document with the ticket reference
   - If yes to updating thoughts doc:
     ```
     Add at the top of the document:
     ---
     linear_ticket: [URL]
     created: [date]
     ---
     ```

## Example transformations:

### From verbose thoughts:
```
"I've been thinking about how our resumed sessions don't inherit permissions properly.
This is causing issues where users have to re-specify everything. We should probably
store all the config in the database and then pull it when resuming. Maybe we need
new columns for permission_prompt_tool and allowed_tools..."
```

### To concise ticket:
```
Title: Fix resumed sessions to inherit all configuration from parent

Description:

## Problem to solve
Currently, resumed sessions only inherit Model and WorkingDir from parent sessions,
causing all other configuration to be lost. Users must re-specify permissions and
settings when resuming.

## Solution
Store all session configuration in the database and automatically inherit it when
resuming sessions, with support for explicit overrides.
```

### 2. Adding Comments and Links to Existing Tickets

When user wants to add a comment to a ticket:

1. **Determine which ticket:**
   - Use context from the current conversation to identify the relevant ticket
   - If uncertain, use `mcp__linear__get_issue` to show ticket details and confirm with user
   - Look for ticket references in recent work discussed

2. **Format comments for clarity:**
   - Attempt to keep comments concise (~10 lines) unless more detail is needed
   - Focus on the key insight or most useful information for a human reader
   - Not just what was done, but what matters about it
   - Include relevant file references with backticks and GitHub links

3. **File reference formatting:**
   - Wrap paths in backticks: `thoughts/shared/example.md`
   - Add GitHub link after: `([View](url))`
   - Do this for both thoughts/ and code files mentioned

4. **Comment structure example:**
   ```markdown
   Implemented retry logic in webhook handler to address rate limit issues.

   Key insight: The 429 responses were clustered during batch operations,
   so exponential backoff alone wasn't sufficient - added request queuing.

   Files updated:
   - `apps/server/webhooks/handler.go` ([GitHub](link))
   - `thoughts/shared/rate_limit_analysis.md` ([GitHub](link))
   ```

5. **Handle links properly:**
   - If adding a link with a comment: Update the issue with the link AND mention it in the comment
   - If only adding a link: Still create a comment noting what link was added for posterity
   - Always add links to the issue itself using the `links` parameter

6. **For comments with links:**
   ```
   # First, update the issue with the link
   mcp__linear__update_issue with:
   - id: [ticket ID]
   - links: [existing links + new link with proper title]

   # Then, create the comment mentioning the link
   mcp__linear__create_comment with:
   - issueId: [ticket ID]
   - body: [formatted comment with key insights and file references]
   ```

7. **For links only:**
   ```
   # Update the issue with the link
   mcp__linear__update_issue with:
   - id: [ticket ID]
   - links: [existing links + new link with proper title]

   # Add a brief comment for posterity
   mcp__linear__create_comment with:
   - issueId: [ticket ID]
   - body: "Added link: `path/to/document.md` ([View](url))"
   ```

### 3. Searching for Tickets

When user wants to find tickets:

1. **Gather search criteria:**
   - Query text
   - Team/Project filters
   - Status filters
   - Date ranges (createdAt, updatedAt)

2. **Execute search:**
   ```
   mcp__linear__list_issues with:
   - query: [search text]
   - teamId: [if specified]
   - projectId: [if specified]
   - stateId: [if filtering by status]
   - limit: 20
   ```

3. **Present results:**
   - Show ticket ID, title, status, assignee
   - Group by project if multiple projects
   - Include direct links to Linear

### 4. Updating Ticket Status

When moving tickets through the workflow:

1. **Get current status:**
   - Fetch ticket details
   - Show current status in workflow

2. **Suggest next status:**
   - Backlog → Todo (ticket is ready to work on)
   - Todo → In Progress (work started)
   - In Progress → In Review (PR submitted)
   - In Review → Done (PR merged)
   - Any → Spec (needs more detail/clarification)

3. **Update with context:**
   ```
   mcp__linear__update_issue with:
   - id: [ticket ID]
   - stateId: [new status ID]
   ```

   Consider adding a comment explaining the status change.

## Important Notes

- Tag users in descriptions and comments using `@[name](ID)` format, e.g., `@[dex](16765c85-2286-4c0f-ab49-0d4d79222ef5)`
- Keep tickets concise but complete - aim for scannable content
- All tickets should include a clear "problem to solve" - if the user asks for a ticket and only gives implementation details, you MUST ask "To write a good ticket, please explain the problem you're trying to solve from a user perspective"
- Focus on the "what" and "why", include "how" only if well-defined
- Always preserve links to source material using the `links` parameter
- Don't create tickets from early-stage brainstorming unless requested
- Use proper Linear markdown formatting
- Include code references as: `path/to/file.ext:linenum`
- Ask for clarification rather than guessing project/status
- Remember that Linear descriptions support full markdown including code blocks
- Always use the `links` parameter for external URLs (not just markdown links)
- remember - you must get a "Problem to solve"!

## Comment Quality Guidelines

When creating comments, focus on extracting the **most valuable information** for a human reader:

- **Key insights over summaries**: What's the "aha" moment or critical understanding?
- **Decisions and tradeoffs**: What approach was chosen and what it enables/prevents
- **Blockers resolved**: What was preventing progress and how it was addressed
- **State changes**: What's different now and what it means for next steps
- **Surprises or discoveries**: Unexpected findings that affect the work

Avoid:
- Mechanical lists of changes without context
- Restating what's obvious from code diffs
- Generic summaries that don't add value

Remember: The goal is to help a future reader (including yourself) quickly understand what matters about this update.

## Commonly Used IDs

### AI Games Team
- **Team ID**: `b82e6390-ddec-40c0-a75d-4c28c060cd07`

### Label IDs
- **Bug**: `befbf45c-305b-458d-b2ce-2b406190c1a1`
- **Feature**: `44a5dcc7-7554-4a09-8396-49d104241710`
- **Improvement**: `ac27ac76-bc4d-4272-870c-1d17dff38ee5`
- **Research**: `71a5d677-7413-4913-860b-6550be99a12d`
- **Front**: `98478d61-b0f6-4ed9-9deb-2287f01a3afe`
- **Back**: `52a6b1fd-a3af-4d86-bac8-8a5a699aea49`
- **Design**: `84450e5f-cb1c-4faf-bdfa-c978afb26d01`

### Workflow State IDs
- **Backlog**: `39f198f4-dd32-4c9a-be24-e2e61fbc60e4` (type: backlog)
- **Todo**: `2fab7f0e-2f1b-43ce-8b46-09f2c05fce98` (type: unstarted)
- **In Progress**: `7cd0a5c3-479f-4323-95a0-5ada15c95dfd` (type: started)
- **In Review**: `7f20a980-f37e-4b95-abe9-6665a72ae594` (type: started)
- **Spec**: `a5f423b4-7895-4cf2-b19c-c3312e6a244f` (type: completed)
- **Done**: `c90c19c3-080e-43d0-8b62-000ae795cbc7` (type: completed)
- **Duplicate**: `4597e2dc-a7c4-4879-8608-c74aa0ec9caf` (type: canceled)
- **Canceled**: `ca97afc6-ea53-4275-a173-87ed5bf60837` (type: canceled)

### Project IDs
- **Launch Closed Alpha**: `436105bc-e7b4-4d12-9720-230dcb2f5f76` (default)
- **NPC with AI**: `6a304756-3149-44dd-8a55-00bc8582eb7e`
- **Improve AI-agent quality/cost/speed**: `2ab25185-e9a5-4152-abfb-9e4991698609`
- **Main character / Animations**: `b60b82f7-6ac3-460d-831b-5dba44e2b04b`
- **3D Splats**: `4193688b-80a1-4aaf-98f8-151b11fc4f3d`
- **Redesign**: `6c4bea7d-9239-4cd8-aab2-d00b4997ad65`
- **Server architecture refactoring**: `c0c93bac-8471-4450-891d-9911fce5596a`
- **Client / Modules refactor**: `7362e284-09c0-458e-9340-950a7a16e759`

## Linear User IDs

- **Ivan Kalinin** (mufnz1): `1296158e-8b1a-4c25-ab0d-6c8d9408df5a`
- **Simeon M** (rabneba2): `ed5874cc-931f-44f9-9c3e-997d208108b5`
- **Maxim Lopin** (wzzhz13): `dc616535-3764-41a2-b3a7-9ac9aafb18e2`
- **Willem Helmet Pickleman** (willemhelmet): `7aa425ba-1b78-42ae-a0a9-f01aaf3a3bdb`
- **boozybats**: `2720a6c2-eb2e-4bb1-932f-23011ace78ad`
