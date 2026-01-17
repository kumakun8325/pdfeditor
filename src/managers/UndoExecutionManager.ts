import type { AppState, ToastType } from '../types';
import type { UndoManager } from './UndoManager';
import type { RenderManager } from './RenderManager';
import type { PageManager } from './PageManager';
import type { PDFService } from '../services/PDFService';

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
 * UndoManager はスタック管理のみ、このクラスが実際の操作を実行
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
     * Undo実行
     */
    public undo(): void {
        const action = this.undoManager.popUndo();
        if (!action) {
            this.callbacks.showToast('取り消す操作がありません', 'warning');
            return;
        }

        const selectedAnnotationId = this.callbacks.getSelectedAnnotationId();

        switch (action.type) {
            case 'deletePage':
                this.state.pages = this.pdfService.insertPageAt(
                    this.state.pages,
                    action.page,
                    action.index
                );
                this.state.selectedPageIndex = action.index;
                this.callbacks.renderPageList();
                this.callbacks.updateMainView();
                this.callbacks.updateUI();
                return;

            case 'movePage':
                this.state.pages = this.pdfService.reorderPages(
                    this.state.pages,
                    action.toIndex,
                    action.fromIndex
                );
                this.state.selectedPageIndex = action.fromIndex;
                this.callbacks.renderPageList();
                this.callbacks.updateMainView();
                this.callbacks.updateUI();
                return;

            case 'rotatePage': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page) {
                    if (action.newRotation === undefined) {
                        action.newRotation = page.rotation || 0;
                    }
                    page.rotation = action.previousRotation;
                    if (this.renderManager) {
                        this.renderManager.clearCache();
                    }
                    this.callbacks.updateMainView();
                    this.callbacks.renderPageList();
                    this.callbacks.updateUI();
                    return;
                }
                break;
            }

            case 'clear':
                this.state.pages = action.pages;
                this.state.selectedPageIndex = action.selectedIndex;
                this.callbacks.renderPageList();
                this.callbacks.updateMainView();
                this.callbacks.updateUI();
                return;

            case 'addText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.textAnnotations) {
                    const index = page.textAnnotations.findIndex(a => a.id === action.annotationId);
                    if (index !== -1) {
                        if (!action.annotation) {
                            action.annotation = { ...page.textAnnotations[index] };
                        }
                        page.textAnnotations.splice(index, 1);
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'addHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const index = page.highlightAnnotations.findIndex(a => a.id === action.annotationId);
                    if (index !== -1) {
                        if (!action.annotation) {
                            action.annotation = { ...page.highlightAnnotations[index] };
                        }
                        page.highlightAnnotations.splice(index, 1);
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'addImage':
            case 'duplicatePage': {
                if (action.index >= 0 && action.index < this.state.pages.length) {
                    const page = this.state.pages[action.index];
                    if (page.id === action.pageId) {
                        if (!action.page) {
                            action.page = page;
                        }
                        this.state.pages.splice(action.index, 1);
                        if (this.state.selectedPageIndex >= this.state.pages.length) {
                            this.state.selectedPageIndex = this.state.pages.length - 1;
                        } else if (this.state.selectedPageIndex === action.index) {
                            this.state.selectedPageIndex = Math.max(-1, action.index - 1);
                        }
                        this.callbacks.renderPageList();
                        this.callbacks.updateMainView();
                        this.callbacks.updateUI();
                        return;
                    }
                }
                break;
            }

            case 'moveText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.textAnnotations) {
                    const ann = page.textAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.x = action.fromX;
                        ann.y = action.fromY;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'moveHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.x = action.fromX;
                        ann.y = action.fromY;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'deleteText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page) {
                    if (!page.textAnnotations) page.textAnnotations = [];
                    page.textAnnotations.push(action.annotation);
                    if (this.renderManager) {
                        this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                    } else {
                        this.callbacks.updateMainView();
                    }
                }
                break;
            }

            case 'deleteHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page) {
                    if (!page.highlightAnnotations) page.highlightAnnotations = [];
                    page.highlightAnnotations.push(action.annotation);
                    if (this.renderManager) {
                        this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                    } else {
                        this.callbacks.updateMainView();
                    }
                }
                break;
            }

            case 'updateText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.textAnnotations) {
                    const ann = page.textAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.text = action.oldText;
                        ann.color = action.oldColor;
                        ann.fontSize = action.oldFontSize;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'resizeHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.width = action.oldWidth;
                        ann.height = action.oldHeight;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'addShape': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.shapeAnnotations) {
                    const idx = page.shapeAnnotations.findIndex(s => s.id === action.annotationId);
                    if (idx !== -1) {
                        if (!action.annotation) {
                            const shape = page.shapeAnnotations[idx];
                            action.annotation = {
                                ...shape,
                                path: shape.path ? shape.path.map(p => ({ ...p })) : undefined
                            };
                        }
                        page.shapeAnnotations.splice(idx, 1);
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'deleteShape': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page) {
                    if (!page.shapeAnnotations) page.shapeAnnotations = [];
                    const ann = action.annotation;
                    page.shapeAnnotations.push({
                        ...ann,
                        path: ann.path ? ann.path.map(p => ({ ...p })) : undefined
                    });
                    if (this.renderManager) {
                        this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                    } else {
                        this.callbacks.updateMainView();
                    }
                }
                break;
            }

            case 'moveShape': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.shapeAnnotations) {
                    const shape = page.shapeAnnotations.find(s => s.id === action.annotationId);
                    if (shape) {
                        // freehandの場合はパスも移動
                        if (shape.path && shape.path.length > 0) {
                            const dx = action.fromX1 - shape.x1;
                            const dy = action.fromY1 - shape.y1;
                            for (const p of shape.path) {
                                p.x += dx;
                                p.y += dy;
                            }
                        }
                        shape.x1 = action.fromX1;
                        shape.y1 = action.fromY1;
                        shape.x2 = action.fromX2;
                        shape.y2 = action.fromY2;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'rotateText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.textAnnotations) {
                    const ann = page.textAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.rotation = action.oldRotation;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            // バッチ操作
            case 'batchMove': {
                const currentIndices = action.movedPageIds.map(id =>
                    this.state.pages.findIndex(p => p.id === id)
                ).filter(i => i >= 0);

                if (currentIndices.length > 0) {
                    const sortedCurrent = [...currentIndices].sort((a, b) => b - a);
                    const pagesToRevert: typeof this.state.pages = [];
                    for (const idx of sortedCurrent) {
                        pagesToRevert.unshift(this.state.pages[idx]);
                        this.state.pages.splice(idx, 1);
                    }
                    const sortedFrom = [...action.fromIndices].sort((a, b) => a - b);
                    for (let i = 0; i < sortedFrom.length; i++) {
                        this.state.pages.splice(sortedFrom[i], 0, pagesToRevert[i]);
                    }
                    this.state.selectedPageIndices = [...action.fromIndices];
                    this.state.selectedPageIndex = action.fromIndices[0];
                    this.callbacks.renderPageList();
                }
                break;
            }

            case 'batchRotate': {
                for (let i = 0; i < action.pageIds.length; i++) {
                    const page = this.state.pages.find(p => p.id === action.pageIds[i]);
                    if (page) {
                        page.rotation = action.previousRotations[i];
                    }
                }
                if (this.renderManager) {
                    this.renderManager.clearCache();
                }
                this.callbacks.updateMainView();
                this.callbacks.renderPageList();
                this.callbacks.updateUI();
                return;
            }

            case 'batchDuplicate': {
                const sortedIndices = [...action.addedPages]
                    .sort((a, b) => b.index - a.index)
                    .map(ap => this.state.pages.findIndex(p => p.id === ap.page.id))
                    .filter(i => i >= 0);
                for (const idx of sortedIndices) {
                    this.state.pages.splice(idx, 1);
                }
                if (this.state.pages.length > 0) {
                    this.state.selectedPageIndex = Math.min(this.state.selectedPageIndex, this.state.pages.length - 1);
                    this.state.selectedPageIndices = [this.state.selectedPageIndex];
                } else {
                    this.state.selectedPageIndex = -1;
                    this.state.selectedPageIndices = [];
                }
                this.callbacks.renderPageList();
                this.callbacks.updateMainView();
                this.callbacks.updateUI();
                return;
            }

            case 'batchDelete': {
                const sorted = [...action.deletedPages].sort((a, b) => a.index - b.index);
                for (const { page, index } of sorted) {
                    this.state.pages.splice(index, 0, page);
                }
                this.state.selectedPageIndices = sorted.map(s => s.index);
                this.state.selectedPageIndex = sorted[0].index;
                this.callbacks.renderPageList();
                this.callbacks.updateMainView();
                this.callbacks.updateUI();
                return;
            }
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

        const selectedAnnotationId = this.callbacks.getSelectedAnnotationId();

        switch (action.type) {
            case 'deletePage':
                this.state.pages = this.pdfService.removePageAt(this.state.pages, action.index);
                if (this.state.selectedPageIndex >= this.state.pages.length) {
                    this.state.selectedPageIndex = this.state.pages.length - 1;
                }
                this.callbacks.renderPageList();
                this.callbacks.updateMainView();
                this.callbacks.updateUI();
                return;

            case 'movePage':
                this.state.pages = this.pdfService.reorderPages(
                    this.state.pages,
                    action.fromIndex,
                    action.toIndex
                );
                this.state.selectedPageIndex = action.toIndex;
                this.callbacks.renderPageList();
                this.callbacks.updateMainView();
                this.callbacks.updateUI();
                return;

            case 'rotatePage': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && action.newRotation !== undefined) {
                    page.rotation = action.newRotation;
                    if (this.renderManager) {
                        this.renderManager.clearCache();
                    }
                    this.callbacks.updateMainView();
                    this.callbacks.renderPageList();
                }
                return;
            }

            case 'clear':
                this.state.pages = [];
                this.state.selectedPageIndex = -1;
                this.callbacks.renderPageList();
                this.callbacks.updateMainView();
                this.callbacks.updateUI();
                return;

            case 'addText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && action.annotation) {
                    if (!page.textAnnotations) page.textAnnotations = [];
                    page.textAnnotations.push({ ...action.annotation });
                    if (this.renderManager) {
                        this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                    } else {
                        this.callbacks.updateMainView();
                    }
                    this.callbacks.updateUI();
                    return;
                }
                break;
            }

            case 'addHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && action.annotation) {
                    if (!page.highlightAnnotations) page.highlightAnnotations = [];
                    page.highlightAnnotations.push({ ...action.annotation });
                    if (this.renderManager) {
                        this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                    } else {
                        this.callbacks.updateMainView();
                    }
                }
                break;
            }

            case 'addImage':
            case 'duplicatePage': {
                if (action.page && action.index >= 0) {
                    this.state.pages = this.pdfService.insertPageAt(
                        this.state.pages,
                        action.page,
                        action.index
                    );
                    this.state.selectedPageIndex = action.index;
                    this.callbacks.renderPageList();
                    this.callbacks.updateMainView();
                    return;
                }
                break;
            }

            case 'moveText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.textAnnotations) {
                    const ann = page.textAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.x = action.toX;
                        ann.y = action.toY;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'moveHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.x = action.toX;
                        ann.y = action.toY;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'deleteText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.textAnnotations) {
                    const index = page.textAnnotations.findIndex(a => a.id === action.annotationId);
                    if (index !== -1) {
                        page.textAnnotations.splice(index, 1);
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'deleteHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const index = page.highlightAnnotations.findIndex(a => a.id === action.annotationId);
                    if (index !== -1) {
                        page.highlightAnnotations.splice(index, 1);
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'updateText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.textAnnotations) {
                    const ann = page.textAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.text = action.newText;
                        ann.color = action.newColor;
                        ann.fontSize = action.newFontSize;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'resizeHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.width = action.newWidth;
                        ann.height = action.newHeight;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'addShape': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && action.annotation) {
                    if (!page.shapeAnnotations) page.shapeAnnotations = [];
                    const ann = action.annotation;
                    page.shapeAnnotations.push({
                        ...ann,
                        path: ann.path ? ann.path.map(p => ({ ...p })) : undefined
                    });
                    if (this.renderManager) {
                        this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                    } else {
                        this.callbacks.updateMainView();
                    }
                    this.callbacks.updateUI();
                    return;
                }
                break;
            }

            case 'deleteShape': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.shapeAnnotations) {
                    const idx = page.shapeAnnotations.findIndex(s => s.id === action.annotationId);
                    if (idx !== -1) {
                        page.shapeAnnotations.splice(idx, 1);
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'moveShape': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.shapeAnnotations) {
                    const shape = page.shapeAnnotations.find(s => s.id === action.annotationId);
                    if (shape) {
                        // freehandの場合はパスも移動
                        if (shape.path && shape.path.length > 0) {
                            const dx = action.toX1 - shape.x1;
                            const dy = action.toY1 - shape.y1;
                            for (const p of shape.path) {
                                p.x += dx;
                                p.y += dy;
                            }
                        }
                        shape.x1 = action.toX1;
                        shape.y1 = action.toY1;
                        shape.x2 = action.toX2;
                        shape.y2 = action.toY2;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            case 'rotateText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.textAnnotations) {
                    const ann = page.textAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.rotation = action.newRotation;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(selectedAnnotationId);
                        } else {
                            this.callbacks.updateMainView();
                        }
                    }
                }
                this.callbacks.updateUI();
                return;
            }

            // バッチ操作のRedo
            case 'batchMove': {
                this.pageManager.movePages(action.fromIndices, action.toIndex);
                return;
            }

            case 'batchRotate': {
                this.pageManager.rotatePages(action.pageIds.map(id => this.state.pages.findIndex(p => p.id === id)).filter(i => i !== -1));
                if (this.renderManager) {
                    this.renderManager.clearCache();
                }
                this.callbacks.updateMainView();
                this.callbacks.renderPageList();
                return;
            }

            case 'batchDuplicate': {
                const sorted = [...action.addedPages].sort((a, b) => a.index - b.index);
                for (const { page, index } of sorted) {
                    const newPage = JSON.parse(JSON.stringify(page));
                    this.state.pages.splice(index, 0, newPage);
                }
                this.callbacks.renderPageList();
                this.callbacks.updateMainView();
                this.callbacks.updateUI();
                return;
            }

            case 'batchDelete': {
                const sorted = [...action.deletedPages].sort((a, b) => b.index - a.index);
                for (const { index } of sorted) {
                    if (index < this.state.pages.length) {
                        this.state.pages.splice(index, 1);
                    }
                }
                if (this.state.pages.length === 0) {
                    this.state.selectedPageIndex = -1;
                    this.state.selectedPageIndices = [];
                } else {
                    this.state.selectedPageIndex = Math.min(this.state.selectedPageIndex, this.state.pages.length - 1);
                    this.state.selectedPageIndices = [this.state.selectedPageIndex];
                }
                this.callbacks.renderPageList();
                this.callbacks.updateMainView();
                this.callbacks.updateUI();
                return;
            }
        }
    }
}
