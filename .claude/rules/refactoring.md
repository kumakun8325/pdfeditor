# Refactoring Guidelines

## Objective
Maintain the "Manager Pattern" and prevent file bloat (especially in `main.ts`).

## Rules
1. **File Size Threshold**: If any file exceeds 15,000 tokens, proactively suggest a split.
2. **Logic Extraction**: Identify event handlers or complex business logic in `main.ts` and move them to specialized `src/managers/` or `src/services/`.
3. **Delegation Pattern**: `main.ts` should only act as an orchestrator. All implementation details must be in sub-modules.
4. **Consistency**: After moving logic, ensure all imports are updated and `/review` the changes for breaking patterns.
