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

        // ズーム変更時はキャッシュ無効化？
        // いや、キーにスケールを含めるので自動的に別キーになる。
        // メモリ節約のために古いスケールのキャッシュを消す戦略もありだが、
        // 頻繁なズームイン・アウトで再利用したいので保持する。（メモリ圧迫時はクリア検討）
    }

    public getZoom(): number {
        return this.previewScale;
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
        const { state, elements } = this;
        const canvas = elements.previewCanvas;
        const ctx = canvas.getContext('2d');

        if (!ctx || state.selectedPageIndex < 0 || !state.pages[state.selectedPageIndex]) {
            // クリアまたはエンプティ表示
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            elements.pagePreview.classList.add('hidden');
            elements.pagePreview.style.display = ''; // Clear inline if any
            elements.emptyState.classList.remove('hidden');
            elements.emptyState.style.display = 'flex'; // Restore flex for centering
            return;
        }

        elements.pagePreview.classList.remove('hidden');
        elements.pagePreview.style.display = ''; // Clear inline (let css handle it, or set block if needed)
        elements.emptyState.classList.add('hidden');
        elements.emptyState.style.display = ''; // Clear inline (let hidden class handle it)

        // 前のレンダリングをキャンセル
        if (this.renderTask) {
            this.renderTask.cancel();
            this.renderTask = null;
        }

        const pageData = state.pages[state.selectedPageIndex];

        try {
            if (pageData.imageBytes || pageData.fullImage) {
                await this.renderImagePage(pageData, ctx, canvas);
            } else {
                await this.renderPdfPage(pageData, ctx, canvas);
            }

            // ImageDataの代わりにBitmapを使うため、getImageDataは不要だが
            // 互換性のため、あるいはBitmap生成失敗時のフォールバックとして取得してもよい
            // 今回はパフォーマンス重視でgetImageDataは省略し、
            // redrawWithCachedBackground では key からキャッシュを取得する方式に変える

            // 注釈を描画
            this.drawAnnotations(pageData, ctx);

        } catch (error: any) {
            if (error.name !== 'RenderingCancelledException') {
                console.error('Page render error:', error);
            }
        }
    }

    private async renderImagePage(pageData: PageData, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): Promise<void> {
        // 画像ページ
        const img = new Image();
        img.src = pageData.fullImage || pageData.thumbnail; // fullImage推奨
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        // 回転を考慮したサイズ計算
        const rotation = pageData.rotation || 0;
        const isRotated = rotation % 180 !== 0;

        // 表示サイズ
        const displayWidth = pageData.width * this.previewScale;
        const displayHeight = pageData.height * this.previewScale;

        // Canvasサイズ設定
        canvas.width = displayWidth;
        canvas.height = displayHeight;

        // 背景塗りつぶし (ダークモード対応)
        ctx.fillStyle = this.isThemeDark ? '#2d2d2d' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        // 回転処理
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);

        // 描画
        if (isRotated) {
            ctx.drawImage(img, -displayHeight / 2, -displayWidth / 2, displayHeight, displayWidth);
        } else {
            ctx.drawImage(img, -displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
        }
        ctx.restore();

        // Bitmapとしてキャッシュに保存
        const bitmap = await createImageBitmap(canvas);
        const key = this.getCacheKey(pageData);
        if (this.pageCache.has(key)) {
            this.pageCache.get(key)?.close();
        }
        this.pageCache.set(key, bitmap);
    }

    private async renderPdfPage(pageData: PageData, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): Promise<void> {
        if (!this.state.originalPdfBytes) return;

        const key = this.getCacheKey(pageData);

        // 1. キャッシュチェック
        if (this.pageCache.has(key)) {
            // キャッシュヒット
            const bitmap = this.pageCache.get(key)!;
            // Canvasサイズを合わせる
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
            }
            ctx.drawImage(bitmap, 0, 0);
            return;
        }

        // 2. キャッシュミス - レンダリング実行

        // オフスクリーンCanvasを作成してレンダリング
        // (メインCanvasを直接使うと、途中経過が見えたり、クリア処理でちらつく可能性があるため)
        // ただし、pdf.jsのrenderは直接Canvasに描くのが普通。
        // ここではメインCanvasに描画 -> その後Bitmap生成の流れにする。

        const loadingTask = pdfjsLib.getDocument({
            data: this.state.originalPdfBytes.slice(0),
            cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true,
        });

        const pdfDoc = await loadingTask.promise;

        if (pageData.originalPageIndex === undefined) return;

        const page = await pdfDoc.getPage(pageData.originalPageIndex + 1); // 1-based

        const rotation = (pageData.rotation || 0) + page.rotate;
        const viewport = page.getViewport({ scale: this.previewScale, rotation });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // 背景クリア
        ctx.fillStyle = this.isThemeDark ? '#2d2d2d' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport,
        };

        this.renderTask = page.render(renderContext);
        await this.renderTask.promise;

        // レンダリング完了後、Bitmapを作成してキャッシュ
        // Note: createImageBitmap は非同期
        const bitmap = await createImageBitmap(canvas);

        // メモリリーク防止: 古い同一キーがあれば消す（上書きsetで自動だがcloseは必要）
        if (this.pageCache.has(key)) {
            this.pageCache.get(key)?.close();
        }

        // キャッシュサイズ制限（簡易LRU - Insert順）
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
        // ID + Scale + Rotation + Theme(背景色が変わるため)
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
            // 高速再描画：Bitmapを転送 (GPU -> GPU)
            // Canvasサイズチェックは省略（renderPageで合わされているはず）
            ctx.drawImage(cachedBitmap, 0, 0);
        } else {
            // キャッシュがない場合（通常ありえないが）
            // fallback: 背景クリアだけして注釈描画？ あるいは再レンダリング要求？
            // ここでは真っ白＋注釈よりは、何もしないほうがマシか、あるいはとりあえずクリア
            // もしキャッシュがないなら renderPdfPage を呼ぶべきだが、同期メソッドなので呼べない。
            // しかたなく背景色でクリア
            ctx.fillStyle = this.isThemeDark ? '#2d2d2d' : '#ffffff';
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
