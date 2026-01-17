import { saveAs } from 'file-saver';
import { PDFDocument, degrees, rgb, cmyk, StandardFonts, LineCapStyle, PDFPage } from 'pdf-lib';
import type { AppState, ToastType, ShapeAnnotation } from '../types';
import type { PDFService } from '../services/PDFService';
import type { ImageService } from '../services/ImageService';
import { ColorService } from '../services/ColorService';

/**
 * エクスポート処理コールバック
 */
export interface ExportCallbacks {
    showLoading: (text: string) => void;
    hideLoading: () => void;
    showToast: (message: string, type: ToastType) => void;
}

/**
 * PDF/画像エクスポートを担当するマネージャー
 */
export class ExportManager {
    constructor(
        private getState: () => AppState,
        private pdfService: PDFService,
        private imageService: ImageService,
        private callbacks: ExportCallbacks
    ) {}

    private get state(): AppState {
        return this.getState();
    }

    /**
     * PDFを保存
     */
    public async savePDF(): Promise<void> {
        if (this.state.pages.length === 0) return;

        this.callbacks.showLoading('PDFを生成中...');

        try {
            const pdfDoc = await PDFDocument.create();

            for (const page of this.state.pages) {
                let pdfPage;
                if (page.type === 'image') {
                    pdfPage = await this.imageService.embedImageToPdf(pdfDoc, page);
                    if (page.rotation && pdfPage) {
                        pdfPage.setRotation(degrees(page.rotation));
                    }
                } else if (page.pdfBytes && page.originalPageIndex !== undefined) {
                    const srcDoc = await PDFDocument.load(page.pdfBytes);
                    const [copiedPage] = await pdfDoc.copyPages(srcDoc, [
                        page.originalPageIndex,
                    ]);
                    if (page.rotation) {
                        const currentRotation = copiedPage.getRotation().angle;
                        copiedPage.setRotation(degrees(currentRotation + page.rotation));
                    }
                    pdfDoc.addPage(copiedPage);
                    pdfPage = copiedPage;
                }

                // テキスト注釈を埋め込む
                if (pdfPage && page.textAnnotations && page.textAnnotations.length > 0) {
                    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                    const isCmyk = this.state.exportOptions.colorSpace === 'cmyk';

                    for (const annotation of page.textAnnotations) {
                        let textColor;

                        if (isCmyk) {
                            const [c, m, y, k] = ColorService.hexToCmyk(annotation.color);
                            textColor = cmyk(c, m, y, k);
                        } else {
                            const hex = annotation.color.replace('#', '');
                            const r = parseInt(hex.substring(0, 2), 16) / 255;
                            const g = parseInt(hex.substring(2, 4), 16) / 255;
                            const b = parseInt(hex.substring(4, 6), 16) / 255;
                            textColor = rgb(r, g, b);
                        }

                        pdfPage.drawText(annotation.text, {
                            x: annotation.x,
                            y: annotation.y,
                            size: annotation.fontSize,
                            font,
                            color: textColor,
                            rotate: degrees(annotation.rotation || 0),
                        });
                    }
                }

                // ハイライト注釈を埋め込む
                if (pdfPage && page.highlightAnnotations && page.highlightAnnotations.length > 0) {
                    const isCmyk = this.state.exportOptions.colorSpace === 'cmyk';

                    for (const annotation of page.highlightAnnotations) {
                        let highlightColor;

                        if (isCmyk) {
                            const [c, m, y, k] = ColorService.hexToCmyk(annotation.color);
                            highlightColor = cmyk(c, m, y, k);
                        } else {
                            const hex = annotation.color.replace('#', '');
                            const r = parseInt(hex.substring(0, 2), 16) / 255;
                            const g = parseInt(hex.substring(2, 4), 16) / 255;
                            const b = parseInt(hex.substring(4, 6), 16) / 255;
                            highlightColor = rgb(r, g, b);
                        }

                        pdfPage.drawRectangle({
                            x: annotation.x,
                            y: annotation.y,
                            width: annotation.width,
                            height: annotation.height,
                            color: highlightColor,
                            opacity: 0.3,
                        });
                    }
                }

                // シェイプ注釈を埋め込む
                if (pdfPage && page.shapeAnnotations && page.shapeAnnotations.length > 0) {
                    const isCmyk = this.state.exportOptions.colorSpace === 'cmyk';
                    for (const shape of page.shapeAnnotations) {
                        this.embedShapeAnnotation(pdfPage, shape, isCmyk);
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            this.downloadPDF(pdfBytes, 'edited.pdf');
            this.callbacks.showToast('PDFを保存しました', 'success');
        } catch (error) {
            console.error('Save PDF error:', error);
            this.callbacks.showToast('PDFの保存に失敗しました', 'error');
        }

        this.callbacks.hideLoading();
    }

    /**
     * 現在のページを画像として保存
     */
    public async exportCurrentPage(): Promise<void> {
        if (this.state.selectedPageIndex < 0 || this.state.pages.length === 0) return;

        this.callbacks.showLoading('画像を生成中...');

        try {
            const page = this.state.pages[this.state.selectedPageIndex];
            const blob = await this.pdfService.exportPageAsImage(page);
            saveAs(blob, `page_${this.state.selectedPageIndex + 1}.png`);
            this.callbacks.showToast('画像を保存しました', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.callbacks.showToast('画像の保存に失敗しました', 'error');
        }

        this.callbacks.hideLoading();
    }

    /**
     * 全ページをZIPで保存
     */
    public async exportAllPages(): Promise<void> {
        if (this.state.pages.length === 0) return;

        this.callbacks.showLoading('ZIPを生成中...');

        try {
            const blob = await this.pdfService.exportAllPagesAsZip(this.state.pages);
            saveAs(blob, 'pages.zip');
            this.callbacks.showToast('ZIPを保存しました', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.callbacks.showToast('ZIPの保存に失敗しました', 'error');
        }

        this.callbacks.hideLoading();
    }

    /**
     * PDFを分割してダウンロード
     */
    public async splitAndDownload(): Promise<void> {
        if (this.state.pages.length === 0) return;

        this.callbacks.showLoading('PDFを分割中...');

        try {
            const pdfDoc = await PDFDocument.create();

            for (const page of this.state.pages) {
                if (page.type === 'image') {
                    await this.imageService.embedImageToPdf(pdfDoc, page);
                } else if (page.pdfBytes && page.originalPageIndex !== undefined) {
                    const srcDoc = await PDFDocument.load(page.pdfBytes);
                    const [copiedPage] = await pdfDoc.copyPages(srcDoc, [page.originalPageIndex]);
                    pdfDoc.addPage(copiedPage);
                }
            }

            const pdfBytes = await pdfDoc.save();
            const pdfSize = pdfBytes.length;
            const maxSize = 10 * 1024 * 1024; // 10MB

            if (pdfSize <= maxSize) {
                this.callbacks.showToast('10MB以下のため分割不要です。通常保存を使用してください。', 'warning');
                this.callbacks.hideLoading();
                return;
            }

            const blob = await this.pdfService.splitBinaryAsZip(new Uint8Array(pdfBytes), 'document.pdf');
            const chunkCount = Math.ceil(pdfSize / maxSize);
            saveAs(blob, 'document_split.zip');
            this.callbacks.showToast(`${chunkCount} 個のファイルに分割しました`, 'success');
        } catch (error) {
            console.error('Split error:', error);
            this.callbacks.showToast('分割に失敗しました', 'error');
        }

        this.callbacks.hideLoading();
    }

    /**
     * 名前を付けて保存
     */
    public async saveAsPDF(): Promise<void> {
        if (this.state.pages.length === 0) return;

        const fileName = prompt('ファイル名を入力してください:', 'document.pdf');
        if (!fileName) return;

        const finalName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;

        this.callbacks.showLoading('PDFを生成中...');

        try {
            const pdfDoc = await PDFDocument.create();

            for (const page of this.state.pages) {
                let pdfPage;
                if (page.type === 'image') {
                    pdfPage = await this.imageService.embedImageToPdf(pdfDoc, page);
                    if (page.rotation && pdfPage) {
                        pdfPage.setRotation(degrees(page.rotation));
                    }
                } else if (page.pdfBytes && page.originalPageIndex !== undefined) {
                    const srcDoc = await PDFDocument.load(page.pdfBytes);
                    const [copiedPage] = await pdfDoc.copyPages(srcDoc, [
                        page.originalPageIndex,
                    ]);
                    if (page.rotation) {
                        const currentRotation = copiedPage.getRotation().angle;
                        copiedPage.setRotation(degrees(currentRotation + page.rotation));
                    }
                    pdfDoc.addPage(copiedPage);
                    pdfPage = copiedPage;
                }

                // テキスト注釈を埋め込む
                if (pdfPage && page.textAnnotations && page.textAnnotations.length > 0) {
                    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                    for (const annotation of page.textAnnotations) {
                        const hex = annotation.color.replace('#', '');
                        const r = parseInt(hex.substring(0, 2), 16) / 255;
                        const g = parseInt(hex.substring(2, 4), 16) / 255;
                        const b = parseInt(hex.substring(4, 6), 16) / 255;

                        pdfPage.drawText(annotation.text, {
                            x: annotation.x,
                            y: annotation.y,
                            size: annotation.fontSize,
                            font,
                            color: rgb(r, g, b),
                        });
                    }
                }

                // ハイライト注釈を埋め込む
                if (pdfPage && page.highlightAnnotations && page.highlightAnnotations.length > 0) {
                    for (const annotation of page.highlightAnnotations) {
                        const hex = annotation.color.replace('#', '');
                        const r = parseInt(hex.substring(0, 2), 16) / 255;
                        const g = parseInt(hex.substring(2, 4), 16) / 255;
                        const b = parseInt(hex.substring(4, 6), 16) / 255;

                        pdfPage.drawRectangle({
                            x: annotation.x,
                            y: annotation.y,
                            width: annotation.width,
                            height: annotation.height,
                            color: rgb(r, g, b),
                            opacity: 0.3,
                        });
                    }
                }

                // シェイプ注釈を埋め込む
                if (pdfPage && page.shapeAnnotations && page.shapeAnnotations.length > 0) {
                    for (const shape of page.shapeAnnotations) {
                        this.embedShapeAnnotation(pdfPage, shape, false);
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            this.downloadPDF(pdfBytes, finalName);
            this.callbacks.showToast(`「${finalName}」を保存しました`, 'success');
        } catch (error) {
            console.error('Save PDF error:', error);
            this.callbacks.showToast('PDFの保存に失敗しました', 'error');
        }

        this.callbacks.hideLoading();
    }

    /**
     * PDFをダウンロード（内部ヘルパー）
     */
    private downloadPDF(pdfBytes: Uint8Array, fileName: string = 'edited.pdf'): void {
        const arrayBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * シェイプ注釈をPDFページに埋め込む
     */
    private embedShapeAnnotation(pdfPage: PDFPage, shape: ShapeAnnotation, isCmyk: boolean): void {
        // 色変換
        let strokeColor;
        let fillColor;

        if (isCmyk) {
            const [c, m, y, k] = ColorService.hexToCmyk(shape.strokeColor);
            strokeColor = cmyk(c, m, y, k);
            if (shape.fillColor) {
                const [fc, fm, fy, fk] = ColorService.hexToCmyk(shape.fillColor);
                fillColor = cmyk(fc, fm, fy, fk);
            }
        } else {
            const hex = shape.strokeColor.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16) / 255;
            const g = parseInt(hex.substring(2, 4), 16) / 255;
            const b = parseInt(hex.substring(4, 6), 16) / 255;
            strokeColor = rgb(r, g, b);
            if (shape.fillColor) {
                const fhex = shape.fillColor.replace('#', '');
                const fr = parseInt(fhex.substring(0, 2), 16) / 255;
                const fg = parseInt(fhex.substring(2, 4), 16) / 255;
                const fb = parseInt(fhex.substring(4, 6), 16) / 255;
                fillColor = rgb(fr, fg, fb);
            }
        }

        const lineWidth = shape.strokeWidth;

        switch (shape.type) {
            case 'line':
                pdfPage.drawLine({
                    start: { x: shape.x1, y: shape.y1 },
                    end: { x: shape.x2, y: shape.y2 },
                    thickness: lineWidth,
                    color: strokeColor,
                    lineCap: LineCapStyle.Round,
                });
                break;

            case 'arrow': {
                // 線を描画
                pdfPage.drawLine({
                    start: { x: shape.x1, y: shape.y1 },
                    end: { x: shape.x2, y: shape.y2 },
                    thickness: lineWidth,
                    color: strokeColor,
                    lineCap: LineCapStyle.Round,
                });
                // 矢じりを描画（三角形）
                const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
                const headLen = 10;
                const ax1 = shape.x2 - headLen * Math.cos(angle - Math.PI / 6);
                const ay1 = shape.y2 - headLen * Math.sin(angle - Math.PI / 6);
                const ax2 = shape.x2 - headLen * Math.cos(angle + Math.PI / 6);
                const ay2 = shape.y2 - headLen * Math.sin(angle + Math.PI / 6);

                // 矢じりは三角形として描画
                pdfPage.drawLine({
                    start: { x: shape.x2, y: shape.y2 },
                    end: { x: ax1, y: ay1 },
                    thickness: lineWidth,
                    color: strokeColor,
                    lineCap: LineCapStyle.Round,
                });
                pdfPage.drawLine({
                    start: { x: shape.x2, y: shape.y2 },
                    end: { x: ax2, y: ay2 },
                    thickness: lineWidth,
                    color: strokeColor,
                    lineCap: LineCapStyle.Round,
                });
                pdfPage.drawLine({
                    start: { x: ax1, y: ay1 },
                    end: { x: ax2, y: ay2 },
                    thickness: lineWidth,
                    color: strokeColor,
                    lineCap: LineCapStyle.Round,
                });
                break;
            }

            case 'rectangle': {
                const x = Math.min(shape.x1, shape.x2);
                const y = Math.min(shape.y1, shape.y2);
                const width = Math.abs(shape.x2 - shape.x1);
                const height = Math.abs(shape.y2 - shape.y1);

                pdfPage.drawRectangle({
                    x,
                    y,
                    width,
                    height,
                    borderColor: strokeColor,
                    borderWidth: lineWidth,
                    color: fillColor,
                });
                break;
            }

            case 'ellipse': {
                const cx = (shape.x1 + shape.x2) / 2;
                const cy = (shape.y1 + shape.y2) / 2;
                // pdf-libのellipseはx, yが中心、radiusがx/y方向の半径
                pdfPage.drawEllipse({
                    x: cx,
                    y: cy,
                    xScale: Math.abs(shape.x2 - shape.x1) / 2,
                    yScale: Math.abs(shape.y2 - shape.y1) / 2,
                    borderColor: strokeColor,
                    borderWidth: lineWidth,
                    color: fillColor,
                });
                break;
            }

            case 'freehand':
                if (shape.path && shape.path.length > 1) {
                    for (let i = 0; i < shape.path.length - 1; i++) {
                        pdfPage.drawLine({
                            start: { x: shape.path[i].x, y: shape.path[i].y },
                            end: { x: shape.path[i + 1].x, y: shape.path[i + 1].y },
                            thickness: lineWidth,
                            color: strokeColor,
                            lineCap: LineCapStyle.Round,
                        });
                    }
                }
                break;
        }
    }
}
