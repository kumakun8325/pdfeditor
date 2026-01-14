# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview production build locally
```

No test framework is configured.

## Architecture Overview

This is a browser-based PDF editor built with TypeScript and Vite. The app runs entirely client-side with no backend.

### Core Libraries
- **pdfjs-dist**: PDF rendering to canvas
- **pdf-lib**: PDF modification and export
- **JSZip + FileSaver**: ZIP export functionality

### Application Structure

The app follows a **Manager Pattern** where each feature area has a dedicated manager class. The main `PDFEditorApp` class in `src/main.ts` orchestrates all managers.

```
PDFEditorApp (main.ts)
├── Managers (feature modules)
│   ├── EventManager      - Central event coordination between managers
│   ├── RenderManager     - Canvas rendering, zoom control
│   ├── PageManager       - Page operations (rotate, delete, duplicate, reorder)
│   ├── SelectionManager  - Multi-page selection (Ctrl+Click)
│   ├── AnnotationManager - Text and highlight annotations
│   ├── ToolbarManager    - Toolbar UI and actions
│   ├── ContextMenuManager- Right-click menus
│   ├── DragDropManager   - File/page drag & drop
│   ├── UndoManager       - Undo/redo state tracking
│   └── HelpManager       - Help dialog
│
└── Services (utilities)
    ├── PDFService        - PDF loading, page extraction, export
    ├── ImageService      - Image import/export (PNG, ZIP)
    ├── KeyboardService   - Keyboard shortcuts
    └── StorageService    - LocalStorage session persistence
```

### State Management

App state is held in `PDFEditorApp.state` (type: `AppState`). Key state properties:
- `pages: PageData[]` - Array of page data with thumbnails, annotations, rotation
- `selectedPageIndices: number[]` - Multi-selection support
- Annotations are stored per-page in `PageData.textAnnotations` and `PageData.highlightAnnotations`

### Key Technical Notes

- **ArrayBuffer detachment**: pdfjs-dist Workers consume ArrayBuffers. Always use `.slice()` before passing to pdfjs.
- **Canvas coordinate system**: Annotations use PDF coordinates (origin bottom-left), converted on render.
- **Undo system**: `UndoAction` union type in `src/types/index.ts` defines all undoable operations.

## Model Usage Guidelines

このプロジェクトでは、タスクの種類に応じて適切なモデルを使用してください。

### Use Sonnet (Default) - claude-sonnet-4-5
**コスト効率が重要な作業に使用**

- ✅ コード解析・調査（Grep, Read, Glob）
- ✅ ドキュメント更新（requirements.md, design.md等）
- ✅ Git操作（commit, push）
- ✅ ビルド・デプロイ作業
- ✅ `/finish` コマンド実行
- ✅ 簡単なバグ修正（1-2行の変更）
- ✅ Exploreエージェントでの調査

### Use Opus - claude-opus-4-5
**複雑な思考が必要な作業に使用**

- 🎯 新機能の実装
- 🎯 複雑なバグ修正
- 🎯 リファクタリング
- 🎯 複雑なロジックの実装
- 🎯 アーキテクチャ設計

### 切り替え方法

```bash
/model sonnet   # Sonnetに切り替え
/model opus     # Opusに切り替え
```

**重要**: Claude Codeは自動的にモデルを切り替えないため、コーディング作業を開始する前に手動で `/model opus` を実行してください。

## GitHub MCP Workflow

このプロジェクトではGitHub MCPを活用して、Issue/PR管理を行います。

### バグ修正のワークフロー

#### ① バグ発見時 - Issue作成

バグを発見したら、GitHubのIssueとして登録します。

**ユーザーからの指示例:**
```
この[バグの内容]をGitHubのIssueとして登録して。
タイトルは『[バグ名]の修正』で、再現手順と期待される挙動も書いておいて。
```

**Claudeの対応:**
```bash
gh issue create \
  --title "バグ名の修正" \
  --label "bug" \
  --body "## 問題
[バグの説明]

## 再現手順
1. ...
2. ...

## 期待される挙動
...

## 実際の挙動
..."
```

#### ② 修正着手時 - ブランチ作成

Issueを解決するための作業ブランチを作成します。

**ユーザーからの指示例:**
```
Issue #1 を解決するための新しいブランチ fix/bug-name を作成して、
そこで修正プログラムを書いて。
```

**Claudeの対応:**
```bash
git checkout -b fix/bug-name
# 修正を実装
git add .
git commit -m "fix: バグ名の修正 (fixes #1)"
git push -u origin fix/bug-name
```

#### ③ 修正完了時 - PR作成

修正が完了したら、mainブランチに対してプルリクエストを作成します。

**ユーザーからの指示例:**
```
修正が完了したので、main ブランチに対してプルリクエストを作成して。
PRの説明文には変更点と、このPRで Issue #1 が解決されることを明記して。
```

**Claudeの対応:**
```bash
gh pr create \
  --base main \
  --head fix/bug-name \
  --title "Fix: バグ名の修正" \
  --body "## 変更内容
...

## 関連Issue
Closes #1"
```

### 機能開発のワークフロー

#### ① 機能要件定義 - Issue作成

新機能を実装する前に、要件をまとめたIssueを作成します。

**ユーザーからの指示例:**
```
新機能として『PDFの各ページにテキストの注釈（アノテーション）を入れる機能』を追加したい。
まずはGitHubに要件をまとめたIssueを作成して。ラベルは enhancement で。
```

**Claudeの対応:**
```bash
gh issue create \
  --title "PDFページへのテキスト注釈機能の追加" \
  --label "enhancement" \
  --body "## 機能概要
PDFの各ページにテキストの注釈（アノテーション）を入れる機能

## 要件
- ユーザーがPDFページ上の任意の位置にテキストを追加できる
- 追加したテキストは編集・削除可能
- 注釈を含めたPDFのエクスポートが可能

## 実装方針案
- AnnotationManagerの拡張
- Canvas上でのテキスト入力UI
- pdf-libを使った注釈の埋め込み

## 受け入れ基準
- [ ] テキスト注釈の追加
- [ ] テキスト注釈の編集
- [ ] テキスト注釈の削除
- [ ] 注釈を含むPDFのエクスポート"
```

#### ② 実装着手時 - ブランチ作成と実装方針提案

**ユーザーからの指示例:**
```
Issue #15 に着手するよ。ブランチ名 feature/text-annotation を作成して、
実装方針を提案して。
```

**Claudeの対応:**
1. 関連コードの調査（既存のAnnotationManager等）
2. 実装方針の提案（アーキテクチャ、変更ファイル、手順）
3. ブランチ作成と実装開始
```bash
git checkout -b feature/text-annotation
# 実装
git add .
git commit -m "feat: PDFページへのテキスト注釈機能を追加 (implements #15)"
git push -u origin feature/text-annotation
```

#### ③ 実装完了時 - PR作成

**ユーザーからの指示例:**
```
実装が終わったので、main ブランチに対してプルリクエストを作って。
説明文には Closes #15 を含めておいて。
```

**Claudeの対応:**
```bash
gh pr create \
  --base main \
  --head feature/text-annotation \
  --title "Feature: PDFページへのテキスト注釈機能" \
  --body "## 実装内容
- PDFページ上にテキスト注釈を追加する機能を実装
- AnnotationManagerを拡張してテキスト入力UIを追加
- 注釈を含むPDFのエクスポート機能

## 変更ファイル
- `src/managers/AnnotationManager.ts`: テキスト注釈機能追加
- `src/types/index.ts`: TextAnnotation型定義追加

## テスト
- 手動テスト: テキスト注釈の追加、編集、削除、エクスポートを確認

## 関連Issue
Closes #15"
```

### ブランチ命名規則

- `fix/` - バグ修正
- `feature/` - 新機能実装
- `refactor/` - リファクタリング
- `docs/` - ドキュメント更新

## UI Language

The interface is in Japanese (日本語).

## Session Status (2026-01-14)

### Completed
- ✅ **PDF結合機能の実装（Phase 33完了）**
  - ファイルメニューに「PDFを追加」ボタン追加
  - 複数PDFの選択に対応（`multiple`属性）
  - 既存ページの末尾にPDFを追加する`addPDF()`メソッド実装
- ✅ **カスタムスラッシュコマンド `/finish` の作成**
  - 作業終了時のドキュメント更新・Git操作を自動化
  - ドキュメント整合性チェック機能を追加
- ✅ **ドキュメント大幅更新（実装との整合性確保）**
  - `requirements.md`: F-036〜F-057 追加（22機能）
  - `design.md`: Manager Pattern アーキテクチャ図追加、型定義更新
- ✅ **PDF結合バグ修正（重要）**
  - 問題: ファイルAにファイルBを追加した際、ファイルBのページがファイルAの内容を表示
  - 原因: `RenderManager.renderPdfPage()` が `this.state.originalPdfBytes` を使用
  - 修正: `pageData.pdfBytes` を使用するように変更
- ✅ **モデル使用ガイドライン追加**
  - Sonnet/Opus使い分け指針をCLAUDE.mdに追記
- ✅ **Git push & デプロイ完了**
  - https://pdfeditor-study.web.app

### PDF結合の使い方
1. 「開く」で最初のPDFを読み込む
2. ファイルメニュー（▼）→「PDFを追加」で別のPDFを追加
3. サイドバーでページをドラッグ＆ドロップで並べ替え
4. 「保存」で結合されたPDFをダウンロード

### Pan/Scroll操作方法
- スクロールバーで移動
- スペースキー + ドラッグで移動
- マウスホイールクリック + ドラッグで移動

### 次のタスク候補
- Phase 34: スマホ対応（タッチ操作）
- Phase 35: CMYK変換・印刷用出力
