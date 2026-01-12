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
     * テキストのサイズ（幅・高さ）を計算
     */
    public static getTextMetrics(
        ctx: CanvasRenderingContext2D,
        text: string,
        fontSize: number,
        scale: number
    ): { width: number; height: number } {
        ctx.save();
        ctx.font = `${fontSize * scale}px sans-serif`;
        const metrics = ctx.measureText(text);
        const height = fontSize * scale;
        ctx.restore();
        return { width: metrics.width, height };
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

            // 右下（リサイズハンドル）
            const handleSize = 10;
            const brX = canvasX + width;
            const brY = canvasY + height;

            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#007aff';
            ctx.lineWidth = 1;
            ctx.translate(brX, brY);
            ctx.fillRect(-handleSize / 2, -handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(-handleSize / 2, -handleSize / 2, handleSize, handleSize);

            // 斜線アイコン
            ctx.beginPath();
            ctx.moveTo(-3, 3);
            ctx.lineTo(3, -3);
            ctx.stroke();
            ctx.restore();

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
            const metrics = this.getTextMetrics(ctx, annotation.text, annotation.fontSize, scale);
            const textWidth = metrics.width;
            const textHeight = metrics.height;
            const padding = 4;
            // ハンドルサイズ
            const handleSize = 10;

            ctx.save();
            ctx.strokeStyle = '#007aff';
            ctx.lineWidth = 2;
            ctx.strokeRect(
                canvasX - padding,
                canvasY - padding,
                textWidth + padding * 2,
                textHeight + padding * 2
            );

            // ハンドルを描画 (四隅) -> リサイズ用は右下のみ強調
            this.drawHandle(ctx, canvasX - padding, canvasY - padding); // 左上
            this.drawHandle(ctx, canvasX - padding + textWidth + padding * 2, canvasY - padding); // 右上
            this.drawHandle(ctx, canvasX - padding, canvasY - padding + textHeight + padding * 2); // 左下

            // 右下（リサイズハンドル）だけ特別扱い
            const brX = canvasX - padding + textWidth + padding * 2;
            const brY = canvasY - padding + textHeight + padding * 2;

            // 下地 (白)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(brX - handleSize / 2, brY - handleSize / 2, handleSize, handleSize);
            // 枠 (青)
            ctx.strokeRect(brX - handleSize / 2, brY - handleSize / 2, handleSize, handleSize);
            // アイコン的な中身 (斜線など)
            ctx.beginPath();
            ctx.moveTo(brX - 3, brY + 3);
            ctx.lineTo(brX + 3, brY - 3);
            ctx.stroke();

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
        ctx: CanvasRenderingContext2D,
        page: PageData,
        pdfX: number,
        pdfY: number,
        scale: number
    ): TextAnnotation | null {
        if (!page.textAnnotations || page.textAnnotations.length === 0) return null;

        // クリック位置にある注釈を検索（最後に追加されたものが優先）
        for (let i = page.textAnnotations.length - 1; i >= 0; i--) {
            const ann = page.textAnnotations[i];

            // Canvas座標に変換して判定 (measureTextを使うため)
            // Canvas座標に変換して判定 (measureTextを使うため)
            const metrics = this.getTextMetrics(ctx, ann.text, ann.fontSize, scale);
            const textWidth = metrics.width;
            const textHeight = metrics.height;

            const padding = 4; // drawTextと合わせる
            const margin = 5; // ヒットマージン

            // 注釈の左上(Canvas座標)
            const canvasPos = this.toCanvasPoint(ann.x, ann.y, scale, page.height);
            // toCanvasPointはPDF(x, y) -> Canvas(x, pageHeight - y) * scale
            // drawTextのCanvasYは (pageHeight - ann.y) * scale
            // つまり toCanvasPoint の返り値と同じ。

            const rectX = canvasPos.x - padding;
            const rectY = canvasPos.y - padding;
            const rectW = textWidth + padding * 2;
            const rectH = textHeight + padding * 2;

            // タッチ判定用にクリック位置もCanvas変換
            const clickPos = this.toCanvasPoint(pdfX, pdfY, scale, page.height);

            if (clickPos.x >= rectX - margin && clickPos.x <= rectX + rectW + margin &&
                clickPos.y >= rectY - margin && clickPos.y <= rectY + rectH + margin) {
                return ann;
            }
        }
        return null;
    }

    /**
     * テキスト注釈のリサイズハンドルヒット判定 (右下のみ)
     */
    public static hitTestTextHandle(
        ctx: CanvasRenderingContext2D,
        page: PageData,
        pdfX: number,
        pdfY: number,
        scale: number,
        targetAnnotationId: string
    ): TextAnnotation | null {
        if (!page.textAnnotations) return null;

        const ann = page.textAnnotations.find(a => a.id === targetAnnotationId);
        if (!ann) return null;

        // サイズ計測
        const metrics = this.getTextMetrics(ctx, ann.text, ann.fontSize, scale);
        const textWidth = metrics.width;
        const textHeight = metrics.height;

        const padding = 4;
        const handleSize = 10;
        const hitMargin = 5;

        const canvasPos = this.toCanvasPoint(ann.x, ann.y, scale, page.height);

        // 右下ハンドルの中心座標
        const brX = canvasPos.x - padding + textWidth + padding * 2;
        const brY = canvasPos.y - padding + textHeight + padding * 2;

        const clickPos = this.toCanvasPoint(pdfX, pdfY, scale, page.height);

        // 中心から handleSize/2 + margin の範囲
        const half = handleSize / 2 + hitMargin;

        if (Math.abs(clickPos.x - brX) <= half && Math.abs(clickPos.y - brY) <= half) {
            return ann;
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

            const margin = 5;

            if (pdfX >= hl.x - margin && pdfX <= hl.x + hl.width + margin &&
                pdfY <= hl.y + margin && pdfY >= hl.y - hl.height - margin) {
                return hl;
            }
        }
        return null;
    }
    /**
     * ハイライト注釈のリサイズハンドルヒット判定 (右下のみ)
     */
    public static hitTestHighlightHandle(
        page: PageData,
        pdfX: number,
        pdfY: number,
        targetAnnotationId: string,
        scale: number = 1.0 // unused but consistent signature
    ): HighlightAnnotation | null {
        if (!page.highlightAnnotations) return null;

        const hl = page.highlightAnnotations.find(a => a.id === targetAnnotationId);
        if (!hl) return null;

        // 画面上でのサイズ(px)をPDF座標系に換算
        const handleSize = 10 / scale;


        // ハイライトは (x, y) が左上 (PDF座標 Yは上の方が大きい)
        // 右下座標 (PDF座標)
        // x: hl.x + hl.width
        // y: hl.y - hl.height 

        const brX = hl.x + hl.width;
        const brY = hl.y - hl.height;

        // PDF座標での距離計算 (簡易的)
        if (Math.abs(pdfX - brX) <= handleSize && Math.abs(pdfY - brY) <= handleSize) {
            return hl;
        }

        return null;
    }
}
