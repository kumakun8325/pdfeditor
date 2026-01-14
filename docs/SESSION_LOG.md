# 🗓️ BBQ セッションログ

> プロジェクトの作業履歴を記録する

---

## 2026-01-12 (日)

### 実施内容
- **ヘルプ機能の実装**
    - ショートカット一覧モーダルの作成
    - ヘルプボタンの追加
- **最終調整 (Polish) & バグ修正**
    - `Ctrl+A` (全選択) の実装
    - 回転時のUndoアーティファクト修正
    - テキスト注釈ドラッグのラグ修正
- **テキスト注釈の回転機能**
    - `TextAnnotation` 型への `rotation` プロパティ追加
    - 回転ハンドルの実装とインタラクションロジック (`AnnotationManager`, `main.ts`)
    - PDF保存時の回転反映
    - 回転ヒット判定のバグ修正
- **デプロイ**
    - Firebase Hosting へのデプロイ完了

### 変更ファイル
- `src/main.ts`
- `src/managers/AnnotationManager.ts`
- `src/managers/EventManager.ts`
- `src/managers/HelpManager.ts` (新規)
- `src/types/index.ts`
- `docs/tasks.md`
- `docs/walkthrough.md`

### 次回TODO
- PWA対応 (Service Worker, Manifest)
- `main.ts` のリファクタリング (Undoロジックの分離)

### ブランチ状態
- ブランチ名: `feature/help-system`
- 状態: 作業完了 / マージ待ち

---

## 2026-01-14 (火)

### 実施内容
- **PDF結合機能の実装 (Phase 33)**
    - ファイルメニューに「PDFを追加」ボタン追加
    - 複数PDFの選択に対応（`multiple`属性）
    - `addPDF()` メソッドの実装（既存ページの末尾にPDFを追加）
- **Firebase Hosting デプロイ**
    - サービスアカウント設定完了
    - デプロイ成功: https://pdfeditor-study.web.app
- **カスタムスラッシュコマンドの作成**
    - `/finish` コマンド作成（作業終了時のドキュメント更新・コミット処理）
    - ドキュメント整合性チェック（Step 0）を追加
- **ドキュメント大幅更新（実装との整合性確保）**
    - `requirements.md`: F-036〜F-057 追加（複数ページ選択、ズーム、コンテキストメニュー、Undo/Redo、セッション保存、ヘルプ、注釈高度操作）
    - `design.md`: Manager Pattern アーキテクチャ図追加、型定義更新（AppState, TextAnnotation, UndoAction拡張）、StorageService追記
- **PDF結合バグ修正（重要）**
    - 問題: ファイルAにファイルBを追加した際、ファイルBのページがファイルAの内容を表示
    - 原因: `RenderManager.renderPdfPage()` が `this.state.originalPdfBytes` を使用（常に最初のPDF）
    - 修正: `pageData.pdfBytes` を使用するように変更（各ページ固有のPDFデータ）
    - デプロイ完了
- **モデル使用ガイドライン追加**
    - `CLAUDE.md` にSonnet/Opus使い分け指針を追記
    - Sonnet: 解析、ドキュメント、Git、デプロイ
    - Opus: 新機能実装、複雑なバグ修正、リファクタリング

### 変更ファイル
- `index.html` - 「PDFを追加」ボタンUI追加
- `src/types/index.ts` - `btnAddPdf`, `pdfAddInput`, `addPDF()` 型追加
- `src/main.ts` - `addPDF()` メソッド実装、`pdfAddInput` 動的生成
- `src/managers/EventManager.ts` - PDF追加イベントバインディング
- `src/managers/RenderManager.ts` - PDF結合バグ修正（`pageData.pdfBytes` 使用）
- `docs/tasks.md` - Phase 33完了
- `docs/requirements.md` - F-034, F-035 追加、F-036〜F-057 追加（22機能）
- `docs/design.md` - Manager Pattern追加、型定義更新、StorageService追記
- `.claude/commands/finish.md` - カスタムコマンド作成、整合性チェック追加
- `CLAUDE.md` - モデル使用ガイドライン追加
- `docs/SESSION_LOG.md` - 本セッションログ更新

### 次回TODO
- Phase 34: スマホ対応（タッチ操作）
- Phase 35: CMYK変換・印刷用出力

### ブランチ状態
- ブランチ名: `main`
- 状態: 作業完了
