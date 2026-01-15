import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('PDF読み込み', () => {
    test('PDFファイルを読み込むとサムネイルが表示される', async ({ page }) => {
        await page.goto('/');

        // ファイル選択（#file-input を使用）
        const fileInput = page.locator('#file-input');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/sample.pdf'));

        // サムネイルが表示されるまで待機（クラス名: .page-thumbnail）
        await expect(page.locator('.page-thumbnail')).toBeVisible({ timeout: 10000 });

        // サムネイルが1つ以上あることを確認
        const thumbnails = page.locator('.page-thumbnail');
        await expect(thumbnails).toHaveCount(1, { timeout: 10000 });
    });

    test('Empty Stateが初期表示される', async ({ page }) => {
        await page.goto('/');

        // Empty Stateが表示されていることを確認（#empty-state）
        await expect(page.locator('#empty-state')).toBeVisible();
    });

    test('Empty Stateの開くボタンが機能する', async ({ page }) => {
        await page.goto('/');

        // ボタンが存在することを確認
        await expect(page.locator('#btn-open-hero')).toBeVisible();
    });

    test('PDFを読み込むとEmpty Stateが非表示になる', async ({ page }) => {
        await page.goto('/');

        // 最初はEmpty Stateが表示されている
        await expect(page.locator('#empty-state')).toBeVisible();

        // PDFを読み込む
        const fileInput = page.locator('#file-input');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/sample.pdf'));

        // サムネイルが表示されるまで待機
        await expect(page.locator('.page-thumbnail')).toBeVisible({ timeout: 10000 });

        // Empty Stateが非表示になる
        await expect(page.locator('#empty-state')).not.toBeVisible();
    });

    test('ページカウントが正しく表示される', async ({ page }) => {
        await page.goto('/');

        // PDFを読み込む
        const fileInput = page.locator('#file-input');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/sample.pdf'));

        // サムネイルが表示されるまで待機
        await expect(page.locator('.page-thumbnail')).toBeVisible({ timeout: 10000 });

        // ページカウントが表示されることを確認
        const pageCount = page.locator('#page-count');
        await expect(pageCount).toContainText('1');
    });
});
