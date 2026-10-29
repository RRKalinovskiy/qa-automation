import { test, expect } from '@playwright/test';
import { env } from '../../src/config/env';

/**
 * Смоук API. Замените `/health` на реальный эндпоинт проверки доступности.
 * Тест пропускается, пока не задан API_BASE_URL.
 */
test.describe('API smoke @smoke', () => {
  test('сервис доступен и отвечает JSON', async ({ request }) => {
    test.skip(!env.apiBaseUrl, 'API_BASE_URL не задан — см. .env.example');

    const response = await request.get('/health');

    expect(response.status(), 'сервис не должен отвечать 5xx').toBeLessThan(500);
    expect(response.headers()['content-type'] ?? '').toContain('application/json');
  });
});
