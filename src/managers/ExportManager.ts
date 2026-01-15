import { saveAs } from 'file-saver';
import { PDFDocument, degrees, rgb, cmyk, StandardFonts } from 'pdf-lib';
import type { AppState, ToastType } from '../types';
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
}
