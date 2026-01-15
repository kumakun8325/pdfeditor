# PDF Editor コードベース改善 - 実装設計書

**作成日**: 2026-01-15
**対象プロジェクト**: `c:\tool\pdfeditor`
**目的**: 他のAIがこのドキュメントのみで実装できる詳細な設計書

---

## 目次

1. [Task 1: AnnotationManager の座標変換ロジック分離](#task-1-annotationmanager-の座標変換ロジック分離)
2. [Task 2: EventManager の bindEvents 分割](#task-2-eventmanager-の-bindevents-分割)
3. [Task 3: 型定義の最適化](#task-3-型定義の最適化)
4. [Task 4: コードクリーンアップ](#task-4-コードクリーンアップ)

---

## Task 1: AnnotationManager の座標変換ロジック分離

### 概要

`AnnotationManager.ts` の `toPdfPoint` メソッド（L4-442, **438行**）を新規 `CoordinateTransformService` に分離する。
現在のコードは座標変換のデバッグ用コメントが大量に含まれており、可読性が著しく低下している。

### 現状

**ファイル**: `src/managers/AnnotationManager.ts`
**サイズ**: 906行, 35KB
**問題のメソッド**: `toPdfPoint` (L4-442)

```typescript
// 現在の構造
export class AnnotationManager {
    public static toPdfPoint(
        canvasX: number,
        canvasY: number,
        scale: number,
        pageHeight: number,
        pageWidth: number,
        rotation: number = 0
    ): { x: number; y: number } {
        // 回転正規化
        const rotate = (rotation % 360 + 360) % 360;
        
        // ... 400行以上のコメント付きロジック ...
        
        return { x: pdfX, y: pdfY };
    }
}
```

### 新規ファイル作成

**ファイル**: `src/services/CoordinateTransformService.ts`

```typescript
/**
 * 座標変換サービス
 * Canvas座標とPDF座標の相互変換を担当
 */
export class CoordinateTransformService {
    /**
     * Canvas座標をPDF座標に変換
     * @param canvasX - Canvas上のX座標 (px)
     * @param canvasY - Canvas上のY座標 (px)
     * @param scale - 現在のズームスケール
     * @param pageHeight - PDFページの高さ (pt)
     * @param pageWidth - PDFページの幅 (pt)
     * @param rotation - ページの回転角度 (0, 90, 180, 270)
     * @returns PDF座標 { x, y }
     */
    public static toPdfPoint(
        canvasX: number,
        canvasY: number,
        scale: number,
        pageHeight: number,
        pageWidth: number,
        rotation: number = 0
    ): { x: number; y: number } {
        const rotate = (rotation % 360 + 360) % 360;
        let pdfX = 0;
        let pdfY = 0;

        switch (rotate) {
            case 0:
                pdfX = canvasX / scale;
                pdfY = pageHeight - (canvasY / scale);
                break;
            case 90:
                pdfX = canvasY / scale;
                pdfY = canvasX / scale;
                break;
            case 180:
                pdfX = pageWidth - (canvasX / scale);
                pdfY = canvasY / scale;
                break;
            case 270:
                pdfX = pageWidth - (canvasY / scale);
                pdfY = pageHeight - (canvasX / scale);
                break;
        }

        return { x: pdfX, y: pdfY };
    }

    /**
     * PDF座標をCanvas座標に変換
     * @param pdfX - PDF上のX座標 (pt)
     * @param pdfY - PDF上のY座標 (pt)
     * @param scale - 現在のズームスケール
     * @param pageHeight - PDFページの高さ (pt)
     * @returns Canvas座標 { x, y }
     */
    public static toCanvasPoint(
        pdfX: number,
        pdfY: number,
        scale: number,
        pageHeight: number
    ): { x: number; y: number } {
        const x = pdfX * scale;
        const y = (pageHeight - pdfY) * scale;
        return { x, y };
    }
}
```

### AnnotationManager の変更

**ファイル**: `src/managers/AnnotationManager.ts`

#### 変更1: インポート追加 (L1)

```diff
import type { PageData, TextAnnotation, HighlightAnnotation } from '../types';
+import { CoordinateTransformService } from '../services/CoordinateTransformService';
```

#### 変更2: toPdfPoint メソッド削除・委譲 (L4-442 を削除し、以下に置換)

```typescript
    /**
     * Canvas座標をPDF座標に変換
     * @deprecated CoordinateTransformService.toPdfPoint を使用してください
     */
    public static toPdfPoint(
        canvasX: number,
        canvasY: number,
        scale: number,
        pageHeight: number,
        pageWidth: number,
        rotation: number = 0
    ): { x: number; y: number } {
        return CoordinateTransformService.toPdfPoint(
            canvasX, canvasY, scale, pageHeight, pageWidth, rotation
        );
    }
```

#### 変更3: toCanvasPoint メソッド削除・委譲 (L461-473 を削除し、以下に置換)

```typescript
    /**
     * PDF座標をCanvas座標に変換
     * @deprecated CoordinateTransformService.toCanvasPoint を使用してください
     */
    public static toCanvasPoint(
        pdfX: number,
        pdfY: number,
        scale: number,
        pageHeight: number
    ): { x: number; y: number } {
        return CoordinateTransformService.toCanvasPoint(pdfX, pdfY, scale, pageHeight);
    }
```

### 削減効果

| 項目 | Before | After |
|------|--------|-------|
| AnnotationManager 行数 | 906行 | 約480行 |
| 削減行数 | - | 約426行 |

---

## Task 2: EventManager の bindEvents 分割

### 概要

`EventManager.ts` の巨大なメソッドを機能別に分割し、可読性と保守性を向上させる。

### 現状

**ファイル**: `src/managers/EventManager.ts`
**サイズ**: 800行, 31KB

**問題のメソッド**:
- `bindEvents()` (L16-205, 190行)
- `setupContextMenu()` (L392-507, 115行)
- `bindShortcuts()` (L515-592, 78行) - `setupKeyboardShortcuts()` と重複あり

### 変更内容

#### 変更1: bindEvents を機能別メソッドに分割 (L16-205)

**現在のコード** (L16-205):
```typescript
public bindEvents(): void {
    // ファイル選択 (L17-34, 18行)
    // 保存操作 (L36-44, 9行)
    // 画像追加 (L46-60, 15行)
    // PDF追加 (L62-76, 15行)
    // ページ操作 (L78-120, 43行)
    // テーマ・CMYK (L122-136, 15行)
    // テキストモーダル (L138-147, 10行)
    // ドラッグ&ドロップ (L149-150, 2行)
    // ページナビゲーション (L152-159, 8行)
    // キャンバスイベント (L161-166, 6行)
    // ハイライト (L168-171, 4行)
    // ズーム (L173-188, 16行)
    // Undo/Redo (L190-192, 3行)
    // その他 (L194-205, 12行)
}
```

**リファクタリング後**:

```typescript
public bindEvents(): void {
    this.bindFileEvents();
    this.bindPageOperationEvents();
    this.bindAnnotationEvents();
    this.bindZoomEvents();
    this.bindNavigationEvents();
    this.setupDropZone();
    this.setupKeyboardShortcuts();
    this.setupContextMenu();
    this.bindShortcuts();
    this.setupCanvasEvents();
    this.setupMobileSidebar();
}

/**
 * ファイル操作イベント（開く・保存・追加）
 */
private bindFileEvents(): void {
    // L17-76 の内容をここに移動
    this.elements.btnOpen.addEventListener('click', () => {
        this.elements.fileInput.click();
    });

    if (this.elements.btnOpenHero) {
        this.elements.btnOpenHero.addEventListener('click', () => {
            this.elements.fileInput.click();
        });
    }

    this.elements.fileInput.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            await this.app.loadPDF(file);
        }
    });

    this.elements.btnSave.addEventListener('click', () => {
        this.app.savePDF();
    });

    this.elements.btnSaveAs.addEventListener('click', () => {
        this.app.saveAsPDF();
    });

    this.elements.btnAddImage.addEventListener('click', () => {
        this.elements.imageInput.click();
    });

    this.elements.imageInput.addEventListener('change', async (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files && files.length > 0) {
            for (const file of Array.from(files)) {
                await this.app.insertImage(file);
            }
        }
        (e.target as HTMLInputElement).value = '';
    });

    this.elements.btnAddPdf.addEventListener('click', () => {
        this.elements.pdfAddInput.click();
    });

    this.elements.pdfAddInput.addEventListener('change', async (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files && files.length > 0) {
            for (const file of Array.from(files)) {
                await this.app.addPDF(file);
            }
        }
        (e.target as HTMLInputElement).value = '';
    });
}

/**
 * ページ操作イベント（移動・回転・複製・削除・クリア）
 */
private bindPageOperationEvents(): void {
    // L78-120 の内容をここに移動
    this.elements.btnMoveUp.addEventListener('click', () => {
        this.app.movePageUp();
    });

    this.elements.btnMoveDown.addEventListener('click', () => {
        this.app.movePageDown();
    });

    this.elements.btnRotate.addEventListener('click', () => {
        this.app.rotatePages();
    });

    this.elements.btnDuplicate.addEventListener('click', () => {
        this.app.duplicatePages();
    });

    this.elements.btnExportPng.addEventListener('click', () => {
        this.app.exportCurrentPage();
    });

    this.elements.btnExportAll.addEventListener('click', () => {
        this.app.exportAllPages();
    });

    this.elements.btnSplit.addEventListener('click', () => {
        this.app.splitAndDownload();
    });

    this.elements.btnClear.addEventListener('click', () => {
        this.app.clearPages();
    });

    this.elements.btnDelete.addEventListener('click', () => {
        this.app.deletePages();
    });

    this.elements.btnTheme.addEventListener('click', () => {
        this.app.toggleTheme();
    });

    this.elements.cmykModeToggle.addEventListener('change', (e) => {
        const isChecked = (e.target as HTMLInputElement).checked;
        this.app.state.exportOptions.colorSpace = isChecked ? 'cmyk' : 'rgb';
    });
}

/**
 * 注釈関連イベント（テキスト追加・ハイライト）
 */
private bindAnnotationEvents(): void {
    // L133-171 の内容をここに移動
    this.elements.btnAddText.addEventListener('click', () => {
        this.app.openTextModal();
    });

    this.elements.textModalClose.addEventListener('click', () => {
        this.app.closeTextModal();
    });
    this.elements.textModalCancel.addEventListener('click', () => {
        this.app.closeTextModal();
    });
    this.elements.textModalOk.addEventListener('click', () => {
        this.app.addTextAnnotation();
    });

    this.elements.btnHighlight.addEventListener('click', () => {
        this.app.toggleHighlightMode();
    });
}

/**
 * ズームイベント
 */
private bindZoomEvents(): void {
    // L173-192 の内容をここに移動
    this.elements.btnZoomIn.addEventListener('click', () => this.app.zoomIn());
    this.elements.btnZoomOut.addEventListener('click', () => this.app.zoomOut());
    this.elements.btnZoomReset.addEventListener('click', () => this.app.resetZoom());

    window.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.app.zoomIn();
            } else {
                this.app.zoomOut();
            }
        }
    }, { passive: false });

    this.elements.btnUndo.addEventListener('click', () => this.app.undo());
    this.elements.btnRedo.addEventListener('click', () => this.app.redo());
}

/**
 * ページナビゲーションイベント
 */
private bindNavigationEvents(): void {
    // L152-166 の内容をここに移動
    this.elements.btnPrev.addEventListener('click', () => {
        this.app.selectPage(this.app.state.selectedPageIndex - 1);
    });

    this.elements.btnNext.addEventListener('click', () => {
        this.app.selectPage(this.app.state.selectedPageIndex + 1);
    });

    this.elements.previewCanvas.addEventListener('mousedown', (e) => this.app.onCanvasMouseDown(e));
    this.elements.previewCanvas.addEventListener('mousemove', (e) => this.app.onCanvasMouseMove(e));
    this.elements.previewCanvas.addEventListener('mouseup', (e) => this.app.onCanvasMouseUp(e));
    this.elements.previewCanvas.addEventListener('mouseleave', () => this.app.onCanvasMouseLeave());
    this.elements.previewCanvas.addEventListener('dblclick', (e) => this.app.onCanvasDoubleClick(e));
}
```

#### 変更2: bindShortcuts の重複削除 (L515-592)

`setupKeyboardShortcuts()` (L332-382) と `bindShortcuts()` (L515-592) に重複があります。

**対応**: `bindShortcuts()` のうち、`setupKeyboardShortcuts()` と重複しないコードのみを残す。

**重複しているショートカット**:
- Ctrl+Z (Undo) - 両方に存在
- Ctrl+Y / Ctrl+Shift+Z (Redo) - 両方に存在
- Ctrl+A (全選択) - 両方に存在
- Ctrl+D - `setupKeyboardShortcuts` では削除、`bindShortcuts` では複製
- Ctrl+C (コピー) - 両方に存在
- Ctrl+V (ペースト) - 両方に存在

**対応方針**:
1. `bindShortcuts()` から重複を削除
2. `setupKeyboardShortcuts()` に統一
3. Delete キーと Space キーのハンドリングは `bindShortcuts()` に残す

### 削減効果

| 項目 | Before | After |
|------|--------|-------|
| bindEvents() 行数 | 190行 | 約15行 (委譲のみ) |
| 重複コード削除 | - | 約30行 |

---

## Task 3: 型定義の最適化

### 概要

`types/index.ts` の肥大化した型定義を整理する。

### 現状

**ファイル**: `src/types/index.ts`
**サイズ**: 318行, 10KB

### 変更内容

#### オプション1: UndoAction を別ファイルに分離（推奨）

**新規ファイル**: `src/types/undo-actions.ts`

```typescript
import type { PageData, TextAnnotation, HighlightAnnotation } from './index';

/**
 * ページ操作のUndo
 */
export type PageUndoAction =
    | { type: 'deletePage'; page: PageData; index: number }
    | { type: 'movePage'; fromIndex: number; toIndex: number }
    | { type: 'rotatePage'; pageId: string; previousRotation: number; newRotation?: number }
    | { type: 'clear'; pages: PageData[]; selectedIndex: number }
    | { type: 'addImage'; pageId: string; index: number; page?: PageData }
    | { type: 'duplicatePage'; pageId: string; index: number; page?: PageData };

/**
 * 注釈操作のUndo
 */
export type AnnotationUndoAction =
    | { type: 'addText'; pageId: string; annotationId: string; annotation?: TextAnnotation }
    | { type: 'addHighlight'; pageId: string; annotationId: string; annotation?: HighlightAnnotation }
    | { type: 'moveText'; pageId: string; annotationId: string; fromX: number; fromY: number; toX: number; toY: number }
    | { type: 'rotateText'; pageId: string; annotationId: string; oldRotation: number; newRotation: number }
    | { type: 'moveHighlight'; pageId: string; annotationId: string; fromX: number; fromY: number; toX: number; toY: number }
    | { type: 'deleteText'; pageId: string; annotationId: string; annotation: TextAnnotation }
    | { type: 'deleteHighlight'; pageId: string; annotationId: string; annotation: HighlightAnnotation }
    | { type: 'updateText'; pageId: string; annotationId: string; oldText: string; newText: string; oldColor: string; newColor: string; oldFontSize: number; newFontSize: number }
    | { type: 'resizeHighlight'; pageId: string; annotationId: string; oldWidth: number; newWidth: number; oldHeight: number; newHeight: number };

/**
 * バッチ操作のUndo
 */
export type BatchUndoAction =
    | { type: 'batchMove'; fromIndices: number[]; toIndex: number; movedPageIds: string[] }
    | { type: 'batchRotate'; pageIds: string[]; previousRotations: number[] }
    | { type: 'batchDuplicate'; addedPages: { page: PageData; index: number }[] }
    | { type: 'batchDelete'; deletedPages: { page: PageData; index: number }[] };

/**
 * 全てのUndo操作
 */
export type UndoAction = PageUndoAction | AnnotationUndoAction | BatchUndoAction;
```

**index.ts の変更**:

```diff
-export type UndoAction =
-    | { type: 'deletePage'; page: PageData; index: number }
-    | { type: 'movePage'; fromIndex: number; toIndex: number }
-    ... (約20行削除)
-    | { type: 'batchDelete'; deletedPages: { page: PageData; index: number }[] };

+export type { UndoAction, PageUndoAction, AnnotationUndoAction, BatchUndoAction } from './undo-actions';
```

---

## Task 4: コードクリーンアップ

### 4.1 重複コメント削除

**ファイル**: `src/main.ts`

| 行番号 | 現在 | 修正後 |
|--------|------|--------|
| L183-184 | `// DOM Elements` が2回 | 1つに統合 |
| L363-369 | 空行が7行連続 | 1-2行に削減 |

**修正コード例 (L183-185)**:
```diff
-    // DOM Elements
     // DOM Elements
     private elements!: UIElements;
```

### 4.2 AnnotationManager のデバッグコメント削除

**ファイル**: `src/managers/AnnotationManager.ts`

**対象行**: L14-379 (約365行のコメント)

これらのコメントは座標変換のデバッグ用であり、`CoordinateTransformService` に分離後は不要となる。
Task 1 を実行すれば自動的に削除される。

### 4.3 未使用import の削除確認

リファクタリング後、以下を確認:

```bash
npx tsc --noEmit
```

未使用の import があればエラーとして表示される。

---

## 実装チェックリスト

### Task 1: CoordinateTransformService

- [ ] `src/services/CoordinateTransformService.ts` を作成
- [ ] `toPdfPoint` メソッドを実装（コメントなしの簡潔版）
- [ ] `toCanvasPoint` メソッドを実装
- [ ] `AnnotationManager.ts` にインポート追加
- [ ] `AnnotationManager.toPdfPoint` を委譲に変更
- [ ] `AnnotationManager.toCanvasPoint` を委譲に変更
- [ ] 古い実装（L4-442）を削除
- [ ] ビルド確認: `npm run build`
- [ ] 動作確認: PDF を開いて注釈を追加

### Task 2: EventManager リファクタリング

- [ ] `bindFileEvents()` メソッド追加
- [ ] `bindPageOperationEvents()` メソッド追加
- [ ] `bindAnnotationEvents()` メソッド追加
- [ ] `bindZoomEvents()` メソッド追加
- [ ] `bindNavigationEvents()` メソッド追加
- [ ] `bindEvents()` を委譲形式に変更
- [ ] `bindShortcuts()` の重複コード削除
- [ ] ビルド確認: `npm run build`
- [ ] 動作確認: 各ボタン・ショートカットが機能

### Task 3: 型定義の最適化

- [ ] `src/types/undo-actions.ts` を作成
- [ ] UndoAction を3つのカテゴリに分割
- [ ] `index.ts` から UndoAction 定義を削除
- [ ] `index.ts` に re-export 追加
- [ ] 全ファイルでインポートが機能することを確認
- [ ] ビルド確認: `npm run build`

### Task 4: コードクリーンアップ

- [ ] `main.ts` L183-184 の重複コメント削除
- [ ] `main.ts` の過剰な空行削除
- [ ] ビルド確認: `npm run build`

---

## 期待される最終結果

| ファイル | Before | After | 削減 |
|----------|--------|-------|------|
| `AnnotationManager.ts` | 906行 | ~480行 | ~426行 (47%) |
| `EventManager.ts` | 800行 | ~750行 | ~50行 (6%) |
| `types/index.ts` | 318行 | ~300行 | ~18行 (6%) |
| **合計削減** | - | - | **~494行** |

> [!NOTE]
> EventManager の変更はコード行数削減よりも可読性・保守性の向上が主目的です。
