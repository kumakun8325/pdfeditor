import { PDFDocument } from 'pdf-lib';
import { v4 as uuidv4 } from '../utils/uuid';
import type { PageData } from '../types';

/**
 * ImageService - 画像をPDFページとして処理
 */
export class ImageService {
    /**
     * 画像ファイルをPageDataに変換
     */
    async imageToPageData(
        file: File,
        referenceWidth: number,
        referenceHeight: number
    ): Promise<PageData> {
        const imageBytes = new Uint8Array(await file.arrayBuffer());
        const thumbnail = await this.createThumbnail(file);

        return {
            id: uuidv4(),
            type: 'image',
            imageBytes,
            thumbnail,
            width: referenceWidth,
            height: referenceHeight,
        };
    }

    /**
     * 画像のサムネイルを生成
     */
    private async createThumbnail(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxSize = 200;
                let { width, height } = img;

                if (width > height) {
                    if (width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, width, height);

                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
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
