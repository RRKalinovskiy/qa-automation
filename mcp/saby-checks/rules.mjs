/**
 * Правила оформления тестов Saby.
 *
 * 1. Название теста начинается с ТК / ЧЛ / Т.
 *    ТК — автотест, ЧЛ — набор идей одного ручного сценария.
 * 2. Краткое описание — «Общее описание» → «Комментарий».
 * 3. Предварительные шаги — «Общее описание» → «Описание».
 * 4. В предварительных шагах — подготовка к тесту.
 * 5. Формат предусловия: «ПРЕДУСЛОВИЕ:» + нумерованные шаги.
 * 6. Плановое время — не более 5 минут на сценарий.
 * 7. Пометки: флаг — ПК; красный — важный МК; жёлтый — незначительный МК;
 *    зелёный — МК не критичный функционал; синий — АТ.
 * 8. Описание не должно совпадать с названием теста.
 * 9. ТК без automation запрещён: ручная идея оформляется как ЧЛ.
 * 10. ЧЛ содержит минимум 2 идеи/шага в рамках одного сценария.
 */

export const TEST_NAME_PREFIXES = ['ТК', 'ЧЛ', 'Т'];
export const POINT_TYPES = ['ЧЛ', 'ТК', 'Т'];
export const DEFAULT_POINT_TYPE = 'ЧЛ';
export const AUTOMATION_REQUIRED_TYPES = ['ТК'];
export const MAX_PLANNED_MINUTES = 5;
export const MIN_CHECKLIST_IDEAS = 2;

export const MARK_RULES = {
  pc: {
    key: 'pc',
    label: 'Флаг — ПК',
    kind: 'flag',
  },
  mobile_important: {
    key: 'mobile_important',
    label: 'Красный — Важный МК',
    kind: 'color',
    color: 'red',
  },
  mobile_minor: {
    key: 'mobile_minor',
    label: 'Жёлтый — Незначительный МК',
    kind: 'color',
    color: 'yellow',
  },
  mobile_noncritical: {
    key: 'mobile_noncritical',
    label: 'Зелёный — МК не критичный функционал',
    kind: 'color',
    color: 'green',
  },
  automated: {
    key: 'automated',
    label: 'Синий — АТ',
    kind: 'color',
    color: 'blue',
  },
};

const MARK_ALIASES = new Map([
  ['pc', 'pc'],
  ['пк', 'pc'],
  ['флаг', 'pc'],
  ['flag', 'pc'],
  ['mobile_important', 'mobile_important'],
  ['важный мк', 'mobile_important'],
  ['красный', 'mobile_important'],
  ['red', 'mobile_important'],
  ['mobile_minor', 'mobile_minor'],
  ['незначительный мк', 'mobile_minor'],
  ['жёлтый', 'mobile_minor'],
  ['желтый', 'mobile_minor'],
  ['yellow', 'mobile_minor'],
  ['mobile_noncritical', 'mobile_noncritical'],
  ['не критичный мк', 'mobile_noncritical'],
  ['зелёный', 'mobile_noncritical'],
  ['зеленый', 'mobile_noncritical'],
  ['green', 'mobile_noncritical'],
  ['automated', 'automated'],
  ['ат', 'automated'],
  ['синий', 'automated'],
  ['blue', 'automated'],
]);

export function hasTestPrefix(name) {
  return /^(ТК|ЧЛ|Т)(:|\s|$)/u.test(String(name ?? '').trim());
}

export function testNameType(name) {
  const match = /^(ТК|ЧЛ|Т)(:|\s|$)/u.exec(String(name ?? '').trim());
  return match ? match[1] : null;
}

export function resolvePointType(name, type) {
  if (type && POINT_TYPES.includes(type)) return type;
  return testNameType(name) ?? DEFAULT_POINT_TYPE;
}

export function normalizeTestName(name, type = DEFAULT_POINT_TYPE) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('Название теста не заполнено');
  if (hasTestPrefix(trimmed)) return trimmed;
  const prefix = TEST_NAME_PREFIXES.includes(type) ? type : DEFAULT_POINT_TYPE;
  return `${prefix}: ${trimmed}`;
}

export function renameWithType(name, type = DEFAULT_POINT_TYPE) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('Название теста не заполнено');
  const withoutPrefix = trimmed.replace(/^(ТК|ЧЛ|Т)(:|\s+)/u, '').trim();
  return normalizeTestName(withoutPrefix, type);
}

export function defaultMarkForType(type, { manual = false } = {}) {
  if (type === 'ТК') return manual ? MARK_RULES.pc : MARK_RULES.automated;
  if (type === 'ЧЛ') return MARK_RULES.pc;
  return null;
}

export function countChecklistIdeas({ ideas, steps } = {}) {
  if (Array.isArray(ideas)) {
    return ideas.map((idea) => String(idea).trim()).filter(Boolean).length;
  }
  if (Number.isInteger(ideas)) return ideas;
  const lines = Array.isArray(steps)
    ? steps
    : typeof steps === 'string'
      ? steps.split(/\r?\n/)
      : [];
  return lines
    .map((line) => String(line).trim())
    .filter((line) => line && !/^(ШАГИ|ИДЕИ):/i.test(line))
    .length;
}

export function normalizeMark(value) {
  if (value == null || value === '') return null;
  const key = String(value).trim().toLowerCase();
  const markKey = MARK_ALIASES.get(key);
  if (!markKey) {
    throw new Error(
      `Неизвестная пометка "${value}". Доступны: ` +
        Object.values(MARK_RULES)
          .map((mark) => `${mark.key} (${mark.label})`)
          .join(', '),
    );
  }
  return MARK_RULES[markKey];
}

function numbered(lines) {
  return lines
    .map((line) => String(line).trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+[.)]\s*/, ''))
    .map((line, index) => `${index + 1}. ${line}`);
}

export function formatPrecondition(precondition) {
  if (precondition == null || precondition === '') return '';
  const raw = Array.isArray(precondition)
    ? precondition
    : String(precondition).split(/\r?\n/);
  const cleaned = raw.map((line) => String(line).trim()).filter(Boolean);
  if (cleaned.length === 0) return '';
  if (/^ПРЕДУСЛОВИЕ:/i.test(cleaned[0])) {
    return cleaned.join('\n');
  }
  return `ПРЕДУСЛОВИЕ:\n${numbered(cleaned).join('\n')}`;
}

export function formatSteps(steps) {
  if (steps == null || steps === '') return '';
  const raw = Array.isArray(steps) ? steps : String(steps).split(/\r?\n/);
  const cleaned = raw.map((line) => String(line).trim()).filter(Boolean);
  if (cleaned.length === 0) return '';
  if (/^ШАГИ:/i.test(cleaned[0])) return cleaned.join('\n');
  return `ШАГИ:\n${numbered(cleaned).join('\n')}`;
}

export function formatExpected(expected) {
  if (expected == null || expected === '') return '';
  const text = Array.isArray(expected) ? expected.join('\n') : String(expected);
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/^ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:/i.test(trimmed)) return trimmed;
  return `ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:\n${trimmed}`;
}

export function formatAutomation(automation) {
  if (automation == null || automation === '') return '';
  const text = Array.isArray(automation)
    ? automation.filter(Boolean).join('\n')
    : String(automation);
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/^АВТОТЕСТ:/i.test(trimmed)) return trimmed;
  return `АВТОТЕСТ:\n${trimmed}`;
}

/**
 * Собирает описание для поля «Описание» (ЧеклистСтруктура.Описание):
 * ПРЕДУСЛОВИЕ → ШАГИ → ОЖИДАЕМЫЙ РЕЗУЛЬТАТ → АВТОТЕСТ.
 * Готовое описание с ПРЕДУСЛОВИЕМ возвращается как есть.
 */
export function formatTestDescription({
  description,
  precondition,
  steps,
  expected,
  automation,
} = {}) {
  const automationBlock = formatAutomation(automation);
  if (description && /ПРЕДУСЛОВИЕ:/i.test(String(description))) {
    const base = String(description).trim();
    if (!automationBlock || /АВТОТЕСТ:/i.test(base)) return base;
    return `${base}\n\n${automationBlock}`;
  }
  const blocks = [
    formatPrecondition(precondition),
    formatSteps(steps),
    formatExpected(expected),
    automationBlock,
  ].filter(Boolean);
  if (blocks.length > 0) return blocks.join('\n\n');
  return description ? String(description).trim() : '';
}

export function clampPlannedMinutes(minutes) {
  const value = Number(minutes ?? MAX_PLANNED_MINUTES);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Плановое время должно быть неотрицательным числом минут');
  }
  return {
    plannedMinutes: Math.min(value, MAX_PLANNED_MINUTES),
    clamped: value > MAX_PLANNED_MINUTES,
  };
}

export function validatePointRules({
  name,
  type,
  comment,
  description,
  plannedMinutes,
  automation,
  ideas,
  steps,
  manual = false,
  requireComment = true,
  requireIdeas = false,
  enforceTypeRules = false,
}) {
  const testName = String(name ?? '').trim();
  if (!testName) throw new Error('Название теста не заполнено');
  if (!hasTestPrefix(testName)) {
    throw new Error(
      `Название теста должно начинаться с ТК, ЧЛ или Т: "${testName}"`,
    );
  }
  const pointType = resolvePointType(testName, type);
  const testComment = String(comment ?? '').trim();
  if (requireComment && !testComment) {
    throw new Error(
      'Заполните «Комментарий» — короткое описание того, что проверяем',
    );
  }
  if (testComment && testComment.toLowerCase() === testName.toLowerCase()) {
    throw new Error('Комментарий не должен совпадать с названием теста');
  }
  if (
    description &&
    String(description).trim().toLowerCase() === testName.toLowerCase()
  ) {
    throw new Error('Описание не должно совпадать с названием теста');
  }
  const automationText =
    automation == null
      ? ''
      : Array.isArray(automation)
        ? automation.filter(Boolean).join('\n').trim()
        : String(automation).trim();
  const ideasCount = countChecklistIdeas({ ideas, steps });
  if (enforceTypeRules) {
    if (AUTOMATION_REQUIRED_TYPES.includes(pointType) && !automationText && !manual) {
      throw new Error(
        'ТК означает автотест. Укажите automation (файл, id или ссылку на автотест) ' +
          'либо оформите ручную проверку как ЧЛ. Для сложного ручного сценария ' +
          'с точным порядком шагов передайте manual=true и минимум 2 шага.',
      );
    }
    if (
      pointType === 'ТК' &&
      manual &&
      ideasCount < MIN_CHECKLIST_IDEAS
    ) {
      throw new Error(
        `Ручной ТК-исключение требует минимум ${MIN_CHECKLIST_IDEAS} шага с точным порядком действий.`,
      );
    }
    if (
      pointType === 'ЧЛ' &&
      (requireIdeas || ideasCount > 0) &&
      ideasCount < MIN_CHECKLIST_IDEAS
    ) {
      throw new Error(
        `ЧЛ — набор идей одного сценария. Нужно минимум ${MIN_CHECKLIST_IDEAS} шага/идеи. ` +
          'Одну идею добавляйте шагом в существующий ЧЛ.',
      );
    }
  }
  const planned = clampPlannedMinutes(plannedMinutes);
  return {
    name: testName,
    type: pointType,
    comment: testComment || null,
    plannedMinutes: planned.plannedMinutes,
    clamped: planned.clamped,
    automation: automationText || null,
    manual: Boolean(manual),
    ideasCount,
    defaultMark: defaultMarkForType(pointType, { manual }),
  };
}

export function rulesSummary() {
  return {
    namePrefixes: TEST_NAME_PREFIXES,
    defaultType: DEFAULT_POINT_TYPE,
    minChecklistIdeas: MIN_CHECKLIST_IDEAS,
    maxPlannedMinutes: MAX_PLANNED_MINUTES,
    types: {
      ТК: {
        meaning: 'Автотест: одна проверяемая идея, покрытая кодом.',
        requirement:
          'Обязателен automation — файл, id или ссылка на автотест. ' +
          'Исключение — сложный ручной сценарий с manual=true и минимум 2 шагами.',
        defaultMark: 'automated',
      },
      ЧЛ: {
        meaning: 'Чек-лист: набор идей в рамках одного ручного сценария.',
        requirement: `Минимум ${MIN_CHECKLIST_IDEAS} идеи/шага; несколько связанных идей не дробятся на отдельные ТК.`,
        defaultMark: 'pc',
      },
      Т: {
        meaning: 'Требование: ссылка на требование или критерий приёмки.',
        requirement: 'Используется, когда пункт фиксирует требование, а не проверку.',
        defaultMark: null,
      },
    },
    fields: {
      comment: 'ЧеклистСтруктура.Комментарий — короткое описание, что проверяем',
      description:
        'ЧеклистСтруктура.Описание — ПРЕДУСЛОВИЕ, ШАГИ, ОЖИДАЕМЫЙ РЕЗУЛЬТАТ, АВТОТЕСТ',
      statusComment:
        'ЧеклистСтруктура.Версия — только комментарий статуса, не сценарий',
      preconditionFormat: 'ПРЕДУСЛОВИЕ:\\n1. ...',
      automationFormat: 'АВТОТЕСТ:\\n<файл, id или ссылка>',
    },
    marks: Object.values(MARK_RULES),
    decisionTree: [
      'Есть автотест или он планируется? → ТК с automation и пометкой АТ.',
      'Ручная проверка нескольких идей одного сценария → один ЧЛ с шагами.',
      'Ручная проверка одной идеи → шаг внутри существующего ЧЛ, а не новый ТК.',
      'Сложный ручной сценарий с точным порядком шагов → ТК-исключение с manual=true и минимум 2 шагами.',
      'Новый ЧЛ создаётся только для нового сценария или блока, а не для каждой идеи.',
    ],
    mergeRules: [
      'Перед созданием пункта проверьте раздел: возможно, идея уже есть в шагах ЧЛ.',
      'Связанные идеи одного блока объединяйте в один ЧЛ.',
      'Сначала постройте read-only план слияния (saby_check_merge_plan), согласуйте его.',
      'Исходные ТК удаляйте только после переноса всех идей в ЧЛ.',
      'После слияния проверьте карточку в UI: название, шаги, статус и пометка.',
    ],
    rules: [
      'Название теста начинается с ТК (автотест), ЧЛ (чек-лист) или Т (требование).',
      'ТК без automation запрещён: это признак ручной проверки, для неё нужен ЧЛ.',
      'Исключение — сложный ручной сценарий: ТК с manual=true и минимум 2 шагами.',
      'ЧЛ — набор идей одного сценария; минимум 2 шага/идеи.',
      'Короткое описание, что проверяем, — в «Общее описание» → «Комментарий».',
      'Предварительные шаги — в «Общее описание» → «Описание».',
      'В предварительных шагах — основные шаги подготовки к тесту.',
      'Предусловие оформляется как «ПРЕДУСЛОВИЕ:» + нумерованные шаги.',
      'Плановое время — не более 5 минут на сценарий.',
      'Пометки: флаг — ПК; красный — важный МК; жёлтый — незначительный МК; зелёный — МК не критичный функционал; синий — АТ.',
      'Описание не должно совпадать с названием теста.',
      'Данные сценария не пишутся в поле статуса («Текущее состояние»).',
    ],
  };
}
