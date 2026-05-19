---
description: Debug issues by investigating logs, database state, and git history
---

# Debug

You are tasked with helping debug issues during manual testing or implementation. This command allows you to investigate problems by examining logs, database state, and git history without editing files.

## Initial Response

When invoked WITH a plan/ticket file:
```
I'll help debug issues with [file name]. Let me understand the current state.

What specific problem are you encountering?
- What were you trying to test/implement?
- What went wrong?
- Any error messages?

I'll investigate the logs, database, and git state to help figure out what's happening.
```

When invoked WITHOUT parameters:
```
I'll help debug your current issue.

Please describe what's going wrong:
- What are you working on?
- What specific problem occurred?
- When did it last work?

I can investigate logs, database state, and recent changes to help identify the issue.
```

## Environment Information

You have access to these key locations and tools:

**Logs**:
- Server logs: Check terminal output from `pnpm dev:server`
- Client logs: Check browser console (F12) and terminal from `pnpm dev:client`
- Build logs: `pnpm build 2>&1 | tail -100`

**Database** (Prisma/PostgreSQL):
- Location: Configured via `DATABASE_URL` in `.env`
- Can query with: `pnpm prisma studio` (GUI) or direct psql
- Check schema: `pnpm prisma db pull`

**Git State**:
- Check current branch, recent commits, uncommitted changes
- Identify what changed recently

**Service Status**:
- Server running: `lsof -i :2567`
- Client running: `lsof -i :5173`
- Storybook running: `lsof -i :6006`

## Process Steps

### Step 1: Understand the Problem

After the user describes the issue:

1. **Read any provided context** (plan or ticket file):
   - Understand what they're implementing/testing
   - Note which phase or step they're on
   - Identify expected vs actual behavior

2. **Quick state check**:
   - Current git branch and recent commits
   - Any uncommitted changes
   - When the issue started occurring

### Step 2: Check Prior Investigations

Before diving into the current state, check if similar issues have been investigated before:

```
Task - Prior Bug Research:
Use the thoughts-pattern-finder agent to search the thoughts/ directory for past investigations
of similar bugs, symptoms, or affected systems.
Include: the symptoms described by the user, affected systems/components, any error messages.
Return: Relevant prior investigations with root causes found and fixes applied.
```

This surfaces institutional memory — past root causes, fixes that worked (or didn't), and non-obvious interactions already discovered.

### Step 3: Investigate the Current State

Spawn parallel Task agents for efficient investigation:

```
Task 1 - Check Build/Type Errors:
Run build and type-check to find compilation issues:
1. pnpm type-check 2>&1 | tail -50
2. pnpm build 2>&1 | tail -50
3. pnpm lint 2>&1 | tail -50
Return: Any errors or warnings found
```

```
Task 2 - Database State:
Check the current database state:
1. Verify DATABASE_URL is set in .env
2. Check if migrations are up to date: pnpm prisma migrate status
3. Check schema for relevant tables
4. Look for data anomalies if applicable
Return: Relevant database findings
```

```
Task 3 - Git and File State:
Understand what changed recently:
1. Check git status and current branch
2. Look at recent commits: git log --oneline -10
3. Check uncommitted changes: git diff --stat
4. Verify expected files exist
Return: Git state and any file issues
```

### Step 4: Present Findings

Based on the investigation, present a focused debug report:

```markdown
## Debug Report

### What's Wrong
[Clear statement of the issue based on evidence]

### Prior Investigations
[Any similar past bugs found in thoughts/, with root causes and fixes — or "No prior investigations found"]

### Evidence Found

**From Build/Types**:
- [Error/warning with file:line]
- [Pattern or repeated issue]

**From Database**:
- [Migration status]
- [Data findings if relevant]

**From Git/Files**:
- [Recent changes that might be related]
- [File state issues]

### Root Cause
[Most likely explanation based on evidence]

### Next Steps

1. **Try This First**:
   ```bash
   [Specific command or action]
   ```

2. **If That Doesn't Work**:
   - Restart dev server: `pnpm dev`
   - Reset database: `pnpm prisma migrate reset`
   - Clear build cache: `pnpm clean && pnpm build`

### Can't Access?
Some issues might be outside my reach:
- Browser console errors (F12 in browser)
- Network tab requests
- React DevTools state
- Runtime errors only visible in browser

Would you like me to investigate something specific further?
```

## Important Notes

- **Focus on manual testing scenarios** - This is for debugging during implementation
- **Always require problem description** - Can't debug without knowing what's wrong
- **Read files completely** - No limit/offset when reading context
- **Guide back to user** - Some issues (browser console, network) are outside reach
- **No file editing** - Pure investigation only

## Quick Reference

**Build/Type Check**:
```bash
pnpm type-check
pnpm build
pnpm lint
```

**Database**:
```bash
pnpm prisma migrate status
pnpm prisma studio
pnpm prisma db pull
```

**Service Check**:
```bash
lsof -i :2567    # Server
lsof -i :3000    # Client
lsof -i :6006    # Storybook
```

**Git State**:
```bash
git status
git log --oneline -10
git diff --stat
```

Remember: This command helps you investigate without burning the primary window's context. Perfect for when you hit an issue during manual testing and need to dig into logs, database, or git state.
