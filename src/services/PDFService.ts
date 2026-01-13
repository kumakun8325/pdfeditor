import { v4 as uuidv4 } from '../utils/uuid';

// pdfjs-distをViteで使う場合のworker設定
import * as pdfjsLib from 'pdfjs-dist';

// Worker設定
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

import type { PageData, LoadResult } from '../types';
import JSZip from 'jszip';

/**
 * PDFService - PDF読み込み・編集サービス
 */
export class PDFService {
    private thumbnailScale = 0.3;


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
        pageData: PageData,
        scale: number = 2.0 // デフォルト値
    ): Promise<void> {
        if (pageData.type === 'image') {
            await this.renderImageToCanvas(canvas, pageData, scale);
            return;
        }

        if (!pageData.pdfBytes || pageData.originalPageIndex === undefined) {
            throw new Error('Invalid page data');
        }

        // ArrayBufferはWorkerへの転送後にdetachされるため、コピーを作成
        const pdfBytesClone = pageData.pdfBytes.slice(0);
        const pdf = await pdfjsLib.getDocument({ data: pdfBytesClone }).promise;
        const page = await pdf.getPage(pageData.originalPageIndex + 1);

        // キャンバスサイズに合わせてスケールを計算（ユーザー回転を加算）
        const userRotation = pageData.rotation || 0;
        const viewport = page.getViewport({
            scale: scale,
            rotation: page.rotate + userRotation
        });
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
     * 画像をCanvasにセンタリングしてフィットさせて描画
     */
    private drawImageFitToCanvas(
        ctx: CanvasRenderingContext2D,
        img: HTMLImageElement,
        canvasWidth: number,
        canvasHeight: number
    ): void {
        const scaleX = canvasWidth / img.width;
        const scaleY = canvasHeight / img.height;
        const scale = Math.min(scaleX, scaleY);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const x = (canvasWidth - scaledWidth) / 2;
        const y = (canvasHeight - scaledHeight) / 2;
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
    }

    /**
     * 画像をCanvasにレンダリング（ページサイズに合わせてスケーリング）
     */
    private async renderImageToCanvas(
        canvas: HTMLCanvasElement,
        pageData: PageData,
        scale: number
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const rotation = pageData.rotation || 0;
                const isRotated90or270 = rotation === 90 || rotation === 270;

                // 90/270度回転時は幅と高さを入れ替え
                const canvasWidth = isRotated90or270
                    ? pageData.height * scale
                    : pageData.width * scale;
                const canvasHeight = isRotated90or270
                    ? pageData.width * scale
                    : pageData.height * scale;

                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
                const ctx = canvas.getContext('2d')!;

                // 変形行列リセット
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // 背景を白で塗りつぶし
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // 回転を適用
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.translate(-canvas.width / 2, -canvas.height / 2);

                // 回転後の描画サイズを計算
                const drawWidth = isRotated90or270 ? canvasHeight : canvasWidth;
                const drawHeight = isRotated90or270 ? canvasWidth : canvasHeight;
                const offsetX = isRotated90or270 ? (canvasWidth - drawWidth) / 2 : 0;
                const offsetY = isRotated90or270 ? (canvasHeight - drawHeight) / 2 : 0;

                // 画像をフィットして描画
                const scaleX = drawWidth / img.width;
                const scaleY = drawHeight / img.height;
                const imgScale = Math.min(scaleX, scaleY);
                const scaledWidth = img.width * imgScale;
                const scaledHeight = img.height * imgScale;
                const x = offsetX + (drawWidth - scaledWidth) / 2;
                const y = offsetY + (drawHeight - scaledHeight) / 2;

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

    /**
     * 単一ページを画像(Blob)としてエクスポート
     */
    async exportPageAsImage(pageData: PageData): Promise<Blob> {
        const canvas = document.createElement('canvas');
        // 解像度を高めるためにスケールを大きくする
        const exportScale = 2.0;

        // PDFページの場合
        if (pageData.type === 'pdf') {
            if (!pageData.pdfBytes || pageData.originalPageIndex === undefined) {
                throw new Error('Invalid page data');
            }

            const pdfBytesClone = pageData.pdfBytes.slice(0);
            const pdf = await pdfjsLib.getDocument({ data: pdfBytesClone }).promise;
            const page = await pdf.getPage(pageData.originalPageIndex + 1);

            const viewport = page.getViewport({ scale: exportScale });
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const context = canvas.getContext('2d')!;
            // 変形行列リセット
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);

            await page.render({
                canvasContext: context,
                viewport,
            }).promise;

            return new Promise((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to create blob'));
                }, 'image/png');
            });
        }

        // 画像ページの場合
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                canvas.width = pageData.width * exportScale;
                canvas.height = pageData.height * exportScale;
                const ctx = canvas.getContext('2d')!;

                // 背景白
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                this.drawImageFitToCanvas(ctx, img, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to create blob'));
                }, 'image/png');
            };
            img.onerror = reject;
            img.src = pageData.fullImage || pageData.thumbnail;
        });
    }

    /**
     * 全ページをZIPとしてエクスポート
     */
    async exportAllPagesAsZip(pages: PageData[]): Promise<Blob> {
        const zip = new JSZip();

        for (let i = 0; i < pages.length; i++) {
            const blob = await this.exportPageAsImage(pages[i]);
            const fileName = `page_${String(i + 1).padStart(3, '0')}.png`;
            zip.file(fileName, blob);
        }

        return await zip.generateAsync({ type: 'blob' });
    }

    /**
     * バイナリデータを指定サイズで分割
     * @param data - 分割対象のバイナリデータ
     * @param maxSize - 最大サイズ (デフォルト: 10MB)
     * @returns 分割されたUint8Array配列
     */
    splitBinary(data: Uint8Array, maxSize: number = 10 * 1024 * 1024): Uint8Array[] {
        const chunks: Uint8Array[] = [];
        let offset = 0;

        while (offset < data.length) {
            const end = Math.min(offset + maxSize, data.length);
            chunks.push(data.slice(offset, end));
            offset = end;
        }

        return chunks;
    }

    /**
     * PDFをバイナリ分割してZIPとしてエクスポート
     * 受信側で cat xxx.pdf.* > xxx.pdf で結合可能
     */
    async splitBinaryAsZip(pdfBytes: Uint8Array, baseName: string, maxSize: number = 10 * 1024 * 1024): Promise<Blob> {
        const chunks = this.splitBinary(pdfBytes, maxSize);
        const zip = new JSZip();

        for (let i = 0; i < chunks.length; i++) {
            const fileName = `${baseName}.${String(i + 1).padStart(3, '0')}`;
            zip.file(fileName, chunks[i]);
        }

        return await zip.generateAsync({ type: 'blob' });
    }
}
