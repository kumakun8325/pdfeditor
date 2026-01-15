import { describe, it, expect, beforeEach } from 'vitest';
import { UndoManager } from '../../../src/managers/UndoManager';
import type { PageData } from '../../../src/types';

describe('UndoManager', () => {
    let undoManager: UndoManager;

    // テスト用のダミーページデータ
    const mockPage: PageData = {
        id: 'test-page-1',
        type: 'pdf',
        thumbnail: 'data:image/png;base64,xxx',
        width: 612,
        height: 792,
    };

    beforeEach(() => {
        undoManager = new UndoManager();
    });

    it('初期状態ではundoできない', () => {
        expect(undoManager.canUndo()).toBe(false);
    });

    it('初期状態ではredoできない', () => {
        expect(undoManager.canRedo()).toBe(false);
    });

    it('pushするとundoできるようになる', () => {
        undoManager.push({ type: 'deletePage', page: mockPage, index: 0 });
        expect(undoManager.canUndo()).toBe(true);
    });

    it('popUndoするとredoできるようになる', () => {
        undoManager.push({ type: 'deletePage', page: mockPage, index: 0 });
        const action = undoManager.popUndo();
        expect(action).toBeDefined();
        expect(action?.type).toBe('deletePage');
        expect(undoManager.canRedo()).toBe(true);
    });

    it('popRedoするとundoスタックに戻る', () => {
        undoManager.push({ type: 'deletePage', page: mockPage, index: 0 });
        undoManager.popUndo();
        expect(undoManager.canUndo()).toBe(false);

        const action = undoManager.popRedo();
        expect(action).toBeDefined();
        expect(undoManager.canUndo()).toBe(true);
    });

    it('clearするとスタックが空になる', () => {
        undoManager.push({ type: 'deletePage', page: mockPage, index: 0 });
        undoManager.push({ type: 'movePage', fromIndex: 0, toIndex: 1 });
        undoManager.clear();
        expect(undoManager.canUndo()).toBe(false);
        expect(undoManager.canRedo()).toBe(false);
    });

    it('新しいpushでredoスタックがクリアされる', () => {
        undoManager.push({ type: 'deletePage', page: mockPage, index: 0 });
        undoManager.popUndo();
        expect(undoManager.canRedo()).toBe(true);

        undoManager.push({ type: 'movePage', fromIndex: 0, toIndex: 1 });
        expect(undoManager.canRedo()).toBe(false);
    });

    it('maxStackSizeを超えると古いアクションが削除される', () => {
        const smallManager = new UndoManager(3);
        smallManager.push({ type: 'deletePage', page: { ...mockPage, id: '1' }, index: 0 });
        smallManager.push({ type: 'deletePage', page: { ...mockPage, id: '2' }, index: 1 });
        smallManager.push({ type: 'deletePage', page: { ...mockPage, id: '3' }, index: 2 });
        smallManager.push({ type: 'deletePage', page: { ...mockPage, id: '4' }, index: 3 });

        // 最初のアクション(id: '1')は削除されているはず
        let count = 0;
        while (smallManager.canUndo()) {
            smallManager.popUndo();
            count++;
        }
        expect(count).toBe(3);
    });

    it('空のスタックでpopUndoするとundefinedを返す', () => {
        const action = undoManager.popUndo();
        expect(action).toBeUndefined();
    });

    it('空のスタックでpopRedoするとundefinedを返す', () => {
        const action = undoManager.popRedo();
        expect(action).toBeUndefined();
    });

    it('複数のアクションを正しく管理できる', () => {
        undoManager.push({ type: 'deletePage', page: mockPage, index: 0 });
        undoManager.push({ type: 'movePage', fromIndex: 0, toIndex: 1 });
        undoManager.push({ type: 'rotatePage', pageId: 'page-1', previousRotation: 0, newRotation: 90 });

        expect(undoManager.canUndo()).toBe(true);

        const action1 = undoManager.popUndo();
        expect(action1?.type).toBe('rotatePage');

        const action2 = undoManager.popUndo();
        expect(action2?.type).toBe('movePage');

        const action3 = undoManager.popUndo();
        expect(action3?.type).toBe('deletePage');

        expect(undoManager.canUndo()).toBe(false);
        expect(undoManager.canRedo()).toBe(true);
    });
});
