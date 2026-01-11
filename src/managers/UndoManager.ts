import type { UndoAction } from '../types';

export class UndoManager {
    private undoStack: UndoAction[] = [];
    private redoStack: UndoAction[] = [];
    private readonly maxStackSize: number;

    constructor(maxStackSize = 20) {
        this.maxStackSize = maxStackSize;
    }

    /**
     * 新しい操作を履歴に追加
     */
    public push(action: UndoAction): void {
        this.undoStack.push(action);

        // 最大サイズを超えたら古いものを削除
        if (this.undoStack.length > this.maxStackSize) {
            this.undoStack.shift();
        }

        // 新しい操作が行われたらRedoスタックはクリア
        this.redoStack = [];
    }

    /**
     * Undo実行（最後のアクションを取得して削除）
     */
    public popUndo(): UndoAction | undefined {
        const action = this.undoStack.pop();
        if (action) {
            // 将来的にRedoを実装する際はここでredoStackにpushする
            // this.redoStack.push(action);
        }
        return action;
    }

    /**
     * Redo実行（将来用）
     */
    public popRedo(): UndoAction | undefined {
        return this.redoStack.pop();
    }

    /**
     * Undo可能か
     */
    public canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    /**
     * Redo可能か
     */
    public canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /**
     * 履歴をクリア
     */
    public clear(): void {
        this.undoStack = [];
        this.redoStack = [];
    }
}
