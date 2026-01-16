---
name: refactoring
description: Maintain the Manager Pattern and prevent file bloat. Triggers when refactoring code or when files exceed size thresholds.
---

# Refactoring Skill

## Objective
Maintain the "Manager Pattern" and prevent file bloat (especially in `main.ts`).

## Instructions

1. **File Size Threshold**: If any file exceeds 15,000 tokens, proactively suggest a split.

2. **Logic Extraction**: Identify event handlers or complex business logic in `main.ts` and move them to specialized `src/managers/` or `src/services/`.

3. **Delegation Pattern**: `main.ts` should only act as an orchestrator. All implementation details must be in sub-modules.

4. **Consistency**: After moving logic, ensure all imports are updated and `/review` the changes for breaking patterns.

## Examples

### When to trigger
- User asks to "refactor" or "clean up" code
- A file exceeds 500 lines
- Complex logic is found in `main.ts`

### Refactoring steps
1. Identify the logic to extract
2. Create new Manager/Service in appropriate directory
3. Move logic and update imports
4. Run `/review` to verify
