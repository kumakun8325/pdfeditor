# GitHub MCP Workflow

Every task must follow this Issue-driven flow:

1. **Issue Creation**: Define requirements or bugs in a GitHub Issue. Use labels like `bug` or `enhancement`.
2. **Branching**: Create a dedicated branch from `main`.
3. **Implementation**: Code changes and self-test.
4. **Pull Request**: Create a PR with a clear summary. 
   - Use `Closes #IssueNumber` in the description to link the issue.
5. **Merge & Cleanup**: Merge to `main` and delete the feature branch.

## Branch Naming Conventions
Always use the following prefixes for branch names:
- `feature/` : New feature implementation
- `fix/`     : Bug fixes
- `refactor/`: Code refactoring (no functional changes)
- `docs/`     : Documentation updates
- `chore/`    : Maintenance tasks (dependency updates, etc.)

*Note: Use `gh` commands for all GitHub operations. Ensure branch names are descriptive (e.g., `feature/mobile-touch`).*
