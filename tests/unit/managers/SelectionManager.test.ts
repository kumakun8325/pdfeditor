import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager } from '../../../src/managers/SelectionManager';
import type { AppState, PageData } from '../../../src/types';

describe('SelectionManager', () => {
    let selectionManager: SelectionManager;
    let mockState: AppState;

    const createMockPages = (count: number): PageData[] => {
        return Array.from({ length: count }, (_, i) => ({
            id: `page-${i}`,
            type: 'pdf' as const,
            thumbnail: 'data:image/png;base64,xxx',
            width: 612,
            height: 792,
        }));
    };

    beforeEach(() => {
        mockState = {
            pages: createMockPages(5),
            selectedPageIndex: 0,
            selectedPageIndices: [0],
            isLoading: false,
            isDarkMode: false,
            originalPdfBytes: null,
            exportOptions: { colorSpace: 'rgb' },
        };
        selectionManager = new SelectionManager(() => mockState);
    });

    describe('select', () => {
        it('単一選択が正しく動作する', () => {
            selectionManager.select(2, false);
            expect(mockState.selectedPageIndex).toBe(2);
            expect(mockState.selectedPageIndices).toEqual([2]);
        });

        it('複数選択 (multiSelect=true) で新しいページを追加できる', () => {
            selectionManager.select(0, false);
            selectionManager.select(2, true);
            expect(mockState.selectedPageIndices).toContain(0);
            expect(mockState.selectedPageIndices).toContain(2);
        });

        it('複数選択で既に選択されているページをトグルで解除できる', () => {
            selectionManager.select(0, false);
            selectionManager.select(2, true);
            expect(mockState.selectedPageIndices).toContain(2);

            // 再度クリックで解除
            selectionManager.select(2, true);
            expect(mockState.selectedPageIndices).not.toContain(2);
        });

        it('範囲外のインデックスを選択しようとしても何もしない', () => {
            const initialIndex = mockState.selectedPageIndex;
            selectionManager.select(10, false);
            expect(mockState.selectedPageIndex).toBe(initialIndex);
        });

        it('負のインデックスを選択しようとしても何もしない', () => {
            const initialIndex = mockState.selectedPageIndex;
            selectionManager.select(-1, false);
            expect(mockState.selectedPageIndex).toBe(initialIndex);
        });

        it('全て解除すると selectedPageIndex が -1 になる', () => {
            selectionManager.select(0, false);
            selectionManager.select(0, true); // トグルで解除
            expect(mockState.selectedPageIndex).toBe(-1);
            expect(mockState.selectedPageIndices).toEqual([]);
        });
    });

    describe('selectRange', () => {
        it('範囲選択が正しく動作する', () => {
            selectionManager.select(1, false);
            selectionManager.selectRange(4);
            expect(mockState.selectedPageIndices).toEqual([1, 2, 3, 4]);
        });

        it('逆方向の範囲選択も正しく動作する', () => {
            selectionManager.select(4, false);
            selectionManager.selectRange(1);
            expect(mockState.selectedPageIndices).toEqual([1, 2, 3, 4]);
        });

        it('範囲選択でフォーカスがターゲットに移動する', () => {
            selectionManager.select(1, false);
            selectionManager.selectRange(4);
            expect(mockState.selectedPageIndex).toBe(4);
        });

        it('選択がない状態で範囲選択すると単一選択になる', () => {
            mockState.selectedPageIndex = -1;
            mockState.selectedPageIndices = [];
            selectionManager.selectRange(2);
            expect(mockState.selectedPageIndex).toBe(2);
            expect(mockState.selectedPageIndices).toEqual([2]);
        });
    });

    describe('selectAll', () => {
        it('全ページが選択される', () => {
            selectionManager.selectAll();
            expect(mockState.selectedPageIndices.length).toBe(5);
            expect(mockState.selectedPageIndices).toEqual([0, 1, 2, 3, 4]);
        });

        it('選択がない状態で selectAll すると先頭ページがフォーカスされる', () => {
            mockState.selectedPageIndex = -1;
            selectionManager.selectAll();
            expect(mockState.selectedPageIndex).toBe(0);
        });

        it('ページが0件の場合は何もしない', () => {
            mockState.pages = [];
            mockState.selectedPageIndices = []; // Reset selection
            selectionManager.selectAll();
            expect(mockState.selectedPageIndices).toEqual([]);
        });
    });

    describe('clear', () => {
        it('選択をクリアする', () => {
            selectionManager.select(2, false);
            selectionManager.clear();
            expect(mockState.selectedPageIndex).toBe(-1);
            expect(mockState.selectedPageIndices).toEqual([]);
        });
    });

    describe('isSelected', () => {
        it('選択されているページに対して true を返す', () => {
            selectionManager.select(2, false);
            expect(selectionManager.isSelected(2)).toBe(true);
        });

        it('選択されていないページに対して false を返す', () => {
            selectionManager.select(2, false);
            expect(selectionManager.isSelected(1)).toBe(false);
        });

        it('複数選択でも正しく判定する', () => {
            selectionManager.select(1, false);
            selectionManager.select(3, true);
            expect(selectionManager.isSelected(1)).toBe(true);
            expect(selectionManager.isSelected(3)).toBe(true);
            expect(selectionManager.isSelected(2)).toBe(false);
        });
    });
});
