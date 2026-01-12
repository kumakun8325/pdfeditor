# PDF Editor - タスク一覧

## Phase 1: プロジェクト初期化
- [x] 1.1 Vite + TypeScript プロジェクト作成
- [x] 1.2 依存関係インストール（pdf-lib, pdfjs-dist）
- [x] 1.3 TypeScript設定
- [x] 1.4 基本ディレクトリ構成作成

## Phase 2: 基盤UI構築
- [x] 2.1 CSS変数・グローバルスタイル定義
- [x] 2.2 レイアウト（Sidebar + MainView）構築
- [x] 2.3 Toolbar コンポーネント作成
- [x] 2.4 ダークモード切り替え機能

## Phase 3: PDF読み込み・表示
- [x] 3.1 PDFService 実装（pdf.js ラッパー）
- [x] 3.2 PDF読み込み機能
- [x] 3.3 サムネイル生成機能
- [x] 3.4 Sidebar にサムネイル一覧表示
- [x] 3.5 MainView に選択ページ表示
- [x] 3.6 ページ選択機能

## Phase 4: ページ操作機能
- [x] 4.1 ドラッグ＆ドロップ（PDF挿入）
- [x] 4.2 ドラッグ＆ドロップ（画像挿入）
- [x] 4.3 ImageService 実装（画像リサイズ）
- [x] 4.4 挿入位置インジケーター
- [x] 4.5 ページ削除機能
- [x] 4.6 KeyboardService 実装
- [x] 4.7 ショートカット（Ctrl/Cmd + D）

## Phase 5: ページ並べ替え
- [x] 5.1 サイドバーでのドラッグ並べ替え
- [x] 5.2 並べ替えアニメーション

## Phase 6: PDF出力
- [x] 6.1 pdf-lib でPDF生成
- [x] 6.2 ダウンロード機能
- [ ] 6.3 ファイル名入力ダイアログ（任意）

## Phase 7: 仕上げ
- [x] 7.1 ローディングインジケーター
- [x] 7.2 エラーハンドリング・トースト通知
- [x] 7.3 レスポンシブ対応
- [x] 7.4 README.md 作成

## Phase 8: 追加機能 (Export & UX)
- [x] 8.1 画像エクスポート機能 (PNG/ZIP)
- [x] 8.2 初回プレビュー画像反転バグ修正
- [x] 8.3 ファイル読み込みUX改善 (Empty Stateボタン & メインビューD&D)

## Phase 9: バイナリ分割機能
- [x] 9.1 PDFServiceに`splitBinary`/`splitBinaryAsZip`メソッド追加
- [x] 9.2 ツールバーに「分割」ボタン追加
- [x] 9.3 main.tsに`splitAndDownload`メソッド追加
- [x] 9.4 ドキュメント更新

## Phase 10: 注釈・編集機能（完了）
- [x] 10.1 ページ回転機能 (90度)
- [x] 10.2 ページ複製・全削除（クリア）機能
- [x] 10.3 テキスト注釈（ドラッグ配置）
- [x] 10.4 ハイライト注釈（ドラッグ範囲）
- [x] 10.5 汎用Undo機能 (Ctrl+Z)
- [x] 10.6 画像Undo対応
- [x] 10.7 UX修正（トースト非表示・色選択ラベル）

## Phase 11: リファクタリング (構造改善)
- [x] 11.1 UndoManagerの分離 (Undo/Redoロジック)
- [x] 11.2 AnnotationManagerの分離 (注釈描画・ヒット判定)
- [x] 11.3 座標変換ロジックの共通化

## Phase 11.5: UX & Undo改善 (追加要望)
- [x] 11.5.1 複製機能のUndo対応
- [x] 11.5.2 テキスト移動のUndo対応（移動前の位置に戻す）
- [x] 11.5.3 マーカーモードの自動解除（他機能使用時）

## Phase 12: ズーム機能
- [x] 12.1 ズームUI実装 (ツールバー)
- [x] 12.2 ズームロジック実装 (プレビュースケール変更)
- [x] 12.3 レンダリング最適化 (競合防止)

## Phase 13: Redo (やり直し) 機能
- [x] 13.1 UndoActionの拡張 (Redo情報の保持)
- [x] 13.2 Redoロジック実装 (UndoManager, PDFEditorApp)
- [x] 13.3 ショートカット実装 (Ctrl+Y, Ctrl+Shift+Z)
- [x] 13.4 Undo/Redo UIボタン実装 / Ctrl+Y ショートカット対応
- [x] 13.5 UI操作の統合

## Phase 14: 注釈の高度な編集
- [x] 14.1 注釈の選択機能（クリックで選択枠表示）
- [x] 14.2 選択した注釈の個別削除 (Deleteキー)
- [x] 14.3 注釈の移動 (ドラッグ)
- [x] 14.4 注釈のリサイズ (ハンドル操作)
- [x] 14.5 注釈・ページのコピー＆ペースト (`Ctrl+C`, `Ctrl+V`)

## Phase 15: 改善・機能追加 (User Requests)
- [x] 15.1 複数画像の選択・一括追加
- [x] 15.2 UIリファクタリング (ツールバーのグループ化・整理)
- [x] 15.3 「名前を付けて保存」ボタンの追加 (ファイル名指定)

## Phase 16: ツールバーのコンパクト化
- [x] 16.1 アイコンのみ表示（テキストラベル削除）
- [x] 16.2 エクスポート機能のドロップダウン化
- [x] 16.3 ファイル操作のドロップダウン化

## Phase 17: 複数ページ選択
- [x] 17.1 Ctrl+クリックで複数ページ選択
- [x] 17.2 選択したページの一括削除

## Phase 18: 複数ページのドラッグ移動
- [x] 18.1 複数ページのドラッグ開始処理
- [x] 18.2 複数ページのドロップ処理・並べ替えロジック
- [x] 18.3 Undo/Redo対応（一括移動）

## Phase 19: 複数ページの一括操作
- [x] 19.1 一括回転機能
- [x] 19.2 一括複製機能
- [x] 19.3 Undo/Redo対応（一括回転・複製）

## Phase 20: Undo/Redoの最適化
- [x] 20.1 バッチ操作のUndoAction定義
- [x] 20.2 UndoManagerの更新

## Phase 21: 自動保存（セッション復元）機能
- [x] 21.1 StorageServiceの実装 (IndexedDBラッパー)
- [x] 21.2 状態変更時の自動保存ロジック (Debounce対応)
- [x] 21.3 アプリ起動時の状態復元ロジック
- [x] 21.4 クリア機能（セッション破棄）

## Phase 21.5: UX改善（セッション復元）
- [x] 21.5.1 初期ロード時のチラつき防止（ローディング制御）
- [x] 21.5.2 復元完了メッセージの調整

## Phase 22: 右クリックメニュー（コンテキストメニュー）機能
- [x] 22.1 ContextMenuManagerの実装 (メニュー表示・非表示制御)
- [x] 22.2 メニュー項目の定義とイベントハンドリング
- [x] 22.3 UIスタイリング (コンテキストメニュー)

## Phase 23: Re-architecture (Refactoring) (Merged)
- [x] 23.1 PageManagerの分離 (ページ状態管理・操作ロジック)
- [x] 23.2 SelectionManagerの分離 (複数選択・範囲選択ロジック)
- [x] 23.3 DragDropManagerの分離 (D&D処理)
- [x] 23.4 PDFEditorAppの簡素化 (main.tsのダイエット)
- [x] 23.5 画像フィット処理共通化 (`drawImageFitToCanvas`)

## Phase 24: パフォーマンス改善 & UX向上
- [x] 24.1 オフスクリーンキャンバスによるレンダリング高速化
- [x] 24.2 スマートキャッシングの実装
- [x] 24.3 コンテキストメニューのUI改善

## Phase 25: テキスト注釈リサイズ
- [x] 25.1 リサイズハンドルの実装
- [x] 25.2 フォントサイズの動的変更
- [x] 25.3 Undo/Redo対応

## Phase 26: 大規模リファクタリング (Event/Toolbar/Render)
- [x] 26.1 EventManagerの分離
- [x] 26.1.1 Drag & Dropの修正 (プレビューエリアでのドロップ無効化バグ)
- [x] 26.2 ToolbarManagerの分離
- [x] 26.2.1 ページ「下へ移動」ボタンの修正（バグ修正）
- [x] 26.2.2 マーカー注釈のリサイズ対応
- [x] 26.3 RenderManagerの分離

## Phase 27: パフォーマンス最適化
- [x] 27.1 ハイライト注釈のドラッグ最適化
    - [x] 注釈移動時のラグ軽減（テキスト同様のスムーズさ）
    - [x] `main.ts` / `RenderManager` の `handleCanvasMouseMove` 最適化 (`redrawWithCachedBackground` の高速化)
- [x] 27.2 ページレンダリングキャッシュ
    - [x] `RenderManager` にページキャッシュ実装 (Map<pageId+params, ImageBitmap>)
    - [x] キャッシュ済み画像の再利用（PDF.jsレンダリングスキップ）
    - [x] ズーム・回転変更時のキャッシュ無効化（キーによる自動制御）

## Phase 28: ヘルプ機能 (User UX)
- [x] 28.1 ショートカット一覧モーダルの実装
- [x] 28.2 ヘルプボタンの追加

## Phase 29: Final Polish (v1.0)
- [x] 29.1 Select Allの実装 (Ctrl+A)
- [x] 29.2 最終ビルド検証
- [x] 29.3 デプロイ (Firebase)

## Phase 30: Critical Bug Fixes
- [x] 30.1 回転Undo時の品質修正
- [x] 30.2 テキスト注釈ドラッグのラグ修正 & 回転表示修正

## Phase 31: テキスト注釈の回転
- [x] 31.1 `TextAnnotation` 型の更新
- [x] 31.2 `AnnotationManager` 描画・ヒット判定更新
- [x] 31.3 回転UI実装 (Circle Handle)
- [x] 31.4 PDF保存時の回転反映
- [x] 31.5 回転ヒット判定のバグ修正

## Phase 32: デプロイ
- [x] 32.1 プロジェクトビルド
- [x] 32.2 Firebaseデプロイ

## Phase 33: PWA対応
- [ ] 33.1 Service Workerの設定
- [ ] 33.2 マニフェストファイルの作成
