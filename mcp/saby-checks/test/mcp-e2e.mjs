#!/usr/bin/env node
/**
 * E2E-тест MCP поверх локального мока Saby.
 * Проверяет: tools/call → SabyClient → CheckService → JSON-ответ.
 *
 * Запуск: node mcp/saby-checks/test/mcp-e2e.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline';

function record(values) {
  const entries = Object.entries(values);
  return {
    _type: 'record',
    f: 0,
    s: entries.map(([name]) => ({ n: name, t: 'Строка' })),
    d: entries.map(([, value]) => value),
  };
}

function recordset(columns, rows) {
  return {
    _type: 'recordset',
    f: 0,
    s: columns.map((name) => ({ n: name, t: 'Строка' })),
    d: rows,
  };
}

const mock = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/doc/')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<html><script>window.x={"docData":{"entityKey":"10"}}</script></html>');
    return;
  }
  if (req.method !== 'POST' || !req.url.startsWith('/service/')) {
    res.writeHead(404);
    res.end();
    return;
  }
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const payload = JSON.parse(body);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    if (payload.method === 'SAP.GetUserId') {
      res.end(JSON.stringify({ jsonrpc: '2.0', result: 42, id: 1, protocol: 7 }));
      return;
    }
    if (payload.method === 'Проверка.ПрочитатьДляУчастника') {
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          result: record({
            '@Документ': 10,
            ИдентификаторДокумента: '01a163d8-bdf4-74c1-8905-341123ff78ce',
            Номер: '123',
            'ДокументРасширение.Название': 'Тестовая проверка',
            'РазличныеДокументы.ИнформацияJSON':
              '[["p",{"version":"2"},"Тестовая проверка"]]',
            Дата: '2026-10-29',
            Время: '11:00:00.000',
            Удален: false,
            Сотрудник: 42,
            Подразделение: 43,
            'ОбъектПланирования.@ОбъектПланирования': 485,
            'ОбъектПланирования.Название': 'Тестирование проекта',
            'ЧеклистСтруктура.@ЧеклистСтруктура': 100,
          }),
          id: 1,
          protocol: 7,
        }),
      );
      return;
    }
    if (payload.method === 'ПунктПроверки.СписокПунктовПроверки') {
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          result: recordset(
            [
              '@ЧеклистСтруктура',
              'Документ',
              'ЧеклистСтруктура.Название',
              'ЧеклистСтруктура.Версия',
              'ЧеклистСтруктура.Раздел',
              'ЧеклистСтруктура.ОбъектПланирования',
              'ТекущееСостояние',
              'ЧеклистСтруктура.ПлановоеВремя',
              'КолВо',
              'ЕстьВложенные',
              'Удален',
            ],
            [
              [
                [100],
                110,
                'Этап 1',
                'Описание',
                [null],
                486,
                'Не тестировался',
                'P0DT0H30M0S',
                1,
                true,
                false,
              ],
            ],
          ),
          id: 1,
          protocol: 7,
        }),
      );
      return;
    }
    res.end(JSON.stringify({ jsonrpc: '2.0', result: [], id: 1, protocol: 7 }));
  });
});

await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
const port = mock.address().port;
const root = path.resolve(import.meta.dirname, '../../..');
const child = spawn(process.execPath, ['mcp/saby-checks/server.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    SABY_BASE_URL: `http://127.0.0.1:${port}`,
    SABY_COOKIE: 'test-cookie=1',
    SABY_STORAGE_STATE: '.auth/does-not-exist.json',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

const lines = readline.createInterface({ input: child.stdout });
const waiters = new Map();
lines.on('line', (line) => {
  try {
    const message = JSON.parse(line);
    if (message.id != null && waiters.has(message.id)) {
      waiters.get(message.id)(message);
      waiters.delete(message.id);
    }
  } catch {
    // ignore stderr noise
  }
});

function request(id, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), 10000);
    waiters.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function parseTool(message) {
  assert.ok(message.result?.content?.[0]?.text, JSON.stringify(message));
  return JSON.parse(message.result.content[0].text);
}

try {
  await request(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e', version: '1.0.0' },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const got = parseTool(
    await request(2, 'tools/call', {
      name: 'saby_check_get',
      arguments: { check: 'https://online.sbis.ru/doc/01a163d8-bdf4-74c1-8905-341123ff78ce?client=3' },
    }),
  );
  assert.equal(got.name, 'Тестовая проверка');

  const tree = parseTool(
    await request(3, 'tools/call', {
      name: 'saby_check_tree',
      arguments: { check: '10', depth: 2 },
    }),
  );
  assert.equal(tree.stages[0].name, 'Этап 1');

  const plan = parseTool(
    await request(4, 'tools/call', {
      name: 'saby_check_import_scenario',
      arguments: {
        check: '10',
        parentSectionId: 100,
        dryRun: true,
        sections: [{ name: 'Этап 1', points: [{ name: 'ТК: Новый пункт', comment: 'Проверяем новый пункт', plannedMinutes: 5 }] }],
      },
    }),
  );
  assert.equal(plan.dryRun, true);
  assert.ok(plan.plan.some((item) => item.action === 'createPoint'));

  console.log('OK: MCP e2e на моке — get/tree/import dryRun работают');
} finally {
  child.kill();
  await new Promise((resolve) => mock.close(resolve));
}
