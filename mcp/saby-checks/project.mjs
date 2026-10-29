/**
 * Чтение проекта Saby: карточка, этапы, документы, SabyDoc и требования.
 *
 * Модуль только читает. Ни один метод не вызывает create/update/delete,
 * чтобы рабочий проект нельзя было изменить через MCP.
 */

import { decodeDeep, encodeRecord, firstValue } from './records.mjs';
import { SabyError } from './client.mjs';

export const DEFAULT_PROJECT_BASE_URL = 'https://project.sbis.ru';

const PROJECT_READ = (ref) => ({
  ИдО: ref,
  ИмяМетода: 'Проект.Список',
  ДопПоля: { ИмяОбъекта: 'Проект' },
});

const STAGE_READ = (ref) => ({
  ИдО: ref,
  ИмяМетода: 'Этап.Список',
  ДопПоля: { ИмяОбъекта: 'Этап' },
});

const ATTACH_FILTER = (projectId) =>
  encodeRecord([
    { name: 'catalogId', type: 'Строка', value: String(projectId) },
  ]);

const STAGE_STATUS = {
  0: 'Не начат',
  1: 'Выполнение',
  10: 'Завершён',
  12: 'Завершён',
};

function asText(value) {
  return value == null ? '' : String(value);
}

export function extractProjectRef(ref) {
  const raw = asText(ref).trim();
  if (!raw) throw new SabyError('Не указан проект: нужен id, uuid или ссылка');
  const guid = raw.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (guid) return guid[0];
  if (/^\d+$/.test(raw)) return Number(raw);
  throw new SabyError(
    `Не удалось найти id/uuid проекта в "${raw}". Передайте ссылку project.sbis.ru/uuid/...`,
  );
}

export function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Превращает сериализованный ModuleEditor/DocsEditor frame в текст.
 * Для карты функционала достаточно абзацев, списков, заголовков и таблиц.
 */
export function frameToText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return '';
  if (!Array.isArray(node)) {
    if (Array.isArray(node.Content)) return frameToText(node.Content);
    return '';
  }
  const [type, _props, ...children] = node;
  const childText = children.map(frameToText).join('');
  const nodeType = String(type ?? '');
  if (nodeType === 'br') return '\n';
  if (nodeType === 'p' || nodeType === 'paragraph') return `${childText}\n\n`;
  if (/table:Cell$/i.test(nodeType)) return `${childText.trim()} | `;
  if (/table:Row$/i.test(nodeType)) return `${childText.trim()}\n`;
  if (/paragraph:View|documentHeader:View|list:Item|heading/i.test(nodeType)) {
    return `${childText.trim()}\n`;
  }
  return childText;
}

export function normalizeDocText(text) {
  return asText(text)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractHeadings(siteInfo) {
  const toc = siteInfo?.PropertyValues?.tableOfContents;
  if (!Array.isArray(toc)) return [];
  return toc
    .map((heading) => ({
      id: heading.id ?? null,
      parentId: heading.parentId ?? null,
      level: Number(heading.level ?? 1),
      text: asText(heading.text).trim(),
    }))
    .filter((heading) => heading.text);
}

function headingLineIndex(lines, heading) {
  const target = heading.text.toLowerCase();
  return lines.findIndex((line) => {
    const normalized = line.toLowerCase().replace(/\s+/g, ' ').trim();
    return normalized === target || normalized.startsWith(target);
  });
}

function looksLikeRequirement(line) {
  const text = asText(line).trim();
  if (text.length < 40) return false;
  if (/^(https?:|www\.)/i.test(text)) return false;
  if (/^(таблица|рисунок|скриншот|источник|примечание)\b/i.test(text)) return false;
  if ((text.match(/\|/g) ?? []).length >= 2) return false;
  if (/[│├└]/.test(text)) return false;
  if (/^(params|record|section|activity|chats|recommendations)\s*\|/i.test(text)) {
    return false;
  }
  return /(должен|должна|должно|должны|необходимо|нужно|требуется|реализ|созда|отображ|пользов|систем|карточк|вкладк|пол[ея]|кнопк|валидац|api|метод|загруз|сохран|формат|интерфейс)/i.test(
    text,
  );
}

export function requirementCategory(text) {
  const value = asText(text);
  if (
    /(api|метод|CRMClients|лоадер|фабрик|react|typescript|\.tsx?|модул|конфиг|сервис|useSlice|AreaSlice|Controls\/|CRMClient\/|SabyPage|entityNew|storeId|getConfig|WrappedView|prefetchConfig)/i.test(
      value,
    )
  ) {
    return 'technical';
  }
  if (
    /(интерфейс|карточк|вкладк|пользов|кнопк|пол[ея]|валидац|отображ|макет|шапк|колонк)/i.test(
      value,
    )
  ) {
    return 'ui';
  }
  return 'general';
}

function requirementTitle(line, fallback) {
  const text = asText(line).trim();
  if (!text) return fallback;
  const sentence = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence;
}

/**
 * Извлекает требования из текста SabyDoc.
 *
 * Разделы TOC дают верхнеуровневые Т, а абзацы с модальными словами —
 * кандидаты в уточняющие требования. Это эвристика, а не юридический разбор:
 * результат нужно проверить человеком.
 */
export function extractRequirements(
  text,
  headings = [],
  { source = 'документ', max = 40 } = {},
) {
  const lines = normalizeDocText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const headingPositions = [];
  for (const heading of headings) {
    const index = headingLineIndex(lines, heading);
    if (index >= 0) headingPositions.push({ heading, index });
  }
  headingPositions.sort((a, b) => a.index - b.index);

  const requirements = [];
  const seen = new Set();
  const push = (item) => {
    const key = `${item.title}|${item.text}`.toLowerCase().slice(0, 300);
    if (seen.has(key)) return;
    seen.add(key);
    requirements.push({
      id: `T-${String(requirements.length + 1).padStart(3, '0')}`,
      source,
      ...item,
    });
  };

  for (let i = 0; i < headingPositions.length; i += 1) {
    const { heading, index } = headingPositions[i];
    const next = headingPositions[i + 1]?.index ?? lines.length;
    const sectionLines = lines.slice(index + 1, next);
    const sectionText = sectionLines.join(' ').trim();
    if (heading.level <= 2 || sectionText.length > 0) {
      push({
        title: heading.text,
        section: heading.text,
        text: sectionText.slice(0, 2000) || heading.text,
        kind: 'section',
        confidence: 'heading',
        level: heading.level,
        category: requirementCategory(`${heading.text} ${sectionText}`),
      });
    }
    for (const line of sectionLines) {
      if (!looksLikeRequirement(line)) continue;
      push({
        title: requirementTitle(line, heading.text),
        section: heading.text,
        text: line.slice(0, 2000),
        kind: 'statement',
        confidence: 'text',
        level: heading.level,
        category: requirementCategory(line),
      });
      if (requirements.length >= max) break;
    }
    if (requirements.length >= max) break;
  }

  if (requirements.length === 0) {
    for (const line of lines) {
      if (!looksLikeRequirement(line)) continue;
      push({
        title: requirementTitle(line, 'Требование'),
        section: 'Без раздела',
        text: line.slice(0, 2000),
        kind: 'statement',
        confidence: 'text',
        level: 1,
        category: requirementCategory(line),
      });
      if (requirements.length >= max) break;
    }
  }

  return requirements.slice(0, max);
}

export function mapStage(row) {
  const statusCode =
    row['Проект.СостояниеПроекта'] ?? row['РП.СтатусДокумента'] ?? null;
  const uuid = row['ИдентификаторДокумента'] ?? null;
  return {
    id: firstValue(row['Ид'] ?? row['@Документ']),
    uuid,
    name:
      row['ДокументРасширение.Название'] ??
      row['Название'] ??
      null,
    startDate: row['ПланДатаНач'] ?? row['Проект.ПланДатаНач'] ?? null,
    endDate:
      row['ДокументРасширение.Срок'] ??
      row['Проект.ПланДатаКнц'] ??
      null,
    statusCode,
    statusLabel: STAGE_STATUS[statusCode] ?? null,
    responsible:
      row['НазваниеСотрудника'] ??
      row['Сотрудник.Название'] ??
      null,
    department:
      row['ПодразделениеСотрудника'] ?? row['Подразделение.Название'] ?? null,
    tasks: Number(row['Задания'] ?? row['ЗаданияНаЭтапе'] ?? 0),
    planHours:
      row['ПлановоеВремяНаЭтапе'] ??
      row['ПлановоеВремя'] ??
      row['Проект.ПлановоеВремя'] ??
      null,
    factHours: row['ЗатратыВремени.Факт'] ?? null,
    url: uuid
      ? `https://project.sbis.ru/uuid/${uuid}/page/stage-main`
      : null,
  };
}

export function mapDocument(row) {
  const fileName = asText(row.fileName ?? row.title);
  return {
    attachId: row.attachId != null ? String(row.attachId) : null,
    fileId: row.FileId ?? null,
    redactionId: row.redactionId != null ? String(row.redactionId) : null,
    title: row.title ?? fileName,
    fileName,
    type: row.typeDoc ?? null,
    subType: row.subTypeDoc ?? null,
    objectUuid: row.objectUuid ?? null,
    createDate: row.createDate ?? null,
    responsible: row.responsibleName ?? null,
    redactions: Number(row.countRedactions ?? 0),
    signs: Number(row.countSigns ?? 0),
    isSabyDoc: /\.sabydoc$/i.test(fileName),
    isPdf: /\.pdf$/i.test(fileName),
    isLink: /\.url$/i.test(fileName),
    hidden: row.hidden === true,
  };
}

export function mapProject(record, baseUrl = DEFAULT_PROJECT_BASE_URL) {
  const uuid = record['ИдентификаторДокумента'] ?? null;
  const descriptionJson = record['Проект.ОписаниеJSON'];
  let descriptionFromFrame = '';
  if (typeof descriptionJson === 'string' && descriptionJson.trim()) {
    try {
      descriptionFromFrame = normalizeDocText(frameToText(JSON.parse(descriptionJson)));
    } catch {
      // описание может быть невалидным JSON — останется HTML-версия
    }
  }
  const stages = Array.isArray(record['СписокЭтапов'])
    ? record['СписокЭтапов'].map(mapStage).filter((stage) => stage.name)
    : [];
  return {
    id: Number(record['@Документ'] ?? record['Проект.@Документ'] ?? 0) || null,
    uuid,
    title:
      record['ДокументРасширение.Название'] ??
      record['Название'] ??
      null,
    description:
      descriptionFromFrame || htmlToText(record['Проект.Описание']),
    status:
      record['ТекущееСостояние'] ??
      record['ДокументРасширение.СостояниеКраткое'] ??
      null,
    statusCode: record['ДокументРасширение.СостояниеКраткое'] ?? null,
    startDate: record['Проект.ПланДатаНач'] ?? null,
    endDate:
      record['Проект.ПланДатаКнц'] ??
      record['ДокументРасширение.Срок'] ??
      null,
    responsible: record['НазваниеСотрудника'] ?? null,
    department: record['Подразделение.Название'] ?? null,
    stages,
    url: uuid ? `${baseUrl}/uuid/${uuid}/page/project-main` : null,
  };
}

function tokens(value) {
  return new Set(
    asText(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
}

function overlap(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let matches = 0;
  for (const token of a) if (b.has(token)) matches += 1;
  return matches / Math.min(a.size, b.size);
}

function pickStage(stageNames, requirement) {
  let best = null;
  let bestScore = 0;
  for (const stage of stageNames) {
    const score = Math.max(
      overlap(stage, requirement.section),
      overlap(stage, requirement.title),
    );
    if (score > bestScore) {
      best = stage;
      bestScore = score;
    }
  }
  return bestScore >= 0.25 ? best : null;
}

export class ProjectService {
  constructor(client, options = {}) {
    this.client = client;
    this.baseUrl = (
      options.baseUrl ||
      process.env.SABY_PROJECT_BASE_URL ||
      DEFAULT_PROJECT_BASE_URL
    ).replace(/\/$/, '');
  }

  async readProject(ref) {
    let projectRef = extractProjectRef(ref);
    let record = decodeDeep(
      await this.client.call('Проект.ПрочитатьДляУчастника', PROJECT_READ(projectRef)),
    );
    const numericId =
      Number(record['@Документ'] ?? record['Проект.@Документ'] ?? 0) || null;
    // По uuid сервер может не отдать СписокЭтапов. Второй вызов по
    // числовому id возвращает полную карточку.
    if (typeof projectRef !== 'number' && numericId) {
      projectRef = numericId;
      record = decodeDeep(
        await this.client.call(
          'Проект.ПрочитатьДляУчастника',
          PROJECT_READ(projectRef),
        ),
      );
    }
    return mapProject(record, this.baseUrl);
  }

  async readStage(ref) {
    const raw = await this.client.call(
      'Этап.ПрочитатьДляУчастника',
      STAGE_READ(extractProjectRef(ref)),
    );
    const record = decodeDeep(raw);
    return {
      id: Number(record['@Документ'] ?? 0) || null,
      uuid: record['ИдентификаторДокумента'] ?? null,
      name:
        record['ДокументРасширение.Название'] ??
        record['Название'] ??
        null,
      startDate: record['ПланДатаНач'] ?? null,
      endDate:
        record['ДокументРасширение.Срок'] ??
        record['Проект.ПланДатаКнц'] ??
        null,
      description: htmlToText(record['Проект.Описание']),
      statusCode:
        record['Проект.СостояниеПроекта'] ??
        record['РП.СтатусДокумента'] ??
        null,
      responsible: record['НазваниеСотрудника'] ?? null,
      department: record['Подразделение.Название'] ?? null,
      tasks: Number(record['Задания'] ?? 0),
      url:
        record['ИдентификаторДокумента']
          ? `${this.baseUrl}/uuid/${record['ИдентификаторДокумента']}/page/stage-main`
          : null,
    };
  }

  async listDocuments(refOrProject) {
    const project =
      refOrProject && typeof refOrProject === 'object' && refOrProject.id
        ? refOrProject
        : await this.readProject(refOrProject);
    if (!project.id) {
      throw new SabyError('Не удалось определить числовой id проекта');
    }
    const raw = await this.client.call('Проект.AttachList', {
      Фильтр: ATTACH_FILTER(project.id),
      Сортировка: null,
      Навигация: null,
      ДопПоля: [],
    });
    return decodeDeep(raw)
      .map(mapDocument)
      .filter((document) => document.attachId && !document.hidden);
  }

  async readDocument(ref, documentRef, options = {}) {
    const documents =
      options.documents ?? (await this.listDocuments(ref));
    const query = asText(documentRef).trim().toLowerCase();
    const document = documents.find(
      (item) =>
        String(item.attachId) === query ||
        asText(item.title).toLowerCase() === query ||
        asText(item.fileName).toLowerCase() === query ||
        asText(item.title).toLowerCase().includes(query),
    );
    if (!document) {
      throw new SabyError(
        `Документ "${documentRef}" не найден. Доступны: ` +
          documents.map((item) => item.title).join(', '),
      );
    }
    if (!document.redactionId) {
      throw new SabyError(`У документа "${document.title}" нет актуальной редакции`);
    }
    const raw = await this.client.call('SiteDocument.Read', {
      fileId: document.redactionId,
      method: 'ReadFile',
      object: 'ВнешнийДокумент',
      service: 'online',
    });
    const decoded = decodeDeep(raw);
    const siteInfo = decoded.siteInfo ?? {};
    const pages = Array.isArray(siteInfo.Pages) ? siteInfo.Pages : [];
    const text = normalizeDocText(
      pages.map((page) => frameToText(page.Content)).join('\n\n'),
    );
    const headings = extractHeadings(siteInfo);
    const requirements = extractRequirements(text, headings, {
      source: document.title,
      max: Number(options.maxRequirements ?? 40),
    });
    const maxChars = Number(options.maxChars ?? 20000);
    return {
      document,
      text: text.slice(0, maxChars),
      textLength: text.length,
      truncated: text.length > maxChars,
      headings,
      requirements,
    };
  }

  async readRequirements(ref, options = {}) {
    if (options.document) {
      const result = await this.readDocument(ref, options.document, options);
      return {
        project: options.project ?? (await this.readProject(ref)),
        sources: [result.document],
        requirements: result.requirements,
        notes: result.truncated
          ? [`Текст документа обрезан до ${options.maxChars ?? 20000} символов`]
          : [],
      };
    }

    const project = options.project ?? (await this.readProject(ref));
    const documents =
      options.documents ?? (await this.listDocuments(project));
    const priority = /техническ|тз|требован|логическ.*описан|план тестирован/i;
    const excluded = /мотивацион|план работ|сравнение с конкурент|эксплуатац/i;
    const candidates = documents
      .filter((document) => document.isSabyDoc && !excluded.test(document.title))
      .sort((left, right) => {
        const leftPriority = priority.test(left.title) ? 1 : 0;
        const rightPriority = priority.test(right.title) ? 1 : 0;
        return rightPriority - leftPriority;
      })
      .slice(0, Number(options.maxDocuments ?? 3));

    const requirements = [];
    const sources = [];
    const notes = [];
    for (const document of candidates) {
      try {
        const result = await this.readDocument(ref, document.attachId, {
          ...options,
          documents,
        });
        sources.push(result.document);
        requirements.push(...result.requirements);
      } catch (error) {
        notes.push(`Не удалось прочитать «${document.title}»: ${error.message}`);
      }
    }
    return {
      project,
      sources,
      requirements: requirements.map((requirement, index) => ({
        ...requirement,
        id: `T-${String(index + 1).padStart(3, '0')}`,
      })),
      notes,
    };
  }

  async buildMap(ref, options = {}) {
    const project = await this.readProject(ref);
    const documents = options.includeDocuments === false
      ? []
      : await this.listDocuments(ref);
    const requirementResult = options.includeRequirements === false
      ? { sources: [], requirements: [], notes: [] }
      : await this.readRequirements(ref, {
          ...options,
          project,
          documents,
        });
    const stageNames = project.stages.map((stage) => stage.name);
    const functionalMap = project.stages.map((stage) => {
      const related = requirementResult.requirements.filter(
        (requirement) => pickStage([stage.name], requirement) === stage.name,
      );
      return {
        stage,
        requirementCount: related.length,
        requirements: related.slice(0, Number(options.maxPerStage ?? 12)),
      };
    });
    const unassigned = requirementResult.requirements.filter(
      (requirement) => !pickStage(stageNames, requirement),
    );
    return {
      project,
      stages: project.stages,
      documents: documents.map((document) => ({
        attachId: document.attachId,
        title: document.title,
        fileType: document.isSabyDoc
          ? 'SabyDoc'
          : document.isPdf
            ? 'PDF'
            : document.isLink
              ? 'Ссылка'
              : 'Файл',
        createDate: document.createDate,
        responsible: document.responsible,
      })),
      requirements: requirementResult.requirements,
      requirementSources: requirementResult.sources,
      functionalMap,
      unassignedRequirements: unassigned,
      coverage: {
        stages: project.stages.length,
        documents: documents.length,
        requirements: requirementResult.requirements.length,
        assigned: requirementResult.requirements.length - unassigned.length,
        unassigned: unassigned.length,
      },
      notes: [
        'Карта построена только по чтению проекта. Ничего не изменено.',
        ...requirementResult.notes,
      ],
    };
  }

  async buildCheckDraft(ref, options = {}) {
    const map = await this.buildMap(ref, options);
    const maxRequirements = Number(options.maxRequirements ?? 30);
    const maxPerSection = Number(options.maxPerSection ?? 12);
    const categories = new Set(options.categories ?? ['ui', 'general']);
    const candidates = map.requirements.filter((requirement) =>
      categories.has(requirement.category ?? 'general'),
    );
    const defaultSection = 'Требования проекта';
    const sections = map.stages.map((stage) => ({
      name: stage.name,
      description:
        `Этап проекта: ${stage.startDate ?? '—'} — ${stage.endDate ?? '—'}. ` +
        `Ответственный: ${stage.responsible ?? '—'}.`,
      plannedMinutes: 30,
      points: [],
    }));
    if (sections.length === 0) {
      sections.push({
        name: defaultSection,
        description: `Проект: ${map.project.title}`,
        plannedMinutes: 30,
        points: [],
      });
    }
    const byName = new Map(sections.map((section) => [section.name, section]));
    const used = new Set();
    for (const requirement of candidates.slice(0, maxRequirements)) {
      const stageName =
        pickStage(map.stages.map((stage) => stage.name), requirement) ??
        sections[0].name;
      const section = byName.get(stageName) ?? sections[0];
      if (section.points.length >= maxPerSection) continue;
      const name = `Т: ${requirement.title}`.slice(0, 180);
      const key = name.toLowerCase();
      if (used.has(key)) continue;
      used.add(key);
      section.points.push({
        type: 'Т',
        name,
        comment: `Требование из «${requirement.source}»: ${requirement.title}`.slice(
          0,
          240,
        ),
        description:
          `ИСТОЧНИК:\n${requirement.source} → ${requirement.section}\n\n` +
          `ТРЕБОВАНИЕ:\n${requirement.text}`,
        plannedMinutes: 5,
        status: 'Не тестировался',
        mark: 'pc',
      });
    }
    const totalPoints = sections.reduce(
      (sum, section) => sum + section.points.length,
      0,
    );
    return {
      project: map.project,
      projectUrl: map.project.url,
      suggestedCheckName: `Проверка проекта «${map.project.title}»`,
      sections,
      totalPoints,
      sources: map.requirementSources.map((document) => ({
        attachId: document.attachId,
        title: document.title,
      })),
      warnings: [
        'Черновик проверки построен по извлечённым требованиям; проверьте формулировки и полноту.',
        ...(totalPoints === 0
          ? [
              map.requirements.length > 0
                ? `Найдено требований: ${map.requirements.length}, но ни одно не попало в выбранные категории (${[...categories].join(', ')}).`
                : 'Требования не найдены. Укажите документ через saby_project_document_read.',
            ]
          : []),
      ],
      nextStep:
        'Покажите черновик пользователю. После согласования вызовите saby_check_import_scenario с dryRun=true, затем создайте проверку.',
    };
  }
}
