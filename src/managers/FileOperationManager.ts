import type { AppState, ToastType, UndoAction } from '../types';
import type { PDFService } from '../services/PDFService';
import type { ImageService } from '../services/ImageService';

/**
 * ファイル操作コールバック
 */
export interface FileOperationCallbacks {
    showLoading: (text: string) => void;
    hideLoading: () => void;
    showToast: (message: string, type: ToastType) => void;
    renderPageList: () => void;
    updateMainView: () => void;
    updateUI: () => void;
    scheduleAutoSave: () => void;
    pushUndo: (action: UndoAction) => void;
}

/**
 * ファイル読み込み・PDF追加処理を担当するマネージャー
 */
export class FileOperationManager {
    constructor(
        private getState: () => AppState,
        private pdfService: PDFService,
        private imageService: ImageService,
        private callbacks: FileOperationCallbacks
    ) {}

    private get state(): AppState {
        return this.getState();
    }

    /**
     * ファイルドロップ処理
     */
    public async handleFileDrop(files: FileList): Promise<void> {
        for (const file of Array.from(files)) {
            const ext = file.name.toLowerCase().split('.').pop();

            if (ext === 'pdf') {
                await this.loadPDF(file);
            } else if (['png', 'jpg', 'jpeg'].includes(ext || '')) {
                await this.insertImage(file);
            } else {
                this.callbacks.showToast('対応していないファイル形式です', 'warning');
            }
        }
    }

    /**
     * PDF読み込み
     */
    public async loadPDF(file: File): Promise<void> {
        this.callbacks.showLoading('PDFを読み込み中...');

        const result = await this.pdfService.loadPDF(file);

        if (result.success && result.pages) {
            this.state.pages = result.pages;
            this.state.originalPdfBytes = new Uint8Array(await file.arrayBuffer());

            if (this.state.selectedPageIndex === -1 && this.state.pages.length > 0) {
                this.state.selectedPageIndex = 0;
                this.state.selectedPageIndices = [0];
            }

            this.callbacks.renderPageList();
            this.callbacks.updateMainView();
            this.callbacks.updateUI();
            this.callbacks.scheduleAutoSave();
            this.callbacks.showToast(`${result.pages.length}ページを読み込みました`, 'success');
        } else {
            this.callbacks.showToast(result.error || 'PDFの読み込みに失敗しました', 'error');
        }

        this.callbacks.hideLoading();
    }

    /**
     * 既存ページの末尾にPDFを追加する（PDF結合用）
     */
    public async addPDF(file: File): Promise<void> {
        this.callbacks.showLoading('PDFを追加中...');

        const result = await this.pdfService.loadPDF(file);

        if (result.success && result.pages) {
            this.state.pages = [...this.state.pages, ...result.pages];

            if (this.state.selectedPageIndex === -1 && this.state.pages.length > 0) {
                this.state.selectedPageIndex = 0;
                this.state.selectedPageIndices = [0];
            }

            this.callbacks.renderPageList();
            this.callbacks.updateMainView();
            this.callbacks.updateUI();
            this.callbacks.scheduleAutoSave();
            this.callbacks.showToast(`${result.pages.length}ページを追加しました`, 'success');
        } else {
            this.callbacks.showToast(result.error || 'PDFの追加に失敗しました', 'error');
        }

        this.callbacks.hideLoading();
    }

    /**
     * 画像を挿入
     */
    public async insertImage(file: File): Promise<void> {
        this.callbacks.showLoading('画像を処理中...');

        try {
            // 参照サイズを決定
            let refWidth = 595; // A4 width in pt
            let refHeight = 842; // A4 height in pt

            if (this.state.pages.length > 0) {
                refWidth = this.state.pages[0].width;
                refHeight = this.state.pages[0].height;
            }

            const pageData = await this.imageService.imageToPageData(
                file,
                refWidth,
                refHeight
            );

            const insertIndex = this.state.selectedPageIndex >= 0
                ? this.state.selectedPageIndex + 1
                : this.state.pages.length;

            this.state.pages = this.pdfService.insertPageAt(
                this.state.pages,
                pageData,
                insertIndex
            );
            this.state.selectedPageIndex = insertIndex;

            this.callbacks.pushUndo({ type: 'addImage', pageId: pageData.id, index: insertIndex });

            this.callbacks.renderPageList();
            this.callbacks.updateMainView();
            this.callbacks.updateUI();
            this.callbacks.showToast('画像を追加しました', 'success');
        } catch (error) {
            this.callbacks.showToast('画像の処理に失敗しました', 'error');
        }

        this.callbacks.hideLoading();
    }
}
