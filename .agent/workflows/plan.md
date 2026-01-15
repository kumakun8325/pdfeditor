---
description: Create implementation plan and hand off to Claude
---

# Plan Workflow

Create a task document for Claude to implement.

## Steps

### 1. Analyze Requirements
- Understand the feature/bug/refactoring needed
- Check `docs/requirements.md` for related requirements
- Check `docs/design.md` for architecture context

### 2. Create GitHub Issue
```bash
gh issue create --title "feat: description" --body "..." --label "enhancement"
```
Note the issue number.

### 3. Create Task Document
Create `docs/task_[issue#]_[name].md`:

```markdown
# Task: [Title]

Issue: #XX
Status: PLANNING

## Goal
What this task accomplishes.

## Background
Context and motivation.

## Implementation Plan

### Step 1: [Description]
- File: `path/to/file`
- Changes: ...

### Step 2: ...

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Verification
How to test the implementation.
```

### 4. Update Design Docs (if needed)
- Update `docs/requirements.md` with new requirement IDs
- Update `docs/design.md` with architecture changes

### 5. Update Handoff
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
- file1.ts
- file2.ts

### Implementation Notes
[Any constraints or gotchas]

### Acceptance Criteria
- [ ] Criterion 1
```

### 6. Commit and Push
```bash
git add docs/
git commit -m "docs: Add task plan for #XX"
git push
```

### 7. Notify User
Tell user: "Task plan ready. Start Claude and run `/start`."
