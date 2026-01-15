# Architecture Detail

## Core Libraries
- **pdfjs-dist**: Rendering PDF to canvas.
- **pdf-lib**: Modifying and exporting PDFs.
- **JSZip + FileSaver**: ZIP export functionality.

## Class Structure (Manager Pattern)
PDFEditorApp (main.ts) - The central hub orchestrating all modules:
├── Managers
│   ├── EventManager - Coordination between managers
│   ├── RenderManager - Canvas rendering, zoom control
│   ├── PageManager - Rotate, delete, duplicate, reorder
│   ├── SelectionManager - Multi-page selection
│   ├── AnnotationManager - Text and highlight annotations
│   ├── ToolbarManager / ContextMenuManager / DragDropManager
│   ├── UndoManager / HelpManager
│   ├── UndoExecutionManager - Undo/Redo action execution
│   ├── ExportManager - PDF/image export, split download
│   ├── ClipboardManager - Annotation/page copy/paste
│   ├── FileOperationManager - PDF/image file loading
│   └── CanvasInteractionManager - Canvas mouse events, drag/resize/rotate
└── Services
    ├── PDFService - PDF loading/exporting
    ├── ImageService - Image import/export (PNG, ZIP)
    ├── KeyboardService - Shortcuts
    └── StorageService - LocalStorage persistence

## State Management
App state is held in `PDFEditorApp.state` (type: `AppState`).
- `pages: PageData[]`: Array of page data with thumbnails, rotation, and annotations.
- `selectedPageIndices: number[]`: Tracks multi-selection support (e.g., Ctrl+Click).
- **Annotations**: Stored per-page in `PageData.textAnnotations` and `PageData.highlightAnnotations`.
- **Undo/Redo**: Managed via `UndoManager` using the `UndoAction` union type in `src/types/index.ts`.

## Key Implementation Notes
- **ArrayBuffer**: Always use `.slice()` before passing to pdfjs to avoid detachment.
- **Coordinates**: Handle conversion between PDF origin (bottom-left) and Canvas origin (top-left).
