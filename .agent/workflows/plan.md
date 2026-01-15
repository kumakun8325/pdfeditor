---
description: Create implementation plan and hand off to Claude
---

# Plan Workflow

Create a detailed task document that Claude Sonnet can implement immediately without additional research.

## Quality Standard

> **IMPORTANT**: The task document must be self-contained and actionable.
> Claude should NOT need to:
> - Research how existing code works
> - Figure out which files to modify
> - Decide on implementation approach
> 
> All of this must be provided in the task document.

## Steps

### 1. Deep Analysis (REQUIRED)
Before creating the task document:
- Read relevant source files
- Understand current implementation
- **Check `package.json` scripts and dependencies**
- Identify exact files and methods to modify
- Determine the implementation approach

### 2. Create GitHub Issue
```bash
gh issue create --title "feat: description" --body "..." --label "enhancement"
```
Note the issue number.

### 3. Create Detailed Task Document
Create `docs/task_[issue#]_[name].md`:

```markdown
# Task: [Title]

Issue: #XX
Status: PLANNING

## Goal
What this task accomplishes.

## Background
Context and motivation.

## Current State Analysis
- Current behavior: [describe]
- Relevant files:
  - `path/to/file.ts` - [what it does]
  - `path/to/file2.ts` - [what it does]
- Key methods/classes involved:
  - `ClassName.methodName()` - [purpose]

## Implementation Plan

### Step 1: [Description]
**File**: `src/managers/ExampleManager.ts`
**Action**: Add new method

```typescript
// Add this method after line ~50
public newMethod(param: Type): ReturnType {
  // Implementation hint
}
```

**Why**: [Explanation of why this change is needed]

### Step 2: [Description]
**File**: `src/main.ts`
**Action**: Wire up the new method

```typescript
// Find this section (~line 200)
// existing code context...

// Add this:
this.exampleManager.newMethod(arg);
```

### Step 3: [Tests]
**File**: `test/example.test.ts` (NEW)
**Test Cases**:
1. [Test case 1 description]
2. [Test case 2 description]

## Type Changes (if any)
```typescript
// In src/types/index.ts
interface ExistingType {
  // Add:
  newProperty: Type;
}
```

## Acceptance Criteria
- [ ] Criterion 1 (specific and testable)
- [ ] Criterion 2
- [ ] Tests pass

## Verification Steps
1. Run `npm run dev`
2. Open http://localhost:5173/
3. [Specific steps to test]
4. Expected result: [describe]

## Edge Cases to Handle
- [Edge case 1]
- [Edge case 2]

## NOT in Scope
- [What this task does NOT include]
```

### 4. Self-Check Before Handoff
Verify the task document answers:
- [ ] Which files to modify? (exact paths)
- [ ] What to add/change? (code snippets)
- [ ] Where in the file? (line numbers or context)
- [ ] Why this approach? (rationale)
- [ ] How to test? (specific steps)
- [ ] What types change? (if any)

### 5. Update Design Docs (if needed)
- Update `docs/requirements.md` with new requirement IDs
- Update `docs/design.md` with architecture changes

### 6. Update Handoff
Edit `docs/handoff.md`:

```markdown
## Current Task
**Status**: `READY_FOR_CLAUDE`

| Field | Value |
|-------|-------|
| Task ID | #XX |
| Issue | https://github.com/.../issues/XX |
| Task Doc | docs/task_XX_name.md |
| Assigned To | Claude |

## Handoff: Antigravity → Claude
### Task Summary
[Brief description]

### Key Files
- file1.ts (line ~50, add method)
- file2.ts (line ~200, wire up)

### Implementation Notes
- [Specific constraints]
- [Gotchas to watch for]

### Acceptance Criteria
- [ ] Criterion 1
```

### 7. Commit and Push
```bash
git add docs/
git commit -m "docs: Add task plan for #XX"
git push
```

### 8. Notify User
Tell user: "Task plan ready. Start Claude and run `/start`."
