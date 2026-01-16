---
name: testing
description: Ensure zero regressions through automated testing. Triggers when implementing new features or fixing bugs.
---

# Testing Skill

## Objective
Ensure zero regressions (degradation) through automated testing.

## Instructions

1. **Test-First**: Every new feature implementation must be accompanied by a corresponding unit test.

2. **Framework**: Use Vitest for logic and Playwright for UI-interaction tests.
   - Unit tests: `tests/unit/`
   - E2E tests: `tests/e2e/`

3. **Verification**: After implementation, always run `npm test`. If tests fail, fixing them is the absolute priority.

4. **Mocking**: Use `vi.mock` for external libraries (pdfjs, firebase) to keep tests fast and isolated.

## Examples

### When to trigger
- User asks to "add tests" or "implement feature"
- After any code change that affects logic

### Test file naming
- Service: `tests/unit/services/ColorService.test.ts`
- Manager: `tests/unit/managers/UndoManager.test.ts`
- E2E: `tests/e2e/page-operations.spec.ts`
