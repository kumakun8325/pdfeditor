import type { PageData, TextAnnotation, HighlightAnnotation } from '../types';

export class AnnotationManager {
    /**
     * Canvas座標をPDF座標に変換
     */
    public static toPdfPoint(
        canvasX: number,
        canvasY: number,
        scale: number,
        pageHeight: number,
        pageWidth: number,
        rotation: number = 0
    ): { x: number; y: number } {
        // 回転正規化
        const rotate = (rotation % 360 + 360) % 360;

        let pdfX = 0;
        let pdfY = 0;

        if (rotate === 0) {
            pdfX = canvasX / scale;
            pdfY = pageHeight - (canvasY / scale);
        } else if (rotate === 90) {
            // 90度: 幅と高さが入れ替わる
            // Canvas(0,0) -> PDF(0, 0) ?
            // PDF座標での (x, y) は、90度回転すると
            // visual X axis corresponds to PDF Y axis (up)
            // visual Y axis corresponds to PDF X axis (right)? No.
            // 90度回転(時計回り):
            // (x, y) -> (y, -x) ? + translate
            // PDF page: Width W, Height H.
            // Rotated: Visual Width H, Visual Height W.
            // visual x (0 to H), visual y (0 to W).
            // visual x corresponds to PDF y (0 to H).
            // visual y corresponds to PDF W - x (0 to W).
            // Let's verify with standard implementation.
            // pdf.js: 90 deg rotation.
            // x' = x cos 90 + y sin 90 = y
            // y' = -x sin 90 + y cos 90 = -x
            // Translate: x'' = y, y'' = W - x ??
            // No, pdf-lib rotation 90:
            // visual top-left (0,0) is PDF (0, H).
            // visual (H, 0) is PDF (W, H). -- Top Edge
            // visual (0, W) is PDF (0, 0). -- Left Edge
            // visual (H, W) is PDF (W, 0).

            // canvasX (0 -> H_scaled), canvasY (0 -> W_scaled)
            // pdfY = canvasX / scale
            // pdfX = canvasY / scale
            // Wait.
            // Visual Top-Left (0,0) -> PDF (0, H) ??
            // Visual X increases (RIGHT) -> PDF X increases? No.
            // If rotated 90 degrees CLOCKWISE:
            // Top of unrotated page (0,H) to (W,H) becomes Right side of rotated view?
            // Usually "Rotate 90" means Clockwise.
            // Unrotated:
            // (0,H) -- (W,H)
            //   |        |
            // (0,0) -- (W,0)
            //
            // Rotated 90 CW:
            // (0,0) -- (0,H)
            //   |        |
            // (W,0) -- (W,H)
            //
            // Visual Top-Left is (0,0) [PDF coords of Unrotated].
            // Visual Top-Right is (0,H).
            // Visual Bottom-Left is (W,0).
            // Visual Bottom-Right is (W,H).

            // So:
            // Visual X (right) goes along PDF Y axis (up).
            // Visual Y (down) goes along PDF X axis (right).
            //
            // pdfY = canvasX / scale
            // pdfX = canvasY / scale
            // BUT, PDF Y goes up. Canvas X goes right.
            // pdfY = canvasX / scale.
            // pdfX needs to map 0 -> W. canvasY maps 0 -> W_scaled.
            // pdfX = (W_scaled - canvasY) / scale ?? No, canvas Y goes down.
            // pdfX start at 0 (top-left visual is (0,0)).
            // visual top-left is PDF (0,0) [bottom-left of unrotated]? No.

            // Let's re-read PDF spec or assume standard behavior.
            // PDF 90 deg CW.
            // Top edge becomes Right edge.
            // Left edge becomes Top edge.
            // (0, H unrotated) -> Top-Right visually? No.
            // (0, H) [Top-Left] -> Rotated: Top-Right?
            // If I hold a paper. Top-Left corner. Rotate 90 CW.
            // That corner moves to Top-Right.
            // So Visual Top-Right is (0,H).
            // Visual Top-Left is (0,0) [Bottom-Left of unrotated]?
            // Unrotated Bottom-Left is (0,0).
            // Unrotated Bottom-Right is (W,0).
            // Rotate 90 CW.
            // (0,0) is Top-Left using naive logic.
            //
            // So:
            // canvasX (0 -> H_scaled) maps to PDF Y (0 -> H).
            // canvasY (0 -> W_scaled) maps to PDF X (0 -> W).
            // BUT Canvas Y is down. PDF X is right.
            // Visual Top-Left (0,0) is PDF (0,0).
            // Visual Bottom-Right (H,W) is PDF (W,H).
            // So:
            // pdfY = canvasX / scale
            // pdfX = (pageWidth - (canvasY / scale)) ?? No. canvasY increases means PDF X increases?
            // X axis is Right. Y axis is Down (canvas).
            // Visual:
            // X increases -> PDF Y increases.
            // Y increases -> PDF X decreases? (if top-left is 0,0 and bottom-right is W,H, then X increases 0->W means Y canvas 0->W).
            // WAIT.
            // (0,0) is Top-Left visually.
            // Is it PDF (0,H)? (Bottom-Left Unrotated is 0,0).
            // (0,H) is Top-Left Unrotated.
            // Rotate 90 CW. (0,H) becomes Top-Right visually.
            // So Visual Top-Right is PDF(0,H).
            // Visual Top-Left is PDF(0,0).
            // Visual Bottom-Left is PDF(W,0).
            // Visual Bottom-Right is PDF(W,H).

            // check pdfX/Y mapping.
            // Visual X (0 -> H) => PDF Y (0 -> H).
            // Visual Y (0 -> W) => PDF X (0 -> 0) to (W -> W)?
            // (0,0) -> (0,0)
            // (H,0) -> (0,H) -- No. Visual X=H is PDF Y=H.
            // (0,W) -> (W,0) -- Visual Y=W is PDF X=W.
            // (H,W) -> (W,H) -- Visual Y=W is PDF X=W.

            // So:
            // pdfY = canvasX / scale
            // pdfX = (pageWidth - (canvasY / scale)) ? No.
            // If canvasY = 0 (top), pdfX = 0?
            // If canvasY = W (bottom), pdfX = W?
            // Then pdfX = canvasY / scale.
            // BUT canvasY is usually "down". PDF X is "right".
            // If I go down visually, I go right in PDF??
            // Yes. Left edge becomes Top edge. Top edge becomes Right edge.
            // Visual Top Edge (y=0) is PDF Left Edge (x=0).
            // Visual Bottom Edge (y=W) is PDF Right Edge (x=W).
            // So pdfX = canvasY / scale.

            // Wait.
            // If (0,0) visual = (0,0) PDF.
            // If (H,W) visual = (W,H) PDF ?? No.
            // PDF (W,H) is Unrotated Top-Right.
            // Rotate 90 CW.
            // Unrotated Top-Right (W,H) becomes Visual Bottom-Right.
            // Unrotated Bottom-Right (W,0) becomes Visual Bottom-Left.
            // Unrotated Bottom-Left (0,0) becomes Visual Top-Left.
            // Unrotated Top-Left (0,H) becomes Visual Top-Right.

            // So Visual Top-Left (0,0) is indeed PDF (0,0).
            // Visual Bottom-Right (H,W).
            // So:
            // pdfY = canvasX / scale.
            // pdfX = (pageWidth - (canvasY / scale)) // Since visual Y (0->W) maps to PDF X (0->W).
            // Wait.
            // Visual Y=0 (top) is PDF Left Edge (x=0).
            // Visual Y=W (bottom) is PDF Right Edge (x=W).
            // WAIT. "Left edge becomes Top edge".
            // Unrotated Left Edge (x=0) runs from y=0 to y=H.
            // Rotated 90 CW:
            // This edge is now the Top Edge visually??
            // Yes.
            // So Visual Top Edge (y=0) corresponds to PDF Left Edge (x=0).
            // Visual Bottom Edge (y=W) corresponds to PDF Right Edge (x=W).
            // So pdfX = canvasY / scale? No.
            // If I move visually Right (increase X), I am moving along the PDF Left Edge? (Increasing PDF Y).
            // Yes.
            // If I move visually Down (increase Y), I am moving from PDF Left Edge to PDF Right Edge? (Increasing PDF X).
            // Yes.

            // But wait.
            // Visual Top-Left (0,0) is PDF (0,0)? (Bottom-Left unrotated).
            // Visual Top-Right (H,0) is PDF (0,H)? (Top-Left unrotated).
            // Visual Bottom-Left (0,W) is PDF (W,0)? (Bottom-Right unrotated).
            // Visual Bottom-Right (H,W) is PDF (W,H)? (Top-Right unrotated).

            // Let's check my corner mapping:
            // Unrotated:
            // TL (0,H)   TR (W,H)
            // BL (0,0)   BR (W,0)
            //
            // Rotate 90 CW:
            // BL becomes TL (0,0) -> TL (0,0)
            // TL becomes TR (0,H) -> TR (H,0)
            // BR becomes BL (W,0) -> BL (0,W)
            // TR becomes BR (W,H) -> BR (H,W)
            //
            // This mapping (BL->TL) implies:
            // Visual X (0->H) corresponds to PDF Y (0->H).
            // Visual Y (0->W) corresponds to PDF X (0->W)? No.
            // Trace:
            // BL(0,0) -> TL(0,0). PDF(0,0) -> Visual(0,0).
            // TL(0,H) -> TR(H,0). PDF(0,H) -> Visual(H,0).
            //   => Change in PDF Y (+H) -> Change in Visual X (+H).
            // BR(W,0) -> BL(0,W). PDF(W,0) -> Visual(0,W).
            //   => Change in PDF X (+W) -> Change in Visual Y (-W? No, +W).
            // TR(W,H) -> BR(H,W). PDF(W,H) -> Visual(H,W).
            //
            // So:
            // pdfX corresponds to Visual Y. (0->W => 0->W).
            // pdfY corresponds to Visual X. (0->H => 0->H).
            // Note: Visual Y is DOWN. PDF X is RIGHT.
            // Visual X is RIGHT. PDF Y is UP.
            //
            // So:
            // pdfX = canvasY / scale.
            // pdfY = canvasX / scale.
            //
            // BUT wait. `pageHeight` argument in `toPdfPoint` logic for 0 rotation is:
            // y = pageHeight - (canvasY / scale).
            // This assumes Canvas Y=0 is Top, PDF Y=PageHeight.
            // Canvas Y=H is Bottom, PDF Y=0.
            // This matches standard PDF (Y up).
            //
            // In 90 CW:
            // Visual Top (canvasY=0) is PDF X=0? No.
            // BL(0,0) -> TL(0,0).
            // TL is canvasY=0? Yes.
            // BL was PDF(0,0).
            // So Visual Top (canvasY=0) is PDF (??, 0).
            // Wait. BL unrotated is (0,0).
            // TL unrotated is (0,H).
            // If BL becomes TL.
            // Then Visual Top (canvasY=0) corresponds to PDF Y=0 edge??
            // No.
            // Unrotated BL is (0,0).
            // Canvas coords usually put (0,0) at Top-Left.
            // So Unrotated:
            // PDF (0,H) is Canvas (0,0).
            // PDF (0,0) is Canvas (0,H).
            //
            // So my previous Corner Logic needs to align with Canvas coords.
            // Unrotated:
            // Canvas TL (0,0) = PDF TL (0,H).
            // Canvas BL (0,H) = PDF BL (0,0).
            // Canvas TR (W,0) = PDF TR (W,H).
            // Canvas BR (W,H) = PDF BR (W,0).
            //
            // Rotate 90 CW:
            // Canvas TL (0,0) should come from Unrotated Canvas BL (0,H) [PDF (0,0)].
            // Canvas TR (H,0) should come from Unrotated Canvas TL (0,0) [PDF (0,H)].
            // Canvas BL (0,W) should come from Unrotated Canvas BR (W,H) [PDF (W,0)].
            // Canvas BR (H,W) should come from Unrotated Canvas TR (W,0) [PDF (W,H)].
            //
            // Let's re-verify PDF 90 CW.
            // TL -> TR.
            // BL -> TL. Matches.
            // BR -> BL. Matches.
            // TR -> BR. Matches.
            //
            // So:
            // Visual TL (0,0) corresponds to PDF (0,0).
            // Visual TR (H,0) corresponds to PDF (0,H).
            //   => Visual X corresponds to PDF Y. (0->H => 0->H).
            // Visual BL (0,W) corresponds to PDF (W,0).
            //   => Visual Y corresponds to PDF X. (0->W => 0->W).
            //   => Wait. PDF X increases 0->W. Visual Y increases 0->W.
            //   => But "Canvas Y" increases DOWN.
            //   => The "PDF X" is increasing "RIGHT" (relative to original page).
            //   => In 90 CW, "RIGHT" of original page is "DOWN" of new page.
            //   => So yes, Visual Y maps to PDF X.
            //   => Visual X maps to PDF Y.
            //
            // Wait. PDF Y increases UP.
            // Visual X increases RIGHT.
            // In 90 CW, "UP" of original page is "RIGHT" of new page.
            // So yes, Visual X maps to PDF Y.
            //
            // So:
            // pdfX = canvasY / scale?
            // pdfY = canvasX / scale?

            // Wait.
            // PDF (0,0) is Visual TL (0,0).
            // PDF (W,0) is Visual BL (0,W).
            // So pdfY=0 line is the Left Edge of Visual Page (x=0)??
            // NO.
            // Visual TL (0,0) is (0,0).
            // Visual BL (0,W) is (W,0).
            // Visual X is 0 in both.
            // PDF Y is 0 in both? NO.
            // PDF(0,0) -> PDF(W,0).
            // X changed 0->W. Y stays 0.
            // Visual: (0,0) -> (0,W).
            // X stays 0. Y changed 0->W.
            // So Visual Left Edge (x=0) corresponds to PDF Bottom Edge (y=0)??
            // Unrotated Bottom Edge is (0,0) to (W,0).
            // Becomes Visual Left Edge (0,0) to (0,W).
            // YES.
            // So PDF y=0 is Visual x=0.
            // So pdfY corresponds to Visual X.
            //
            // Let's check Visual TR (H,0).
            // Corresponds to PDF (0,H).
            // PDF X=0, Y=H.
            // Visual X=H, Y=0.
            //
            // So:
            // Visual X (0->H) maps to PDF Y (0->H).
            // Visual Y (0->W) maps to PDF X (0->W).
            // BUT:
            // Visual X=0 -> PDF Y=0.
            // Visual X=H -> PDF Y=H.
            // So pdfY = canvasX / scale.
            //
            // Visual Y=0 -> PDF X=0.
            // Visual Y=W -> PDF X=W.
            // So pdfX = canvasY / scale.
            //
            // BUT wait. Previously I said:
            // Unrotated Canvas TL (0,0) = PDF TL (0,H).
            // Unrotated Canvas Y=0 -> PDF Y=H.
            //
            // Let's re-verify my Unrotated assumption.
            // `toPdfPoint` (unrotated): `y = pageHeight - (canvasY / scale)`.
            // If canvasY=0, y=pageHeight.
            // If canvasY=height, y=0.
            // Matches PDF Standard (Y up).
            //
            // So in 90 CW:
            // Visual TL (0,0) -> PDF (0,0)?
            // Unrotated BL (0,H canvas) -> PDF (0,0).
            // Becomes Visual TL (0,0).
            // So YES, Visual TL corresponds to PDF (0,0).
            // So pdfY = canvasX / scale ??
            // Visual TL has x=0. PDF (0,0) has y=0.
            // Visual TR (H,0) has x=H. PDF (0,H) has y=H.
            // So pdfY = canvasX / scale.
            //
            // Visual TL (0,0) has y=0. PDF (0,0) has x=0.
            // Visual BL (0,W) has y=W. PDF (W,0) has x=W.
            // So pdfX = canvasY / scale.
            //
            // **Correction**:
            // What if `pageWidth` and `pageHeight` passed here are the *original* PDF dimensions?
            // Yes, they usually are.
            // Visual Width = pageHeight (H).
            // Visual Height = pageWidth (W).
            // canvasX is in range [0, H*scale].
            // canvasY is in range [0, W*scale].
            //
            // So:
            // pdfX = (canvasY / scale) ??
            // If canvasY = 0 -> pdfX = 0 ??
            // Visual Top Edge.
            // Corresponds to Unrotated Left Edge (0,0 to 0,H). PDF X=0.
            // So YES. pdfX = canvasY / scale.
            //
            // pdfY = (canvasX / scale) ??
            // If canvasX = 0 -> pdfY = 0 ??
            // Visual Left Edge.
            // Corresponds to Unrotated Bottom Edge (0,0 to W,0). PDF Y=0.
            // YES. pdfY = canvasX / scale.
            //
            // So for 90 CW:
            // pdfX = canvasY / scale
            // pdfY = canvasX / scale

            pdfX = canvasY / scale;
            pdfY = canvasX / scale;
            // Wait, does PDF Y need inversion?
            // In 0 deg: Y = H - canvasY.
            // In 90 deg:
            // canvasX goes 0->H. pdfY goes 0->H.
            // Direction matches?
            // Visual X (Right). Unrotated Y (Up).
            // In 90 CW, Up becomes Right.
            // So visual X increase = PDF Y increase.
            // So no inversion.
            //
            // canvasY goes 0->W (Down). pdfX goes 0->W (Right).
            // In 90 CW, Right becomes Down.
            // So visual Y increase = PDF X increase.
            // So no inversion.

        } else if (rotate === 180) {
            // 180度
            // Canvas(0,0) -> PDF(W, 0) ?
            // Unrotated TL (0,H) -> 180 -> BR (W,0).
            // Unrotated BL (0,0) -> 180 -> TR (W,H).
            // So Visual TL (0,0) corresponds to PDF (W,0).
            // Visual TR (W,0) corresponds to PDF (0,0).
            // Visual BL (0,H) corresponds to PDF (W,H).
            // Visual BR (W,H) corresponds to PDF (0,H).

            // X mapping:
            // Visual X=0 -> PDF X=W.
            // Visual X=W -> PDF X=0.
            // pdfX = pageWidth - (canvasX / scale).

            // Y mapping:
            // Visual Y=0 (Top) -> PDF Y=0 ?
            // Visual TL y=0. PDF y=0.
            // Visual BL y=H. PDF y=H.
            // So pdfY = canvasY / scale.

            pdfX = pageWidth - (canvasX / scale);
            pdfY = canvasY / scale;

        } else if (rotate === 270) {
            // 270度 (90 CCW)
            // Unrotated TL (0,H) -> 270 -> BL (0,0)? No.
            // TL(0,H) -> BL(0, W) ??
            // 270 CW = 90 CCW.
            // Up becomes Left.
            // Right becomes Up.
            // Left becomes Down.
            // Down becomes Right.

            // Visual Width = H. Visual Height = W.

            // Unrotated TL (0,H) [PDF (0,H)] -> Becomes Visual BL (0,W) ?
            // Unrotated BL (0,0) [PDF (0,0)] -> Becomes Visual BR (H,W) ?
            // Unrotated TR (W,H) [PDF (W,H)] -> Becomes Visual TL (0,0) ?
            // Unrotated BR (W,0) [PDF (W,0)] -> Becomes Visual TR (H,0) ?

            // Let's switch to Visual -> PDF.
            // Visual TL (0,0) -> PDF (W,H).
            // Visual TR (H,0) -> PDF (W,0).
            // Visual BL (0,W) -> PDF (0,H).
            // Visual BR (H,W) -> PDF (0,0).

            // X mapping:
            // Visual X (0->H) -> PDF Y (H->0).
            // pdfY = pageHeight - (canvasX / scale).

            // Y mapping:
            // Visual Y (0->W) -> PDF X (W->0) ? (Wait)
            // Visual Top (y=0) corresponds to PDF Right Edge (x=W).
            // Visual Bottom (y=W) corresponds to PDF Left Edge (x=0).
            // So pdfX = pageWidth - (canvasY / scale).

            pdfX = pageWidth - (canvasY / scale);
            pdfY = pageHeight - (canvasX / scale);
        }

        return { x: pdfX, y: pdfY };
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

        ctx.save();

        // 回転の適用
        const rotation = page.rotation || 0;
        const rotate = (rotation % 360 + 360) % 360;

        if (rotate !== 0) {
            // Visual Center calculation
            let visualWidth: number;
            let visualHeight: number;

            if (rotate === 90 || rotate === 270) {
                visualWidth = page.height * scale;
                visualHeight = page.width * scale;
            } else {
                visualWidth = page.width * scale;
                visualHeight = page.height * scale;
            }

            ctx.translate(visualWidth / 2, visualHeight / 2);
            ctx.rotate(rotate * Math.PI / 180);
            ctx.translate(-page.width * scale / 2, -page.height * scale / 2);
        }

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

        ctx.restore();
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

        const canvasX = annotation.x * scale;
        const canvasY = (pageHeight - annotation.y) * scale;
        const rotation = annotation.rotation || 0;

        const metrics = this.getTextMetrics(ctx, annotation.text, annotation.fontSize, scale);
        const textWidth = metrics.width;
        const textHeight = metrics.height;
        const centerX = canvasX + textWidth / 2;
        const centerY = canvasY + textHeight / 2;

        // Rotation around center
        ctx.translate(centerX, centerY);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.translate(-centerX, -centerY);

        ctx.font = `${annotation.fontSize * scale}px sans-serif`;
        ctx.fillStyle = annotation.color;
        ctx.textBaseline = 'top';

        // Draw text at original position (now rotated around center)
        // 選択されている場合は枠を描画
        if (isSelected) {
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

            // ハンドルを描画 (四隅)
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

            // 回転ハンドルの描画 (上部中央)
            const rotX = canvasX + textWidth / 2;
            const rotY = canvasY - padding - 20; // 少し上

            // 線でつなぐ
            ctx.beginPath();
            ctx.moveTo(centerX, canvasY - padding); // Corrected: use centerX for line start X? No, centerX is canvasX+w/2. Yes.
            ctx.lineTo(rotX, rotY);
            ctx.strokeStyle = '#007aff';
            ctx.stroke();

            // 丸いハンドル
            ctx.beginPath();
            ctx.arc(rotX, rotY, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
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

        for (let i = page.textAnnotations.length - 1; i >= 0; i--) {
            const ann = page.textAnnotations[i];

            const metrics = this.getTextMetrics(ctx, ann.text, ann.fontSize, scale);
            const textWidthPdf = metrics.width / scale;
            const textHeightPdf = metrics.height / scale;
            const padding = 4 / scale;
            const margin = 5 / scale;

            const boxX = ann.x;
            const boxY = ann.y;
            const boxW = textWidthPdf;
            const boxH = textHeightPdf;

            const centerX = boxX + boxW / 2;
            const centerY = boxY - boxH / 2;

            const rotation = ann.rotation || 0;
            const rad = rotation * Math.PI / 180; // Un-rotate PDF point (PDF +angle is CCW. Text is rotated CW visually -> CW in PDF (negative angle). To undo, we rotate +angle.)
            // Wait.
            // Canvas +Rot = CW.
            // PDF +Rot = CCW.
            // Visual CW = PDF CW (Negative PDF Angle).
            // Current State: Negative PDF Angle.
            // We want to Rotate Point by Positive PDF Angle to align with axis.
            // Positive PDF Angle = +ann.rotation.

            const dx = pdfX - centerX;
            const dy = pdfY - centerY;

            const rotatedX = dx * Math.cos(rad) - dy * Math.sin(rad) + centerX;
            const rotatedY = dx * Math.sin(rad) + dy * Math.cos(rad) + centerY;

            const testL = boxX - padding - margin;
            const testR = boxX + boxW + padding + margin;
            const testT = boxY + padding + margin;
            const testB = boxY - boxH - padding - margin;

            if (rotatedX >= testL && rotatedX <= testR &&
                rotatedY <= testT && rotatedY >= testB) {
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

        const metrics = this.getTextMetrics(ctx, ann.text, ann.fontSize, scale);
        const textWidthPdf = metrics.width / scale;
        const textHeightPdf = metrics.height / scale;

        const padding = 4 / scale;
        const handleSize = 10 / scale;
        const hitMargin = 5 / scale;

        const boxX = ann.x;
        const boxY = ann.y;
        const boxW = textWidthPdf;
        const boxH = textHeightPdf;
        const centerX = boxX + boxW / 2;
        const centerY = boxY - boxH / 2;

        const rotation = ann.rotation || 0;
        const rad = rotation * Math.PI / 180;

        const dx = pdfX - centerX;
        const dy = pdfY - centerY;

        const rotatedX = dx * Math.cos(rad) - dy * Math.sin(rad) + centerX;
        const rotatedY = dx * Math.sin(rad) + dy * Math.cos(rad) + centerY;

        const brX = boxX + boxW + padding;
        const brY = boxY - boxH - padding;

        const half = handleSize / 2 + hitMargin;

        if (Math.abs(rotatedX - brX) <= half && Math.abs(rotatedY - brY) <= half) {
            return ann;
        }
        return null;
    }

    /**
     * テキスト注釈の回転ハンドルヒット判定 (上部)
     */
    public static hitTestTextRotationHandle(
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

        const metrics = this.getTextMetrics(ctx, ann.text, ann.fontSize, scale);
        const textWidthPdf = metrics.width / scale;
        const textHeightPdf = metrics.height / scale;
        const padding = 4 / scale;

        const dist = 20 / scale;
        const handleRadius = 5 / scale;
        const hitMargin = 5 / scale;

        const boxX = ann.x;
        const boxY = ann.y;
        const boxW = textWidthPdf;
        const boxH = textHeightPdf;

        const centerX = boxX + boxW / 2;
        const centerY = boxY - boxH / 2;

        // Handle is above the text (higher Y in PDF)
        const handleX = centerX;
        const handleY = boxY + padding + dist;

        const rotation = ann.rotation || 0;
        const rad = rotation * Math.PI / 180;

        const dx = pdfX - centerX;
        const dy = pdfY - centerY;

        const rotatedX = dx * Math.cos(rad) - dy * Math.sin(rad) + centerX;
        const rotatedY = dx * Math.sin(rad) + dy * Math.cos(rad) + centerY;

        const distSq = (rotatedX - handleX) ** 2 + (rotatedY - handleY) ** 2;
        const radiusSq = (handleRadius + hitMargin) ** 2;

        if (distSq <= radiusSq) {
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
            const margin = 5;

            // ハイライトは (x, y) が Top-Left (PDF coords where Y=Top)
            // Range: X [hl.x, hl.x + hl.width], Y [hl.y - hl.height, hl.y]

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

        const handleSize = 10 / scale;

        // 右下 (PDF: X=Right, Y=Bottom)
        const brX = hl.x + hl.width;
        const brY = hl.y - hl.height;

        if (Math.abs(pdfX - brX) <= handleSize && Math.abs(pdfY - brY) <= handleSize) {
            return hl;
        }

        return null;
    }
}
