import { saveAs } from 'file-saver';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { PDFService } from './services/PDFService';
import { ImageService } from './services/ImageService';
import { KeyboardService } from './services/KeyboardService';
import { UndoManager } from './managers/UndoManager';
import { AnnotationManager } from './managers/AnnotationManager';
import { PageManager } from './managers/PageManager';
import { SelectionManager } from './managers/SelectionManager';
import { DragDropManager } from './managers/DragDropManager';
import { StorageService } from './services/StorageService';
import { ContextMenuManager } from './managers/ContextMenuManager';
import { EventManager } from './managers/EventManager';
import { ToolbarManager } from './managers/ToolbarManager';
import { RenderManager } from './managers/RenderManager';
import { HelpManager } from './managers/HelpManager';
import type { AppState, PageData, ToastType, TextAnnotation, HighlightAnnotation, UndoAction, UIElements, AppAction } from './types';
import './styles/index.css';

// Worker設定はPDFService側で行われる

export class PDFEditorApp implements AppAction {
    public state: AppState = {
        pages: [],
        selectedPageIndex: -1,
        selectedPageIndices: [],
        isLoading: false,
        isDarkMode: false,
        originalPdfBytes: null,
    };

    private pdfService: PDFService;
    private imageService: ImageService;
    private keyboardService: KeyboardService;
    private pageManager: PageManager;
    private selectionManager: SelectionManager;
    private dragDropManager: DragDropManager;
    private eventManager!: EventManager;
    private toolbarManager!: ToolbarManager;
    private renderManager!: RenderManager;
    private helpManager!: HelpManager;

    // ドラッグ状態
    private draggingAnnotation: TextAnnotation | HighlightAnnotation | null = null;
    private dragOffset = { x: 0, y: 0 };
    private draggingStart: { x: number; y: number } | null = null;
    private selectedAnnotationId: string | null = null; // 選択された注釈ID
    private editingAnnotationId: string | null = null; // 編集中の注釈ID
    private clipboard: TextAnnotation | HighlightAnnotation | null = null; // コピー用
    private pageClipboard: PageData | null = null; // ページコピー用

    private get previewScale(): number {
        return this.renderManager?.getZoom() || 1.0;
    }

    public get backgroundImageData(): ImageData | null {
        return this.renderManager?.getBackgroundImageData() || null;
    }



    // セッション保存
    private storageService: StorageService;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    private readonly SAVE_DEBOUNCE_MS = 1000;

    // コンテキストメニュー
    private contextMenuManager: ContextMenuManager;

    constructor() {
        this.pdfService = new PDFService();
        this.imageService = new ImageService();
        this.keyboardService = new KeyboardService();
        this.undoManager = new UndoManager();
        this.storageService = new StorageService();
        this.contextMenuManager = new ContextMenuManager();
        this.pageManager = new PageManager(
            () => this.state, // State getter
            this.undoManager
        );
        this.selectionManager = new SelectionManager(() => this.state);
        this.dragDropManager = new DragDropManager(() => this.state);
    }



    /**
     * MouseEventからCanvas上の座標（Canvas座標系）を取得
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

    // ... (unchanged code) ...

    public deleteSelectedAnnotation(): void {
        if (!this.selectedAnnotationId || this.state.selectedPageIndex < 0) return;

        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        // テキストから検索
        if (page.textAnnotations) {
            const index = page.textAnnotations.findIndex(a => a.id === this.selectedAnnotationId);
            if (index !== -1) {
                const annotation = page.textAnnotations[index];
                this.pushUndo({ type: 'deleteText', pageId: page.id, annotationId: annotation.id, annotation });
                page.textAnnotations.splice(index, 1);
                this.selectedAnnotationId = null;
                this.showToast('テキストを削除しました', 'success');
                if (this.renderManager) {
                    this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                } else {
                    this.updateMainView();
                }
                return;
            }
        }

        // ハイライトから検索
        if (page.highlightAnnotations) {
            const index = page.highlightAnnotations.findIndex(a => a.id === this.selectedAnnotationId);
            if (index !== -1) {
                const annotation = page.highlightAnnotations[index];
                this.pushUndo({ type: 'deleteHighlight', pageId: page.id, annotationId: annotation.id, annotation });
                page.highlightAnnotations.splice(index, 1);
                this.selectedAnnotationId = null;
                this.showToast('ハイライトを削除しました', 'success');
                if (this.renderManager) {
                    this.renderManager.redrawWithCachedBackground(null);
                } else {
                    this.updateMainView();
                }
                return;
            }
        }
    }

    public handleCopy(): void {
        if (this.state.selectedPageIndex < 0) return;
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        // 1. 注釈コピー (選択中なら優先)
        if (this.selectedAnnotationId) {
            // テキストから検索
            if (page.textAnnotations) {
                const ann = page.textAnnotations.find(a => a.id === this.selectedAnnotationId);
                if (ann) {
                    this.clipboard = JSON.parse(JSON.stringify(ann));
                    this.pageClipboard = null; // ページクリップボードはクリア
                    this.showToast('注釈をコピーしました', 'success');
                    return;
                }
            }
            // ハイライトから検索
            if (page.highlightAnnotations) {
                const ann = page.highlightAnnotations.find(a => a.id === this.selectedAnnotationId);
                if (ann) {
                    this.clipboard = JSON.parse(JSON.stringify(ann));
                    this.pageClipboard = null;
                    this.showToast('注釈をコピーしました', 'success');
                    return;
                }
            }
        }

        // 2. ページコピー (注釈非選択時)
        // JSON.stringifyでディープコピーすると画像データが巨大すぎてエラーになるため、
        // 必要なプロパティを手動でコピーする（画像データは文字列参照渡しでOK）
        this.pageClipboard = {
            ...page,
            textAnnotations: page.textAnnotations?.map(a => ({ ...a })),
            highlightAnnotations: page.highlightAnnotations?.map(a => ({ ...a }))
        };
        this.clipboard = null; // 注釈クリップボードはクリア
        this.showToast('ページをコピーしました', 'success');
    }

    public handlePaste(): void {
        if (this.state.selectedPageIndex < 0) return;
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        // 1. 注釈ペースト
        if (this.clipboard) {
            const newId = crypto.randomUUID();
            // 右下に少しずらす
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
                this.pushUndo({ type: 'addText', pageId: page.id, annotationId: newId, annotation: newAnn });
                this.selectedAnnotationId = newId;
            } else {
                const newAnn: HighlightAnnotation = {
                    ...this.clipboard as HighlightAnnotation,
                    id: newId,
                    x: (this.clipboard.x || 0) + offsetX,
                    y: (this.clipboard.y || 0) + offsetY
                };

                if (!page.highlightAnnotations) page.highlightAnnotations = [];
                page.highlightAnnotations.push(newAnn);
                this.pushUndo({ type: 'addHighlight', pageId: page.id, annotationId: newId, annotation: newAnn });
                this.selectedAnnotationId = newId;
            }

            this.showToast('注釈を貼り付けました', 'success');
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(null);
            } else {
                this.updateMainView();
            }
            return;
        }

        // 2. ページペースト
        if (this.pageClipboard) {
            // ディープコピーを作成
            const duplicatedPage: PageData = {
                ...this.pageClipboard,
                textAnnotations: this.pageClipboard.textAnnotations?.map(a => ({ ...a })),
                highlightAnnotations: this.pageClipboard.highlightAnnotations?.map(a => ({ ...a })),
                id: crypto.randomUUID(),
            };

            // 選択ページの次に挿入
            const insertIndex = this.state.selectedPageIndex + 1;
            this.state.pages = this.pdfService.insertPageAt(
                this.state.pages,
                duplicatedPage,
                insertIndex
            );
            this.state.selectedPageIndex = insertIndex;

            // Undoのために複製したページを保存
            this.pushUndo({
                type: 'duplicatePage',
                pageId: duplicatedPage.id,
                index: insertIndex
            });

            this.renderPageList();
            this.updateMainView();
            this.updatePageNav();
            this.updateUI();
            this.showToast('ページを貼り付けました', 'success');
        }
    }

    public selectPage(index: number, multiSelect: boolean = false, rangeSelect: boolean = false): void {
        if (index < 0 || index >= this.state.pages.length) return;

        // ページ切り替え時に選択解除
        this.selectedAnnotationId = null;

        if (rangeSelect) {
            this.selectionManager.selectRange(index);
        } else {
            this.selectionManager.select(index, multiSelect);
        }

        this.updateThumbnailSelection();
        this.updateMainView();
        this.updatePageNav();
        this.updateUI();
    }

    public selectAllPages(): void {
        if (this.state.pages.length === 0) return;
        this.selectionManager.selectAll();

        this.updateThumbnailSelection();
        this.updateMainView();
        this.updatePageNav();
        this.updateUI();
        this.showToast('全てのページを選択しました', 'info');
    }

    // ハイライトモード
    private isHighlightMode = false;
    private highlightStart: { x: number; y: number } | null = null;
    private highlightColor = '#ffff00'; // 黄色

    // リサイズ状態
    private isResizing = false;
    private resizeStart: {
        x: number;
        y: number;
        originalSize: number | { width: number; height: number };
        annotation: TextAnnotation | HighlightAnnotation;
        type: 'text' | 'highlight';
    } | null = null;

    // マネージャー
    private undoManager: UndoManager;





    // DOM Elements
    // DOM Elements
    private elements!: UIElements;



    /**
     * アプリケーション初期化
     */
    async init(): Promise<void> {
        this.cacheElements();

        // EventManager初期化
        this.eventManager = new EventManager(
            this,
            this.elements,
            this.dragDropManager,
            this.contextMenuManager,
            this.keyboardService
        );
        this.eventManager.bindEvents();

        // ToolbarManager初期化
        this.toolbarManager = new ToolbarManager(this.elements);
        this.toolbarManager.setupDropdownMenus();

        // HelpManager初期化
        this.helpManager = new HelpManager(
            this.elements.btnHelp,
            this.elements.helpModal,
            this.elements.helpModalClose
        );
        this.helpManager.init();

        // RenderManager初期化
        this.renderManager = new RenderManager(this.elements, () => this.state);

        this.loadThemePreference();

        // レンダリングコンテキスト初期化
        this.elements.previewCanvas.getContext('2d');



        // セッション復元
        try {
            await this.storageService.init();
            const restored = await this.restoreSession();

            // 復元されなかった場合のみEmpty Stateを表示
            if (!restored) {
                this.elements.emptyState.style.display = 'flex';
                this.updateUI();
            }
        } catch (e) {
            console.warn('Session restore failed:', e);
            this.elements.emptyState.style.display = 'flex';
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 注釈IDを取得
     */
    public getSelectedAnnotationId(): string | null {
        return this.selectedAnnotationId;
    }

    /**
     * セッションを復元
     */
    private async restoreSession(): Promise<boolean> {
        const savedState = await this.storageService.loadState();
        if (savedState && savedState.pages && savedState.pages.length > 0) {
            this.state = savedState;
            this.renderPageList();
            this.updateMainView();
            this.updateUI();
            this.showToast('前回の続きから再開しました', 'info');
            return true;
        }
        return false;
    }

    /**
     * 自動保存（デバウンス処理）
     */
    private scheduleAutoSave(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(async () => {
            try {
                await this.storageService.saveState(this.state);
            } catch (e) {
                console.warn('Auto-save failed:', e);
            }
        }, this.SAVE_DEBOUNCE_MS);
    }








    private cacheElements(): void {
        // 画像用の hidden input を動的に追加
        let imageInput = document.getElementById('image-input') as HTMLInputElement;
        if (!imageInput) {
            imageInput = document.createElement('input');
            imageInput.type = 'file';
            imageInput.id = 'image-input';
            imageInput.accept = '.png,.jpg,.jpeg';
            imageInput.multiple = true;
            imageInput.style.display = 'none';
            document.body.appendChild(imageInput);
        }

        this.elements = {
            btnOpen: document.getElementById('btn-open') as HTMLButtonElement,
            btnOpenHero: document.getElementById('btn-open-hero') as HTMLButtonElement, // 追加
            btnSave: document.getElementById('btn-save') as HTMLButtonElement,
            btnSaveAs: document.getElementById('btn-save-as') as HTMLButtonElement,
            btnSplit: document.getElementById('btn-split') as HTMLButtonElement,
            btnFileMenu: document.getElementById('btn-file-menu') as HTMLButtonElement,
            fileMenu: document.getElementById('file-menu') as HTMLDivElement,
            btnExportMenu: document.getElementById('btn-export-menu') as HTMLButtonElement,
            exportMenu: document.getElementById('export-menu') as HTMLDivElement,
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
            btnUndo: document.getElementById('btn-undo') as HTMLButtonElement,
            btnRedo: document.getElementById('btn-redo') as HTMLButtonElement,
            zoomLevel: document.getElementById('zoom-level') as HTMLSpanElement,
            // Help
            btnHelp: document.getElementById('btn-help') as HTMLButtonElement,
            helpModal: document.getElementById('help-modal') as HTMLDivElement,
            helpModalClose: document.getElementById('help-modal-close') as HTMLButtonElement,
        };
    }









    public async handleFileDrop(files: FileList): Promise<void> {
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

    public async loadPDF(file: File): Promise<void> {
        this.showLoading('PDFを読み込み中...');

        const result = await this.pdfService.loadPDF(file);

        if (result.success && result.pages) {
            // 新しいPDFで置き換え（複数PDF結合が必要な場合はドラッグ&ドロップで追加）
            this.state.pages = result.pages;
            this.state.originalPdfBytes = new Uint8Array(await file.arrayBuffer());

            if (this.state.selectedPageIndex === -1 && this.state.pages.length > 0) {
                this.state.selectedPageIndex = 0;
                this.state.selectedPageIndices = [0];
            }

            this.renderPageList();
            this.updateMainView();
            this.updateUI();
            this.scheduleAutoSave();
            this.showToast(`${result.pages.length}ページを読み込みました`, 'success');
        } else {
            this.showToast(result.error || 'PDFの読み込みに失敗しました', 'error');
        }

        this.hideLoading();
    }

    public async insertImage(file: File): Promise<void> {
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

    public deletePages(targetIndices?: number[]): void {
        const indicesToDelete = targetIndices
            ? [...targetIndices]
            : [...this.state.selectedPageIndices];

        if (indicesToDelete.length === 0 || this.state.pages.length === 0) return;

        const message = indicesToDelete.length === 1
            ? `ページ ${indicesToDelete[0] + 1} を削除しますか？`
            : `${indicesToDelete.length}ページを削除しますか？`;

        if (!confirm(message)) return;

        this.pageManager.deletePages(indicesToDelete);

        this.renderPageList();
        this.updateMainView();
        this.updatePageNav();
        this.updateUI();
        const msg = indicesToDelete.length === 1 ? 'ページを削除しました' : `${indicesToDelete.length}ページを削除しました`;
        this.showToast(msg, 'success');
    }

    private movePage(direction: 'up' | 'down', targetIndex: number = this.state.selectedPageIndex): void {
        const index = targetIndex;
        const newIndex = direction === 'up' ? index - 1 : index + 2;

        // Note: Validation is done in pageManager, but checking locally to avoid UI message if invalid?
        // PageManager.movePage will return early if invalid.
        // But we want to show toast?
        // Let's rely on PageManager not throwing, and just run it.
        // If state didn't change (check pages ref?), we could skip toast.
        // But for simplification, just call it.

        if (index < 0 || this.state.pages.length < 2) return;
        if (direction === 'up' && index <= 0) return;
        if (direction === 'down' && index >= this.state.pages.length - 1) return;

        this.pageManager.movePage(index, newIndex);

        this.renderPageList();
        this.updateMainView();
        this.updateUI();
        this.showToast(`ページを${direction === 'up' ? '上' : '下'}に移動しました`, 'success');
    }

    public movePageUp(index?: number): void {
        this.movePage('up', index);
    }

    public movePageDown(index?: number): void {
        this.movePage('down', index);
    }

    public rotatePages(targetIndices?: number[]): void {
        const indices = targetIndices || this.state.selectedPageIndices;
        if (indices.length === 0 || this.state.pages.length === 0) return;

        this.pageManager.rotatePages(indices);

        // キャッシュをクリア（回転後の正しい画像を表示するため）
        if (this.renderManager) {
            this.renderManager.clearCache();
        }

        this.renderPageList();
        this.updateMainView();
        this.updateUI(); // Undo/Redoボタン状態更新
        const msg = indices.length === 1 ? 'ページを90°回転しました' : `${indices.length}ページを回転しました`;
        this.showToast(msg, 'success');
    }

    public duplicatePages(targetIndices?: number[]): void {
        const indices = targetIndices || this.state.selectedPageIndices;
        if (indices.length === 0 || this.state.pages.length === 0) return;

        this.pageManager.duplicatePages(indices);

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

        // 選択状態の確認（複数選択対応）
        if (this.state.selectedPageIndices.includes(index)) {
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

        // クリックイベント（Ctrl/Shift+クリック対応）
        container.addEventListener('click', (e) => {
            this.selectPage(index, e.ctrlKey || e.metaKey, e.shiftKey);
        });

        // ドラッグ並べ替え（複数ページ対応）
        this.dragDropManager.registerThumbnail(container, index, (fromIndices, toIndex) => {
            this.pageManager.movePages(fromIndices, toIndex);
            this.renderPageList();
            this.updateMainView();
            this.updateUI();
        });

        return container;
    }



    private updateThumbnailSelection(): void {
        const thumbnails = this.elements.pageList.querySelectorAll('.page-thumbnail');
        thumbnails.forEach((thumb, index) => {
            thumb.classList.toggle('selected', this.state.selectedPageIndices.includes(index));
        });
    }

    private async updateMainView(): Promise<void> {
        if (this.renderManager) {
            // 初回表示時かつズーム未設定の場合、フィットさせる？
            // ここではシンプルにレンダリングのみ
            await this.renderManager.renderMainView();
        }
    }

    public handleWheelZoom(direction: number, _clientX: number, _clientY: number): void {
        if (!this.renderManager) return;

        const currentZoom = this.renderManager.getZoom();
        let newZoom = currentZoom;
        const ZOOM_STEP = 0.1;

        if (direction < 0) {
            newZoom += ZOOM_STEP; // Zoom In
        } else {
            newZoom -= ZOOM_STEP; // Zoom Out
        }

        // 範囲制限はRenderManager側でもやるが、ここでも事前チェック可能
        newZoom = Math.max(0.1, Math.min(newZoom, 5.0));

        if (newZoom !== currentZoom) {
            // マウス位置を中心にズームしたい場合の計算（今はシンプルに中心ズーム or 左上ズーム）
            // Scroll位置調整が必要。
            // 簡易実装: まずズーム変更
            this.renderManager.setZoom(newZoom);
            this.handleZoomChange();

            // TODO: マウス位置中心のズーム (高度な実装)
            // 現在のscrollLeft/Topとマウス位置から、新しいscrollLeft/Topを計算
        }
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
        this.toolbarManager.update(
            this.state,
            this.undoManager.canUndo(),
            this.undoManager.canRedo()
        );
    }

    public clearPages(): void {
        if (!confirm('すべてのページを削除しますか？\nこの操作は元に戻せます。')) return;

        this.pageManager.clearPages();
        this.storageService.clearState().catch(e => console.warn('Clear state failed:', e));

        this.renderPageList();
        this.updateMainView(); // これでRenderManagerがemptyStateを正しく表示する
        this.elements.pageNav.style.display = 'none';
        this.updateUI();
        this.showToast('ページをクリアしました', 'success');
    }

    public openTextModal(annotation?: TextAnnotation): void {
        this.disableHighlightMode(); // マーカーモード解除
        this.elements.textModal.style.display = 'flex';

        if (annotation) {
            this.editingAnnotationId = annotation.id;
            this.elements.textInput.value = annotation.text;
            this.elements.textSize.value = String(annotation.fontSize);
            this.elements.textColor.value = annotation.color;
            this.elements.textModalOk.textContent = '更新';
        } else {
            this.editingAnnotationId = null;
            this.elements.textInput.value = '';
            this.elements.textSize.value = '16';
            this.elements.textColor.value = '#000000';
            this.elements.textModalOk.textContent = '追加';
        }

        this.elements.textInput.focus();
    }

    public closeTextModal(): void {
        this.elements.textModal.style.display = 'none';
        this.editingAnnotationId = null;
    }

    public addTextAnnotation(): void {
        const text = this.elements.textInput.value.trim();
        if (!text) return;

        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        // 既存の注釈を更新する場合
        if (this.editingAnnotationId) {
            if (page.textAnnotations) {
                const index = page.textAnnotations.findIndex(a => a.id === this.editingAnnotationId);
                if (index !== -1) {
                    const oldAnnotation = page.textAnnotations[index];
                    const newFontSize = parseInt(this.elements.textSize.value);
                    const newColor = this.elements.textColor.value;

                    // Undo記録
                    this.pushUndo({
                        type: 'updateText',
                        pageId: page.id,
                        annotationId: oldAnnotation.id,
                        oldText: oldAnnotation.text,
                        newText: text,
                        oldColor: oldAnnotation.color,
                        newColor: newColor,
                        oldFontSize: oldAnnotation.fontSize,
                        newFontSize: newFontSize
                    });

                    // 更新
                    page.textAnnotations[index] = {
                        ...oldAnnotation,
                        text,
                        fontSize: newFontSize,
                        color: newColor
                    };

                    this.showToast('テキストを更新しました', 'success');
                }
            }
        } else {
            // 新規追加
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
            this.showToast('テキストを追加しました', 'success');
        }

        this.closeTextModal();
        // キャッシュ背景がある場合はそれを使用、なければフル再描画
        if (this.renderManager) {
            this.renderManager.redrawWithCachedBackground(null);
        } else {
            this.updateMainView();
        }
    }



    public onCanvasMouseDown(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        // Canvas座標取得
        const { x: canvasX, y: canvasY } = this.getCanvasPoint(e);

        // Canvas座標をPDF座標に変換
        const point = AnnotationManager.toPdfPoint(
            canvasX,
            canvasY,
            this.previewScale,
            page.height,
            page.width,
            page.rotation
        );
        const pdfX = point.x;
        const pdfY = point.y;

        // ハイライトモードの場合は開始位置を記録 (選択より優先)
        // ただし右クリック(button===2)の場合はコンテキストメニューを出したいのでスキップ
        if (this.isHighlightMode && e.button !== 2) {
            this.highlightStart = { x: pdfX, y: pdfY };
            // 選択解除
            this.selectedAnnotationId = null;
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(null);
            } else {
                this.updateMainView();
            }
            e.preventDefault();
            return;
        }

        // 0. リサイズハンドルの判定 (選択中のみ)
        if (this.selectedAnnotationId) {
            const ctx = this.elements.previewCanvas.getContext('2d')!;

            // 0.1 回転ハンドルの判定
            const hitRotHandle = AnnotationManager.hitTestTextRotationHandle(
                ctx,
                page,
                pdfX,
                pdfY,
                this.previewScale,
                this.selectedAnnotationId
            );

            if (hitRotHandle) {
                this.rotatingAnnotationId = hitRotHandle.id;

                // Calculate initial angle relative to text center
                const metrics = AnnotationManager.getTextMetrics(ctx, hitRotHandle.text, hitRotHandle.fontSize, this.previewScale);
                const textWidthPdf = metrics.width / this.previewScale;
                const textHeightPdf = metrics.height / this.previewScale;
                const centerX = hitRotHandle.x + textWidthPdf / 2;
                const centerY = hitRotHandle.y - textHeightPdf / 2; // Y is Top

                const dy = pdfY - centerY;
                const dx = pdfX - centerX;

                this.rotationStartAngle = Math.atan2(dy, dx);
                this.initialRotation = hitRotHandle.rotation || 0;

                this.elements.previewCanvas.style.cursor = 'grabbing';
                e.preventDefault();
                return;
            }

            // 0.2 リサイズハンドル
            const hitHandle = AnnotationManager.hitTestTextHandle(
                ctx,
                page,
                pdfX,
                pdfY,
                this.previewScale,
                this.selectedAnnotationId
            );

            if (hitHandle) {
                this.isResizing = true;
                this.resizeStart = {
                    x: e.clientX,
                    y: e.clientY,
                    originalSize: hitHandle.fontSize,
                    annotation: hitHandle,
                    type: 'text'
                };
                this.elements.previewCanvas.style.cursor = 'nwse-resize';
                e.preventDefault();
                return;
            }
        }

        // 1. テキスト注釈のヒット判定 (優先)
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
                this.updateMainView();
            }
            e.preventDefault();
            return;

        }

        // 1.5 ハイライト注釈のリサイズハンドル判定
        if (this.selectedAnnotationId) {
            const hitHighlight = AnnotationManager.hitTestHighlightHandle(page, pdfX, pdfY, this.selectedAnnotationId, this.previewScale);
            if (hitHighlight) {
                this.isResizing = true;
                this.resizeStart = {
                    x: e.clientX,
                    y: e.clientY,
                    originalSize: { width: hitHighlight.width, height: hitHighlight.height },
                    annotation: hitHighlight,
                    type: 'highlight'
                };
                this.draggingAnnotation = null; // リサイズ中は移動しない
                e.preventDefault();
                return;
            }
        }

        // 2. ハイライト注釈のヒット判定
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
                this.updateMainView();
            }
            e.preventDefault();
            return;
        }

        // ヒットしない場合は選択解除
        if (this.selectedAnnotationId) {
            this.selectedAnnotationId = null;
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(null);
            } else {
                this.updateMainView();
            }
        }
    }

    private isDraggingRenderPending = false;
    private lastMouseEvent: MouseEvent | null = null;

    // Rotation State
    private rotatingAnnotationId: string | null = null;
    private rotationStartAngle: number = 0;
    private initialRotation: number = 0;

    public onCanvasMouseMove(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        // ドラッグ中またはハイライトモード中のドラッグ判断（同期処理）
        const isHighlightDragging = this.isHighlightMode && !!this.highlightStart;
        const isAnnotationDragging = !!this.draggingAnnotation;
        const isRotating = !!this.rotatingAnnotationId;

        // リサイズ中
        if (this.isResizing && this.resizeStart) {
            e.preventDefault();
        } else if (isHighlightDragging || isAnnotationDragging || isRotating) {
            e.preventDefault();
        } else {
            return;
        }

        this.lastMouseEvent = e;

        if (this.isDraggingRenderPending) return;

        this.isDraggingRenderPending = true;
        requestAnimationFrame(() => {
            // ページが切り替わっている等の場合は中止
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

        // ハイライトモードでドラッグ中はプレビュー矩形を描画
        if (this.isHighlightMode && this.highlightStart) {
            if (!this.backgroundImageData) return;
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(null);
            } else {
                this.updateMainView();
            }
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

                // Canvas coords to PDF point
                const point = AnnotationManager.toPdfPoint(
                    canvasX,
                    canvasY,
                    this.previewScale,
                    page.height,
                    page.width,
                    page.rotation
                );

                const dx = point.x - centerX;
                const dy = point.y - centerY;

                const currentAngle = Math.atan2(dy, dx);
                const deltaAngle = currentAngle - this.rotationStartAngle;

                // Convert radians to degrees
                const deltaDeg = deltaAngle * 180 / Math.PI;

                // +Rotation is CW (Visual). +Angle is CCW (Math, if Y up).
                // So newRot = initial - deltaDeg.
                let newRot = this.initialRotation - deltaDeg;
                annotation.rotation = newRot;

                if (this.renderManager) {
                    this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                } else {
                    this.updateMainView();
                }
            }
            return;
        }

        // 注釈ドラッグ
        if (this.draggingAnnotation) {
            // Canvas座標をPDF座標に変換
            const point = AnnotationManager.toPdfPoint(
                canvasX,
                canvasY,
                this.previewScale,
                page.height,
                page.width,
                page.rotation
            );
            const pdfX = point.x;
            const pdfY = point.y;

            // 位置を更新
            this.draggingAnnotation.x = pdfX - this.dragOffset.x;
            this.draggingAnnotation.y = pdfY - this.dragOffset.y;

            // キャッシュ背景を使って再描画
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
            } else {
                this.updateMainView();
            }
            return; // 終了
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
                // width/height change
                // originalSize is {width, height}
                const startDims = this.resizeStart.originalSize as { width: number, height: number };
                // delta in PDF coords
                // dx is screen pixels. 
                const dPdfX = dx / this.previewScale;
                const dPdfY = dy / this.previewScale; // Y down on screen -> Y up on PDF? 
                // Wait. drag right (+dx) -> width increases.
                // drag down (+dy) -> height increases?
                // highlight: y is top, height is downwards. dragging down increases height (bottom moves down).
                // so simply adding abs delta?

                // Let's assume standard drag behavior:
                // newWidth = startWidth + dPdfX
                // newHeight = startHeight + dPdfY (since screen Y matches visual height direction)

                let newWidth = startDims.width + dPdfX;
                let newHeight = startDims.height + dPdfY; // dragging down (+Y) increases visual height

                newWidth = Math.max(5, newWidth);
                newHeight = Math.max(5, newHeight);

                const hl = this.resizeStart.annotation as HighlightAnnotation;
                hl.width = newWidth;
                hl.height = newHeight;
            }

            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
            } else {
                this.updateMainView();
            }
        }
    }

    public onCanvasMouseUp(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];

        // ハイライトモードで範囲選択完了
        if (this.isHighlightMode && this.highlightStart) {
            if (page) {
                const { x: canvasX, y: canvasY } = this.getCanvasPoint(e);

                const point = AnnotationManager.toPdfPoint(
                    canvasX,
                    canvasY,
                    this.previewScale,
                    page.height,
                    page.width,
                    page.rotation
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
                    if (!page.highlightAnnotations) {
                        page.highlightAnnotations = [];
                    }
                    page.highlightAnnotations.push(highlight);
                    // Undoのためにハイライトを保存
                    this.pushUndo({ type: 'addHighlight', pageId: page.id, annotationId: highlight.id });
                    this.showToast('ハイライトを追加しました', 'success');
                    // 追加後に選択状態にする
                    this.selectedAnnotationId = highlight.id;
                }
            }
            this.highlightStart = null;
            // キャッシュ背景を使用
            if (this.renderManager) {
                this.renderManager.redrawWithCachedBackground(null);
            } else {
                this.updateMainView();
            }
            return;
        }

        // 回転終了
        if (this.rotatingAnnotationId) {
            const annotation = page?.textAnnotations?.find(a => a.id === this.rotatingAnnotationId);
            if (annotation && page) {
                this.pushUndo({
                    type: 'rotateText',
                    pageId: page.id,
                    annotationId: annotation.id,
                    oldRotation: this.initialRotation,
                    newRotation: annotation.rotation || 0
                });
            }
            this.rotatingAnnotationId = null;
            this.elements.previewCanvas.style.cursor = 'default';
        }

        // 注釈ドラッグ終了
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

                if (Math.abs(textAnn.fontSize - startSize) > 0.5) {
                    this.pushUndo({
                        type: 'updateText',
                        pageId: page.id,
                        annotationId: textAnn.id,
                        oldText: textAnn.text,
                        newText: textAnn.text,
                        oldColor: textAnn.color,
                        newColor: textAnn.color,
                        oldFontSize: startSize,
                        newFontSize: textAnn.fontSize
                    });
                }
            } else if (this.resizeStart.type === 'highlight') {
                const startDims = this.resizeStart.originalSize as { width: number, height: number };
                const hlAnn = ann as HighlightAnnotation;

                if (Math.abs(hlAnn.width - startDims.width) > 1 || Math.abs(hlAnn.height - startDims.height) > 1) {
                    this.pushUndo({
                        type: 'resizeHighlight',
                        pageId: page.id,
                        annotationId: hlAnn.id,
                        oldWidth: startDims.width,
                        newWidth: hlAnn.width,
                        oldHeight: startDims.height,
                        newHeight: hlAnn.height
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
    }

    public onCanvasDoubleClick(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        const canvas = this.elements.previewCanvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        const point = AnnotationManager.toPdfPoint(
            canvasX,
            canvasY,
            this.previewScale,
            page.height,
            page.width,
            page.rotation
        );
        const pdfX = point.x;
        const pdfY = point.y;

        // テキスト注釈のヒット判定
        const ctx = this.elements.previewCanvas.getContext('2d')!;
        const hitAnnotation = AnnotationManager.hitTestText(ctx, page, pdfX, pdfY, this.previewScale);
        if (hitAnnotation) {
            // 編集モードとしてモーダルを開く
            this.openTextModal(hitAnnotation);
        }
    }

    private commitAnnotationDrag(): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (page && this.draggingAnnotation && this.draggingStart) {
            // 移動があった場合のみUndo記録
            if (Math.abs(this.draggingStart.x - this.draggingAnnotation.x) > 1 || Math.abs(this.draggingStart.y - this.draggingAnnotation.y) > 1) {
                // 型判定が必要
                if ('text' in this.draggingAnnotation) {
                    this.pushUndo({
                        type: 'moveText',
                        pageId: page.id,
                        annotationId: this.draggingAnnotation.id,
                        fromX: this.draggingStart.x,
                        fromY: this.draggingStart.y,
                        toX: this.draggingAnnotation.x,
                        toY: this.draggingAnnotation.y
                    });
                } else {
                    this.pushUndo({
                        type: 'moveHighlight',
                        pageId: page.id,
                        annotationId: this.draggingAnnotation.id,
                        fromX: this.draggingStart.x,
                        fromY: this.draggingStart.y,
                        toX: this.draggingAnnotation.x,
                        toY: this.draggingAnnotation.y
                    });
                }
            }
        }
    }

    public toggleHighlightMode(): void {
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
        this.updateUI();
        this.scheduleAutoSave();
    }

    /**
     * Undo実行
     */
    public undo(): void {
        const action = this.undoManager.popUndo();
        if (!action) {
            this.showToast('取り消す操作がありません', 'warning');
            return;
        }

        switch (action.type) {
            case 'deletePage':
                this.state.pages = this.pdfService.insertPageAt(
                    this.state.pages,
                    action.page,
                    action.index
                );
                this.state.selectedPageIndex = action.index;
                this.renderPageList();
                this.updateMainView();
                break;

            case 'movePage':
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
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page) {
                    // もし newRotation が未設定なら現在の値を保存
                    if (action.newRotation === undefined) {
                        action.newRotation = page.rotation || 0;
                    }
                    page.rotation = action.previousRotation;
                    // 回転変更時はキャッシュをクリア（古いビットマップを使わないように）
                    if (this.renderManager) {
                        this.renderManager.clearCache();
                    }
                    this.updateMainView();
                    this.renderPageList(); // サムネイルも更新
                }
                break;
            }

            case 'clear':
                this.state.pages = action.pages;
                this.state.selectedPageIndex = action.selectedIndex;
                this.renderPageList();
                this.updateMainView();
                break;

            case 'addText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.textAnnotations) {
                    const index = page.textAnnotations.findIndex(a => a.id === action.annotationId);
                    if (index !== -1) {
                        // 削除前に保存 (Redo用)
                        if (!action.annotation) {
                            action.annotation = { ...page.textAnnotations[index] };
                        }
                        page.textAnnotations.splice(index, 1);
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
            }

            case 'addHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const index = page.highlightAnnotations.findIndex(a => a.id === action.annotationId);
                    if (index !== -1) {
                        // 削除前に保存 (Redo用)
                        if (!action.annotation) {
                            action.annotation = { ...page.highlightAnnotations[index] };
                        }
                        page.highlightAnnotations.splice(index, 1);
                        // キャッシュ背景を使用
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
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
                        // 削除前に保存 (Redo用)
                        if (!action.page) {
                            action.page = page;
                        }

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
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
            }

            case 'moveHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.x = action.fromX;
                        ann.y = action.fromY;
                        // キャッシュ背景を使用
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
            }

            case 'deleteText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page) {
                    if (!page.textAnnotations) page.textAnnotations = [];
                    page.textAnnotations.push(action.annotation);
                    if (this.renderManager) {
                        this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                    } else {
                        this.updateMainView();
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
                        this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                    } else {
                        this.updateMainView();
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
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
            }

            case 'resizeHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.width = action.oldWidth;
                        ann.height = action.oldHeight;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
            }

            // バッチ操作
            case 'batchMove': {
                // batchMoveのUndo: 移動したページを元の位置に戻す
                // movedPageIdsを探して現位置を取得し、元のfromIndicesに戻す
                const currentIndices = action.movedPageIds.map(id =>
                    this.state.pages.findIndex(p => p.id === id)
                ).filter(i => i >= 0);

                if (currentIndices.length > 0) {
                    // 逆操作: 現在位置から元の位置へ
                    const sortedCurrent = [...currentIndices].sort((a, b) => b - a);
                    const pagesToRevert: typeof this.state.pages = [];
                    for (const idx of sortedCurrent) {
                        pagesToRevert.unshift(this.state.pages[idx]);
                        this.state.pages.splice(idx, 1);
                    }
                    // 元のfromIndicesに挿入（昇順で）
                    const sortedFrom = [...action.fromIndices].sort((a, b) => a - b);
                    for (let i = 0; i < sortedFrom.length; i++) {
                        this.state.pages.splice(sortedFrom[i], 0, pagesToRevert[i]);
                    }
                    this.state.selectedPageIndices = [...action.fromIndices];
                    this.state.selectedPageIndex = action.fromIndices[0];
                    this.renderPageList();
                }
                break;
            }

            case 'batchRotate': {
                // 各ページを元の回転角に戻す
                for (let i = 0; i < action.pageIds.length; i++) {
                    const page = this.state.pages.find(p => p.id === action.pageIds[i]);
                    if (page) {
                        page.rotation = action.previousRotations[i];
                    }
                }
                this.renderPageList();
                break;
            }

            case 'batchDuplicate': {
                // 追加されたページを降順で削除
                const sortedIndices = [...action.addedPages]
                    .sort((a, b) => b.index - a.index)
                    .map(ap => this.state.pages.findIndex(p => p.id === ap.page.id))
                    .filter(i => i >= 0);
                for (const idx of sortedIndices) {
                    this.state.pages.splice(idx, 1);
                }
                // 選択を調整
                if (this.state.pages.length > 0) {
                    this.state.selectedPageIndex = Math.min(this.state.selectedPageIndex, this.state.pages.length - 1);
                    this.state.selectedPageIndices = [this.state.selectedPageIndex];
                } else {
                    this.state.selectedPageIndex = -1;
                    this.state.selectedPageIndices = [];
                }
                this.renderPageList();
                this.updateMainView(); // Full render required
                return; // Skip generic update
            }

            case 'batchDelete': {
                // 削除されたページを元の位置に復元（昇順で）
                const sorted = [...action.deletedPages].sort((a, b) => a.index - b.index);
                for (const { page, index } of sorted) {
                    this.state.pages.splice(index, 0, page);
                }
                // 選択を復元
                this.state.selectedPageIndices = sorted.map(s => s.index);
                this.state.selectedPageIndex = sorted[0].index;
                this.renderPageList();
                this.updateMainView(); // Full render required
                return; // Skip generic update
            }
        }

        // 再描画 (注釈変更など、構造変化を伴わないもの)
        if (this.renderManager) {
            this.renderManager.redrawWithCachedBackground(null);
        } else {
            this.updateMainView();
        }
        this.updateUI();
    }

    /**
     * Redo実行
     */
    public redo(): void {
        const action = this.undoManager.popRedo();
        if (!action) {
            this.showToast('やり直す操作がありません', 'warning');
            return;
        }

        switch (action.type) {
            case 'deletePage':
                // 再度削除
                this.state.pages = this.pdfService.removePageAt(this.state.pages, action.index);
                // 選択インデックス調整
                if (this.state.selectedPageIndex >= this.state.pages.length) {
                    this.state.selectedPageIndex = this.state.pages.length - 1;
                }
                this.renderPageList();
                this.updateMainView();
                return;

            case 'movePage':
                // 元の順序に戻すには from -> to だが、Undoでは to -> from したので
                // Redoでは from -> to に移動する (movePageは fromIndex, toIndex を持つ)
                this.state.pages = this.pdfService.reorderPages(
                    this.state.pages,
                    action.fromIndex,
                    action.toIndex
                );
                this.state.selectedPageIndex = action.toIndex;
                this.renderPageList();
                this.updateMainView();
                return;

            case 'rotatePage': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && action.newRotation !== undefined) {
                    page.rotation = action.newRotation;
                    // 回転変更時はキャッシュをクリア
                    if (this.renderManager) {
                        this.renderManager.clearCache();
                    }
                    this.updateMainView();
                    this.renderPageList();
                }
                return;
            }

            case 'clear':
                // ClearのRedo: 現在のページを空にする
                this.state.pages = [];
                this.state.selectedPageIndex = -1;
                this.renderPageList();
                this.updateMainView();
                return;

            case 'addText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && action.annotation) {
                    // 再追加
                    if (!page.textAnnotations) page.textAnnotations = [];
                    page.textAnnotations.push({ ...action.annotation });
                    if (this.renderManager) {
                        this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                    } else {
                        this.updateMainView();
                    }
                }
                break;
            }

            case 'addHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && action.annotation) {
                    // 再追加
                    if (!page.highlightAnnotations) page.highlightAnnotations = [];
                    page.highlightAnnotations.push({ ...action.annotation });
                    // キャッシュ背景を使用
                    if (this.renderManager) {
                        this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                    } else {
                        this.updateMainView();
                    }
                }
                break;
            }

            case 'addImage':
            case 'duplicatePage': {
                // ページを復活 (挿入)
                if (action.page && action.index >= 0) {
                    this.state.pages = this.pdfService.insertPageAt(
                        this.state.pages,
                        action.page,
                        action.index
                    );
                    this.state.selectedPageIndex = action.index;
                    this.renderPageList();
                    this.updateMainView();
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
                        // キャッシュ背景を使用
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
            }

            case 'moveHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.x = action.toX;
                        ann.y = action.toY;
                        // キャッシュ背景を使用
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
            }

            case 'deleteText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.textAnnotations) {
                    const index = page.textAnnotations.findIndex(a => a.id === action.annotationId);
                    if (index !== -1) {
                        // Redo: 再度削除
                        page.textAnnotations.splice(index, 1);
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
            }

            case 'deleteHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const index = page.highlightAnnotations.findIndex(a => a.id === action.annotationId);
                    if (index !== -1) {
                        // Redo: 再度削除
                        page.highlightAnnotations.splice(index, 1);
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
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
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
            }

            case 'resizeHighlight': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && page.highlightAnnotations) {
                    const ann = page.highlightAnnotations.find(a => a.id === action.annotationId);
                    if (ann) {
                        ann.width = action.newWidth;
                        ann.height = action.newHeight;
                        if (this.renderManager) {
                            this.renderManager.redrawWithCachedBackground(this.selectedAnnotationId);
                        } else {
                            this.updateMainView();
                        }
                    }
                }
                break;
            }

            // バッチ操作のRedo
            case 'batchMove': {
                // 再度移動を実行
                this.pageManager.movePages(action.fromIndices, action.toIndex);
                // ただしpushUndoは不要なので、undoManagerから最後のアクションを削除
                this.undoManager.popUndo();
                return;
            }

            case 'batchRotate': {
                this.pageManager.rotatePages(action.pageIds.map(id => this.state.pages.findIndex(p => p.id === id)).filter(i => i !== -1));
                this.undoManager.popUndo();
                return;
            }

            case 'batchDuplicate': {
                // 再度複製を挿入（インデックス昇順で）
                // Undo可能にするため、IDは元のアクションのものを維持する
                const sorted = [...action.addedPages].sort((a, b) => a.index - b.index);
                for (const { page, index } of sorted) {
                    const newPage = JSON.parse(JSON.stringify(page)); // Deep copy to avoid reference issues
                    this.state.pages.splice(index, 0, newPage);
                }
                this.renderPageList();
                this.updateMainView();
                return;
            }

            case 'batchDelete': {
                // 再度削除（降順で）
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
                this.renderPageList();
                this.updateMainView();
                return;
            }
        }
    }

    public async savePDF(): Promise<void> {
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
                            rotate: degrees(annotation.rotation || 0),
                        });
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            this.downloadPDF(pdfBytes, 'edited.pdf');
            this.showToast('PDFを保存しました', 'success');
        } catch (error) {
            console.error('Save PDF error:', error);
            this.showToast('PDFの保存に失敗しました', 'error');
        }

        this.hideLoading();
    }

    public async exportCurrentPage(): Promise<void> {
        if (this.state.selectedPageIndex < 0 || this.state.pages.length === 0) return;

        this.showLoading('画像を生成中...');

        try {
            const page = this.state.pages[this.state.selectedPageIndex];
            const blob = await this.pdfService.exportPageAsImage(page);
            saveAs(blob, `page_${this.state.selectedPageIndex + 1
                }.png`);
            this.showToast('画像を保存しました', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('画像の保存に失敗しました', 'error');
        }

        this.hideLoading();
    }

    public async exportAllPages(): Promise<void> {
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

    public async splitAndDownload(): Promise<void> {
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
            this.showToast(`${chunkCount} 個のファイルに分割しました`, 'success');
        } catch (error) {
            console.error('Split error:', error);
            this.showToast('分割に失敗しました', 'error');
        }

        this.hideLoading();
    }

    private downloadPDF(pdfBytes: Uint8Array, fileName: string = 'edited.pdf'): void {
        const arrayBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    }

    public async saveAsPDF(): Promise<void> {
        if (this.state.pages.length === 0) return;

        const fileName = prompt('ファイル名を入力してください:', 'document.pdf');
        if (!fileName) return; // キャンセル

        // .pdf拡張子を確保
        const finalName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

        this.showLoading('PDFを生成中...');

        try {
            const pdfDoc = await PDFDocument.create();

            for (const page of this.state.pages) {
                let pdfPage;
                if (page.type === 'image') {
                    pdfPage = await this.imageService.embedImageToPdf(pdfDoc, page);
                    if (page.rotation && pdfPage) {
                        pdfPage.setRotation(degrees(page.rotation));
                    }
                } else if (page.pdfBytes && page.originalPageIndex !== undefined) {
                    const srcDoc = await PDFDocument.load(page.pdfBytes);
                    const [copiedPage] = await pdfDoc.copyPages(srcDoc, [
                        page.originalPageIndex,
                    ]);
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
            this.downloadPDF(pdfBytes, finalName);
            this.showToast(`「${finalName}」を保存しました`, 'success');
        } catch (error) {
            console.error('Save PDF error:', error);
            this.showToast('PDFの保存に失敗しました', 'error');
        }

        this.hideLoading();
    }



    public toggleTheme(): void {
        this.state.isDarkMode = !this.state.isDarkMode;
        document.documentElement.classList.toggle('dark', this.state.isDarkMode);
        this.toolbarManager.updateTheme(this.state.isDarkMode);
        localStorage.setItem('theme', this.state.isDarkMode ? 'dark' : 'light');
    }

    private loadThemePreference(): void {
        const saved = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.state.isDarkMode = saved === 'dark' || (!saved && prefersDark);
        document.documentElement.classList.toggle('dark', this.state.isDarkMode);
        this.toolbarManager.updateTheme(this.state.isDarkMode);
    }

    private showLoading(text: string): void {
        this.elements.loadingText.textContent = text;
        this.elements.loadingOverlay.style.display = 'flex';
    }

    private hideLoading(): void {
        this.elements.loadingOverlay.style.display = 'none';
    }

    private showToast(message: string, type: ToastType): void {
        // 成功メッセージは非表示（警告・エラー・情報のみ表示）
        if (type === 'success') return;

        const toast = document.createElement('div');
        toast.className = `toast ${type} `;
        toast.textContent = message;

        this.elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    // ズーム機能
    public zoomIn(): void {
        if (!this.renderManager) return;
        const current = this.renderManager.getZoom();
        this.renderManager.setZoom(current + 0.1);
        this.handleZoomChange();
    }

    public zoomOut(): void {
        if (!this.renderManager) return;
        const current = this.renderManager.getZoom();
        this.renderManager.setZoom(current - 0.1);
        this.handleZoomChange();
    }

    public resetZoom(): void {
        if (!this.renderManager) return;

        // ズームを100%にリセット
        this.renderManager.setZoom(1.0);
        this.handleZoomChange();
    }

    private handleZoomChange(): void {
        const zoom = this.renderManager.getZoom();
        this.elements.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;

        // ズーム変更時は全体を再描画（キャッシュ有効活用）
        // updateMainViewだとrenderPageが走る
        this.renderManager.clearCanvas(); // クリアしないとゴミが残る可能性？ renderPage内でクリアされる
        this.updateMainView();
    }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    const app = new PDFEditorApp();
    app.init();
});
