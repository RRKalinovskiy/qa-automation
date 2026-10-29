import { test, expect } from '@playwright/test';
import { env } from '../../src/config/env';

/**
 * Смоук UI. Тест пропускается, пока не задан UI_BASE_URL.
 * После подключения стенда замените проверку на реальный признак загрузки страницы.
 */
test.describe('UI smoke @smoke', () => {
  test('главная страница открывается', async ({ page }) => {
    test.skip(!env.uiBaseUrl, 'UI_BASE_URL не задан — см. .env.example');

    const response = await page.goto('/');

    expect(response?.ok(), 'навигация должна вернуть 2xx').toBeTruthy();
    await expect(page.locator('body')).toBeVisible();
  });
});
