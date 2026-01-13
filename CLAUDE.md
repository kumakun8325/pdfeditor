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

## UI Language

The interface is in Japanese (日本語).

## Session Status (2026-01-14)

### Completed
- ✅ batchRotate の修正確認・ビルド成功
- ✅ ズーム時のパン/スクロール機能追加
  - CSS修正: `align-items: flex-start` + `margin: auto` でスクロール対応
  - カスタムスクロールバースタイル追加
  - `scrollbar-gutter: stable both-edges` 追加
- ✅ コミット完了: `4870fab feat: add pan/scroll support for zoomed pages`

### Pending
- ⏳ `git push` - GitHub認証設定待ち
  - `gh auth login` 実行後に `git push` を実行すればOK

### Pan/Scroll操作方法
- スクロールバーで移動
- スペースキー + ドラッグで移動
- マウスホイールクリック + ドラッグで移動
