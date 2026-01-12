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
