import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calledMethod,
  decodeRecord,
  decodeRecordSet,
  durationToMinutes,
  encodeRecord,
  formatDate,
  formatTime,
  minutesToDuration,
  originalMethodHeader,
  transliterate,
} from '../records.mjs';
import { resolveStatus, statusName } from '../statuses.mjs';

test('encodeRecord собирает s/d в порядке полей', () => {
  const record = encodeRecord([
    { name: '@Документ', type: 'Число целое', value: 10 },
    { name: 'Название', type: 'Строка', value: 'Проверка' },
  ]);
  assert.deepEqual(record, {
    _type: 'record',
    f: 0,
    s: [
      { n: '@Документ', t: 'Число целое' },
      { n: 'Название', t: 'Строка' },
    ],
    d: [10, 'Проверка'],
  });
});

test('decodeRecord разбирает record в объект', () => {
  const value = decodeRecord({
    _type: 'record',
    f: 0,
    s: [{ n: 'A', t: 'Строка' }, { n: 'B', t: 'Число целое' }],
    d: ['x', 2],
  });
  assert.deepEqual(value, { A: 'x', B: 2 });
});

test('decodeRecordSet разбирает строки', () => {
  const rows = decodeRecordSet({
    _type: 'recordset',
    f: 0,
    s: [{ n: 'A', t: 'Строка' }, { n: 'B', t: 'Число целое' }],
    d: [['x', 1], ['y', 2]],
  });
  assert.deepEqual(rows, [
    { A: 'x', B: 1 },
    { A: 'y', B: 2 },
  ]);
});

test('минуты и ISO-длительность переводятся туда и обратно', () => {
  assert.equal(minutesToDuration(75), 'P0DT1H15M0S');
  assert.equal(minutesToDuration(0), 'P0DT0H0M0S');
  assert.equal(durationToMinutes('P0DT1H15M0S'), 75);
  assert.equal(durationToMinutes('P0DT0H30M0S'), 30);
  assert.equal(durationToMinutes(null), null);
});

test('x-calledmethod не содержит кириллицы', () => {
  assert.equal(
    calledMethod('Проверка.МассовоеИзменениеСтатусаИзПМО'),
    'Proverka.MassovoeIzmenenieStatusaIzPMO',
  );
  assert.equal(
    calledMethod('ПунктПроверки.СписокПунктовПроверки'),
    'PunktProverki.SpisokPunktovProverki',
  );
  assert.doesNotMatch(transliterate('Проверка.Создать'), /[А-Яа-яЁё]/);
});

test('x-originalmethodname — base64 UTF-8', () => {
  assert.equal(
    Buffer.from(originalMethodHeader('Проверка.Создать'), 'base64').toString('utf8'),
    'Проверка.Создать',
  );
});

test('дата и время в формате Saby', () => {
  const date = new Date(2026, 9, 29, 11, 7, 8, 9);
  assert.equal(formatDate(date), '2026-10-29');
  assert.equal(formatTime(date), '11:07:08.009');
});

test('resolveStatus принимает id и название', () => {
  assert.equal(resolveStatus(488), 488);
  assert.equal(resolveStatus('488'), 488);
  assert.equal(resolveStatus('Тестирование проведено'), 488);
  assert.equal(resolveStatus('не тестировался'), 486);
  assert.equal(statusName(488), 'Тестирование проведено');
  assert.throws(() => resolveStatus('такого статуса нет'), /Неизвестный статус/);
});
