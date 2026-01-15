# Task 5: UndoExecutionManager Command Pattern リファクタリング

**作成日**: 2026-01-15
**対象ファイル**: `c:\tool\pdfeditor\src\managers\UndoExecutionManager.ts`
**目的**: undo()/redo() のミラーコード重複を Command Pattern で解消

---

## 概要

### 現状の問題

`UndoExecutionManager.ts` (618行) の `undo()` と `redo()` メソッドは、ほぼ同一の switch-case 構造を持ち、操作の向きが逆になるだけの重複コードになっている。

**重複パターン例**:
```typescript
// undo() - L161-176
case 'moveText': {
    const page = this.state.pages.find(p => p.id === action.pageId);
    if (page && page.textAnnotations) {
        const ann = page.textAnnotations.find(a => a.id === action.annotationId);
        if (ann) {
            ann.x = action.fromX;  // ← undo は fromX
            ann.y = action.fromY;
            // ... 再描画処理 ...
        }
    }
    break;
}

// redo() - L451-466
case 'moveText': {
    const page = this.state.pages.find(p => p.id === action.pageId);
    if (page && page.textAnnotations) {
        const ann = page.textAnnotations.find(a => a.id === action.annotationId);
        if (ann) {
            ann.x = action.toX;    // ← redo は toX
            ann.y = action.toY;
            // ... 再描画処理（同一コード）...
        }
    }
    break;
}
```

### 解決策: Command Pattern

各 Action タイプに対応する Command クラスを作成し、`execute()` / `unexecute()` メソッドを実装する。

**期待される効果**:
- 618行 → 約180行 (70%削減)
- 新しい Action タイプの追加が容易
- テストが書きやすい

---

## アーキテクチャ設計

### ファイル構成

```
src/
├── commands/
│   ├── index.ts                    # 新規: エクスポート集約
│   ├── Command.ts                  # 新規: Command インターフェース
│   ├── CommandContext.ts           # 新規: 実行コンテキスト
│   ├── PageCommands.ts             # 新規: ページ操作コマンド
│   ├── AnnotationCommands.ts       # 新規: 注釈操作コマンド
│   └── BatchCommands.ts            # 新規: バッチ操作コマンド
├── managers/
│   └── UndoExecutionManager.ts     # 変更: シンプル化
└── types/
    └── index.ts                    # 変更なし（UndoAction は維持）
```

---

## 詳細設計

### 1. Command インターフェース

**ファイル**: `src/commands/Command.ts`

```typescript
import type { UndoAction } from '../types';
import type { CommandContext } from './CommandContext';

/**
 * Command インターフェース
 * 全ての Undo/Redo 可能な操作が実装する
 */
export interface Command {
    /**
     * コマンドを実行（Redo時に呼ばれる）
     */
    execute(ctx: CommandContext, action: UndoAction): void;

    /**
     * コマンドを取り消し（Undo時に呼ばれる）
     */
    unexecute(ctx: CommandContext, action: UndoAction): void;
}
```

### 2. CommandContext (実行コンテキスト)

**ファイル**: `src/commands/CommandContext.ts`

```typescript
import type { AppState, ToastType } from '../types';
import type { RenderManager } from '../managers/RenderManager';
import type { PageManager } from '../managers/PageManager';
import type { PDFService } from '../services/PDFService';
import type { UndoManager } from '../managers/UndoManager';

/**
 * コマンド実行に必要な依存関係を集約
 */
export interface CommandContext {
    /** アプリケーション状態 */
    state: AppState;
    
    /** PDFサービス */
    pdfService: PDFService;
    
    /** UndoManager (バッチ操作のRedo用) */
    undoManager: UndoManager;
    
    /** RenderManager (nullable) */
    renderManager: RenderManager | null;
    
    /** PageManager */
    pageManager: PageManager;
    
    /** 選択中の注釈ID */
    selectedAnnotationId: string | null;
    
    /** コールバック関数群 */
    callbacks: {
        showToast: (message: string, type: ToastType) => void;
        renderPageList: () => void;
        updateMainView: () => void;
        updateUI: () => void;
    };
}
```

### 3. PageCommands (ページ操作コマンド)

**ファイル**: `src/commands/PageCommands.ts`

```typescript
import type { Command } from './Command';
import type { CommandContext } from './CommandContext';
import type { UndoAction } from '../types';

/**
 * ページ削除コマンド
 */
export class DeletePageCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'deletePage') return;
        
        ctx.state.pages = ctx.pdfService.removePageAt(ctx.state.pages, action.index);
        if (ctx.state.selectedPageIndex >= ctx.state.pages.length) {
            ctx.state.selectedPageIndex = ctx.state.pages.length - 1;
        }
        ctx.callbacks.renderPageList();
        ctx.callbacks.updateMainView();
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'deletePage') return;
        
        ctx.state.pages = ctx.pdfService.insertPageAt(
            ctx.state.pages,
            action.page,
            action.index
        );
        ctx.state.selectedPageIndex = action.index;
        ctx.callbacks.renderPageList();
        ctx.callbacks.updateMainView();
    }
}

/**
 * ページ移動コマンド
 */
export class MovePageCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'movePage') return;
        
        ctx.state.pages = ctx.pdfService.reorderPages(
            ctx.state.pages,
            action.fromIndex,
            action.toIndex
        );
        ctx.state.selectedPageIndex = action.toIndex;
        ctx.callbacks.renderPageList();
        ctx.callbacks.updateMainView();
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'movePage') return;
        
        ctx.state.pages = ctx.pdfService.reorderPages(
            ctx.state.pages,
            action.toIndex,
            action.fromIndex
        );
        ctx.state.selectedPageIndex = action.fromIndex;
        ctx.callbacks.renderPageList();
        ctx.callbacks.updateMainView();
    }
}

/**
 * ページ回転コマンド
 */
export class RotatePageCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'rotatePage') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page && action.newRotation !== undefined) {
            page.rotation = action.newRotation;
            ctx.renderManager?.clearCache();
            ctx.callbacks.updateMainView();
            ctx.callbacks.renderPageList();
        }
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'rotatePage') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page) {
            // Undo時に newRotation を保存
            if (action.newRotation === undefined) {
                (action as any).newRotation = page.rotation || 0;
            }
            page.rotation = action.previousRotation;
            ctx.renderManager?.clearCache();
            ctx.callbacks.updateMainView();
            ctx.callbacks.renderPageList();
        }
    }
}

/**
 * クリアコマンド
 */
export class ClearCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'clear') return;
        
        ctx.state.pages = [];
        ctx.state.selectedPageIndex = -1;
        ctx.callbacks.renderPageList();
        ctx.callbacks.updateMainView();
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'clear') return;
        
        ctx.state.pages = action.pages;
        ctx.state.selectedPageIndex = action.selectedIndex;
        ctx.callbacks.renderPageList();
        ctx.callbacks.updateMainView();
    }
}

/**
 * 画像追加 / ページ複製コマンド（同一ロジック）
 */
export class AddPageCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'addImage' && action.type !== 'duplicatePage') return;
        
        if (action.page && action.index >= 0) {
            ctx.state.pages = ctx.pdfService.insertPageAt(
                ctx.state.pages,
                action.page,
                action.index
            );
            ctx.state.selectedPageIndex = action.index;
            ctx.callbacks.renderPageList();
            ctx.callbacks.updateMainView();
        }
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'addImage' && action.type !== 'duplicatePage') return;
        
        if (action.index >= 0 && action.index < ctx.state.pages.length) {
            const page = ctx.state.pages[action.index];
            if (page.id === action.pageId) {
                // Undo時に page を保存
                if (!action.page) {
                    (action as any).page = page;
                }
                ctx.state.pages.splice(action.index, 1);
                if (ctx.state.selectedPageIndex >= ctx.state.pages.length) {
                    ctx.state.selectedPageIndex = ctx.state.pages.length - 1;
                } else if (ctx.state.selectedPageIndex === action.index) {
                    ctx.state.selectedPageIndex = Math.max(-1, action.index - 1);
                }
                ctx.callbacks.renderPageList();
                ctx.callbacks.updateMainView();
            }
        }
    }
}
```

### 4. AnnotationCommands (注釈操作コマンド)

**ファイル**: `src/commands/AnnotationCommands.ts`

```typescript
import type { Command } from './Command';
import type { CommandContext } from './CommandContext';
import type { UndoAction, TextAnnotation, HighlightAnnotation } from '../types';

/**
 * 再描画ヘルパー
 */
function redraw(ctx: CommandContext): void {
    if (ctx.renderManager) {
        ctx.renderManager.redrawWithCachedBackground(ctx.selectedAnnotationId);
    } else {
        ctx.callbacks.updateMainView();
    }
}

/**
 * テキスト追加コマンド
 */
export class AddTextCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'addText') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page && action.annotation) {
            if (!page.textAnnotations) page.textAnnotations = [];
            page.textAnnotations.push({ ...action.annotation });
            redraw(ctx);
        }
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'addText') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page && page.textAnnotations) {
            const index = page.textAnnotations.findIndex(a => a.id === action.annotationId);
            if (index !== -1) {
                // Undo時に annotation を保存
                if (!action.annotation) {
                    (action as any).annotation = { ...page.textAnnotations[index] };
                }
                page.textAnnotations.splice(index, 1);
                redraw(ctx);
            }
        }
    }
}

/**
 * ハイライト追加コマンド
 */
export class AddHighlightCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'addHighlight') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page && action.annotation) {
            if (!page.highlightAnnotations) page.highlightAnnotations = [];
            page.highlightAnnotations.push({ ...action.annotation });
            redraw(ctx);
        }
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'addHighlight') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page && page.highlightAnnotations) {
            const index = page.highlightAnnotations.findIndex(a => a.id === action.annotationId);
            if (index !== -1) {
                if (!action.annotation) {
                    (action as any).annotation = { ...page.highlightAnnotations[index] };
                }
                page.highlightAnnotations.splice(index, 1);
                redraw(ctx);
            }
        }
    }
}

/**
 * テキスト移動コマンド
 */
export class MoveTextCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'moveText') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.textAnnotations) {
            const ann = page.textAnnotations.find(a => a.id === action.annotationId);
            if (ann) {
                ann.x = action.toX;
                ann.y = action.toY;
                redraw(ctx);
            }
        }
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'moveText') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.textAnnotations) {
            const ann = page.textAnnotations.find(a => a.id === action.annotationId);
            if (ann) {
                ann.x = action.fromX;
                ann.y = action.fromY;
                redraw(ctx);
            }
        }
    }
}

/**
 * ハイライト移動コマンド
 */
export class MoveHighlightCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'moveHighlight') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.highlightAnnotations) {
            const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
            if (ann) {
                ann.x = action.toX;
                ann.y = action.toY;
                redraw(ctx);
            }
        }
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'moveHighlight') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.highlightAnnotations) {
            const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
            if (ann) {
                ann.x = action.fromX;
                ann.y = action.fromY;
                redraw(ctx);
            }
        }
    }
}

/**
 * テキスト削除コマンド
 */
export class DeleteTextCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'deleteText') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.textAnnotations) {
            const index = page.textAnnotations.findIndex(a => a.id === action.annotationId);
            if (index !== -1) {
                page.textAnnotations.splice(index, 1);
                redraw(ctx);
            }
        }
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'deleteText') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page) {
            if (!page.textAnnotations) page.textAnnotations = [];
            page.textAnnotations.push(action.annotation);
            redraw(ctx);
        }
    }
}

/**
 * ハイライト削除コマンド
 */
export class DeleteHighlightCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'deleteHighlight') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.highlightAnnotations) {
            const index = page.highlightAnnotations.findIndex(a => a.id === action.annotationId);
            if (index !== -1) {
                page.highlightAnnotations.splice(index, 1);
                redraw(ctx);
            }
        }
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'deleteHighlight') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page) {
            if (!page.highlightAnnotations) page.highlightAnnotations = [];
            page.highlightAnnotations.push(action.annotation);
            redraw(ctx);
        }
    }
}

/**
 * テキスト更新コマンド
 */
export class UpdateTextCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'updateText') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.textAnnotations) {
            const ann = page.textAnnotations.find(a => a.id === action.annotationId);
            if (ann) {
                ann.text = action.newText;
                ann.color = action.newColor;
                ann.fontSize = action.newFontSize;
                redraw(ctx);
            }
        }
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'updateText') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.textAnnotations) {
            const ann = page.textAnnotations.find(a => a.id === action.annotationId);
            if (ann) {
                ann.text = action.oldText;
                ann.color = action.oldColor;
                ann.fontSize = action.oldFontSize;
                redraw(ctx);
            }
        }
    }
}

/**
 * ハイライトリサイズコマンド
 */
export class ResizeHighlightCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'resizeHighlight') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.highlightAnnotations) {
            const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
            if (ann) {
                ann.width = action.newWidth;
                ann.height = action.newHeight;
                redraw(ctx);
            }
        }
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'resizeHighlight') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.highlightAnnotations) {
            const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
            if (ann) {
                ann.width = action.oldWidth;
                ann.height = action.oldHeight;
                redraw(ctx);
            }
        }
    }
}

/**
 * テキスト回転コマンド
 */
export class RotateTextCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'rotateText') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.textAnnotations) {
            const ann = page.textAnnotations.find(a => a.id === action.annotationId);
            if (ann) {
                ann.rotation = action.newRotation;
                redraw(ctx);
            }
        }
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'rotateText') return;
        
        const page = ctx.state.pages.find(p => p.id === action.pageId);
        if (page?.textAnnotations) {
            const ann = page.textAnnotations.find(a => a.id === action.annotationId);
            if (ann) {
                ann.rotation = action.oldRotation;
                redraw(ctx);
            }
        }
    }
}
```

### 5. BatchCommands (バッチ操作コマンド)

**ファイル**: `src/commands/BatchCommands.ts`

```typescript
import type { Command } from './Command';
import type { CommandContext } from './CommandContext';
import type { UndoAction } from '../types';

/**
 * バッチ移動コマンド
 */
export class BatchMoveCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'batchMove') return;
        
        ctx.pageManager.movePages(action.fromIndices, action.toIndex);
        ctx.undoManager.popUndo(); // PageManager が push するので取り消す
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'batchMove') return;
        
        const currentIndices = action.movedPageIds.map(id =>
            ctx.state.pages.findIndex(p => p.id === id)
        ).filter(i => i >= 0);

        if (currentIndices.length > 0) {
            const sortedCurrent = [...currentIndices].sort((a, b) => b - a);
            const pagesToRevert: typeof ctx.state.pages = [];
            for (const idx of sortedCurrent) {
                pagesToRevert.unshift(ctx.state.pages[idx]);
                ctx.state.pages.splice(idx, 1);
            }
            const sortedFrom = [...action.fromIndices].sort((a, b) => a - b);
            for (let i = 0; i < sortedFrom.length; i++) {
                ctx.state.pages.splice(sortedFrom[i], 0, pagesToRevert[i]);
            }
            ctx.state.selectedPageIndices = [...action.fromIndices];
            ctx.state.selectedPageIndex = action.fromIndices[0];
            ctx.callbacks.renderPageList();
        }
    }
}

/**
 * バッチ回転コマンド
 */
export class BatchRotateCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'batchRotate') return;
        
        const indices = action.pageIds
            .map(id => ctx.state.pages.findIndex(p => p.id === id))
            .filter(i => i !== -1);
        ctx.pageManager.rotatePages(indices);
        ctx.undoManager.popUndo();
        ctx.renderManager?.clearCache();
        ctx.callbacks.updateMainView();
        ctx.callbacks.renderPageList();
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'batchRotate') return;
        
        for (let i = 0; i < action.pageIds.length; i++) {
            const page = ctx.state.pages.find(p => p.id === action.pageIds[i]);
            if (page) {
                page.rotation = action.previousRotations[i];
            }
        }
        ctx.renderManager?.clearCache();
        ctx.callbacks.updateMainView();
        ctx.callbacks.renderPageList();
    }
}

/**
 * バッチ複製コマンド
 */
export class BatchDuplicateCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'batchDuplicate') return;
        
        const sorted = [...action.addedPages].sort((a, b) => a.index - b.index);
        for (const { page, index } of sorted) {
            const newPage = JSON.parse(JSON.stringify(page));
            ctx.state.pages.splice(index, 0, newPage);
        }
        ctx.callbacks.renderPageList();
        ctx.callbacks.updateMainView();
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'batchDuplicate') return;
        
        const sortedIndices = [...action.addedPages]
            .sort((a, b) => b.index - a.index)
            .map(ap => ctx.state.pages.findIndex(p => p.id === ap.page.id))
            .filter(i => i >= 0);
        for (const idx of sortedIndices) {
            ctx.state.pages.splice(idx, 1);
        }
        if (ctx.state.pages.length > 0) {
            ctx.state.selectedPageIndex = Math.min(ctx.state.selectedPageIndex, ctx.state.pages.length - 1);
            ctx.state.selectedPageIndices = [ctx.state.selectedPageIndex];
        } else {
            ctx.state.selectedPageIndex = -1;
            ctx.state.selectedPageIndices = [];
        }
        ctx.callbacks.renderPageList();
        ctx.callbacks.updateMainView();
    }
}

/**
 * バッチ削除コマンド
 */
export class BatchDeleteCommand implements Command {
    execute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'batchDelete') return;
        
        const sorted = [...action.deletedPages].sort((a, b) => b.index - a.index);
        for (const { index } of sorted) {
            if (index < ctx.state.pages.length) {
                ctx.state.pages.splice(index, 1);
            }
        }
        if (ctx.state.pages.length === 0) {
            ctx.state.selectedPageIndex = -1;
            ctx.state.selectedPageIndices = [];
        } else {
            ctx.state.selectedPageIndex = Math.min(ctx.state.selectedPageIndex, ctx.state.pages.length - 1);
            ctx.state.selectedPageIndices = [ctx.state.selectedPageIndex];
        }
        ctx.callbacks.renderPageList();
        ctx.callbacks.updateMainView();
    }

    unexecute(ctx: CommandContext, action: UndoAction): void {
        if (action.type !== 'batchDelete') return;
        
        const sorted = [...action.deletedPages].sort((a, b) => a.index - b.index);
        for (const { page, index } of sorted) {
            ctx.state.pages.splice(index, 0, page);
        }
        ctx.state.selectedPageIndices = sorted.map(s => s.index);
        ctx.state.selectedPageIndex = sorted[0].index;
        ctx.callbacks.renderPageList();
        ctx.callbacks.updateMainView();
    }
}
```

### 6. Command Registry (コマンド登録)

**ファイル**: `src/commands/index.ts`

```typescript
import type { Command } from './Command';
import type { UndoAction } from '../types';

// Page Commands
import { DeletePageCommand, MovePageCommand, RotatePageCommand, ClearCommand, AddPageCommand } from './PageCommands';

// Annotation Commands
import {
    AddTextCommand, AddHighlightCommand,
    MoveTextCommand, MoveHighlightCommand,
    DeleteTextCommand, DeleteHighlightCommand,
    UpdateTextCommand, ResizeHighlightCommand, RotateTextCommand
} from './AnnotationCommands';

// Batch Commands
import { BatchMoveCommand, BatchRotateCommand, BatchDuplicateCommand, BatchDeleteCommand } from './BatchCommands';

export type { Command } from './Command';
export type { CommandContext } from './CommandContext';

/**
 * Action Type → Command のマッピング
 */
const commandRegistry: Record<string, Command> = {
    'deletePage': new DeletePageCommand(),
    'movePage': new MovePageCommand(),
    'rotatePage': new RotatePageCommand(),
    'clear': new ClearCommand(),
    'addImage': new AddPageCommand(),
    'duplicatePage': new AddPageCommand(),
    'addText': new AddTextCommand(),
    'addHighlight': new AddHighlightCommand(),
    'moveText': new MoveTextCommand(),
    'moveHighlight': new MoveHighlightCommand(),
    'deleteText': new DeleteTextCommand(),
    'deleteHighlight': new DeleteHighlightCommand(),
    'updateText': new UpdateTextCommand(),
    'resizeHighlight': new ResizeHighlightCommand(),
    'rotateText': new RotateTextCommand(),
    'batchMove': new BatchMoveCommand(),
    'batchRotate': new BatchRotateCommand(),
    'batchDuplicate': new BatchDuplicateCommand(),
    'batchDelete': new BatchDeleteCommand(),
};

/**
 * Action に対応する Command を取得
 */
export function getCommand(action: UndoAction): Command | undefined {
    return commandRegistry[action.type];
}
```

### 7. UndoExecutionManager の簡素化

**ファイル**: `src/managers/UndoExecutionManager.ts` (変更後)

```typescript
import type { AppState, ToastType } from '../types';
import type { UndoManager } from './UndoManager';
import type { RenderManager } from './RenderManager';
import type { PageManager } from './PageManager';
import type { PDFService } from '../services/PDFService';
import { getCommand, type CommandContext } from '../commands';

/**
 * Undo/Redo 実行コールバック
 */
export interface UndoExecutionCallbacks {
    showToast: (message: string, type: ToastType) => void;
    renderPageList: () => void;
    updateMainView: () => void;
    updateUI: () => void;
    getSelectedAnnotationId: () => string | null;
}

/**
 * Undo/Redo アクションの実行を担当するマネージャー
 * Command Pattern を使用してシンプルに実装
 */
export class UndoExecutionManager {
    constructor(
        private getState: () => AppState,
        private undoManager: UndoManager,
        private pdfService: PDFService,
        private getRenderManager: () => RenderManager | null,
        private getPageManager: () => PageManager,
        private callbacks: UndoExecutionCallbacks
    ) {}

    private get state(): AppState {
        return this.getState();
    }

    private get renderManager(): RenderManager | null {
        return this.getRenderManager();
    }

    private get pageManager(): PageManager {
        return this.getPageManager();
    }

    /**
     * CommandContext を生成
     */
    private createContext(): CommandContext {
        return {
            state: this.state,
            pdfService: this.pdfService,
            undoManager: this.undoManager,
            renderManager: this.renderManager,
            pageManager: this.pageManager,
            selectedAnnotationId: this.callbacks.getSelectedAnnotationId(),
            callbacks: {
                showToast: this.callbacks.showToast,
                renderPageList: this.callbacks.renderPageList,
                updateMainView: this.callbacks.updateMainView,
                updateUI: this.callbacks.updateUI,
            }
        };
    }

    /**
     * Undo実行
     */
    public undo(): void {
        const action = this.undoManager.popUndo();
        if (!action) {
            this.callbacks.showToast('取り消す操作がありません', 'warning');
            return;
        }

        const command = getCommand(action);
        if (command) {
            const ctx = this.createContext();
            command.unexecute(ctx, action);
        }

        if (this.renderManager) {
            this.renderManager.redrawWithCachedBackground(null);
        } else {
            this.callbacks.updateMainView();
        }
        this.callbacks.updateUI();
    }

    /**
     * Redo実行
     */
    public redo(): void {
        const action = this.undoManager.popRedo();
        if (!action) {
            this.callbacks.showToast('やり直す操作がありません', 'warning');
            return;
        }

        const command = getCommand(action);
        if (command) {
            const ctx = this.createContext();
            command.execute(ctx, action);
        }

        this.callbacks.updateUI();
    }
}
```

---

## 実装手順

### Step 1: ディレクトリ作成

```bash
mkdir -p src/commands
```

### Step 2: ファイル作成順序

1. `src/commands/Command.ts`
2. `src/commands/CommandContext.ts`
3. `src/commands/PageCommands.ts`
4. `src/commands/AnnotationCommands.ts`
5. `src/commands/BatchCommands.ts`
6. `src/commands/index.ts`

### Step 3: UndoExecutionManager の置き換え

1. `src/managers/UndoExecutionManager.ts` をバックアップ
2. 新しい実装に置き換え

### Step 4: 動作確認

```bash
npm run build
npm run dev
```

以下を確認:
- [ ] Undo (Ctrl+Z) が全操作で機能
- [ ] Redo (Ctrl+Y / Ctrl+Shift+Z) が全操作で機能
- [ ] ページ操作 (削除・移動・回転・複製) の Undo/Redo
- [ ] 注釈操作 (追加・移動・削除・更新) の Undo/Redo
- [ ] バッチ操作 (複数選択) の Undo/Redo

---

## 実装チェックリスト

- [ ] `src/commands/` ディレクトリ作成
- [ ] `Command.ts` 作成
- [ ] `CommandContext.ts` 作成
- [ ] `PageCommands.ts` 作成 (5コマンド)
- [ ] `AnnotationCommands.ts` 作成 (9コマンド)
- [ ] `BatchCommands.ts` 作成 (4コマンド)
- [ ] `index.ts` 作成 (Registry)
- [ ] `UndoExecutionManager.ts` 置き換え
- [ ] ビルド確認: `npm run build`
- [ ] 全 Undo/Redo 操作の動作確認

---

## 期待される効果

| 項目 | Before | After |
|------|--------|-------|
| UndoExecutionManager 行数 | 618行 | ~100行 |
| 合計 commands 行数 | - | ~400行 |
| **総合行数** | **618行** | **~500行 (18%削減)** |
| **重複コード** | ~500行 | **0行** |
| **新 Action 追加工数** | 高 (2箇所編集) | **低 (1コマンド追加)** |

> [!NOTE]
> 行数削減は控えめですが、**重複コードの完全解消**と**拡張性の大幅向上**が主な効果です。

---

## 注意事項

1. **既存の UndoAction 型は変更しない**
   - 互換性を維持するため、型定義は現状のまま

2. **バッチ操作の Redo 時の注意**
   - `batchMove` と `batchRotate` は `PageManager` を呼び出すため、`undoManager.popUndo()` で重複を防止

3. **テストの推奨**
   - 各 Command に対してユニットテストを作成することで、Undo/Redo の品質を保証可能
