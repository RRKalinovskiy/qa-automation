import { request, type APIRequestContext } from '@playwright/test';
import { env } from '../config/env';

export type ApiClientOptions = {
  baseURL?: string;
  token?: string;
};

/**
 * Создаёт изолированный API-контекст.
 * Закрывайте его в afterAll: `await api.dispose()`.
 */
export async function createApiClient(
  options: ApiClientOptions = {},
): Promise<APIRequestContext> {
  const baseURL = options.baseURL ?? env.apiBaseUrl;

  if (!baseURL) {
    throw new Error(
      'API_BASE_URL не задан. Скопируйте .env.example в .env и укажите адрес API.',
    );
  }

  const token = options.token ?? env.apiToken;
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return request.newContext({ baseURL, extraHTTPHeaders: headers });
}
