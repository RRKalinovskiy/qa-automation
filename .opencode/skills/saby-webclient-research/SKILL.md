---
name: Saby Web Client Research
description: Реверс-инжиниринг веб-клиента Saby — захват JSON-RPC, открытие карточек, вызов React-обработчиков, разбор record и проверка контрактов методов. Использовать, когда нужно найти метод, снять контракт с интерфейса или воспроизвести действие в обход UI.
---

# Исследование веб-клиента Saby

## Когда использовать

- Нужно найти JSON-RPC метод, который вызывает интерфейс.
- Нужно снять точный контракт запроса, который UI собирает сам.
- Нужно открыть карточку документа программно.
- Нужно нажать элемент, который не реагирует на обычный клик.
- Нужно проверить, существует ли метод, и чем он отвечает.

## Инструменты

- Встроенный браузер: `browser.tabs.open`, `browser.evaluate`,
  `browser.network.list/get`, `browser.snapshot`, `browser.click`, `browser.press`.
- `browser.evaluate` выполняется в контексте страницы: доступны `fetch`,
  `require`, DOM и React-свойства элементов.

## Подготовка

1. Открой `{SABY_BASE_URL}/page/crm-deals/` (или нужную страницу).
2. Убедись, что сессия жива: запросы к `/service/` отвечают `200`.
3. Учётные данные — из `.env`, не из кода.

## Захват трафика

1. Сними список запросов **до** действия:

```js
const before = await tools.browser.network.list({ tabID, limit: 500 });
```

2. Выполни действие.
3. Найди новые запросы к `/service/` и прочитай их:

```js
const g = await tools.browser.network.get({
  tabID, id, includeBody: true, maxBodyChars: 20000,
});
const method = g.requestHeaders.find(h => h.name.toLowerCase() === "x-calledmethod")?.value;
```

4. В `requestBody.text` лежит конверт JSON-RPC, в `responseBody.text` — ответ.

> Лог сети сбрасывается при навигации. После `navigate`/`reload` снимай заново.
> `maxBodyChars` ограничен 20 000 — длинные ответы читай частями или через `fetch`.

## Открытие карточки сделки

URL-маршруты карточку не открывают, синтетические клики по DOM — тоже.
Рабочий рецепт:

```js
const load = (name) => new Promise((res, rej) => require([name], res, rej));
const [{ Dialog }, constants] = await Promise.all([
  load("EDO3/opener"),
  load("EDO3/OpenerDialog/Constants"),
]);

new Dialog().open(
  {
    key: 56224,
    filter: {
      "ТипДокумента.ТипДокумента": "Лид",
      "ВызовИзБраузера": true,
      "ФильтрДокументНашаОрганизация": -1,
    },
  },
  { opener: null, openMode: constants.OpenMode?.popup ?? "popup" },
);
```

После вызова подожди появления `.crm-LeadCard`.

## Вызов действий через React

Saby игнорирует нативные `MouseEvent`, но принимает вызов React-пропсов.

```js
const el = document.querySelector('[data-qa="linkedDocuments"]');
const key = Object.keys(el).find(k => k.startsWith("__reactProps"));
const props = el[key];

const rect = el.getBoundingClientRect();
const event = {
  currentTarget: el, target: el, button: 0,
  clientX: rect.x + rect.width / 2,
  clientY: rect.y + rect.height / 2,
  preventDefault() {}, stopPropagation() {},
  nativeEvent: { button: 0 },
};

if (typeof props.onClick === "function") props.onClick(event);
else if (typeof props.onMouseDown === "function") props.onMouseDown(event);
```

Особенности:

- Кнопки тулбара (`linkedDocuments`, `deleteDocument`, вкладки) реагируют
  на `onMouseDown`, а не на `onClick`.
- У некоторых кнопок `onClick` — обёртка, которая сама вызывает внутренний
  обработчик. Если ничего не происходит, ищи вверх по `__reactFiber$` узел
  с `stateNode._buttonClick` / `_readOnlyHandler` и вызывай его.
- Для полосы этапов кликай по `[data-qa="crm-stageList__stage"]` с нужным текстом.
- Меню тулбара — `[data-qa="controls-Toolbar__menu"]`, часто через `onMouseDown`.

## Ввод текста

Обычные `input`/`textarea`:

```js
const setter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype, "value",
).set;
setter.call(el, "текст");
el.dispatchEvent(new Event("input", { bubbles: true }));
el.dispatchEvent(new Event("change", { bubbles: true }));
```

Slate-редактор (`[data-qa="textEditor_slate_Field"]`) не принимает `value`:

```js
ed.focus();
document.execCommand("insertText", false, "текст");
```

## Проверка существования метода

Отправь пустые `params` и классифицируй ответ:

- `Метод <Имя>/0 не найден или недоступен` — метода нет или он не маршрутизируется;
- `В объекте нет поля <Поле>` — метод есть, но контракт другой;
- `Не передан аргумент "<arg>"` — метод есть, не хватает аргумента;
- `result` — метод есть и принял пустой запрос.

```js
const t = await resp.text();
const exists = !/не найден или недоступен/.test(t);
```

Для кириллических имён используй `x-calledmethod` латиницей и
`x-originalmethodname` в base64 UTF-8.

## Разбор record

```js
const cols = result.s.map(c => c.n);
const rows = result.d.map(row =>
  Object.fromEntries(cols.map((n, i) => [n, row[i]])));
```

Если `result.d` — массив массивов, это `recordset`; если плоский массив —
одна `record`. Вложенные записи приходят такими же объектами `{_type, f, d, s}`.

## Подводные камни

| Симптом | Причина | Решение |
|---|---|---|
| `InvalidCharacterError` в `btoa` | кириллица в строке | кодируй через `TextEncoder` + `String.fromCharCode` |
| `String contains non ISO-8859-1` | кириллица в заголовке | заголовок только латиницей, оригинал — в base64 |
| Метод «не найден» | не тот сервис/метод или нет `x-adaptive` | сверь имя и добавь `x-adaptive: false` |
| Клик не срабатывает | Saby ждёт React-обработчик | вызывай `__reactProps.onClick` / `onMouseDown` |
| Карточка не открылась | URL-маршрут не подходит | используй `EDO3/opener` |
| После навигации ничего не работает | пропали helper'ы и лог сети | переопредели helper'ы, снимай трафик заново |
| Диалог блокирует навигацию | `beforeunload` или alert | `browser.dialog({ action: "accept" })`, затем продолжай |

## Дисциплина доказательств

- Помечай методы: ✅ проверен прямым вызовом, ⚠️ только трафик/код,
  ❓ существует, контракт неизвестен.
- Не подставляй «правдоподобные» поля в контракт — фиксируй ошибку сервера.
- Сохраняй реальные тела запросов и ответов в документ.
- После записи всегда перечитывай объект и проверяй инвариант.
- Побочные эффекты (созданные документы, изменённые поля) фиксируй отдельно.

## Чек-лист

- [ ] Трафик снят до и после действия, метод найден по `x-calledmethod`.
- [ ] Тело запроса и ответ сохранены, а не пересказаны.
- [ ] Карточка открыта через `EDO3/opener`.
- [ ] Клики идут через React-пропсы, а не через нативные события.
- [ ] Контракт проверен прямым вызовом и перечитыванием объекта.
- [ ] Неподтверждённые места помечены как открытые вопросы.
