# Model Strategy (Claude Code Only)

Guidelines for choosing between Sonnet and Opus in Claude Code.

## Recommended Models

| Task Type | Model | Reason |
|-----------|-------|--------|
| Analysis/Research | Sonnet (4.5) | Fast, cost-effective |
| Documentation | Sonnet (4.5) | Sufficient quality |
| Minor fixes | Sonnet (4.5) | Avoid overkill |
| New features | Opus (4.5) | Complex logic |
| Refactoring | Opus (4.5) | Design decisions |
| Complex bugs | Opus (4.5) | Deep understanding |

## Notes

- Git ops, deploy: Either model works
- When unsure: Start with Sonnet, switch to Opus if needed
