#!/usr/bin/env node
/**
 * Массовое создание папок-этапов в проверке Saby.
 *
 * Пример:
 *   npm run saby:bulk-stages -- \
 *     --check https://online.sbis.ru/doc/<guid>?client=3 \
 *     --parent 310088033 \
 *     --file docs/scenarios/api-local-contractors-folders.json \
 *     --dry-run
 *
 * Формат файла:
 *   {
 *     "folders": [{ "name": "...", "comment": "..." }],
 *     "groups": [{ "name": "...", "comment": "...", "folders": [...] }]
 *   }
 *
 * Авторизация: `npm run saby:login` (файл .auth/saby.json) или SABY_COOKIE.
 * Если в карточке проверки не заполнены сотрудник/подразделение, задайте
 * SABY_EMPLOYEE_ID и SABY_DEPARTMENT_ID или флаги --employee-id/--department-id.
 */

import fs from 'node:fs';
import path from 'node:path';

import 'dotenv/config';
import { SabyClient } from '../mcp/saby-checks/client.mjs';
import { CheckService } from '../mcp/saby-checks/checks.mjs';

function usage() {
  console.log(`Массовое создание папок-этапов в проверке Saby.

Обязательные параметры:
  --check, -c <id|guid|url>   Проверка
  --file, -f <path>           JSON со списком folders/groups

Необязательные:
  --parent, -p <structureId>  structureId родителя (по умолчанию корень проверки)
  --dry-run                   Показать план без записи
  --no-update                 Не обновлять комментарии существующих папок
  --delay <ms>                Пауза между записями (по умолчанию 100)
  --employee-id <id>          Сотрудник для создания (или SABY_EMPLOYEE_ID)
  --department-id <id>        Подразделение (или SABY_DEPARTMENT_ID)
  --help, -h                  Эта справка

Пример:
  npm run saby:bulk-stages -- --check 01a20880-eb7e-721e-a512-151fedec08fc \\
    --parent 310088033 --file docs/scenarios/api-local-contractors-folders.json --dry-run
`);
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    updateExisting: true,
    delayMs: 100,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Не указано значение для ${arg}`);
      return argv[index];
    };
    switch (arg) {
      case '--check':
      case '-c':
        args.check = next();
        break;
      case '--parent':
      case '-p':
        args.parentSectionId = Number(next());
        break;
      case '--file':
      case '-f':
        args.file = next();
        break;
      case '--delay':
        args.delayMs = Number(next());
        break;
      case '--employee-id':
        args.employeeId = Number(next());
        break;
      case '--department-id':
        args.departmentId = Number(next());
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--no-update':
        args.updateExisting = false;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }
  return args;
}

function readData(filePath) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Файл не найден: ${absolute}`);
  }
  const data = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!Array.isArray(data.folders) && !Array.isArray(data.groups)) {
    throw new Error(
      'В JSON нужен массив folders и/или groups. Пример: ' +
        '{ "folders": [{ "name": "...", "comment": "..." }] }',
    );
  }
  return {
    folders: Array.isArray(data.folders) ? data.folders : [],
    groups: Array.isArray(data.groups) ? data.groups : [],
  };
}

function printPlan(result) {
  const rows = result.plan ?? [];
  if (rows.length === 0) {
    console.log('План пуст.');
    return;
  }
  let currentGroup = null;
  for (const row of rows) {
    if (row.group && row.group !== currentGroup) {
      currentGroup = row.group;
      console.log(`\n[${currentGroup}]`);
    }
    const action = String(row.action ?? '').toUpperCase().padEnd(6);
    const doc = row.docId ? ` (doc ${row.docId})` : '';
    const parent = row.parentSectionId ? ` -> ${row.parentSectionId}` : '';
    console.log(`${action} ${row.name}${parent}${doc}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.check) throw new Error('Укажите --check');
  if (!args.file) throw new Error('Укажите --file');
  if (!args.dryRun) {
    if (args.employeeId) process.env.SABY_EMPLOYEE_ID = String(args.employeeId);
    if (args.departmentId) process.env.SABY_DEPARTMENT_ID = String(args.departmentId);
  }

  const { folders, groups } = readData(args.file);
  const client = new SabyClient({
    baseUrl: process.env.SABY_BASE_URL || 'https://online.sbis.ru',
  });
  const service = new CheckService(client);
  const check = await service.resolveCheck(args.check);

  console.log(
    `Проверка: ${check.name} (id ${check.id}, base ${check.baseSectionId ?? check.id})`,
  );
  console.log(
    `Режим: ${args.dryRun ? 'dry-run (без записи)' : 'запись'}; ` +
      `папок: ${folders.length}, групп: ${groups.length}`,
  );

  const result = await service.bulkCreateStages({
    check,
    parentSectionId: args.parentSectionId,
    folders,
    groups,
    updateExisting: args.updateExisting,
    dryRun: args.dryRun,
    delayMs: args.delayMs,
  });

  console.log(`Родитель: ${result.parentSectionId}`);
  printPlan(result);
  if (args.dryRun) {
    console.log(
      `\nПлан: создать ${result.planTotals.create}, обновить ${result.planTotals.update}, ` +
        `пропустить ${result.planTotals.skip}`,
    );
  }
  console.log(
    `\nИтого: создано ${result.totals.created}, обновлено ${result.totals.updated}, ` +
      `пропущено ${result.totals.skipped}, ошибок ${result.totals.failed}`,
  );
  for (const failure of result.failed) {
    console.error(`FAIL ${failure.name}: ${failure.error}`);
  }
  if (result.totals.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
