# /auto-develop command

## Usage
/auto-develop docs/taskXX.md

## Steps (Automated)
1. **Plan**: Analyze the task file and report the impact on existing architecture.
2. **Refactor Check**: Check `main.ts` size. If too large, perform refactoring BEFORE starting the task.
3. **Implement**: Write code following the Refactor-Expert skill.
4. **Test**: Generate and run unit tests.
5. **Review**: Execute `/review` on modified files.
6. **Documentation**: Update `SESSION_LOG.md`, `requirement.md`, and `design.md`.
7. **Finalize**: Commit changes with a descriptive message using `./bin/finish.sh`.
