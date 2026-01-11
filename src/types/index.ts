/**
 * PDF Editor Type Definitions
 */

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
    /** ページ幅 (pt) */
    width: number;
    /** ページ高さ (pt) */
    height: number;
    /** 元PDFのページインデックス（PDF由来の場合） */
    originalPageIndex?: number;
}

/**
 * アプリケーション状態
 */
export interface AppState {
    /** ページ情報一覧 */
    pages: PageData[];
    /** 選択中のページインデックス */
    selectedPageIndex: number;
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
export type ToastType = 'success' | 'warning' | 'error';

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
