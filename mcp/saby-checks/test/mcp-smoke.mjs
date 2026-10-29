#!/usr/bin/env node
/**
 * Дымовой тест MCP-сервера: initialize + tools/list.
 * Не требует авторизации в Saby.
 *
 * Запуск: node mcp/saby-checks/test/mcp-smoke.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

const root = path.resolve(import.meta.dirname, '../../..');
const child = spawn(process.execPath, ['mcp/saby-checks/server.mjs'], {
  cwd: root,
  env: { ...process.env, SABY_COOKIE: 'smoke-test' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

const lines = readline.createInterface({ input: child.stdout });
const waiters = new Map();

lines.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id != null && waiters.has(message.id)) {
    waiters.get(message.id)(message);
    waiters.delete(message.id);
  }
});

function request(id, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error(`Таймаут ответа на ${method}`));
    }, 10000);
    waiters.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

try {
  const init = await request(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'saby-checks-smoke', version: '1.0.0' },
  });
  assert.equal(init.result?.serverInfo?.name, 'saby-checks');
  notify('notifications/initialized', {});
  const list = await request(2, 'tools/list', {});
  const names = (list.result?.tools ?? []).map((tool) => tool.name);
  assert.ok(names.includes('saby_check_get'));
  assert.ok(names.includes('saby_check_import_scenario'));
  assert.ok(names.includes('saby_check_verify'));
  assert.ok(names.includes('saby_project_get'));
  assert.ok(names.includes('saby_project_map'));
  assert.ok(names.includes('saby_project_check_draft'));
  console.log(`OK: MCP отвечает, инструментов ${names.length}`);
  console.log(names.join('\n'));
} finally {
  child.kill();
}
