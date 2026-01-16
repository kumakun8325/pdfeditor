---
description: Verify Claude's implementation and provide feedback
---

# Verify Workflow

Verify implementation completed by Claude.

## Steps

### 1. Sync with Remote (REQUIRED)
```bash
git checkout main
git pull origin main
```
Always pull latest changes before verification.

### 2. Check Handoff Status
```bash
cat docs/handoff.md
```
- Verify status is `READY_FOR_VERIFY`
- Read "Handoff: Claude → Antigravity" section

### 3. Install Dependencies (if needed)
```bash
npm install
```

### 4. Build and Lint
```bash
npm run lint
npm run build
```
- Check for errors
- Note any warnings

### 5. Run Dev Server
```bash
npm run dev
```
- Open browser at http://localhost:5173/
- Test the implemented feature

### 6. Check Acceptance Criteria
Read task document and verify each criterion:
- [ ] Criterion 1 - PASS/FAIL
- [ ] Criterion 2 - PASS/FAIL

### 7. Update Handoff

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

### 8. Commit and Push
```bash
git add docs/
git commit -m "docs: Verification result for #XX"
git push
```

### 9. Security Audit (Before Deploy)
Check for security issues:
```bash
npm audit
```
- Review user input handling in new code
- Check for exposed credentials or API keys
- If issues found, send feedback to Claude

### 10. Deploy (If Verified)
If all tests pass and feature is ready for production:
```bash
npm run build
firebase deploy --only hosting
```
- Verify deployment at production URL
- Confirm feature works in production

### 11. Next Steps
- If verified and deployed: Plan next task or notify user
- If failed: Tell user "Feedback added. Run Claude with /start"
