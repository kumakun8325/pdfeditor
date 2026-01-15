# GitHub Issue: Phase 35 - CMYK変換・印刷用出力

以下の内容をGitHubにIssueとして登録してください。

---

## Issue Title

```
[Feature] Phase 35: CMYK変換・印刷用出力機能
```

---

## Issue Body

```markdown
## 概要

RGB PDFをCMYKカラースペースに変換し、商業印刷に適したPDF出力を実現する。

## 背景

現在のPDFエディタはRGBカラースペースで動作しているが、商業印刷ではCMYKカラースペースが必須。
本機能により、印刷入稿に適したPDFを直接出力可能にする。

## タスク

- [ ] 35.1 CMYK変換ライブラリの導入
  - [ ] `color-convert` パッケージのインストール
  - [ ] `src/services/ColorService.ts` の作成
- [ ] 35.2 RGB→CMYK変換処理の実装
  - [ ] `rgbToCmyk()` / `hexToCmyk()` 実装
  - [ ] テキスト注釈・ハイライト注釈の色変換対応
- [ ] 35.3 CMYKプレビュー機能
  - [ ] 色シミュレーション表示（RGB→CMYK→RGB）
  - [ ] ガマット警告表示（色域外の色をハイライト）
- [ ] 35.4 CMYK PDF出力機能
  - [ ] `savePDF()` のCMYK対応拡張
  - [ ] pdf-lib の `cmyk()` 関数を使った色指定
  - [ ] CMYKモードトグルUI

## 技術スタック

| ライブラリ | 用途 |
|-----------|------|
| `color-convert` | RGB ↔ CMYK 変換 |
| `pdf-lib` | CMYK色でのPDF描画（既存） |

## 受け入れ条件

- [ ] CMYKモードでPDFを保存できる
- [ ] 保存したPDFがCMYKカラースペースであることをAcrobatで確認できる
- [ ] CMYKプレビューで印刷イメージが確認できる
- [ ] ドキュメント更新（requirements.md, design.md）

## 関連ドキュメント

- 詳細計画: `docs/task35.md`

## ラベル

- `enhancement`
- `phase-35`
- `priority: medium`

## 見積もり

約10.5時間
```

---

## Labels（推奨）

| Label | Color |
|-------|-------|
| `enhancement` | #a2eeef |
| `phase-35` | #0052cc |
| `priority: medium` | #fbca04 |
| `printing` | #d876e3 |

---

## Milestone（推奨）

`v2.0 - Print Ready Features`
