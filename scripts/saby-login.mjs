#!/usr/bin/env node
/**
 * Один раз открывает браузер, ждёт вход в Saby и сохраняет storageState.
 *
 * Запуск: npm run saby:login
 * Результат: .auth/saby.json (не коммитится).
 *
 * Скрипт не требует ввода в терминале: он сам определяет, что сессия
 * появилась, и сохраняет её. Закройте окно после сообщения об успехе.
 */

import fs from 'node:fs';
import path from 'node:path';

import 'dotenv/config';
import { chromium } from 'playwright';

const baseUrl = (process.env.SABY_BASE_URL || 'https://online.sbis.ru').replace(/\/$/, '');
const storagePath = path.resolve(process.env.SABY_STORAGE_STATE || '.auth/saby.json');
const timeoutMs = Number(process.env.SABY_LOGIN_TIMEOUT_MS || 10 * 60 * 1000);

fs.mkdirSync(path.dirname(storagePath), { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

console.log(`Открываю ${baseUrl}`);
console.log('Войдите в Saby в открывшемся окне. Ожидание входа...');
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

const b64 = (value) => Buffer.from(value, 'utf8').toString('base64');

async function getUserId() {
  try {
    return await page.evaluate(async ({ originalHeader }) => {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      const lastModification =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.000000+03`;
      const response = await fetch('/service/?x_version=26.5118-135', {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'application/json, text/javascript, */*; q=0.01',
          'content-type': 'application/json; charset=UTF-8',
          'x-adaptive': 'false',
          'x-requested-with': 'XMLHttpRequest',
          'x-calledmethod': 'SAP.GetUserId',
          'x-originalmethodname': originalHeader,
          'x-saby-appid': 'd7b1d6a5-e59d-4b03-b823-726fbdc35d09',
          'x-saby-appversion': '26.5118',
          'x-saby-cfgid': '2725babf-70e1-4f04-8e78-1b4272de7b21',
          'x-lastmodification': lastModification,
          'x-osversion': 'OSType=Windows;OSVersion=10.0;IsWin11=true',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          protocol: 7,
          method: 'SAP.GetUserId',
          params: {},
          id: 1,
        }),
      });
      const payload = await response.json();
      return payload?.result ?? null;
    }, { originalHeader: b64('SAP.GetUserId') });
  } catch {
    return null;
  }
}

const started = Date.now();
let userId = null;
while (Date.now() - started < timeoutMs) {
  userId = await getUserId();
  if (userId) break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (!userId) {
  console.error('Не дождались входа в Saby. Сессия не сохранена.');
  await browser.close();
  process.exit(1);
}

await context.storageState({ path: storagePath });
console.log(`Сессия сохранена: ${storagePath}`);
console.log(`id пользователя: ${userId}`);
console.log('Можно закрывать окно браузера.');

await browser.close();
