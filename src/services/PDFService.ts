import { v4 as uuidv4 } from '../utils/uuid';

// pdfjs-distをViteで使う場合のworker設定
import * as pdfjsLib from 'pdfjs-dist';

// Worker設定
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

import type { PageData, LoadResult } from '../types';

/**
 * PDFService - PDF読み込み・編集サービス
 */
export class PDFService {
    private thumbnailScale = 0.3;
    private previewScale = 2.0;

    /**
     * PDFファイルを読み込んでページデータを生成
     */
    async loadPDF(file: File): Promise<LoadResult> {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfBytes = new Uint8Array(arrayBuffer);
            const pages = await this.extractPages(pdfBytes);
            return { success: true, pages };
        } catch (error) {
            console.error('PDF load error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'PDFの読み込みに失敗しました',
            };
        }
    }

    /**
     * PDFからページを抽出
     */
    async extractPages(pdfBytes: Uint8Array): Promise<PageData[]> {
        // getDocumentに渡す前にコピーを作成（Workerへの転送でdetachされるため）
        const pdfBytesForRender = pdfBytes.slice(0);
        const pdf = await pdfjsLib.getDocument({ data: pdfBytesForRender }).promise;
        const pages: PageData[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1 });
            const thumbnail = await this.renderThumbnail(page, this.thumbnailScale);

            // 各ページ用に新しいコピーを作成（後でレンダリングに使用）
            pages.push({
                id: uuidv4(),
                type: 'pdf',
                pdfBytes: pdfBytes.slice(0),
                thumbnail,
                width: viewport.width,
                height: viewport.height,
                originalPageIndex: i - 1,
            });
        }

        return pages;
    }

    /**
     * サムネイル生成
     */
    async renderThumbnail(
        page: pdfjsLib.PDFPageProxy,
        scale: number
    ): Promise<string> {
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d')!;
        await page.render({
            canvasContext: context,
            viewport,
        }).promise;

        return canvas.toDataURL('image/jpeg', 0.8);
    }

    /**
     * ページをCanvasにレンダリング
     */
    async renderToCanvas(
        canvas: HTMLCanvasElement,
        pageData: PageData
    ): Promise<void> {
        if (pageData.type === 'image') {
            await this.renderImageToCanvas(canvas, pageData);
            return;
        }

        if (!pageData.pdfBytes || pageData.originalPageIndex === undefined) {
            throw new Error('Invalid page data');
        }

        // ArrayBufferはWorkerへの転送後にdetachされるため、コピーを作成
        const pdfBytesClone = pageData.pdfBytes.slice(0);
        const pdf = await pdfjsLib.getDocument({ data: pdfBytesClone }).promise;
        const page = await pdf.getPage(pageData.originalPageIndex + 1);

        // キャンバスサイズに合わせてスケールを計算
        const viewport = page.getViewport({ scale: this.previewScale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d')!;

        // 変形行列をリセット（描画崩れ防止）
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        await page.render({
            canvasContext: context,
            viewport,
        }).promise;
    }

    /**
     * 画像をCanvasにレンダリング（ページサイズに合わせてスケーリング）
     */
    private async renderImageToCanvas(
        canvas: HTMLCanvasElement,
        pageData: PageData
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // ページサイズに合わせたキャンバスサイズ（previewScaleを適用）
                canvas.width = pageData.width * this.previewScale;
                canvas.height = pageData.height * this.previewScale;
                const ctx = canvas.getContext('2d')!;

                // 背景を白で塗りつぶし
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // 画像をページサイズにフィットするようにスケーリング
                const scaleX = canvas.width / img.width;
                const scaleY = canvas.height / img.height;
                const scale = Math.min(scaleX, scaleY);

                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;
                const x = (canvas.width - scaledWidth) / 2;
                const y = (canvas.height - scaledHeight) / 2;

                ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
                resolve();
            };
            img.onerror = reject;
            // フルサイズ画像があればそれを使用、なければサムネイルを使用
            img.src = pageData.fullImage || pageData.thumbnail;
        });
    }

    /**
     * ページを削除
     */
    removePageAt(pages: PageData[], index: number): PageData[] {
        return pages.filter((_, i) => i !== index);
    }

    /**
     * ページを挿入
     */
    insertPageAt(
        pages: PageData[],
        page: PageData,
        index: number
    ): PageData[] {
        const newPages = [...pages];
        newPages.splice(index, 0, page);
        return newPages;
    }

    /**
     * ページ並べ替え
     */
    reorderPages(
        pages: PageData[],
        fromIndex: number,
        toIndex: number
    ): PageData[] {
        const newPages = [...pages];
        const [removed] = newPages.splice(fromIndex, 1);
        newPages.splice(toIndex, 0, removed);
        return newPages;
    }
}
