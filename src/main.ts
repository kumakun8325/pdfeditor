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
import { ICONS } from './ui/icons';
import type { AppState, PageData, ToastType, TextAnnotation, HighlightAnnotation, UndoAction, MenuItem } from './types';
import './styles/index.css';

// Worker設定はPDFService側で行われる

/**
 * PDF Editor メインアプリケーション
 */
class PDFEditorApp {
    private state: AppState = {
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

    // ドラッグ状態
    private draggingAnnotation: TextAnnotation | HighlightAnnotation | null = null;
    private dragOffset = { x: 0, y: 0 };
    private draggingStart: { x: number; y: number } | null = null;
    private selectedAnnotationId: string | null = null; // 選択された注釈ID
    private editingAnnotationId: string | null = null; // 編集中の注釈ID
    private clipboard: TextAnnotation | HighlightAnnotation | null = null; // コピー用
    private pageClipboard: PageData | null = null; // ページコピー用
    private readonly baseScale = 1.5;
    private currentZoom = 1.0;
    private get previewScale(): number {
        return this.baseScale * this.currentZoom;
    }
    // レンダリング状態管理
    private renderingRequestId = 0;
    private isRendering = false;
    private hasPendingRenderRequest = false;
    private backgroundCanvas: HTMLCanvasElement | null = null;
    private backgroundImageData: ImageData | null = null; // Deprecated but kept for type compat if needed
    // キャッシュ判定用
    private lastRenderedPageId: string | null = null;
    private lastRenderedScale: number = 0;
    private lastRenderedRotation: number = 0;

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

    private setupKeyboardShortcuts(): void {
        this.keyboardService.init();

        // Ctrl/Cmd + O: 開く
        this.addCrossOsShortcut('o', () => this.elements.fileInput.click());

        // Ctrl/Cmd + S: 保存
        this.addCrossOsShortcut('s', () => {
            if (this.state.pages.length > 0) this.savePDF();
        });

        // Ctrl/Cmd + D: ページ削除 (注釈選択中は注釈削除を優先したいが、ショートカットが競合する場合はDeleteキー推奨)
        // ここでは Ctrl+D はページ削除のままにする
        this.addCrossOsShortcut('d', () => this.deletePages());

        // Delete / Backspace: 注釈削除
        // deleteキーはOSごとに挙動が違うことがあるので注意
        this.keyboardService.addShortcut('delete', [], () => this.deleteSelectedAnnotation());
        this.keyboardService.addShortcut('backspace', [], () => this.deleteSelectedAnnotation());

        // 矢印キー: ページ選択
        this.keyboardService.addShortcut('arrowup', [], () => {
            this.selectPage(this.state.selectedPageIndex - 1);
        });
        this.keyboardService.addShortcut('arrowdown', [], () => {
            this.selectPage(this.state.selectedPageIndex + 1);
        });

        // Ctrl/Cmd + Z: 元に戻す
        this.addCrossOsShortcut('z', () => this.undo());

        // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: やり直し
        this.addCrossOsShortcut('y', () => this.redo());
        // Ctrl+Shift+Z (Windows) / Cmd+Shift+Z (Mac)
        this.keyboardService.addShortcut('z', ['ctrl', 'shift'], () => this.redo());
        this.keyboardService.addShortcut('z', ['meta', 'shift'], () => this.redo());

        // Ctrl/Cmd + C: コピー
        this.addCrossOsShortcut('c', () => this.handleCopy());

        // Ctrl/Cmd + V: 貼り付け
        this.addCrossOsShortcut('v', () => this.handlePaste());

        // Ctrl + +, Ctrl + -: ズーム
        this.keyboardService.addShortcut('=', ['ctrl'], () => this.zoomIn()); // + key
        this.keyboardService.addShortcut('-', ['ctrl'], () => this.zoomOut()); // - key
        this.keyboardService.addShortcut('0', ['ctrl'], () => this.resetZoom());
    }

    // ... (unchanged code) ...

    private deleteSelectedAnnotation(): void {
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
                if (this.backgroundImageData) {
                    this.redrawWithCachedBackground();
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
                if (this.backgroundImageData) {
                    this.redrawWithCachedBackground();
                } else {
                    this.updateMainView();
                }
                return;
            }
        }
    }

    private handleCopy(): void {
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

    private handlePaste(): void {
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
            if (this.backgroundImageData) {
                this.redrawWithCachedBackground();
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

    private selectPage(index: number, multiSelect: boolean = false, rangeSelect: boolean = false): void {
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

    // ハイライトモード
    private isHighlightMode = false;
    private highlightStart: { x: number; y: number } | null = null;
    private highlightColor = '#ffff00'; // 黄色

    // テキストリサイズ状態
    private isResizingText = false;
    private resizeStart: { y: number; fontSize: number; annotation: TextAnnotation } | null = null;

    // マネージャー
    private undoManager: UndoManager;





    // DOM Elements
    private elements!: {
        btnOpen: HTMLButtonElement;
        btnOpenHero: HTMLButtonElement; // 追加
        btnSave: HTMLButtonElement;
        btnSaveAs: HTMLButtonElement;
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
        btnUndo: HTMLButtonElement;
        btnRedo: HTMLButtonElement;
        zoomLevel: HTMLSpanElement;
    };



    /**
     * アプリケーション初期化
     */
    async init(): Promise<void> {
        this.cacheElements();
        this.bindEvents();
        // Undo/Redo
        this.elements.btnUndo.addEventListener('click', () => this.undo());
        this.elements.btnRedo.addEventListener('click', () => this.redo());

        // キーボードショートカット
        this.setupKeyboardShortcuts();
        this.loadThemePreference();

        // ドロップダウンメニュー初期化
        this.setupDropdownMenus();

        // コンテキストメニュー初期化
        this.setupContextMenu();

        this.showLoading('アプリケーションを起動中...');
        this.elements.emptyState.style.display = 'none'; // 初期化中は非表示

        // Canvasの読み取り頻度が高いことをヒントとして設定 (背景キャッシュ用)
        // this.elements.previewCanvas.getContext('2d', { willReadFrequently: true });
        // Phase 24.6: Offscreen Canvas (drawImage) を使うため、GPUアクセラレーションを有効にするには
        // willReadFrequently: true (CPU fallback) は逆効果の可能性があるため削除（または無効化）
        // 特にdrawImageのパフォーマンスへ悪影響がある。
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

    private setupDropdownMenus(): void {
        const fileMenuBtn = document.getElementById('btn-file-menu');
        const fileMenu = document.getElementById('file-menu');
        const exportMenuBtn = document.getElementById('btn-export-menu');
        const exportMenu = document.getElementById('export-menu');

        // ファイルメニュー
        fileMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            fileMenu?.classList.toggle('show');
            exportMenu?.classList.remove('show');
        });

        // エクスポートメニュー
        exportMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            exportMenu?.classList.toggle('show');
            fileMenu?.classList.remove('show');
        });

        // 外部クリックで閉じる
        document.addEventListener('click', () => {
            fileMenu?.classList.remove('show');
            exportMenu?.classList.remove('show');
        });

        // ドロップダウン内クリックでも閉じる（アイテム選択後）
        fileMenu?.addEventListener('click', () => {
            fileMenu?.classList.remove('show');
        });
        exportMenu?.addEventListener('click', () => {
            exportMenu?.classList.remove('show');
        });
    }

    private setupContextMenu(): void {
        // --- ページリスト（サイドバー） ---
        this.elements.pageList.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const target = (e.target as HTMLElement).closest('.page-thumbnail') as HTMLElement;
            if (!target) return;

            const index = parseInt(target.dataset.index || '-1', 10);
            if (index === -1) return;

            // 右クリック対象が選択に含まれているか確認
            const isTargetSelected = this.state.selectedPageIndices.includes(index);

            // ターゲットインデックス（未選択ページならそのページのみ、選択済みなら選択ページ全体）
            const targetIndices = isTargetSelected ? undefined : [index];

            // 視覚的フィードバック: 未選択ページの場合は一時的にハイライト
            if (!isTargetSelected) {
                target.classList.add('context-menu-target');
            }

            const onClose = () => {
                target.classList.remove('context-menu-target');
            };

            const isMultiSelect = isTargetSelected && this.state.selectedPageIndices.length > 1;
            const items: MenuItem[] = [];

            // 表示用カウント
            const count = targetIndices ? targetIndices.length : this.state.selectedPageIndices.length;

            // ページ操作メニュー
            items.push({
                label: count > 1 ? `${count}ページを削除` : '削除',
                icon: ICONS.TRASH,
                danger: true,
                action: () => this.deletePages(targetIndices)
            });

            items.push({ divider: true, label: '' });

            items.push({
                label: '右に回転 (90°)',
                icon: ICONS.ROTATE_RIGHT,
                action: () => this.rotatePages(targetIndices)
            });

            items.push({
                label: '複製',
                icon: ICONS.DUPLICATE,
                action: () => this.duplicatePages(targetIndices)
            });

            // 単一対象時のみ移動可能
            if (!isMultiSelect && count === 1) {
                items.push({ divider: true, label: '' });
                const actualIndex = targetIndices ? targetIndices[0] : index;

                items.push({
                    label: '上へ移動',
                    disabled: actualIndex === 0,
                    action: () => this.movePageUp(actualIndex)
                });
                items.push({
                    label: '下へ移動',
                    disabled: actualIndex === this.state.pages.length - 1,
                    action: () => this.movePageDown(actualIndex)
                });
            }

            this.contextMenuManager.show(e.clientX, e.clientY, items, onClose);
        });

        // --- メインビュー（注釈・ページ） ---
        this.elements.pagePreview.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            // 選択中の注釈がある場合
            if (this.selectedAnnotationId && this.state.pages[this.state.selectedPageIndex]) {
                const items: MenuItem[] = [];

                items.push({
                    label: '削除',
                    danger: true,
                    icon: ICONS.TRASH,
                    action: () => {
                        // Deleteキー押下イベントをシミュレート
                        const event = new KeyboardEvent('keydown', { key: 'Delete' });
                        document.dispatchEvent(event);
                    }
                });

                items.push({
                    label: 'コピー',
                    action: () => {
                        // Ctrl+Cイベントをシミュレート
                        const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, metaKey: true });
                        document.dispatchEvent(event);
                    }
                });

                this.contextMenuManager.show(e.clientX, e.clientY, items);
                return;
            }

            // 何もなければページ自体のメニューを表示
            const items: MenuItem[] = [
                {
                    label: 'ページを削除',
                    danger: true,
                    action: () => this.deletePages()
                },
                {
                    label: '右に回転',
                    action: () => this.rotatePages()
                }
            ];
            this.contextMenuManager.show(e.clientX, e.clientY, items);
        });
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

        // 名前を付けて保存
        this.elements.btnSaveAs.addEventListener('click', () => {
            this.saveAsPDF();
        });

        // 画像追加
        this.elements.btnAddImage.addEventListener('click', () => {
            this.elements.imageInput.click();
        });

        this.elements.imageInput.addEventListener('change', async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                for (const file of Array.from(files)) {
                    await this.insertImage(file);
                }
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
            this.rotatePages();
        });

        // ページ複製
        this.elements.btnDuplicate.addEventListener('click', () => {
            this.duplicatePages();
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
            this.deletePages();
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
        this.elements.previewCanvas.addEventListener('dblclick', (e) => this.onCanvasDoubleClick(e));

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



    private setupDropZone(): void {
        const dropZone = document.getElementById('drop-zone');
        if (!dropZone) return;

        this.dragDropManager.setupDropZone(dropZone, (files) => {
            this.handleFileDrop(files);
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

    private deletePages(targetIndices?: number[]): void {
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
        const newIndex = direction === 'up' ? index - 1 : index + 1;

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

    private movePageUp(index?: number): void {
        this.movePage('up', index);
    }

    private movePageDown(index?: number): void {
        this.movePage('down', index);
    }

    private rotatePages(targetIndices?: number[]): void {
        const indices = targetIndices || this.state.selectedPageIndices;
        if (indices.length === 0 || this.state.pages.length === 0) return;

        this.pageManager.rotatePages(indices);

        this.renderPageList();
        this.updateMainView();
        const msg = indices.length === 1 ? 'ページを90°回転しました' : `${indices.length}ページを回転しました`;
        this.showToast(msg, 'success');
    }

    private duplicatePages(targetIndices?: number[]): void {
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
        const currentRotation = page.rotation || 0;

        // キャッシュ有効確認 (Smart Cache Check)
        const canReuseCache = this.backgroundCanvas &&
            this.lastRenderedPageId === page.id &&
            Math.abs(this.lastRenderedScale - this.previewScale) < 0.001 &&
            this.lastRenderedRotation === currentRotation;

        if (canReuseCache) {
            this.redrawWithCachedBackground();
            this.isRendering = false;
            this.elements.emptyState.style.display = 'none';
            this.elements.pagePreview.style.display = 'flex';
            this.elements.pageNav.style.display = 'flex';
            this.updatePageNav();

            // 待機リクエストチェック
            if (this.hasPendingRenderRequest) {
                this.hasPendingRenderRequest = false; // キャッシュヒットしたらリクエスト消化扱い
            }
            return;
        }

        try {
            await this.pdfService.renderToCanvas(
                this.elements.previewCanvas,
                page,
                this.previewScale
            );

            // キャッシュ状態更新
            this.lastRenderedPageId = page.id;
            this.lastRenderedScale = this.previewScale;
            this.lastRenderedRotation = currentRotation;

            // 背景をキャッシュ
            // 背景をキャッシュ (Offscreen Canvas)
            if (!this.backgroundCanvas) {
                this.backgroundCanvas = document.createElement('canvas');
            }
            this.backgroundCanvas.width = this.elements.previewCanvas.width;
            this.backgroundCanvas.height = this.elements.previewCanvas.height;
            const bgCtx = this.backgroundCanvas.getContext('2d')!;
            bgCtx.drawImage(this.elements.previewCanvas, 0, 0);

            // Deprecated: ImageData is slow
            this.backgroundImageData = null;
            // We set it to null but keep the property for compatibility if I missed any check.
            // Actually, I should use backgroundCanvas flag.
            // But let's set backgroundImageData to a dummy or update checks.
            // Better: update checks to use backgroundCanvas.
            // I'll update redrawWithCachedBackground below.

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

        const ctx = this.elements.previewCanvas.getContext('2d', { willReadFrequently: true })!;
        AnnotationManager.drawAnnotations(ctx, page, this.previewScale, this.selectedAnnotationId);
    }

    private redrawWithCachedBackground(): void {
        if (!this.backgroundCanvas) return;

        const ctx = this.elements.previewCanvas.getContext('2d')!;
        ctx.clearRect(0, 0, this.elements.previewCanvas.width, this.elements.previewCanvas.height);
        ctx.drawImage(this.backgroundCanvas, 0, 0);
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
        this.elements.btnSaveAs.disabled = !hasPages;
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

        // Undo/Redoボタンの状態更新
        this.elements.btnUndo.disabled = !this.undoManager.canUndo();
        this.elements.btnRedo.disabled = !this.undoManager.canRedo();

        this.elements.pageCount.textContent = hasPages
            ? `${this.state.pages.length}ページ`
            : '';
    }

    private clearPages(): void {
        if (!confirm('すべてのページを削除しますか？\nこの操作は元に戻せます。')) return;

        this.pageManager.clearPages();
        this.storageService.clearState().catch(e => console.warn('Clear state failed:', e));

        this.renderPageList();
        this.elements.emptyState.style.display = 'flex';
        this.elements.pagePreview.style.display = 'none';
        this.elements.pageNav.style.display = 'none';
        this.updateUI();
        this.showToast('ページをクリアしました', 'success');
    }

    private openTextModal(annotation?: TextAnnotation): void {
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

    private closeTextModal(): void {
        this.elements.textModal.style.display = 'none';
        this.editingAnnotationId = null;
    }

    private addTextAnnotation(): void {
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
        if (this.backgroundImageData) {
            this.redrawWithCachedBackground();
        } else {
            this.updateMainView();
        }
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

        // ハイライトモードの場合は開始位置を記録 (選択より優先)
        // ただし右クリック(button===2)の場合はコンテキストメニューを出したいのでスキップ
        if (this.isHighlightMode && e.button !== 2) {
            this.highlightStart = { x: pdfX, y: pdfY };
            // 選択解除
            this.selectedAnnotationId = null;
            if (this.backgroundImageData) this.redrawWithCachedBackground();
            e.preventDefault();
            return;
        }

        // 0. リサイズハンドルの判定 (選択中のみ)
        if (this.selectedAnnotationId) {
            const ctx = this.elements.previewCanvas.getContext('2d')!;
            const hitHandle = AnnotationManager.hitTestTextHandle(
                ctx,
                page,
                pdfX,
                pdfY,
                this.previewScale,
                this.selectedAnnotationId
            );

            if (hitHandle) {
                this.isResizingText = true;
                this.resizeStart = {
                    y: e.clientY,
                    fontSize: hitHandle.fontSize,
                    annotation: hitHandle
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
            this.redrawWithCachedBackground();
            e.preventDefault();
            return;
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
            this.redrawWithCachedBackground();
            e.preventDefault();
            return;
        }

        // ヒットしない場合は選択解除
        if (this.selectedAnnotationId) {
            this.selectedAnnotationId = null;
            this.redrawWithCachedBackground();
        }
    }

    private isDraggingRenderPending = false;

    private onCanvasMouseMove(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        // ドラッグ中またはハイライトモード中のドラッグ判断（同期処理）
        const isHighlightDragging = this.isHighlightMode && !!this.highlightStart;
        const isAnnotationDragging = !!this.draggingAnnotation;
        // リサイズ中
        if (this.isResizingText) {
            e.preventDefault();
            // リサイズ処理は直接handleCanvasMouseMoveで行うか、ここで行うか。
            // requestAnimationFrameを使う既存ロジックに乗せる。
        } else if (isHighlightDragging || isAnnotationDragging) {
            e.preventDefault();
        } else {
            // ドラッグ中でなければカーソル更新チェック (Hover)
            // ここでヒットテストを行うと重いかもしれないが、UX向上のため検討
            // いったんスキップ
            return;
        }

        if (this.isDraggingRenderPending) return;

        this.isDraggingRenderPending = true;
        requestAnimationFrame(() => {
            // ページが切り替わっている等の場合は中止
            if (!this.state.pages[this.state.selectedPageIndex]) {
                this.isDraggingRenderPending = false;
                return;
            }
            this.handleCanvasMouseMove(e, page);
            this.isDraggingRenderPending = false;
        });
    }

    private handleCanvasMouseMove(e: MouseEvent, page: PageData): void {
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
            return;
        }

        // 注釈ドラッグ
        if (this.draggingAnnotation) {
            // Canvas座標をPDF座標に変換
            const point = AnnotationManager.toPdfPoint(canvasX, canvasY, this.previewScale, page.height);
            const pdfX = point.x;
            const pdfY = point.y;

            // 位置を更新
            this.draggingAnnotation.x = pdfX - this.dragOffset.x;
            this.draggingAnnotation.y = pdfY - this.dragOffset.y;

            // キャッシュ背景を使って再描画
            this.redrawWithCachedBackground();
            return; // 終了
        }

        // テキストリサイズ
        if (this.isResizingText && this.resizeStart) {
            const dy = e.clientY - this.resizeStart.y;
            // マウス移動量(px)をフォントサイズに加算
            // ズームレベル(scale)を考慮するか？
            // e.clientYは画面座標系。フォントサイズも画面上の見た目サイズ変化に対応させたいが、
            // 保存されるfontSizeは「PDF空間でのフォントサイズ」ではなく「論理フォントサイズ」(描画時にscale倍される)。
            // したがって、画面上の移動pxをscaleで割る必要はない？
            // いえ、fontSize * scale で描画されるので、画面上で 10px 動かしたら fontSize も 10/scale 増減すべき。

            // 例: scale=2.0, fontSize=16 (drawing size 32). Drag +20px -> drawing size 52 -> fontSize 26 (+10).
            // deltaFontSize = dy / this.previewScale;

            // 直感的には、ドラッグした距離分だけボックスが大きくなる感じ。
            const delta = dy / this.previewScale;
            let newSize = this.resizeStart.fontSize + delta;

            // 制限
            newSize = Math.max(8, Math.min(newSize, 300));

            this.resizeStart.annotation.fontSize = newSize;
            this.redrawWithCachedBackground();
        }
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
                    // 追加後に選択状態にする
                    this.selectedAnnotationId = highlight.id;
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

        // 注釈ドラッグ終了
        if (this.draggingAnnotation) {
            this.commitAnnotationDrag();
            this.draggingAnnotation = null;
            this.draggingStart = null;
            this.elements.previewCanvas.style.cursor = 'default';
        }
        // リサイズ終了
        if (this.isResizingText && this.resizeStart) {
            const ann = this.resizeStart.annotation;
            if (Math.abs(ann.fontSize - this.resizeStart.fontSize) > 0.5) {
                this.pushUndo({
                    type: 'updateText',
                    pageId: page.id,
                    annotationId: ann.id,
                    oldText: ann.text,
                    newText: ann.text,
                    oldColor: ann.color,
                    newColor: ann.color,
                    oldFontSize: this.resizeStart.fontSize,
                    newFontSize: ann.fontSize
                });
            }
            this.isResizingText = false;
            this.resizeStart = null;
            this.elements.previewCanvas.style.cursor = 'default';
        }
    }


    private onCanvasMouseLeave(): void {
        this.highlightStart = null;
        if (this.draggingAnnotation) {
            this.commitAnnotationDrag();
            this.draggingAnnotation = null;
            this.draggingStart = null;
            this.elements.previewCanvas.style.cursor = 'default';
        }
        if (this.isHighlightMode && this.backgroundImageData) {
            this.redrawWithCachedBackground();
        }
    }

    private onCanvasDoubleClick(e: MouseEvent): void {
        const page = this.state.pages[this.state.selectedPageIndex];
        if (!page) return;

        const canvas = this.elements.previewCanvas;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;

        const point = AnnotationManager.toPdfPoint(canvasX, canvasY, this.previewScale, page.height);
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
        this.updateUI();
        this.scheduleAutoSave();
    }

    /**
     * Undo実行
     */
    private undo(): void {
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
                    this.updateMainView();
                    // サムネイル更新はコストが高いので省略または非同期で行うなどが考えられるが
                    // ここでは一旦そのまま
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
                        if (this.backgroundImageData) {
                            this.redrawWithCachedBackground();
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
                        if (this.backgroundImageData) {
                            this.redrawWithCachedBackground();
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
                        if (this.backgroundImageData) {
                            this.redrawWithCachedBackground();
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
                        if (this.backgroundImageData) {
                            this.redrawWithCachedBackground();
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
                    if (this.backgroundImageData) {
                        this.redrawWithCachedBackground();
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
                    if (this.backgroundImageData) {
                        this.redrawWithCachedBackground();
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
                        if (this.backgroundImageData) {
                            this.redrawWithCachedBackground();
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
                break;
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

    /**
     * Redo実行
     */
    private redo(): void {
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
                break;

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
                break;

            case 'rotatePage': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && action.newRotation !== undefined) {
                    page.rotation = action.newRotation;
                    this.updateMainView();
                }
                break;
            }

            case 'clear':
                // ClearのRedo: 現在のページを空にする
                this.state.pages = [];
                this.state.selectedPageIndex = -1;
                this.renderPageList();
                this.updateMainView();
                break;

            case 'addText': {
                const page = this.state.pages.find(p => p.id === action.pageId);
                if (page && action.annotation) {
                    // 再追加
                    if (!page.textAnnotations) page.textAnnotations = [];
                    page.textAnnotations.push({ ...action.annotation });
                    if (this.backgroundImageData) {
                        this.redrawWithCachedBackground();
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
                    if (this.backgroundImageData) {
                        this.redrawWithCachedBackground();
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
                        if (this.backgroundImageData) {
                            this.redrawWithCachedBackground();
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
                        if (this.backgroundImageData) {
                            this.redrawWithCachedBackground();
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
                        if (this.backgroundImageData) {
                            this.redrawWithCachedBackground();
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
                        if (this.backgroundImageData) {
                            this.redrawWithCachedBackground();
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
                        if (this.backgroundImageData) {
                            this.redrawWithCachedBackground();
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
                break;
            }

            case 'batchRotate': {
                this.pageManager.rotatePages(action.pageIds.map(id => this.state.pages.findIndex(p => p.id === id)).filter(i => i !== -1));
                this.undoManager.popUndo();
                break;
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
                break;
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
                break;
            }
        }
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
            this.downloadPDF(pdfBytes, 'edited.pdf');
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
            saveAs(blob, `page_${this.state.selectedPageIndex + 1
                }.png`);
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

    private async saveAsPDF(): Promise<void> {
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
    private setZoom(zoom: number): void {
        // 50% ~ 200% の範囲に制限
        const newZoom = Math.max(0.5, Math.min(2.0, zoom));
        if (this.currentZoom !== newZoom) {
            this.currentZoom = newZoom;
            this.elements.zoomLevel.textContent = `${Math.round(this.currentZoom * 100)}% `;

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
