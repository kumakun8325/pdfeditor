# Editing Guidelines

## Objective
Execute file edits autonomously and accurately without manual confirmation, following professional standards.

## Rules
1. **Incremental Edits**: When editing large files like `main.ts`, use targeted edits rather than overwriting the whole file to prevent accidental data loss.
2. **Auto-Cleanup**: After editing, always check for trailing whitespace or broken brackets.
3. **No-Ask Policy**: Since `writeAllowance` is granted, proceed with necessary changes immediately but **always log a summary** of changes to the terminal.
4. **Safety Net**: If an edit is complex, perform a temporary `git commit -m "pre-edit: ..."` automatically so the user can revert if needed.
