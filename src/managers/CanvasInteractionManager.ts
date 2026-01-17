import type { AppState, PageData, ToastType, TextAnnotation, HighlightAnnotation, ShapeAnnotation, ShapeType, UndoAction, UIElements } from '../types';
import { AnnotationManager } from './AnnotationManager';
import type { RenderManager } from './RenderManager';

/**
 * Canvas操作コールバック
 */
export interface CanvasInteractionCallbacks {
    showToast: (message: string, type: ToastType) => void;
    pushUndo: (action: UndoAction) => void;
    updateMainView: () => void;
    openTextModal: (annotation?: TextAnnotation) => void;
    getSelectedAnnotationId: () => string | null;
    setSelectedAnnotationId: (id: string | null) => void;
}

/**
 * Canvas マウスイベントを担当するマネージャー
 */
export class CanvasInteractionManager {
    // ドラッグ状態
    private draggingAnnotation: TextAnnotation | HighlightAnnotation | ShapeAnnotation | null = null;
    private dragOffset = { x: 0, y: 0 };
    private draggingStart: { x: number; y: number; x2?: number; y2?: number } | null = null;

    // ハイライトモード
    private isHighlightMode = false;
    private highlightStart: { x: number; y: number } | null = null;
    private highlightColor = '#FFFF00';

    // シェイプ描画モード
    private shapeDrawingMode: ShapeType | null = null;
    private drawingShape: ShapeAnnotation | null = null;
    private shapeStrokeColor = '#FF0000';
    private shapeStrokeWidth = 3;
    private shapeFillColor = '';

    // リサイズ状態
    private isResizing = false;
    private resizeStart: {
        x: number;
        y: number;
        originalSize: number | { width: number; height: number };
        annotation: TextAnnotation | HighlightAnnotation;
        type: 'text' | 'highlight';
    } | null = null;

    // ドラッグレンダリング
    private isDraggingRenderPending = false;
    private lastMouseEvent: MouseEvent | null = null;

    // 回転状態
    private rotatingAnnotationId: string | null = null;
    private rotationStartAngle: number = 0;
    private initialRotation: number = 0;

    constructor(
        private getState: () => AppState,
        private elements: UIElements,
        private getRenderManager: () => RenderManager | null,
        private getPreviewScale: () => number,
        private getBackgroundImageData: () => ImageData | null,
        private callbacks: CanvasInteractionCallbacks
    ) {}

    private get state(): AppState {
        return this.getState();
    }

    private get renderManager(): RenderManager | null {
        return this.getRenderManager();
    }

    private get previewScale(): number {
        return this.getPreviewScale();
    }

    private get backgroundImageData(): ImageData | null {
        return this.getBackgroundImageData();
    }

    private get selectedAnnotationId(): string | null {
        return this.callbacks.getSelectedAnnotationId();
    }

    private set selectedAnnotationId(id: string | null) {
        this.callbacks.setSelectedAnnotationId(id);
    }

    /**
     * MouseEventからCanvas上の座標を取得
     */
    private getCanvasPoint(e: MouseEvent): { x: number; y: number } {
        const canvas = this.elements.previewCanvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    public onCanvasMouseDown(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        const { x: canvasX, y: canvasY } = this.getCanvasPoint(e);
        const point = AnnotationManager.toPdfPoint(
            canvasX, canvasY, this.previewScale, page.height, page.width, page.rotation
        );
        const pdfX = point.x;
        const pdfY = point.y;

        // シェイプ描画モード
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

        // ハイライトモード
        if (this.isHighlightMode && e.button !== 2) {
            this.highlightStart = { x: pdfX, y: pdfY };
            this.selectedAnnotationId = null;
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(null);
            } else {
                this.callbacks.updateMainView();
            }
            e.preventDefault();
            return;
        }

        // リサイズ/回転ハンドルの判定
        if (this.selectedAnnotationId) {
            const ctx = this.elements.previewCanvas.getContext('2d')!;

            // 回転ハンドル
            const hitRotHandle = AnnotationManager.hitTestTextRotationHandle(
                ctx, page, pdfX, pdfY, this.previewScale, this.selectedAnnotationId
            );
            if (hitRotHandle) {
                this.rotatingAnnotationId = hitRotHandle.id;
                const metrics = AnnotationManager.getTextMetrics(ctx, hitRotHandle.text, hitRotHandle.fontSize, this.previewScale);
                const textWidthPdf = metrics.width / this.previewScale;
                const textHeightPdf = metrics.height / this.previewScale;
                const centerX = hitRotHandle.x + textWidthPdf / 2;
                const centerY = hitRotHandle.y - textHeightPdf / 2;
                const dy = pdfY - centerY;
                const dx = pdfX - centerX;
                this.rotationStartAngle = Math.atan2(dy, dx);
                this.initialRotation = hitRotHandle.rotation || 0;
                this.elements.previewCanvas.style.cursor = 'grabbing';
                e.preventDefault();
                return;
            }

            // テキストリサイズハンドル
            const hitHandle = AnnotationManager.hitTestTextHandle(
                ctx, page, pdfX, pdfY, this.previewScale, this.selectedAnnotationId
            );
            if (hitHandle) {
                this.isResizing = true;
                this.resizeStart = {
                    x: e.clientX, y: e.clientY, originalSize: hitHandle.fontSize,
                    annotation: hitHandle, type: 'text'
                };
                this.elements.previewCanvas.style.cursor = 'nwse-resize';
                e.preventDefault();
                return;
            }
        }

        // テキスト注釈のヒット判定
        const ctx = this.elements.previewCanvas.getContext('2d')!;
        const hitText = AnnotationManager.hitTestText(ctx, page, pdfX, pdfY, this.previewScale);
        if (hitText) {
            this.selectedAnnotationId = hitText.id;
            this.draggingAnnotation = hitText;
            this.draggingStart = { x: hitText.x, y: hitText.y };
            this.dragOffset.x = pdfX - hitText.x;
            this.dragOffset.y = pdfY - hitText.y;
            this.elements.previewCanvas.style.cursor = 'grabbing';
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
            } else {
                this.callbacks.updateMainView();
            }
            e.preventDefault();
            return;
        }

        // ハイライトリサイズハンドル
        if (this.selectedAnnotationId) {
            const hitHighlight = AnnotationManager.hitTestHighlightHandle(page, pdfX, pdfY, this.selectedAnnotationId, this.previewScale);
            if (hitHighlight) {
                this.isResizing = true;
                this.resizeStart = {
                    x: e.clientX, y: e.clientY,
                    originalSize: { width: hitHighlight.width, height: hitHighlight.height },
                    annotation: hitHighlight, type: 'highlight'
                };
                this.draggingAnnotation = null;
                e.preventDefault();
                return;
            }
        }

        // ハイライト注釈のヒット判定
        const hitHighlight = AnnotationManager.hitTestHighlight(page, pdfX, pdfY);
        if (hitHighlight) {
            this.selectedAnnotationId = hitHighlight.id;
            this.draggingAnnotation = hitHighlight;
            this.draggingStart = { x: hitHighlight.x, y: hitHighlight.y };
            this.dragOffset.x = pdfX - hitHighlight.x;
            this.dragOffset.y = pdfY - hitHighlight.y;
            this.elements.previewCanvas.style.cursor = 'grabbing';
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
            } else {
                this.callbacks.updateMainView();
            }
            e.preventDefault();
            return;
        }

        // シェイプ注釈のヒット判定
        const hitShape = AnnotationManager.hitTestShape(page, pdfX, pdfY);
        if (hitShape) {
            this.selectedAnnotationId = hitShape.id;
            this.draggingAnnotation = hitShape;
            this.draggingStart = { x: hitShape.x1, y: hitShape.y1, x2: hitShape.x2, y2: hitShape.y2 };
            this.dragOffset.x = pdfX - hitShape.x1;
            this.dragOffset.y = pdfY - hitShape.y1;
            this.elements.previewCanvas.style.cursor = 'grabbing';
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
            } else {
                this.callbacks.updateMainView();
            }
            e.preventDefault();
            return;
        }

        // 選択解除
        if (this.selectedAnnotationId) {
            this.selectedAnnotationId = null;
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(null);
            } else {
                this.callbacks.updateMainView();
            }
        }
    }

    public onCanvasMouseMove(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        const isHighlightDragging = this.isHighlightMode && !!this.highlightStart;
        const isAnnotationDragging = !!this.draggingAnnotation;
        const isRotating = !!this.rotatingAnnotationId;
        const isShapeDrawing = !!this.drawingShape;

        if (this.isResizing && this.resizeStart) {
            e.preventDefault();
        } else if (isHighlightDragging || isAnnotationDragging || isRotating || isShapeDrawing) {
            e.preventDefault();
        } else {
            return;
        }

        this.lastMouseEvent = e;
        if (this.isDraggingRenderPending) return;

        this.isDraggingRenderPending = true;
        requestAnimationFrame(() => {
            if (!this.state.pages[this.state.selectedPageIndex] || !this.lastMouseEvent) {
                this.isDraggingRenderPending = false;
                return;
            }
            this.handleCanvasMouseMove(this.lastMouseEvent, page);
            this.isDraggingRenderPending = false;
            this.lastMouseEvent = null;
        });
    }

    private handleCanvasMouseMove(e: MouseEvent, page: PageData): void {
        const { x: canvasX, y: canvasY } = this.getCanvasPoint(e);
        const canvas = this.elements.previewCanvas;

        // シェイプ描画プレビュー
        if (this.drawingShape) {
            const point = AnnotationManager.toPdfPoint(
                canvasX, canvasY, this.previewScale, page.height, page.width, page.rotation
            );
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

        // ハイライトプレビュー
        if (this.isHighlightMode && this.highlightStart) {
            if (!this.backgroundImageData) return;
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(null);
            } else {
                this.callbacks.updateMainView();
            }
            const ctx = canvas.getContext('2d')!;
            const startCanvasX = this.highlightStart.x * this.previewScale;
            const startCanvasY = (page.height - this.highlightStart.y) * this.previewScale;
            ctx.save();
            ctx.fillStyle = this.highlightColor;
            ctx.globalAlpha = 0.3;
            ctx.fillRect(
                Math.min(startCanvasX, canvasX), Math.min(startCanvasY, canvasY),
                Math.abs(canvasX - startCanvasX), Math.abs(canvasY - startCanvasY)
            );
            ctx.restore();
            return;
        }

        // 回転ドラッグ
        if (this.rotatingAnnotationId) {
            const annotation = page.textAnnotations?.find(a => a.id === this.rotatingAnnotationId);
            if (annotation) {
                const ctx = this.elements.previewCanvas.getContext('2d')!;
                const metrics = AnnotationManager.getTextMetrics(ctx, annotation.text, annotation.fontSize, this.previewScale);
                const textWidthPdf = metrics.width / this.previewScale;
                const textHeightPdf = metrics.height / this.previewScale;
                const centerX = annotation.x + textWidthPdf / 2;
                const centerY = annotation.y - textHeightPdf / 2;

                const point = AnnotationManager.toPdfPoint(
                    canvasX, canvasY, this.previewScale, page.height, page.width, page.rotation
                );
                const dx = point.x - centerX;
                const dy = point.y - centerY;
                const currentAngle = Math.atan2(dy, dx);
                const deltaAngle = currentAngle - this.rotationStartAngle;
                const deltaDeg = deltaAngle * 180 / Math.PI;
                annotation.rotation = this.initialRotation - deltaDeg;

                if (this.renderManager) {
                    this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                } else {
                    this.callbacks.updateMainView();
                }
            }
            return;
        }

        // 注釈ドラッグ
        if (this.draggingAnnotation) {
            const point = AnnotationManager.toPdfPoint(
                canvasX, canvasY, this.previewScale, page.height, page.width, page.rotation
            );
            // シェイプの場合はx1/y1とx2/y2を両方移動
            if ('x1' in this.draggingAnnotation) {
                const shape = this.draggingAnnotation as ShapeAnnotation;
                const dx = (point.x - this.dragOffset.x) - shape.x1;
                const dy = (point.y - this.dragOffset.y) - shape.y1;
                shape.x1 += dx;
                shape.y1 += dy;
                shape.x2 += dx;
                shape.y2 += dy;
                // freehand用: パス全体を移動
                if (shape.path) {
                    for (const p of shape.path) {
                        p.x += dx;
                        p.y += dy;
                    }
                }
            } else {
                this.draggingAnnotation.x = point.x - this.dragOffset.x;
                this.draggingAnnotation.y = point.y - this.dragOffset.y;
            }
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
            } else {
                this.callbacks.updateMainView();
            }
            return;
        }

        // リサイズ
        if (this.isResizing && this.resizeStart) {
            const dx = e.clientX - this.resizeStart.x;
            const dy = e.clientY - this.resizeStart.y;

            if (this.resizeStart.type === 'text') {
                const startSize = this.resizeStart.originalSize as number;
                const delta = dy / this.previewScale;
                let newSize = startSize + delta;
                newSize = Math.max(8, Math.min(newSize, 300));
                (this.resizeStart.annotation as TextAnnotation).fontSize = newSize;
            } else if (this.resizeStart.type === 'highlight') {
                const startDims = this.resizeStart.originalSize as { width: number; height: number };
                const dPdfX = dx / this.previewScale;
                const dPdfY = dy / this.previewScale;
                let newWidth = startDims.width + dPdfX;
                let newHeight = startDims.height + dPdfY;
                newWidth = Math.max(5, newWidth);
                newHeight = Math.max(5, newHeight);
                const hl = this.resizeStart.annotation as HighlightAnnotation;
                hl.width = newWidth;
                hl.height = newHeight;
            }

            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
            } else {
                this.callbacks.updateMainView();
            }
        }
    }

    public onCanvasMouseUp(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];

        // シェイプ作成確定
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
            this.shapeDrawingMode = null;
            this.elements.previewCanvas.style.cursor = 'default';
            this.elements.btnShapes?.classList.remove('active');
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
            }
            return;
        }

        // ハイライト作成
        if (this.isHighlightMode && this.highlightStart) {
            if (page) {
                const { x: canvasX, y: canvasY } = this.getCanvasPoint(e);
                const point = AnnotationManager.toPdfPoint(
                    canvasX, canvasY, this.previewScale, page.height, page.width, page.rotation
                );
                const pdfX = point.x;
                const pdfY = point.y;
                const startX = this.highlightStart.x;
                const startY = this.highlightStart.y;

                const highlight: HighlightAnnotation = {
                    id: crypto.randomUUID(),
                    x: Math.min(startX, pdfX),
                    y: Math.max(startY, pdfY),
                    width: Math.abs(pdfX - startX),
                    height: Math.abs(pdfY - startY),
                    color: this.highlightColor,
                };

                if (highlight.width > 5 && highlight.height > 5) {
                    if (!page.highlightAnnotations) page.highlightAnnotations = [];
                    page.highlightAnnotations.push(highlight);
                    this.callbacks.pushUndo({ type: 'addHighlight', pageId: page.id, annotationId: highlight.id });
                    this.callbacks.showToast('ハイライトを追加しました', 'success');
                    this.selectedAnnotationId = highlight.id;
                }
            }
            this.highlightStart = null;
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(null);
            } else {
                this.callbacks.updateMainView();
            }
            return;
        }

        // 回転終了
        if (this.rotatingAnnotationId) {
            const annotation = page?.textAnnotations?.find(a => a.id === this.rotatingAnnotationId);
            if (annotation && page) {
                this.callbacks.pushUndo({
                    type: 'rotateText', pageId: page.id, annotationId: annotation.id,
                    oldRotation: this.initialRotation, newRotation: annotation.rotation || 0
                });
            }
            this.rotatingAnnotationId = null;
            this.elements.previewCanvas.style.cursor = 'default';
        }

        // ドラッグ終了
        if (this.draggingAnnotation) {
            this.commitAnnotationDrag();
            this.draggingAnnotation = null;
            this.draggingStart = null;
            this.elements.previewCanvas.style.cursor = 'default';
        }

        // リサイズ終了
        if (this.isResizing && this.resizeStart) {
            const ann = this.resizeStart.annotation;
            if (this.resizeStart.type === 'text') {
                const startSize = this.resizeStart.originalSize as number;
                const textAnn = ann as TextAnnotation;
                if (Math.abs(textAnn.fontSize - startSize) > 0.5 && page) {
                    this.callbacks.pushUndo({
                        type: 'updateText', pageId: page.id, annotationId: textAnn.id,
                        oldText: textAnn.text, newText: textAnn.text,
                        oldColor: textAnn.color, newColor: textAnn.color,
                        oldFontSize: startSize, newFontSize: textAnn.fontSize
                    });
                }
            } else if (this.resizeStart.type === 'highlight' && page) {
                const startDims = this.resizeStart.originalSize as { width: number; height: number };
                const hlAnn = ann as HighlightAnnotation;
                if (Math.abs(hlAnn.width - startDims.width) > 1 || Math.abs(hlAnn.height - startDims.height) > 1) {
                    this.callbacks.pushUndo({
                        type: 'resizeHighlight', pageId: page.id, annotationId: hlAnn.id,
                        oldWidth: startDims.width, newWidth: hlAnn.width,
                        oldHeight: startDims.height, newHeight: hlAnn.height
                    });
                }
            }
            this.isResizing = false;
            this.resizeStart = null;
            this.elements.previewCanvas.style.cursor = 'default';
        }
    }

    public onCanvasMouseLeave(): void {
        this.highlightStart = null;
        if (this.draggingAnnotation) {
            this.commitAnnotationDrag();
            this.draggingAnnotation = null;
            this.draggingStart = null;
            this.elements.previewCanvas.style.cursor = 'default';
        }
        if (this.isHighlightMode && this.renderManager) {
            this.renderManager.redrawWithCachedBackground(null);
        }
        if (this.rotatingAnnotationId) {
            this.rotatingAnnotationId = null;
            this.elements.previewCanvas.style.cursor = 'default';
        }
    }

    public onCanvasDoubleClick(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        const { x: canvasX, y: canvasY } = this.getCanvasPoint(e);
        const point = AnnotationManager.toPdfPoint(
            canvasX, canvasY, this.previewScale, page.height, page.width, page.rotation
        );
        const ctx = this.elements.previewCanvas.getContext('2d')!;
        const hitAnnotation = AnnotationManager.hitTestText(ctx, page, point.x, point.y, this.previewScale);

        if (hitAnnotation) {
            this.selectedAnnotationId = hitAnnotation.id;
            this.callbacks.openTextModal(hitAnnotation);
        }
    }

    private commitAnnotationDrag(): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (page && this.draggingAnnotation && this.draggingStart) {
            // シェイプの場合
            if ('x1' in this.draggingAnnotation) {
                const shape = this.draggingAnnotation as ShapeAnnotation;
                const startX2 = this.draggingStart.x2 ?? shape.x2;
                const startY2 = this.draggingStart.y2 ?? shape.y2;
                if (Math.abs(this.draggingStart.x - shape.x1) > 1 || Math.abs(this.draggingStart.y - shape.y1) > 1) {
                    this.callbacks.pushUndo({
                        type: 'moveShape', pageId: page.id, annotationId: shape.id,
                        fromX1: this.draggingStart.x, fromY1: this.draggingStart.y,
                        fromX2: startX2, fromY2: startY2,
                        toX1: shape.x1, toY1: shape.y1,
                        toX2: shape.x2, toY2: shape.y2
                    });
                }
            } else if (Math.abs(this.draggingStart.x - this.draggingAnnotation.x) > 1 || Math.abs(this.draggingStart.y - this.draggingAnnotation.y) > 1) {
                if ('text' in this.draggingAnnotation) {
                    this.callbacks.pushUndo({
                        type: 'moveText', pageId: page.id, annotationId: this.draggingAnnotation.id,
                        fromX: this.draggingStart.x, fromY: this.draggingStart.y,
                        toX: this.draggingAnnotation.x, toY: this.draggingAnnotation.y
                    });
                } else {
                    this.callbacks.pushUndo({
                        type: 'moveHighlight', pageId: page.id, annotationId: this.draggingAnnotation.id,
                        fromX: this.draggingStart.x, fromY: this.draggingStart.y,
                        toX: this.draggingAnnotation.x, toY: this.draggingAnnotation.y
                    });
                }
            }
        }
    }

    public toggleHighlightMode(): void {
        this.isHighlightMode = !this.isHighlightMode;
        this.elements.btnHighlight.classList.toggle('active', this.isHighlightMode);
        this.elements.previewCanvas.style.cursor = this.isHighlightMode ? 'crosshair' : 'default';
        this.callbacks.showToast(this.isHighlightMode ? 'マーカーモード: ドラッグで範囲選択' : 'マーカーモード解除', 'success');
    }

    public disableHighlightMode(): void {
        if (this.isHighlightMode) {
            this.isHighlightMode = false;
            this.elements.btnHighlight.classList.remove('active');
            this.elements.previewCanvas.style.cursor = 'default';
        }
    }

    public getIsHighlightMode(): boolean {
        return this.isHighlightMode;
    }

    public setShapeMode(type: ShapeType | null): void {
        // 同じタイプが選択された場合は解除（トグル動作）
        if (this.shapeDrawingMode === type) {
            this.shapeDrawingMode = null;
            this.elements.previewCanvas.style.cursor = 'default';
            this.elements.btnShapes?.classList.remove('active');
            this.callbacks.showToast('図形モード解除', 'success');
            return;
        }
        this.shapeDrawingMode = type;
        this.disableHighlightMode();
        this.elements.previewCanvas.style.cursor = type ? 'crosshair' : 'default';
        this.elements.btnShapes?.classList.toggle('active', !!type);
        if (type) {
            this.callbacks.showToast(`図形モード: ${this.getShapeTypeName(type)}`, 'success');
        }
    }

    public setShapeOptions(strokeColor: string, strokeWidth: number, fillColor: string): void {
        this.shapeStrokeColor = strokeColor;
        this.shapeStrokeWidth = strokeWidth;
        this.shapeFillColor = fillColor;
    }

    public getShapeDrawingMode(): ShapeType | null {
        return this.shapeDrawingMode;
    }

    private getShapeTypeName(type: ShapeType): string {
        const names: Record<ShapeType, string> = {
            line: '直線',
            arrow: '矢印',
            rectangle: '矩形',
            ellipse: '円/楕円',
            freehand: 'ペン'
        };
        return names[type];
    }
}
