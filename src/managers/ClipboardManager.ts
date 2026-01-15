import type { AppState, PageData, ToastType, TextAnnotation, HighlightAnnotation, UndoAction } from '../types';
import type { PDFService } from '../services/PDFService';
import type { RenderManager } from './RenderManager';

/**
 * クリップボード操作コールバック
 */
export interface ClipboardCallbacks {
    showToast: (message: string, type: ToastType) => void;
    pushUndo: (action: UndoAction) => void;
    renderPageList: () => void;
    updateMainView: () => void;
    updatePageNav: () => void;
    updateUI: () => void;
    getSelectedAnnotationId: () => string | null;
    setSelectedAnnotationId: (id: string | null) => void;
}

/**
 * コピー/ペースト処理を担当するマネージャー
 */
export class ClipboardManager {
    private clipboard: TextAnnotation | HighlightAnnotation | null = null;
    private pageClipboard: PageData | null = null;

    constructor(
        private getState: () => AppState,
        private pdfService: PDFService,
        private getRenderManager: () => RenderManager | null,
        private callbacks: ClipboardCallbacks
    ) {}

    private get state(): AppState {
        return this.getState();
    }

    private get renderManager(): RenderManager | null {
        return this.getRenderManager();
    }

    /**
     * コピー処理
     */
    public handleCopy(): void {
        if (this.state.selectedPageIndex < 0) return;
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        const selectedAnnotationId = this.callbacks.getSelectedAnnotationId();

        // 1. 注釈コピー (選択中なら優先)
        if (selectedAnnotationId) {
            // テキストから検索
            if (page.textAnnotations) {
                const ann = page.textAnnotations.find(a => a.id === selectedAnnotationId);
                if (ann) {
                    this.clipboard = JSON.parse(JSON.stringify(ann));
                    this.pageClipboard = null;
                    this.callbacks.showToast('注釈をコピーしました', 'success');
                    return;
                }
            }
            // ハイライトから検索
            if (page.highlightAnnotations) {
                const ann = page.highlightAnnotations.find(a => a.id === selectedAnnotationId);
                if (ann) {
                    this.clipboard = JSON.parse(JSON.stringify(ann));
                    this.pageClipboard = null;
                    this.callbacks.showToast('注釈をコピーしました', 'success');
                    return;
                }
            }
        }

        // 2. ページコピー (注釈非選択時)
        this.pageClipboard = {
            ...page,
            textAnnotations: page.textAnnotations?.map(a => ({ ...a })),
            highlightAnnotations: page.highlightAnnotations?.map(a => ({ ...a }))
        };
        this.clipboard = null;
        this.callbacks.showToast('ページをコピーしました', 'success');
    }

    /**
     * ペースト処理
     */
    public handlePaste(): void {
        if (this.state.selectedPageIndex < 0) return;
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        // 1. 注釈ペースト
        if (this.clipboard) {
            const newId = crypto.randomUUID();
            const offsetX = 20;
            const offsetY = -20;

            if ('text' in this.clipboard) {
                const newAnn: TextAnnotation = {
                    ...this.clipboard as TextAnnotation,
                    id: newId,
                    x: (this.clipboard.x || 0) + offsetX,
                    y: (this.clipboard.y || 0) + offsetY
                };

                if (!page.textAnnotations) page.textAnnotations = [];
                page.textAnnotations.push(newAnn);
                this.callbacks.pushUndo({ type: 'addText', pageId: page.id, annotationId: newId, annotation: newAnn });
                this.callbacks.setSelectedAnnotationId(newId);
            } else {
                const newAnn: HighlightAnnotation = {
                    ...this.clipboard as HighlightAnnotation,
                    id: newId,
                    x: (this.clipboard.x || 0) + offsetX,
                    y: (this.clipboard.y || 0) + offsetY
                };

                if (!page.highlightAnnotations) page.highlightAnnotations = [];
                page.highlightAnnotations.push(newAnn);
                this.callbacks.pushUndo({ type: 'addHighlight', pageId: page.id, annotationId: newId, annotation: newAnn });
                this.callbacks.setSelectedAnnotationId(newId);
            }

            this.callbacks.showToast('注釈を貼り付けました', 'success');
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(null);
            } else {
                this.callbacks.updateMainView();
            }
            return;
        }

        // 2. ページペースト
        if (this.pageClipboard) {
            const duplicatedPage: PageData = {
                ...this.pageClipboard,
                textAnnotations: this.pageClipboard.textAnnotations?.map(a => ({ ...a })),
                highlightAnnotations: this.pageClipboard.highlightAnnotations?.map(a => ({ ...a })),
                id: crypto.randomUUID(),
            };

            const insertIndex = this.state.selectedPageIndex + 1;
            this.state.pages = this.pdfService.insertPageAt(
                this.state.pages,
                duplicatedPage,
                insertIndex
            );
            this.state.selectedPageIndex = insertIndex;

            this.callbacks.pushUndo({
                type: 'duplicatePage',
                pageId: duplicatedPage.id,
                index: insertIndex
            });

            this.callbacks.renderPageList();
            this.callbacks.updateMainView();
            this.callbacks.updatePageNav();
            this.callbacks.updateUI();
            this.callbacks.showToast('ページを貼り付けました', 'success');
        }
    }
}
