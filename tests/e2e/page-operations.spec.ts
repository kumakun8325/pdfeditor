import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('ページ操作', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');

        // PDFを読み込み
        const fileInput = page.locator('#file-input');
        await fileInput.setInputFiles(path.join(__dirname, '../fixtures/sample.pdf'));

        // サムネイルが表示されるまで待機
        await expect(page.locator('.page-thumbnail')).toBeVisible({ timeout: 10000 });
    });

    test('ページを削除できる', async ({ page }) => {
        // サムネイルをクリックして選択
        await page.locator('.page-thumbnail').first().click();

        // 削除ボタンをクリック
        await page.locator('#btn-delete').click();

        // サムネイルがなくなることを確認
        await expect(page.locator('.page-thumbnail')).toHaveCount(0);

        // Empty Stateが表示されることを確認
        await expect(page.locator('#empty-state')).toBeVisible();
    });

    test('Ctrl+Zでページ削除をUndoできる', async ({ page }) => {
        await page.locator('.page-thumbnail').first().click();
        await page.locator('#btn-delete').click();
        await expect(page.locator('.page-thumbnail')).toHaveCount(0);

        // Undo
        await page.keyboard.press('Control+z');

        // ページが復元されることを確認
        await expect(page.locator('.page-thumbnail')).toHaveCount(1);
    });

    test('ページを回転できる', async ({ page }) => {
        await page.locator('.page-thumbnail').first().click();
        await page.locator('#btn-rotate').click();

        // トースト通知が表示されることを確認（操作成功の証拠）
        await expect(page.locator('.toast')).toBeVisible({ timeout: 3000 });
    });

    test('ページを複製できる', async ({ page }) => {
        const initialCount = await page.locator('.page-thumbnail').count();

        await page.locator('.page-thumbnail').first().click();
        await page.locator('#btn-duplicate').click();

        // ページ数が増えることを確認
        await expect(page.locator('.page-thumbnail')).toHaveCount(initialCount + 1);
    });

    test('Undoボタンが正しく有効化/無効化される', async ({ page }) => {
        const undoBtn = page.locator('#btn-undo');

        // 初期状態ではUndoボタンは無効
        await expect(undoBtn).toBeDisabled();

        // ページを削除
        await page.locator('.page-thumbnail').first().click();
        await page.locator('#btn-delete').click();

        // Undoボタンが有効になる
        await expect(undoBtn).toBeEnabled();

        // Undoを実行
        await undoBtn.click();

        // Undoボタンが再び無効になる（最初の状態に戻ったため）
        await expect(undoBtn).toBeDisabled();
    });

    test('Redoボタンが正しく有効化/無効化される', async ({ page }) => {
        const redoBtn = page.locator('#btn-redo');

        // 初期状態ではRedoボタンは無効
        await expect(redoBtn).toBeDisabled();

        // ページを削除してUndo
        await page.locator('.page-thumbnail').first().click();
        await page.locator('#btn-delete').click();
        await page.keyboard.press('Control+z');

        // Redoボタンが有効になる
        await expect(redoBtn).toBeEnabled();

        // Redoを実行
        await redoBtn.click();

        // Redoボタンが再び無効になる
        await expect(redoBtn).toBeDisabled();
    });

    test('複数ファイルを追加できる', async ({ page }) => {
        // 初期状態: 1ページ
        await expect(page.locator('.page-thumbnail')).toHaveCount(1);

        // 追加でPDFを読み込む
        const addInput = page.locator('#pdf-add-input');
        await addInput.setInputFiles(path.join(__dirname, '../fixtures/sample.pdf'));

        // ページ数が増えることを確認
        await expect(page.locator('.page-thumbnail')).toHaveCount(2, { timeout: 10000 });
    });
});
