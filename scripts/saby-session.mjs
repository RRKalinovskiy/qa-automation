#!/usr/bin/env node
/**
 * Диагностика сессии Saby: проверяет cookie/storageState и доступ к API.
 *
 * Запуск: npm run saby:session
 */

import 'dotenv/config';
import { SabyClient } from '../mcp/saby-checks/client.mjs';

try {
  const client = new SabyClient();
  const userId = await client.call('SAP.GetUserId', {});
  console.log(`Авторизация работает. SABY_BASE_URL=${client.baseUrl}`);
  console.log(`id пользователя: ${userId}`);
} catch (error) {
  console.error('Авторизация не работает: ' + error.message);
  console.error('Выполните `npm run saby:login` или задайте SABY_COOKIE.');
  process.exitCode = 1;
}
