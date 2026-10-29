import {
  decodeRecord,
  decodeRecordSet,
  durationToMinutes,
  encodeRecord,
  firstValue,
  formatDate,
  formatTime,
  minutesToDuration,
} from './records.mjs';
import {
  DEFAULT_POINT_TYPE,
  MIN_CHECKLIST_IDEAS,
  clampPlannedMinutes,
  defaultMarkForType,
  formatTestDescription,
  hasTestPrefix,
  normalizeMark,
  normalizeTestName,
  renameWithType,
  resolvePointType,
  validatePointRules,
} from './rules.mjs';
import {
  DEFAULT_STATUSES,
  normalizeStatuses,
  resolveStatus,
  statusName,
} from './statuses.mjs';
import { SabyError } from './client.mjs';

export const CHECK_DOC_TYPE = 'Проверка';
export const POINT_DOC_TYPE = 'ПунктПроверки';
export const DEFAULT_TEMPLATE_ID = 485; // «Тестирование проекта» на стенде online.sbis.ru

const CHECK_READ = (id) => ({
  ИдО: id,
  ИмяМетода: 'Проверка.Список',
  ДопПоля: { ИмяОбъекта: CHECK_DOC_TYPE },
});

const POINT_READ = (id) => ({
  ИдО: id,
  ИмяМетода: 'ПунктПроверки.Список',
  ДопПоля: { ИмяОбъекта: POINT_DOC_TYPE },
});

const POINT_FILTER = (checkId, parentStructureId) => {
  if (parentStructureId == null) {
    return encodeRecord([
      { name: 'Документ', type: 'Число целое', value: checkId },
      { name: 'ИдРегламента', type: 'Строка', value: null },
      { name: 'СЗадачами', type: 'Число целое', value: 0 },
      { name: 'ФильтрПереключатель', type: 'Число целое', value: 0 },
      { name: 'ФильтрПериод', type: { n: 'Массив', t: 'Строка' }, value: [null, null] },
      { name: 'ФильтрПометкиВкл', type: { n: 'Массив', t: 'Строка' }, value: [] },
      { name: 'ФильтрПометкиИскл', type: { n: 'Массив', t: 'Строка' }, value: [] },
    ]);
  }
  return encodeRecord([
    { name: 'Документ', type: 'Число целое', value: checkId },
    { name: 'ИдРегламента', type: 'Строка', value: null },
    { name: 'СЗадачами', type: 'Число целое', value: 0 },
    { name: 'ФильтрПереключатель', type: 'Число целое', value: 0 },
    { name: 'ФильтрПериод', type: { n: 'Массив', t: 'Строка' }, value: [null, null] },
    { name: 'ФильтрПометкиВкл', type: { n: 'Массив', t: 'Строка' }, value: [] },
    { name: 'ФильтрПометкиИскл', type: { n: 'Массив', t: 'Строка' }, value: [] },
    { name: 'ЧеклистСтруктура.Раздел', type: 'Число целое', value: parentStructureId },
    { name: 'ПоискПоОписанию', type: 'Логическое', value: false },
  ]);
};

const NAVIGATION = () =>
  encodeRecord([
    { name: 'ЕстьЕще', type: 'Логическое', value: true },
    { name: 'РазмерСтраницы', type: 'Число целое', value: 200 },
    { name: 'Страница', type: 'Число целое', value: 0 },
  ]);

const SORT_BY_ORDER = () => ({
  _type: 'recordset',
  f: 0,
  s: [
    { n: 'l', t: 'Логическое' },
    { n: 'n', t: 'Строка' },
    { n: 'o', t: 'Логическое' },
  ],
  d: [[false, 'ЧеклистСтруктура.ПорНомер', true]],
});

const STATUS_FILTER = (checkId) =>
  encodeRecord([
    { name: 'Документ', type: 'Число целое', value: checkId },
    { name: 'ИдРегламента', type: 'Строка', value: null },
    { name: 'СЗадачами', type: 'Число целое', value: 0 },
    { name: 'ФильтрПереключатель', type: 'Число целое', value: 0 },
    { name: 'ФильтрПериод', type: { n: 'Массив', t: 'Строка' }, value: [null, null] },
    { name: 'ФильтрПометкиВкл', type: { n: 'Массив', t: 'Строка' }, value: [] },
    { name: 'ФильтрПометкиИскл', type: { n: 'Массив', t: 'Строка' }, value: [] },
  ]);

function parseNameFromInfoJson(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (Array.isArray(item) && typeof item[2] === 'string' && item[2].trim()) {
          return item[2];
        }
      }
    }
  } catch {
    // ignore: поле может быть не JSON
  }
  return null;
}

const IDEA_STOP_WORDS = new Set([
  'проверка',
  'проверяем',
  'проверить',
  'карточка',
  'карточки',
  'карточке',
  'клиент',
  'клиента',
  'клиенту',
  'клиенты',
  'фл',
  'поле',
  'поля',
  'полей',
  'блок',
  'блока',
  'данные',
  'данных',
  'значение',
  'значения',
  'ввод',
  'ввода',
  'форма',
  'формы',
]);

export function ideaTokens(name) {
  const text = String(name ?? '')
    .replace(/^(ТК|ЧЛ|Т)\s*[:.\-–—]?\s*/u, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const tokens = text
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !IDEA_STOP_WORDS.has(token));
  return [...new Set(tokens)];
}

export function ideaSimilarity(left, right) {
  const a = new Set(ideaTokens(left));
  const b = new Set(ideaTokens(right));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function extractId(result, method) {
  if (typeof result === 'number') return result;
  if (typeof result === 'string' && /^\d+$/.test(result)) return Number(result);
  if (result && result._type === 'record') {
    const record = decodeRecord(result);
    const id =
      record['@Документ'] ??
      record['ЧеклистСтруктура.@ЧеклистСтруктура'] ??
      firstValue(record['@ЧеклистСтруктура']) ??
      result.d?.[0];
    if (id != null) return Number(id);
  }
  if (Array.isArray(result) && result.length) return Number(result[0]);
  throw new SabyError(`${method} не вернул идентификатор созданного объекта`, {
    method,
  });
}

export class CheckService {
  constructor(client) {
    this.client = client;
  }

  async resolveCheck(ref) {
    let resolved;
    if (ref && typeof ref === 'object' && ref.id != null) {
      resolved = { id: Number(ref.id), guid: ref.guid ?? null };
    } else {
      resolved = await this.client.resolveDocumentRef(ref);
    }
    const { id, guid } = resolved;
    const check = await this.readCheck(id);
    if (guid && check.guid && check.guid.toLowerCase() !== guid.toLowerCase()) {
      throw new SabyError(
        `Ссылка указывает на ${guid}, но документ ${id} имеет guid ${check.guid}. ` +
          'Проверьте, что открыта карточка проверки.',
      );
    }
    return check;
  }

  async readCheck(id) {
    const raw = await this.client.call(
      'Проверка.ПрочитатьДляУчастника',
      CHECK_READ(id),
    );
    const record = decodeRecord(raw);
    const name =
      record['ДокументРасширение.Название'] ||
      parseNameFromInfoJson(record['РазличныеДокументы.ИнформацияJSON']) ||
      null;
    const guid = record['ИдентификаторДокумента'];
    return {
      id: Number(record['@Документ'] ?? id),
      guid,
      number: record['Номер'] ?? null,
      name,
      date: record['Дата'] ?? null,
      time: record['Время'] ?? null,
      deleted: record['Удален'] ?? false,
      employeeId: record['Сотрудник'] ?? null,
      departmentId: record['Подразделение'] ?? null,
      templateId: record['ОбъектПланирования.@ОбъектПланирования'] ?? null,
      template: record['ОбъектПланирования.Название'] ?? null,
      structureRootId: record['ЧеклистСтруктура.@ЧеклистСтруктура'] ?? null,
      url: guid ? `${this.client.baseUrl}/doc/${guid}?client=3` : null,
      raw: record,
    };
  }

  async readPoint(id) {
    const raw = await this.client.call(
      'ПунктПроверки.ПрочитатьДляУчастника',
      POINT_READ(id),
    );
    const record = decodeRecord(raw);
    const plannedTime = record['ЧеклистСтруктура.ПлановоеВремя'] ?? null;
    return {
      id: Number(record['@Документ'] ?? id),
      guid: record['ИдентификаторДокумента'] ?? null,
      structureId: record['ЧеклистСтруктура.@ЧеклистСтруктура'] ?? null,
      parentStructureId: firstValue(record['ЧеклистСтруктура.Раздел']),
      checkId: record['ЧеклистСтруктура.БазовыйРаздел'] ?? null,
      name: record['ЧеклистСтруктура.Название'] ?? null,
      comment: record['ЧеклистСтруктура.Комментарий'] ?? null,
      description: record['ЧеклистСтруктура.Описание'] ?? null,
      statusComment: record['ЧеклистСтруктура.Версия'] ?? null,
      statusId: record['ЧеклистСтруктура.ОбъектПланирования'] ?? null,
      statusName: statusName(record['ЧеклистСтруктура.ОбъектПланирования']),
      plannedTime,
      plannedMinutes: durationToMinutes(plannedTime),
      assigneeId: record['ЧеклистСтруктура.Лицо'] ?? null,
      deleted: record['Удален'] ?? false,
      raw: record,
    };
  }

  async listChildren(checkId, parentStructureId = null) {
    const raw = await this.client.call(
      'ПунктПроверки.СписокПунктовПроверки',
      {
        Фильтр: POINT_FILTER(checkId, parentStructureId),
        Сортировка: SORT_BY_ORDER(),
        Навигация: NAVIGATION(),
        ДопПоля: [],
      },
    );
    const rows = decodeRecordSet(raw);
    return rows.map((row) => {
      const plannedTime = row['ЧеклистСтруктура.ПлановоеВремя'] ?? null;
      const structureId = firstValue(row['@ЧеклистСтруктура']);
      return {
        structureId,
        docId: row['Документ'] ?? null,
        name: row['ЧеклистСтруктура.Название'] ?? null,
        description: row['ЧеклистСтруктура.Версия'] ?? null,
        parentStructureId: firstValue(row['ЧеклистСтруктура.Раздел']),
        statusId: row['ЧеклистСтруктура.ОбъектПланирования'] ?? null,
        statusName: row['ТекущееСостояние'] ?? statusName(row['ЧеклистСтруктура.ОбъектПланирования']),
        plannedTime,
        plannedMinutes: durationToMinutes(plannedTime),
        count: Number(row['КолВо'] ?? 0),
        hasChildren: Boolean(row['ЕстьВложенные']) || Number(row['КолВо'] ?? 0) > 0,
        deleted: row['Удален'] ?? false,
      };
    });
  }

  async getTree(checkId, depth = 2) {
    const check = await this.readCheck(checkId);
    const visited = new Set();
    const walk = async (parentStructureId, level) => {
      const children = await this.listChildren(checkId, parentStructureId);
      const result = [];
      for (const child of children) {
        if (child.structureId == null || visited.has(child.structureId)) continue;
        visited.add(child.structureId);
        const node = { ...child };
        if (level < depth && child.hasChildren && child.count > 0) {
          node.children = await walk(child.structureId, level + 1);
        } else {
          node.children = [];
        }
        result.push(node);
      }
      return result;
    };
    const stages = await walk(null, 1);
    return { check, stages };
  }

  async getStatuses(checkId) {
    try {
      const raw = await this.client.call('Проверка.СтатистикаПоПроверке', {
        Фильтр: encodeRecord([
          { name: 'Документ', type: 'Число целое', value: checkId },
          { name: 'ИдПроверки', type: 'Число целое', value: checkId },
          { name: 'ИдРегламента', type: 'Строка', value: null },
          { name: 'СЗадачами', type: 'Число целое', value: 0 },
          { name: 'ФильтрПереключатель', type: 'Число целое', value: 0 },
          { name: 'ФильтрПериод', type: { n: 'Массив', t: 'Строка' }, value: [null, null] },
          { name: 'ФильтрПометкиВкл', type: { n: 'Массив', t: 'Строка' }, value: [] },
          { name: 'ФильтрПометкиИскл', type: { n: 'Массив', t: 'Строка' }, value: [] },
        ]),
        Сортировка: null,
        Навигация: null,
        ДопПоля: [],
      });
      const rows = decodeRecordSet(raw);
      const statuses = rows
        .map((row) => ({
          id: Number(row['@ОбъектПланирования']),
          name: row['Название'],
          color: row['Цвет'],
          share: row['Значение'],
        }))
        .filter((status) => status.id && status.name);
      return normalizeStatuses(statuses);
    } catch {
      return DEFAULT_STATUSES;
    }
  }

  async defaultParentSectionId(checkId) {
    const roots = await this.listChildren(checkId, null);
    const first = roots.find((root) => root.structureId != null && !root.deleted);
    if (!first) {
      throw new SabyError(
        'В проверке нет корневых этапов. Создание этапа верхнего уровня через API ' +
          'не поддерживается — добавьте этап в карточке проверки вручную.',
      );
    }
    return first.structureId;
  }

  async createCheck(options) {
    const userId =
      options.employeeId ??
      (process.env.SABY_EMPLOYEE_ID ? Number(process.env.SABY_EMPLOYEE_ID) : null);
    const departmentId =
      options.departmentId ??
      (process.env.SABY_DEPARTMENT_ID ? Number(process.env.SABY_DEPARTMENT_ID) : null);
    if (!userId || !departmentId) {
      throw new SabyError(
        'Для создания проверки нужны employeeId и departmentId. ' +
          'Возьмите их из существующей проверки (поля employeeId/departmentId в saby_check_get) ' +
          'или задайте SABY_EMPLOYEE_ID и SABY_DEPARTMENT_ID.',
      );
    }
    const date = options.date || formatDate();
    const time = options.time || formatTime();
    const templateId = options.templateId ?? DEFAULT_TEMPLATE_ID;

    const raw = await this.client.call('Проверка.Создать', {
      Фильтр: encodeRecord([
        { name: 'ВызовИзБраузера', type: 'Логическое', value: true },
        { name: 'ЛицоСоздал', type: 'Число целое', value: userId },
        { name: 'Подразделение', type: 'Число целое', value: departmentId },
        { name: 'Сотрудник', type: 'Число целое', value: userId },
        { name: 'ТипДокумента.ТипДокумента', type: 'Строка', value: CHECK_DOC_TYPE },
        { name: 'ОбъектПланирования', type: 'Число целое', value: templateId },
        { name: 'Дата', type: 'Дата', value: date },
        { name: 'Время', type: 'Время', value: time },
      ]),
      ИмяМетода: 'Проверка.Список',
    });
    const id = extractId(raw, 'Проверка.Создать');

    if (options.name) {
      await this.updateCheck(id, { name: options.name });
    }
    return this.readCheck(id);
  }

  async updateCheck(checkId, fields) {
    const recordFields = [
      { name: '@Документ', type: 'Число целое', value: Number(checkId) },
    ];
    if (fields.name != null) {
      recordFields.push({
        name: 'ДокументРасширение.Название',
        type: 'Строка',
        value: fields.name,
      });
      recordFields.push({
        name: 'РазличныеДокументы.ИнформацияJSON',
        type: 'Строка',
        value: JSON.stringify([['p', { version: '2' }, fields.name]]),
      });
    }
    await this.client.call('Проверка.Записать', {
      Запись: encodeRecord(recordFields),
    });
    return this.readCheck(checkId);
  }

  async createStage(options) {
    const check = await this.readCheck(options.checkId);
    const parentSectionId =
      options.parentSectionId ?? (await this.defaultParentSectionId(check.id));
    const userId =
      check.employeeId ??
      (process.env.SABY_EMPLOYEE_ID ? Number(process.env.SABY_EMPLOYEE_ID) : null);
    const departmentId =
      check.departmentId ??
      (process.env.SABY_DEPARTMENT_ID ? Number(process.env.SABY_DEPARTMENT_ID) : null);
    if (!userId || !departmentId) {
      throw new SabyError(
        'В карточке проверки не найдены Сотрудник/Подразделение. ' +
          'Задайте SABY_EMPLOYEE_ID и SABY_DEPARTMENT_ID.',
      );
    }

    const raw = await this.client.call('ПунктПроверки.Создать', {
      Фильтр: encodeRecord([
        { name: 'ВызовИзБраузера', type: 'Логическое', value: true },
        { name: 'ЛицоСоздал', type: 'Число целое', value: userId },
        { name: 'Подразделение', type: 'Число целое', value: departmentId },
        { name: 'Сотрудник', type: 'Число целое', value: userId },
        { name: 'ТипДокумента.ТипДокумента', type: 'Строка', value: POINT_DOC_TYPE },
        { name: 'ЧеклистСтруктура.БазовыйРаздел', type: 'Число целое', value: check.id },
        { name: 'ЧеклистСтруктура.Раздел', type: 'Число целое', value: parentSectionId },
        { name: 'ЧеклистСтруктура.Раздел$', type: 'Логическое', value: true },
        { name: 'ЧеклистСтруктура.Раздел@', type: 'Логическое', value: true },
        { name: 'Дата', type: 'Дата', value: options.date || formatDate() },
        { name: 'Время', type: 'Время', value: options.time || formatTime() },
      ]),
      ИмяМетода: 'ПунктПроверки.Список',
    });
    const stageId = extractId(raw, 'ПунктПроверки.Создать');
    await this.updatePoint(stageId, {
      isStage: true,
      name: options.name,
      description: options.description,
      plannedMinutes: options.plannedMinutes,
    });
    return this.readPoint(stageId);
  }

  async createPoint(options) {
    const check = await this.readCheck(options.checkId);
    if (options.parentSectionId == null) {
      throw new SabyError(
        'Не указан parentSectionId — структура этапа/раздела, внутри которого создаётся пункт',
      );
    }
    const pointType = resolvePointType(options.name, options.type);
    const manual = Boolean(options.manual);
    const name = normalizeTestName(options.name, pointType);
    const comment = options.comment ?? null;
    const description = formatTestDescription(options);
    const planned = clampPlannedMinutes(options.plannedMinutes);
    const validation = validatePointRules({
      name,
      type: pointType,
      comment,
      description,
      plannedMinutes: planned.plannedMinutes,
      automation: options.automation,
      ideas: options.ideas,
      steps: options.steps,
      manual,
      requireIdeas: true,
      enforceTypeRules: true,
    });
    const mark =
      options.mark != null
        ? normalizeMark(options.mark)
        : defaultMarkForType(pointType, { manual });
    const warnings = [];
    if (mark) {
      warnings.push(
        `Пометка "${mark.label}" зафиксирована в правилах, но не записана в Saby: ` +
          'примените её в UI или полной записью документа.',
      );
    }
    if (pointType === 'ЧЛ') {
      warnings.push(
        `ЧЛ содержит ${validation.ideasCount} идеи/шага. Проверяйте, что все они относятся к одному сценарию.`,
      );
    }
    if (pointType === 'ТК' && manual) {
      warnings.push(
        'ТК создан как ручное исключение (manual=true): это допустимо только для сложного сценария с точным порядком шагов.',
      );
    }
    const userId =
      check.employeeId ??
      (process.env.SABY_EMPLOYEE_ID ? Number(process.env.SABY_EMPLOYEE_ID) : null);
    const departmentId =
      check.departmentId ??
      (process.env.SABY_DEPARTMENT_ID ? Number(process.env.SABY_DEPARTMENT_ID) : null);
    if (!userId || !departmentId) {
      throw new SabyError(
        'В карточке проверки не найдены Сотрудник/Подразделение. ' +
          'Задайте SABY_EMPLOYEE_ID и SABY_DEPARTMENT_ID.',
      );
    }

    const raw = await this.client.call('ПунктПроверки.Создать', {
      Фильтр: encodeRecord([
        { name: 'ВызовИзБраузера', type: 'Логическое', value: true },
        { name: 'ЛицоСоздал', type: 'Число целое', value: userId },
        { name: 'Подразделение', type: 'Число целое', value: departmentId },
        { name: 'Сотрудник', type: 'Число целое', value: userId },
        { name: 'ТипДокумента.ТипДокумента', type: 'Строка', value: POINT_DOC_TYPE },
        { name: 'ЧеклистСтруктура.БазовыйРаздел', type: 'Число целое', value: check.id },
        { name: 'ЧеклистСтруктура.Раздел', type: 'Число целое', value: options.parentSectionId },
        { name: 'ЧеклистСтруктура.Раздел$', type: 'Логическое', value: false },
        { name: 'ЧеклистСтруктура.Раздел@', type: 'Логическое', value: false },
        { name: 'Дата', type: 'Дата', value: options.date || formatDate() },
        { name: 'Время', type: 'Время', value: options.time || formatTime() },
      ]),
      ИмяМетода: 'ПунктПроверки.Список',
    });
    const pointId = extractId(raw, 'ПунктПроверки.Создать');
    await this.updatePoint(pointId, {
      name,
      comment,
      description,
      statusComment: options.statusComment ?? '',
      plannedMinutes: planned.plannedMinutes,
      status: options.status,
      assigneeId: options.assigneeId,
    });
    const point = await this.readPoint(pointId);
    return {
      ...point,
      type: pointType,
      mark: mark?.key ?? null,
      automation: validation.automation,
      manual,
      ideasCount: validation.ideasCount,
      warnings,
      rules: {
        nameNormalized: name !== String(options.name ?? '').trim(),
        plannedMinutesClamped: planned.clamped,
      },
    };
  }

  async updatePoint(pointId, fields) {
    const isStage = Boolean(fields.isStage);
    const recordFields = [
      { name: '@Документ', type: 'Число целое', value: Number(pointId) },
    ];
    const currentPoint =
      !isStage && fields.name == null && fields.type != null
        ? await this.readPoint(pointId)
        : null;
    const pointType = isStage
      ? null
      : resolvePointType(fields.name ?? currentPoint?.name, fields.type);
    const normalizedName =
      fields.name != null
        ? isStage
          ? String(fields.name).trim()
          : fields.type != null
            ? renameWithType(fields.name, fields.type)
            : normalizeTestName(fields.name, pointType)
        : currentPoint?.name && fields.type != null
          ? renameWithType(currentPoint.name, fields.type)
          : null;
    const comment = fields.comment != null ? String(fields.comment).trim() : null;
    const description =
      fields.description != null ||
      fields.precondition != null ||
      fields.steps != null ||
      fields.expected != null ||
      fields.automation != null
        ? formatTestDescription(fields)
        : null;
    const planned =
      fields.plannedMinutes != null
        ? isStage
          ? { plannedMinutes: Number(fields.plannedMinutes), clamped: false }
          : clampPlannedMinutes(fields.plannedMinutes)
        : null;
    const nameForValidation =
      normalizedName ?? (fields.currentName ? String(fields.currentName).trim() : null);
    if (!isStage) {
      validatePointRules({
        name: nameForValidation ?? `${DEFAULT_POINT_TYPE}: partial`,
        type: pointType,
        comment: comment ?? undefined,
        description: description ?? undefined,
        plannedMinutes: planned?.plannedMinutes ?? 0,
        automation: fields.automation,
        ideas: fields.ideas,
        steps: fields.steps,
        manual: Boolean(fields.manual),
        requireComment: false,
        requireIdeas: Boolean(fields.ideas || fields.steps),
        enforceTypeRules: Boolean(
          fields.type ||
            fields.automation ||
            fields.ideas ||
            fields.steps ||
            fields.manual,
        ),
      });
    }
    const mark = isStage
      ? null
      : fields.mark != null
        ? normalizeMark(fields.mark)
        : fields.type != null
          ? defaultMarkForType(pointType, { manual: Boolean(fields.manual) })
          : null;
    if (normalizedName != null) {
      recordFields.push({
        name: 'ЧеклистСтруктура.Название',
        type: 'Строка',
        value: normalizedName,
      });
    }
    if (comment != null) {
      recordFields.push({
        name: 'ЧеклистСтруктура.Комментарий',
        type: 'Строка',
        value: comment,
      });
    }
    if (description != null) {
      recordFields.push({
        name: 'ЧеклистСтруктура.Описание',
        type: 'Строка',
        value: description,
      });
    }
    const statusComment =
      fields.statusComment != null
        ? String(fields.statusComment)
        : description != null
          ? ''
          : null;
    if (statusComment != null) {
      recordFields.push({
        name: 'ЧеклистСтруктура.Версия',
        type: 'Строка',
        value: statusComment,
      });
    }
    if (planned != null) {
      recordFields.push({
        name: 'ЧеклистСтруктура.ПлановоеВремя',
        type: 'Строка',
        value: minutesToDuration(planned.plannedMinutes),
      });
    }
    if (fields.status != null) {
      recordFields.push({
        name: 'ЧеклистСтруктура.ОбъектПланирования',
        type: 'Число целое',
        value: resolveStatus(fields.status),
      });
    }
    if (fields.assigneeId != null) {
      recordFields.push({
        name: 'ЧеклистСтруктура.Лицо',
        type: 'Число целое',
        value: Number(fields.assigneeId),
      });
    }
    if (recordFields.length === 1) {
      return this.readPoint(pointId);
    }
    await this.client.call('ПунктПроверки.Записать', {
      Запись: encodeRecord(recordFields),
    });
    const point = await this.readPoint(pointId);
    const warnings = [];
    if (mark) {
      warnings.push(
        `Пометка "${mark.label}" зафиксирована в правилах, но не записана в Saby: ` +
          'примените её в UI или полной записью документа.',
      );
    }
    if (pointType === 'ЧЛ' && fields.steps) {
      warnings.push(
        'ЧЛ — набор идей одного сценария. Проверьте, что все шаги относятся к нему.',
      );
    }
    if (pointType === 'ТК' && fields.manual) {
      warnings.push(
        'ТК помечен как ручное исключение: только для сложного сценария с точным порядком шагов.',
      );
    }
    return {
      ...point,
      type: pointType,
      mark: mark?.key ?? null,
      automation: fields.automation ?? null,
      manual: Boolean(fields.manual),
      warnings,
      rules: {
        nameNormalized: normalizedName != null && normalizedName !== fields.name,
        plannedMinutesClamped: planned?.clamped ?? false,
      },
    };
  }

  async setStatus(checkId, pointIds, status) {
    const statusId = resolveStatus(status);
    const ids = (Array.isArray(pointIds) ? pointIds : [pointIds])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    if (ids.length === 0) throw new SabyError('Не указаны пункты для смены статуса');
    await this.client.call('Проверка.МассовоеИзменениеСтатусаИзПМО', {
      ИдПроверки: Number(checkId),
      Пункты: ids,
      Статус: statusId,
      Фильтр: STATUS_FILTER(Number(checkId)),
    });
    return { statusId, statusName: statusName(statusId), pointIds: ids };
  }

  async deleteItems(ids) {
    const list = (Array.isArray(ids) ? ids : [ids])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    if (list.length === 0) throw new SabyError('Не указаны id для удаления');
    const result = await this.client.call('Документ.УдалитьДокументы', {
      ИдО: list,
    });
    return { ids: list, result };
  }

  /**
   * Удаляет пункты/этапы из структуры проверки.
   * Принимает id структуры (@ЧеклистСтруктура), не id документа.
   * Именно этот метод пересчитывает КолВо; Документ.УдалитьДокументы
   * оставляет ссылку в структуре и завышает счётчик.
   */
  async removePoints(structureIds) {
    const list = (Array.isArray(structureIds) ? structureIds : [structureIds])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    if (list.length === 0) {
      throw new SabyError('Не указаны id структуры для удаления');
    }
    const result = await this.client.call('ПунктПроверки.Remove', {
      ИдО: list,
    });
    return { structureIds: list, result };
  }

  /** Собирает id структуры в порядке «дети → родитель». */
  async collectStructureIds(checkId, structureId) {
    const result = [];
    const children = await this.listChildren(checkId, structureId);
    for (const child of children) {
      if (child.structureId == null) continue;
      result.push(...(await this.collectStructureIds(checkId, child.structureId)));
    }
    result.push(Number(structureId));
    return result;
  }

  async findNodeByStructureId(checkId, structureId) {
    const queue = [...(await this.listChildren(checkId, null))];
    while (queue.length > 0) {
      const node = queue.shift();
      if (node.structureId == null) continue;
      if (Number(node.structureId) === Number(structureId)) return node;
      if (node.hasChildren && node.count > 0) {
        queue.push(...(await this.listChildren(checkId, node.structureId)));
      }
    }
    return null;
  }

  /** Возвращает все листовые пункты под этапом/разделом. */
  async collectLeafPoints(checkId, parentStructureId) {
    const children = await this.listChildren(checkId, parentStructureId);
    const points = [];
    for (const child of children) {
      if (child.deleted || child.structureId == null) continue;
      if (child.hasChildren && child.count > 0) {
        points.push(...(await this.collectLeafPoints(checkId, child.structureId)));
      } else if (child.docId != null) {
        const point = await this.readPoint(child.docId);
        if (!hasTestPrefix(point.name)) continue;
        points.push({
          ...point,
          stageStructureId: parentStructureId,
        });
      }
    }
    return points;
  }

  async collectMergeScopes(checkId, parentSectionId = null) {
    if (parentSectionId != null) {
      const node = await this.findNodeByStructureId(checkId, parentSectionId);
      const points = await this.collectLeafPoints(checkId, parentSectionId);
      return [
        {
          stageStructureId: Number(parentSectionId),
          stageName: node?.name ?? null,
          points: points.map((point) => ({
            ...point,
            stageName: node?.name ?? null,
          })),
        },
      ];
    }
    const roots = await this.listChildren(checkId, null);
    const scopes = [];
    for (const root of roots) {
      if (root.deleted || root.structureId == null) continue;
      const points = await this.collectLeafPoints(checkId, root.structureId);
      scopes.push({
        stageStructureId: Number(root.structureId),
        stageName: root.name,
        points: points.map((point) => ({ ...point, stageName: root.name })),
      });
    }
    return scopes;
  }

  /**
   * Read-only план слияния ТК/идей в ЧЛ.
   *
   * groups: [{ targetId?, targetName?, type?, comment?, pointIds: [] }]
   * Без groups возвращает только кандидатов на объединение по похожим названиям.
   */
  async planMerge({
    checkId,
    parentSectionId = null,
    groups = [],
    threshold = 0.45,
  }) {
    const check = await this.readCheck(checkId);
    const scopes = await this.collectMergeScopes(check.id, parentSectionId);
    const allPoints = scopes.flatMap((scope) => scope.points);
    const byId = new Map(allPoints.map((point) => [Number(point.id), point]));
    const notes = [
      'План read-only: ничего не создаёт, не переименовывает и не удаляет.',
      'Идея для шага берётся из «Комментарий», если он пуст — из названия.',
      'TestCase-шаги, предусловия и пометки переносятся отдельно; проверьте их в UI.',
    ];
    const plans = [];

    for (const group of groups) {
      const sourceIds = (group.pointIds ?? []).map(Number);
      if (sourceIds.length === 0) {
        throw new SabyError('В группе слияния нет pointIds');
      }
      const sources = sourceIds.map((id) => byId.get(id)).filter(Boolean);
      if (sources.length !== sourceIds.length) {
        const missing = sourceIds.filter((id) => !byId.has(id));
        throw new SabyError(
          `Пункты ${missing.join(', ')} не найдены под выбранным этапом`,
        );
      }
      const targetId = group.targetId != null ? Number(group.targetId) : null;
      const target = targetId ? byId.get(targetId) ?? (await this.readPoint(targetId)) : null;
      if (!target && !group.targetName) {
        throw new SabyError(
          'Укажите targetId существующего ЧЛ или targetName нового ЧЛ',
        );
      }
      const stageStructureId =
        target?.parentStructureId ?? sources[0].parentStructureId ?? null;
      const stage = scopes.find(
        (scope) => Number(scope.stageStructureId) === Number(stageStructureId),
      );
      const type = group.type ?? (target ? resolvePointType(target.name) : DEFAULT_POINT_TYPE);
      const targetName = target
        ? target.name
        : normalizeTestName(group.targetName, type);
      const warnings = [];
      if (target && type !== 'ЧЛ') {
        warnings.push(
          `Цель "${target.name}" имеет тип ${type}. Для объединения идей нужен ЧЛ: ` +
            'переименуйте пункт или создайте новый ЧЛ.',
        );
      }
      const ideaSources = sources.filter(
        (source) => !target || Number(source.id) !== Number(target.id),
      );
      const steps = ideaSources.map((source) => ({
        sourceId: source.id,
        sourceName: source.name,
        idea: source.comment?.trim() || source.name,
      }));
      if (target && steps.length === 0) {
        warnings.push('Все источники совпадают с целевым пунктом — добавлять нечего.');
      }
      if (!target && steps.length < MIN_CHECKLIST_IDEAS) {
        warnings.push(
          `В новом ЧЛ будет ${steps.length} идея/шаг(а). Для ЧЛ нужно минимум ${MIN_CHECKLIST_IDEAS}.`,
        );
      }
      const actions = [];
      if (target) {
        actions.push({
          action: 'reuseChecklist',
          pointId: target.id,
          name: target.name,
        });
      } else {
        actions.push({
          action: 'createChecklist',
          name: targetName,
          type,
          comment: group.comment ?? null,
          stageStructureId,
          stageName: stage?.stageName ?? null,
        });
      }
      for (const step of steps) {
        actions.push({
          action: 'addStep',
          sourceId: step.sourceId,
          idea: step.idea,
        });
      }
      for (const source of ideaSources) {
        actions.push({
          action: 'deleteSource',
          pointId: source.id,
          name: source.name,
          requiresConfirm: true,
        });
      }
      plans.push({
        action: 'mergeIntoChecklist',
        stage: {
          structureId: stageStructureId,
          name: stage?.stageName ?? null,
        },
        target: target
          ? { id: target.id, name: target.name, type }
          : { id: null, name: targetName, type, new: true },
        sources: sources.map((source) => ({
          id: source.id,
          name: source.name,
          comment: source.comment,
          type: resolvePointType(source.name),
        })),
        steps,
        actions,
        warnings,
      });
    }

    const candidates = [];
    for (const scope of scopes) {
      for (let i = 0; i < scope.points.length; i += 1) {
        for (let j = i + 1; j < scope.points.length; j += 1) {
          const left = scope.points[i];
          const right = scope.points[j];
          const score = ideaSimilarity(left.name, right.name);
          if (score >= threshold) {
            candidates.push({
              stage: { structureId: scope.stageStructureId, name: scope.stageName },
              points: [
                { id: left.id, name: left.name, comment: left.comment },
                { id: right.id, name: right.name, comment: right.comment },
              ],
              score: Math.round(score * 100) / 100,
              reason: 'Похожие названия или ключевые слова',
              suggestedType: DEFAULT_POINT_TYPE,
            });
          }
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);

    return {
      check,
      parentSectionId,
      totalPoints: allPoints.length,
      scopes: scopes.map((scope) => ({
        stageStructureId: scope.stageStructureId,
        stageName: scope.stageName,
        points: scope.points.length,
      })),
      groups: plans,
      candidates: candidates.slice(0, 25),
      notes,
    };
  }

  /**
   * Импорт сценария: этапы и пункты.
   *
   * sections: [{ name, description?, plannedMinutes?, points: [{ name, description?, plannedMinutes?, status?, assigneeId? }] }]
   */
  async importScenario(options) {
    const check = await this.readCheck(options.checkId);
    const sections = Array.isArray(options.sections) ? options.sections : [];
    if (sections.length === 0) {
      throw new SabyError('Сценарий не содержит ни одного этапа (sections)');
    }
    const totalPoints = sections.reduce(
      (sum, section) => sum + (Array.isArray(section.points) ? section.points.length : 0),
      0,
    );
    const maxPoints = Number(options.maxPoints ?? 200);
    if (totalPoints > maxPoints) {
      throw new SabyError(
        `В сценарии ${totalPoints} пунктов, это больше лимита ${maxPoints}. ` +
          'Разбейте импорт на части.',
      );
    }

    const parentSectionId =
      options.parentSectionId ?? (await this.defaultParentSectionId(check.id));
    const onExisting = options.onExisting || 'reuse';
    const updateExisting = Boolean(options.updateExisting);
    const dryRun = Boolean(options.dryRun);

    const parentChildren = await this.listChildren(check.id, parentSectionId);
    const byName = (items, name) =>
      items.find(
        (item) =>
          !item.deleted &&
          String(item.name ?? '').trim().toLowerCase() ===
            String(name ?? '').trim().toLowerCase(),
      );

    const plan = [];
    const createdDocIds = [];
    const createdStages = [];
    const warnings = [];

    const cleanup = async () => {
      for (const id of [...createdDocIds].reverse()) {
        try {
          await this.deleteItems([id]);
        } catch (error) {
          warnings.push(`Не удалось удалить ${id}: ${error.message}`);
        }
      }
    };

    try {
      for (const section of sections) {
        if (!section?.name) {
          throw new SabyError('У каждого этапа должно быть поле name');
        }
        const existingStage = byName(parentChildren, section.name);
        if (existingStage && onExisting === 'error') {
          throw new SabyError(`Этап "${section.name}" уже существует`);
        }
        let stage = existingStage;
        let stageAction = 'reuse';
        if (!existingStage) {
          stageAction = 'create';
          plan.push({ action: 'createStage', name: section.name });
          if (!dryRun) {
            stage = await this.createStage({
              checkId: check.id,
              parentSectionId,
              name: section.name,
              description: section.description,
              plannedMinutes: section.plannedMinutes,
            });
            createdDocIds.push(stage.id);
            createdStages.push(stage);
          }
        } else if (updateExisting && !dryRun) {
          stageAction = 'update';
          plan.push({ action: 'updateStage', name: section.name, id: existingStage.docId });
          stage = await this.updatePoint(existingStage.docId, {
            name: section.name,
            description: section.description,
            plannedMinutes: section.plannedMinutes,
          });
        } else {
          plan.push({ action: 'reuseStage', name: section.name, id: existingStage.docId });
          warnings.push(`Этап "${section.name}" уже существует — переиспользован`);
        }

        const stageStructureId = dryRun
          ? existingStage?.structureId ?? null
          : stage?.structureId ?? existingStage?.structureId ?? null;
        const existingPoints = stageStructureId
          ? await this.listChildren(check.id, stageStructureId)
          : [];

        for (const point of section.points ?? []) {
          if (!point?.name) {
            throw new SabyError(`У пункта этапа "${section.name}" нет name`);
          }
          const pointType = resolvePointType(point.name, point.type);
          const manual = Boolean(point.manual);
          const pointName = normalizeTestName(point.name, pointType);
          const comment = point.comment ?? null;
          const description = formatTestDescription(point);
          const planned = clampPlannedMinutes(point.plannedMinutes);
          const statusComment = point.statusComment ?? null;
          const validation = validatePointRules({
            name: pointName,
            type: pointType,
            comment,
            description,
            plannedMinutes: planned.plannedMinutes,
            automation: point.automation,
            ideas: point.ideas,
            steps: point.steps,
            manual,
            requireIdeas: true,
            enforceTypeRules: true,
          });
          const mark =
            point.mark != null
              ? normalizeMark(point.mark)
              : defaultMarkForType(pointType, { manual });
          if (pointName !== String(point.name).trim()) {
            warnings.push(`Название "${point.name}" нормализовано в "${pointName}"`);
          }
          if (planned.clamped) {
            warnings.push(
              `Плановое время пункта "${pointName}" уменьшено до ${planned.plannedMinutes} мин`,
            );
          }
          if (mark) {
            warnings.push(
              `Пометка "${mark.label}" для "${pointName}" зафиксирована в правилах, но не записана в Saby: примените в UI.`,
            );
          }
          if (pointType === 'ЧЛ') {
            warnings.push(
              `"${pointName}" — ЧЛ с ${validation.ideasCount} идеями/шагами. Убедитесь, что это один сценарий.`,
            );
          }
          if (pointType === 'ТК' && manual) {
            warnings.push(
              `"${pointName}" — ручное ТК-исключение: только для сложного сценария с точным порядком шагов.`,
            );
          }
          const existingPoint = byName(existingPoints, pointName);
          if (existingPoint) {
            if (onExisting === 'error') {
              throw new SabyError(`Пункт "${pointName}" уже существует в "${section.name}"`);
            }
            if (updateExisting && !dryRun) {
              plan.push({
                action: 'updatePoint',
                section: section.name,
                name: pointName,
                id: existingPoint.docId,
                mark: mark?.key ?? null,
                manual,
              });
              await this.updatePoint(existingPoint.docId, {
                name: pointName,
                type: pointType,
                comment,
                description,
                statusComment,
                plannedMinutes: planned.plannedMinutes,
                status: point.status,
                assigneeId: point.assigneeId,
                automation: point.automation,
                manual,
                ideas: point.ideas,
                steps: point.steps,
                mark: mark?.key,
              });
            } else {
              plan.push({
                action: 'reusePoint',
                section: section.name,
                name: pointName,
                id: existingPoint.docId,
                mark: mark?.key ?? null,
              });
              warnings.push(`Пункт "${pointName}" уже существует — пропущен`);
            }
            continue;
          }

          plan.push({
            action: 'createPoint',
            section: section.name,
            name: pointName,
            plannedMinutes: planned.plannedMinutes,
            mark: mark?.key ?? null,
            manual,
          });
          if (dryRun) continue;
          if (!stageStructureId) {
            throw new SabyError(
              `Не удалось определить структуру этапа "${section.name}" для создания пункта`,
            );
          }
          const created = await this.createPoint({
            checkId: check.id,
            parentSectionId: stageStructureId,
            type: pointType,
            name: pointName,
            comment,
            description,
            statusComment,
            plannedMinutes: planned.plannedMinutes,
            status: point.status,
            assigneeId: point.assigneeId,
            automation: point.automation,
            manual,
            ideas: point.ideas,
            steps: point.steps,
            mark: mark?.key,
          });
          createdDocIds.push(created.id);
        }
      }
    } catch (error) {
      if (!dryRun && options.cleanupOnError !== false) {
        await cleanup();
        error.message += `\nСозданные объекты удалены: ${createdDocIds.join(', ') || 'нет'}`;
      }
      throw error;
    }

    if (dryRun) {
      return {
        dryRun: true,
        check,
        parentSectionId,
        totalSections: sections.length,
        totalPoints,
        plan,
        warnings,
      };
    }

    const tree = await this.getTree(check.id, 2);
    const expected = new Set(
      sections.flatMap((section) => (section.points ?? []).map((point) => point.name)),
    );
    const actual = new Set(
      tree.stages.flatMap((stage) =>
        (stage.children ?? []).map((child) => child.name),
      ),
    );
    const missing = [...expected].filter((name) => !actual.has(name));
    return {
      dryRun: false,
      check,
      parentSectionId,
      totalSections: sections.length,
      totalPoints,
      plan,
      warnings,
      createdDocIds,
      verification: {
        ok: missing.length === 0,
        missing,
      },
    };
  }
}
