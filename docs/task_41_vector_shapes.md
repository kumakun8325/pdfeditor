# Task: Phase 41 - ベクターシェイプ（図形描画）機能

Issue: #7
Status: VERIFICATION_NEEDED

## Goal
PDFエディターに図形描画機能を追加する。テキスト・ハイライト注釈と同様のパターンで、5種類の図形（直線・矢印・矩形・楕円・自由線）を実装。

## Background
既存の注釈機能（テキスト/ハイライト）は以下のパターンで実装済み:
- 型定義: `src/types/index.ts`
- 描画・ヒット判定: `AnnotationManager`
- マウス操作: `CanvasInteractionManager`
- Undo/Redo: `UndoManager` + `UndoExecutionManager`
- PDF保存: `PDFService.savePDF()`

## Current State Analysis

### 関連ファイル
- `src/types/index.ts` - 型定義（TextAnnotation, HighlightAnnotation, UndoAction）
- `src/managers/AnnotationManager.ts` (906行) - 描画・ヒット判定
- `src/managers/CanvasInteractionManager.ts` (526行) - マウス操作
- `src/managers/UndoExecutionManager.ts` - Undo/Redo実行
- `src/services/PDFService.ts` - PDF保存
- `index.html` - UI（ツールバー）

### 既存パターン
```typescript
// ハイライトモードのトグル（CanvasInteractionManager L507-511）
public toggleHighlightMode(): void {
    this.isHighlightMode = !this.isHighlightMode;
    this.elements.btnHighlight.classList.toggle('active', this.isHighlightMode);
    this.elements.previewCanvas.style.cursor = this.isHighlightMode ? 'crosshair' : 'default';
}
```

---

## Implementation Plan

### Step 1: 型定義の追加
**File**: `src/types/index.ts`
**Action**: ShapeAnnotation型とUndoAction拡張

```typescript
// L41の後に追加
/** シェイプの種類 */
export type ShapeType = 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'freehand';

/** シェイプ注釈 */
export interface ShapeAnnotation {
    id: string;
    type: ShapeType;
    x1: number;  // 開始点X (pt)
    y1: number;  // 開始点Y (pt)
    x2: number;  // 終了点X (pt)
    y2: number;  // 終了点Y (pt)
    path?: { x: number; y: number }[];  // freehand用
    strokeColor: string;
    fillColor?: string;  // 空文字=透明
    strokeWidth: number;
}
```

```typescript
// PageData (L74付近) に追加
shapeAnnotations?: ShapeAnnotation[];
```

```typescript
// UndoAction (L156付近) に追加
| { type: 'addShape'; pageId: string; annotationId: string; annotation?: ShapeAnnotation }
| { type: 'deleteShape'; pageId: string; annotationId: string; annotation: ShapeAnnotation }
| { type: 'moveShape'; pageId: string; annotationId: string; fromX1: number; fromY1: number; fromX2: number; fromY2: number; toX1: number; toY1: number; toX2: number; toY2: number }
| { type: 'resizeShape'; pageId: string; annotationId: string; oldX1: number; oldY1: number; oldX2: number; oldY2: number; newX1: number; newY1: number; newX2: number; newY2: number };
```

---

### Step 2: UI追加
**File**: `index.html`
**Action**: ツールバーに図形ボタン追加（L176の後、注釈グループの後に追加）

```html
<div class="toolbar-separator"></div>

<!-- 図形グループ -->
<div class="dropdown">
  <button id="btn-shapes" class="btn btn-secondary btn-icon-only" title="図形">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    </svg>
  </button>
  <div class="dropdown-menu" id="shape-menu">
    <button id="btn-shape-line" class="dropdown-item">
      <svg width="16" height="16"><line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" stroke-width="2"/></svg>
      直線
    </button>
    <button id="btn-shape-arrow" class="dropdown-item">
      <svg width="16" height="16"><line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" stroke-width="2"/><polyline points="8 2 14 2 14 8" stroke="currentColor" stroke-width="2" fill="none"/></svg>
      矢印
    </button>
    <button id="btn-shape-rect" class="dropdown-item">
      <svg width="16" height="16"><rect x="2" y="2" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"/></svg>
      矩形
    </button>
    <button id="btn-shape-ellipse" class="dropdown-item">
      <svg width="16" height="16"><ellipse cx="8" cy="8" rx="6" ry="4" stroke="currentColor" stroke-width="2" fill="none"/></svg>
      円/楕円
    </button>
    <button id="btn-shape-freehand" class="dropdown-item">
      <svg width="16" height="16"><path d="M2 14 Q5 2 8 8 T14 2" stroke="currentColor" stroke-width="2" fill="none"/></svg>
      ペン
    </button>
    <div class="dropdown-divider"></div>
    <div class="dropdown-item dropdown-item-inline">
      <label>太さ</label>
      <select id="shape-stroke-width">
        <option value="1">1px</option>
        <option value="2">2px</option>
        <option value="3" selected>3px</option>
        <option value="5">5px</option>
      </select>
    </div>
    <div class="dropdown-item dropdown-item-inline">
      <label>線</label>
      <input type="color" id="shape-stroke-color" value="#FF0000">
    </div>
    <div class="dropdown-item dropdown-item-inline">
      <label>塗り</label>
      <input type="color" id="shape-fill-color" value="#FFFFFF">
      <input type="checkbox" id="shape-fill-enabled">
    </div>
  </div>
</div>
```

---

### Step 3: UIElements型更新
**File**: `src/types/index.ts`
**Action**: UIElements (L173付近) に追加

```typescript
// 図形
btnShapes: HTMLButtonElement;
shapeMenu: HTMLDivElement;
btnShapeLine: HTMLButtonElement;
btnShapeArrow: HTMLButtonElement;
btnShapeRect: HTMLButtonElement;
btnShapeEllipse: HTMLButtonElement;
btnShapeFreehand: HTMLButtonElement;
shapeStrokeWidth: HTMLSelectElement;
shapeStrokeColor: HTMLInputElement;
shapeFillColor: HTMLInputElement;
shapeFillEnabled: HTMLInputElement;
```

---

### Step 4: AnnotationManager拡張
**File**: `src/managers/AnnotationManager.ts`
**Action**: 図形描画メソッド追加

```typescript
// drawAnnotations() の L516後（ハイライト描画の後）に追加
// 図形注釈を描画
if (page.shapeAnnotations && page.shapeAnnotations.length > 0) {
    for (const shape of page.shapeAnnotations) {
        const isSelected = shape.id === selectedAnnotationId;
        this.drawShape(ctx, shape, page.height, scale, isSelected);
    }
}
```

```typescript
// 新規メソッド（L585 drawHighlight の後に追加）
private static drawShape(
    ctx: CanvasRenderingContext2D,
    shape: ShapeAnnotation,
    pageHeight: number,
    scale: number,
    isSelected: boolean
): void {
    ctx.save();
    ctx.strokeStyle = shape.strokeColor;
    ctx.lineWidth = shape.strokeWidth * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const x1 = shape.x1 * scale;
    const y1 = (pageHeight - shape.y1) * scale;
    const x2 = shape.x2 * scale;
    const y2 = (pageHeight - shape.y2) * scale;

    switch (shape.type) {
        case 'line':
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            break;

        case 'arrow':
            // 線
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            // 矢じり
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLen = 10 * scale;
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fillStyle = shape.strokeColor;
            ctx.fill();
            break;

        case 'rectangle':
            if (shape.fillColor) {
                ctx.fillStyle = shape.fillColor;
                ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
            }
            ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
            break;

        case 'ellipse':
            const cx = (x1 + x2) / 2;
            const cy = (y1 + y2) / 2;
            const rx = Math.abs(x2 - x1) / 2;
            const ry = Math.abs(y2 - y1) / 2;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            if (shape.fillColor) {
                ctx.fillStyle = shape.fillColor;
                ctx.fill();
            }
            ctx.stroke();
            break;

        case 'freehand':
            if (shape.path && shape.path.length > 1) {
                ctx.beginPath();
                ctx.moveTo(shape.path[0].x * scale, (pageHeight - shape.path[0].y) * scale);
                for (let i = 1; i < shape.path.length; i++) {
                    ctx.lineTo(shape.path[i].x * scale, (pageHeight - shape.path[i].y) * scale);
                }
                ctx.stroke();
            }
            break;
    }

    // 選択枠
    if (isSelected) {
        ctx.strokeStyle = '#007aff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        const minX = Math.min(x1, x2) - 5;
        const minY = Math.min(y1, y2) - 5;
        const w = Math.abs(x2 - x1) + 10;
        const h = Math.abs(y2 - y1) + 10;
        ctx.strokeRect(minX, minY, w, h);
        ctx.setLineDash([]);
        // ハンドル
        this.drawHandle(ctx, Math.min(x1, x2), Math.min(y1, y2));
        this.drawHandle(ctx, Math.max(x1, x2), Math.min(y1, y2));
        this.drawHandle(ctx, Math.min(x1, x2), Math.max(y1, y2));
        this.drawHandle(ctx, Math.max(x1, x2), Math.max(y1, y2));
    }

    ctx.restore();
}
```

```typescript
// ヒット判定 (L877後に追加)
public static hitTestShape(
    page: PageData,
    pdfX: number,
    pdfY: number
): ShapeAnnotation | null {
    if (!page.shapeAnnotations || page.shapeAnnotations.length === 0) return null;
    const margin = 5;

    for (let i = page.shapeAnnotations.length - 1; i >= 0; i--) {
        const s = page.shapeAnnotations[i];
        const minX = Math.min(s.x1, s.x2) - margin;
        const maxX = Math.max(s.x1, s.x2) + margin;
        const minY = Math.min(s.y1, s.y2) - margin;
        const maxY = Math.max(s.y1, s.y2) + margin;

        if (pdfX >= minX && pdfX <= maxX && pdfY >= minY && pdfY <= maxY) {
            return s;
        }
    }
    return null;
}
```

---

### Step 5: CanvasInteractionManager拡張
**File**: `src/managers/CanvasInteractionManager.ts`
**Action**: 図形描画モードの追加

```typescript
// L29付近に追加
import type { ShapeType, ShapeAnnotation } from '../types';

// プライベートフィールド追加 (L30-49付近)
private shapeDrawingMode: ShapeType | null = null;
private drawingShape: ShapeAnnotation | null = null;
private shapeStrokeColor = '#FF0000';
private shapeStrokeWidth = 3;
private shapeFillColor = '';
```

```typescript
// 新規メソッド追加
public setShapeMode(type: ShapeType | null): void {
    this.shapeDrawingMode = type;
    this.disableHighlightMode();
    this.elements.previewCanvas.style.cursor = type ? 'crosshair' : 'default';
    this.elements.btnShapes?.classList.toggle('active', !!type);
}

public setShapeOptions(strokeColor: string, strokeWidth: number, fillColor: string): void {
    this.shapeStrokeColor = strokeColor;
    this.shapeStrokeWidth = strokeWidth;
    this.shapeFillColor = fillColor;
}
```

```typescript
// onCanvasMouseDown() のハイライトモード判定 (L109) の前に追加
// 図形描画モード
if (this.shapeDrawingMode && e.button !== 2) {
    const newShape: ShapeAnnotation = {
        id: crypto.randomUUID(),
        type: this.shapeDrawingMode,
        x1: pdfX,
        y1: pdfY,
        x2: pdfX,
        y2: pdfY,
        strokeColor: this.shapeStrokeColor,
        strokeWidth: this.shapeStrokeWidth,
        fillColor: this.shapeFillColor || undefined,
        path: this.shapeDrawingMode === 'freehand' ? [{ x: pdfX, y: pdfY }] : undefined
    };
    this.drawingShape = newShape;
    this.selectedAnnotationId = null;
    e.preventDefault();
    return;
}
```

```typescript
// onCanvasMouseMove() のハイライトプレビュー (L261) の前に追加
// 図形描画プレビュー
if (this.drawingShape) {
    const point = AnnotationManager.toPdfPoint(canvasX, canvasY, this.previewScale, page.height, page.width, page.rotation);
    if (this.drawingShape.type === 'freehand') {
        this.drawingShape.path!.push({ x: point.x, y: point.y });
    } else {
        this.drawingShape.x2 = point.x;
        this.drawingShape.y2 = point.y;
    }
    // 一時描画
    if (this.renderManager) {
        this.renderManager.redrawWithCachedBackground(null);
    }
    const ctx = this.elements.previewCanvas.getContext('2d')!;
    AnnotationManager.drawShape(ctx, this.drawingShape, page.height, this.previewScale, false);
    return;
}
```

```typescript
// onCanvasMouseUp() のハイライト作成 (L363) の前に追加
// 図形作成確定
if (this.drawingShape && page) {
    const shape = this.drawingShape;
    // 最小サイズチェック
    const minSize = shape.type === 'freehand' 
        ? (shape.path?.length || 0) > 3 
        : Math.abs(shape.x2 - shape.x1) > 5 || Math.abs(shape.y2 - shape.y1) > 5;
    
    if (minSize) {
        if (!page.shapeAnnotations) page.shapeAnnotations = [];
        page.shapeAnnotations.push(shape);
        this.callbacks.pushUndo({ type: 'addShape', pageId: page.id, annotationId: shape.id });
        this.callbacks.showToast('図形を追加しました', 'success');
        this.selectedAnnotationId = shape.id;
    }
    this.drawingShape = null;
    if (this.renderManager) {
        this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
    }
    return;
}
```

---

### Step 6: UndoExecutionManager拡張
**File**: `src/managers/UndoExecutionManager.ts`
**Action**: 図形Undo/Redoハンドラー追加

```typescript
// 既存のswitch文に追加
case 'addShape':
    // Undo: 追加した図形を削除
    const addShapePage = this.pages.find(p => p.id === action.pageId);
    if (addShapePage?.shapeAnnotations) {
        const idx = addShapePage.shapeAnnotations.findIndex(s => s.id === action.annotationId);
        if (idx !== -1) {
            action.annotation = addShapePage.shapeAnnotations[idx];
            addShapePage.shapeAnnotations.splice(idx, 1);
        }
    }
    break;

case 'deleteShape':
    // Undo: 削除した図形を復元
    const delShapePage = this.pages.find(p => p.id === action.pageId);
    if (delShapePage && action.annotation) {
        if (!delShapePage.shapeAnnotations) delShapePage.shapeAnnotations = [];
        delShapePage.shapeAnnotations.push(action.annotation);
    }
    break;

case 'moveShape':
    const moveShapePage = this.pages.find(p => p.id === action.pageId);
    const moveShape = moveShapePage?.shapeAnnotations?.find(s => s.id === action.annotationId);
    if (moveShape) {
        moveShape.x1 = action.fromX1;
        moveShape.y1 = action.fromY1;
        moveShape.x2 = action.fromX2;
        moveShape.y2 = action.fromY2;
    }
    break;
```

---

### Step 7: PDF保存対応
**File**: `src/services/PDFService.ts`
**Action**: savePDF()で図形をPDFに埋め込み

pdf-libの描画メソッドを使用:
- `page.drawLine()` - 直線・矢印
- `page.drawRectangle()` - 矩形
- `page.drawEllipse()` - 楕円
- 連続`drawLine()` - 自由線

---

## Acceptance Criteria
- [ ] 5種類の図形が描画できる（直線・矢印・矩形・楕円・自由線）
- [ ] 図形の色・線の太さを設定できる
- [ ] 矩形・楕円で塗りつぶしの有無を選択できる
- [ ] 図形を選択・移動・削除できる
- [ ] Undo/Redoが動作する
- [ ] PDFに保存される
- [ ] `npm run build` が成功する

## Verification Steps
1. `npm run dev` で開発サーバー起動
2. ブラウザで http://localhost:5173 を開く
3. PDFを読み込む
4. 図形ボタンから各シェイプを選択して描画
5. 描画した図形をクリックして選択
6. ドラッグで移動
7. Ctrl+Z でUndo
8. PDFを保存してAdobe Readerで確認

## NOT in Scope
- 図形のリサイズ（Phase 41.5で対応予定）
- 図形の回転
- 複数図形の一括選択
