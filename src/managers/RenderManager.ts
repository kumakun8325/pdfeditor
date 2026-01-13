import * as pdfjsLib from 'pdfjs-dist';
import { UIElements, AppState, PageData } from '../types';
import { AnnotationManager } from './AnnotationManager';

// Worker設定
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

export class RenderManager {
    private pageCache = new Map<string, ImageBitmap>();
    private previewScale = 1.0;
    private backgroundImageData: ImageData | null = null;
    private renderTask: any = null;
    private isThemeDark = false;
    private currentRenderId = 0;

    constructor(
        private elements: UIElements,
        private getState: () => AppState
    ) { }

    private get state(): AppState {
        return this.getState();
    }

    public setTheme(isDarkMode: boolean): void {
        this.isThemeDark = isDarkMode;
        // キャッシュを無効化（テーマが変わるとレンダリング結果も変わるため）
        this.pageCache.clear();
    }

    public setZoom(zoom: number): void {
        this.previewScale = Math.max(0.1, Math.min(zoom, 5.0)); // 制限
    }

    public getZoom(): number {
        return this.previewScale;
    }

    /**
     * 現在のビューポートに合わせて最適なスケールを計算
     */
    public calculateFitScale(pageWidth: number, pageHeight: number): number {
        const container = this.elements.pagePreview;
        if (!container) return 1.0;

        // padding分を引く
        const availableWidth = container.clientWidth - 48; // padding: var(--spacing-lg) * 2
        const availableHeight = container.clientHeight - 48;

        if (availableWidth <= 0 || availableHeight <= 0) return 1.0;

        const scaleX = availableWidth / pageWidth;
        const scaleY = availableHeight / pageHeight;

        // 小さい方に合わせる（全体が収まるように）
        return Math.min(scaleX, scaleY) * 0.95; // 余白を持たせる
    }

    public getBackgroundImageData(): ImageData | null {
        // ImageDataはもうメインでは使わないが、互換性のため残すか、nullを返す
        return this.backgroundImageData;
    }

    public clearCanvas(): void {
        const canvas = this.elements.previewCanvas;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        this.backgroundImageData = null;
    }

    /**
     * キャッシュをクリア（ページ削除や回転変更時など）
     */
    public clearCache(): void {
        this.pageCache.forEach(bitmap => bitmap.close()); // リソース解放
        this.pageCache.clear();
    }

    /**
     * メインビューの描画（PDFページ＋注釈）
     */
    public async renderMainView(): Promise<void> {
        return this.renderPage();
    }

    /**
     * 指定されたページを描画
     */
    private async renderPage(): Promise<void> {
        this.currentRenderId++;
        const renderId = this.currentRenderId;

        const { state, elements } = this;
        const canvas = elements.previewCanvas;
        const ctx = canvas.getContext('2d');

        if (!ctx || state.selectedPageIndex < 0 || !state.pages[state.selectedPageIndex]) {
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            // canvasのスタイルをリセット（空状態が見えるように）
            canvas.style.width = '';
            canvas.style.height = '';
            elements.pagePreview.classList.add('hidden');
            elements.pagePreview.style.display = '';
            elements.emptyState.classList.remove('hidden');
            elements.emptyState.style.display = 'flex';
            return;
        }

        elements.pagePreview.classList.remove('hidden');
        elements.pagePreview.style.display = '';
        elements.emptyState.classList.add('hidden');
        elements.emptyState.style.display = '';

        // 前のPDレタリングをキャンセル
        if (this.renderTask) {
            this.renderTask.cancel();
            this.renderTask = null;
        }

        const pageData = state.pages[state.selectedPageIndex];

        // デバッグログ
        console.log('[RenderManager] renderPage called', {
            pageId: pageData.id,
            rotation: pageData.rotation,
            hasImageBytes: !!pageData.imageBytes,
            hasFullImage: !!pageData.fullImage,
            hasThumbnail: !!pageData.thumbnail,
            width: pageData.width,
            height: pageData.height
        });

        try {
            if (pageData.imageBytes || pageData.fullImage) {
                console.log('[RenderManager] Using renderImagePage');
                await this.renderImagePage(pageData, ctx, canvas, renderId);
            } else {
                console.log('[RenderManager] Using renderPdfPage');
                await this.renderPdfPage(pageData, ctx, canvas, renderId);
            }

            if (renderId !== this.currentRenderId) {
                console.log('[RenderManager] Render cancelled (renderId mismatch)');
                return;
            }

            // 注釈を描画
            this.drawAnnotations(pageData, ctx);
            console.log('[RenderManager] Render complete');

        } catch (error: any) {
            if (error.name !== 'RenderingCancelledException') {
                console.error('Page render error:', error);
            }
        }
    }

    private async renderImagePage(pageData: PageData, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, renderId: number): Promise<void> {
        // 画像ページ
        const img = new Image();
        const src = pageData.fullImage || pageData.thumbnail;

        if (!src) {
            console.error('renderImagePage: No image source available for page', pageData.id);
            return;
        }

        img.src = src;

        try {
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = (e) => reject(e);
            });
        } catch (e) {
            console.error('renderImagePage: Failed to load image', e);
            return;
        }

        if (renderId !== this.currentRenderId) return;

        // 回転を考慮したサイズ計算
        const rotation = pageData.rotation || 0;
        const isRotated = rotation % 180 !== 0;

        // 元の画像サイズ（スケール適用前）
        const originalWidth = pageData.width;
        const originalHeight = pageData.height;

        // 表示サイズ
        const displayWidth = originalWidth * this.previewScale;
        const displayHeight = originalHeight * this.previewScale;

        // Canvasサイズ設定（回転後の見た目に合わせる）
        const canvasWidth = isRotated ? displayHeight : displayWidth;
        const canvasHeight = isRotated ? displayWidth : displayHeight;

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;

        // 背景塗りつぶし (ダークモード対応)
        ctx.fillStyle = this.isThemeDark ? '#2d2d2d' : '#ffffff';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        ctx.save();
        // キャンバス中心に移動
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        // 回転
        ctx.rotate((rotation * Math.PI) / 180);

        // 回転後の座標系で画像を中心に描画
        // 回転座標系では、画像の中心を(0,0)に置く
        ctx.drawImage(
            img,
            -displayWidth / 2,
            -displayHeight / 2,
            displayWidth,
            displayHeight
        );
        ctx.restore();

        // Bitmapとしてキャッシュに保存
        const bitmap = await createImageBitmap(canvas);
        if (renderId !== this.currentRenderId) return;

        const key = this.getCacheKey(pageData);
        if (this.pageCache.has(key)) {
            this.pageCache.get(key)?.close();
        }
        this.pageCache.set(key, bitmap);
    }

    private async renderPdfPage(pageData: PageData, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, renderId: number): Promise<void> {
        if (!this.state.originalPdfBytes) return;

        const key = this.getCacheKey(pageData);

        // 1. キャッシュチェック
        if (this.pageCache.has(key)) {
            const bitmap = this.pageCache.get(key)!;
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
            }
            // スタイルも更新
            canvas.style.width = `${canvas.width}px`;
            canvas.style.height = `${canvas.height}px`;
            ctx.drawImage(bitmap, 0, 0);
            return;
        }

        // 2. キャッシュミス - レンダリング実行
        const loadingTask = pdfjsLib.getDocument({
            data: this.state.originalPdfBytes.slice(0),
            cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true,
        });

        const pdfDoc = await loadingTask.promise;
        if (renderId !== this.currentRenderId) return;

        if (pageData.originalPageIndex === undefined) {
            console.warn('[RenderManager] Original page index undefined for page', pageData.id);
            return;
        }

        console.log('[RenderManager] renderPdfPage: Getting page', pageData.originalPageIndex + 1);
        const page = await pdfDoc.getPage(pageData.originalPageIndex + 1); // 1-based
        if (renderId !== this.currentRenderId) return;

        const rotation = (pageData.rotation || 0) + page.rotate;
        console.log('[RenderManager] renderPdfPage: Calclated rotation', rotation, '(page.rotate:', page.rotate, 'data.rotation:', pageData.rotation, ')');

        const viewport = page.getViewport({ scale: this.previewScale, rotation });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${canvas.width}px`;
        canvas.style.height = `${canvas.height}px`;

        // 背景クリア
        ctx.fillStyle = this.isThemeDark ? '#2d2d2d' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        console.log('[RenderManager] renderPdfPage: Starting page.render');

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport,
        };

        this.renderTask = page.render(renderContext);
        try {
            await this.renderTask.promise;
            console.log('[RenderManager] renderPdfPage: page.render resolved');
        } catch (e: any) {
            // Cancelled
            return;
        }

        if (renderId !== this.currentRenderId) return;

        // レンダリング完了後、Bitmapを作成してキャッシュ
        const bitmap = await createImageBitmap(canvas);

        if (this.pageCache.has(key)) {
            this.pageCache.get(key)?.close();
        }

        // キャッシュサイズ制限
        if (this.pageCache.size > 10) {
            const firstKey = this.pageCache.keys().next().value;
            if (firstKey) {
                this.pageCache.get(firstKey)?.close();
                this.pageCache.delete(firstKey);
            }
        }

        this.pageCache.set(key, bitmap);
    }

    private getCacheKey(pageData: PageData): string {
        // ID + Scale + Rotation + Theme
        const rotation = pageData.rotation || 0;
        return `${pageData.id}-${this.previewScale}-${rotation}-${this.isThemeDark}`;
    }

    public redrawWithCachedBackground(selectedAnnotationId?: string | null): void {
        const { state, elements } = this;
        const canvas = elements.previewCanvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const pageData = state.pages[state.selectedPageIndex];
        if (!pageData) return;

        const key = this.getCacheKey(pageData);
        const cachedBitmap = this.pageCache.get(key);

        if (cachedBitmap) {
            // Check canvas size mismatch (Critical for rotation undo)
            if (canvas.width !== cachedBitmap.width || canvas.height !== cachedBitmap.height) {
                canvas.width = cachedBitmap.width;
                canvas.height = cachedBitmap.height;
            }
            ctx.drawImage(cachedBitmap, 0, 0);
        } else {
            // キャッシュがない場合
            ctx.fillStyle = this.isThemeDark ? '#2d2d2d' : '#ffffff';
            // ここでCanvasサイズリセットはできない（pageDataのwidth/height計算が必要だがsyncではないので）
            // 現状のサイズでクリアするしかない
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // 注釈再描画
        this.drawAnnotations(pageData, ctx, selectedAnnotationId);
    }

    private drawAnnotations(pageData: PageData, ctx: CanvasRenderingContext2D, selectedAnnotationId?: string | null): void {
        AnnotationManager.drawAnnotations(
            ctx,
            pageData,
            this.previewScale,
            selectedAnnotationId
        );
    }
}
