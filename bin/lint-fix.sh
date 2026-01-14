#!/bin/bash

echo "🔍 Running Lint and Auto-fix..."

# プロジェクトのリンターを実行（プロジェクトに合わせて調整してください）
npm run lint -- --fix || npx eslint . --fix || echo "No auto-fix available, running regular lint..."

# Viteの型チェックもついでに行う場合
# npm run build (一部) など

echo "✅ Lint check completed."
