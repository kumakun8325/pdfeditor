import { AppState } from '../types';

export class SelectionManager {
    constructor(private getState: () => AppState) { }

    private get state(): AppState {
        return this.getState();
    }

    /**
     * ページを選択
     */
    public select(index: number, multiSelect: boolean = false): void {
        const totalPages = this.state.pages.length;
        if (index < 0 || index >= totalPages) return;

        if (multiSelect) {
            // トグル選択 (Ctrl/Cmd + Click)
            const currentIdx = this.state.selectedPageIndices.indexOf(index);
            if (currentIdx >= 0) {
                // 既に選択されていたら解除
                this.state.selectedPageIndices.splice(currentIdx, 1);
            } else {
                // 未選択なら追加
                this.state.selectedPageIndices.push(index);
            }

            // メインビュー表示ページを更新 (最後に選択したページ、または末尾の選択ページ)
            if (this.state.selectedPageIndices.length > 0) {
                // 追加された場合はそのページを表示、解除された場合は配列の末尾を表示などが自然か
                // ここでは「最後に操作したページ」または「リストの末尾」を表示ページとする
                // 直感的には「クリックしたページ」が表示されるべきだが、解除時は？
                // 解除時もそのページが表示されていたなら、別のページにフォーカス移動すべき？
                // 既存実装: indexをpush/spliceした後、末尾を選択。
                // 改善: 追加時は index。解除時は... 残った中の末尾。

                if (currentIdx === -1) {
                    // 追加された
                    this.state.selectedPageIndex = index;
                } else {
                    // 解除された
                    if (this.state.selectedPageIndex === index) {
                        // 表示中だったページが解除されたので、別のページを表示
                        this.state.selectedPageIndex = this.state.selectedPageIndices[this.state.selectedPageIndices.length - 1];
                    }
                    // 表示中でなければ維持
                }
            } else {
                this.state.selectedPageIndex = -1;
            }
        } else {
            // 単一選択
            this.state.selectedPageIndex = index;
            this.state.selectedPageIndices = [index];
        }
    }

    /**
     * 範囲選択 (Shift + Click)
     * 現在の selectedPageIndex から targetIndex までを選択
     */
    public selectRange(targetIndex: number): void {
        const start = this.state.selectedPageIndex;
        const end = targetIndex;
        const totalPages = this.state.pages.length;

        if (start === -1) {
            this.select(targetIndex, false);
            return;
        }

        const min = Math.min(start, end);
        const max = Math.max(start, end);

        const newSelection: number[] = [];
        for (let i = min; i <= max; i++) {
            if (i >= 0 && i < totalPages) {
                newSelection.push(i);
            }
        }

        // 既存の選択をクリアして範囲選択にするか、マージするか？
        // 一般的なShift選択は「アンカーからターゲットまで」を選択状態にする（他は解除）。
        this.state.selectedPageIndices = newSelection;
        this.state.selectedPageIndex = targetIndex; // フォーカスはクリックした先
    }

    public selectAll(): void {
        if (this.state.pages.length === 0) return;
        this.state.selectedPageIndices = this.state.pages.map((_, i) => i);
        // フォーカスは維持、または先頭？
        if (this.state.selectedPageIndex === -1) {
            this.state.selectedPageIndex = 0;
        }
    }

    public clear(): void {
        this.state.selectedPageIndex = -1;
        this.state.selectedPageIndices = [];
    }

    public isSelected(index: number): boolean {
        return this.state.selectedPageIndices.includes(index);
    }
}
