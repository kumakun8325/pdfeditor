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
}
