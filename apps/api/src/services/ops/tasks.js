const { pool } = require('../../db/pool');
const { ensureOpsTables } = require('./store');

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function normalizeTaskType(value) {
  const safe = normalizeValue(value).toLowerCase();
  if (['bug', 'ux', 'infra', 'feature', 'content', 'ops', 'task'].includes(safe)) {
    return safe;
  }

  return 'task';
}

function normalizeTaskStatus(value) {
  const safe = normalizeValue(value).toLowerCase();
  if (['new', 'triaged', 'ready_for_codex', 'in_progress', 'blocked', 'done', 'archived'].includes(safe)) {
    return safe;
  }

  return 'new';
}

function normalizePriority(value) {
  const safe = normalizeValue(value).toLowerCase();
  if (['low', 'normal', 'high', 'critical'].includes(safe)) {
    return safe;
  }

  return 'normal';
}

function mapNoteTypeToTaskType(noteType) {
  const safe = normalizeValue(noteType).toLowerCase();
  if (safe === 'bug') return 'bug';
  if (safe === 'ux') return 'ux';
  if (safe === 'infra') return 'infra';
  if (safe === 'feature') return 'feature';
  if (safe === 'content') return 'content';
  return 'task';
}

function mapEventSeverityToPriority(severity) {
  const safe = normalizeValue(severity).toLowerCase();
  if (safe === 'critical') return 'critical';
  if (safe === 'error') return 'high';
  if (safe === 'warning') return 'high';
  return 'normal';
}

async function findTaskByDedupeKey(dedupeKey) {
  await ensureOpsTables();
  const safeDedupeKey = normalizeValue(dedupeKey);

  if (!safeDedupeKey) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM ops_tasks
      WHERE dedupe_key = $1
      LIMIT 1
    `,
    [safeDedupeKey]
  );

  return result.rows[0] || null;
}

async function createTask(input) {
  await ensureOpsTables();

  const dedupeKey = normalizeValue(input?.dedupeKey) || null;
  if (dedupeKey) {
    const existing = await findTaskByDedupeKey(dedupeKey);
    if (existing) {
      return {
        task: existing,
        created: false
      };
    }
  }

  const result = await pool.query(
    `
      INSERT INTO ops_tasks (
        source,
        task_type,
        status,
        priority,
        title,
        body,
        dedupe_key,
        created_by_chat_id,
        note_id,
        event_id,
        details_json,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
      RETURNING *
    `,
    [
      normalizeValue(input?.source) || 'manual',
      normalizeTaskType(input?.taskType),
      normalizeTaskStatus(input?.status),
      normalizePriority(input?.priority),
      normalizeValue(input?.title) || 'Untitled task',
      normalizeValue(input?.body) || 'No details provided',
      dedupeKey,
      normalizeValue(input?.createdByChatId) || null,
      input?.noteId || null,
      input?.eventId || null,
      normalizeJson(input?.details)
    ]
  );

  return {
    task: result.rows[0] || null,
    created: true
  };
}

async function getTaskById(taskId) {
  await ensureOpsTables();
  const parsedId = Number(taskId || 0);

  if (!Number.isFinite(parsedId) || parsedId <= 0) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM ops_tasks
      WHERE id = $1
      LIMIT 1
    `,
    [parsedId]
  );

  return result.rows[0] || null;
}

async function listTasks(limit = 10, options = {}) {
  await ensureOpsTables();

  const safeLimit = Math.max(1, Math.min(Number(limit || 10) || 10, 100));
  const status = normalizeValue(options?.status).toLowerCase();
  const includeDone = options?.includeDone === true;
  const clauses = [];
  const params = [];

  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  } else if (!includeDone) {
    clauses.push(`status NOT IN ('done', 'archived')`);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(safeLimit);

  const result = await pool.query(
    `
      SELECT *
      FROM ops_tasks
      ${whereClause}
      ORDER BY updated_at DESC, id DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows;
}

async function updateTaskStatus(taskId, status, options = {}) {
  await ensureOpsTables();

  const parsedId = Number(taskId || 0);
  if (!Number.isFinite(parsedId) || parsedId <= 0) {
    throw new Error('taskId must be a positive number');
  }

  const normalizedStatus = normalizeTaskStatus(status);
  const detailsJson = normalizeJson(options?.details);
  const message = normalizeValue(options?.body);

  const result = await pool.query(
    `
      UPDATE ops_tasks
      SET status = $2,
          body = COALESCE(NULLIF($3, ''), body),
          details_json = COALESCE($4::jsonb, details_json),
          started_at = CASE
            WHEN $2 = 'in_progress' AND started_at IS NULL THEN NOW()
            ELSE started_at
          END,
          blocked_at = CASE
            WHEN $2 = 'blocked' THEN NOW()
            WHEN $2 <> 'blocked' THEN NULL
            ELSE blocked_at
          END,
          done_at = CASE
            WHEN $2 = 'done' THEN NOW()
            WHEN $2 <> 'done' THEN NULL
            ELSE done_at
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [parsedId, normalizedStatus, message, detailsJson]
  );

  return result.rows[0] || null;
}

async function createTaskFromProductNote(note, options = {}) {
  const noteId = Number(note?.id || 0);

  if (!Number.isFinite(noteId) || noteId <= 0) {
    throw new Error('Product note must have a valid id');
  }

  return createTask({
    source: normalizeValue(options?.source) || 'product_note',
    taskType: mapNoteTypeToTaskType(note?.note_type || note?.noteType),
    status: normalizeValue(options?.status) || 'ready_for_codex',
    priority: normalizeValue(options?.priority) || normalizePriority(note?.priority),
    title: normalizeValue(note?.title) || 'Untitled task',
    body: normalizeValue(note?.body) || 'No details provided',
    dedupeKey: normalizeValue(options?.dedupeKey) || `note:${noteId}`,
    createdByChatId: normalizeValue(options?.createdByChatId) || normalizeValue(note?.created_by_chat_id),
    noteId,
    details: {
      noteId,
      noteType: normalizeValue(note?.note_type || note?.noteType),
      source: normalizeValue(note?.source),
      targetRelease: normalizeValue(note?.target_release || note?.targetRelease) || null
    }
  });
}

async function createTaskFromOpsEvent(event, options = {}) {
  const eventId = Number(event?.id || 0);
  const fingerprint = normalizeValue(event?.fingerprint);

  return createTask({
    source: normalizeValue(options?.source) || 'ops_event',
    taskType: normalizeValue(options?.taskType) || 'ops',
    status: normalizeValue(options?.status) || 'new',
    priority: normalizeValue(options?.priority) || mapEventSeverityToPriority(event?.severity),
    title: normalizeValue(options?.title) || normalizeValue(event?.title) || 'Ops task',
    body: normalizeValue(options?.body) || normalizeValue(event?.message) || 'No details provided',
    dedupeKey: normalizeValue(options?.dedupeKey) || (fingerprint ? `event:${fingerprint}` : null),
    createdByChatId: normalizeValue(options?.createdByChatId) || null,
    eventId: eventId > 0 ? eventId : null,
    details: {
      eventId: eventId > 0 ? eventId : null,
      source: normalizeValue(event?.source),
      category: normalizeValue(event?.category),
      type: normalizeValue(event?.type),
      severity: normalizeValue(event?.severity)
    }
  });
}

function buildTasksMarkdown(tasks) {
  const lines = [
    '# Ops Tasks',
    '',
    '> Generated from `ops_tasks`.',
    ''
  ];

  if (!Array.isArray(tasks) || tasks.length === 0) {
    lines.push('No tasks right now.');
    lines.push('');
    return lines.join('\n');
  }

  for (const task of tasks) {
    lines.push(`## #${task.id} ${normalizeValue(task.title) || 'Untitled task'}`);
    lines.push(`- type: ${normalizeTaskType(task.task_type)}`);
    lines.push(`- priority: ${normalizePriority(task.priority)}`);
    lines.push(`- status: ${normalizeTaskStatus(task.status)}`);
    lines.push(`- source: ${normalizeValue(task.source) || 'manual'}`);
    lines.push('');
    lines.push(normalizeValue(task.body) || 'No details provided.');
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = {
  buildTasksMarkdown,
  createTask,
  createTaskFromOpsEvent,
  createTaskFromProductNote,
  getTaskById,
  listTasks,
  updateTaskStatus
};
