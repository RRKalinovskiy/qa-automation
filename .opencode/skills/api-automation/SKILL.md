---
name: API Automation
description: Написание и ревью API-автотестов на Playwright — слои проверок, клиент, авторизация, zod-схемы, негативные кейсы, подготовка данных и связка с Postman. Использовать, когда нужно покрыть эндпоинт, добавить контрактный или бизнес-тест API.
---

# API-автотесты

## Когда использовать

- Нужно покрыть новый эндпоинт или бизнес-правило.
- Нужно добавить контрактную, смоук- или регрессионную проверку API.
- Нужно подготовить данные для UI-тестов через API.
- Нужно разобрать падение API-теста.

## Слои

| Слой | Что проверяет | Когда |
|---|---|---|
| Контрактный | Статус, `Content-Type`, схема, обязательные поля | На каждый эндпоинт. |
| Смоук | Доступность и базовый успешный ответ | После деплоя. |
| Бизнес | Правила, состояния, права, идемпотентность | Основное покрытие. |
| Негативный | 4xx, валидация, ошибки авторизации | Обязательно для входных данных. |

## Куда писать

- Спека: `tests/api/<area>.spec.ts`.
- Клиент и заголовки: `src/api/client.ts`.
- Схемы ответов: `src/api/schemas/<entity>.ts`.
- Данные: `src/data/factories/`.
- Базовый URL: `API_BASE_URL` из `.env`, project `api` в `playwright.config.ts`.

## Правила

- Используй фикстуру `request` из `@playwright/test` — она берёт `baseURL` из конфига.
- На каждый ответ проверяй статус; для успешных — ещё и схему.
- Схемы описывай в zod и переиспользуй между тестами.
- Негативные проверки — отдельные тесты с явными ожиданиями по коду и телу ошибки.
- Данные создавай через API и удаляй в teardown.
- Не полагайся на порядок тестов и общий изменяемый стенд.
- Токен — только из `API_TOKEN`, не хардкодь.
- Для нестабильных внешних сервисов используй мок/симуляцию, а не `waitForTimeout`.

## Пример

```ts
import { test, expect } from '@playwright/test';
import { z } from 'zod';
import { buildTestUser } from '../../src/data/factories/user';

const userSchema = z.object({
  id: z.union([z.string(), z.number()]),
  email: z.string().email(),
  name: z.string().min(1),
});

test('создание пользователя возвращает контракт', async ({ request }) => {
  const user = buildTestUser();

  const response = await request.post('/users', { data: user });

  expect(response.status()).toBe(201);
  expect(response.headers()['content-type']).toContain('application/json');

  const body = userSchema.parse(await response.json());
  expect(body.email).toBe(user.email);
});
```

## Авторизация

```ts
import { request } from '@playwright/test';
import { env } from '../config/env';

const api = await request.newContext({
  baseURL: env.apiBaseUrl,
  extraHTTPHeaders: env.apiToken
    ? { Authorization: `Bearer ${env.apiToken}` }
    : {},
});
```

Если в проекте несколько ролей — создавай отдельные контексты и закрывай их в `afterAll`.

## Негативные кейсы

Проверяй минимум:

- отсутствие обязательного поля;
- неверный тип или формат;
- пустое значение и границы длины;
- отсутствие/просроченный токен;
- доступ к чужому объекту;
- повторный запрос (идемпотентность);
- конфликт уникальности (`409`).

## Связка с Postman

- Коллекция Postman — источник контракта и ручных проверок.
- Для CI и локальных прогонов используй Newman или `postman collection run`.
- Моки и симуляции — через навыки `api-mocking` и `api-simulation`.
- Перед написанием тестов сверься с `api-testing` и `api-engineer`.

## Чек-лист

- [ ] Проверены статус, `Content-Type` и схема.
- [ ] Есть позитивный, негативный и граничный кейсы.
- [ ] Данные уникальны и очищаются.
- [ ] Нет хардкода URL, токенов и общих сущностей.
- [ ] Тест проходит при `--workers=4`.
- [ ] `npm run typecheck` зелёный.
