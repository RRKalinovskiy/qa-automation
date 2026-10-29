function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Конфигурация окружения. Значения читаются из `.env` (загружается в playwright.config.ts).
 */
export const env = {
  uiBaseUrl: read('UI_BASE_URL'),
  apiBaseUrl: read('API_BASE_URL'),
  apiToken: read('API_TOKEN'),
  isCi: Boolean(process.env.CI),
} as const;
