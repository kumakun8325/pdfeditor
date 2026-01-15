# GitHub Issue-Driven Workflow

> **IMPORTANT**: Before starting any feature, bug fix, or refactoring, **you MUST create a GitHub Issue first**.

## Workflow

### Step 1: Create Issue (REQUIRED)
```bash
gh issue create --title "Title" --body "Description" --label "enhancement"
```
- Labels: `bug`, `enhancement`, `refactor`, `docs`
- Note the issue number (e.g., `#42`)

### Step 2: Create Branch
```bash
git checkout -b feature/issue-42-feature-name
```
- Include issue number in branch name
- Prefixes: `feature/`, `fix/`, `refactor/`, `docs/`, `chore/`

### Step 3: Implement & Test
- Make code changes
- Run `npm run lint`
- Run `npm run build`

### Step 4: Commit & Push
```bash
git add .
git commit -m "feat: description (#42)"
git push -u origin HEAD
```

### Step 5: Create Pull Request
```bash
gh pr create --title "feat: description" --body "Closes #42"
```

### Step 6: Merge & Cleanup
```bash
gh pr merge --squash
git checkout main && git pull
git branch -d feature/issue-42-feature-name
```

## Examples

### New Feature
```bash
gh issue create \
  --title "feat: Touch support for mobile" \
  --body "Add touch gestures: pinch zoom, swipe navigation" \
  --label "enhancement"
```

### Bug Fix
```bash
gh issue create \
  --title "fix: PDF pages not displaying correctly after merge" \
  --body "Steps to reproduce..." \
  --label "bug"
```

## Exceptions
- Minor fixes (typos, comments): Issue NOT required
- `chore/` branches: Issue NOT required
- **Unless user explicitly says "skip issue", always create one**
