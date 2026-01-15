# main.ts リファクタリング計画

## 概要

`src/main.ts` は現在 **2,493行、約93,000文字** と巨大化しており、保守性・可読性が低下している。
本計画では、main.ts のトークン数を **15,000以下** に抑えるため、機能ごとに新規 Manager へ分離する。

### 現状分析

| 項目 | 数値 |
|------|------|
| 総行数 | 2,493 行 |
| 総文字数 | 約 93,000 文字 |
| メソッド数 | 68 個 |
| 推定トークン数 | 約 25,000〜30,000 |

### 目標

- main.ts を **約 600〜800 行** に削減（推定トークン数 12,000〜15,000）
- PDFEditorApp クラスは **オーケストレーション層** として各 Manager を呼び出すのみ
- 各ドメインの詳細ロジックは専用 Manager に移譲

---

## 既存 Manager 構成

現在 `src/managers/` に以下の Manager が存在:

| Manager | 責務 | サイズ |
|---------|------|--------|
| `AnnotationManager` | 注釈のヒット判定・描画計算 | 35KB |
| `ContextMenuManager` | 右クリックメニュー | 4KB |
| `DragDropManager` | サムネイルのドラッグ&ドロップ | 4KB |
| `EventManager` | イベントバインディング | 31KB |
| `HelpManager` | ヘルプモーダル | 1KB |
| `PageManager` | ページ操作（移動・回転・複製・削除） | 8KB |
| `RenderManager` | Canvas描画・ズーム管理 | 14KB |
| `SelectionManager` | ページ選択管理 | 4KB |
| `ToolbarManager` | ツールバードロップダウン | 4KB |
| `UndoManager` | Undo/Redo スタック管理（スタック操作のみ） | 2KB |

---

## 新規 Manager の提案

### 1. `UndoExecutionManager` (新規作成)

**移行対象**: `undo()` と `redo()` メソッド（1537〜2119行、約 **580行**）

```
現在の場所: main.ts L1537-2119
推定削減: 約 580 行
```

**責務**:
- Undo/Redo アクションの実行ロジック
- 各アクションタイプ（deletePage, movePage, rotatePage, addText, etc.）の復元処理
- 既存 `UndoManager` と連携（スタック管理は UndoManager、実行は UndoExecutionManager）

**移行するメソッド**:
- `undo(): void`
- `redo(): void`

---

### 2. `CanvasInteractionManager` (新規作成)

**移行対象**: Canvas マウスイベント処理（965〜1529行、約 **565行**）

```
現在の場所: main.ts L965-1529
推定削減: 約 565 行
```

**責務**:
- `onCanvasMouseDown` のヒット判定・ドラッグ開始
- `onCanvasMouseMove` の座標追跡・リサイズ・回転処理
- `onCanvasMouseUp` のドラッグ終了・ハイライト確定
- `onCanvasMouseLeave` の状態リセット
- `onCanvasDoubleClick` のテキスト編集開始
- `commitAnnotationDrag` のドラッグ確定

**移行するメソッド**:
- `onCanvasMouseDown(e: MouseEvent): void`
- `onCanvasMouseMove(e: MouseEvent): void`
- `handleCanvasMouseMove(e: MouseEvent, page: PageData): void`
- `onCanvasMouseUp(e: MouseEvent): void`
- `onCanvasMouseLeave(): void`
- `onCanvasDoubleClick(e: MouseEvent): void`
- `commitAnnotationDrag(): void`

**関連状態**:
- `draggingAnnotation`, `dragOffset`, `draggingStart`
- `isResizing`, `resizeStart`
- `rotatingAnnotationId`, `rotationStartAngle`, `initialRotation`
- `isDraggingRenderPending`, `lastMouseEvent`

---

### 3. `ExportManager` (新規作成)

**移行対象**: PDF/画像エクスポート処理（2121〜2380行、約 **260行**）

```
現在の場所: main.ts L2121-2380
推定削減: 約 260 行
```

**責務**:
- PDF 保存（注釈埋め込み含む）
- 単一ページ PNG エクスポート
- 全ページ ZIP エクスポート
- PDF 分割ダウンロード
- 名前を付けて保存

**移行するメソッド**:
- `savePDF(): Promise<void>`
- `exportCurrentPage(): Promise<void>`
- `exportAllPages(): Promise<void>`
- `splitAndDownload(): Promise<void>`
- `downloadPDF(pdfBytes: Uint8Array, fileName: string): void`
- `saveAsPDF(): Promise<void>`

---

### 4. `ClipboardManager` (新規作成)

**移行対象**: コピー/ペースト処理（150〜270行、約 **120行**）

```
現在の場所: main.ts L150-270
推定削減: 約 120 行
```

**責務**:
- 注釈のコピー/ペースト
- ページのコピー/ペースト

**移行するメソッド**:
- `handleCopy(): void`
- `handlePaste(): void`

**関連状態**:
- `clipboard: TextAnnotation | HighlightAnnotation | null`
- `pageClipboard: PageData | null`

---

### 5. `FileOperationManager` (新規作成)

**移行対象**: ファイル読み込み・PDF追加処理（535〜650行、約 **115行**）

```
現在の場所: main.ts L535-650
推定削減: 約 115 行
```

**責務**:
- ファイルドロップ処理
- PDF 読み込み
- PDF 追加（結合）
- 画像挿入

**移行するメソッド**:
- `handleFileDrop(files: FileList): Promise<void>`
- `loadPDF(file: File): Promise<void>`
- `addPDF(file: File): Promise<void>`
- `insertImage(file: File): Promise<void>`

---

## 移行後の main.ts 構造

```
src/main.ts (推定 600〜800 行)
├── インポート宣言
├── PDFEditorApp クラス
│   ├── 状態（AppState）
│   ├── Manager インスタンス
│   ├── constructor()
│   ├── init()
│   ├── cacheElements()
│   ├── 委譲メソッド（各 Manager への振り分け）
│   │   ├── undo() → undoExecutionManager.undo()
│   │   ├── redo() → undoExecutionManager.redo()
│   │   ├── savePDF() → exportManager.savePDF()
│   │   ├── handleCopy() → clipboardManager.handleCopy()
│   │   └── ...
│   ├── UI 更新系
│   │   ├── renderPageList()
│   │   ├── updateMainView()
│   │   ├── updateUI()
│   │   ├── updatePageNav()
│   │   └── updateThumbnailSelection()
│   ├── ユーティリティ
│   │   ├── showLoading() / hideLoading()
│   │   ├── showToast()
│   │   └── toggleTheme() / loadThemePreference()
│   └── セッション管理
│       ├── restoreSession()
└── DOMContentLoaded イベント
```

---

## 削減見込み

| 新規 Manager | 移行行数 |
|--------------|----------|
| UndoExecutionManager | 580 行 |
| CanvasInteractionManager | 565 行 |
| ExportManager | 260 行 |
| ClipboardManager | 120 行 |
| FileOperationManager | 115 行 |
| **合計** | **約 1,640 行** |

**移行後の main.ts**: 2,493 - 1,640 = **約 850 行**

> [!NOTE]
> 委譲メソッドの追加や調整により最終的には 600〜800 行程度になる見込み。

---

## 実装順序

1. **UndoExecutionManager** - 最大の削減効果（580行）、独立性が高い
2. **CanvasInteractionManager** - 次に大きい（565行）、状態移行が必要
3. **ExportManager** - 独立性が高い（260行）
4. **ClipboardManager** - 比較的小規模（120行）
5. **FileOperationManager** - 比較的小規模（115行）

---

## 依存関係の整理

### 各 Manager が必要とするもの

| Manager | 依存先 |
|---------|--------|
| UndoExecutionManager | UndoManager, PDFService, RenderManager, state |
| CanvasInteractionManager | AnnotationManager, RenderManager, state, elements |
| ExportManager | PDFService, ImageService, ColorService, state |
| ClipboardManager | state, PDFService |
| FileOperationManager | PDFService, ImageService, state |

### 循環参照の回避

各 Manager は PDFEditorApp の直接参照を避け、以下のパターンを採用：

1. **コールバック注入**: `(callback: () => void)` でUI更新を受け取る
2. **State Getter**: `() => AppState` で状態を取得
3. **Interface 定義**: `AppAction` インターフェースを通じて必要なメソッドのみ公開

---

## 注意事項

> [!IMPORTANT]
> - 既存テストがある場合は、リファクタリング後も全テストがパスすることを確認
> - Manager 間の責務境界を明確にし、重複ロジックを避ける
> - 段階的に移行し、各ステップでビルド・動作確認を行う

> [!WARNING]
> - Canvas 関連の状態（`draggingAnnotation` 等）は CanvasInteractionManager に移行するため、main.ts からのアクセス方法を検討
> - Undo/Redo は複数の Manager の操作結果を復元するため、各 Manager との連携設計が重要

---

## 次のステップ

1. [ ] 本計画をレビュー・承認
2. [ ] UndoExecutionManager の実装
3. [ ] CanvasInteractionManager の実装
4. [ ] ExportManager の実装
5. [ ] ClipboardManager の実装
6. [ ] FileOperationManager の実装
7. [ ] 最終検証・トークン数確認
