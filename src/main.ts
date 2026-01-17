import { PDFService } from './services/PDFService';
import { ImageService } from './services/ImageService';
import { KeyboardService } from './services/KeyboardService';
import { UndoManager } from './managers/UndoManager';
import { PageManager } from './managers/PageManager';
import { SelectionManager } from './managers/SelectionManager';
import { DragDropManager } from './managers/DragDropManager';
import { StorageService } from './services/StorageService';
import { ContextMenuManager } from './managers/ContextMenuManager';
import { EventManager } from './managers/EventManager';
import { ToolbarManager } from './managers/ToolbarManager';
import { RenderManager } from './managers/RenderManager';
import { HelpManager } from './managers/HelpManager';
import { UndoExecutionManager } from './managers/UndoExecutionManager';
import { ExportManager } from './managers/ExportManager';
import { ClipboardManager } from './managers/ClipboardManager';
import { FileOperationManager } from './managers/FileOperationManager';
import { CanvasInteractionManager } from './managers/CanvasInteractionManager';
import type { AppState, PageData, ToastType, TextAnnotation, UndoAction, UIElements, AppAction, ShapeType } from './types';
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
        exportOptions: {
            colorSpace: 'rgb', // デフォルトはRGB
        },
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

    // 注釈選択・編集状態
    private selectedAnnotationId: string | null = null; // 選択された注釈ID
    private editingAnnotationId: string | null = null; // 編集中の注釈ID

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

        // シェイプから検索
        if (page.shapeAnnotations) {
            const index = page.shapeAnnotations.findIndex(a => a.id === this.selectedAnnotationId);
            if (index !== -1) {
                const annotation = page.shapeAnnotations[index];
                this.pushUndo({ type: 'deleteShape', pageId: page.id, annotationId: annotation.id, annotation });
                page.shapeAnnotations.splice(index, 1);
                this.selectedAnnotationId = null;
                this.showToast('図形を削除しました', 'success');
                if (this.renderManager) {
                    this.renderManager.redrawWithCachedBackground(null);
                } else {
                    this.updateMainView();
                }
                return;
            }
        }
    }

    /**
     * コピー処理 (ClipboardManagerに委譲)
     */
    public handleCopy(): void {
        this.clipboardManager.handleCopy();
    }

    /**
     * ペースト処理 (ClipboardManagerに委譲)
     */
    public handlePaste(): void {
        this.clipboardManager.handlePaste();
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

    // マネージャー
    private undoManager: UndoManager;
    private undoExecutionManager!: UndoExecutionManager;
    private exportManager!: ExportManager;
    private clipboardManager!: ClipboardManager;
    private fileOperationManager!: FileOperationManager;
    private canvasInteractionManager!: CanvasInteractionManager;





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

        // UndoExecutionManager初期化
        this.undoExecutionManager = new UndoExecutionManager(
            () => this.state,
            this.undoManager,
            this.pdfService,
            () => this.renderManager,
            () => this.pageManager,
            {
                showToast: (msg, type) => this.showToast(msg, type),
                renderPageList: () => this.renderPageList(),
                updateMainView: () => this.updateMainView(),
                updateUI: () => this.updateUI(),
                getSelectedAnnotationId: () => this.selectedAnnotationId
            }
        );

        // ExportManager初期化
        this.exportManager = new ExportManager(
            () => this.state,
            this.pdfService,
            this.imageService,
            {
                showLoading: (text) => this.showLoading(text),
                hideLoading: () => this.hideLoading(),
                showToast: (msg, type) => this.showToast(msg, type)
            }
        );

        // ClipboardManager初期化
        this.clipboardManager = new ClipboardManager(
            () => this.state,
            this.pdfService,
            () => this.renderManager,
            {
                showToast: (msg, type) => this.showToast(msg, type),
                pushUndo: (action) => this.pushUndo(action),
                renderPageList: () => this.renderPageList(),
                updateMainView: () => this.updateMainView(),
                updatePageNav: () => this.updatePageNav(),
                updateUI: () => this.updateUI(),
                getSelectedAnnotationId: () => this.selectedAnnotationId,
                setSelectedAnnotationId: (id) => { this.selectedAnnotationId = id; }
            }
        );

        // FileOperationManager初期化
        this.fileOperationManager = new FileOperationManager(
            () => this.state,
            this.pdfService,
            this.imageService,
            {
                showLoading: (text) => this.showLoading(text),
                hideLoading: () => this.hideLoading(),
                showToast: (msg, type) => this.showToast(msg, type),
                renderPageList: () => this.renderPageList(),
                updateMainView: () => this.updateMainView(),
                updateUI: () => this.updateUI(),
                scheduleAutoSave: () => this.scheduleAutoSave(),
                pushUndo: (action) => this.pushUndo(action)
            }
        );

        // CanvasInteractionManager初期化
        this.canvasInteractionManager = new CanvasInteractionManager(
            () => this.state,
            this.elements,
            () => this.renderManager,
            () => this.previewScale,
            () => this.backgroundImageData,
            {
                showToast: (msg, type) => this.showToast(msg, type),
                pushUndo: (action) => this.pushUndo(action),
                updateMainView: () => this.updateMainView(),
                openTextModal: (annotation) => this.openTextModal(annotation),
                getSelectedAnnotationId: () => this.selectedAnnotationId,
                setSelectedAnnotationId: (id) => { this.selectedAnnotationId = id; }
            }
        );

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

        // PDF追加用の hidden input を動的に追加
        let pdfAddInput = document.getElementById('pdf-add-input') as HTMLInputElement;
        if (!pdfAddInput) {
            pdfAddInput = document.createElement('input');
            pdfAddInput.type = 'file';
            pdfAddInput.id = 'pdf-add-input';
            pdfAddInput.accept = '.pdf';
            pdfAddInput.multiple = true;
            pdfAddInput.style.display = 'none';
            document.body.appendChild(pdfAddInput);
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
            btnAddPdf: document.getElementById('btn-add-pdf') as HTMLButtonElement,
            pdfAddInput: pdfAddInput,
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
            // 図形
            btnShapes: document.getElementById('btn-shapes') as HTMLButtonElement,
            shapeMenu: document.getElementById('shape-menu') as HTMLDivElement,
            btnShapeLine: document.getElementById('btn-shape-line') as HTMLButtonElement,
            btnShapeArrow: document.getElementById('btn-shape-arrow') as HTMLButtonElement,
            btnShapeRect: document.getElementById('btn-shape-rect') as HTMLButtonElement,
            btnShapeEllipse: document.getElementById('btn-shape-ellipse') as HTMLButtonElement,
            btnShapeFreehand: document.getElementById('btn-shape-freehand') as HTMLButtonElement,
            shapeStrokeWidth: document.getElementById('shape-stroke-width') as HTMLSelectElement,
            shapeStrokeColor: document.getElementById('shape-stroke-color') as HTMLInputElement,
            shapeFillColor: document.getElementById('shape-fill-color') as HTMLInputElement,
            shapeFillEnabled: document.getElementById('shape-fill-enabled') as HTMLInputElement,
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
            // Mobile
            btnMobileMenu: document.getElementById('btn-mobile-menu') as HTMLButtonElement,
            sidebar: document.getElementById('sidebar') as HTMLElement,
            sidebarOverlay: document.getElementById('sidebar-overlay') as HTMLDivElement,
            // CMYK
            cmykModeToggle: document.getElementById('cmyk-mode-toggle') as HTMLInputElement,
        };
    }









    /**
     * ファイルドロップ処理 (FileOperationManagerに委譲)
     */
    public async handleFileDrop(files: FileList): Promise<void> {
        return this.fileOperationManager.handleFileDrop(files);
    }

    /**
     * PDF読み込み (FileOperationManagerに委譲)
     */
    public async loadPDF(file: File): Promise<void> {
        return this.fileOperationManager.loadPDF(file);
    }

    /**
     * PDF追加 (FileOperationManagerに委譲)
     */
    public async addPDF(file: File): Promise<void> {
        return this.fileOperationManager.addPDF(file);
    }

    /**
     * 画像挿入 (FileOperationManagerに委譲)
     */
    public async insertImage(file: File): Promise<void> {
        return this.fileOperationManager.insertImage(file);
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





    /**
     * Canvas マウスダウン (CanvasInteractionManagerに委譲)
     */
    public onCanvasMouseDown(e: MouseEvent): void {
        this.canvasInteractionManager.onCanvasMouseDown(e);
    }

    /**
     * Canvas マウス移動 (CanvasInteractionManagerに委譲)
     */
    public onCanvasMouseMove(e: MouseEvent): void {
        this.canvasInteractionManager.onCanvasMouseMove(e);
    }

    /**
     * Canvas マウスアップ (CanvasInteractionManagerに委譲)
     */
    public onCanvasMouseUp(e: MouseEvent): void {
        this.canvasInteractionManager.onCanvasMouseUp(e);
    }

    /**
     * Canvas マウス離脱 (CanvasInteractionManagerに委譲)
     */
    public onCanvasMouseLeave(): void {
        this.canvasInteractionManager.onCanvasMouseLeave();
    }

    /**
     * Canvas ダブルクリック (CanvasInteractionManagerに委譲)
     */
    public onCanvasDoubleClick(e: MouseEvent): void {
        this.canvasInteractionManager.onCanvasDoubleClick(e);
    }

    /**
     * マーカーモード切替 (CanvasInteractionManagerに委譲)
     */
    public toggleHighlightMode(): void {
        this.canvasInteractionManager.toggleHighlightMode();
    }

    /**
     * マーカーモード解除 (CanvasInteractionManagerに委譲)
     */
    private disableHighlightMode(): void {
        this.canvasInteractionManager.disableHighlightMode();
    }

    /**
     * シェイプモード設定 (CanvasInteractionManagerに委譲)
     */
    public setShapeMode(type: ShapeType | null): void {
        this.canvasInteractionManager.setShapeMode(type);
    }

    /**
     * シェイプモード取得 (CanvasInteractionManagerに委譲)
     */
    public getShapeDrawingMode(): ShapeType | null {
        return this.canvasInteractionManager.getShapeDrawingMode();
    }

    /**
     * シェイプオプション設定 (CanvasInteractionManagerに委譲)
     */
    public setShapeOptions(strokeColor: string, strokeWidth: number, fillColor: string): void {
        this.canvasInteractionManager.setShapeOptions(strokeColor, strokeWidth, fillColor);
    }

    private pushUndo(action: UndoAction): void {
        this.undoManager.push(action);
        this.updateUI();
        this.scheduleAutoSave();
    }

    /**
     * Undo実行 (UndoExecutionManagerに委譲)
     */
    public undo(): void {
        this.undoExecutionManager.undo();
    }

    /**
     * Redo実行 (UndoExecutionManagerに委譲)
     */
    public redo(): void {
        this.undoExecutionManager.redo();
    }

    /**
     * PDF保存 (ExportManagerに委譲)
     */
    public async savePDF(): Promise<void> {
        return this.exportManager.savePDF();
    }

    /**
     * 現在のページを画像としてエクスポート (ExportManagerに委譲)
     */
    public async exportCurrentPage(): Promise<void> {
        return this.exportManager.exportCurrentPage();
    }

    /**
     * 全ページをZIPでエクスポート (ExportManagerに委譲)
     */
    public async exportAllPages(): Promise<void> {
        return this.exportManager.exportAllPages();
    }

    /**
     * PDFを分割してダウンロード (ExportManagerに委譲)
     */
    public async splitAndDownload(): Promise<void> {
        return this.exportManager.splitAndDownload();
    }

    /**
     * 名前を付けて保存 (ExportManagerに委譲)
     */
    public async saveAsPDF(): Promise<void> {
        return this.exportManager.saveAsPDF();
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

    // Mobile sidebar operations
    public toggleSidebar(): void {
        const { sidebar, sidebarOverlay } = this.elements;
        const isOpen = sidebar.classList.contains('open');

        if (isOpen) {
            this.closeSidebar();
        } else {
            sidebar.classList.add('open');
            sidebarOverlay.classList.add('visible');
            document.body.classList.add('touch-active');
        }
    }

    public closeSidebar(): void {
        const { sidebar, sidebarOverlay } = this.elements;
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('visible');
        document.body.classList.remove('touch-active');
    }

    // Pinch zoom handler
    public handlePinchZoom(scale: number, _centerX: number, _centerY: number): void {
        if (!this.renderManager) return;

        const current = this.renderManager.getZoom();
        const newZoom = Math.max(0.25, Math.min(5.0, current * scale));

        this.renderManager.setZoom(newZoom);
        this.handleZoomChange();
    }
}

// アプリケーション起動
document.addEventListener('DOMContentLoaded', () => {
    const app = new PDFEditorApp();
    app.init();
});
