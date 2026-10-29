import assert from 'node:assert/strict';
import test from 'node:test';

import { CheckService } from '../checks.mjs';
import { decodeRecord } from '../records.mjs';

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

class FakeClient {
  constructor() {
    this.baseUrl = 'https://example.test';
    this.calls = [];
    this.created = new Map();
    this.updated = new Map();
  }

  async getUserId() {
    return 42;
  }

  async call(method, params) {
    this.calls.push({ method, params });
    if (method === 'Проверка.ПрочитатьДляУчастника') {
      return record({
        '@Документ': params.ИдО,
        ИдентификаторДокумента: '01a163d8-bdf4-74c1-8905-341123ff78ce',
        Номер: '123',
        ДокументРасширение: undefined,
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
      });
    }
    if (method === 'ПунктПроверки.СписокПунктовПроверки') {
      const filter = decodeRecord(params.Фильтр);
      const parent = filter['ЧеклистСтруктура.Раздел'] ?? null;
      if (parent == null) {
        return recordset(
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
              'Описание этапа',
              [null],
              486,
              'Не тестировался',
              'P0DT0H30M0S',
              1,
              true,
              false,
            ],
          ],
        );
      }
      if (Number(parent) === 100) {
        return recordset(
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
              [200],
              210,
              'Пункт 1',
              'Шаги',
              [100],
              486,
              'Не тестировался',
              'P0DT0H10M0S',
              0,
              null,
              false,
            ],
          ],
        );
      }
      return recordset([], []);
    }
    if (method === 'ПунктПроверки.Создать') {
      const filter = decodeRecord(params.Фильтр);
      const isStage =
        filter['ЧеклистСтруктура.Раздел$'] === true &&
        filter['ЧеклистСтруктура.Раздел@'] === true;
      const id = isStage ? 300 : 301;
      this.created.set(id, filter);
      return record({ '@Документ': id });
    }
    if (method === 'ПунктПроверки.Записать') {
      const recordValue = params.Запись;
      const id = recordValue.d[0];
      this.updated.set(id, decodeRecord(recordValue));
      return id;
    }
    if (method === 'ПунктПроверки.ПрочитатьДляУчастника') {
      const id = params.ИдО;
      const update = this.updated.get(id) ?? {};
      return record({
        '@Документ': id,
        ИдентификаторДокумента: `guid-${id}`,
        'ЧеклистСтруктура.@ЧеклистСтруктура': id === 300 ? 400 : 401,
        'ЧеклистСтруктура.Раздел': update['ЧеклистСтруктура.Раздел'] ?? [100],
        'ЧеклистСтруктура.БазовыйРаздел': 10,
        'ЧеклистСтруктура.Название': update['ЧеклистСтруктура.Название'] ?? 'Без названия',
        'ЧеклистСтруктура.Версия': update['ЧеклистСтруктура.Версия'] ?? null,
        'ЧеклистСтруктура.ОбъектПланирования':
          update['ЧеклистСтруктура.ОбъектПланирования'] ?? 486,
        'ЧеклистСтруктура.ПлановоеВремя':
          update['ЧеклистСтруктура.ПлановоеВремя'] ?? 'P0DT0H0M0S',
        'ЧеклистСтруктура.Лицо': update['ЧеклистСтруктура.Лицо'] ?? null,
        Удален: false,
      });
    }
    if (method === 'Проверка.Создать') {
      return record({ '@Документ': 20 });
    }
    if (method === 'Проверка.Записать') {
      return params.Запись.d[0];
    }
    if (method === 'Проверка.СтатистикаПоПроверке') {
      return recordset(
        ['@ОбъектПланирования', 'Название', 'Статус', 'Цвет', 'Значение'],
        [
          [486, 'Не тестировался', 2, '#4745A1', '50%'],
          [488, 'Тестирование проведено', 0, '#24A83D', '50%'],
        ],
      );
    }
    if (method === 'Проверка.МассовоеИзменениеСтатусаИзПМО') {
      return true;
    }
    if (method === 'ПунктПроверки.Remove') {
      return true;
    }
    if (method === 'Документ.УдалитьДокументы') {
      return { deleted: params.ИдО };
    }
    throw new Error(`Неожиданный метод ${method}`);
  }
}

test('readCheck маппит карточку проверки', async () => {
  const client = new FakeClient();
  const service = new CheckService(client);
  const check = await service.readCheck(10);
  assert.equal(check.id, 10);
  assert.equal(check.name, 'Тестовая проверка');
  assert.equal(check.template, 'Тестирование проекта');
  assert.equal(check.structureRootId, 100);
  assert.equal(check.url, 'https://example.test/doc/01a163d8-bdf4-74c1-8905-341123ff78ce?client=3');
});

test('getTree читает этапы и вложенные пункты', async () => {
  const client = new FakeClient();
  const service = new CheckService(client);
  const tree = await service.getTree(10, 2);
  assert.equal(tree.stages.length, 1);
  assert.equal(tree.stages[0].name, 'Этап 1');
  assert.equal(tree.stages[0].children.length, 1);
  assert.equal(tree.stages[0].children[0].name, 'Пункт 1');
});

test('createCheck использует employeeId/departmentId и задаёт название', async () => {
  const client = new FakeClient();
  const service = new CheckService(client);
  const check = await service.createCheck({
    name: 'Новая проверка',
    employeeId: 42,
    departmentId: 43,
    date: '2026-10-29',
    time: '11:00:00.000',
  });
  assert.equal(check.id, 20);
  const create = client.calls.find((call) => call.method === 'Проверка.Создать');
  assert.ok(create);
  assert.equal(create.params.Фильтр.d[1], 42);
  assert.equal(create.params.Фильтр.d[2], 43);
  assert.equal(create.params.Фильтр.d[5], 485);
  const write = client.calls.find((call) => call.method === 'Проверка.Записать');
  assert.ok(write);
  assert.equal(write.params.Запись.d[1], 'Новая проверка');
});

test('createStage создаёт этап с флагами раздела и пишет поля', async () => {  const client = new FakeClient();
  const service = new CheckService(client);
  const stage = await service.createStage({
    checkId: 10,
    parentSectionId: 100,
    name: 'Новый этап',
    description: 'Описание',
    plannedMinutes: 30,
  });
  assert.equal(stage.id, 300);
  const create = client.created.get(300);
  assert.equal(create['ЧеклистСтруктура.Раздел$'], true);
  assert.equal(create['ЧеклистСтруктура.Раздел@'], true);
  assert.equal(create['ЧеклистСтруктура.Раздел'], 100);
  assert.equal(create['ЧеклистСтруктура.БазовыйРаздел'], 10);
  const update = client.updated.get(300);
  assert.equal(update['ЧеклистСтруктура.Название'], 'Новый этап');
  assert.equal(update['ЧеклистСтруктура.ПлановоеВремя'], 'P0DT0H30M0S');
});

test('createPoint создаёт пункт с флагами пункта и статусом', async () => {
  const client = new FakeClient();
  const service = new CheckService(client);
  const point = await service.createPoint({
    checkId: 10,
    parentSectionId: 200,
    name: 'Новый пункт',
    description: 'Шаги',
    plannedMinutes: 10,
    status: 'Тестирование проведено',
  });
  assert.equal(point.id, 301);
  const create = client.created.get(301);
  assert.equal(create['ЧеклистСтруктура.Раздел$'], false);
  assert.equal(create['ЧеклистСтруктура.Раздел@'], false);
  assert.equal(create['ЧеклистСтруктура.Раздел'], 200);
  const update = client.updated.get(301);
  assert.equal(update['ЧеклистСтруктура.ОбъектПланирования'], 488);
  assert.equal(update['ЧеклистСтруктура.ПлановоеВремя'], 'P0DT0H10M0S');
});

test('setStatus передаёт пункты и статус', async () => {
  const client = new FakeClient();
  const service = new CheckService(client);
  const result = await service.setStatus(10, [210], 'Выпускаем с ошибками');
  assert.equal(result.statusId, 490);
  const call = client.calls.find(
    (item) => item.method === 'Проверка.МассовоеИзменениеСтатусаИзПМО',
  );
  assert.deepEqual(call.params.Пункты, [210]);
  assert.equal(call.params.Статус, 490);
});

test('removePoints удаляет по id структуры, а не документа', async () => {
  const client = new FakeClient();
  const service = new CheckService(client);
  const result = await service.removePoints([307609331]);
  assert.deepEqual(result.structureIds, [307609331]);
  const call = client.calls.find((item) => item.method === 'ПунктПроверки.Remove');
  assert.ok(call);
  assert.deepEqual(call.params.ИдО, [307609331]);
});

test('collectStructureIds возвращает детей раньше родителя', async () => {
  const client = new FakeClient();
  const service = new CheckService(client);
  const ids = await service.collectStructureIds(10, 100);
  assert.deepEqual(ids, [200, 100]);
});

test('importScenario dryRun ничего не создаёт', async () => {
  const client = new FakeClient();
  const service = new CheckService(client);
  const result = await service.importScenario({
    checkId: 10,
    parentSectionId: 100,
    dryRun: true,
    sections: [
      {
        name: 'Новый этап',
        points: [{ name: 'Новый пункт' }],
      },
    ],
  });
  assert.equal(result.dryRun, true);
  assert.equal(result.totalPoints, 1);
  assert.equal(client.created.size, 0);
  assert.ok(result.plan.some((item) => item.action === 'createStage'));
  assert.ok(result.plan.some((item) => item.action === 'createPoint'));
});
