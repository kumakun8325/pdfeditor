/**
 * KeyboardService - キーボードショートカット管理
 */
export class KeyboardService {
    private shortcuts: Map<string, () => void> = new Map();
    private boundHandler: (e: KeyboardEvent) => void;

    constructor() {
        this.boundHandler = this.handleKeyDown.bind(this);
    }

    /**
     * イベントリスナーを登録
     */
    init(): void {
        document.addEventListener('keydown', this.boundHandler);
    }

    /**
     * ショートカットを追加
     * @param key - キー（例: 'd', 'o', 's'）
     * @param modifiers - 修飾キー配列（例: ['ctrl'], ['meta']）
     * @param callback - 実行する関数
     */
    addShortcut(
        key: string,
        modifiers: ('ctrl' | 'meta' | 'shift' | 'alt')[],
        callback: () => void
    ): void {
        const id = this.createShortcutId(key, modifiers);
        this.shortcuts.set(id, callback);
    }

    /**
     * ショートカットを削除
     */
    removeShortcut(
        key: string,
        modifiers: ('ctrl' | 'meta' | 'shift' | 'alt')[]
    ): void {
        const id = this.createShortcutId(key, modifiers);
        this.shortcuts.delete(id);
    }

    /**
     * イベントリスナーを解除
     */
    destroy(): void {
        document.removeEventListener('keydown', this.boundHandler);
        this.shortcuts.clear();
    }

    private handleKeyDown(e: KeyboardEvent): void {
        // 入力中は無視
        if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
        ) {
            return;
        }

        const modifiers: ('ctrl' | 'meta' | 'shift' | 'alt')[] = [];
        if (e.ctrlKey) modifiers.push('ctrl');
        if (e.metaKey) modifiers.push('meta');
        if (e.shiftKey) modifiers.push('shift');
        if (e.altKey) modifiers.push('alt');

        const id = this.createShortcutId(e.key.toLowerCase(), modifiers);
        const callback = this.shortcuts.get(id);

        if (callback) {
            e.preventDefault();
            callback();
        }
    }

    private createShortcutId(
        key: string,
        modifiers: ('ctrl' | 'meta' | 'shift' | 'alt')[]
    ): string {
        const sortedMods = [...modifiers].sort().join('+');
        return `${sortedMods}+${key.toLowerCase()}`;
    }
}
