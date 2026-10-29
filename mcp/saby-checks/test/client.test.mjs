import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { CheckService } from '../checks.mjs';
import { SabyClient } from '../client.mjs';

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

async function startMock() {
  const seen = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.startsWith('/doc/')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html><body>doc</body><script>window.x={"docData":{"entityKey":"10"}}</script></html>');
      return;
    }
    if (req.method !== 'POST' || !req.url.startsWith('/service/')) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const payload = JSON.parse(body);
      seen.push({
        method: payload.method,
        headers: req.headers,
        params: payload.params,
      });
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
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { message: `mock: нет метода ${payload.method}` },
          id: 1,
          protocol: 7,
        }),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('SabyClient отправляет заголовки и разрешает guid в id', async () => {
  const mock = await startMock();
  try {
    const client = new SabyClient({
      baseUrl: mock.url,
      cookie: 'test-cookie=1',
      version: '26.5118',
      serviceVersion: '26.5118-135',
    });
    const ref = await client.resolveDocumentRef(
      'https://online.sbis.ru/opendoc.html?guid=01a163d8-bdf4-74c1-8905-341123ff78ce&client=3',
    );
    assert.equal(ref.id, 10);
    assert.equal(ref.guid, '01a163d8-bdf4-74c1-8905-341123ff78ce');
    assert.equal(await client.getUserId(), 42);

    const service = new CheckService(client);
    const check = await service.resolveCheck(ref);
    assert.equal(check.name, 'Тестовая проверка');
    assert.equal(check.template, 'Тестирование проекта');

    const tree = await service.getTree(10, 2);
    assert.equal(tree.stages[0].name, 'Этап 1');
    assert.equal(tree.stages[0].children.length, 0);

    const call = mock.seen.find((item) => item.method === 'SAP.GetUserId');
    assert.equal(call.headers['x-calledmethod'], 'SAP.GetUserId');
    assert.equal(call.headers['x-adaptive'], 'false');
    assert.equal(call.headers.cookie, 'test-cookie=1');
    assert.equal(
      Buffer.from(call.headers['x-originalmethodname'], 'base64').toString('utf8'),
      'SAP.GetUserId',
    );
  } finally {
    await mock.close();
  }
});
