# PDF Editor - 設計書

## 1. アーキテクチャ概要

本アプリケーションは **Manager Pattern** を採用し、各機能領域を専用のManagerクラスに委譲しています。

```mermaid
graph TB
    subgraph UI Layer
        A[index.html] --> B[PDFEditorApp]
        B --> C[Sidebar/サムネイル一覧]
        B --> D[MainView/プレビュー]
        B --> E[Toolbar]
    end

    subgraph Manager Layer
        M1[EventManager]
        M2[RenderManager]
        M3[PageManager]
        M4[SelectionManager]
        M5[AnnotationManager]
        M6[ToolbarManager]
        M7[ContextMenuManager]
        M8[DragDropManager]
        M9[UndoManager]
        M10[HelpManager]
    end

    subgraph Service Layer
        F[PDFService]
        G[ImageService]
        H[KeyboardService]
        K[StorageService]
    end

    subgraph External Libraries
        I[pdfjs-dist]
        J[pdf-lib]
    end

    B --> M1
    B --> M2
    B --> M3
    B --> M9
    M1 --> H
    M2 --> F
    M3 --> F
    F --> I
    F --> J
    G --> J
    K --> L[IndexedDB]
```

### Manager責務一覧

| Manager | 責務 |
|---------|------|
| EventManager | イベント統括、キーボード/マウスイベント、ドロップダウン管理 |
| RenderManager | Canvas描画、ズーム制御、ページキャッシュ |
| PageManager | ページ操作（削除、回転、複製、並べ替え） |
| SelectionManager | 複数ページ選択、範囲選択 |
| AnnotationManager | 注釈の描画、ヒット判定、座標変換 |
| ToolbarManager | ツールバーUI状態管理 |
| ContextMenuManager | 右クリックメニュー |
| DragDropManager | ファイル/ページのドラッグ&ドロップ |
| UndoManager | Undo/Redoスタック管理 |
| HelpManager | ヘルプモーダル |

---

## 2. ディレクトリ構成

```
pdfeditor/
├── .claude/
│   └── commands/            # カスタムスラッシュコマンド
│       └── finish.md
├── docs/
│   ├── requirements.md      # 要件定義書
│   ├── design.md            # 設計書（本ファイル）
│   ├── tasks.md             # タスク一覧
│   ├── SESSION_LOG.md       # セッションログ
│   └── walkthrough.md       # ウォークスルー
├── src/
│   ├── main.ts              # アプリケーションエントリー（PDFEditorApp）
│   ├── styles/
│   │   └── index.css        # 全スタイル統合
│   ├── managers/            # 機能別Managerクラス
│   │   ├── EventManager.ts
│   │   ├── RenderManager.ts
│   │   ├── PageManager.ts
│   │   ├── SelectionManager.ts
│   │   ├── AnnotationManager.ts
│   │   ├── ToolbarManager.ts
│   │   ├── ContextMenuManager.ts
│   │   ├── DragDropManager.ts
│   │   ├── UndoManager.ts
│   │   └── HelpManager.ts
│   ├── services/
│   │   ├── PDFService.ts    # PDF操作サービス
│   │   ├── ImageService.ts  # 画像処理サービス
│   │   ├── KeyboardService.ts # キーボードショートカット
│   │   └── StorageService.ts  # セッション保存（IndexedDB）
│   ├── types/
│   │   └── index.ts         # 型定義
│   ├── ui/
│   │   └── icons.ts         # SVGアイコン定義
│   └── utils/
│       └── uuid.ts          # UUID生成
├── index.html               # エントリーポイントHTML
├── package.json
├── tsconfig.json
├── vite.config.ts
├── CLAUDE.md                # Claude Code用ガイド
└── README.md
```

---

## 3. 状態管理

### 3.1 アプリケーション状態

```typescript
interface AppState {
    pages: PageData[];                    // ページ情報一覧
    selectedPageIndex: number;            // 選択中のページインデックス
    selectedPageIndices: number[];        // 複数選択中のページインデックス
    isLoading: boolean;                   // ローディング状態
    isDarkMode: boolean;                  // ダークモード状態
    originalPdfBytes: Uint8Array | null;  // 元PDFのバイトデータ
}
```

### 3.2 ページデータ

```typescript
interface PageData {
    id: string;                  // 一意のID
    type: 'pdf' | 'image';       // ページタイプ
    pdfBytes?: Uint8Array;       // PDF元データ
    imageBytes?: Uint8Array;     // 画像元データ
    thumbnail: string;           // サムネイル画像 (data URL)
    fullImage?: string;          // フルサイズ画像 (data URL, 画像ページ用)
    width: number;               // ページ幅 (pt)
    height: number;              // ページ高さ (pt)
    rotation?: number;           // 回転角度 (0, 90, 180, 270)
    textAnnotations?: TextAnnotation[];        // テキスト注釈
    highlightAnnotations?: HighlightAnnotation[]; // ハイライト注釈
    originalWidth?: number;      // 元画像幅 (px)
    originalHeight?: number;     // 元画像高さ (px)
    originalPageIndex?: number;  // PDF由来のページインデックス
}
```

### 3.3 注釈・操作ログ

```typescript
interface TextAnnotation {
    id: string;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    color: string;
    rotation?: number;  // 回転角度（度、時計回り）
}

interface HighlightAnnotation {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
}

// Undo操作の型定義（18種類）
type UndoAction =
    // 単一ページ操作
    | { type: 'deletePage'; page: PageData; index: number }
    | { type: 'movePage'; fromIndex: number; toIndex: number }
    | { type: 'rotatePage'; pageId: string; previousRotation: number; newRotation?: number }
    | { type: 'clear'; pages: PageData[]; selectedIndex: number }
    | { type: 'duplicatePage'; pageId: string; index: number; page?: PageData }
    // 注釈操作
    | { type: 'addText'; pageId: string; annotationId: string; annotation?: TextAnnotation }
    | { type: 'addHighlight'; pageId: string; annotationId: string; annotation?: HighlightAnnotation }
    | { type: 'deleteText'; pageId: string; annotationId: string; annotation: TextAnnotation }
    | { type: 'deleteHighlight'; pageId: string; annotationId: string; annotation: HighlightAnnotation }
    | { type: 'moveText'; pageId: string; annotationId: string; fromX: number; fromY: number; toX: number; toY: number }
    | { type: 'moveHighlight'; pageId: string; annotationId: string; fromX: number; fromY: number; toX: number; toY: number }
    | { type: 'rotateText'; pageId: string; annotationId: string; oldRotation: number; newRotation: number }
    | { type: 'updateText'; pageId: string; annotationId: string; oldText: string; newText: string; oldColor: string; newColor: string; oldFontSize: number; newFontSize: number }
    | { type: 'resizeHighlight'; pageId: string; annotationId: string; oldWidth: number; newWidth: number; oldHeight: number; newHeight: number }
    // 画像操作
    | { type: 'addImage'; pageId: string; index: number; page?: PageData }
    // バッチ操作
    | { type: 'batchMove'; fromIndices: number[]; toIndex: number; movedPageIds: string[] }
    | { type: 'batchRotate'; pageIds: string[]; previousRotations: number[] }
    | { type: 'batchDuplicate'; addedPages: { page: PageData; index: number }[] }
    | { type: 'batchDelete'; deletedPages: { page: PageData; index: number }[] };

```

---

## 4. サービス設計

### 4.1 PDFService

```typescript
class PDFService {
    // PDF読み込み（新規）
    async loadPDF(file: File): Promise<LoadResult>;

    // PDF追加（結合用 - 既存ページの末尾に追加）
    async addPDF(file: File): Promise<void>;
    
    // PDFからページ抽出（ArrayBufferコピー対策済み）
    async extractPages(pdfBytes: Uint8Array): Promise<PageData[]>;
    
    // サムネイル生成
    async renderThumbnail(page: PDFPageProxy, scale: number): Promise<string>;
    
    // ページをCanvasにレンダリング
    async renderToCanvas(canvas: HTMLCanvasElement, pageData: PageData): Promise<void>;
    
    // ページ削除
    removePageAt(pages: PageData[], index: number): PageData[];
    
    // ページ挿入
    insertPageAt(pages: PageData[], page: PageData, index: number): PageData[];
    
    // ページ並べ替え
    reorderPages(pages: PageData[], fromIndex: number, toIndex: number): PageData[];

    // 画像エクスポート（単一ページ）
    async exportPageAsImage(page: PageData): Promise<Blob>;

    // 一括エクスポート（ZIP）
    async exportAllPagesAsZip(pages: PageData[]): Promise<Blob>;

    // バイナリ分割
    splitBinary(data: Uint8Array, maxSize?: number): Uint8Array[];

    // バイナリ分割してZIPでダウンロード（catコマンドで結合可能）
    async splitBinaryAsZip(pdfBytes: Uint8Array, baseName: string, maxSize?: number): Promise<Blob>;
}
```

### 4.2 ImageService

```typescript
class ImageService {
    // 画像をPageDataに変換（ページサイズにフィット）
    async imageToPageData(
        file: File,
        referenceWidth: number,
        referenceHeight: number
    ): Promise<PageData>;
    
    // 画像をPDFページとして埋め込む
    async embedImageToPdf(pdfDoc: PDFDocument, pageData: PageData): Promise<void>;
}
```

### 4.3 KeyboardService

```typescript
class KeyboardService {
    // キーボードイベントリスナー登録
    init(): void;

    // ショートカット追加
    addShortcut(key: string, modifiers: ('ctrl' | 'meta' | 'shift' | 'alt')[], callback: () => void): void;

    // ショートカット削除
    removeShortcut(key: string, modifiers: ('ctrl' | 'meta' | 'shift' | 'alt')[]): void;

    // クリーンアップ
    destroy(): void;
}
```

### 4.4 StorageService

```typescript
class StorageService {
    // セッション状態の保存（IndexedDB）
    async saveState(state: AppState): Promise<void>;

    // セッション状態の復元
    async loadState(): Promise<AppState | null>;

    // セッションのクリア
    async clearState(): Promise<void>;
}
```

---

## 5. UI設計

### 5.1 レイアウト

```
+------------------------------------------------------------------+
|  [開く] [保存] [分割] [画像] [上へ] [下へ] [画像] [全保存]  [🌙 Theme]  |  ← Toolbar
+------------------+-----------------------------------------------+
|                  |                                               |
|  +-----------+   |   [ファイルを開く]                            |
|  | Page 1    |   |                                               |
|  +-----------+   |   またはファイルをドロップ                      |
|  | Page 2    |   |                                               |
|  +-----------+   |             (Empty State)                     |
|     (選択中)      |                                               |
|  +-----------+   |                                               |
|  | Page 3    |   |                                               |
|  +-----------+   |                                               |
|                  |                                               |
|  [ドロップゾーン]  |                                               |
|                  |                                               |
+------------------+-----------------------------------------------+
      Sidebar (180px)                    MainView (flex: 1)
```

### 5.2 カラースキーム

```css
/* ライトモード */
:root {
    --bg-primary: #ffffff;
    --bg-secondary: #f5f5f7;
    --bg-tertiary: #e8e8ed;
    --text-primary: #1d1d1f;
    --text-secondary: #6e6e73;
    --accent: #007aff;
    --border: #d2d2d7;
}

/* ダークモード */
:root.dark {
    --bg-primary: #1c1c1e;
    --bg-secondary: #2c2c2e;
    --bg-tertiary: #3a3a3c;
    --text-primary: #f5f5f7;
    --text-secondary: #98989d;
    --accent: #0a84ff;
    --border: #38383a;
}
```

---

## 6. キーボードショートカット

| ショートカット | 動作 | プラットフォーム |
|----------------|------|------------------|
| `Ctrl + O` | PDFを開く | Windows |
| `Cmd + O` | PDFを開く | Mac |
| `Ctrl + S` | PDFを保存 | Windows |
| `Cmd + S` | PDFを保存 | Mac |
| `Ctrl + D` | 選択ページ削除 | Windows |
| `Cmd + D` | 選択ページ削除 | Mac |
| `Ctrl + Z` | Undo | Windows |
| `Cmd + Z` | Undo | Mac |
| `Ctrl + Y` | Redo | Windows |
| `Cmd + Shift + Z` | Redo | Mac |
| `Ctrl + A` | 全ページ選択 | Windows |
| `Cmd + A` | 全ページ選択 | Mac |
| `Ctrl + C` | コピー（注釈） | Windows |
| `Cmd + C` | コピー（注釈） | Mac |
| `Ctrl + V` | 貼り付け（注釈） | Windows |
| `Cmd + V` | 貼り付け（注釈） | Mac |
| `Ctrl + +` | ズームイン | Windows |
| `Cmd + +` | ズームイン | Mac |
| `Ctrl + -` | ズームアウト | Windows |
| `Cmd + -` | ズームアウト | Mac |
| `Ctrl + 0` | ズームリセット | Windows |
| `Cmd + 0` | ズームリセット | Mac |
| `Delete` / `Backspace` | 選択した注釈を削除 | 共通 |
| `Space + ドラッグ` | パン（移動） | 共通 |
| `↑` | 前のページを選択 | 共通 |
| `↓` | 次のページを選択 | 共通 |

---

## 7. 処理フロー

### 7.1 PDF読み込みフロー

```mermaid
sequenceDiagram
    participant User
    participant App
    participant PDFService
    participant pdfjs

    User->>App: PDFファイルを選択/ドロップ
    App->>App: ローディング表示
    App->>PDFService: loadPDF(file)
    PDFService->>PDFService: ArrayBuffer取得
    PDFService->>pdfjs: getDocument(pdfBytes.slice())
    pdfjs-->>PDFService: PDF Document
    loop 各ページ
        PDFService->>pdfjs: getPage(i)
        PDFService->>PDFService: renderThumbnail()
        PDFService->>PDFService: PageData作成（pdfBytesコピー）
    end
    PDFService-->>App: PageData[]
    App->>App: state更新・UI更新
```

### 7.2 画像挿入フロー

```mermaid
sequenceDiagram
    participant User
    participant App
    participant ImageService

    User->>App: 画像をドラッグ＆ドロップ
    App->>ImageService: imageToPageData(file, refWidth, refHeight)
    ImageService->>ImageService: processImage()
    ImageService->>ImageService: サムネイル生成
    ImageService->>ImageService: フルサイズ画像生成
    ImageService-->>App: PageData
    App->>App: 指定位置に挿入
    App->>App: UI更新
```

---

## 8. エラーハンドリング

| エラー種別 | 対応 |
|------------|------|
| 非対応ファイル形式 | トースト通知で警告表示 |
| PDF読み込み失敗 | エラーメッセージ表示 |
| 画像処理失敗 | エラーメッセージ表示 |
| ArrayBuffer detachment | 事前にslice()でコピー |

---

## 9. 外部依存関係

```json
{
    "dependencies": {
        "pdf-lib": "^1.17.1",
        "pdfjs-dist": "^4.10.38"
    },
    "devDependencies": {
        "typescript": "~5.6.2",
        "vite": "^6.0.5"
    }
}
```

---

## 10. 既知の制約・注意点

- **ArrayBuffer detachment**: pdfjs-distはWorkerにArrayBufferを転送するとdetachされるため、事前にslice()でコピーが必要
- **暗号化PDF**: 非対応
- **大容量ファイル**: 100MB以上のPDFはパフォーマンス保証外

---

## 11. バイナリ分割機能

メール添付の容量制限（10MB）に対応するための機能。

### 11.1 処理フロー

```mermaid
flowchart LR
    A[PDF 25MB] --> B[分割ボタン]
    B --> C[document.pdf.001 - 10MB]
    B --> D[document.pdf.002 - 10MB]
    B --> E[document.pdf.003 - 5MB]
    C --> F[ZIPダウンロード]
    D --> F
    E --> F
```

### 11.2 受信側での結合方法

**Linux/Mac:**
```bash
cat document.pdf.* > document.pdf
```

**Windows (コマンドプロンプト):**
```cmd
copy /b document.pdf.001+document.pdf.002+document.pdf.003 document.pdf
```

**Windows (PowerShell):**
```powershell
Get-Content document.pdf.* -Encoding Byte -ReadCount 0 | Set-Content document.pdf -Encoding Byte
```
