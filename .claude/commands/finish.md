# /finish - Complete Implementation

Finish implementation and hand off to Antigravity for verification.

## Steps

### 1. Verify Build
```bash
npm run lint
npm run build
```
- Fix any errors before proceeding

### 2. Update Task Document
Edit the task doc (e.g., `docs/task_XX.md`):
- Mark completed steps with `[x]`
- Add any implementation notes

### 3. Update Handoff
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

### Known Issues
- [Any limitations or issues]
```

### 4. Update SESSION_LOG.md
Add entry to `docs/SESSION_LOG.md`:
```markdown
## YYYY-MM-DD

### Completed
- Task #XX: [Description]

### Changed Files
- file1.ts
- file2.ts
```

### 5. Commit and Push
```bash
git add .
git commit -m "feat: Implement #XX - description"
git push -u origin HEAD
```

### 6. Create Pull Request
```bash
gh pr create --title "feat: description" --body "Closes #XX"
```

## Checklist
- [ ] Build passes
- [ ] Lint passes
- [ ] Task doc updated
- [ ] handoff.md updated
- [ ] SESSION_LOG.md updated
- [ ] Changes committed
- [ ] PR created
