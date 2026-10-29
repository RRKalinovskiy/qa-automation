/**
 * Кодирование и разбор структур Saby (record / recordset).
 *
 * Saby передаёт записи не объектами, а плоскими структурами:
 *   { _type: "record", f: 0, s: [{ n, t }], d: [value, ...] }
 *   { _type: "recordset", f: 0, s: [{ n, t }], d: [[...], ...] }
 *
 * Экспортирует только чистые функции — их удобно покрывать unit-тестами.
 */

const TRANSLIT_MAP = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'Zh',
  З: 'Z', И: 'I', Й: 'J', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O',
  П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'H', Ц: 'C',
  Ч: 'Ch', Ш: 'Sh', Щ: 'Sch', Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'Yu',
  Я: 'Ya',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

/**
 * Точные значения x-calledmethod для методов, которые уже проверены.
 * Для остальных используется транслитерация.
 */
const CALLED_METHOD_OVERRIDES = {
  'Проверка.ПрочитатьДляУчастника': 'Proverka.ProchitatDlyaUchastnika',
  'Проверка.Записать': 'Proverka.Zapisat',
  'Проверка.Создать': 'Proverka.Sozdat',
  'Проверка.МассовоеИзменениеСтатусаИзПМО':
    'Proverka.MassovoeIzmenenieStatusaIzPMO',
  'Проверка.СтатистикаПоПроверке': 'Proverka.StatistikaPoProverke',
  'Проверка.СтатистикаПоРабочейЗоне':
    'Proverka.StatistikaPoRabochejZone',
  'ПунктПроверки.СписокПунктовПроверки':
    'PunktProverki.SpisokPunktovProverki',
  'ПунктПроверки.Создать': 'PunktProverki.Sozdat',
  'ПунктПроверки.Записать': 'PunktProverki.Zapisat',
  'ПунктПроверки.ПрочитатьДляУчастника':
    'PunktProverki.ProchitatDlyaUchastnika',
  'Документ.УдалитьДокументы': 'Dokument.UdalitDokumenty',
  'Документ.Восстановить': 'Dokument.Vosstanovit',
  'SAP.GetUserId': 'SAP.GetUserId',
};

export function transliterate(value) {
  return [...String(value)].map((char) => TRANSLIT_MAP[char] ?? char).join('');
}

/** Значение заголовка x-calledmethod: латиница, без кириллицы. */
export function calledMethod(method) {
  return CALLED_METHOD_OVERRIDES[method] ?? transliterate(method);
}

/** Значение заголовка x-originalmethodname: base64 от UTF-8. */
export function originalMethodHeader(method) {
  return Buffer.from(method, 'utf8').toString('base64');
}

/**
 * @typedef {{ name: string, type: any, value: any }} Field
 */

/**
 * @param {Field[]} fields
 * @returns {{ _type: 'record', f: number, s: {n: string, t: any}[], d: any[] }}
 */
export function encodeRecord(fields) {
  return {
    _type: 'record',
    f: 0,
    s: fields.map((field) => ({ n: field.name, t: field.type })),
    d: fields.map((field) => field.value),
  };
}

/**
 * @param {{ name: string, type: any }[]} columns
 * @param {any[][]} rows
 */
export function encodeRecordSet(columns, rows) {
  return {
    _type: 'recordset',
    f: 0,
    s: columns.map((column) => ({ n: column.name, t: column.type })),
    d: rows,
  };
}

/** Разбирает record в объект. Вложенные структуры остаются как есть. */
export function decodeRecord(value) {
  if (!value || value._type !== 'record') {
    throw new Error('Ожидалась структура record');
  }
  const result = {};
  (value.s ?? []).forEach((column, index) => {
    result[column.n] = value.d?.[index];
  });
  return result;
}

/**
 * Рекурсивно разбирает record/recordset, включая вложенные структуры.
 * Нужен для карточек проекта, этапа и SabyDoc.
 */
export function decodeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (value._type === 'record') {
    const result = {};
    (value.s ?? []).forEach((column, index) => {
      result[column.n] = decodeDeep(value.d?.[index]);
    });
    return result;
  }
  if (value._type === 'recordset') {
    const columns = (value.s ?? []).map((column) => column.n);
    return (value.d ?? []).map((row) => {
      const item = {};
      columns.forEach((name, index) => {
        item[name] = decodeDeep(row?.[index]);
      });
      return item;
    });
  }
  if (Array.isArray(value)) return value.map(decodeDeep);
  return value;
}

/** Разбирает recordset в массив объектов. */
export function decodeRecordSet(value) {
  if (!value || value._type !== 'recordset') {
    throw new Error('Ожидалась структура recordset');
  }
  const columns = (value.s ?? []).map((column) => column.n);
  return (value.d ?? []).map((row) => {
    const item = {};
    columns.forEach((name, index) => {
      item[name] = row?.[index];
    });
    return item;
  });
}

/** Первое значение массива-ссылки: [306974729] -> 306974729. */
export function firstValue(value) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

/** ISO 8601 duration из минут: 30 -> P0DT0H30M0S. */
export function minutesToDuration(minutes) {
  if (minutes == null || Number.isNaN(Number(minutes))) return null;
  const total = Math.max(0, Math.round(Number(minutes)));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return `P0DT${hours}H${rest}M0S`;
}

/** ISO 8601 duration в минуты: P0DT1H15M0S -> 75. */
export function durationToMinutes(duration) {
  if (!duration || typeof duration !== 'string') return null;
  const match = duration.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  return (
    Number(match[1] ?? 0) * 24 * 60 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  );
}

export function formatDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTime(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const millis = String(date.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${millis}`;
}

/** Значение x-lastmodification в формате, который присылает веб-клиент. */
export function formatLastModification(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timePart =
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
    `.${String(date.getMilliseconds()).padStart(3, '0')}000`;
  return `${datePart}T${timePart}+03`;
}
