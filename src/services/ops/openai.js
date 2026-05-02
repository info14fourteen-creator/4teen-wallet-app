const { File: UndiciFile, FormData, fetch } = require('undici');
const { File: BufferFile } = require('buffer');
const env = require('../../config/env');
const { getKnowledgeSearchTool } = require('./knowledgeBase');
const { getRuntimeState, setRuntimeState } = require('./store');

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';
const DIGEST_STATE_KEY = 'ops.ai.digest';
const FileCtor = globalThis.File || UndiciFile || BufferFile;

function normalizeValue(value) {
  return String(value || '').trim();
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch (_) {
    return fallback;
  }
}

function hasOpenAiConfig() {
  return Boolean(normalizeValue(env.OPENAI_API_KEY));
}

function buildOpenAiHeaders(extra = {}) {
  const headers = {
    Authorization: `Bearer ${normalizeValue(env.OPENAI_API_KEY)}`,
    ...extra
  };

  if (normalizeValue(env.OPENAI_ORG_ID)) {
    headers['OpenAI-Organization'] = normalizeValue(env.OPENAI_ORG_ID);
  }

  if (normalizeValue(env.OPENAI_PROJECT_ID)) {
    headers['OpenAI-Project'] = normalizeValue(env.OPENAI_PROJECT_ID);
  }

  return headers;
}

function normalizeTranscriptionFileName(fileName, mimeType) {
  const safeFileName = normalizeValue(fileName) || 'voice-note.ogg';
  const safeMimeType = normalizeValue(mimeType).toLowerCase();

  if (/\.oga$/i.test(safeFileName)) {
    return safeFileName.replace(/\.oga$/i, '.ogg');
  }

  if (!/\.[a-z0-9]+$/i.test(safeFileName) && safeMimeType === 'audio/ogg') {
    return `${safeFileName}.ogg`;
  }

  return safeFileName;
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputs = Array.isArray(payload?.output) ? payload.output : [];

  for (const item of outputs) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const text = normalizeValue(part?.text || part?.output_text);
      if (text) {
        return text;
      }
    }
  }

  return '';
}

async function openAiJson(path, body) {
  if (!hasOpenAiConfig()) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: buildOpenAiHeaders({
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error?.message || `OpenAI request failed with status ${response.status}`);
    error.status = response.status || 500;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function openAiMultipart(path, formData) {
  if (!hasOpenAiConfig()) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${OPENAI_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: buildOpenAiHeaders(),
    body: formData
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(payload?.error?.message || `OpenAI multipart request failed with status ${response.status}`);
    error.status = response.status || 500;
    error.details = payload;
    throw error;
  }

  return payload;
}

function buildDeterministicDigest(context) {
  const events = Array.isArray(context?.events) ? context.events : [];
  const feedback = Array.isArray(context?.feedback) ? context.feedback : [];
  const screeners = Array.isArray(context?.screeners?.items) ? context.screeners.items : [];
  const criticalEvents = events.filter((event) => ['critical', 'error'].includes(normalizeValue(event?.severity).toLowerCase()));
  const warningEvents = events.filter((event) => normalizeValue(event?.severity).toLowerCase() === 'warning');
  const failedScreeners = screeners.filter((item) => normalizeValue(item?.status).toLowerCase() === 'fail');
  const warningScreeners = screeners.filter((item) => normalizeValue(item?.status).toLowerCase() === 'warn');
  const openFeedback = feedback.filter((item) => !item?.resolved_at);

  const groups = [];

  if (criticalEvents.length || failedScreeners.length) {
    groups.push({
      title: 'Критично сейчас',
      severity: 'critical',
      summary: `Есть ${criticalEvents.length + failedScreeners.length} красных сигнала, которые уже могут ломать пользовательский путь.`,
      items: [
        ...criticalEvents.slice(0, 3).map((event) => normalizeValue(event?.title)),
        ...failedScreeners.slice(0, 2).map((item) => normalizeValue(item?.label))
      ].filter(Boolean)
    });
  }

  if (warningEvents.length || warningScreeners.length) {
    groups.push({
      title: 'Под давлением',
      severity: 'attention',
      summary: `Есть ${warningEvents.length + warningScreeners.length} оранжевых сигнала: пока живо, но уже неприятно.`,
      items: [
        ...warningEvents.slice(0, 3).map((event) => normalizeValue(event?.title)),
        ...warningScreeners.slice(0, 2).map((item) => normalizeValue(item?.label))
      ].filter(Boolean)
    });
  }

  if (openFeedback.length) {
    groups.push({
      title: 'Голос пользователя',
      severity: 'product',
      summary: `Открытых отзывов из кошелька: ${openFeedback.length}. Это то, что человек уже почувствовал руками.`,
      items: openFeedback.slice(0, 4).map((event) => normalizeValue(event?.title)).filter(Boolean)
    });
  }

  groups.push({
    title: 'Что стабильно',
    severity: 'good',
    summary: `Зелёных сценариев: ${screeners.filter((item) => normalizeValue(item?.status).toLowerCase() === 'ok').length}.`,
    items: screeners
      .filter((item) => normalizeValue(item?.status).toLowerCase() === 'ok')
      .slice(0, 3)
      .map((item) => normalizeValue(item?.label))
      .filter(Boolean)
  });

  const actions = [];

  if (failedScreeners.length) {
    actions.push('Сначала откройте Скринер и восстановите красные пользовательские сценарии.');
  }

  if (warningScreeners.length) {
    actions.push('Проверьте ресурсы кошельков и провайдерские ключи, пока деградация не стала красной.');
  }

  if (openFeedback.length) {
    actions.push('Посмотрите Feedback и соберите повторяющиеся жалобы в один понятный фикс.');
  }

  if (!actions.length) {
    actions.push('Критики не вижу. Можно держать фокус на продуктовых улучшениях и следующем релизе.');
  }

  return {
    mode: 'fallback',
    overallStatus:
      criticalEvents.length || failedScreeners.length
        ? 'red'
        : warningEvents.length || warningScreeners.length || openFeedback.length
          ? 'yellow'
          : 'green',
    headline:
      criticalEvents.length || failedScreeners.length
        ? 'Есть красные сигналы: лучше начать с восстановления сценариев.'
        : warningEvents.length || warningScreeners.length
          ? 'Приложение живо, но часть путей уже под давлением.'
          : openFeedback.length
            ? 'Техника держится, но есть живые сигналы от пользователей.'
            : 'Система выглядит спокойно: срочных красных проблем не вижу.',
    groups: groups.slice(0, 4),
    actions: actions.slice(0, 4)
  };
}

function buildDigestContext(context) {
  return {
    generatedAt: new Date().toISOString(),
    health: context?.health || {},
    events: Array.isArray(context?.events)
      ? context.events.slice(0, 12).map((event) => ({
          title: normalizeValue(event?.title),
          source: normalizeValue(event?.source),
          severity: normalizeValue(event?.severity),
          message: normalizeValue(event?.message),
          count: Number(event?.count || 0)
        }))
      : [],
    feedback: Array.isArray(context?.feedback)
      ? context.feedback.slice(0, 8).map((event) => ({
          title: normalizeValue(event?.title),
          message: normalizeValue(event?.message),
          type: normalizeValue(event?.type),
          resolvedAt: event?.resolved_at || null
        }))
      : [],
    screeners: {
      summary: context?.screeners?.summary || {},
      items: Array.isArray(context?.screeners?.items)
        ? context.screeners.items.slice(0, 8).map((item) => ({
            label: normalizeValue(item?.label),
            status: normalizeValue(item?.status),
            summary: normalizeValue(item?.summary),
            recommendation: normalizeValue(item?.recommendation)
          }))
        : []
    }
  };
}

function buildQuestionContext(context) {
  const notes = Array.isArray(context?.notes) ? context.notes : [];
  const tasks = Array.isArray(context?.tasks) ? context.tasks : [];

  return {
    generatedAt: new Date().toISOString(),
    health: context?.health || {},
    keyPools: context?.keyPools || {},
    gasState: context?.gasState || null,
    airdropState: context?.airdropState || null,
    ambassadorState: context?.ambassadorState || null,
    events: Array.isArray(context?.events)
      ? context.events.slice(0, 12).map((event) => ({
          title: normalizeValue(event?.title),
          source: normalizeValue(event?.source),
          severity: normalizeValue(event?.severity),
          message: normalizeValue(event?.message),
          count: Number(event?.count || 0)
        }))
      : [],
    feedback: Array.isArray(context?.feedback)
      ? context.feedback.slice(0, 8).map((event) => ({
          title: normalizeValue(event?.title),
          message: normalizeValue(event?.message),
          type: normalizeValue(event?.type),
          resolvedAt: event?.resolved_at || null
        }))
      : [],
    notes: notes.slice(0, 8).map((note) => ({
      title: normalizeValue(note?.title),
      body: normalizeValue(note?.body),
      noteType: normalizeValue(note?.note_type || note?.noteType),
      priority: normalizeValue(note?.priority),
      status: normalizeValue(note?.status),
      targetRelease: normalizeValue(note?.target_release || note?.targetRelease)
    })),
    tasks: tasks.slice(0, 8).map((task) => ({
      id: Number(task?.id || 0),
      title: normalizeValue(task?.title),
      body: normalizeValue(task?.body),
      taskType: normalizeValue(task?.task_type || task?.taskType),
      priority: normalizeValue(task?.priority),
      status: normalizeValue(task?.status),
      source: normalizeValue(task?.source)
    })),
    screeners: {
      summary: context?.screeners?.summary || {},
      items: Array.isArray(context?.screeners?.items)
        ? context.screeners.items.slice(0, 8).map((item) => ({
            label: normalizeValue(item?.label),
            status: normalizeValue(item?.status),
            summary: normalizeValue(item?.summary),
            recommendation: normalizeValue(item?.recommendation)
          }))
        : []
    }
  };
}

function buildRouterFallback(message) {
  const safe = normalizeValue(message);
  const lower = safe.toLowerCase();

  if (
    /\b(смени|сменить|переключ|отвечай|ответь|respond|reply|clear|очист|почист|удали|архив|закрой|возьми|верни|запуш|задепл|перезапус|перегруз|выполни|запусти|проверь|перепроверь|глянь|посмотри|check|recheck|look)\b/.test(
      lower
    )
  ) {
    return {
      mode: 'fallback',
      intent: 'question',
      title: null,
      noteType: null,
      priority: null,
      severity: null,
      answerText: null,
      eventMessage: null,
      fallbackReason: 'Heuristic: control-like founder message'
    };
  }

  if (/(^\s*(что|почему|как|где|когда|кто)\b|\b(что|почему|как|где|когда|кто)\b.*\b(дела|статус|происходит|нового|у нас)\b|[?？]$)/.test(lower)) {
    return {
      mode: 'fallback',
      intent: 'question',
      title: null,
      noteType: null,
      priority: null,
      severity: null,
      answerText: null,
      eventMessage: null,
      fallbackReason: 'Heuristic: question-like message'
    };
  }

  if (/верси|релиз|release|надо|нужно|сделать|добавить|улучш|исправ|передел|roadmap|backlog/.test(lower)) {
    return {
      mode: 'fallback',
      intent: 'product_note',
      title: safe.slice(0, 100) || 'Product note',
      noteType: 'change',
      priority: 'normal',
      severity: null,
      answerText: 'Сохраняю это как заметку для следующей версии.',
      eventMessage: null,
      fallbackReason: 'Heuristic: product-note-like message'
    };
  }

  if (/ошиб|error|сломал|сломалось|упало|падает|critical|критич|не работает|не грузит|down/.test(lower)) {
    return {
      mode: 'fallback',
      intent: 'incident_report',
      title: safe.slice(0, 100) || 'Owner incident report',
      noteType: null,
      priority: 'high',
      severity: 'warning',
      answerText: 'Вижу это как сигнал о проблеме. Зафиксирую событие и сразу дам короткий разбор.',
      eventMessage: safe,
      fallbackReason: 'Heuristic: incident-like message'
    };
  }

  return {
    mode: 'fallback',
    intent: 'question',
    title: null,
    noteType: null,
    priority: null,
    severity: null,
    answerText: null,
    eventMessage: null,
    fallbackReason: 'Heuristic defaulted to question'
  };
}

function wantsReleasePlan(question) {
  const safe = normalizeValue(question).toLowerCase();
  return /верси|релиз|release|next|план|roadmap|backlog/.test(safe);
}

function wantsFeedback(question) {
  const safe = normalizeValue(question).toLowerCase();
  return /feedback|отзыв|пользоват|confusing|тормоз|похвал|иде/.test(safe);
}

function wantsKeys(question) {
  const safe = normalizeValue(question).toLowerCase();
  return /ключ|key|trongrid|tronscan|cmc|лимит/.test(safe);
}

function formatPoolSnapshot(name, snapshot) {
  const total = Number(snapshot?.total || 0);
  const available = Number(snapshot?.available || 0);
  const coolingDown = Number(snapshot?.coolingDown || 0);
  return `${name}: ${available}/${total} готовы, cooldown ${coolingDown}`;
}

function buildFallbackQuestionAnswer(question, context) {
  const digest = buildDeterministicDigest(context);
  const lines = [];
  const notes = Array.isArray(context?.notes) ? context.notes : [];
  const tasks = Array.isArray(context?.tasks) ? context.tasks : [];
  const feedback = Array.isArray(context?.feedback) ? context.feedback : [];

  lines.push(`Коротко: ${normalizeValue(digest.headline) || 'Пока без вывода.'}`);

  if (wantsReleasePlan(question)) {
    if (tasks.length) {
      lines.push('По рабочим задачам следующей версии я вижу такие приоритеты:');
      tasks.slice(0, 4).forEach((task, index) => {
        lines.push(`${index + 1}. #${Number(task?.id || 0)} ${normalizeValue(task?.title) || 'Без названия'}`);
      });
    } else if (notes.length) {
      lines.push('По следующей версии я вижу такие приоритеты:');
      notes.slice(0, 4).forEach((note, index) => {
        lines.push(`${index + 1}. ${normalizeValue(note?.title) || 'Без названия'}`);
      });
    } else {
      lines.push('В backlog следующей версии пока нет открытых заметок.');
    }
  } else if (wantsFeedback(question)) {
    if (feedback.length) {
      lines.push(`Открытых пользовательских сигналов: ${feedback.filter((item) => !item?.resolved_at).length}.`);
      feedback.slice(0, 3).forEach((item) => {
        lines.push(`• ${normalizeValue(item?.title) || 'Отзыв'}: ${normalizeValue(item?.message)}`);
      });
    } else {
      lines.push('Прямо сейчас свежих пользовательских feedback-сигналов не вижу.');
    }
  } else if (wantsKeys(question)) {
    lines.push('По ключам сейчас вижу так:');
    lines.push(`• ${formatPoolSnapshot('Trongrid', context?.keyPools?.trongrid)}`);
    lines.push(`• ${formatPoolSnapshot('Tronscan', context?.keyPools?.tronscan)}`);
    lines.push(`• ${formatPoolSnapshot('CMC', context?.keyPools?.cmc)}`);
  } else {
    const groups = Array.isArray(digest.groups) ? digest.groups : [];
    groups.slice(0, 3).forEach((group) => {
      lines.push(`${normalizeValue(group?.title)}: ${normalizeValue(group?.summary)}`);
    });
  }

  if (Array.isArray(digest.actions) && digest.actions.length) {
    lines.push('');
    lines.push('Что делать дальше:');
    digest.actions.slice(0, 3).forEach((item, index) => {
      lines.push(`${index + 1}. ${normalizeValue(item)}`);
    });
  }

  return lines.join('\n');
}

async function routeOwnerMessage(message, context) {
  const safeMessage = normalizeValue(message);
  const fallback = buildRouterFallback(safeMessage);

  if (!hasOpenAiConfig()) {
    return fallback;
  }

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['intent', 'title', 'noteType', 'priority', 'severity', 'answerText', 'eventMessage'],
    properties: {
      intent: {
        type: 'string',
        enum: ['question', 'product_note', 'incident_report']
      },
      title: {
        anyOf: [{ type: 'string' }, { type: 'null' }]
      },
      noteType: {
        anyOf: [
          {
            type: 'string',
            enum: ['change', 'bug', 'ux', 'feature', 'content', 'infra', 'voice_memo']
          },
          { type: 'null' }
        ]
      },
      priority: {
        anyOf: [
          {
            type: 'string',
            enum: ['low', 'normal', 'high', 'critical']
          },
          { type: 'null' }
        ]
      },
      severity: {
        anyOf: [
          {
            type: 'string',
            enum: ['info', 'warning', 'error', 'critical']
          },
          { type: 'null' }
        ]
      },
      answerText: {
        anyOf: [{ type: 'string' }, { type: 'null' }]
      },
      eventMessage: {
        anyOf: [{ type: 'string' }, { type: 'null' }]
      }
    }
  };

  try {
    const payload = await openAiJson('/responses', {
      model: normalizeValue(env.OPENAI_OPS_MODEL) || 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You are routing private founder messages for a crypto wallet ops assistant. Classify each message into one intent only: question, product_note, or incident_report. Be conservative with incident_report: use it only when the founder is clearly flagging a live outage, broken production behavior, or a current operational incident that should become an ops event right now. Prefer question for ordinary chat, commands, status checks, requests to investigate, requests to check or re-check something, or vague complaints. Prefer product_note only when the founder is clearly asking to change a future release, UX, content, or backlog item. product_note means save into backlog for the next release. incident_report means create/update an ops event because the founder is flagging a live problem. question means answer from the live data. Return concise Russian answerText only when it helps the UX.'
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                message: safeMessage,
                context: buildQuestionContext(context)
              })
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'owner_message_router',
          schema,
          strict: true
        }
      },
      max_output_tokens: 500
    });

    const text = extractResponseText(payload);
    const parsed = parseJson(text, null);

    if (!parsed || !parsed.intent) {
      throw new Error('Owner message router returned empty payload');
    }

    const result = {
      mode: 'openai',
      intent: normalizeValue(parsed.intent) || fallback.intent,
      title: normalizeValue(parsed.title) || null,
      noteType: normalizeValue(parsed.noteType) || null,
      priority: normalizeValue(parsed.priority) || null,
      severity: normalizeValue(parsed.severity) || null,
      answerText: normalizeValue(parsed.answerText) || null,
      eventMessage: normalizeValue(parsed.eventMessage) || null
    };

    if (
      fallback.intent === 'question' &&
      result.intent === 'incident_report' &&
      /control-like founder message|question-like message/.test(normalizeValue(fallback.fallbackReason))
    ) {
      return {
        ...result,
        mode: 'openai_guarded',
        intent: 'question',
        title: null,
        severity: null,
        eventMessage: null
      };
    }

    return result;
  } catch (error) {
    return {
      ...fallback,
      fallbackReason: normalizeValue(error?.message) || fallback.fallbackReason || 'Owner message routing failed'
    };
  }
}

async function getCachedDigest(maxAgeMs) {
  const state = await getRuntimeState(DIGEST_STATE_KEY).catch(() => null);
  const payload = parseJson(state?.value_json, null);

  if (!payload?.generatedAt) {
    return null;
  }

  const age = Date.now() - new Date(payload.generatedAt).getTime();

  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) {
    return null;
  }

  return payload;
}

async function generateOpsDigest(context, options = {}) {
  const maxAgeMs = Math.max(30_000, Number(options?.maxAgeMs || 180_000));

  if (!options?.force) {
    const cached = await getCachedDigest(maxAgeMs);
    if (cached) {
      return cached;
    }
  }

  const fallback = buildDeterministicDigest(context);

  if (!hasOpenAiConfig()) {
    const payload = {
      ...fallback,
      generatedAt: new Date().toISOString(),
      model: 'fallback',
      fallbackReason: 'OPENAI_API_KEY is not configured'
    };
    await setRuntimeState(DIGEST_STATE_KEY, payload).catch(() => null);
    return payload;
  }

  const promptContext = buildDigestContext(context);
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['overallStatus', 'headline', 'groups', 'actions'],
    properties: {
      overallStatus: {
        type: 'string',
        enum: ['green', 'yellow', 'orange', 'red']
      },
      headline: {
        type: 'string'
      },
      groups: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'severity', 'summary', 'items'],
          properties: {
            title: { type: 'string' },
            severity: {
              type: 'string',
              enum: ['critical', 'attention', 'product', 'good']
            },
            summary: { type: 'string' },
            items: {
              type: 'array',
              maxItems: 4,
              items: { type: 'string' }
            }
          }
        }
      },
      actions: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: { type: 'string' }
      }
    }
  };

  try {
    const payload = await openAiJson('/responses', {
      model: normalizeValue(env.OPENAI_OPS_MODEL) || 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You summarize operational health for a single wallet app owner. Use only the provided facts. Keep it concise, plain Russian, and group the situation into 3-4 buckets max: critical, attention, product, good. Do not invent incidents. Mention only what is actionable.'
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(promptContext)
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'ops_digest',
          schema,
          strict: true
        }
      },
      max_output_tokens: 900
    });

    const text = extractResponseText(payload);
    const parsed = parseJson(text, null);

    if (!parsed || !Array.isArray(parsed.groups) || !Array.isArray(parsed.actions)) {
      throw new Error('OpenAI digest response was empty or malformed');
    }

    const result = {
      mode: 'openai',
      model: normalizeValue(payload?.model) || normalizeValue(env.OPENAI_OPS_MODEL) || 'gpt-4o-mini',
      generatedAt: new Date().toISOString(),
      overallStatus: parsed.overallStatus,
      headline: normalizeValue(parsed.headline),
      groups: parsed.groups.map((group) => ({
        title: normalizeValue(group?.title),
        severity: normalizeValue(group?.severity),
        summary: normalizeValue(group?.summary),
        items: Array.isArray(group?.items)
          ? group.items.map((item) => normalizeValue(item)).filter(Boolean).slice(0, 4)
          : []
      })),
      actions: parsed.actions.map((item) => normalizeValue(item)).filter(Boolean).slice(0, 4)
    };

    await setRuntimeState(DIGEST_STATE_KEY, result).catch(() => null);
    return result;
  } catch (error) {
    const payload = {
      ...fallback,
      generatedAt: new Date().toISOString(),
      model: 'fallback',
      fallbackReason: normalizeValue(error?.message) || 'OpenAI digest failed'
    };
    await setRuntimeState(DIGEST_STATE_KEY, payload).catch(() => null);
    return payload;
  }
}

function buildFallbackStructuredNote(rawText) {
  const compact = normalizeValue(rawText).replace(/\s+/g, ' ');
  const title = compact.slice(0, 90) || 'Telegram note';

  return {
    mode: 'fallback',
    title,
    noteType: 'change',
    priority: 'normal',
    body: compact || 'No details provided',
    targetRelease: null
  };
}

async function structureProductNote(rawText) {
  const fallback = buildFallbackStructuredNote(rawText);

  if (!hasOpenAiConfig()) {
    return {
      ...fallback,
      fallbackReason: 'OPENAI_API_KEY is not configured'
    };
  }

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'noteType', 'priority', 'body', 'targetRelease'],
    properties: {
      title: { type: 'string' },
      noteType: {
        type: 'string',
        enum: ['change', 'bug', 'ux', 'feature', 'content', 'infra', 'voice_memo']
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'critical']
      },
      body: { type: 'string' },
      targetRelease: {
        anyOf: [{ type: 'string' }, { type: 'null' }]
      }
    }
  };

  try {
    const payload = await openAiJson('/responses', {
      model: normalizeValue(env.OPENAI_OPS_MODEL) || 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'Turn raw founder notes into a clean product backlog item in concise English or Russian, preserving the original meaning. Use a short title, choose the closest note type, keep priority realistic, and keep body actionable.'
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: normalizeValue(rawText)
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'product_note',
          schema,
          strict: true
        }
      },
      max_output_tokens: 500
    });

    const text = extractResponseText(payload);
    const parsed = parseJson(text, null);

    if (!parsed) {
      throw new Error('Structured note response was empty');
    }

    return {
      mode: 'openai',
      title: normalizeValue(parsed.title) || fallback.title,
      noteType: normalizeValue(parsed.noteType) || fallback.noteType,
      priority: normalizeValue(parsed.priority) || fallback.priority,
      body: normalizeValue(parsed.body) || fallback.body,
      targetRelease: normalizeValue(parsed.targetRelease) || null
    };
  } catch (error) {
    return {
      ...fallback,
      fallbackReason: normalizeValue(error?.message) || 'OpenAI note structuring failed'
    };
  }
}

async function answerOpsQuestion(question, context) {
  const safeQuestion = normalizeValue(question);
  const fallback = {
    mode: 'fallback',
    model: 'fallback',
    answeredAt: new Date().toISOString(),
    answer: buildFallbackQuestionAnswer(safeQuestion, context),
    fallbackReason: 'OPENAI_API_KEY is not configured'
  };

  if (!hasOpenAiConfig()) {
    return fallback;
  }

  try {
    const knowledgeTool = await getKnowledgeSearchTool({
      maxNumResults: 4
    }).catch(() => null);
    const requestBody = {
      model: normalizeValue(env.OPENAI_OPS_MODEL) || 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You are a private ops copilot for the owner of a crypto wallet app. Answer in concise plain Russian. Use live operational facts as the source of truth for current health, incidents, balances, queues, and provider pressure. If project docs, release notes, backlog context, app screens, or repo structure are relevant, use file_search against the attached knowledge base. Be practical, direct, and prioritize what matters now. If the user asks about the next release, combine notes context with any relevant knowledge-base context. If the data is insufficient, say so clearly instead of inventing.'
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                question: safeQuestion,
                context: buildQuestionContext(context)
              })
            }
          ]
        }
      ],
      max_output_tokens: 900
    };

    if (knowledgeTool) {
      requestBody.tools = [knowledgeTool];
      requestBody.include = ['file_search_call.results'];
    }

    const payload = await openAiJson('/responses', requestBody);

    const answer = extractResponseText(payload);

    if (!answer) {
      throw new Error('OpenAI question answer was empty');
    }

    return {
      mode: 'openai',
      model: normalizeValue(payload?.model) || normalizeValue(env.OPENAI_OPS_MODEL) || 'gpt-4o-mini',
      answeredAt: new Date().toISOString(),
      answer
    };
  } catch (error) {
    return {
      mode: 'fallback',
      model: 'fallback',
      answeredAt: new Date().toISOString(),
      answer: buildFallbackQuestionAnswer(safeQuestion, context),
      fallbackReason: normalizeValue(error?.message) || 'OpenAI question answering failed'
    };
  }
}

async function transcribeAudioBuffer(buffer, options = {}) {
  const mimeType = normalizeValue(options?.mimeType) || 'audio/ogg';
  const fileName = normalizeTranscriptionFileName(options?.fileName, mimeType);
  const formData = new FormData();

  formData.set('model', normalizeValue(env.OPENAI_TRANSCRIBE_MODEL) || 'gpt-4o-mini-transcribe');
  formData.set('file', new FileCtor([buffer], fileName, { type: mimeType }));
  formData.set('response_format', 'json');

  if (normalizeValue(options?.prompt)) {
    formData.set('prompt', normalizeValue(options.prompt).slice(0, 400));
  }

  const payload = await openAiMultipart('/audio/transcriptions', formData);
  const text = normalizeValue(payload?.text);

  if (!text) {
    const error = new Error('OpenAI transcription returned empty text');
    error.status = 502;
    throw error;
  }

  return {
    text,
    model: normalizeValue(payload?.model) || normalizeValue(env.OPENAI_TRANSCRIBE_MODEL) || 'gpt-4o-mini-transcribe'
  };
}

module.exports = {
  answerOpsQuestion,
  routeOwnerMessage,
  generateOpsDigest,
  hasOpenAiConfig,
  structureProductNote,
  transcribeAudioBuffer
};
