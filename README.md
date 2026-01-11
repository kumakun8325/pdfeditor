# PDF Editor

クロスプラットフォーム対応のWebベースPDF編集ツール

![screenshot](docs/screenshot.png)

## ✨ 機能

- **PDF読み込み・表示**: PDFファイルを読み込み、サムネイルとプレビューを表示
- **画像挿入**: PNG/JPEG画像をドラッグ＆ドロップでPDFに追加
- **ページ削除**: キーボードショートカットでページを削除
- **ページ並べ替え**: ドラッグでページ順序を変更
- **PDF出力**: 編集したPDFをダウンロード
- **ダークモード**: 目に優しいダークテーマに対応

## 🚀 起動方法

### 必要環境

- Node.js 18以上
- npm または yarn

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/yourusername/pdfeditor.git
cd pdfeditor

# 依存関係をインストール
npm install
```

### 開発サーバー起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開く

### 本番ビルド

```bash
npm run build
npm run preview
```

## 🎮 使い方

### PDFを開く

1. **「開く」ボタン**をクリック、または `Ctrl/Cmd + O`
2. PDFファイルを選択

### 画像を挿入

1. PNG/JPEG画像を**左サイドバーにドラッグ＆ドロップ**
2. 画像は自動的にPDFのページサイズにリサイズされます

### ページを削除

1. 削除したいページをサイドバーでクリックして選択
2. `Ctrl/Cmd + D` で削除

### ページを並べ替え

- サイドバーのサムネイルを**ドラッグして移動**

### PDFを保存

- **「保存」ボタン**をクリック、または `Ctrl/Cmd + S`
- 編集後のPDFがダウンロードされます

## ⌨️ キーボードショートカット

| 操作 | Windows | Mac |
|------|---------|-----|
| PDFを開く | `Ctrl + O` | `Cmd + O` |
| PDFを保存 | `Ctrl + S` | `Cmd + S` |
| ページ削除 | `Ctrl + D` | `Cmd + D` |
| 前のページ | `↑` | `↑` |
| 次のページ | `↓` | `↓` |

## 🛠️ 技術スタック

- **言語**: TypeScript
- **ビルドツール**: Vite
- **PDFレンダリング**: pdfjs-dist
- **PDF編集**: pdf-lib
- **スタイリング**: Vanilla CSS

## 📁 ディレクトリ構成

```
pdfeditor/
├── src/
│   ├── main.ts           # アプリケーションエントリー
│   ├── services/
│   │   ├── PDFService.ts    # PDF操作
│   │   ├── ImageService.ts  # 画像処理
│   │   └── KeyboardService.ts
│   ├── types/
│   │   └── index.ts      # 型定義
│   └── styles/
│       └── index.css     # スタイル
├── docs/
│   ├── requirements.md   # 要件定義書
│   ├── design.md         # 設計書
│   └── tasks.md          # タスク一覧
├── index.html
├── package.json
└── vite.config.ts
```

## 📄 ライセンス

MIT License
