---
name: UI Automation
description: Написание и ревью UI-автотестов на Playwright — Page Object Model, устойчивые локаторы, web-first ожидания, авторизация через storageState, изоляция тестов и отладка через trace. Использовать, когда нужно покрыть пользовательский путь или разобрать нестабильный UI-тест.
---

# UI-автотесты

## Когда использовать

- Нужно покрыть пользовательский путь, который нельзя проверить через API.
- Нужно добавить или отревьюить Page Object.
- Тест нестабилен, падает по таймауту или «мигает».
- Нужно настроить авторизацию и состояние браузера.

## Паттерн

- Page Object — в `src/ui/pages/<page>.page.ts`, наследуется от `BasePage`.
- Компоненты (меню, таблица, модалка) — в `src/ui/components/`.
- Локаторы и действия — только внутри Page Object.
- Тест описывает сценарий, а не клики по селекторам.
- Один файл теста — одна область: `tests/ui/<area>.spec.ts`.

## Локаторы

Приоритет:

1. `getByRole` — кнопки, ссылки, заголовки, поля.
2. `getByLabel` / `getByPlaceholder` — поля формы.
3. `getByTestId` — если это согласованный `data-testid`.
4. CSS — только как исключение.

Запрещено:

- XPath;
- привязка к позиции (`nth`, `:nth-child`) без необходимости;
- локаторы по сгенерированным классам;
- `page.locator('div > span')` и подобная структура.

## Ожидания

- Используй web-first assertions: `await expect(locator).toBeVisible()`.
- Не используй `waitForTimeout` и `sleep`.
- Для навигации — `await expect(page).toHaveURL(...)`.
- Для сетевых операций — дождись видимого результата, а не ответа сети.
- Таймауты задавай в конфиге, а не в каждом тесте.

## Авторизация

- Один раз создай состояние и сохрани в `.auth/<role>.json`.
- В конфиге проекта подключи `storageState`.
- Токены и пароли — из `.env`, состояние — в `.gitignore`.
- Для теста входа используй отдельный контекст без `storageState`.

```ts
// playwright.config.ts (фрагмент)
use: {
  storageState: '.auth/user.json',
},
```

## Пример

```ts
// src/ui/pages/login.page.ts
import { expect, type Page } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get emailInput() {
    return this.page.getByLabel('Email');
  }

  private get passwordInput() {
    return this.page.getByLabel('Пароль');
  }

  private get submitButton() {
    return this.page.getByRole('button', { name: 'Войти' });
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await expect(this.page).toHaveURL(/dashboard/);
  }
}
```

```ts
// tests/ui/auth.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../src/ui/pages/login.page';

test('успешный вход', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.open('/login');
  await loginPage.login(process.env.UI_USER!, process.env.UI_PASSWORD!);

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

## Изоляция

- Каждый тест сам создаёт нужное состояние через API или фабрику.
- Не зависит от порядка запуска и параллельных тестов.
- Не переиспользуй изменяемые сущности между тестами.
- Для медленных предусловий — API, а не проход по UI.

## Отладка

- `npx playwright test --ui` — интерактивный режим.
- `npx playwright test --debug` — пошаговый запуск.
- Trace: `npx playwright show-trace test-results/<test>/trace.zip`.
- При падении смотри скриншот, видео и сетевые запросы, а не только сообщение.
- Если тест нестабилен — сначала устрани причину, потом добавляй retry.

## Чек-лист

- [ ] Локаторы устойчивы и не привязаны к структуре.
- [ ] Нет `waitForTimeout`, XPath и `nth` без необходимости.
- [ ] Есть проверка URL/состояния после ключевых действий.
- [ ] Тест независим и проходит при `--workers=4`.
- [ ] Авторизация через `storageState`, секреты в `.env`.
- [ ] Page Object не содержит assert-логики бизнес-уровня.
- [ ] Падение диагностируется по trace.
