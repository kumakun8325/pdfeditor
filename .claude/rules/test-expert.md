# Skill: Testing Expert

## Objective
Ensure zero regressions (degradation) through automated testing.

## Rules
1. **Test-First**: Every new feature implementation must be accompanied by a corresponding unit test in `src/__tests__/`.
2. **Framework**: Use Vitest for logic and Playwright for UI-interaction tests.
3. **Verification**: After implementation, always run `npm test`. If tests fail, fixing them is the absolute priority.
4. **Mocking**: Use `vi.mock` for external libraries (pdfjs, firebase) to keep tests fast and isolated.
