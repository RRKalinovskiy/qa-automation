import fs from 'node:fs';
import path from 'node:path';

import {
  calledMethod,
  formatLastModification,
  originalMethodHeader,
} from './records.mjs';

export class SabyError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'SabyError';
    this.method = options.method;
    this.status = options.status;
    this.details = options.details;
  }
}

function readStorageState(filePath) {
  if (!filePath) return null;
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) return null;
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new SabyError(
      `Не удалось прочитать storageState "${absolute}": ${error.message}`,
    );
  }
}

/**
 * Собирает Cookie из storageState Playwright.
 * Подходят только cookie для sbis.ru / saby.ru.
 */
export function cookieFromStorageState(storageState) {
  const cookies = Array.isArray(storageState?.cookies)
    ? storageState.cookies
    : [];
  return cookies
    .filter(
      (cookie) =>
        cookie?.name &&
        cookie?.value != null &&
        (String(cookie.domain).includes('sbis.ru') ||
          String(cookie.domain).includes('saby.ru')),
    )
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

/**
 * Источники авторизации:
 *  1. SABY_COOKIE — готовая строка Cookie (удобно для CI/отладки);
 *  2. SABY_STORAGE_STATE — storageState, сохранённый `npm run saby:login`.
 */
export function loadCookieHeader(options = {}) {
  if (options.cookie) return options.cookie;
  if (process.env.SABY_COOKIE) return process.env.SABY_COOKIE;

  const storagePath =
    options.storageStatePath ||
    process.env.SABY_STORAGE_STATE ||
    '.auth/saby.json';
  const state = readStorageState(storagePath);
  const cookie = state ? cookieFromStorageState(state) : '';
  if (!cookie) {
    throw new SabyError(
      'Нет авторизации в Saby. Выполните `npm run saby:login` ' +
        `(файл ${storagePath}) или задайте SABY_COOKIE.`,
    );
  }
  return cookie;
}

export class SabyClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || process.env.SABY_BASE_URL || 'https://online.sbis.ru').replace(
      /\/$/,
      '',
    );
    this.cookie = loadCookieHeader(options);
    this.appId =
      options.appId ||
      process.env.SABY_APP_ID ||
      'd7b1d6a5-e59d-4b03-b823-726fbdc35d09';
    this.configId =
      options.cfgId ||
      process.env.SABY_CFG_ID ||
      '2725babf-70e1-4f04-8e78-1b4272de7b21';
    this.version = options.version || process.env.SABY_VERSION || '26.5118';
    this.serviceVersion =
      options.serviceVersion ||
      process.env.SABY_SERVICE_VERSION ||
      `${this.version}-135`;
    this.timeoutMs = Number(options.timeoutMs || process.env.SABY_TIMEOUT_MS || 30000);
    this._guidCache = new Map();
  }

  headers(method) {
    return {
      accept: 'application/json, text/javascript, */*; q=0.01',
      'content-type': 'application/json; charset=UTF-8',
      'accept-language': 'ru-RU;q=0.8,en-US;q=0.5,en;q=0.3',
      'x-adaptive': 'false',
      'x-requested-with': 'XMLHttpRequest',
      'x-calledmethod': calledMethod(method),
      'x-originalmethodname': originalMethodHeader(method),
      'x-saby-appid': this.appId,
      'x-saby-appversion': this.version,
      'x-saby-cfgid': this.configId,
      'x-lastmodification': formatLastModification(),
      'x-osversion': 'OSType=Windows;OSVersion=10.0;IsWin11=true',
      cookie: this.cookie,
    };
  }

  async call(method, params = {}, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);
    try {
      const response = await fetch(
        `${this.baseUrl}/service/?x_version=${this.serviceVersion}`,
        {
          method: 'POST',
          headers: this.headers(method),
          body: JSON.stringify({
            jsonrpc: '2.0',
            protocol: 7,
            method,
            params,
            id: options.id ?? 1,
          }),
          signal: controller.signal,
        },
      );
      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new SabyError(
          `Saby вернул не JSON на ${method}: ${text.slice(0, 200)}`,
          { method, status: response.status },
        );
      }
      if (payload.error) {
        throw new SabyError(
          payload.error.message || `Ошибка Saby в ${method}`,
          { method, status: response.status, details: payload.error },
        );
      }
      return payload.result;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new SabyError(`Таймаут вызова ${method}`, { method });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchText(pathname) {
    const url = /^https?:\/\//.test(pathname)
      ? pathname
      : `${this.baseUrl}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ru-RU;q=0.8',
        cookie: this.cookie,
      },
    });
    if (!response.ok) {
      throw new SabyError(`Не удалось открыть ${url}: HTTP ${response.status}`, {
        status: response.status,
      });
    }
    return response.text();
  }

  /**
   * Разрешает ссылку/guid/id в числовой id документа.
   *
   * Проверка открывается по /doc/<guid>, а JSON-RPC работает с числовым
   * id. Числовой id есть в SSR-состоянии страницы: "entityKey":"632121183".
   */
  async resolveDocumentRef(ref) {
    if (ref == null || ref === '') {
      throw new SabyError('Не указана проверка: нужен id, guid или ссылка');
    }
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
      return { id: Number(ref), guid: null };
    }

    const raw = String(ref).trim();
    const guidMatch = raw.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    if (!guidMatch) {
      throw new SabyError(
        `Не удалось найти guid в "${raw}". Передайте числовой id, guid или ссылку на документ.`,
      );
    }
    const guid = guidMatch[0];
    if (this._guidCache.has(guid)) {
      return { id: this._guidCache.get(guid), guid };
    }

    const html = await this.fetchText(`/doc/${guid}?client=3`);
    const match = html.match(/"entityKey":"(\d+)"/);
    if (!match) {
      throw new SabyError(
        `Не удалось определить id документа по guid ${guid}. ` +
          'Откройте документ в браузере и проверьте доступ.',
      );
    }
    const id = Number(match[1]);
    this._guidCache.set(guid, id);
    return { id, guid };
  }

  async getUserId() {
    if (this._userId) return this._userId;
    const result = await this.call('SAP.GetUserId', {});
    this._userId = Number(result);
    return this._userId;
  }
}
