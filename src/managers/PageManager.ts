import { AppState, PageData } from '../types';
import { UndoManager } from './UndoManager';

export class PageManager {
    constructor(
        private getState: () => AppState,
        private undoManager: UndoManager
    ) { }

    private get state(): AppState {
        return this.getState();
    }

    /**
     * 指定されたインデックスのページを削除
     * (UIでの確認ダイアログは呼び出し元で処理することを想定)
     */
    public deletePages(indices: number[]): void {
        if (indices.length === 0 || this.state.pages.length === 0) return;

        // 現在表示中のページIDを保持 (表示維持用)
        const currentViewPage = this.state.pages[this.state.selectedPageIndex];
        const currentViewId = currentViewPage ? currentViewPage.id : null;

        // Undo用に削除対象を保存
        // インデックスが大きい順に処理しないとずれるためソート
        const sortedIndices = [...indices].sort((a, b) => b - a);
        const deletedPages: { page: PageData; index: number }[] = [];

        for (const index of sortedIndices) {
            deletedPages.push({ page: this.state.pages[index], index });
            this.state.pages.splice(index, 1);
        }

        // Undo履歴
        this.undoManager.push({ type: 'batchDelete', deletedPages });

        // 選択状態の復元 (SelectionManagerができたら委譲)
        this.restoreSelectionAfterDelete(currentViewId, sortedIndices);
    }

    private restoreSelectionAfterDelete(currentViewId: string | null, deletedIndices: number[]): void {
        let newPageIndex = -1;
        if (currentViewId) {
            newPageIndex = this.state.pages.findIndex(p => p.id === currentViewId);
        }

        this.state.selectedPageIndices = [];

        if (newPageIndex !== -1) {
            // 表示中のページは残っている
            this.state.selectedPageIndex = newPageIndex;
            this.state.selectedPageIndices = [newPageIndex];
        } else {
            // 表示中のページが削除された
            if (this.state.pages.length === 0) {
                this.state.selectedPageIndex = -1;
            } else {
                // 削除された最後のページの場所、または末尾
                // deletedIndicesは降順ソートされているので、先頭が一番後ろの削除位置
                const lastDeletedIndex = deletedIndices[0]; // 最も大きいインデックス
                // その位置か、それを超えるなら末尾を選択
                this.state.selectedPageIndex = Math.min(lastDeletedIndex, this.state.pages.length - 1);
                // 負にならないよう保護
                this.state.selectedPageIndex = Math.max(0, this.state.selectedPageIndex);

                if (this.state.pages.length > 0) {
                    this.state.selectedPageIndices = [this.state.selectedPageIndex];
                }
            }
        }
    }

    public rotatePages(indices: number[]): void {
        if (indices.length === 0 || this.state.pages.length === 0) return;

        const pageIds: string[] = [];
        const previousRotations: number[] = [];

        for (const idx of indices) {
            const page = this.state.pages[idx];
            if (!page) continue;
            pageIds.push(page.id);
            previousRotations.push(page.rotation || 0);
            page.rotation = ((page.rotation || 0) + 90) % 360;
        }

        this.undoManager.push({ type: 'batchRotate', pageIds, previousRotations });
    }

    public duplicatePages(indices: number[]): PageData[] {
        if (indices.length === 0 || this.state.pages.length === 0) return [];

        const sortedIndices = [...indices].sort((a, b) => a - b);
        const addedPages: { page: PageData; index: number }[] = [];

        let offset = 0;
        for (const originalIndex of sortedIndices) {
            const currentIndex = originalIndex + offset;
            const originalPage = this.state.pages[currentIndex];
            const duplicatedPage: PageData = {
                ...originalPage,
                id: crypto.randomUUID(), // 新しいID
                // Deep copy needed? contents are mostly primitives or immutable buffers?
                // textAnnotations might be arrays. Need shallow copy at least.
                textAnnotations: originalPage.textAnnotations ? JSON.parse(JSON.stringify(originalPage.textAnnotations)) : [],
                highlightAnnotations: originalPage.highlightAnnotations ? JSON.parse(JSON.stringify(originalPage.highlightAnnotations)) : []
            };

            const insertIndex = currentIndex + 1;
            this.state.pages.splice(insertIndex, 0, duplicatedPage);
            addedPages.push({ page: duplicatedPage, index: insertIndex });
            offset++;
        }

        this.undoManager.push({ type: 'batchDuplicate', addedPages });

        // Select the duplicates
        const newSelectedIndices = addedPages.map(p => p.index);
        this.state.selectedPageIndices = newSelectedIndices;
        this.state.selectedPageIndex = newSelectedIndices[newSelectedIndices.length - 1];

        return addedPages.map(p => p.page);
    }

    public movePage(fromIndex: number, toIndex: number): void {
        // ... (existing implementation)
        this.movePages([fromIndex], toIndex);
    }

    public movePages(fromIndices: number[], toIndex: number): void {
        // ドラッグ元がドロップ先と同じ、または移動なしならスキップ
        if (fromIndices.length === 0) return;
        if (fromIndices.length === 1 && (fromIndices[0] === toIndex || fromIndices[0] === toIndex - 1)) return;

        // 移動前のページID（Undo用）
        const movedPageIds = fromIndices.map(i => this.state.pages[i].id);

        // ページを抽出（降順で元配列から削除）
        const sortedFromIndices = [...fromIndices].sort((a, b) => b - a);
        const pagesToMove: PageData[] = [];
        for (const idx of sortedFromIndices) {
            pagesToMove.unshift(this.state.pages[idx]);
            this.state.pages.splice(idx, 1);
        }

        // 削除後の挿入位置を調整
        let adjustedToIndex = toIndex;
        for (const idx of fromIndices) {
            if (idx < toIndex) adjustedToIndex--;
        }
        adjustedToIndex = Math.max(0, Math.min(adjustedToIndex, this.state.pages.length));

        // 挿入
        this.state.pages.splice(adjustedToIndex, 0, ...pagesToMove);

        // Undo履歴
        this.undoManager.push({ type: 'batchMove', fromIndices, toIndex, movedPageIds });

        // 選択を移動後の位置に更新
        this.state.selectedPageIndices = pagesToMove.map((_, i) => adjustedToIndex + i);
        // 先頭または末尾を選択? 元のロジックでは adjustedToIndex (挿入位置の先頭)
        this.state.selectedPageIndex = adjustedToIndex;
    }

    public clearPages(): void {
        if (this.state.pages.length === 0) return;
        // ... (Undo logic for clear? Maybe batch delete all?)
        // Existing implementation: this.state.pages = []; selected = -1;
        // Undo support for Clear?
        // It's equivalent to deleting all pages.

        const deletedPages = this.state.pages.map((page, index) => ({ page, index }));
        this.undoManager.push({ type: 'batchDelete', deletedPages });

        this.state.pages = [];
        this.state.selectedPageIndex = -1;
        this.state.selectedPageIndices = [];
    }
}
