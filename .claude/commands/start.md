# /start - Begin Implementation

Read handoff from Antigravity and start implementing.

## Steps

### 1. Check Handoff Status
```bash
cat docs/handoff.md
```
- Verify status is `READY_FOR_CLAUDE`
- Read "Handoff: Antigravity → Claude" section

### 2. Read Task Document
- Open the task doc specified in handoff (e.g., `docs/task_XXX.md`)
- Understand requirements and implementation plan

### 3. Impact Analysis (REQUIRED)
Before any code changes:
1. Identify all files that will be modified
2. Check dependencies and potential side effects
3. **Present implementation plan to user as bullet points**
4. **Wait for user approval before proceeding**

Example output:
```
## Impact Analysis

### Files to Modify
- src/managers/PageManager.ts (add method)
- src/main.ts (wire up new method)

### Potential Risks
- May affect existing undo/redo behavior

### Implementation Steps
1. Add `duplicatePage()` to PageManager
2. Add undo action type
3. Wire up in main.ts
4. Add tests

Proceed? (y/n)
```

### 4. Create Branch
```bash
git checkout -b feature/issue-XX-description
```

### 5. Update Handoff Status
Change status in `docs/handoff.md`:
```
**Status**: `IMPLEMENTING`
**Assigned To**: Claude
```

### 6. Implement
- Follow the task document step by step
- Implement tests if specified in task doc
- Run `npm run lint` after changes
- Run `npm run build` to verify

### 7. Complete Implementation
When done, run `/finish` command.

## Checklist
- [ ] Read handoff.md
- [ ] Read task document
- [ ] **Impact analysis presented**
- [ ] **User approved plan**
- [ ] Create feature branch
- [ ] Update status to IMPLEMENTING
- [ ] Implement changes
- [ ] Implement tests (if applicable)
- [ ] Run /finish
