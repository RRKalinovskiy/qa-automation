/**
 * Правила оформления тестов Saby.
 *
 * 1. Название теста начинается с ТК / ЧЛ / Т.
 * 2. Краткое описание — «Общее описание» → «Комментарий».
 * 3. Предварительные шаги — «Общее описание» → «Описание».
 * 4. В предварительных шагах — подготовка к тесту.
 * 5. Формат предусловия: «ПРЕДУСЛОВИЕ:» + нумерованные шаги.
 * 6. Плановое время — не более 5 минут на сценарий.
 * 7. Пометки: флаг — ПК; красный — важный МК; жёлтый — незначительный МК;
 *    зелёный — МК не критичный функционал; синий — АТ.
 * 8. Описание не должно совпадать с названием теста.
 */

export const TEST_NAME_PREFIXES = ['ТК', 'ЧЛ', 'Т'];
export const MAX_PLANNED_MINUTES = 5;

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

export function normalizeTestName(name, type = 'ТК') {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('Название теста не заполнено');
  if (hasTestPrefix(trimmed)) return trimmed;
  const prefix = TEST_NAME_PREFIXES.includes(type) ? type : 'ТК';
  return `${prefix}: ${trimmed}`;
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

/**
 * Собирает описание для поля «Описание» (ЧеклистСтруктура.Версия):
 * ПРЕДУСЛОВИЕ → ШАГИ → ОЖИДАЕМЫЙ РЕЗУЛЬТАТ.
 * Готовое описание с ПРЕДУСЛОВИЕМ возвращается как есть.
 */
export function formatTestDescription({
  description,
  precondition,
  steps,
  expected,
} = {}) {
  if (description && /ПРЕДУСЛОВИЕ:/i.test(String(description))) {
    return String(description).trim();
  }
  const blocks = [
    formatPrecondition(precondition),
    formatSteps(steps),
    formatExpected(expected),
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
  comment,
  description,
  plannedMinutes,
  requireComment = true,
}) {
  const testName = String(name ?? '').trim();
  if (!testName) throw new Error('Название теста не заполнено');
  if (!hasTestPrefix(testName)) {
    throw new Error(
      `Название теста должно начинаться с ТК, ЧЛ или Т: "${testName}"`,
    );
  }
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
  const planned = clampPlannedMinutes(plannedMinutes);
  return {
    name: testName,
    comment: testComment || null,
    plannedMinutes: planned.plannedMinutes,
    clamped: planned.clamped,
  };
}

export function rulesSummary() {
  return {
    namePrefixes: TEST_NAME_PREFIXES,
    maxPlannedMinutes: MAX_PLANNED_MINUTES,
    fields: {
      comment: 'ЧеклистСтруктура.Комментарий — короткое описание, что проверяем',
      description:
        'ЧеклистСтруктура.Версия — ПРЕДУСЛОВИЕ, ШАГИ, ОЖИДАЕМЫЙ РЕЗУЛЬТАТ',
      preconditionFormat: 'ПРЕДУСЛОВИЕ:\\n1. ...',
    },
    marks: Object.values(MARK_RULES),
    rules: [
      'Название теста начинается с ТК (тест-кейс), ЧЛ (чек-лист) или Т (требование).',
      'Короткое описание, что проверяем, — в «Общее описание» → «Комментарий».',
      'Предварительные шаги — в «Общее описание» → «Описание».',
      'В предварительных шагах — основные шаги подготовки к тесту.',
      'Предусловие оформляется как «ПРЕДУСЛОВИЕ:» + нумерованные шаги.',
      'Плановое время — не более 5 минут на сценарий.',
      'Пометки: флаг — ПК; красный — важный МК; жёлтый — незначительный МК; зелёный — МК не критичный функционал; синий — АТ.',
      'Описание не должно совпадать с названием теста.',
    ],
  };
}
