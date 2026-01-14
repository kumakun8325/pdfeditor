#!/bin/bash

# 使用方法の確認
if [ $# -lt 2 ]; then
  echo "Usage: ./bin/issue-start.sh <feature|fix|refactor> \"Issue Title\""
  exit 1
fi

TYPE=$1
TITLE=$2

# GitHub Issue の作成
echo "Creating GitHub Issue..."
ISSUE_URL=$(gh issue create --title "[$TYPE] $TITLE" --label "$TYPE" --body "Created via issue-start.sh for Phase 34 updates.")

# Issue番号の取得
ISSUE_NUM=$(echo $ISSUE_URL | grep -oP '\d+$')

# ブランチ名の生成 (スペースをハイフンに、小文字化)
SLUG=$(echo "$TITLE" | sed 's/ /-/g' | tr '[:upper:]' '[:lower:]')
BRANCH_NAME="${TYPE}/issue-${ISSUE_NUM}-${SLUG}"

# ブランチの作成と切り替え
echo "Creating and switching to branch: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME"

echo "✅ Success! Issue $ISSUE_URL"
echo "✅ Switched to $BRANCH_NAME"
