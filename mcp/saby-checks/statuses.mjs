/**
 * Статусы пунктов проверки.
 *
 * Значения сняты с рабочего стенда 29.10.2026. На другом стенде набор
 * может отличаться — перед записью вызывайте saby_check_statuses.
 */

export const DEFAULT_STATUSES = [
  { id: 486, name: 'Не тестировался', color: '#4745A1', kind: 'readonly' },
  { id: 487, name: 'В процессе тестирования', color: '#E6A119', kind: 'warning' },
  { id: 490, name: 'Выпускаем с ошибками', color: '#188ECD', kind: 'success' },
  { id: 488, name: 'Тестирование проведено', color: '#24A83D', kind: 'success' },
  { id: 493, name: 'Автотест пройден', color: '#24A83D', kind: 'success' },
  { id: 494, name: 'Не проверяем', color: '#999999', kind: 'success' },
  { id: 491, name: 'Автотест не пройден', color: '#C2140A', kind: 'danger' },
  { id: 492, name: 'Ожидаем исправления', color: '#C2140A', kind: 'danger' },
  { id: 1241, name: 'В разработке', color: '#E6A119', kind: 'warning' },
];

const ALIASES = new Map([
  ['не тестировался', 486],
  ['не проверялся', 486],
  ['в процессе тестирования', 487],
  ['в работе', 487],
  ['выпускаем с ошибками', 490],
  ['тестирование проведено', 488],
  ['проведено', 488],
  ['passed', 488],
  ['автотест пройден', 493],
  ['не проверяем', 494],
  ['автотест не пройден', 491],
  ['failed', 491],
  ['ожидаем исправления', 492],
  ['в разработке', 1241],
]);

/**
 * Принимает id ("488", 488) или название ("Тестирование проведено")
 * и возвращает числовой id статуса.
 */
export function resolveStatus(value) {
  if (value == null || value === '') {
    throw new Error('Не указан статус пункта проверки');
  }
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    return Number(value);
  }
  const key = String(value).trim().toLowerCase();
  const alias = ALIASES.get(key);
  if (alias) return alias;
  const found = DEFAULT_STATUSES.find(
    (status) => status.name.toLowerCase() === key,
  );
  if (found) return found.id;
  throw new Error(
    `Неизвестный статус "${value}". Доступны: ` +
      DEFAULT_STATUSES.map((status) => `${status.name} (${status.id})`).join(', '),
  );
}

export function statusName(id) {
  return DEFAULT_STATUSES.find((status) => status.id === Number(id))?.name ?? null;
}

export function normalizeStatuses(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return DEFAULT_STATUSES;
  }
  return statuses
    .filter((status) => status && status.id != null)
    .map((status) => ({
      id: Number(status.id),
      name: status.name ?? statusName(status.id) ?? String(status.id),
      color: status.color ?? null,
    }));
}
