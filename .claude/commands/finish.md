# /finish - Complete Implementation

Finish implementation and hand off to Antigravity for verification.

## Steps

### 1. Self-Review (REQUIRED)
Run `/review` on main changed files:
```
/review src/managers/NewManager.ts
/review src/main.ts
```
Fix any issues found.

### 2. Run Tests
```bash
npm run test
```
- Fix any failing tests
- If no tests yet, skip this step

### 3. Verify Build
```bash
npm run lint
npm run build
```
- Fix any errors before proceeding

### 4. Update Task Document
Edit the task doc (e.g., `docs/task_XX.md`):
- Mark completed steps with `[x]`
- Add any implementation notes

### 5. Update Documentation
Check and update if needed:
- `docs/requirements.md` - Add new requirement IDs
- `docs/design.md` - Update architecture/types

### 6. Update Handoff
Edit `docs/handoff.md`:

```markdown
## Current Task
**Status**: `READY_FOR_VERIFY`
**Assigned To**: Antigravity

## Handoff: Claude → Antigravity
### Completed Work
- [What was implemented]

### Changed Files
- path/to/file1.ts
- path/to/file2.ts

### Test Instructions
1. Run `npm run dev`
2. Open http://localhost:5173/
3. [Steps to test]

### Tests Added
- [ ] test/file.test.ts - description

### Known Issues
- [Any limitations or issues]
```

### 7. Update SESSION_LOG.md
Add entry to `docs/SESSION_LOG.md`:
```markdown
## YYYY-MM-DD

### Completed
- Task #XX: [Description]

### Changed Files
- file1.ts
- file2.ts
```

### 8. Start Dev Server
```bash
npm run dev
```
Confirm app works at http://localhost:5173/

### 9. Commit and Push
```bash
git add .
git commit -m "feat: Implement #XX - description"
git push -u origin HEAD
```

### 10. Create Pull Request
```bash
gh pr create --title "feat: description" --body "Closes #XX"
```

## Checklist
- [ ] /review on main files
- [ ] Tests pass (if applicable)
- [ ] Build passes
- [ ] Lint passes
- [ ] Task doc updated
- [ ] requirements.md updated (if needed)
- [ ] design.md updated (if needed)
- [ ] handoff.md updated
- [ ] SESSION_LOG.md updated
- [ ] Dev server works
- [ ] Changes committed
- [ ] PR created
