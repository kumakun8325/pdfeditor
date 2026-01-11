import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFService } from './services/PDFService';
import { ImageService } from './services/ImageService';
import { KeyboardService } from './services/KeyboardService';
import type { AppState, PageData, ToastType } from './types';
import './styles/index.css';

// Worker設定
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

/**
 * PDF Editor メインアプリケーション
 */
class PDFEditorApp {
    private state: AppState = {
        pages: [],
        selectedPageIndex: -1,
        isLoading: false,
        isDarkMode: false,
        originalPdfBytes: null,
    };

    private pdfService: PDFService;
    private imageService: ImageService;
    private keyboardService: KeyboardService;

    // DOM Elements
    private elements!: {
        btnOpen: HTMLButtonElement;
        btnSave: HTMLButtonElement;
        btnTheme: HTMLButtonElement;
        fileInput: HTMLInputElement;
        pageList: HTMLDivElement;
        dropZone: HTMLDivElement;
        pageCount: HTMLSpanElement;
        emptyState: HTMLDivElement;
        pagePreview: HTMLDivElement;
        previewCanvas: HTMLCanvasElement;
        pageNav: HTMLDivElement;
        pageIndicator: HTMLSpanElement;
        btnPrev: HTMLButtonElement;
        btnNext: HTMLButtonElement;
        loadingOverlay: HTMLDivElement;
        loadingText: HTMLParagraphElement;
        toastContainer: HTMLDivElement;
        iconLight: SVGElement;
        iconDark: SVGElement;
    };

    constructor() {
        this.pdfService = new PDFService();
        this.imageService = new ImageService();
        this.keyboardService = new KeyboardService();
    }

    /**
     * アプリケーション初期化
     */
    init(): void {
        this.cacheElements();
        this.bindEvents();
        this.setupKeyboardShortcuts();
        this.loadThemePreference();
    }

    private cacheElements(): void {
        this.elements = {
            btnOpen: document.getElementById('btn-open') as HTMLButtonElement,
            btnSave: document.getElementById('btn-save') as HTMLButtonElement,
            btnTheme: document.getElementById('btn-theme') as HTMLButtonElement,
            fileInput: document.getElementById('file-input') as HTMLInputElement,
            pageList: document.getElementById('page-list') as HTMLDivElement,
            dropZone: document.getElementById('drop-zone') as HTMLDivElement,
            pageCount: document.getElementById('page-count') as HTMLSpanElement,
            emptyState: document.getElementById('empty-state') as HTMLDivElement,
            pagePreview: document.getElementById('page-preview') as HTMLDivElement,
            previewCanvas: document.getElementById('preview-canvas') as HTMLCanvasElement,
            pageNav: document.getElementById('page-nav') as HTMLDivElement,
            pageIndicator: document.getElementById('page-indicator') as HTMLSpanElement,
            btnPrev: document.getElementById('btn-prev') as HTMLButtonElement,
            btnNext: document.getElementById('btn-next') as HTMLButtonElement,
            loadingOverlay: document.getElementById('loading-overlay') as HTMLDivElement,
            loadingText: document.getElementById('loading-text') as HTMLParagraphElement,
            toastContainer: document.getElementById('toast-container') as HTMLDivElement,
            iconLight: document.getElementById('icon-light') as unknown as SVGElement,
            iconDark: document.getElementById('icon-dark') as unknown as SVGElement,
        };
    }

    private bindEvents(): void {
        // ファイル選択
        this.elements.btnOpen.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        this.elements.fileInput.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                await this.loadPDF(file);
            }
        });

        // 保存
        this.elements.btnSave.addEventListener('click', () => {
            this.savePDF();
        });

        // テーマ切り替え
        this.elements.btnTheme.addEventListener('click', () => {
            this.toggleTheme();
        });

        // ドラッグ＆ドロップ
        this.setupDropZone();

        // ページナビゲーション
        this.elements.btnPrev.addEventListener('click', () => {
            this.selectPage(this.state.selectedPageIndex - 1);
        });

        this.elements.btnNext.addEventListener('click', () => {
            this.selectPage(this.state.selectedPageIndex + 1);
        });
    }

    private setupKeyboardShortcuts(): void {
        this.keyboardService.init();

        // Ctrl/Cmd + O: 開く
        this.keyboardService.addShortcut('o', ['ctrl'], () => {
            this.elements.fileInput.click();
        });
        this.keyboardService.addShortcut('o', ['meta'], () => {
            this.elements.fileInput.click();
        });

        // Ctrl/Cmd + S: 保存
        this.keyboardService.addShortcut('s', ['ctrl'], () => {
            if (this.state.pages.length > 0) {
                this.savePDF();
            }
        });
        this.keyboardService.addShortcut('s', ['meta'], () => {
            if (this.state.pages.length > 0) {
                this.savePDF();
            }
        });

        // Ctrl/Cmd + D: ページ削除
        this.keyboardService.addShortcut('d', ['ctrl'], () => {
            this.deleteSelectedPage();
        });
        this.keyboardService.addShortcut('d', ['meta'], () => {
            this.deleteSelectedPage();
        });

        // 矢印キー: ページ選択
        this.keyboardService.addShortcut('arrowup', [], () => {
            this.selectPage(this.state.selectedPageIndex - 1);
        });
        this.keyboardService.addShortcut('arrowdown', [], () => {
            this.selectPage(this.state.selectedPageIndex + 1);
        });
    }

    private setupDropZone(): void {
        const dropZone = this.elements.dropZone;
        const sidebar = document.getElementById('sidebar')!;

        // サイドバー全体もドロップ対象に
        [dropZone, sidebar].forEach((el) => {
            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });

            el.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
            });

            el.addEventListener('drop', async (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');

                const files = e.dataTransfer?.files;
                if (files && files.length > 0) {
                    await this.handleFileDrop(files);
                }
            });
        });
    }

    private async handleFileDrop(files: FileList): Promise<void> {
        for (const file of Array.from(files)) {
            const ext = file.name.toLowerCase().split('.').pop();

            if (ext === 'pdf') {
                await this.loadPDF(file);
            } else if (['png', 'jpg', 'jpeg'].includes(ext || '')) {
                await this.insertImage(file);
            } else {
                this.showToast('対応していないファイル形式です', 'warning');
            }
        }
    }

    private async loadPDF(file: File): Promise<void> {
        this.showLoading('PDFを読み込み中...');

        const result = await this.pdfService.loadPDF(file);

        if (result.success && result.pages) {
            // 既存のページに追加
            this.state.pages = [...this.state.pages, ...result.pages];
            this.state.originalPdfBytes = new Uint8Array(await file.arrayBuffer());

            if (this.state.selectedPageIndex === -1 && this.state.pages.length > 0) {
                this.state.selectedPageIndex = 0;
            }

            this.renderPageList();
            this.updateMainView();
            this.updateUI();
            this.showToast(`${result.pages.length}ページを読み込みました`, 'success');
        } else {
            this.showToast(result.error || 'PDFの読み込みに失敗しました', 'error');
        }

        this.hideLoading();
    }

    private async insertImage(file: File): Promise<void> {
        this.showLoading('画像を処理中...');

        try {
            // 参照サイズを決定（既存ページがあればそのサイズ、なければA4サイズ）
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

            // 選択位置の後ろに挿入
            const insertIndex = this.state.selectedPageIndex >= 0
                ? this.state.selectedPageIndex + 1
                : this.state.pages.length;

            this.state.pages = this.pdfService.insertPageAt(
                this.state.pages,
                pageData,
                insertIndex
            );
            this.state.selectedPageIndex = insertIndex;

            this.renderPageList();
            this.updateMainView();
            this.updateUI();
            this.showToast('画像を追加しました', 'success');
        } catch (error) {
            this.showToast('画像の処理に失敗しました', 'error');
        }

        this.hideLoading();
    }

    private deleteSelectedPage(): void {
        if (this.state.selectedPageIndex < 0 || this.state.pages.length === 0) {
            return;
        }

        const confirmed = confirm(
            `ページ ${this.state.selectedPageIndex + 1} を削除しますか？`
        );

        if (!confirmed) return;

        this.state.pages = this.pdfService.removePageAt(
            this.state.pages,
            this.state.selectedPageIndex
        );

        // 選択インデックスを調整
        if (this.state.pages.length === 0) {
            this.state.selectedPageIndex = -1;
        } else if (this.state.selectedPageIndex >= this.state.pages.length) {
            this.state.selectedPageIndex = this.state.pages.length - 1;
        }

        this.renderPageList();
        this.updateMainView();
        this.updateUI();
        this.showToast('ページを削除しました', 'success');
    }

    private selectPage(index: number): void {
        if (index < 0 || index >= this.state.pages.length) return;

        this.state.selectedPageIndex = index;
        this.updateThumbnailSelection();
        this.updateMainView();
        this.updatePageNav();
    }

    private renderPageList(): void {
        this.elements.pageList.innerHTML = '';

        this.state.pages.forEach((page, index) => {
            const thumbnail = this.createThumbnailElement(page, index);
            this.elements.pageList.appendChild(thumbnail);
        });
    }

    private createThumbnailElement(page: PageData, index: number): HTMLDivElement {
        const container = document.createElement('div');
        container.className = 'page-thumbnail';
        container.dataset.index = String(index);

        if (index === this.state.selectedPageIndex) {
            container.classList.add('selected');
        }

        // サムネイル画像
        const img = document.createElement('img');
        img.src = page.thumbnail;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        container.appendChild(img);

        // ページ番号
        const pageNumber = document.createElement('span');
        pageNumber.className = 'page-number';
        pageNumber.textContent = String(index + 1);
        container.appendChild(pageNumber);

        // クリックイベント
        container.addEventListener('click', () => {
            this.selectPage(index);
        });

        // ドラッグ並べ替え
        container.draggable = true;
        container.addEventListener('dragstart', (e) => {
            e.dataTransfer!.setData('text/plain', String(index));
            container.style.opacity = '0.5';
        });

        container.addEventListener('dragend', () => {
            container.style.opacity = '1';
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const rect = container.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;

            container.classList.remove('drag-over-above', 'drag-over-below');
            if (e.clientY < midY) {
                container.classList.add('drag-over-above');
            } else {
                container.classList.add('drag-over-below');
            }
        });

        container.addEventListener('dragleave', () => {
            container.classList.remove('drag-over-above', 'drag-over-below');
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            container.classList.remove('drag-over-above', 'drag-over-below');

            const fromIndex = parseInt(e.dataTransfer!.getData('text/plain'), 10);
            if (isNaN(fromIndex)) return;

            const rect = container.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            let toIndex = index;

            if (e.clientY > midY) {
                toIndex = index + 1;
            }

            if (fromIndex !== toIndex && fromIndex !== toIndex - 1) {
                this.reorderPage(fromIndex, toIndex > fromIndex ? toIndex - 1 : toIndex);
            }
        });

        return container;
    }

    private reorderPage(fromIndex: number, toIndex: number): void {
        this.state.pages = this.pdfService.reorderPages(
            this.state.pages,
            fromIndex,
            toIndex
        );

        // 選択を維持
        if (this.state.selectedPageIndex === fromIndex) {
            this.state.selectedPageIndex = toIndex;
        }

        this.renderPageList();
        this.updateMainView();
    }

    private updateThumbnailSelection(): void {
        const thumbnails = this.elements.pageList.querySelectorAll('.page-thumbnail');
        thumbnails.forEach((thumb, index) => {
            thumb.classList.toggle('selected', index === this.state.selectedPageIndex);
        });
    }

    private async updateMainView(): Promise<void> {
        if (this.state.pages.length === 0 || this.state.selectedPageIndex < 0) {
            this.elements.emptyState.style.display = 'flex';
            this.elements.pagePreview.style.display = 'none';
            this.elements.pageNav.style.display = 'none';
            return;
        }

        this.elements.emptyState.style.display = 'none';
        this.elements.pagePreview.style.display = 'flex';
        this.elements.pageNav.style.display = 'flex';

        const page = this.state.pages[this.state.selectedPageIndex];
        await this.pdfService.renderToCanvas(this.elements.previewCanvas, page);

        this.updatePageNav();
    }

    private updatePageNav(): void {
        const current = this.state.selectedPageIndex + 1;
        const total = this.state.pages.length;

        this.elements.pageIndicator.textContent = `${current} / ${total}`;
        this.elements.btnPrev.disabled = this.state.selectedPageIndex <= 0;
        this.elements.btnNext.disabled =
            this.state.selectedPageIndex >= this.state.pages.length - 1;
    }

    private updateUI(): void {
        const hasPages = this.state.pages.length > 0;
        this.elements.btnSave.disabled = !hasPages;
        this.elements.pageCount.textContent = hasPages
            ? `${this.state.pages.length}ページ`
            : '';
    }

    private async savePDF(): Promise<void> {
        if (this.state.pages.length === 0) return;

        this.showLoading('PDFを生成中...');

        try {
            const pdfDoc = await PDFDocument.create();

            for (const page of this.state.pages) {
                if (page.type === 'image') {
                    await this.imageService.embedImageToPdf(pdfDoc, page);
                } else if (page.pdfBytes && page.originalPageIndex !== undefined) {
                    // PDF由来のページをコピー
                    const srcDoc = await PDFDocument.load(page.pdfBytes);
                    const [copiedPage] = await pdfDoc.copyPages(srcDoc, [
                        page.originalPageIndex,
                    ]);
                    pdfDoc.addPage(copiedPage);
                }
            }

            const pdfBytes = await pdfDoc.save();
            this.downloadPDF(pdfBytes);
            this.showToast('PDFを保存しました', 'success');
        } catch (error) {
            console.error('Save PDF error:', error);
            this.showToast('PDFの保存に失敗しました', 'error');
        }

        this.hideLoading();
    }

    private downloadPDF(pdfBytes: Uint8Array): void {
        const arrayBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'edited.pdf';
        a.click();
        URL.revokeObjectURL(url);
    }

    private toggleTheme(): void {
        this.state.isDarkMode = !this.state.isDarkMode;
        document.documentElement.classList.toggle('dark', this.state.isDarkMode);

        this.elements.iconLight.style.display = this.state.isDarkMode
            ? 'none'
            : 'block';
        this.elements.iconDark.style.display = this.state.isDarkMode
            ? 'block'
            : 'none';

        localStorage.setItem('theme', this.state.isDarkMode ? 'dark' : 'light');
    }

    private loadThemePreference(): void {
        const saved = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        this.state.isDarkMode = saved === 'dark' || (!saved && prefersDark);
        document.documentElement.classList.toggle('dark', this.state.isDarkMode);

        this.elements.iconLight.style.display = this.state.isDarkMode
            ? 'none'
            : 'block';
        this.elements.iconDark.style.display = this.state.isDarkMode
            ? 'block'
            : 'none';
    }

    private showLoading(text: string): void {
        this.elements.loadingText.textContent = text;
        this.elements.loadingOverlay.style.display = 'flex';
    }

    private hideLoading(): void {
        this.elements.loadingOverlay.style.display = 'none';
    }

    private showToast(message: string, type: ToastType): void {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        this.elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    const app = new PDFEditorApp();
    app.init();
});
