/**
 * PDF Editor Type Definitions
 */

/**
 * テキスト注釈
 */
export interface TextAnnotation {
    /** 一意のID */
    id: string;
    /** テキスト内容 */
    text: string;
    /** X座標 (ページ座標系, pt) */
    x: number;
    /** Y座標 (ページ座標系, pt) */
    y: number;
    /** フォントサイズ (pt) */
    fontSize: number;
    /** 色 (hex) */
    color: string;
}

/**
 * ハイライト注釈
 */
export interface HighlightAnnotation {
    /** 一意のID */
    id: string;
    /** 開始X座標 (ページ座標系, pt) */
    x: number;
    /** 開始Y座標 (ページ座標系, pt) */
    y: number;
    /** 幅 (pt) */
    width: number;
    /** 高さ (pt) */
    height: number;
    /** 色 (hex) */
    color: string;
}

/**
 * ページデータ
 */
export interface PageData {
    /** 一意のID */
    id: string;
    /** ページタイプ */
    type: 'pdf' | 'image';
    /** 元データ（PDF用） */
    pdfBytes?: Uint8Array;
    /** 元データ（画像用） */
    imageBytes?: Uint8Array;
    /** サムネイル画像URL (data URL) */
    thumbnail: string;
    /** フルサイズ画像URL (data URL, 画像ページ用) */
    fullImage?: string;
    /** ページ幅 (pt) */
    width: number;
    /** ページ高さ (pt) */
    height: number;
    /** 元画像の幅 (px, 画像ページ用) */
    originalWidth?: number;
    /** 元画像の高さ (px, 画像ページ用) */
    originalHeight?: number;
    /** 元PDFのページインデックス（PDF由来の場合） */
    originalPageIndex?: number;
    /** 回転角度 (0, 90, 180, 270) */
    rotation?: number;
    /** テキスト注釈 */
    textAnnotations?: TextAnnotation[];
    /** ハイライト注釈 */
    highlightAnnotations?: HighlightAnnotation[];
}

/**
 * アプリケーション状態
 */
export interface AppState {
    /** ページ情報一覧 */
    pages: PageData[];
    /** 選択中のページインデックス（メインビュー表示用） */
    selectedPageIndex: number;
    /** 複数選択中のページインデックス */
    selectedPageIndices: number[];
    /** ローディング状態 */
    isLoading: boolean;
    /** ダークモード状態 */
    isDarkMode: boolean;
    /** 元PDFのバイトデータ */
    originalPdfBytes: Uint8Array | null;
}

/**
 * トースト通知の種類
 */
export type ToastType = 'success' | 'warning' | 'error' | 'info';

/**
 * イベントハンドラーの型
 */
export interface EventHandlers {
    onPageSelect: (index: number) => void;
    onPageDelete: (index: number) => void;
    onFileDrop: (files: FileList, insertIndex?: number) => void;
    onPageReorder: (fromIndex: number, toIndex: number) => void;
}

/**
 * ファイル読み込み結果
 */
export interface LoadResult {
    success: boolean;
    pages?: PageData[];
    error?: string;
}

/**
 * Undo操作の型
 */
export type UndoAction =
    | { type: 'deletePage'; page: PageData; index: number }
    | { type: 'movePage'; fromIndex: number; toIndex: number }
    | { type: 'rotatePage'; pageId: string; previousRotation: number; newRotation?: number }
    | { type: 'clear'; pages: PageData[]; selectedIndex: number }
    | { type: 'addText'; pageId: string; annotationId: string; annotation?: TextAnnotation }
    | { type: 'addHighlight'; pageId: string; annotationId: string; annotation?: HighlightAnnotation }
    | { type: 'addImage'; pageId: string; index: number; page?: PageData }
    | { type: 'duplicatePage'; pageId: string; index: number; page?: PageData }
    | { type: 'moveText'; pageId: string; annotationId: string; fromX: number; fromY: number; toX: number; toY: number }
    | { type: 'moveHighlight'; pageId: string; annotationId: string; fromX: number; fromY: number; toX: number; toY: number }
    | { type: 'deleteText'; pageId: string; annotationId: string; annotation: TextAnnotation }
    | { type: 'deleteHighlight'; pageId: string; annotationId: string; annotation: HighlightAnnotation }
    | { type: 'updateText'; pageId: string; annotationId: string; oldText: string; newText: string; oldColor: string; newColor: string; oldFontSize: number; newFontSize: number }
    // バッチ操作
    | { type: 'batchMove'; fromIndices: number[]; toIndex: number; movedPageIds: string[] }
    | { type: 'batchRotate'; pageIds: string[]; previousRotations: number[] }
    | { type: 'batchDuplicate'; addedPages: { page: PageData; index: number }[] }
    | { type: 'batchDelete'; deletedPages: { page: PageData; index: number }[] };

/**
 * コンテキストメニュー項目
 */
export interface MenuItem {
    label: string;
    action?: () => void;
    icon?: string; // アイコン（オプション） - SVG文字列またはクラス名
    disabled?: boolean;
    divider?: boolean; // 区切り線かどうか
    danger?: boolean; // 削除などの危険な操作用
}
