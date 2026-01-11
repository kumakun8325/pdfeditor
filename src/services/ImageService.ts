import { PDFDocument } from 'pdf-lib';
import { v4 as uuidv4 } from '../utils/uuid';
import type { PageData } from '../types';

/**
 * ImageService - 画像をPDFページとして処理
 */
export class ImageService {
    /**
     * 画像ファイルをPageDataに変換
     * 画像はページサイズに合わせてスケーリングされる
     */
    async imageToPageData(
        file: File,
        referenceWidth: number,
        referenceHeight: number
    ): Promise<PageData> {
        const imageBytes = new Uint8Array(await file.arrayBuffer());
        const { thumbnail, fullImage, originalWidth, originalHeight } = await this.processImage(file);

        return {
            id: uuidv4(),
            type: 'image',
            imageBytes,
            thumbnail,
            fullImage,  // フルサイズ画像（プレビュー用）
            width: referenceWidth,  // ページサイズ
            height: referenceHeight,
            originalWidth,
            originalHeight,
        };
    }

    /**
     * 画像を処理してサムネイルとフルサイズ画像を生成
     */
    private async processImage(file: File): Promise<{
        thumbnail: string;
        fullImage: string;
        originalWidth: number;
        originalHeight: number;
    }> {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();

            img.onload = () => {
                const originalWidth = img.width;
                const originalHeight = img.height;

                // サムネイル生成
                const thumbCanvas = document.createElement('canvas');
                const maxThumbSize = 200;
                let thumbWidth = img.width;
                let thumbHeight = img.height;

                if (thumbWidth > thumbHeight) {
                    if (thumbWidth > maxThumbSize) {
                        thumbHeight = (thumbHeight * maxThumbSize) / thumbWidth;
                        thumbWidth = maxThumbSize;
                    }
                } else {
                    if (thumbHeight > maxThumbSize) {
                        thumbWidth = (thumbWidth * maxThumbSize) / thumbHeight;
                        thumbHeight = maxThumbSize;
                    }
                }

                thumbCanvas.width = thumbWidth;
                thumbCanvas.height = thumbHeight;
                const thumbCtx = thumbCanvas.getContext('2d')!;
                thumbCtx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
                const thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.8);

                // フルサイズ画像のDataURL
                const fullCanvas = document.createElement('canvas');
                fullCanvas.width = originalWidth;
                fullCanvas.height = originalHeight;
                const fullCtx = fullCanvas.getContext('2d')!;
                fullCtx.drawImage(img, 0, 0);
                const fullImage = fullCanvas.toDataURL('image/jpeg', 0.95);

                URL.revokeObjectURL(url);
                resolve({ thumbnail, fullImage, originalWidth, originalHeight });
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('画像の読み込みに失敗しました'));
            };

            img.src = url;
        });
    }

    /**
     * 画像をPDFページとして埋め込む
     */
    async embedImageToPdf(
        pdfDoc: PDFDocument,
        pageData: PageData
    ): Promise<void> {
        if (!pageData.imageBytes) {
            throw new Error('Image bytes not found');
        }

        const page = pdfDoc.addPage([pageData.width, pageData.height]);

        // 画像タイプを判定してembedを呼び出し
        let image;
        try {
            // まずPNGとして試す
            image = await pdfDoc.embedPng(pageData.imageBytes);
        } catch {
            // 失敗したらJPEGとして試す
            try {
                image = await pdfDoc.embedJpg(pageData.imageBytes);
            } catch {
                // 両方失敗した場合はエラー
                throw new Error('Unsupported image format');
            }
        }

        // ページサイズに合わせてスケーリング
        const scaled = image.scaleToFit(pageData.width, pageData.height);
        const x = (pageData.width - scaled.width) / 2;
        const y = (pageData.height - scaled.height) / 2;

        page.drawImage(image, {
            x,
            y,
            width: scaled.width,
            height: scaled.height,
        });
    }
}
