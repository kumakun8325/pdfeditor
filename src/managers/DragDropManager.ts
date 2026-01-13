import { AppState } from '../types';

export class DragDropManager {
    constructor(
        private getState: () => AppState
    ) { }

    private get state(): AppState {
        return this.getState();
    }

    /**
     * ファイルドロップゾーンの設定
     */
    public setupDropZone(element: HTMLElement, onFileDrop: (files: FileList) => void): void {
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.style.borderColor = 'var(--accent, #2196F3)';
            element.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
        });

        element.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.style.borderColor = '';
            element.style.backgroundColor = '';
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.style.borderColor = '';
            element.style.backgroundColor = '';

            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                onFileDrop(files);
            }
        });
    }

    /**
     * サムネイルのドラッグ＆ドロップ設定 (並べ替え)
     */
    public registerThumbnail(
        element: HTMLElement,
        index: number,
        onReorder: (fromIndices: number[], toIndex: number) => void
    ): void {
        element.draggable = true;

        element.addEventListener('dragstart', (e) => {
            // 複数選択中なら選択されたページ全体をドラッグ
            const indicesToDrag = this.state.selectedPageIndices.includes(index)
                ? [...this.state.selectedPageIndices].sort((a, b) => a - b)
                : [index];

            if (e.dataTransfer) {
                // ブラウザ互換性のため text/plain でJSON文字列を渡す
                e.dataTransfer.setData('text/plain', JSON.stringify(indicesToDrag));
                e.dataTransfer.effectAllowed = 'move';
            }
            element.style.opacity = '0.5';
        });

        element.addEventListener('dragend', () => {
            element.style.opacity = '1';
        });

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }

            const rect = element.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;

            element.classList.remove('drag-over-above', 'drag-over-below');
            if (e.clientY < midY) {
                element.classList.add('drag-over-above');
            } else {
                element.classList.add('drag-over-below');
            }
        });

        element.addEventListener('dragleave', () => {
            element.classList.remove('drag-over-above', 'drag-over-below');
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            element.classList.remove('drag-over-above', 'drag-over-below');

            const data = e.dataTransfer?.getData('text/plain');
            if (!data) return;

            let fromIndices: number[];
            try {
                fromIndices = JSON.parse(data);
                if (!Array.isArray(fromIndices)) {
                    fromIndices = [parseInt(data, 10)];
                }
            } catch {
                const single = parseInt(data, 10);
                if (isNaN(single)) return;
                fromIndices = [single];
            }

            const rect = element.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const toIndex = e.clientY < midY ? index : index + 1;

            onReorder(fromIndices, toIndex);
        });
    }
}
