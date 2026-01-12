import { UIElements, AppState } from '../types';

export class ToolbarManager {
    constructor(
        private elements: UIElements
    ) { }

    public setupDropdownMenus(): void {
        const { btnFileMenu, fileMenu, btnExportMenu, exportMenu } = this.elements;

        // ファイルメニュー
        if (btnFileMenu && fileMenu) {
            btnFileMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                fileMenu.classList.toggle('show');
                exportMenu?.classList.remove('show');
            });

            // ドロップダウン内クリックでも閉じる（アイテム選択後）
            fileMenu.addEventListener('click', () => {
                fileMenu.classList.remove('show');
            });
        }

        // エクスポートメニュー
        if (btnExportMenu && exportMenu) {
            btnExportMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                exportMenu.classList.toggle('show');
                fileMenu?.classList.remove('show');
            });

            exportMenu.addEventListener('click', () => {
                exportMenu.classList.remove('show');
            });
        }

        // 外部クリックで閉じる
        document.addEventListener('click', () => {
            fileMenu?.classList.remove('show');
            exportMenu?.classList.remove('show');
        });
    }

    public update(state: AppState, canUndo: boolean, canRedo: boolean): void {
        const hasPages = state.pages.length > 0;
        const selectedIndex = state.selectedPageIndex;
        const { elements } = this;

        // ボタンの有効/無効切り替え
        elements.btnSave.disabled = !hasPages;
        elements.btnSaveAs.disabled = !hasPages;
        elements.btnSplit.disabled = !hasPages;

        elements.btnMoveUp.disabled = !hasPages || selectedIndex <= 0;
        elements.btnMoveDown.disabled = !hasPages || selectedIndex >= state.pages.length - 1;

        elements.btnRotate.disabled = !hasPages || selectedIndex < 0;
        elements.btnDuplicate.disabled = !hasPages || selectedIndex < 0;
        elements.btnDelete.disabled = !hasPages || selectedIndex < 0;
        elements.btnClear.disabled = !hasPages;

        elements.btnAddText.disabled = !hasPages || selectedIndex < 0;
        elements.btnHighlight.disabled = !hasPages || selectedIndex < 0;

        elements.btnExportPng.disabled = !hasPages || selectedIndex < 0;
        elements.btnExportAll.disabled = !hasPages;

        // Undo/Redoボタンの状態更新
        elements.btnUndo.disabled = !canUndo;
        elements.btnRedo.disabled = !canRedo;

        // ページ数表示
        elements.pageCount.textContent = hasPages
            ? `${state.pages.length}ページ`
            : '';
    }

    public updateTheme(isDarkMode: boolean): void {
        this.elements.iconLight.style.display = isDarkMode ? 'none' : 'block';
        this.elements.iconDark.style.display = isDarkMode ? 'block' : 'none';

        // メインビューの背景色も更新（CSS変数が反映されるため不要かもしれないが、念のため）
        // CSSクラスでの制御が基本なので、DOM操作は最小限にする
    }

    public updateZoom(currentZoom: number): void {
        this.elements.zoomLevel.textContent = `${Math.round(currentZoom * 100)}% `;
    }
}
