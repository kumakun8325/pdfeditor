import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFService } from '../../../src/services/PDFService';
import type { PageData } from '../../../src/types';

// pdfjs-dist のモック
vi.mock('pdfjs-dist', () => ({
    getDocument: vi.fn(),
    GlobalWorkerOptions: { workerSrc: '' },
}));

describe('PDFService', () => {
    let pdfService: PDFService;

    // テスト用のダミーページデータ
    const createMockPage = (id: string, index: number): PageData => ({
        id,
        type: 'pdf',
        thumbnail: 'data:image/png;base64,xxx',
        width: 612,
        height: 792,
        originalPageIndex: index,
    });

    beforeEach(() => {
        pdfService = new PDFService();
    });

    describe('removePageAt', () => {
        it('指定したインデックスのページを削除する', () => {
            const pages = [
                createMockPage('page-0', 0),
                createMockPage('page-1', 1),
                createMockPage('page-2', 2),
            ];

            const result = pdfService.removePageAt(pages, 1);

            expect(result.length).toBe(2);
            expect(result[0].id).toBe('page-0');
            expect(result[1].id).toBe('page-2');
        });

        it('範囲外のインデックスでは何もしない', () => {
            const pages = [createMockPage('page-0', 0)];
            const result = pdfService.removePageAt(pages, 5);
            expect(result.length).toBe(1);
        });

        it('最初のページを削除できる', () => {
            const pages = [
                createMockPage('page-0', 0),
                createMockPage('page-1', 1),
            ];
            const result = pdfService.removePageAt(pages, 0);
            expect(result.length).toBe(1);
            expect(result[0].id).toBe('page-1');
        });

        it('最後のページを削除できる', () => {
            const pages = [
                createMockPage('page-0', 0),
                createMockPage('page-1', 1),
            ];
            const result = pdfService.removePageAt(pages, 1);
            expect(result.length).toBe(1);
            expect(result[0].id).toBe('page-0');
        });

        it('元の配列を変更しない（イミュータブル）', () => {
            const pages = [
                createMockPage('page-0', 0),
                createMockPage('page-1', 1),
            ];
            const originalLength = pages.length;
            pdfService.removePageAt(pages, 0);
            expect(pages.length).toBe(originalLength);
        });
    });

    describe('insertPageAt', () => {
        it('指定したインデックスにページを挿入する', () => {
            const pages = [
                createMockPage('page-0', 0),
                createMockPage('page-2', 2),
            ];
            const newPage = createMockPage('page-1', 1);

            const result = pdfService.insertPageAt(pages, newPage, 1);

            expect(result.length).toBe(3);
            expect(result[1].id).toBe('page-1');
        });

        it('先頭に挿入できる', () => {
            const pages = [createMockPage('page-1', 1)];
            const newPage = createMockPage('page-0', 0);

            const result = pdfService.insertPageAt(pages, newPage, 0);

            expect(result.length).toBe(2);
            expect(result[0].id).toBe('page-0');
            expect(result[1].id).toBe('page-1');
        });

        it('末尾に挿入できる', () => {
            const pages = [createMockPage('page-0', 0)];
            const newPage = createMockPage('page-1', 1);

            const result = pdfService.insertPageAt(pages, newPage, 1);

            expect(result.length).toBe(2);
            expect(result[0].id).toBe('page-0');
            expect(result[1].id).toBe('page-1');
        });

        it('元の配列を変更しない（イミュータブル）', () => {
            const pages = [createMockPage('page-0', 0)];
            const originalLength = pages.length;
            const newPage = createMockPage('page-1', 1);
            pdfService.insertPageAt(pages, newPage, 1);
            expect(pages.length).toBe(originalLength);
        });
    });

    describe('reorderPages', () => {
        it('ページを正しく並べ替える', () => {
            const pages = [
                createMockPage('page-0', 0),
                createMockPage('page-1', 1),
                createMockPage('page-2', 2),
            ];

            const result = pdfService.reorderPages(pages, 0, 2);

            expect(result[0].id).toBe('page-1');
            expect(result[1].id).toBe('page-2');
            expect(result[2].id).toBe('page-0');
        });

        it('前方への移動が正しく動作する', () => {
            const pages = [
                createMockPage('page-0', 0),
                createMockPage('page-1', 1),
                createMockPage('page-2', 2),
            ];

            const result = pdfService.reorderPages(pages, 2, 0);

            expect(result[0].id).toBe('page-2');
            expect(result[1].id).toBe('page-0');
            expect(result[2].id).toBe('page-1');
        });

        it('隣接ページの入れ替えが正しく動作する', () => {
            const pages = [
                createMockPage('page-0', 0),
                createMockPage('page-1', 1),
            ];

            const result = pdfService.reorderPages(pages, 0, 1);

            expect(result[0].id).toBe('page-1');
            expect(result[1].id).toBe('page-0');
        });

        it('元の配列を変更しない（イミュータブル）', () => {
            const pages = [
                createMockPage('page-0', 0),
                createMockPage('page-1', 1),
            ];
            const originalFirst = pages[0].id;
            pdfService.reorderPages(pages, 0, 1);
            expect(pages[0].id).toBe(originalFirst);
        });
    });
});
