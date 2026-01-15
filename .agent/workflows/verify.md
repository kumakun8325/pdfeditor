---
description: Verify Claude's implementation and provide feedback
---

# Verify Workflow

Verify implementation completed by Claude.

## Steps

### 1. Check Handoff Status
```bash
cat docs/handoff.md
```
- Verify status is `READY_FOR_VERIFY`
- Read "Handoff: Claude → Antigravity" section

### 2. Pull Latest Changes
```bash
git checkout main
git pull
```

### 3. Build and Lint
```bash
npm run lint
npm run build
```
- Check for errors
- Note any warnings

### 4. Run Dev Server
```bash
npm run dev
```
- Open browser at http://localhost:5173/
- Test the implemented feature

### 5. Check Acceptance Criteria
Read task document and verify each criterion:
- [ ] Criterion 1 - PASS/FAIL
- [ ] Criterion 2 - PASS/FAIL

### 6. Update Handoff

#### If PASS:
```markdown
## Current Task
**Status**: `VERIFIED`

## History
| Date | Action | By | Notes |
|------|--------|-----|-------|
| YYYY-MM-DD | Verified | Antigravity | All criteria passed |
```

Update `docs/tasks.md`:
- Mark task as `[x]` completed

#### If FAIL:
```markdown
## Current Task
**Status**: `READY_FOR_CLAUDE`

## Feedback Loop
### Issue #1
- **Problem**: [What went wrong]
- **Expected**: [What should happen]
- **Fix Suggestion**: [How to fix]
```

### 7. Commit and Push
```bash
git add docs/
git commit -m "docs: Verification result for #XX"
git push
```

### 8. Next Steps
- If verified: Plan next task or notify user
- If failed: Tell user "Feedback added. Run Claude with /start"
