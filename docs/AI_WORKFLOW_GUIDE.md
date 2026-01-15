# AI Division Workflow Guide

> Antigravity (Planning/Verification) + Claude (Implementation)

---

## Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Antigravity   │ ──► │     Claude      │ ──► │   Antigravity   │
│     /plan       │     │ /start → /finish│     │     /verify     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Phase 1: Planning (Antigravity)

### Prompt
```
/plan を実行してください。
タスク: [機能/バグ/リファクタリングの説明]
```

### Detailed Prompt
```
以下のタスクの計画を作成してください:

## 概要
[やりたいことの説明]

## 要件
- [要件1]
- [要件2]

/plan ワークフローに従い:
1. GitHub Issueを作成
2. docs/task_XX.md を作成
3. docs/handoff.md を READY_FOR_CLAUDE に更新
```

### Output
- GitHub Issue created
- `docs/task_XX.md` created
- `docs/handoff.md` status → `READY_FOR_CLAUDE`

---

## Phase 2: Implementation (Claude)

### Prompt
```
/start
```

That's it. Claude reads `handoff.md` automatically.

### What Claude Does
1. Reads `docs/handoff.md`
2. Reads task document
3. **Presents impact analysis and implementation plan**
4. **Waits for user approval**
5. Creates feature branch
6. Implements changes + tests

---

## Phase 3: Implementation Complete (Claude)

### Prompt
```
/finish
```

### What Claude Does
1. Runs `/review` on changed files
2. Runs `npm run test` (if tests exist)
3. Runs lint/build
4. Updates docs (requirements.md, design.md if needed)
5. Updates `docs/handoff.md` → `READY_FOR_VERIFY`
6. Commits and pushes
7. Creates PR

---

## Phase 4: Verification (Antigravity)

### Prompt
```
/verify を実行してください。
```

### What Antigravity Does
1. Pulls latest changes
2. Runs `npm run build`
3. Tests the implementation
4. Checks acceptance criteria

### If PASS
- Updates status → `VERIFIED`
- Updates `docs/tasks.md`

### If FAIL
- Adds feedback to `docs/handoff.md`
- Sets status → `READY_FOR_CLAUDE`

---

## Phase 5: Fix Issues (Claude)

### Prompt (if verification failed)
```
/start

handoff.md の Feedback Loop を確認し、指摘を修正してください。
```

---

## Full Cycle Example

```
┌────────────────────────────────────────────────────────────────┐
│ 1. [Antigravity]                                               │
│    Prompt: タッチ操作のサポートを計画してください。/plan        │
│                                                                │
│    → Issue #50 created                                         │
│    → docs/task_50_touch.md created                             │
│    → handoff.md → READY_FOR_CLAUDE                             │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 2. [Claude]                                                    │
│    Prompt: /start                                              │
│                                                                │
│    → Reads handoff.md                                          │
│    → Creates branch feature/issue-50-touch                     │
│    → Implements touch support                                  │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 3. [Claude]                                                    │
│    Prompt: /finish                                             │
│                                                                │
│    → Updates handoff.md → READY_FOR_VERIFY                     │
│    → Commits and pushes                                        │
│    → Creates PR                                                │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 4. [Antigravity]                                               │
│    Prompt: /verify を実行してください。                         │
│                                                                │
│    → Tests implementation                                      │
│    → PASS: handoff.md → VERIFIED, update tasks.md              │
│    → FAIL: handoff.md → add feedback, READY_FOR_CLAUDE         │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ 5. [If FAIL - Claude]                                          │
│    Prompt: /start                                              │
│            Feedback Loop を確認し修正してください。              │
│                                                                │
│    → Reads feedback                                            │
│    → Fixes issues                                              │
│    → /finish                                                   │
└────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `docs/handoff.md` | Task handoff between AIs |
| `docs/task_XX.md` | Detailed task document |
| `.claude/commands/start.md` | Claude's start command |
| `.claude/commands/finish.md` | Claude's finish command |
| `.agent/workflows/plan.md` | Antigravity's plan workflow |
| `.agent/workflows/verify.md` | Antigravity's verify workflow |

---

## Status Flow

```
IDLE → PLANNING → READY_FOR_CLAUDE → IMPLEMENTING → READY_FOR_VERIFY → VERIFIED
                         ↑                                    │
                         └──────────── (if FAIL) ─────────────┘
```
