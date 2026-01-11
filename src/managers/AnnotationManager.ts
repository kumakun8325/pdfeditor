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
        scale: number,
        selectedAnnotationId?: string | null
    ): void {
        if (!page) return;

        // ハイライト注釈を描画（テキストより先に描画して背景として表示）
        if (page.highlightAnnotations && page.highlightAnnotations.length > 0) {
            for (const highlight of page.highlightAnnotations) {
                const isSelected = highlight.id === selectedAnnotationId;
                this.drawHighlight(ctx, highlight, page.height, scale, isSelected);
            }
        }

        // テキスト注釈を描画
        if (page.textAnnotations && page.textAnnotations.length > 0) {
            for (const annotation of page.textAnnotations) {
                const isSelected = annotation.id === selectedAnnotationId;
                this.drawText(ctx, annotation, page.height, scale, isSelected);
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
        scale: number,
        isSelected: boolean
    ): void {
        ctx.save();
        ctx.fillStyle = highlight.color;
        ctx.globalAlpha = 0.3;

        const canvasX = highlight.x * scale;
        const canvasY = (pageHeight - highlight.y) * scale;
        const width = highlight.width * scale;
        const height = highlight.height * scale;

        ctx.fillRect(canvasX, canvasY, width, height);
        ctx.restore();

        // 選択枠を描画
        if (isSelected) {
            ctx.save();
            ctx.strokeStyle = '#007aff';
            ctx.lineWidth = 2;
            ctx.strokeRect(canvasX, canvasY, width, height);

            // ハンドルを描画
            this.drawHandle(ctx, canvasX, canvasY);
            this.drawHandle(ctx, canvasX + width, canvasY);
            this.drawHandle(ctx, canvasX, canvasY + height);
            this.drawHandle(ctx, canvasX + width, canvasY + height);
            ctx.restore();
        }
    }

    /**
     * 個別のテキストを描画
     */
    private static drawText(
        ctx: CanvasRenderingContext2D,
        annotation: TextAnnotation,
        pageHeight: number,
        scale: number,
        isSelected: boolean
    ): void {
        ctx.save();
        ctx.font = `${annotation.fontSize * scale}px sans-serif`;
        ctx.fillStyle = annotation.color;
        ctx.textBaseline = 'top';

        const canvasX = annotation.x * scale;
        const canvasY = (pageHeight - annotation.y) * scale;

        // 選択されている場合は枠を描画
        if (isSelected) {
            const metrics = ctx.measureText(annotation.text);
            const textHeight = annotation.fontSize * scale; // 簡易的な高さ計算
            const padding = 4;

            ctx.save();
            ctx.strokeStyle = '#007aff';
            ctx.lineWidth = 2;
            ctx.strokeRect(
                canvasX - padding,
                canvasY - padding,
                metrics.width + padding * 2,
                textHeight + padding * 2
            );

            // ハンドルを描画
            this.drawHandle(ctx, canvasX - padding, canvasY - padding);
            this.drawHandle(ctx, canvasX - padding + metrics.width + padding * 2, canvasY - padding);
            this.drawHandle(ctx, canvasX - padding, canvasY - padding + textHeight + padding * 2);
            this.drawHandle(ctx, canvasX - padding + metrics.width + padding * 2, canvasY - padding + textHeight + padding * 2);
            ctx.restore();
        }

        ctx.fillText(annotation.text, canvasX, canvasY);
        ctx.restore();
    }

    private static drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number): void {
        const size = 6;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#007aff';
        ctx.lineWidth = 1;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        ctx.strokeRect(x - size / 2, y - size / 2, size, size);
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

            // 簡易ヒット判定：文字数とフォントサイズから推定
            // 正確にはCanvasのmeasureTextを使うのが良いが、ここではModelのみで計算
            const estimatedWidth = ann.text.length * ann.fontSize * 0.6; // 英数字混じりを考慮して0.6倍
            const estimatedHeight = ann.fontSize * 1.2;

            const margin = 5;

            // テキストは左上が原点（Y座標はPDF座標系で下から上なので注意が必要だが、
            // PageDataのx, yは左下原点(PDF) or 左上原点(Canvas)? 
            // コードを見る限り、PDF座標系(左下原点)で保存されているが、描画時に変換されている。
            // hitTestTextの引数 pdfX, pdfY はPDF座標系。
            // テキスト描画は fillText(text, x, y - height) ではなく (x, y) なので、
            // AnnotationManager.drawTextでは `pageHeight - annotation.y` をCanvas Yとしている。
            // これは「PDF座標y」が「テキストの上端」を表しているのか「ベースライン」か「左下」か？
            // drawTextの実装: ctx.textBaseline = 'top'; canvasY = (pageHeight - ann.y) * scale;
            // つまり ann.y は「PDFページ上端からのオフセット」ではなく「PDF座標系(左下0)でのY」
            // Canvas Y (Top-Left 0) = Height - PDF Y.
            // Canvas上で textBaseline=top なので、Canvas Y がテキストの上端。
            // したがって、PDF Y は「テキストの上端」に対応するPDF座標。
            // PDF座標系ではYは上に行くほど大きい。
            // Canvas Y (上端) = Hy - Py.
            // テキストはそこから下に伸びる (Canvas Y 増加)。
            // つまり PDF座標系では Py から下に伸びる (PDF Y 減少)。
            // 範囲: X [ann.x, ann.x + width], Y [ann.y - height, ann.y]

            if (pdfX >= ann.x - margin && pdfX <= ann.x + estimatedWidth + margin &&
                pdfY >= ann.y - estimatedHeight - margin && pdfY <= ann.y + margin) {
                return ann;
            }
        }
        return null;
    }

    /**
     * ハイライト注釈のヒット判定
     */
    public static hitTestHighlight(
        page: PageData,
        pdfX: number,
        pdfY: number
    ): HighlightAnnotation | null {
        if (!page.highlightAnnotations || page.highlightAnnotations.length === 0) return null;

        for (let i = page.highlightAnnotations.length - 1; i >= 0; i--) {
            const hl = page.highlightAnnotations[i];

            // ハイライトは矩形情報 (x, y, width, height) を持つ
            // x, y は左下？左上？
            // addHighlightの実装を見る: 
            // x: Math.min(startX, pdfX), y: Math.max(startY, pdfY)
            // drawHighlight: canvasY = (pageHeight - highlight.y) * scale
            // yは矩形の「上端」(PDF座標系での大きい方のY)
            // 描画はそこから height 分だけ下に伸びる (Canvas Y増加, PDF Y減少)
            // 範囲: X [hl.x, hl.x + hl.width], Y [hl.y - hl.height, hl.y]

            const margin = 2;

            if (pdfX >= hl.x - margin && pdfX <= hl.x + hl.width + margin &&
                pdfY <= hl.y + margin && pdfY >= hl.y - hl.height - margin) {
                return hl;
            }
        }
        return null;
    }
}
