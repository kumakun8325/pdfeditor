import type { PageData, TextAnnotation, HighlightAnnotation } from '../types';

export class AnnotationManager {
    /**
     * Canvas座標をPDF座標に変換
     */
    public static toPdfPoint(
        canvasX: number,
        canvasY: number,
        scale: number,
        pageHeight: number
    ): { x: number; y: number } {
        const x = canvasX / scale;
        const y = pageHeight - (canvasY / scale);
        return { x, y };
    }

    /**
     * PDF座標をCanvas座標に変換
     */
    public static toCanvasPoint(
        pdfX: number,
        pdfY: number,
        scale: number,
        pageHeight: number
    ): { x: number; y: number } {
        const x = pdfX * scale;
        const y = (pageHeight - pdfY) * scale;
        return { x, y };
    }

    /**
     * 注釈を描画
     */
    public static drawAnnotations(
        ctx: CanvasRenderingContext2D,
        page: PageData,
        scale: number
    ): void {
        if (!page) return;

        // ハイライト注釈を描画（テキストより先に描画して背景として表示）
        if (page.highlightAnnotations && page.highlightAnnotations.length > 0) {
            for (const highlight of page.highlightAnnotations) {
                this.drawHighlight(ctx, highlight, page.height, scale);
            }
        }

        // テキスト注釈を描画
        if (page.textAnnotations && page.textAnnotations.length > 0) {
            for (const annotation of page.textAnnotations) {
                this.drawText(ctx, annotation, page.height, scale);
            }
        }
    }

    /**
     * 個別のハイライトを描画
     */
    private static drawHighlight(
        ctx: CanvasRenderingContext2D,
        highlight: HighlightAnnotation,
        pageHeight: number,
        scale: number
    ): void {
        ctx.save();
        ctx.fillStyle = highlight.color;
        ctx.globalAlpha = 0.3;

        const canvasX = highlight.x * scale;
        const canvasY = (pageHeight - highlight.y) * scale;

        ctx.fillRect(canvasX, canvasY, highlight.width * scale, highlight.height * scale);
        ctx.restore();
    }

    /**
     * 個別のテキストを描画
     */
    private static drawText(
        ctx: CanvasRenderingContext2D,
        annotation: TextAnnotation,
        pageHeight: number,
        scale: number
    ): void {
        ctx.save();
        ctx.font = `${annotation.fontSize * scale}px sans-serif`;
        ctx.fillStyle = annotation.color;
        ctx.textBaseline = 'top';

        const canvasX = annotation.x * scale;
        const canvasY = (pageHeight - annotation.y) * scale;

        ctx.fillText(annotation.text, canvasX, canvasY);
        ctx.restore();
    }

    /**
     * テキスト注釈のヒット判定
     */
    public static hitTestText(
        page: PageData,
        pdfX: number,
        pdfY: number
    ): TextAnnotation | null {
        if (!page.textAnnotations || page.textAnnotations.length === 0) return null;

        // クリック位置にある注釈を検索（最後に追加されたものが優先）
        for (let i = page.textAnnotations.length - 1; i >= 0; i--) {
            const ann = page.textAnnotations[i];
            // テキストの大まかなヒット領域を計算（広めに設定）
            const textWidth = Math.max(ann.text.length * ann.fontSize * 0.6, 50);
            const textHeight = ann.fontSize * 1.5;

            if (pdfX >= ann.x - 10 && pdfX <= ann.x + textWidth + 10 &&
                pdfY >= ann.y - textHeight - 10 && pdfY <= ann.y + 10) {
                return ann;
            }
        }
        return null;
    }
}
