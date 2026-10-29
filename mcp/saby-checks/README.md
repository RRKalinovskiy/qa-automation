# MCP `saby-checks`

Локальный MCP-сервер для проверок Saby и чтения проектов: карточка
проверки, дерево этапов и пунктов, создание, частичная запись, статусы,
импорт сценария, верификация, план слияния дублей и удаление. Отдельный
read-only блок читает project.sbis.ru: этапы, документы, SabyDoc,
требования и черновик проверки.

## Запуск

```bash
npm run saby:login     # один раз, сохраняет .auth/saby.json
npm run saby:session   # проверить авторизацию
npm run mcp:saby       # запустить сервер вручную (stdio)
```

Для project.sbis.ru при необходимости задайте отдельный
`SABY_PROJECT_COOKIE` или `SABY_PROJECT_BASE_URL`.

В OpenCode сервер уже подключён в `opencode.jsonc` → `mcp.saby-checks`.

## Инструменты

| Инструмент | Назначение |
|---|---|
| `saby_check_get` | карточка проверки по id/guid/ссылке |
| `saby_check_point_get` | карточка пункта/этапа |
| `saby_check_tree` | этапы и пункты |
| `saby_check_statuses` | статусы и id |
| `saby_check_rules` | правила: ТК/ЧЛ, шаги ТК, комментарий, ПРЕДУСЛОВИЕ, 5 минут, пометки |
| `saby_project_get` | карточка проекта project.sbis.ru (только чтение) |
| `saby_project_documents` | документы проекта (только чтение) |
| `saby_project_document_read` | текст SabyDoc, оглавление и требования (только чтение) |
| `saby_project_requirements` | требования (Т) из документов проекта (только чтение) |
| `saby_project_map` | карта функционала: этапы, документы, требования (только чтение) |
| `saby_project_check_draft` | черновик проверки по проекту (только чтение) |
| `saby_check_create` | создать проверку |
| `saby_check_stage_create` | создать этап |
| `saby_check_point_create` | создать пункт (ЧЛ по умолчанию; ТК — тест-кейс, automation не обязателен) |
| `saby_check_point_update` | изменить пункт/этап |
| `saby_check_status_set` | массово сменить статус |
| `saby_check_item_delete` | удалить пункты/этапы |
| `saby_check_delete` | удалить проверку |
| `saby_check_merge_plan` | read-only план слияния идей в ЧЛ и поиск дублей |
| `saby_check_import_scenario` | импорт сценария (dryRun по умолчанию) |
| `saby_check_verify` | сверить структуру с ожидаемой |

## Файлы

- `server.mjs` — регистрация MCP-инструментов.
- `client.mjs` — JSON-RPC, cookie, guid → id, SSR `entityKey`.
- `checks.mjs` — доменные операции.
- `project.mjs` — read-only чтение project.sbis.ru, SabyDoc и требований.
- `records.mjs` — record/recordset, транслитерация, длительности.
- `statuses.mjs` — статусы и алиасы.

## Тесты

```bash
npm run test:mcp       # unit + smoke
npm run test:mcp:e2e   # MCP поверх локального мока Saby
```

Контракты и ограничения: `docs/api/sbis-checks.md`.
