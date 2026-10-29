# QA Automation

Учебно-рабочий проект: сценарии → тестовые данные → UI- и API-автотесты на Playwright + TypeScript.

## Быстрый старт

```bash
npm install
npx playwright install chromium
copy .env.example .env    # Windows
# cp .env.example .env    # macOS / Linux
```

Заполните в `.env` адреса стендов:

```dotenv
UI_BASE_URL=https://demo.example.com
API_BASE_URL=https://api.demo.example.com
API_TOKEN=
```

## Запуск

```bash
npm run test:api       # только API
npm run test:ui        # только UI (Chromium)
npm run test:smoke     # тесты с тегом @smoke
npm run test           # всё
npm run typecheck      # проверка типов
npm run report         # HTML-отчёт
```

Пока `API_BASE_URL`/`UI_BASE_URL` не заданы, соответствующие смоук-тесты пропускаются.

## MCP проверок Saby

Локальный MCP `saby-checks` умеет читать проверку, создавать этапы и пункты,
менять статусы и импортировать сценарий.

```bash
npm run saby:login     # один раз: войти в Saby и сохранить сессию
npm run saby:session   # проверить, что API отвечает
npm run test:mcp       # unit + smoke MCP
```

Авторизация хранится в `.auth/saby.json` (в `.gitignore`). Альтернатива —
переменная `SABY_COOKIE` с полной строкой Cookie. Если MCP уже был
запущен, после входа перезапустите сессию OpenCode.

- Контракты: [`docs/api/sbis-checks.md`](./docs/api/sbis-checks.md).
- Навыки: `saby-checks` (написать проверку по сценарию),
  `saby-checks-api` (контракты и поддержка MCP).
- Конфигурация MCP: `opencode.jsonc` → `mcp.saby-checks`.

## Как работаем

1. **Сценарии** — `docs/scenarios/<area>.md` по шаблону. ID `TC-<AREA>-<NNN>`.
2. **Данные** — `docs/test-data/<area>.md` + фабрика в `src/data/factories/`.
3. **API-тесты** — `tests/api/<area>.spec.ts`, сначала они.
4. **UI-тесты** — `tests/ui/<area>.spec.ts` через Page Object.
5. **Трассировка** — матрица в `docs/scenarios/README.md`.

Правила проекта, стек и карта всех навыков — в [`AGENTS.md`](./AGENTS.md).

## Структура

```text
docs/scenarios/      сценарии и шаблон
docs/test-data/      наборы данных и шаблон
mcp/saby-checks/     MCP-сервер проверок Saby
scripts/             saby:login, saby:session
src/api/             API-клиент и zod-схемы
src/config/          окружение
src/data/factories/  фабрики данных
src/ui/pages/        Page Object Model
tests/api/           API-спеки
tests/ui/            UI-спеки
.opencode/skills/    навыки: сценарии, данные, API, UI
```
