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

### 3. Create Branch
```bash
git checkout -b feature/issue-XX-description
```

### 4. Update Handoff Status
Change status in `docs/handoff.md`:
```
**Status**: `IMPLEMENTING`
**Assigned To**: Claude
```

### 5. Implement
- Follow the task document step by step
- Run `npm run lint` after changes
- Run `npm run build` to verify

### 6. Complete Implementation
When done, run `/finish` command which will:
- Update `docs/handoff.md` status to `READY_FOR_VERIFY`
- Fill "Handoff: Claude → Antigravity" section
- Commit and push changes

## Checklist
- [ ] Read handoff.md
- [ ] Read task document
- [ ] Create feature branch
- [ ] Update status to IMPLEMENTING
- [ ] Implement changes
- [ ] Run /finish
