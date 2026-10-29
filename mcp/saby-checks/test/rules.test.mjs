import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_POINT_TYPE,
  MAX_PLANNED_MINUTES,
  formatAutomation,
  formatPrecondition,
  formatTestDescription,
  normalizeMark,
  normalizeTestName,
  renameWithType,
  resolvePointType,
  validatePointRules,
} from '../rules.mjs';

test('normalizeTestName по умолчанию добавляет ЧЛ', () => {
  assert.equal(normalizeTestName('Проверить карточку'), 'ЧЛ: Проверить карточку');
  assert.equal(normalizeTestName('Проверить', 'ТК'), 'ТК: Проверить');
  assert.equal(normalizeTestName('ЧЛ: Проверить карточку'), 'ЧЛ: Проверить карточку');
  assert.equal(normalizeTestName('Т: Требование'), 'Т: Требование');
  assert.equal(DEFAULT_POINT_TYPE, 'ЧЛ');
});

test('resolvePointType берёт тип из префикса или явного type', () => {
  assert.equal(resolvePointType('ТК: Автотест'), 'ТК');
  assert.equal(resolvePointType('ЧЛ: Валидация'), 'ЧЛ');
  assert.equal(resolvePointType('Без префикса'), 'ЧЛ');
  assert.equal(resolvePointType('ТК: Автотест', 'ЧЛ'), 'ЧЛ');
});

test('renameWithType меняет префикс, не дублируя его', () => {
  assert.equal(renameWithType('ТК: Неверный email', 'ЧЛ'), 'ЧЛ: Неверный email');
  assert.equal(renameWithType('Неверный email', 'ЧЛ'), 'ЧЛ: Неверный email');
  assert.equal(renameWithType('ЧЛ: Валидация', 'ТК'), 'ТК: Валидация');
});

test('formatPrecondition приводит шаги к формату ПРЕДУСЛОВИЕ', () => {
  assert.equal(
    formatPrecondition(['Открыть карточку', '2. Подготовить клиента']),
    'ПРЕДУСЛОВИЕ:\n1. Открыть карточку\n2. Подготовить клиента',
  );
  assert.match(
    formatPrecondition('ПРЕДУСЛОВИЕ:\n1. Уже готово'),
    /^ПРЕДУСЛОВИЕ:/,
  );
});

test('formatTestDescription собирает ПРЕДУСЛОВИЕ, ШАГИ, результат и автотест', () => {
  const value = formatTestDescription({
    precondition: ['Открыть карточку'],
    steps: ['Изменить поле', 'Проверить сообщение'],
    expected: 'Поле изменено',
    automation: 'tests/ui/client.spec.ts',
  });
  assert.match(value, /^ПРЕДУСЛОВИЕ:\n1\. Открыть карточку/);
  assert.match(value, /ШАГИ:\n1\. Изменить поле\n2\. Проверить сообщение/);
  assert.match(value, /ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:\nПоле изменено/);
  assert.match(value, /АВТОТЕСТ:\ntests\/ui\/client\.spec\.ts/);
  assert.equal(
    formatAutomation('tests/api/client.spec.ts'),
    'АВТОТЕСТ:\ntests/api/client.spec.ts',
  );
});

test('validatePointRules требует комментарий и не более 5 минут', () => {
  const result = validatePointRules({
    name: 'ЧЛ: Проверка',
    type: 'ЧЛ',
    comment: 'Проверяем поведение',
    description: 'ПРЕДУСЛОВИЕ:\n1. Открыть карточку',
    plannedMinutes: 10,
    steps: ['Шаг 1', 'Шаг 2'],
    enforceTypeRules: true,
  });
  assert.equal(result.plannedMinutes, MAX_PLANNED_MINUTES);
  assert.equal(result.clamped, true);
  assert.equal(result.type, 'ЧЛ');
  assert.equal(result.defaultMark.key, 'pc');
  assert.throws(
    () => validatePointRules({ name: 'ЧЛ: Проверка', plannedMinutes: 5 }),
    /Комментарий/,
  );
  assert.throws(
    () =>
      validatePointRules({
        name: 'ЧЛ: Проверка',
        comment: 'ЧЛ: Проверка',
        plannedMinutes: 5,
      }),
    /не должен совпадать/,
  );
});

test('ТК требует automation, иначе это ручная проверка и нужен ЧЛ', () => {
  assert.throws(
    () =>
      validatePointRules({
        name: 'ТК: Неверный email',
        type: 'ТК',
        comment: 'Проверяем валидацию email',
        plannedMinutes: 5,
        enforceTypeRules: true,
      }),
    /automation/,
  );
  const result = validatePointRules({
    name: 'ТК: Неверный email',
    type: 'ТК',
    comment: 'Проверяем валидацию email',
    plannedMinutes: 5,
    automation: 'tests/api/client-validation.spec.ts',
    enforceTypeRules: true,
  });
  assert.equal(result.type, 'ТК');
  assert.equal(result.defaultMark.key, 'automated');
  assert.match(result.automation, /client-validation/);
});

test('ЧЛ требует минимум две идеи или шага', () => {
  assert.throws(
    () =>
      validatePointRules({
        name: 'ЧЛ: Неверный email',
        type: 'ЧЛ',
        comment: 'Проверяем валидацию email',
        plannedMinutes: 5,
        steps: ['Ввести неверный email'],
        requireIdeas: true,
        enforceTypeRules: true,
      }),
    /минимум 2/,
  );
  const result = validatePointRules({
    name: 'ЧЛ: Валидация контактных данных',
    type: 'ЧЛ',
    comment: 'Проверяем валидацию телефона и email',
    plannedMinutes: 5,
    steps: ['Телефон: неверный формат', 'Email: неверный формат'],
    requireIdeas: true,
    enforceTypeRules: true,
  });
  assert.equal(result.ideasCount, 2);
  assert.equal(result.defaultMark.key, 'pc');
});

test('ручной ТК-исключение требует manual и минимум два шага', () => {
  assert.throws(
    () =>
      validatePointRules({
        name: 'ТК: Сложный сценарий',
        type: 'ТК',
        comment: 'Повторяем точный порядок шагов',
        plannedMinutes: 5,
        manual: true,
        steps: ['Шаг 1'],
        requireIdeas: true,
        enforceTypeRules: true,
      }),
    /минимум 2/,
  );
  const result = validatePointRules({
    name: 'ТК: Сложный сценарий',
    type: 'ТК',
    comment: 'Повторяем точный порядок шагов',
    plannedMinutes: 5,
    manual: true,
    steps: ['Шаг 1', 'Шаг 2'],
    requireIdeas: true,
    enforceTypeRules: true,
  });
  assert.equal(result.manual, true);
  assert.equal(result.defaultMark.key, 'pc');
});

test('normalizeMark понимает ПК, МК и АТ', () => {
  assert.equal(normalizeMark('ПК').key, 'pc');
  assert.equal(normalizeMark('красный').key, 'mobile_important');
  assert.equal(normalizeMark('зелёный').key, 'mobile_noncritical');
  assert.equal(normalizeMark('АТ').key, 'automated');
  assert.throws(() => normalizeMark('неизвестно'), /Неизвестная пометка/);
});
