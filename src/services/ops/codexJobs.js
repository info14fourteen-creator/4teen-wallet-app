const { fetch } = require('undici');
const env = require('../../config/env');
const { pool } = require('../../db/pool');
const { getKnowledgeBaseStatus } = require('./knowledgeBase');
const { ensureOpsTables } = require('./store');
const { getTaskById, updateTaskStatus } = require('./tasks');

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function hasCodexConfig() {
  return Boolean(normalizeValue(env.OPENAI_API_KEY));
}

function getCodexModel() {
  return normalizeValue(env.OPENAI_CODEX_MODEL) || 'gpt-5-codex';
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

async function openAiJson(path, body) {
  if (!hasCodexConfig()) {
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

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch (_) {
    return fallback;
  }
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

async function createCodexJob(taskId, options = {}) {
  await ensureOpsTables();

  const result = await pool.query(
    `
      INSERT INTO ops_codex_jobs (
        task_id,
        status,
        model,
        source,
        prompt_json,
        created_by_chat_id,
        created_at,
        updated_at
      )
      VALUES ($1,'queued',$2,$3,$4,$5,NOW(),NOW())
      RETURNING *
    `,
    [
      Number(taskId || 0),
      getCodexModel(),
      normalizeValue(options?.source) || 'manual',
      normalizeJson(options?.prompt || null),
      normalizeValue(options?.createdByChatId) || null
    ]
  );

  return result.rows[0] || null;
}

async function updateCodexJob(jobId, patch) {
  await ensureOpsTables();

  const result = await pool.query(
    `
      UPDATE ops_codex_jobs
      SET status = COALESCE(NULLIF($2, ''), status),
          response_text = COALESCE($3, response_text),
          response_json = COALESCE($4::jsonb, response_json),
          error_message = COALESCE(NULLIF($5, ''), error_message),
          started_at = COALESCE($6, started_at),
          finished_at = COALESCE($7, finished_at),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      Number(jobId || 0),
      normalizeValue(patch?.status) || null,
      patch?.responseText == null ? null : String(patch.responseText),
      normalizeJson(patch?.responseJson),
      normalizeValue(patch?.errorMessage) || null,
      patch?.startedAt || null,
      patch?.finishedAt || null
    ]
  );

  return result.rows[0] || null;
}

async function getCodexJobById(jobId) {
  await ensureOpsTables();

  const result = await pool.query(
    `
      SELECT *
      FROM ops_codex_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [Number(jobId || 0)]
  );

  return result.rows[0] || null;
}

async function listCodexJobs(limit = 10, options = {}) {
  await ensureOpsTables();

  const safeLimit = Math.max(1, Math.min(Number(limit || 10) || 10, 100));
  const taskId = Number(options?.taskId || 0);
  const params = [];
  const clauses = [];

  if (Number.isFinite(taskId) && taskId > 0) {
    params.push(taskId);
    clauses.push(`task_id = $${params.length}`);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(safeLimit);

  const result = await pool.query(
    `
      SELECT *
      FROM ops_codex_jobs
      ${whereClause}
      ORDER BY updated_at DESC, id DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows;
}

function buildTaskPrompt(task) {
  return {
    task: {
      id: Number(task?.id || 0),
      source: normalizeValue(task?.source),
      type: normalizeValue(task?.task_type || task?.taskType),
      status: normalizeValue(task?.status),
      priority: normalizeValue(task?.priority),
      title: normalizeValue(task?.title),
      body: normalizeValue(task?.body)
    },
    rules: [
      'Use only repository-grounded evidence from the provided task payload and repo evidence snippets.',
      'If you cannot identify concrete repository anchors, mark the task as blocked.',
      'Do not invent files, modules, APIs, tests, or implementation details.',
      'Prefer short, explicit implementation steps over generic advice.',
      'Assume the task is for the current 4TEEN wallet repository.'
    ]
  };
}

async function searchKnowledgeBase(query, options = {}) {
  const status = await getKnowledgeBaseStatus().catch(() => null);
  const vectorStoreId = normalizeValue(status?.vectorStoreId);

  if (!vectorStoreId) {
    return [];
  }

  const payload = await openAiJson(`/vector_stores/${encodeURIComponent(vectorStoreId)}/search`, {
    query: normalizeValue(query),
    max_num_results: Math.max(1, Math.min(Number(options?.maxNumResults || 4), 8))
  }).catch(() => null);

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((row) => {
    const contentParts = Array.isArray(row?.content) ? row.content : [];
    const text = contentParts
      .map((part) => normalizeValue(part?.text))
      .filter(Boolean)
      .join('\n\n');

    return {
      fileId: normalizeValue(row?.file_id),
      filename: normalizeValue(row?.filename),
      score: Number(row?.score || 0),
      text
    };
  }).filter((row) => row.text);
}

function buildRepoEvidenceText(results) {
  const safeResults = Array.isArray(results) ? results : [];
  if (!safeResults.length) {
    return 'No repo evidence was found in the knowledge base search.';
  }

  return safeResults.slice(0, 4).map((item, index) => {
    const snippet = normalizeValue(item?.text).slice(0, 2800);
    return [
      `Evidence #${index + 1}`,
      `filename: ${normalizeValue(item?.filename) || 'unknown'}`,
      `score: ${Number(item?.score || 0).toFixed(3)}`,
      '',
      snippet
    ].join('\n');
  }).join('\n\n---\n\n');
}

async function runCodexJobForTask(taskId, options = {}) {
  const task = await getTaskById(taskId);
  if (!task) {
    const error = new Error('Task not found');
    error.status = 404;
    throw error;
  }

  if (!hasCodexConfig()) {
    const error = new Error('OPENAI_API_KEY is not configured');
    error.status = 503;
    throw error;
  }

  const prompt = buildTaskPrompt(task);
  const job = await createCodexJob(task.id, {
    source: normalizeValue(options?.source) || 'telegram',
    createdByChatId: options?.createdByChatId,
    prompt
  });

  await updateTaskStatus(task.id, 'in_progress', {
    details: {
      codexJobId: job.id,
      codexModel: getCodexModel()
    }
  }).catch(() => null);

  await updateCodexJob(job.id, {
    status: 'running',
    startedAt: new Date().toISOString()
  });

  try {
    const knowledgeResults = await searchKnowledgeBase(
      [task?.title, task?.body].map((item) => normalizeValue(item)).filter(Boolean).join('\n'),
      { maxNumResults: 6 }
    );
    const repoEvidence = buildRepoEvidenceText(knowledgeResults);

    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['outcome', 'summary', 'repoFindings', 'implementationSteps', 'proposedFiles', 'tests', 'blockerReason'],
      properties: {
        outcome: {
          type: 'string',
          enum: ['done', 'blocked']
        },
        summary: {
          type: 'string'
        },
        repoFindings: {
          type: 'array',
          maxItems: 8,
          items: { type: 'string' }
        },
        implementationSteps: {
          type: 'array',
          maxItems: 8,
          items: { type: 'string' }
        },
        proposedFiles: {
          type: 'array',
          maxItems: 12,
          items: { type: 'string' }
        },
        tests: {
          type: 'array',
          maxItems: 8,
          items: { type: 'string' }
        },
        blockerReason: {
          anyOf: [{ type: 'string' }, { type: 'null' }]
        }
      }
    };

    const requestBody = {
      model: getCodexModel(),
      reasoning: {
        effort: normalizeValue(env.OPENAI_CODEX_REASONING_EFFORT) || 'medium'
      },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You are a repository-grounded coding operator for the 4TEEN wallet project. Your job is to prepare a task for real implementation without inventing anything. Use only the provided repo evidence snippets as repository evidence. If the evidence is not concrete enough, block the task instead of guessing. If the evidence is concrete enough, produce a concise implementation brief that references only likely-real files/modules/routes already present in the repo context.'
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(prompt)
            },
            {
              type: 'input_text',
              text: `Repository evidence:\n\n${repoEvidence}`
            }
          ]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'codex_task_result',
          schema,
          strict: true
        }
      },
      max_output_tokens: 1600
    };

    const payload = await openAiJson('/responses', requestBody);
    const rawText = extractResponseText(payload);
    const parsed = parseJson(rawText, null);

    if (!parsed || !parsed.outcome) {
      throw new Error('Codex job returned empty payload');
    }

    const finishedAt = new Date().toISOString();
    const updatedJob = await updateCodexJob(job.id, {
      status: parsed.outcome === 'done' ? 'done' : 'blocked',
      responseText: rawText,
      responseJson: parsed,
      finishedAt
    });

    const taskStatus = parsed.outcome === 'done' ? 'done' : 'blocked';
    const noteBody = [
      normalizeValue(parsed.summary),
      '',
      parsed.blockerReason ? `Blocker: ${normalizeValue(parsed.blockerReason)}` : '',
      Array.isArray(parsed.implementationSteps) && parsed.implementationSteps.length
        ? `Plan:\n${parsed.implementationSteps.map((step, index) => `${index + 1}. ${normalizeValue(step)}`).join('\n')}`
        : '',
      Array.isArray(parsed.proposedFiles) && parsed.proposedFiles.length
        ? `Files:\n${parsed.proposedFiles.map((item) => `- ${normalizeValue(item)}`).join('\n')}`
        : '',
      Array.isArray(parsed.tests) && parsed.tests.length
        ? `Tests:\n${parsed.tests.map((item) => `- ${normalizeValue(item)}`).join('\n')}`
        : ''
    ].filter(Boolean).join('\n');

    const updatedTask = await updateTaskStatus(task.id, taskStatus, {
      body: noteBody,
      details: {
        codexJobId: updatedJob?.id || job.id,
        codexOutcome: parsed.outcome,
        codexModel: getCodexModel(),
        implementationSteps: parsed.implementationSteps || [],
        proposedFiles: parsed.proposedFiles || [],
        repoFindings: parsed.repoFindings || [],
        tests: parsed.tests || [],
        repoEvidenceFiles: knowledgeResults.map((item) => item.filename).filter(Boolean)
      }
    });

    return {
      job: updatedJob || job,
      task: updatedTask || task,
      result: parsed
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const failedJob = await updateCodexJob(job.id, {
      status: 'failed',
      errorMessage: error.message,
      finishedAt
    }).catch(() => null);

    await updateTaskStatus(task.id, 'blocked', {
      body: `Codex job failed: ${normalizeValue(error.message) || 'unknown error'}`,
      details: {
        codexJobId: failedJob?.id || job.id,
        codexFailed: true
      }
    }).catch(() => null);

    throw error;
  }
}

module.exports = {
  getCodexJobById,
  listCodexJobs,
  runCodexJobForTask
};
