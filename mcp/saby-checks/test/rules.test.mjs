import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_PLANNED_MINUTES,
  formatPrecondition,
  formatTestDescription,
  normalizeMark,
  normalizeTestName,
  validatePointRules,
} from '../rules.mjs';

test('normalizeTestName добавляет ТК, если префикса нет', () => {
  assert.equal(normalizeTestName('Проверить карточку'), 'ТК: Проверить карточку');
  assert.equal(normalizeTestName('ЧЛ: Проверить карточку'), 'ЧЛ: Проверить карточку');
  assert.equal(normalizeTestName('Т: Требование'), 'Т: Требование');
  assert.equal(normalizeTestName('Проверить', 'ЧЛ'), 'ЧЛ: Проверить');
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

test('formatTestDescription собирает ПРЕДУСЛОВИЕ, ШАГИ и результат', () => {
  const value = formatTestDescription({
    precondition: ['Открыть карточку'],
    steps: ['Изменить поле'],
    expected: 'Поле изменено',
  });
  assert.match(value, /^ПРЕДУСЛОВИЕ:\n1\. Открыть карточку/);
  assert.match(value, /ШАГИ:\n1\. Изменить поле/);
  assert.match(value, /ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:\nПоле изменено/);
});

test('validatePointRules требует комментарий и не более 5 минут', () => {
  const result = validatePointRules({
    name: 'ТК: Проверка',
    comment: 'Проверяем поведение',
    description: 'ПРЕДУСЛОВИЕ:\n1. Открыть карточку',
    plannedMinutes: 10,
  });
  assert.equal(result.plannedMinutes, MAX_PLANNED_MINUTES);
  assert.equal(result.clamped, true);
  assert.throws(
    () => validatePointRules({ name: 'ТК: Проверка', plannedMinutes: 5 }),
    /Комментарий/,
  );
  assert.throws(
    () =>
      validatePointRules({
        name: 'ТК: Проверка',
        comment: 'ТК: Проверка',
        plannedMinutes: 5,
      }),
    /не должен совпадать/,
  );
});

test('normalizeMark понимает ПК, МК и АТ', () => {
  assert.equal(normalizeMark('ПК').key, 'pc');
  assert.equal(normalizeMark('красный').key, 'mobile_important');
  assert.equal(normalizeMark('зелёный').key, 'mobile_noncritical');
  assert.equal(normalizeMark('АТ').key, 'automated');
  assert.throws(() => normalizeMark('неизвестно'), /Неизвестная пометка/);
});
