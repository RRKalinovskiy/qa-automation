import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeRecord, encodeRecordSet } from '../records.mjs';
import {
  ProjectService,
  extractProjectRef,
  extractRequirements,
  frameToText,
  mapDocument,
  mapProject,
  mapStage,
  normalizeDocText,
} from '../project.mjs';

function rec(fields) {
  return encodeRecord(
    fields.map(([name, type, value]) => ({ name, type, value })),
  );
}

function recordset(columns, rows) {
  return encodeRecordSet(
    columns.map(([name, type]) => ({ name, type })),
    rows,
  );
}

class FakeProjectClient {
  constructor() {
    this.calls = [];
  }

  async call(method) {
    this.calls.push(method);
    if (method === 'Проект.ПрочитатьДляУчастника') {
      return rec([
        ['@Документ', 'Число целое', 589931974],
        [
          'ИдентификаторДокумента',
          'UUID',
          '3afb3d94-a129-43bc-a1e1-9134468b3dc4',
        ],
        [
          'ДокументРасширение.Название',
          'Строка',
          'Двухпанельная карточка клиента физического лица',
        ],
        ['Проект.Описание', 'Строка', '<p>Дать больше информации о клиенте.</p>'],
        [
          'СписокЭтапов',
          'Выборка',
          recordset(
            [
              ['Ид', 'Идентификатор'],
              ['Название', 'Строка'],
              ['ИдентификаторДокумента', 'UUID'],
              ['ПланДатаНач', 'Дата'],
              ['ДокументРасширение.Срок', 'Дата'],
              ['Проект.СостояниеПроекта', 'Перечисляемое'],
              ['НазваниеСотрудника', 'Строка'],
              ['Задания', 'Число целое'],
            ],
            [
              [
                [589932231],
                'Разработка шапки карточки',
                '019eb574-a794-79f7-b951-5cb86d9517ca',
                '2026-06-11',
                '2026-11-20',
                1,
                'Мугинов Э.И.',
                1,
              ],
            ],
          ),
        ],
      ]);
    }
    if (method === 'Проект.AttachList') {
      return recordset(
        [
          ['attachId', 'Строка'],
          ['redactionId', 'Строка'],
          ['title', 'Строка'],
          ['fileName', 'Строка'],
          ['FileId', 'Строка'],
          ['objectUuid', 'UUID'],
          ['createDate', 'Дата и время'],
          ['responsibleName', 'Строка'],
          ['countRedactions', 'Число целое'],
          ['countSigns', 'Число целое'],
          ['hidden', 'Логическое'],
        ],
        [
          [
            '728477701',
            '767362934',
            'Техническое задание',
            'Техническое задание.sabydoc',
            'f5679033-f516-478d-8f81-1b4bec442984',
            '3afb3d94-a129-43bc-a1e1-9134468b3dc4',
            '2026-07-06 10:11:47',
            'Мугинов Эдуард',
            9,
            0,
            false,
          ],
        ],
      );
    }
    if (method === 'SiteDocument.Read') {
      const frame = [
        'frame',
        {},
        ['DocsEditor/documentHeader:View', {}, '2. Интерфейс'],
        [
          'ModuleEditor/paragraph:View',
          {},
          ['ModuleEditor/formattedText:View', {}, 'Карточка должна содержать две колонки.'],
        ],
      ];
      const siteInfo = rec([
        ['Id', 'UUID', '329a4f74-af4d-42b3-9b4c-c2db9eb875c1'],
        [
          'PropertyValues',
          'Запись',
          rec([
            [
              'tableOfContents',
              'Массив',
              [
                rec([
                  ['id', 'Строка', 'h1'],
                  ['parentId', 'Строка', null],
                  ['level', 'Число целое', 1],
                  ['text', 'Строка', '2. Интерфейс'],
                ]),
              ],
            ],
          ]),
        ],
        [
          'Pages',
          'Массив',
          [rec([['Content', 'JSON-объект', frame]])],
        ],
      ]);
      return rec([['siteInfo', 'Запись', siteInfo]]);
    }
    throw new Error(`Неожиданный метод ${method}`);
  }
}


test('extractProjectRef понимает ссылку, uuid и числовой id', () => {
  assert.equal(
    extractProjectRef(
      'https://project.sbis.ru/uuid/3afb3d94-a129-43bc-a1e1-9134468b3dc4/page/project-main',
    ),
    '3afb3d94-a129-43bc-a1e1-9134468b3dc4',
  );
  assert.equal(extractProjectRef('3afb3d94-a129-43bc-a1e1-9134468b3dc4'), '3afb3d94-a129-43bc-a1e1-9134468b3dc4');
  assert.equal(extractProjectRef('589931974'), 589931974);
  assert.throws(() => extractProjectRef('нет ссылки'), /Не удалось найти/);
});

test('frameToText собирает заголовки, абзацы и таблицы', () => {
  const frame = [
    'frame',
    {},
    ['DocsEditor/documentHeader:View', {}, 'Техническое задание'],
    [
      'ModuleEditor/textLayout:View',
      {},
      [
        'ModuleEditor/paragraph:View',
        {},
        ['ModuleEditor/formattedText:View', {}, 'Карточка должна содержать две колонки.'],
      ],
      [
        'ModuleEditor/table:View',
        {},
        [
          'ModuleEditor/table:Row',
          {},
          ['ModuleEditor/table:Cell', {}, 'Поле'],
          ['ModuleEditor/table:Cell', {}, 'Обязательное'],
        ],
      ],
    ],
  ];
  const text = normalizeDocText(frameToText(frame));
  assert.match(text, /Техническое задание/);
  assert.match(text, /Карточка должна содержать две колонки/);
  assert.match(text, /Поле \| Обязательное/);
});

test('extractRequirements выделяет разделы и требования-утверждения', () => {
  const text = `1. Цели проекта
Показать больше информации о клиенте за счет двухпанельной раскладки.
2. Интерфейс
Карточка должна содержать две колонки: левую и правую.
Кнопка «Сохранить» должна быть доступна в шапке карточки.`;
  const requirements = extractRequirements(
    text,
    [
      { text: '1. Цели проекта', level: 1 },
      { text: '2. Интерфейс', level: 1 },
    ],
    { source: 'Техническое задание', max: 10 },
  );
  assert.ok(requirements.some((item) => item.title === '1. Цели проекта'));
  assert.ok(requirements.some((item) => /две колонки/.test(item.text)));
  assert.ok(requirements.every((item) => item.id.startsWith('T-')));
  assert.ok(requirements.every((item) => item.source === 'Техническое задание'));
});

test('mapStage и mapDocument приводят поля проекта к читаемому виду', () => {
  const stage = mapStage({
    Ид: [589932231],
    Название: 'Проектирование и ТЗ',
    ИдентификаторДокумента: 'f6d27ea7-3ab2-4ead-8d7a-6c52af7c75cb',
    ПланДатаНач: '2026-04-22',
    'ДокументРасширение.Срок': '2026-06-30',
    'Проект.СостояниеПроекта': 12,
    НазваниеСотрудника: 'Шеманаев Д.С.',
    Задания: 2,
  });
  assert.equal(stage.id, 589932231);
  assert.equal(stage.name, 'Проектирование и ТЗ');
  assert.equal(stage.statusLabel, 'Завершён');
  assert.match(stage.url, /stage-main/);

  const document = mapDocument({
    attachId: '728477701',
    redactionId: '767362934',
    title: 'Техническое задание',
    fileName: 'Техническое задание.sabydoc',
    responsibleName: 'Мугинов Эдуард',
    countRedactions: 9,
    hidden: false,
  });
  assert.equal(document.attachId, '728477701');
  assert.equal(document.isSabyDoc, true);
  assert.equal(document.redactions, 9);
});

test('mapProject собирает этапы и ссылку на проект', () => {
  const project = mapProject({
    '@Документ': 589931974,
    'ИдентификаторДокумента': '3afb3d94-a129-43bc-a1e1-9134468b3dc4',
    'ДокументРасширение.Название': 'Двухпанельная карточка клиента физического лица',
    'Проект.Описание': '<p>Дать больше информации о клиенте.</p>',
    'СписокЭтапов': [
      {
        Ид: [589932231],
        Название: 'Проектирование и ТЗ',
        ИдентификаторДокумента: 'f6d27ea7-3ab2-4ead-8d7a-6c52af7c75cb',
      },
    ],
  });
  assert.equal(project.id, 589931974);
  assert.equal(project.stages.length, 1);
  assert.match(project.description, /больше информации/);
  assert.match(project.url, /project-main/);
});

test('buildCheckDraft раскладывает требования по этапам', async () => {
  const service = new ProjectService({});
  service.buildMap = async () => ({
    project: {
      title: 'Тестовый проект',
      url: 'https://project.sbis.ru/uuid/test/page/project-main',
    },
    stages: [
      { name: 'Карточка клиента', startDate: '2026-01-01', endDate: '2026-02-01' },
    ],
    documents: [],
    requirements: [
      {
        id: 'T-001',
        title: 'Карточка должна содержать две колонки',
        section: 'Карточка клиента',
        text: 'Карточка должна содержать две колонки.',
        source: 'Техническое задание',
      },
    ],
    requirementSources: [{ attachId: '1', title: 'Техническое задание' }],
  });
  const draft = await service.buildCheckDraft('test');
  assert.equal(draft.sections.length, 1);
  assert.equal(draft.sections[0].points.length, 1);
  assert.equal(draft.sections[0].points[0].type, 'Т');
  assert.match(draft.sections[0].points[0].name, /^Т: /);
  assert.equal(draft.totalPoints, 1);
  assert.ok(draft.warnings.length >= 1);
});

test('ProjectService читает проект, документы и SabyDoc', async () => {
  const client = new FakeProjectClient();
  const service = new ProjectService(client);
  const project = await service.readProject(
    'https://project.sbis.ru/uuid/3afb3d94-a129-43bc-a1e1-9134468b3dc4/page/project-main',
  );
  assert.equal(project.id, 589931974);
  assert.equal(project.stages.length, 1);
  assert.equal(project.stages[0].name, 'Разработка шапки карточки');

  const documents = await service.listDocuments(project.uuid);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].isSabyDoc, true);

  const read = await service.readDocument(project.uuid, '728477701');
  assert.match(read.text, /две колонки/);
  assert.equal(read.headings[0].text, '2. Интерфейс');
  assert.ok(read.requirements.some((item) => /две колонки/.test(item.text)));

  const map = await service.buildMap(project.uuid, {
    maxDocuments: 1,
    maxRequirements: 10,
  });
  assert.equal(map.coverage.stages, 1);
  assert.equal(map.coverage.documents, 1);
  assert.ok(map.coverage.requirements >= 1);
  assert.ok(client.calls.includes('SiteDocument.Read'));
  assert.ok(
    client.calls.every((method) =>
      [
        'Проект.ПрочитатьДляУчастника',
        'Проект.AttachList',
        'SiteDocument.Read',
      ].includes(method),
    ),
    'project service должен вызывать только read-only методы',
  );
});

