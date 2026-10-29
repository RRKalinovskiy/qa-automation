#!/usr/bin/env node
/**
 * MCP-сервер «Saby Checks».
 *
 * Даёт агенту инструменты для чтения и написания проверок Saby:
 * проверка → этапы → пункты, статусы, импорт сценария.
 *
 * Запуск: node mcp/saby-checks/server.mjs
 * Авторизация: npm run saby:login (storageState) или SABY_COOKIE.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import 'dotenv/config';

import { CheckService, DEFAULT_TEMPLATE_ID } from './checks.mjs';
import { SabyClient, SabyError } from './client.mjs';
import { DEFAULT_STATUSES } from './statuses.mjs';
import {
  MARK_RULES,
  MAX_PLANNED_MINUTES,
  TEST_NAME_PREFIXES,
  rulesSummary,
} from './rules.mjs';

const server = new McpServer({
  name: 'saby-checks',
  version: '0.1.0',
});

let service;

function getService() {
  if (!service) {
    service = new CheckService(new SabyClient());
  }
  return service;
}

function ok(data) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function fail(error) {
  const message =
    error instanceof SabyError
      ? error.message
      : error?.message || String(error);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
  };
}

function compactCheck(check) {
  const { raw, ...rest } = check;
  return rest;
}

function compactPoint(point) {
  const { raw, ...rest } = point;
  return rest;
}

const checkRef = z
  .string()
  .min(1)
  .describe('Проверка: числовой id, guid или ссылка /doc/<guid>');

const statusValue = z
  .union([z.string(), z.number()])
  .describe('Статус: id (488) или название («Тестирование проведено»)');

const pointRef = z
  .union([z.string(), z.number()])
  .describe('id пункта/этапа (документа), не структуры');

server.registerTool(
  'saby_check_get',
  {
    title: 'Прочитать проверку',
    description:
      'Возвращает карточку проверки Saby по id, guid или ссылке: название, номер, шаблон, ' +
      'ответственного, корневую структуру и ссылку. Используйте перед любыми изменениями.',
    inputSchema: z.object({
      check: checkRef,
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ check }) => {
    try {
      const value = await getService().resolveCheck(check);
      return ok(compactCheck(value));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_point_get',
  {
    title: 'Прочитать пункт проверки',
    description:
      'Возвращает карточку пункта/этапа по id документа: название, описание, статус, ' +
      'плановое время, родителя и id проверки. Полезно для отладки и проверки после записи.',
    inputSchema: z.object({
      pointId: pointRef,
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ pointId }) => {
    try {
      const point = await getService().readPoint(pointId);
      return ok(compactPoint(point));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_tree',
  {
    title: 'Дерево проверки',
    description:
      'Читает этапы и пункты проверки. depth=1 — только корневые этапы, depth=2 — этапы и их пункты. ' +
      'structureId — идентификатор структуры (нужен для создания дочерних пунктов), docId — id документа.',
    inputSchema: z.object({
      check: checkRef,
      depth: z.number().int().min(1).max(3).default(2),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ check, depth }) => {
    try {
      const checkInfo = await getService().resolveCheck(check);
      const tree = await getService().getTree(checkInfo.id, depth);
      return ok({
        check: compactCheck(tree.check),
        stages: tree.stages,
      });
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_statuses',
  {
    title: 'Статусы проверки',
    description:
      'Возвращает доступные статусы пунктов: id, название, цвет. Если передана проверка — ' +
      'читает статистику по ней, иначе возвращает известный набор стенда.',
    inputSchema: z.object({
      check: checkRef.optional(),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ check }) => {
    try {
      if (!check) return ok({ statuses: DEFAULT_STATUSES, source: 'default' });
      const checkInfo = await getService().resolveCheck(check);
      const statuses = await getService().getStatuses(checkInfo.id);
      return ok({ statuses, source: 'check' });
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_rules',
  {
    title: 'Правила оформления тестов',
    description:
      'Возвращает правила оформления тестов Saby: префиксы ТК/ЧЛ/Т, поля «Комментарий» и «Описание», ' +
      'формат ПРЕДУСЛОВИЯ, лимит 5 минут и mapping пометок (ПК/МК/АТ).',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  },
  async () => ok(rulesSummary()),
);

server.registerTool(
  'saby_check_create',
  {
    title: 'Создать проверку',
    description:
      'Создаёт документ «Проверка» по шаблону (по умолчанию 485 «Тестирование проекта») и задаёт название. ' +
      'Нужны employeeId и departmentId — их можно взять из существующей проверки (saby_check_get) ' +
      'или задать SABY_EMPLOYEE_ID и SABY_DEPARTMENT_ID. dryRun=true показывает план.',
    inputSchema: z.object({
      name: z.string().min(1).describe('Название проверки'),
      templateId: z.number().int().positive().default(DEFAULT_TEMPLATE_ID),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      time: z.string().regex(/^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/).optional(),
      employeeId: z.number().int().positive().optional().describe('id сотрудника (Сотрудник проверки)'),
      departmentId: z.number().int().positive().optional().describe('id подразделения'),
      dryRun: z.boolean().default(false),
    }),
  },
  async (input) => {
    try {
      if (input.dryRun) {
        return ok({
          dryRun: true,
          action: 'createCheck',
          input,
          note:
            'Реальное создание выполнит Проверка.Создать + Проверка.Записать. ' +
            'Проверьте templateId и название.',
        });
      }
      const check = await getService().createCheck(input);
      return ok(compactCheck(check));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_stage_create',
  {
    title: 'Создать этап проверки',
    description:
      'Создаёт этап (раздел) внутри указанного этапа/раздела проверки. ' +
      'parentSectionId — structureId родителя из saby_check_tree. ' +
      'Создание корневых этапов через API не поддерживается: если parentSectionId не задан, ' +
      'используется первый корневой этап проверки.',
    inputSchema: z.object({
      check: checkRef,
      parentSectionId: z.number().int().positive().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      plannedMinutes: z.number().int().min(0).max(6000).optional(),
      dryRun: z.boolean().default(false),
    }),
  },
  async (input) => {
    try {
      const checkInfo = await getService().resolveCheck(input.check);
      const parentSectionId =
        input.parentSectionId ?? (await getService().defaultParentSectionId(checkInfo.id));
      if (input.dryRun) {
        return ok({
          dryRun: true,
          action: 'createStage',
          check: compactCheck(checkInfo),
          parentSectionId,
          name: input.name,
          description: input.description ?? null,
          plannedMinutes: input.plannedMinutes ?? null,
        });
      }
      const stage = await getService().createStage({
        checkId: checkInfo.id,
        parentSectionId,
        name: input.name,
        description: input.description,
        plannedMinutes: input.plannedMinutes,
      });
      return ok({ check: compactCheck(checkInfo), stage: compactPoint(stage) });
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_point_create',
  {
    title: 'Создать пункт проверки',
    description:
      'Создаёт тест внутри этапа. Соблюдает правила: имя начинается с ТК/ЧЛ/Т, короткое описание — ' +
      'в «Комментарий», предварительные шаги — в «Описание» (ПРЕДУСЛОВИЕ), план не более 5 минут. ' +
      'parentSectionId — structureId этапа из saby_check_tree.',
    inputSchema: z.object({
      check: checkRef,
      parentSectionId: z.number().int().positive(),
      type: z.enum(['ТК', 'ЧЛ', 'Т']).default('ТК'),
      name: z.string().min(1).describe('Название теста; префикс ТК/ЧЛ/Т обязателен'),
      comment: z
        .string()
        .min(1)
        .describe('Короткое описание, что проверяем — поле «Комментарий»'),
      description: z.string().optional().describe('Готовое описание, если уже собрано'),
      precondition: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe('Предварительные шаги; формат ПРЕДУСЛОВИЕ: 1. ...'),
      steps: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe('Шаги теста'),
      expected: z.string().optional().describe('Ожидаемый результат'),
      statusComment: z
        .string()
        .optional()
        .describe('Комментарий статуса («Текущее состояние»); обычно пустой'),
      plannedMinutes: z
        .number()
        .int()
        .min(0)
        .max(MAX_PLANNED_MINUTES)
        .default(MAX_PLANNED_MINUTES),
      status: statusValue.optional(),
      assigneeId: z.number().int().positive().optional(),
      mark: z
        .enum(['pc', 'mobile_important', 'mobile_minor', 'mobile_noncritical', 'automated'])
        .optional()
        .describe('Пометка по правилам: pc — ПК, mobile_* — МК, automated — АТ'),
      dryRun: z.boolean().default(false),
    }),
  },
  async (input) => {
    try {
      const checkInfo = await getService().resolveCheck(input.check);
      if (input.dryRun) {
        return ok({
          dryRun: true,
          action: 'createPoint',
          check: compactCheck(checkInfo),
          parentSectionId: input.parentSectionId,
          name: input.name,
          comment: input.comment,
          description: input.description ?? null,
          precondition: input.precondition ?? null,
          steps: input.steps ?? null,
          expected: input.expected ?? null,
          statusComment: input.statusComment ?? null,
          plannedMinutes: input.plannedMinutes,
          status: input.status ?? 'Не тестировался',
          assigneeId: input.assigneeId ?? null,
          mark: input.mark ?? null,
        });
      }
      const point = await getService().createPoint({
        checkId: checkInfo.id,
        parentSectionId: input.parentSectionId,
        type: input.type,
        name: input.name,
        comment: input.comment,
        description: input.description,
        precondition: input.precondition,
        steps: input.steps,
        expected: input.expected,
        statusComment: input.statusComment,
        plannedMinutes: input.plannedMinutes,
        status: input.status,
        assigneeId: input.assigneeId,
        mark: input.mark,
      });
      return ok({ check: compactCheck(checkInfo), point: compactPoint(point) });
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_point_update',
  {
    title: 'Изменить пункт проверки',
    description:
      'Частично обновляет тест: название, «Комментарий», «Описание» (ПРЕДУСЛОВИЕ/ШАГИ/РЕЗУЛЬТАТ), ' +
      'план (не более 5 минут), статус, ответственного. pointId — id документа из saby_check_tree.',
    inputSchema: z.object({
      pointId: pointRef,
      type: z.enum(['ТК', 'ЧЛ', 'Т']).default('ТК'),
      name: z.string().min(1).optional(),
      comment: z.string().min(1).optional().describe('Короткое описание, что проверяем'),
      description: z.string().optional(),
      precondition: z.union([z.string(), z.array(z.string())]).optional(),
      steps: z.union([z.string(), z.array(z.string())]).optional(),
      expected: z.string().optional(),
      statusComment: z.string().optional(),
      plannedMinutes: z.number().int().min(0).max(MAX_PLANNED_MINUTES).optional(),
      status: statusValue.optional(),
      assigneeId: z.number().int().positive().optional(),
      mark: z
        .enum(['pc', 'mobile_important', 'mobile_minor', 'mobile_noncritical', 'automated'])
        .optional(),
      isStage: z.boolean().default(false).describe('true — обновляется этап, а не тест'),
    }),
  },
  async (input) => {
    try {
      const point = await getService().updatePoint(input.pointId, input);
      return ok(compactPoint(point));
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_status_set',
  {
    title: 'Сменить статус пунктов',
    description:
      'Массово меняет статус пунктов проверки (Проверка.МассовоеИзменениеСтатусаИзПМО). ' +
      'Не меняйте статусы существующих пунктов без явного запроса пользователя.',
    inputSchema: z.object({
      check: checkRef,
      pointIds: z.array(pointRef).min(1),
      status: statusValue,
    }),
  },
  async ({ check, pointIds, status }) => {
    try {
      const checkInfo = await getService().resolveCheck(check);
      const result = await getService().setStatus(checkInfo.id, pointIds, status);
      return ok({ check: compactCheck(checkInfo), ...result });
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_item_delete',
  {
    title: 'Удалить пункты/этапы',
    description:
      'Удаляет пункты/этапы из структуры проверки (ПунктПроверки.Remove по id структуры). ' +
      'Перед удалением проверяет принадлежность проверке. Для этапа с вложенными пунктами ' +
      'нужен recursive=true: дочерние пункты удаляются первыми. Требует confirm=true.',
    inputSchema: z.object({
      check: checkRef,
      itemIds: z.array(pointRef).min(1),
      recursive: z.boolean().default(false),
      confirm: z.literal(true),
    }),
  },
  async ({ check, itemIds, recursive }) => {
    try {
      const checkInfo = await getService().resolveCheck(check);
      const structureIds = [];
      for (const itemId of itemIds) {
        const point = await getService().readPoint(itemId);
        if (Number(point.checkId) !== Number(checkInfo.id)) {
          throw new SabyError(
            `Объект ${itemId} принадлежит проверке ${point.checkId}, а не ${checkInfo.id}. Удаление отменено.`,
          );
        }
        if (point.structureId == null) {
          throw new SabyError(`У объекта ${itemId} нет id структуры`);
        }
        const children = await getService().listChildren(
          checkInfo.id,
          point.structureId,
        );
        if (children.length > 0 && !recursive) {
          throw new SabyError(
            `У объекта ${itemId} есть вложенные пункты (${children.length}). ` +
              'Удалите их отдельно или передайте recursive=true.',
          );
        }
        if (recursive) {
          structureIds.push(
            ...(await getService().collectStructureIds(
              checkInfo.id,
              point.structureId,
            )),
          );
        } else {
          structureIds.push(Number(point.structureId));
        }
      }
      const result = await getService().removePoints([...new Set(structureIds)]);
      return ok({
        check: compactCheck(checkInfo),
        structureIds: result.structureIds,
        removed: result.result,
      });
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_delete',
  {
    title: 'Удалить проверку',
    description:
      'Удаляет всю проверку в корзину (Документ.УдалитьДокументы). Опасная операция: требует confirm=true. ' +
      'Используйте только для созданной вами проверки и после подтверждения пользователя.',
    inputSchema: z.object({
      check: checkRef,
      confirm: z.literal(true),
    }),
  },
  async ({ check }) => {
    try {
      const checkInfo = await getService().resolveCheck(check);
      const result = await getService().deleteItems([checkInfo.id]);
      return ok({ check: compactCheck(checkInfo), ...result });
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_import_scenario',
  {
    title: 'Импортировать сценарий в проверку',
    description:
      'Создаёт этапы и тесты из структурированного сценария по правилам: имена ТК/ЧЛ/Т, «Комментарий», ' +
      '«Описание» с ПРЕДУСЛОВИЕМ, план не более 5 минут, пометки ПК/МК/АТ. ' +
      'Сначала вызывайте с dryRun=true. Существующие этапы/тесты переиспользуются.',
    inputSchema: z.object({
      check: checkRef,
      parentSectionId: z.number().int().positive().optional(),
      sections: z
        .array(
          z.object({
            name: z.string().min(1),
            description: z.string().optional(),
            plannedMinutes: z.number().int().min(0).max(6000).optional(),
            points: z
              .array(
                z.object({
                  type: z.enum(['ТК', 'ЧЛ', 'Т']).default('ТК'),
                  name: z.string().min(1),
                  comment: z.string().min(1),
                  description: z.string().optional(),
                  precondition: z.union([z.string(), z.array(z.string())]).optional(),
                  steps: z.union([z.string(), z.array(z.string())]).optional(),
                  expected: z.string().optional(),
                  statusComment: z.string().optional(),
                  plannedMinutes: z
                    .number()
                    .int()
                    .min(0)
                    .max(MAX_PLANNED_MINUTES)
                    .default(MAX_PLANNED_MINUTES),
                  status: statusValue.optional(),
                  assigneeId: z.number().int().positive().optional(),
                  mark: z
                    .enum(['pc', 'mobile_important', 'mobile_minor', 'mobile_noncritical', 'automated'])
                    .optional(),
                }),
              )
              .default([]),
          }),
        )
        .min(1),
      dryRun: z.boolean().default(true),
      onExisting: z.enum(['reuse', 'error']).default('reuse'),
      updateExisting: z.boolean().default(false),
      cleanupOnError: z.boolean().default(true),
      maxPoints: z.number().int().min(1).max(1000).default(200),
    }),
  },
  async (input) => {
    try {
      const checkInfo = await getService().resolveCheck(input.check);
      const result = await getService().importScenario({
        ...input,
        checkId: checkInfo.id,
      });
      return ok({ ...result, check: compactCheck(result.check) });
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  'saby_check_verify',
  {
    title: 'Проверить структуру проверки',
    description:
      'Сверяет фактическое дерево проверки с ожидаемым: этапы и пункты по названиям. ' +
      'Возвращает missing/extra/mismatches. Используйте после импорта сценария.',
    inputSchema: z.object({
      check: checkRef,
      expected: z.object({
        sections: z
          .array(
            z.object({
              name: z.string().min(1),
              points: z.array(z.string().min(1)).default([]),
            }),
          )
          .min(1),
      }),
      strict: z.boolean().default(false),
    }),
    annotations: { readOnlyHint: true },
  },
  async ({ check, expected, strict }) => {
    try {
      const checkInfo = await getService().resolveCheck(check);
      const tree = await getService().getTree(checkInfo.id, 2);
      const actualStages = new Map(
        tree.stages.map((stage) => [String(stage.name).trim(), stage]),
      );
      const missingSections = [];
      const extraSections = [];
      const mismatches = [];

      for (const expectedSection of expected.sections) {
        const key = String(expectedSection.name).trim();
        const stage = actualStages.get(key);
        if (!stage) {
          missingSections.push(key);
          continue;
        }
        const actualPoints = new Set(
          (stage.children ?? []).map((point) => String(point.name).trim()),
        );
        for (const pointName of expectedSection.points) {
          if (!actualPoints.has(String(pointName).trim())) {
            mismatches.push({ section: key, missingPoint: pointName });
          }
        }
        if (strict) {
          const expectedPoints = new Set(expectedSection.points.map((name) => String(name).trim()));
          for (const pointName of actualPoints) {
            if (!expectedPoints.has(pointName)) {
              mismatches.push({ section: key, extraPoint: pointName });
            }
          }
        }
      }
      if (strict) {
        const expectedNames = new Set(expected.sections.map((section) => String(section.name).trim()));
        for (const stageName of actualStages.keys()) {
          if (!expectedNames.has(stageName)) extraSections.push(stageName);
        }
      }

      return ok({
        check: compactCheck(checkInfo),
        ok:
          missingSections.length === 0 &&
          extraSections.length === 0 &&
          mismatches.length === 0,
        missingSections,
        extraSections,
        mismatches,
        actual: tree.stages.map((stage) => ({
          name: stage.name,
          points: (stage.children ?? []).map((point) => point.name),
        })),
      });
    } catch (error) {
      return fail(error);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('saby-checks MCP запущен (stdio)');
