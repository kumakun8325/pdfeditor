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
