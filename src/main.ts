import { saveAs } from 'file-saver';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { PDFService } from './services/PDFService';
import { ImageService } from './services/ImageService';
import { KeyboardService } from './services/KeyboardService';
import { UndoManager } from './managers/UndoManager';
import { AnnotationManager } from './managers/AnnotationManager';
import type { AppState, PageData, ToastType, TextAnnotation, HighlightAnnotation, UndoAction } from './types';
import './styles/index.css';

// Worker設定はPDFService側で行われる

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

    // ドラッグ状態
    private draggingAnnotation: TextAnnotation | null = null;
    private dragOffset = { x: 0, y: 0 };
    private draggingStart: { x: number; y: number } | null = null;
    private readonly baseScale = 1.5;
    private currentZoom = 1.0;
    private get previewScale(): number {
        return this.baseScale * this.currentZoom;
    }
    private backgroundImageData: ImageData | null = null;

    // ハイライトモード
    private isHighlightMode = false;
    private highlightStart: { x: number; y: number } | null = null;
    private highlightColor = '#ffff00'; // 黄色

    // マネージャー
    private undoManager: UndoManager;

    // レンダリング状態管理
    private renderingRequestId = 0;
    private isRendering = false;
    private hasPendingRenderRequest = false;

    // Undoスタック (削除)
    // private undoStack: UndoAction[] = [];
    // private readonly maxUndoStack = 20;

    // DOM Elements
    private elements!: {
        btnOpen: HTMLButtonElement;
        btnOpenHero: HTMLButtonElement; // 追加
        btnSave: HTMLButtonElement;
        btnSplit: HTMLButtonElement;
        btnClear: HTMLButtonElement;
        btnAddImage: HTMLButtonElement;
        btnMoveUp: HTMLButtonElement;
        btnMoveDown: HTMLButtonElement;
        btnRotate: HTMLButtonElement;
        btnDuplicate: HTMLButtonElement;
        btnDelete: HTMLButtonElement;
        btnExportPng: HTMLButtonElement;
        btnExportAll: HTMLButtonElement;
        btnTheme: HTMLButtonElement;
        fileInput: HTMLInputElement;
        imageInput: HTMLInputElement;
        pageList: HTMLDivElement;
        mainView: HTMLElement; // 追加
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
        // テキストモーダル
        btnAddText: HTMLButtonElement;
        textModal: HTMLDivElement;
        textModalClose: HTMLButtonElement;
        textModalCancel: HTMLButtonElement;
        textModalOk: HTMLButtonElement;
        textInput: HTMLTextAreaElement;
        textSize: HTMLSelectElement;
        textColor: HTMLInputElement;
        // ハイライト
        btnHighlight: HTMLButtonElement;
        // ズーム
        btnZoomIn: HTMLButtonElement;
        btnZoomOut: HTMLButtonElement;
        btnZoomReset: HTMLButtonElement;
        zoomLevel: HTMLSpanElement;
    };

    constructor() {
        this.pdfService = new PDFService();
        this.imageService = new ImageService();
        this.keyboardService = new KeyboardService();
        this.undoManager = new UndoManager();
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
        // 画像用の hidden input を動的に追加
        let imageInput = document.getElementById('image-input') as HTMLInputElement;
        if (!imageInput) {
            imageInput = document.createElement('input');
            imageInput.type = 'file';
            imageInput.id = 'image-input';
            imageInput.accept = '.png,.jpg,.jpeg';
            imageInput.style.display = 'none';
            document.body.appendChild(imageInput);
        }

        this.elements = {
            btnOpen: document.getElementById('btn-open') as HTMLButtonElement,
            btnOpenHero: document.getElementById('btn-open-hero') as HTMLButtonElement, // 追加
            btnSave: document.getElementById('btn-save') as HTMLButtonElement,
            btnSplit: document.getElementById('btn-split') as HTMLButtonElement,
            btnClear: document.getElementById('btn-clear') as HTMLButtonElement,
            btnAddImage: document.getElementById('btn-add-image') as HTMLButtonElement,
            btnMoveUp: document.getElementById('btn-move-up') as HTMLButtonElement,
            btnMoveDown: document.getElementById('btn-move-down') as HTMLButtonElement,
            btnRotate: document.getElementById('btn-rotate') as HTMLButtonElement,
            btnDuplicate: document.getElementById('btn-duplicate') as HTMLButtonElement,
            btnDelete: document.getElementById('btn-delete') as HTMLButtonElement,
            btnExportPng: document.getElementById('btn-export-png') as HTMLButtonElement,
            btnExportAll: document.getElementById('btn-export-all') as HTMLButtonElement,
            btnTheme: document.getElementById('btn-theme') as HTMLButtonElement,
            fileInput: document.getElementById('file-input') as HTMLInputElement,
            imageInput: imageInput,
            pageList: document.getElementById('page-list') as HTMLDivElement,
            mainView: document.getElementById('main-view') as HTMLElement, // 追加
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
            // テキストモーダル
            btnAddText: document.getElementById('btn-add-text') as HTMLButtonElement,
            textModal: document.getElementById('text-modal') as HTMLDivElement,
            textModalClose: document.getElementById('text-modal-close') as HTMLButtonElement,
            textModalCancel: document.getElementById('text-modal-cancel') as HTMLButtonElement,
            textModalOk: document.getElementById('text-modal-ok') as HTMLButtonElement,
            textInput: document.getElementById('text-input') as HTMLTextAreaElement,
            textSize: document.getElementById('text-size') as HTMLSelectElement,
            textColor: document.getElementById('text-color') as HTMLInputElement,
            // ハイライト
            btnHighlight: document.getElementById('btn-highlight') as HTMLButtonElement,
            // ズーム
            btnZoomIn: document.getElementById('btn-zoom-in') as HTMLButtonElement,
            btnZoomOut: document.getElementById('btn-zoom-out') as HTMLButtonElement,
            btnZoomReset: document.getElementById('btn-zoom-reset') as HTMLButtonElement,
            zoomLevel: document.getElementById('zoom-level') as HTMLSpanElement,
        };
    }

    private bindEvents(): void {
        // ファイル選択
        this.elements.btnOpen.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        // ヒーローエリアの開くボタン
        if (this.elements.btnOpenHero) {
            this.elements.btnOpenHero.addEventListener('click', () => {
                this.elements.fileInput.click();
            });
        }

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

        // 画像追加
        this.elements.btnAddImage.addEventListener('click', () => {
            this.elements.imageInput.click();
        });

        this.elements.imageInput.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                await this.insertImage(file);
            }
            // リセット（同じファイルを再選択可能に）
            (e.target as HTMLInputElement).value = '';
        });

        // ページ移動
        this.elements.btnMoveUp.addEventListener('click', () => {
            this.movePageUp();
        });

        this.elements.btnMoveDown.addEventListener('click', () => {
            this.movePageDown();
        });

        // ページ回転
        this.elements.btnRotate.addEventListener('click', () => {
            this.rotatePage();
        });

        // ページ複製
        this.elements.btnDuplicate.addEventListener('click', () => {
            this.duplicatePage();
        });

        // 画像保存
        this.elements.btnExportPng.addEventListener('click', () => {
            this.exportCurrentPage();
        });

        // 全保存
        this.elements.btnExportAll.addEventListener('click', () => {
            this.exportAllPages();
        });

        // バイナリ分割
        this.elements.btnSplit.addEventListener('click', () => {
            this.splitAndDownload();
        });

        // クリア
        this.elements.btnClear.addEventListener('click', () => {
            this.clearPages();
        });

        // ページ削除（ボタン）
        this.elements.btnDelete.addEventListener('click', () => {
            this.deleteSelectedPage();
        });

        // テーマ切り替え
        this.elements.btnTheme.addEventListener('click', () => {
            this.toggleTheme();
        });

        // テキスト追加
        this.elements.btnAddText.addEventListener('click', () => {
            this.openTextModal();
        });

        // テキストモーダルイベント
        this.elements.textModalClose.addEventListener('click', () => {
            this.closeTextModal();
        });
        this.elements.textModalCancel.addEventListener('click', () => {
            this.closeTextModal();
        });
        this.elements.textModalOk.addEventListener('click', () => {
            this.addTextAnnotation();
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

        // テキスト注釈のドラッグ / ハイライト描画
        this.elements.previewCanvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
        this.elements.previewCanvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
        this.elements.previewCanvas.addEventListener('mouseup', (e) => this.onCanvasMouseUp(e));
        this.elements.previewCanvas.addEventListener('mouseleave', () => this.onCanvasMouseLeave());

        // ハイライトモードトグル
        this.elements.btnHighlight.addEventListener('click', () => {
            this.toggleHighlightMode();
        });

        // ズーム操作
        this.elements.btnZoomIn.addEventListener('click', () => this.zoomIn());
        this.elements.btnZoomOut.addEventListener('click', () => this.zoomOut());
        this.elements.btnZoomReset.addEventListener('click', () => this.resetZoom());

        // Ctrl + ホイールでズーム
        window.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    this.zoomIn();
                } else {
                    this.zoomOut();
                }
            }
        }, { passive: false });
    }

    // クロスOS対応のショートカット登録ヘルパー
    private addCrossOsShortcut(key: string, callback: () => void): void {
        this.keyboardService.addShortcut(key, ['ctrl'], callback);
        this.keyboardService.addShortcut(key, ['meta'], callback);
    }

    private setupKeyboardShortcuts(): void {
        this.keyboardService.init();

        // Ctrl/Cmd + O: 開く
        this.addCrossOsShortcut('o', () => this.elements.fileInput.click());

        // Ctrl/Cmd + S: 保存
        this.addCrossOsShortcut('s', () => {
            if (this.state.pages.length > 0) this.savePDF();
        });

        // Ctrl/Cmd + D: ページ削除
        this.addCrossOsShortcut('d', () => this.deleteSelectedPage());

        // 矢印キー: ページ選択
        this.keyboardService.addShortcut('arrowup', [], () => {
            this.selectPage(this.state.selectedPageIndex - 1);
        });
        this.keyboardService.addShortcut('arrowdown', [], () => {
            this.selectPage(this.state.selectedPageIndex + 1);
        });

        // Ctrl/Cmd + Z: 元に戻す
        this.addCrossOsShortcut('z', () => this.undo());

        // Ctrl + +, Ctrl + -: ズーム (ブラウザのデフォルト挙動を抑制してカスタムズーム)
        // 注意: ブラウザのズームを完全に防ぐのは難しいが、可能な範囲で対応
        this.keyboardService.addShortcut('=', ['ctrl'], () => this.zoomIn()); // + key
        this.keyboardService.addShortcut('-', ['ctrl'], () => this.zoomOut()); // - key
        this.keyboardService.addShortcut('0', ['ctrl'], () => this.resetZoom());
    }

    private setupDropZone(): void {
        const dropZone = this.elements.dropZone;
        const sidebar = document.getElementById('sidebar')!;
        const mainView = this.elements.mainView;

        // サイドバーとメインビュー全体をドロップ対象に
        [dropZone, sidebar, mainView].forEach((el) => {
            if (!el) return;

            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });

            el.addEventListener('dragleave', (e) => {
                e.preventDefault();
                // 関連要素内での移動でイベント発火しないように簡易チェック
                if (e.relatedTarget && el.contains(e.relatedTarget as Node)) {
                    return;
                }
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
            // 新しいPDFで置き換え（複数PDF結合が必要な場合はドラッグ&ドロップで追加）
            this.state.pages = result.pages;
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

            // Undoのために追加した画像を保存
            this.pushUndo({ type: 'addImage', pageId: pageData.id, index: insertIndex });

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

        // Undoのために削除前の状態を保存
        const deletedPage = this.state.pages[this.state.selectedPageIndex];
        const deletedIndex = this.state.selectedPageIndex;
        this.pushUndo({ type: 'deletePage', page: deletedPage, index: deletedIndex });

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

    private movePage(direction: 'up' | 'down'): void {
        const index = this.state.selectedPageIndex;
        const newIndex = direction === 'up' ? index - 1 : index + 1;

        // バリデーション
        if (index < 0 || this.state.pages.length < 2) return;
        if (direction === 'up' && index <= 0) return;
        if (direction === 'down' && index >= this.state.pages.length - 1) return;

        // Undoのために移動前の状態を保存
        this.pushUndo({ type: 'movePage', fromIndex: index, toIndex: newIndex });

        this.state.pages = this.pdfService.reorderPages(this.state.pages, index, newIndex);
        this.state.selectedPageIndex = newIndex;

        this.renderPageList();
        this.updateMainView();
        this.updateUI();
        this.showToast(`ページを${direction === 'up' ? '上' : '下'}に移動しました`, 'success');
    }

    private movePageUp(): void {
        this.movePage('up');
    }

    private movePageDown(): void {
        this.movePage('down');
    }

    private selectPage(index: number): void {
        if (index < 0 || index >= this.state.pages.length) return;

        this.state.selectedPageIndex = index;
        this.updateThumbnailSelection();
        this.updateMainView();
        this.updatePageNav();
        this.updateUI();
    }

    private rotatePage(): void {
        if (this.state.selectedPageIndex < 0 || this.state.pages.length === 0) return;

        const page = this.state.pages[this.state.selectedPageIndex];
        const currentRotation = page.rotation || 0;

        // Undoのために回転前の状態を保存
        this.pushUndo({ type: 'rotatePage', pageId: page.id, previousRotation: currentRotation });

        page.rotation = (currentRotation + 90) % 360;

        this.renderPageList();
        this.updateMainView();
        this.showToast(`ページを90°回転しました`, 'success');
    }

    private duplicatePage(): void {
        if (this.state.selectedPageIndex < 0 || this.state.pages.length === 0) return;

        const originalPage = this.state.pages[this.state.selectedPageIndex];
        // ディープコピーを作成
        const duplicatedPage: PageData = {
            ...originalPage,
            id: crypto.randomUUID(),
        };

        // 選択ページの次に挿入
        this.state.pages = this.pdfService.insertPageAt(
            this.state.pages,
            duplicatedPage,
            this.state.selectedPageIndex + 1
        );
        this.state.selectedPageIndex = this.state.selectedPageIndex + 1;

        // Undoのために複製したページを保存
        this.pushUndo({
            type: 'duplicatePage',
            pageId: duplicatedPage.id,
            index: this.state.selectedPageIndex
        });

        this.renderPageList();
        this.updateMainView();
        this.updatePageNav();
        this.updateUI();
        this.showToast('ページを複製しました', 'success');
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
        img.alt = `ページ ${index + 1}`;
        // 回転を適用
        if (page.rotation) {
            img.style.transform = `rotate(${page.rotation}deg)`;
        }
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
        this.updateUI();
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

        // 既にレンダリング中なら、リクエストを予約して終了
        if (this.isRendering) {
            console.log('Skipping render: already rendering');
            this.hasPendingRenderRequest = true;
            return;
        }

        this.isRendering = true;
        this.hasPendingRenderRequest = false;

        // request IDは不要になったが、念のため残すか、削除してもよい。
        // ここでは排他制御によりIDチェックは必須ではなくなる
        ++this.renderingRequestId;

        this.elements.emptyState.style.display = 'none';
        this.elements.pagePreview.style.display = 'flex';
        this.elements.pageNav.style.display = 'flex';

        const page = this.state.pages[this.state.selectedPageIndex];

        try {
            await this.pdfService.renderToCanvas(
                this.elements.previewCanvas,
                page,
                this.previewScale
            );

            // 背景をキャッシュ
            const ctx = this.elements.previewCanvas.getContext('2d')!;
            this.backgroundImageData = ctx.getImageData(
                0, 0,
                this.elements.previewCanvas.width,
                this.elements.previewCanvas.height
            );

            // テキスト注釈を描画
            this.drawTextAnnotations();

            this.updatePageNav();
        } catch (error) {
            console.error('Render error:', error);
            this.showToast('プレビューの表示に失敗しました', 'error');
        } finally {
            this.isRendering = false;

            // 待機中のリクエストがあれば実行
            if (this.hasPendingRenderRequest) {
                this.updateMainView();
            }
        }
    }

    private drawTextAnnotations(): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        const ctx = this.elements.previewCanvas.getContext('2d')!;
        AnnotationManager.drawAnnotations(ctx, page, this.previewScale);
    }

    private redrawWithCachedBackground(): void {
        if (!this.backgroundImageData) return;

        const ctx = this.elements.previewCanvas.getContext('2d')!;
        ctx.putImageData(this.backgroundImageData, 0, 0);
        this.drawTextAnnotations();
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
        const selectedIndex = this.state.selectedPageIndex;

        this.elements.btnSave.disabled = !hasPages;
        this.elements.btnSplit.disabled = !hasPages;
        this.elements.btnMoveUp.disabled = !hasPages || selectedIndex <= 0;
        this.elements.btnMoveDown.disabled = !hasPages || selectedIndex >= this.state.pages.length - 1;
        this.elements.btnRotate.disabled = !hasPages || selectedIndex < 0;
        this.elements.btnDuplicate.disabled = !hasPages || selectedIndex < 0;
        this.elements.btnDelete.disabled = !hasPages || selectedIndex < 0;
        this.elements.btnClear.disabled = !hasPages;
        this.elements.btnAddText.disabled = !hasPages || selectedIndex < 0;
        this.elements.btnHighlight.disabled = !hasPages || selectedIndex < 0;
        this.elements.btnExportPng.disabled = !hasPages || selectedIndex < 0;
        this.elements.btnExportAll.disabled = !hasPages;

        this.elements.pageCount.textContent = hasPages
            ? `${this.state.pages.length}ページ`
            : '';
    }

    private clearPages(): void {
        if (this.state.pages.length === 0) return;

        // Undoのためにクリア前の状態を保存
        this.pushUndo({
            type: 'clear',
            pages: [...this.state.pages],
            selectedIndex: this.state.selectedPageIndex
        });

        this.state.pages = [];
        this.state.selectedPageIndex = -1;
        this.state.originalPdfBytes = null;

        this.renderPageList();
        this.elements.emptyState.style.display = 'flex';
        this.elements.pagePreview.style.display = 'none';
        this.elements.pageNav.style.display = 'none';
        this.updateUI();
        this.showToast('ページをクリアしました', 'success');
    }

    private openTextModal(): void {
        this.disableHighlightMode(); // マーカーモード解除
        this.elements.textInput.value = '';
        this.elements.textSize.value = '16';
        this.elements.textColor.value = '#000000';
        this.elements.textModal.style.display = 'flex';
        this.elements.textInput.focus();
    }

    private closeTextModal(): void {
        this.elements.textModal.style.display = 'none';
    }

    private addTextAnnotation(): void {
        this.disableHighlightMode(); // マーカーモード解除
        const text = this.elements.textInput.value.trim();
        if (!text) {
            this.showToast('テキストを入力してください', 'warning');
            return;
        }

        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        const annotation: TextAnnotation = {
            id: crypto.randomUUID(),
            text,
            x: page.width / 2, // 中央に配置
            y: page.height / 2,
            fontSize: parseInt(this.elements.textSize.value),
            color: this.elements.textColor.value,
        };

        if (!page.textAnnotations) {
            page.textAnnotations = [];
        }
        page.textAnnotations.push(annotation);

        // Undoのために追加したテキストを保存
        this.pushUndo({ type: 'addText', pageId: page.id, annotationId: annotation.id });

        this.closeTextModal();
        // キャッシュ背景がある場合はそれを使用、なければフル再描画
        if (this.backgroundImageData) {
            this.redrawWithCachedBackground();
        } else {
            this.updateMainView();
        }
        this.showToast('テキストを追加しました', 'success');
    }

    private onCanvasMouseDown(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        const canvas = this.elements.previewCanvas;
        const rect = canvas.getBoundingClientRect();

        // 表示サイズと内部サイズの比率を計算
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        // Canvas座標をPDF座標に変換
        const point = AnnotationManager.toPdfPoint(canvasX, canvasY, this.previewScale, page.height);
        const pdfX = point.x;
        const pdfY = point.y;

        // ハイライトモードの場合は開始位置を記録
        if (this.isHighlightMode) {
            this.highlightStart = { x: pdfX, y: pdfY };
            e.preventDefault();
            return;
        }

        // テキスト注釈のドラッグ
        const hitAnnotation = AnnotationManager.hitTestText(page, pdfX, pdfY);
        if (hitAnnotation) {
            this.disableHighlightMode(); // マーカーモード解除
            this.draggingAnnotation = hitAnnotation;
            this.draggingStart = { x: hitAnnotation.x, y: hitAnnotation.y }; // 開始位置保存
            this.dragOffset.x = pdfX - hitAnnotation.x;
            this.dragOffset.y = pdfY - hitAnnotation.y;
            this.elements.previewCanvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }
    }

    private onCanvasMouseMove(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        const canvas = this.elements.previewCanvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        // ハイライトモードでドラッグ中はプレビュー矩形を描画
        if (this.isHighlightMode && this.highlightStart) {
            if (!this.backgroundImageData) return;

            this.redrawWithCachedBackground();
            const ctx = canvas.getContext('2d')!;

            const startCanvasX = this.highlightStart.x * this.previewScale;
            const startCanvasY = (page.height - this.highlightStart.y) * this.previewScale;

            ctx.save();
            ctx.fillStyle = this.highlightColor;
            ctx.globalAlpha = 0.3;
            ctx.fillRect(
                Math.min(startCanvasX, canvasX),
                Math.min(startCanvasY, canvasY),
                Math.abs(canvasX - startCanvasX),
                Math.abs(canvasY - startCanvasY)
            );
            ctx.restore();
            e.preventDefault();
            return;
        }

        // テキスト注釈ドラッグ
        if (!this.draggingAnnotation) return;

        // Canvas座標をPDF座標に変換
        const point = AnnotationManager.toPdfPoint(canvasX, canvasY, this.previewScale, page.height);
        const pdfX = point.x;
        const pdfY = point.y;

        // 位置を更新
        this.draggingAnnotation.x = pdfX - this.dragOffset.x;
        this.draggingAnnotation.y = pdfY - this.dragOffset.y;

        // キャッシュ背景を使ってテキストのみ再描画
        this.redrawWithCachedBackground();
        e.preventDefault();
    }

    private onCanvasMouseUp(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];

        // ハイライトモードで範囲選択完了
        if (this.isHighlightMode && this.highlightStart) {
            if (page) {
                const canvas = this.elements.previewCanvas;
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;

                const canvasX = (e.clientX - rect.left) * scaleX;
                const canvasY = (e.clientY - rect.top) * scaleY;

                const point = AnnotationManager.toPdfPoint(canvasX, canvasY, this.previewScale, page.height);
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
                    if (!page.highlightAnnotations) {
                        page.highlightAnnotations = [];
                    }
                    page.highlightAnnotations.push(highlight);
                    // Undoのためにハイライトを保存
                    this.pushUndo({ type: 'addHighlight', pageId: page.id, annotationId: highlight.id });
                    this.showToast('ハイライトを追加しました', 'success');
                }
            }
            this.highlightStart = null;
            // キャッシュ背景を使用
            if (this.backgroundImageData) {
                this.redrawWithCachedBackground();
            } else {
                this.updateMainView();
            }
            return;
        }

        // テキストドラッグ終了
        if (this.draggingAnnotation) {
            // 移動があった場合のみUndo記録
            if (this.draggingStart && (Math.abs(this.draggingStart.x - this.draggingAnnotation.x) > 1 || Math.abs(this.draggingStart.y - this.draggingAnnotation.y) > 1)) {
                this.pushUndo({
                    type: 'moveText',
                    pageId: page.id,
                    annotationId: this.draggingAnnotation.id,
                    fromX: this.draggingStart.x,
                    fromY: this.draggingStart.y,
                    toX: this.draggingAnnotation.x,
                    toY: this.draggingAnnotation.y
                });
            }

            this.draggingAnnotation = null;
            this.draggingStart = null;
            this.elements.previewCanvas.style.cursor = 'default';
        }
    }

    private onCanvasMouseLeave(): void {
        this.highlightStart = null;
        if (this.draggingAnnotation) {
            this.draggingAnnotation = null;
            this.elements.previewCanvas.style.cursor = 'default';
        }
        if (this.isHighlightMode && this.backgroundImageData) {
            this.redrawWithCachedBackground();
        }
    }

    private toggleHighlightMode(): void {
        this.isHighlightMode = !this.isHighlightMode;
        this.elements.btnHighlight.classList.toggle('active', this.isHighlightMode);
        this.elements.previewCanvas.style.cursor = this.isHighlightMode ? 'crosshair' : 'default';
        this.showToast(this.isHighlightMode ? 'マーカーモード: ドラッグで範囲選択' : 'マーカーモード解除', 'success');
    }

    private disableHighlightMode(): void {
        if (this.isHighlightMode) {
            this.isHighlightMode = false;
            this.elements.btnHighlight.classList.remove('active');
            this.elements.previewCanvas.style.cursor = 'default';
        }
    }

    private pushUndo(action: UndoAction): void {
        this.undoManager.push(action);
    }

    private undo(): void {
        const action = this.undoManager.popUndo();
        if (!action) {
            this.showToast('取り消す操作がありません', 'warning');
            return;
        }

        switch (action.type) {
            case 'deletePage':
                // ページを元の位置に挿入
                this.state.pages.splice(action.index, 0, action.page);
                this.state.selectedPageIndex = action.index;
                this.renderPageList();
                this.updateMainView();
                break;

            case 'movePage':
                // 移動を逆に実行
                this.state.pages = this.pdfService.reorderPages(
                    this.state.pages,
                    action.toIndex,
                    action.fromIndex
                );
                this.state.selectedPageIndex = action.fromIndex;
                this.renderPageList();
                this.updateMainView();
                break;

            case 'rotatePage': {
                const rotPage = this.state.pages.find(p => p.id === action.pageId);
                if (rotPage) {
                    rotPage.rotation = action.previousRotation;
                    this.renderPageList();
                    this.updateMainView();
                }
                break;
            }

            case 'clear':
                // 全ページを復元
                this.state.pages = action.pages;
                this.state.selectedPageIndex = action.selectedIndex;
                this.renderPageList();
                this.updateMainView();
                break;

            case 'addText': {
                const txtPage = this.state.pages.find(p => p.id === action.pageId);
                if (txtPage?.textAnnotations) {
                    const idx = txtPage.textAnnotations.findIndex(a => a.id === action.annotationId);
                    if (idx >= 0) txtPage.textAnnotations.splice(idx, 1);
                }
                break;
            }

            case 'addHighlight': {
                const hlPage = this.state.pages.find(p => p.id === action.pageId);
                if (hlPage?.highlightAnnotations) {
                    const idx = hlPage.highlightAnnotations.findIndex(a => a.id === action.annotationId);
                    if (idx >= 0) hlPage.highlightAnnotations.splice(idx, 1);
                }
                break;
            }

            case 'addImage':
            case 'duplicatePage': {
                // 追加されたページを削除
                if (action.index >= 0 && action.index < this.state.pages.length) {
                    const page = this.state.pages[action.index];
                    // IDが一致するか確認して削除
                    if (page.id === action.pageId) {
                        this.state.pages.splice(action.index, 1);

                        // 選択インデックスを調整
                        if (this.state.selectedPageIndex >= this.state.pages.length) {
                            this.state.selectedPageIndex = this.state.pages.length - 1;
                        } else if (this.state.selectedPageIndex === action.index) {
                            // 削除したページを選択していた場合は一つ前を選択（なければ-1）
                            this.state.selectedPageIndex = Math.max(-1, action.index - 1);
                        }

                        this.renderPageList();
                        this.updateMainView();
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
                        // キャッシュ背景を使用
                        if (this.backgroundImageData) {
                            this.redrawWithCachedBackground();
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
            }
        }

        // 再描画
        if (this.backgroundImageData) {
            this.redrawWithCachedBackground();
        } else {
            this.updateMainView();
        }
        this.updateUI();
    }

    private async savePDF(): Promise<void> {
        if (this.state.pages.length === 0) return;

        this.showLoading('PDFを生成中...');

        try {
            const pdfDoc = await PDFDocument.create();

            for (const page of this.state.pages) {
                let pdfPage;
                if (page.type === 'image') {
                    pdfPage = await this.imageService.embedImageToPdf(pdfDoc, page);
                    // 画像ページの回転を適用
                    if (page.rotation && pdfPage) {
                        pdfPage.setRotation(degrees(page.rotation));
                    }
                } else if (page.pdfBytes && page.originalPageIndex !== undefined) {
                    // PDF由来のページをコピー
                    const srcDoc = await PDFDocument.load(page.pdfBytes);
                    const [copiedPage] = await pdfDoc.copyPages(srcDoc, [
                        page.originalPageIndex,
                    ]);
                    // ユーザー回転を適用
                    if (page.rotation) {
                        const currentRotation = copiedPage.getRotation().angle;
                        copiedPage.setRotation(degrees(currentRotation + page.rotation));
                    }
                    pdfDoc.addPage(copiedPage);
                    pdfPage = copiedPage;
                }

                // テキスト注釈を埋め込む
                if (pdfPage && page.textAnnotations && page.textAnnotations.length > 0) {
                    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                    for (const annotation of page.textAnnotations) {
                        // Hex色をRGBに変換
                        const hex = annotation.color.replace('#', '');
                        const r = parseInt(hex.substring(0, 2), 16) / 255;
                        const g = parseInt(hex.substring(2, 4), 16) / 255;
                        const b = parseInt(hex.substring(4, 6), 16) / 255;

                        pdfPage.drawText(annotation.text, {
                            x: annotation.x,
                            y: annotation.y,
                            size: annotation.fontSize,
                            font,
                            color: rgb(r, g, b),
                        });
                    }
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

    private async exportCurrentPage(): Promise<void> {
        if (this.state.selectedPageIndex < 0 || this.state.pages.length === 0) return;

        this.showLoading('画像を生成中...');

        try {
            const page = this.state.pages[this.state.selectedPageIndex];
            const blob = await this.pdfService.exportPageAsImage(page);
            saveAs(blob, `page_${this.state.selectedPageIndex + 1}.png`);
            this.showToast('画像を保存しました', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('画像の保存に失敗しました', 'error');
        }

        this.hideLoading();
    }

    private async exportAllPages(): Promise<void> {
        if (this.state.pages.length === 0) return;

        this.showLoading('ZIPを生成中...');

        try {
            const blob = await this.pdfService.exportAllPagesAsZip(this.state.pages);
            saveAs(blob, 'pages.zip');
            this.showToast('ZIPを保存しました', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('ZIPの保存に失敗しました', 'error');
        }

        this.hideLoading();
    }

    private async splitAndDownload(): Promise<void> {
        if (this.state.pages.length === 0) return;

        this.showLoading('PDFを分割中...');

        try {
            // まずPDFを生成
            const pdfDoc = await PDFDocument.create();

            for (const page of this.state.pages) {
                if (page.type === 'image') {
                    await this.imageService.embedImageToPdf(pdfDoc, page);
                } else if (page.pdfBytes && page.originalPageIndex !== undefined) {
                    const srcDoc = await PDFDocument.load(page.pdfBytes);
                    const [copiedPage] = await pdfDoc.copyPages(srcDoc, [page.originalPageIndex]);
                    pdfDoc.addPage(copiedPage);
                }
            }

            const pdfBytes = await pdfDoc.save();
            const pdfSize = pdfBytes.length;
            const maxSize = 10 * 1024 * 1024; // 10MB

            // サイズが10MB以下なら分割不要
            if (pdfSize <= maxSize) {
                this.showToast('10MB以下のため分割不要です。通常保存を使用してください。', 'warning');
                this.hideLoading();
                return;
            }

            // バイナリ分割してZIPでダウンロード
            const blob = await this.pdfService.splitBinaryAsZip(new Uint8Array(pdfBytes), 'document.pdf');
            const chunkCount = Math.ceil(pdfSize / maxSize);
            saveAs(blob, 'document_split.zip');
            this.showToast(`${chunkCount}個のファイルに分割しました`, 'success');
        } catch (error) {
            console.error('Split error:', error);
            this.showToast('分割に失敗しました', 'error');
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

    private updateThemeIcons(): void {
        this.elements.iconLight.style.display = this.state.isDarkMode ? 'none' : 'block';
        this.elements.iconDark.style.display = this.state.isDarkMode ? 'block' : 'none';
    }

    private toggleTheme(): void {
        this.state.isDarkMode = !this.state.isDarkMode;
        document.documentElement.classList.toggle('dark', this.state.isDarkMode);
        this.updateThemeIcons();
        localStorage.setItem('theme', this.state.isDarkMode ? 'dark' : 'light');
    }

    private loadThemePreference(): void {
        const saved = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.state.isDarkMode = saved === 'dark' || (!saved && prefersDark);
        document.documentElement.classList.toggle('dark', this.state.isDarkMode);
        this.updateThemeIcons();
    }

    private showLoading(text: string): void {
        this.elements.loadingText.textContent = text;
        this.elements.loadingOverlay.style.display = 'flex';
    }

    private hideLoading(): void {
        this.elements.loadingOverlay.style.display = 'none';
    }

    private showToast(message: string, type: ToastType): void {
        // 成功メッセージは非表示（警告・エラーのみ表示）
        if (type === 'success') return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        this.elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // ズーム機能
    private setZoom(zoom: number): void {
        // 50% ~ 200% の範囲に制限
        const newZoom = Math.max(0.5, Math.min(2.0, zoom));
        if (this.currentZoom !== newZoom) {
            this.currentZoom = newZoom;
            this.elements.zoomLevel.textContent = `${Math.round(this.currentZoom * 100)}%`;

            // 背景などを再描画
            if (this.state.pages.length > 0) {
                this.updateMainView();
            }
        }
    }

    private zoomIn(): void {
        this.setZoom(this.currentZoom + 0.25);
    }

    private zoomOut(): void {
        this.setZoom(this.currentZoom - 0.25);
    }

    private resetZoom(): void {
        this.setZoom(1.0);
    }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    const app = new PDFEditorApp();
    app.init();
});
