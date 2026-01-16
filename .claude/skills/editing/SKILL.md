---
name: editing
description: Execute file edits autonomously and accurately. Triggers when editing files, especially large files like main.ts.
---

# Editing Skill

## Objective
Execute file edits autonomously and accurately without manual confirmation, following professional standards.

## Instructions

1. **Incremental Edits**: When editing large files like `main.ts`, use targeted edits rather than overwriting the whole file to prevent accidental data loss.

2. **Auto-Cleanup**: After editing, always check for trailing whitespace or broken brackets.

3. **No-Ask Policy**: Since `writeAllowance` is granted, proceed with necessary changes immediately but **always log a summary** of changes to the terminal.

4. **Safety Net**: If an edit is complex, perform a temporary `git commit -m "pre-edit: ..."` automatically so the user can revert if needed.

## Examples

### Before editing a large file
```bash
git commit -m "pre-edit: before refactoring main.ts"
```

### After editing
- Log: "Changed lines 50-75: Added new event handler for page rotation"
- Check for syntax errors
