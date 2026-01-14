#!/bin/bash

# 色付け用
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Finish Workflow...${NC}"

# 1. ビルド
echo "Building project..."
npm run build || { echo -e "${RED}❌ Build failed${NC}"; exit 1; }

# 2. ステージング
git add .

# 3. コミットメッセージの処理
MSG=${1:-"chore: save progress"}
echo "Committing with message: $MSG"
git commit -m "$MSG" || echo "No changes to commit"

# 4. Push
echo "Pushing to GitHub..."
git push origin $(git rev-parse --abbrev-ref HEAD)

# 5. Firebaseデプロイ
echo "Deploying to Firebase..."
firebase deploy --only hosting

echo -e "${GREEN}✅ All done!${NC}"
