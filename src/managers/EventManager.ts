import { AppAction, UIElements, MenuItem } from '../types';
import { DragDropManager } from './DragDropManager';
import { ContextMenuManager } from './ContextMenuManager';
import { KeyboardService } from '../services/KeyboardService';
import { ICONS } from '../ui/icons';

export class EventManager {
    constructor(
        private app: AppAction,
        private elements: UIElements,
        private dragDropManager: DragDropManager,
        private contextMenuManager: ContextMenuManager,
        private keyboardService: KeyboardService
    ) { }

    public bindEvents(): void {
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
                await this.app.loadPDF(file);
            }
        });

        // 保存
        this.elements.btnSave.addEventListener('click', () => {
            this.app.savePDF();
        });

        // 名前を付けて保存
        this.elements.btnSaveAs.addEventListener('click', () => {
            this.app.saveAsPDF();
        });

        // 画像追加
        this.elements.btnAddImage.addEventListener('click', () => {
            this.elements.imageInput.click();
        });

        this.elements.imageInput.addEventListener('change', async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                for (const file of Array.from(files)) {
                    await this.app.insertImage(file);
                }
            }
            // リセット（同じファイルを再選択可能に）
            (e.target as HTMLInputElement).value = '';
        });

        // PDF追加（結合用）
        this.elements.btnAddPdf.addEventListener('click', () => {
            this.elements.pdfAddInput.click();
        });

        this.elements.pdfAddInput.addEventListener('change', async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                for (const file of Array.from(files)) {
                    await this.app.addPDF(file);
                }
            }
            // リセット（同じファイルを再選択可能に）
            (e.target as HTMLInputElement).value = '';
        });

        // ページ移動
        this.elements.btnMoveUp.addEventListener('click', () => {
            this.app.movePageUp();
        });

        this.elements.btnMoveDown.addEventListener('click', () => {
            this.app.movePageDown();
        });

        // ページ回転
        this.elements.btnRotate.addEventListener('click', () => {
            this.app.rotatePages();
        });

        // ページ複製
        this.elements.btnDuplicate.addEventListener('click', () => {
            this.app.duplicatePages();
        });

        // 画像保存
        this.elements.btnExportPng.addEventListener('click', () => {
            this.app.exportCurrentPage();
        });

        // 全保存
        this.elements.btnExportAll.addEventListener('click', () => {
            this.app.exportAllPages();
        });

        // バイナリ分割
        this.elements.btnSplit.addEventListener('click', () => {
            this.app.splitAndDownload();
        });

        // クリア
        this.elements.btnClear.addEventListener('click', () => {
            this.app.clearPages();
        });

        // ページ削除（ボタン）
        this.elements.btnDelete.addEventListener('click', () => {
            this.app.deletePages();
        });

        // テーマ切り替え
        this.elements.btnTheme.addEventListener('click', () => {
            this.app.toggleTheme();
        });

        // テキスト追加
        this.elements.btnAddText.addEventListener('click', () => {
            this.app.openTextModal();
        });

        // テキストモーダルイベント
        this.elements.textModalClose.addEventListener('click', () => {
            this.app.closeTextModal();
        });
        this.elements.textModalCancel.addEventListener('click', () => {
            this.app.closeTextModal();
        });
        this.elements.textModalOk.addEventListener('click', () => {
            this.app.addTextAnnotation();
        });

        // ドラッグ＆ドロップ
        this.setupDropZone();

        // ページナビゲーション
        this.elements.btnPrev.addEventListener('click', () => {
            this.app.selectPage(this.app.state.selectedPageIndex - 1);
        });

        this.elements.btnNext.addEventListener('click', () => {
            this.app.selectPage(this.app.state.selectedPageIndex + 1);
        });

        // テキスト注釈のドラッグ / ハイライト描画
        this.elements.previewCanvas.addEventListener('mousedown', (e) => this.app.onCanvasMouseDown(e));
        this.elements.previewCanvas.addEventListener('mousemove', (e) => this.app.onCanvasMouseMove(e));
        this.elements.previewCanvas.addEventListener('mouseup', (e) => this.app.onCanvasMouseUp(e));
        this.elements.previewCanvas.addEventListener('mouseleave', () => this.app.onCanvasMouseLeave());
        this.elements.previewCanvas.addEventListener('dblclick', (e) => this.app.onCanvasDoubleClick(e));

        // ハイライトモードトグル
        this.elements.btnHighlight.addEventListener('click', () => {
            this.app.toggleHighlightMode();
        });

        // ズーム操作
        this.elements.btnZoomIn.addEventListener('click', () => this.app.zoomIn());
        this.elements.btnZoomOut.addEventListener('click', () => this.app.zoomOut());
        this.elements.btnZoomReset.addEventListener('click', () => this.app.resetZoom());

        // Ctrl + ホイールでズーム
        window.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    this.app.zoomIn();
                } else {
                    this.app.zoomOut();
                }
            }
        }, { passive: false });

        // Undo/Redo
        this.elements.btnUndo.addEventListener('click', () => this.app.undo());
        this.elements.btnRedo.addEventListener('click', () => this.app.redo());

        // Keyboard & Dropdown & ContextMenu
        this.setupKeyboardShortcuts();

        this.setupContextMenu();

        // Canvas & Shortcuts
        this.bindShortcuts();
        this.setupCanvasEvents();

        // Mobile sidebar
        this.setupMobileSidebar();
    }

    // Swipe state for sidebar
    private swipeState = {
        startX: 0,
        startY: 0,
        isSwipeGesture: false,
        isSidebarSwipe: false
    };

    private setupMobileSidebar(): void {
        const { btnMobileMenu, sidebarOverlay, sidebar } = this.elements;

        // Mobile menu button
        if (btnMobileMenu) {
            btnMobileMenu.addEventListener('click', () => {
                this.app.toggleSidebar();
            });
        }

        // Sidebar overlay click to close
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                this.app.closeSidebar();
            });
        }

        // Close sidebar when page is selected on mobile
        const pageList = this.elements.pageList;
        if (pageList) {
            pageList.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('.page-thumbnail')) {
                    // On mobile, close sidebar after selection
                    if (window.innerWidth < 768) {
                        setTimeout(() => this.app.closeSidebar(), 150);
                    }
                }
            });
        }

        // Swipe gestures for sidebar (mobile only)
        this.setupSidebarSwipe(sidebar);
    }

    private setupSidebarSwipe(sidebar: HTMLElement): void {
        // Swipe from left edge to open sidebar
        document.addEventListener('touchstart', (e) => {
            if (window.innerWidth >= 768) return; // Desktop: ignore

            const touch = e.touches[0];
            this.swipeState.startX = touch.clientX;
            this.swipeState.startY = touch.clientY;
            this.swipeState.isSwipeGesture = false;
            this.swipeState.isSidebarSwipe = false;

            // Check if swipe started from left edge (for opening)
            const isLeftEdge = touch.clientX < 30;
            // Check if sidebar is open (for closing by swiping left)
            const isSidebarOpen = sidebar.classList.contains('open');

            if (isLeftEdge || isSidebarOpen) {
                this.swipeState.isSidebarSwipe = true;
            }
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!this.swipeState.isSidebarSwipe || window.innerWidth >= 768) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - this.swipeState.startX;
            const deltaY = touch.clientY - this.swipeState.startY;

            // Determine if this is a horizontal swipe
            if (!this.swipeState.isSwipeGesture && Math.abs(deltaX) > 10) {
                // If horizontal movement is greater than vertical, it's a swipe
                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    this.swipeState.isSwipeGesture = true;
                } else {
                    this.swipeState.isSidebarSwipe = false;
                }
            }
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            if (!this.swipeState.isSidebarSwipe || !this.swipeState.isSwipeGesture) {
                this.swipeState.isSidebarSwipe = false;
                return;
            }
            if (window.innerWidth >= 768) return;

            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - this.swipeState.startX;
            const isSidebarOpen = sidebar.classList.contains('open');

            // Swipe right to open (if started from left edge)
            if (deltaX > 50 && !isSidebarOpen) {
                this.app.toggleSidebar();
            }
            // Swipe left to close (if sidebar is open)
            else if (deltaX < -50 && isSidebarOpen) {
                this.app.closeSidebar();
            }

            this.swipeState.isSidebarSwipe = false;
            this.swipeState.isSwipeGesture = false;
        }, { passive: true });
    }

    private setupDropZone(): void {
        const { dropZone, mainView } = this.elements;

        // サイドバーのドロップゾーン
        if (dropZone) {
            this.dragDropManager.setupDropZone(dropZone, (files) => {
                this.app.handleFileDrop(files);
            });
        }

        // メインビュー（プレビューエリア）
        if (mainView) {
            this.dragDropManager.setupDropZone(mainView, (files) => {
                this.app.handleFileDrop(files);
            });
        }
    }

    private setupKeyboardShortcuts(): void {
        this.keyboardService.init();

        // Ctrl/Cmd + O: 開く
        this.addCrossOsShortcut('o', () => this.elements.fileInput.click());

        // Ctrl/Cmd + S: 保存
        this.addCrossOsShortcut('s', () => {
            if (this.app.state.pages.length > 0) this.app.savePDF();
        });

        // Ctrl/Cmd + D: ページ削除
        this.addCrossOsShortcut('d', () => this.app.deletePages());

        // Ctrl/Cmd + Z: Undo
        this.addCrossOsShortcut('z', () => this.app.undo());

        // Ctrl/Cmd + Y / Ctrl+Shift+Z: Redo
        this.addCrossOsShortcut('y', () => this.app.redo());
        this.keyboardService.addShortcut('z', ['ctrl', 'shift'], () => this.app.redo());
        this.keyboardService.addShortcut('z', ['meta', 'shift'], () => this.app.redo());

        // Ctrl/Cmd + C: コピー
        this.addCrossOsShortcut('c', () => this.app.handleCopy());

        // Ctrl/Cmd + V: 貼り付け
        this.addCrossOsShortcut('v', () => this.app.handlePaste());

        // Ctrl/Cmd + A: 全選択
        this.addCrossOsShortcut('a', () => this.app.selectAllPages());

        // Delete / Backspace: 注釈削除
        // deleteキーはOSごとに挙動が違うことがあるので注意
        this.keyboardService.addShortcut('delete', [], () => this.app.deleteSelectedAnnotation());
        this.keyboardService.addShortcut('backspace', [], () => this.app.deleteSelectedAnnotation());

        // 0: Reset Zoom
        this.addCrossOsShortcut('0', () => this.app.resetZoom());

        // Navigation
        this.keyboardService.addShortcut('arrowup', [], () => {
            if (this.app.state.selectedPageIndex > 0) {
                this.app.selectPage(this.app.state.selectedPageIndex - 1);
            }
        });
        this.keyboardService.addShortcut('arrowdown', [], () => {
            if (this.app.state.selectedPageIndex < this.app.state.pages.length - 1) {
                this.app.selectPage(this.app.state.selectedPageIndex + 1);
            }
        });
    }

    // クロスOS対応のショートカット登録ヘルパー
    private addCrossOsShortcut(key: string, callback: () => void): void {
        this.keyboardService.addShortcut(key, ['ctrl'], callback);
        this.keyboardService.addShortcut(key, ['meta'], callback);
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
            const isTargetSelected = this.app.state.selectedPageIndices.includes(index);

            // ターゲットインデックス（未選択ページならそのページのみ、選択済みなら選択ページ全体）
            const targetIndices = isTargetSelected ? undefined : [index];

            // 視覚的フィードバック: 未選択ページの場合は一時的にハイライト
            if (!isTargetSelected) {
                target.classList.add('context-menu-target');
            }

            const onClose = () => {
                target.classList.remove('context-menu-target');
            };

            const isMultiSelect = isTargetSelected && this.app.state.selectedPageIndices.length > 1;
            const items: MenuItem[] = [];

            // 表示用カウント
            const count = targetIndices ? targetIndices.length : this.app.state.selectedPageIndices.length;

            // ページ操作メニュー
            items.push({
                label: count > 1 ? `${count}ページを削除` : '削除',
                icon: ICONS.TRASH,
                danger: true,
                action: () => this.app.deletePages(targetIndices)
            });

            items.push({ divider: true, label: '' });

            items.push({
                label: '右に回転 (90°)',
                icon: ICONS.ROTATE_RIGHT,
                action: () => this.app.rotatePages(targetIndices)
            });

            items.push({
                label: '複製',
                icon: ICONS.DUPLICATE,
                action: () => this.app.duplicatePages(targetIndices)
            });

            // 単一対象時のみ移動可能
            if (!isMultiSelect && count === 1) {
                items.push({ divider: true, label: '' });
                const actualIndex = targetIndices ? targetIndices[0] : index;

                items.push({
                    label: '上へ移動',
                    disabled: actualIndex === 0,
                    action: () => this.app.movePageUp(actualIndex)
                });
                items.push({
                    label: '下へ移動',
                    disabled: actualIndex === this.app.state.pages.length - 1,
                    action: () => this.app.movePageDown(actualIndex)
                });
            }

            this.contextMenuManager.show(e.clientX, e.clientY, items, onClose);
        });

        // --- メインビュー（注釈・ページ） ---
        this.elements.pagePreview.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            // 選択中の注釈がある場合
            if (this.app.getSelectedAnnotationId() && this.app.state.pages[this.app.state.selectedPageIndex]) {
                const items: MenuItem[] = [];

                items.push({
                    label: '削除',
                    danger: true,
                    icon: ICONS.TRASH,
                    action: () => {
                        this.app.deleteSelectedAnnotation();
                    }
                });

                items.push({
                    label: 'コピー',
                    action: () => {
                        this.app.handleCopy();
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
                    action: () => this.app.deletePages()
                },
                {
                    label: '右に回転',
                    action: () => this.app.rotatePages()
                }
            ];
            this.contextMenuManager.show(e.clientX, e.clientY, items);
        });
    }

    // Panning state
    private isPanning = false;
    private panStart = { x: 0, y: 0 };
    private panScrollStart = { left: 0, top: 0 };
    private isSpacePressed = false;

    private bindShortcuts(): void {
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                switch (e.key.toLowerCase()) {
                    case 'z':
                        e.preventDefault();
                        this.app.undo();
                        break;
                    case 'y':
                        e.preventDefault();
                        this.app.redo();
                        break;
                    case 'a':
                        e.preventDefault();
                        // input/textarea内では無効化
                        if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
                        this.app.selectAllPages();
                        break;
                    case 'd':
                        e.preventDefault();
                        this.app.duplicatePages();
                        break;
                    case 'c':
                        if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
                        this.app.handleCopy();
                        break;
                    case 'v':
                        if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
                        this.app.handlePaste();
                        break;
                }
            } else if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
                switch (e.key.toLowerCase()) {
                    case 'z':
                        e.preventDefault();
                        this.app.redo();
                        break;
                }
            } else if (e.key === 'Delete') {
                if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

                // 注釈選択中なら注釈削除
                if (this.app.getSelectedAnnotationId()) {
                    this.app.deleteSelectedAnnotation();
                } else {
                    // ページ削除
                    this.app.deletePages();
                }
            } else if (e.key === ' ') {
                // Space key for panning
                if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
                e.preventDefault();
                if (!this.isSpacePressed) {
                    this.isSpacePressed = true;
                    this.elements.pagePreview.classList.add('grab');
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === ' ') {
                this.isSpacePressed = false;
                this.isPanning = false;
                this.elements.pagePreview.classList.remove('grab');
                this.elements.pagePreview.classList.remove('grabbing');
            }
        });

        // Wheel Zoom
        this.elements.pagePreview.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const direction = e.deltaY > 0 ? -1 : 1;
                // app.handleWheelZoom を直接呼び出し
                this.app.handleWheelZoom(direction, e.clientX, e.clientY);
            }
        }, { passive: false });
    }

    private setupCanvasEvents(): void {
        const canvas = this.elements.previewCanvas;
        const container = this.elements.pagePreview;

        // Panning (MouseDown)
        container.addEventListener('mousedown', (e) => {
            if (this.isSpacePressed || e.button === 1) { // Middle click or Space+Click
                e.preventDefault();
                this.isPanning = true;
                this.panStart = { x: e.clientX, y: e.clientY };
                this.panScrollStart = {
                    left: container.scrollLeft,
                    top: container.scrollTop
                };
                container.classList.add('grabbing');
                return;
            }
        });

        // MouseMove (Panning)
        window.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                e.preventDefault();
                const dx = e.clientX - this.panStart.x;
                const dy = e.clientY - this.panStart.y;
                container.scrollLeft = this.panScrollStart.left - dx;
                container.scrollTop = this.panScrollStart.top - dy;
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                container.classList.remove('grabbing');
            }
        });

        // Canvas interactions - Delegate to App via onCanvas...
        canvas.addEventListener('mousedown', (e) => {
            if (this.isPanning || this.isSpacePressed) return;
            this.app.onCanvasMouseDown(e);
        });

        canvas.addEventListener('mousemove', (e) => {
            if (this.isPanning) return;
            this.app.onCanvasMouseMove(e);
        });

        canvas.addEventListener('mouseup', (e) => {
            if (this.isPanning) return;
            this.app.onCanvasMouseUp(e);
        });

        canvas.addEventListener('mouseleave', () => {
            if (this.isPanning) return;
            this.app.onCanvasMouseLeave();
        });

        // Double Click
        canvas.addEventListener('dblclick', (e) => {
            this.app.onCanvasDoubleClick(e);
        });

        // Touch support with pinch zoom
        this.setupTouchEvents(canvas, container);
    }

    // Touch state for pinch zoom
    private touchState = {
        initialDistance: 0,
        isPinching: false,
        lastScale: 1,
        touchStarted: false
    };

    private getTouchDistance(touches: TouchList): number {
        if (touches.length < 2) return 0;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private getTouchCenter(touches: TouchList): { x: number; y: number } {
        if (touches.length < 2) {
            return { x: touches[0].clientX, y: touches[0].clientY };
        }
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };
    }

    private setupTouchEvents(canvas: HTMLCanvasElement, container: HTMLDivElement): void {
        canvas.addEventListener('touchstart', (e) => {
            this.touchState.touchStarted = true;

            if (e.touches.length === 2) {
                // Pinch zoom start
                e.preventDefault();
                this.touchState.isPinching = true;
                this.touchState.initialDistance = this.getTouchDistance(e.touches);
                this.touchState.lastScale = 1;
            } else if (e.touches.length === 1 && !this.touchState.isPinching) {
                // Single touch - delegate to app
                const touch = e.touches[0];
                const mouseEvent = new MouseEvent('mousedown', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    bubbles: true
                });
                this.app.onCanvasMouseDown(mouseEvent);
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && this.touchState.isPinching) {
                // Pinch zoom
                e.preventDefault();
                const currentDistance = this.getTouchDistance(e.touches);
                if (this.touchState.initialDistance > 0) {
                    const scale = currentDistance / this.touchState.initialDistance;
                    const center = this.getTouchCenter(e.touches);

                    // Only apply if scale change is significant
                    const scaleChange = scale / this.touchState.lastScale;
                    if (Math.abs(scaleChange - 1) > 0.02) {
                        this.app.handlePinchZoom(scaleChange, center.x, center.y);
                        this.touchState.lastScale = scale;
                    }
                }
            } else if (e.touches.length === 1 && !this.touchState.isPinching) {
                // Single touch move - delegate to app
                e.preventDefault();
                const touch = e.touches[0];
                const mouseEvent = new MouseEvent('mousemove', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    bubbles: true
                });
                this.app.onCanvasMouseMove(mouseEvent);
            }
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) {
                // All touches ended
                if (this.touchState.touchStarted && !this.touchState.isPinching) {
                    const mouseEvent = new MouseEvent('mouseup', { bubbles: true });
                    this.app.onCanvasMouseUp(mouseEvent);
                }
                this.touchState.isPinching = false;
                this.touchState.initialDistance = 0;
                this.touchState.lastScale = 1;
                this.touchState.touchStarted = false;
            } else if (e.touches.length === 1 && this.touchState.isPinching) {
                // One finger lifted during pinch - reset pinch state
                this.touchState.isPinching = false;
                this.touchState.initialDistance = 0;
                this.touchState.lastScale = 1;
            }
        }, { passive: false });

        // Touch panning on container
        this.setupTouchPanning(container);
    }

    private setupTouchPanning(container: HTMLDivElement): void {
        let panStartX = 0;
        let panStartY = 0;
        let scrollStartLeft = 0;
        let scrollStartTop = 0;
        let isPanningTouch = false;

        container.addEventListener('touchstart', (e) => {
            // Only pan with one finger and when not on canvas (handled separately)
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                const target = e.target as HTMLElement;

                // Don't pan if touch started on canvas (canvas handles its own events)
                if (target === this.elements.previewCanvas) return;

                panStartX = touch.clientX;
                panStartY = touch.clientY;
                scrollStartLeft = container.scrollLeft;
                scrollStartTop = container.scrollTop;
                isPanningTouch = true;
            }
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (!isPanningTouch || e.touches.length !== 1) return;

            const touch = e.touches[0];
            const dx = touch.clientX - panStartX;
            const dy = touch.clientY - panStartY;

            container.scrollLeft = scrollStartLeft - dx;
            container.scrollTop = scrollStartTop - dy;
        }, { passive: true });

        container.addEventListener('touchend', () => {
            isPanningTouch = false;
        }, { passive: true });
    }
}
