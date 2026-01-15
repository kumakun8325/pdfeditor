# CLAUDE.md
# PDF Editor - Project Constitution

## WHAT: Technical Stack
- Core: TypeScript (Vanilla), pdfjs-dist, pdf-lib, Vite
- Map: Detailed class structure is in `.claude/rules/architecture.md`.

## WHY: Core Philosophy
- **Client-Side Only**: Privacy-first in-browser processing. No backend required.
- **Manager Pattern**: Each feature has a manager. `PDFEditorApp` (main.ts) orchestrates them.
- **Issue-Driven**: Every change must start with a GitHub Issue and PR via MCP.

## HOW: Essential Commands
- Dev/Build: `npm run dev` / `npm run build`
- Deploy: `firebase deploy --only hosting` (Requires GOOGLE_APPLICATION_CREDENTIALS)
- Lint: `npm run lint`
- **Finish Workflow**: `./bin/finish.sh "message"` (Build, Commit, Push, Deploy)
- Other Scripts: Check `./bin/` directory for task automation.

## DOCUMENTATION RULES (Crucial)
1. **Stability**: Keep `CLAUDE.md` stable. Do NOT add session-specific progress or deep technical details here.
2. **Dynamic Info**: Update `docs/SESSION_LOG.md` for session status, completed tasks, and next steps.
3. **Deep Tech**: Update `.claude/rules/architecture.md` or `design.md` for changes in logic, class structure, or types.
4. **Consistency**: Ensure implementation and documentation are always in sync.

## CRITICAL OPERATIONAL RULES
1. **Firebase Auth**: NEVER use `firebase login`. Always use the Service Account Key via env var.
2. **Workflow**: Refer to `.claude/rules/workflow.md` for Issue/PR procedures.
3. **Model Strategy**: See `.claude/rules/model.md` for Sonnet/Opus usage guidelines.
