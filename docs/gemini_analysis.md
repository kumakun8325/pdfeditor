# PDF Editor - 設計・実装整合性分析レポート

> **分析日時**: 2026-01-14T22:19 JST  
> **分析対象**: `c:\tool\pdfeditor`  
> **目的**: `design.md` と実装コードの整合性を検証し、乖離を特定する

---

## 1. 実装マッピング（設計 → 実装対応表）

### 1.1 Manager Layer

| 設計書記載のManager | 実装ファイル | 実装ステータス | 責務の一致 |
|---------------------|--------------|----------------|------------|
| EventManager | `src/managers/EventManager.ts` (794行) | ✅ 実装済 | ✅ 一致 |
| RenderManager | `src/managers/RenderManager.ts` (375行) | ✅ 実装済 | ✅ 一致 |
| PageManager | `src/managers/PageManager.ts` (181行) | ✅ 実装済 | ✅ 一致 |
| SelectionManager | `src/managers/SelectionManager.ts` (106行) | ✅ 実装済 | ✅ 一致 |
| AnnotationManager | `src/managers/AnnotationManager.ts` (906行) | ✅ 実装済 | ✅ 一致 |
| ToolbarManager | `src/managers/ToolbarManager.ts` (91行) | ✅ 実装済 | ✅ 一致 |
| ContextMenuManager | `src/managers/ContextMenuManager.ts` (125行) | ✅ 実装済 | ✅ 一致 |
| DragDropManager | `src/managers/DragDropManager.ts` (119行) | ✅ 実装済 | ✅ 一致 |
| UndoManager | `src/managers/UndoManager.ts` (74行) | ✅ 実装済 | ✅ 一致 |
| HelpManager | `src/managers/HelpManager.ts` (46行) | ✅ 実装済 | ✅ 一致 |

### 1.2 Service Layer

| 設計書記載のService | 実装ファイル | 実装ステータス | メソッド一致 |
|---------------------|--------------|----------------|--------------|
| PDFService | `src/services/PDFService.ts` (363行) | ✅ 実装済 | ✅ 一致 |
| ImageService | `src/services/ImageService.ts` (140行) | ✅ 実装済 | ✅ 一致 |
| KeyboardService | `src/services/KeyboardService.ts` (85行) | ✅ 実装済 | ✅ 一致 |
| StorageService | `src/services/StorageService.ts` (117行) | ✅ 実装済 | ✅ 一致 |

### 1.3 PDFService メソッドマッピング

| 設計書記載メソッド | 実装状況 | 備考 |
|-------------------|----------|------|
| `loadPDF(file: File): Promise<LoadResult>` | ✅ 実装済 | L22-38 |
| `addPDF(file: File): Promise<void>` | ⚠️ **設計のみ** | PDFEditorApp側に実装あり |
| `extractPages(pdfBytes: Uint8Array): Promise<PageData[]>` | ✅ 実装済 | L40-67 |
| `renderThumbnail(page, scale): Promise<string>` | ✅ 実装済 | L69-88 |
| `renderToCanvas(canvas, pageData): Promise<void>` | ✅ 実装済 | L90-131 |
| `removePageAt(pages, index): PageData[]` | ✅ 実装済 | L215-220 |
| `insertPageAt(pages, page, index): PageData[]` | ✅ 実装済 | L222-233 |
| `reorderPages(pages, from, to): PageData[]` | ✅ 実装済 | L235-247 |
| `exportPageAsImage(page): Promise<Blob>` | ✅ 実装済 | L249-311 |
| `exportAllPagesAsZip(pages): Promise<Blob>` | ✅ 実装済 | L313-326 |
| `splitBinary(data, maxSize): Uint8Array[]` | ✅ 実装済 | L328-345 |
| `splitBinaryAsZip(pdfBytes, baseName, maxSize): Promise<Blob>` | ✅ 実装済 | L347-361 |

### 1.4 ImageService メソッドマッピング

| 設計書記載メソッド | 実装状況 | 備考 |
|-------------------|----------|------|
| `imageToPageData(file, refWidth, refHeight): Promise<PageData>` | ✅ 実装済 | L9-32 |
| `embedImageToPdf(pdfDoc, pageData): Promise<void>` | ✅ 実装済 | L96-138, 戻り値は `Promise<PDFPage>` |

### 1.5 KeyboardService メソッドマッピング

| 設計書記載メソッド | 実装状況 | 備考 |
|-------------------|----------|------|
| `init(): void` | ✅ 実装済 | L12-17 |
| `addShortcut(key, modifiers, callback): void` | ✅ 実装済 | L19-32 |
| `removeShortcut(key, modifiers): void` | ✅ 実装済 | L34-43 |
| `destroy(): void` | ✅ 実装済 | L45-51 |

### 1.6 StorageService メソッドマッピング

| 設計書記載メソッド | 実装状況 | 備考 |
|-------------------|----------|------|
| `saveState(state: AppState): Promise<void>` | ✅ 実装済 | L40-65 |
| `loadState(): Promise<AppState \| null>` | ✅ 実装済 | L67-90 |
| `clearState(): Promise<void>` | ✅ 実装済 | L92-115 |

---

## 2. 型定義の整合性

### 2.1 AppState

| 設計書記載フィールド | 実装型定義 (`src/types/index.ts`) | 一致 |
|---------------------|-----------------------------------|------|
| `pages: PageData[]` | ✅ L82 | ✅ |
| `selectedPageIndex: number` | ✅ L84 | ✅ |
| `selectedPageIndices: number[]` | ✅ L86 | ✅ |
| `isLoading: boolean` | ✅ L88 | ✅ |
| `isDarkMode: boolean` | ✅ L90 | ✅ |
| `originalPdfBytes: Uint8Array \| null` | ✅ L92 | ✅ |

### 2.2 PageData

| 設計書記載フィールド | 実装 | 一致 |
|---------------------|------|------|
| `id: string` | ✅ L48 | ✅ |
| `type: 'pdf' \| 'image'` | ✅ L50 | ✅ |
| `pdfBytes?: Uint8Array` | ✅ L52 | ✅ |
| `imageBytes?: Uint8Array` | ✅ L54 | ✅ |
| `thumbnail: string` | ✅ L56 | ✅ |
| `fullImage?: string` | ✅ L58 | ✅ |
| `width: number` | ✅ L60 | ✅ |
| `height: number` | ✅ L62 | ✅ |
| `rotation?: number` | ✅ L70 | ✅ |
| `textAnnotations?: TextAnnotation[]` | ✅ L72 | ✅ |
| `highlightAnnotations?: HighlightAnnotation[]` | ✅ L74 | ✅ |
| `originalWidth?: number` | ✅ L64 | ✅ |
| `originalHeight?: number` | ✅ L66 | ✅ |
| `originalPageIndex?: number` | ✅ L68 | ✅ |

### 2.3 UndoAction（18種類）

| 設計書記載 | 実装 | 一致 |
|-----------|------|------|
| `deletePage` | ✅ L123 | ✅ |
| `movePage` | ✅ L124 | ✅ |
| `rotatePage` | ✅ L125 | ✅ |
| `clear` | ✅ L126 | ✅ |
| `duplicatePage` | ✅ L130 | ✅ |
| `addText` | ✅ L127 | ✅ |
| `addHighlight` | ✅ L128 | ✅ |
| `deleteText` | ✅ L134 | ✅ |
| `deleteHighlight` | ✅ L135 | ✅ |
| `moveText` | ✅ L131 | ✅ |
| `moveHighlight` | ✅ L133 | ✅ |
| `rotateText` | ✅ L132 | ✅ |
| `updateText` | ✅ L136 | ✅ |
| `resizeHighlight` | ✅ L137 | ✅ |
| `addImage` | ✅ L129 | ✅ |
| `batchMove` | ✅ L139 | ✅ |
| `batchRotate` | ✅ L140 | ✅ |
| `batchDuplicate` | ✅ L141 | ✅ |
| `batchDelete` | ✅ L142 | ✅ |

---

## 3. 矛盾点・乖離レポート

### 3.1 設計書にあるが未実装、または乖離がある項目

| カテゴリ | 項目 | 詳細 | 重要度 |
|----------|------|------|--------|
| **PDFService** | `addPDF(file: File): Promise<void>` | 設計書には記載あるが、`PDFService`クラス内には実装なし。`PDFEditorApp.addPDF()` (main.ts L570-598) に実装されている。責務の不整合。 | 🟡 中 |
| **ImageService** | `embedImageToPdf` 戻り値 | 設計書: `Promise<void>` / 実装: `Promise<PDFPage>` | 🟢 低 |

### 3.2 実装されているが設計書に記載がない機能

| カテゴリ | 実装箇所 | 説明 | 対応推奨 |
|----------|----------|------|----------|
| **RenderManager** | `calculateFitScale()` | ビューポートに合わせた最適スケール計算 | 設計書への追記推奨 |
| **RenderManager** | `clearCache()` | ページキャッシュのクリア | 設計書への追記推奨 |
| **RenderManager** | `getCacheKey()` | キャッシュキー生成 | 設計書への追記推奨 |
| **RenderManager** | `redrawWithCachedBackground()` | キャッシュを使った再描画 | 設計書への追記推奨 |
| **RenderManager** | `renderImagePage()` / `renderPdfPage()` | タイプ別レンダリング | 設計書への追記推奨 |
| **PDFService** | `drawImageFitToCanvas()` | 画像のセンタリング描画 | 設計書への追記推奨 |
| **PDFService** | `renderImageToCanvas()` | 画像ページのCanvas描画 | 設計書への追記推奨 |
| **EventManager** | モバイル対応メソッド群 | `setupMobileSidebar()`, `setupSidebarSwipe()`, `setupTouchEvents()`, `setupTouchPanning()`, `getTouchDistance()`, `getTouchCenter()` | 設計書への追記推奨 |
| **PageManager** | `movePages()` | 複数ページの一括移動 | 設計書への追記推奨 |
| **PageManager** | `restoreSelectionAfterDelete()` | 削除後の選択状態復元 | 設計書への追記推奨 |
| **SelectionManager** | 全メソッド | `select()`, `selectRange()`, `selectAll()`, `clear()`, `isSelected()` の詳細仕様が未記載 | 設計書への追記推奨 |
| **AnnotationManager** | 座標変換・描画メソッド群 | `toPdfPoint()`, `toCanvasPoint()`, `getTextMetrics()`, `drawAnnotations()`, `drawHighlight()`, `drawText()`, `drawHandle()`, `hitTestText()`, `hitTestTextHandle()`, `hitTestTextRotationHandle()`, `hitTestHighlight()`, `hitTestHighlightHandle()` | 設計書への追記推奨 |
| **型定義** | `UIElements` | UI要素の詳細型定義（モバイル対応含む） | 設計書への追記推奨 |
| **型定義** | `AppAction` | アプリケーションアクションインターフェース | 設計書への追記推奨 |
| **型定義** | `MenuItem` | コンテキストメニュー項目型 | 設計書への追記推奨 |

### 3.3 要件定義との対応状況

| 要件ID | 要件内容 | 実装状況 | 備考 |
|--------|----------|----------|------|
| F-016 | ページの貼り付け (`Ctrl+V`) | ⚠️ 注釈のみ対応 | ページ自体のコピペは未実装（要件書に「任意（未実装）」と記載） |
| F-013 | 削除前確認ダイアログ | ⚠️ 未実装 | 要件書で「任意」 |
| F-050 | セッション自動保存 | ✅ 実装済 | `StorageService` + `scheduleAutoSave()` |
| F-051 | セッション復元 | ✅ 実装済 | `restoreSession()` |

---

## 4. 設計書更新のための推奨事項

### 4.1 追記が必要な新規セクション

1. **モバイル対応 (Section 12)**
   - タッチイベント処理
   - ピンチズーム
   - サイドバースワイプ
   - モバイルメニュー

2. **ページキャッシュ機構 (Section 4.5)**
   - `RenderManager.pageCache`
   - キャッシュキー生成ロジック
   - キャッシュ無効化タイミング

3. **SelectionManager詳細設計 (Section 4.6)**
   - 単一選択/複数選択/範囲選択のロジック
   - 選択状態の復元

4. **AnnotationManager詳細設計 (Section 4.7)**
   - 座標変換ロジック（Canvas ↔ PDF座標系）
   - ヒット判定アルゴリズム
   - 回転時の座標補正

### 4.2 修正が必要な既存セクション

1. **Section 4.1 PDFService**
   - `addPDF()` は `PDFEditorApp` に実装されている旨を記載
   - `drawImageFitToCanvas()`, `renderImageToCanvas()` を追加

2. **Section 4.2 ImageService**
   - `embedImageToPdf()` の戻り値を `Promise<PDFPage>` に修正

---

## 5. サマリー

| 項目 | 数値 |
|------|------|
| 設計書記載Manager数 | 10 |
| 実装済Manager数 | **10** (100%) |
| 設計書記載Service数 | 4 |
| 実装済Service数 | **4** (100%) |
| 設計書記載UndoAction種類 | 18 |
| 実装済UndoAction種類 | **18** (100%) |
| 設計書との乖離項目（中〜高重要度） | **1** |
| 設計書に未記載の実装機能 | **約25項目** |

### 結論

設計書 (`design.md`) と実装コードは**高い整合性**を保っています。主要なアーキテクチャ（Manager Pattern）、クラス構成、型定義はほぼ完全に一致しています。

ただし、以下の更新を推奨します：

1. **モバイル対応機能**の設計書への追記（実装は完了済み）
2. **ページキャッシュ機構**の詳細設計追記
3. **SelectionManager / AnnotationManager**のメソッド詳細追記
4. **PDFService.addPDF()**の責務整理（PDFEditorAppに実装されている点の明記）
