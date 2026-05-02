const crypto = require('crypto');
const env = require('../../config/env');
const { pool } = require('../../db/pool');
const { ensureOpsTables } = require('./store');
const { getTaskById, updateTaskStatus } = require('./tasks');
const { dispatchExecutionRequest } = require('./githubRemoteRunner');

const ACTIVE_STATUSES = new Set(['awaiting_confirmation', 'confirmed', 'running']);
const TERMINAL_STATUSES = new Set(['done', 'blocked', 'canceled', 'expired']);
const EXECUTION_REPOS = new Set(['wallet-app', 'website']);
const EXECUTION_ACTIONS = new Set(['apply', 'publish', 'deploy', 'restart']);

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeJson(value) {
  return value == null ? null : JSON.stringify(value);
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

function normalizeExecutionStatus(value) {
  const safe = normalizeValue(value).toLowerCase();
  if (ACTIVE_STATUSES.has(safe) || TERMINAL_STATUSES.has(safe)) {
    return safe;
  }

  return 'awaiting_confirmation';
}

function normalizeActionType(value) {
  const safe = normalizeValue(value).toLowerCase();
  if (EXECUTION_ACTIONS.has(safe)) {
    return safe;
  }

  if (/(push|publish|branch|ветк|пуш)/i.test(safe)) {
    return 'publish';
  }

  if (/(deploy|release|ship|задепл|выпусти|релиз)/i.test(safe)) {
    return 'deploy';
  }

  if (/(restart|reboot|перезапуск|рестарт|перегрузи)/i.test(safe)) {
    return 'restart';
  }

  return 'apply';
}

function normalizeRepoKey(value) {
  const safe = normalizeValue(value).toLowerCase();

  if (!safe) {
    return '';
  }

  if (EXECUTION_REPOS.has(safe)) {
    return safe;
  }

  if (/(website|site|web|landing|frontend|сайт|лендинг)/i.test(safe)) {
    return 'website';
  }

  if (/(wallet|mobile|app|application|backend|api|кошел|прилож|сервер)/i.test(safe)) {
    return 'wallet-app';
  }

  return '';
}

function hashCode(value) {
  return crypto.createHash('sha256').update(normalizeValue(value)).digest('hex');
}

function buildConfirmationCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function getConfirmationTtlMinutes() {
  const raw = Number(env.OPS_EXECUTION_CONFIRM_TTL_MINUTES || 15);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 60) : 15;
}

function buildConfirmationExpiry() {
  return new Date(Date.now() + getConfirmationTtlMinutes() * 60 * 1000);
}

function inferRepoKeyFromTask(task, requestedRepoKey = '') {
  const explicit = normalizeRepoKey(requestedRepoKey);
  if (explicit) {
    return explicit;
  }

  const details = parseJson(task?.details_json, {});
  const source = [
    normalizeValue(task?.title),
    normalizeValue(task?.body),
    Array.isArray(details?.proposedFiles) ? details.proposedFiles.join('\n') : '',
    Array.isArray(details?.repoFindings) ? details.repoFindings.map((item) => item?.file || '').join('\n') : ''
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (/(website|site|landing|frontend|cloudflare|4teen\.me|privacy|support)/i.test(source)) {
    return 'website';
  }

  return 'wallet-app';
}

function buildRequestSummary(task, repoKey, actionType = 'apply') {
  return [
    `Task #${Number(task?.id || 0)}`,
    normalizeValue(task?.title) || 'Untitled task',
    `repo=${repoKey}`,
    `action=${normalizeActionType(actionType)}`
  ].join(' • ');
}

async function expirePendingExecutionRequests() {
  await ensureOpsTables();

  await pool.query(
    `
      UPDATE ops_execution_requests
      SET status = 'expired',
          confirmation_code_hash = NULL,
          updated_at = NOW(),
          canceled_at = NOW()
      WHERE status = 'awaiting_confirmation'
        AND confirmation_expires_at IS NOT NULL
        AND confirmation_expires_at < NOW()
    `
  );
}

async function getExecutionRequestById(requestId) {
  await ensureOpsTables();
  const parsedId = Number(requestId || 0);
  if (!Number.isFinite(parsedId) || parsedId <= 0) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM ops_execution_requests
      WHERE id = $1
      LIMIT 1
    `,
    [parsedId]
  );

  return result.rows[0] || null;
}

async function findLatestPendingConfirmationByChat(chatId) {
  await ensureOpsTables();
  await expirePendingExecutionRequests();

  const safeChatId = normalizeValue(chatId);
  if (!safeChatId) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM ops_execution_requests
      WHERE requested_by_chat_id = $1
        AND status = 'awaiting_confirmation'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [safeChatId]
  );

  return result.rows[0] || null;
}

async function listExecutionRequests(limit = 10, options = {}) {
  await ensureOpsTables();
  await expirePendingExecutionRequests();

  const safeLimit = Math.max(1, Math.min(Number(limit || 10) || 10, 100));
  const params = [];
  const clauses = [];

  const status = normalizeExecutionStatus(options?.status || '');
  if (normalizeValue(options?.status)) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }

  const repoKey = normalizeRepoKey(options?.repoKey);
  if (repoKey) {
    params.push(repoKey);
    clauses.push(`repo_key = $${params.length}`);
  }

  if (normalizeValue(options?.actionType)) {
    params.push(normalizeActionType(options.actionType));
    clauses.push(`action_type = $${params.length}`);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(safeLimit);

  const result = await pool.query(
    `
      SELECT *
      FROM ops_execution_requests
      ${whereClause}
      ORDER BY updated_at DESC, id DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows;
}

async function findActiveExecutionRequest(taskId, repoKey, actionType = 'apply') {
  await ensureOpsTables();

  const result = await pool.query(
    `
      SELECT *
      FROM ops_execution_requests
      WHERE task_id = $1
        AND repo_key = $2
        AND action_type = $3
        AND status IN ('awaiting_confirmation', 'confirmed', 'running')
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [Number(taskId || 0), repoKey, normalizeActionType(actionType)]
  );

  return result.rows[0] || null;
}

async function issueExecutionRequest(input = {}) {
  await ensureOpsTables();
  await expirePendingExecutionRequests();

  const task = await getTaskById(input?.taskId);
  if (!task) {
    const error = new Error('Task not found');
    error.status = 404;
    throw error;
  }

  const repoKey = inferRepoKeyFromTask(task, input?.repoKey);
  if (!repoKey) {
    const error = new Error('Could not determine repo target for execution request');
    error.status = 422;
    throw error;
  }

  const actionType = normalizeActionType(input?.actionType);
  const existing = await findActiveExecutionRequest(task.id, repoKey, actionType);
  const code = buildConfirmationCode();
  const codeHash = hashCode(code);
  const expiresAt = buildConfirmationExpiry();
  const summary = buildRequestSummary(task, repoKey, actionType);

  if (existing?.status === 'confirmed' || existing?.status === 'running') {
    return {
      created: false,
      alreadyActive: true,
      request: existing,
      task,
      repoKey,
      actionType
    };
  }

  if (existing?.status === 'awaiting_confirmation') {
    const refreshed = await pool.query(
      `
        UPDATE ops_execution_requests
        SET requested_by_chat_id = COALESCE(NULLIF($2, ''), requested_by_chat_id),
            requested_by_user_id = COALESCE(NULLIF($3, ''), requested_by_user_id),
            confirmation_code_hash = $4,
            confirmation_expires_at = $5,
            requested_message = COALESCE(NULLIF($6, ''), requested_message),
            summary = $7,
            details_json = COALESCE($8::jsonb, details_json),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        existing.id,
        normalizeValue(input?.requestedByChatId),
        normalizeValue(input?.requestedByUserId),
        codeHash,
        expiresAt.toISOString(),
        normalizeValue(input?.requestedMessage),
        summary,
        normalizeJson(input?.details)
      ]
    );

    return {
      created: false,
      reissued: true,
      confirmationCode: code,
      request: refreshed.rows[0] || existing,
      task,
      repoKey,
      actionType
    };
  }

  const inserted = await pool.query(
    `
      INSERT INTO ops_execution_requests (
        task_id,
        repo_key,
        action_type,
        status,
        requested_by_chat_id,
        requested_by_user_id,
        confirmation_code_hash,
        confirmation_expires_at,
        requested_message,
        summary,
        details_json,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,'awaiting_confirmation',$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
      RETURNING *
    `,
    [
      task.id,
      repoKey,
      actionType,
      normalizeValue(input?.requestedByChatId) || null,
      normalizeValue(input?.requestedByUserId) || null,
      codeHash,
      expiresAt.toISOString(),
      normalizeValue(input?.requestedMessage) || null,
      summary,
      normalizeJson(input?.details)
    ]
  );

  return {
    created: true,
    confirmationCode: code,
    request: inserted.rows[0] || null,
    task,
    repoKey,
    actionType
  };
}

async function confirmExecutionRequestByCode(input = {}) {
  await ensureOpsTables();
  await expirePendingExecutionRequests();

  const chatId = normalizeValue(input?.chatId);
  const code = normalizeValue(input?.code).replace(/\D+/g, '');

  if (!chatId || code.length !== 6) {
    return {
      confirmed: false,
      invalid: true
    };
  }

  const result = await pool.query(
    `
      SELECT *
      FROM ops_execution_requests
      WHERE requested_by_chat_id = $1
        AND status = 'awaiting_confirmation'
        AND confirmation_code_hash = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [chatId, hashCode(code)]
  );

  const request = result.rows[0];
  if (!request) {
    return {
      confirmed: false,
      notFound: true
    };
  }

  const updated = await pool.query(
    `
      UPDATE ops_execution_requests
      SET status = 'confirmed',
          confirmation_code_hash = NULL,
          confirmed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [request.id]
  );

  const confirmedRequest = updated.rows[0] || request;
  const task = await getTaskById(request.task_id);
  const dispatch = await dispatchExecutionRequest(confirmedRequest, task).catch((error) => ({
    ok: false,
    error: error.message
  }));

  return {
    confirmed: true,
    request: confirmedRequest,
    task,
    dispatch
  };
}

async function cancelExecutionRequest(input = {}) {
  await ensureOpsTables();
  await expirePendingExecutionRequests();

  const requestId = Number(input?.requestId || 0);
  const chatId = normalizeValue(input?.chatId);
  const params = [];
  const clauses = [`status IN ('awaiting_confirmation', 'confirmed')`];

  if (requestId > 0) {
    params.push(requestId);
    clauses.push(`id = $${params.length}`);
  }

  if (chatId) {
    params.push(chatId);
    clauses.push(`requested_by_chat_id = $${params.length}`);
  }

  if (!params.length) {
    const error = new Error('Either requestId or chatId is required');
    error.status = 422;
    throw error;
  }

  const result = await pool.query(
    `
      UPDATE ops_execution_requests
      SET status = 'canceled',
          confirmation_code_hash = NULL,
          updated_at = NOW(),
          canceled_at = NOW()
      WHERE ${clauses.join(' AND ')}
      RETURNING *
    `,
    params
  );

  return result.rows[0] || null;
}

async function claimExecutionRequest(input = {}) {
  await ensureOpsTables();
  await expirePendingExecutionRequests();

  const repoKey = normalizeRepoKey(input?.repoKey);
  if (!repoKey) {
    const error = new Error('repoKey is required');
    error.status = 422;
    throw error;
  }
  const actionType = normalizeActionType(input?.actionType);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimedResult = await client.query(
      `
        WITH candidate AS (
          SELECT id
          FROM ops_execution_requests
          WHERE repo_key = $1
            AND action_type = $2
            AND status = 'confirmed'
          ORDER BY confirmed_at ASC NULLS LAST, id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE ops_execution_requests request
        SET status = 'running',
            runner_id = COALESCE(NULLIF($3, ''), runner_id),
            started_at = NOW(),
            updated_at = NOW()
        FROM candidate
        WHERE request.id = candidate.id
        RETURNING request.*
      `,
      [repoKey, actionType, normalizeValue(input?.runnerId)]
    );

    const request = claimedResult.rows[0] || null;
    if (!request) {
      await client.query('COMMIT');
      return null;
    }

    if (actionType === 'apply') {
      await client.query(
        `
          UPDATE ops_tasks
          SET status = 'in_progress',
              started_at = COALESCE(started_at, NOW()),
              updated_at = NOW()
          WHERE id = $1
        `,
        [request.task_id]
      );
    }

    await client.query('COMMIT');
    return request;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

async function finishExecutionRequest(requestId, input = {}) {
  await ensureOpsTables();

  const request = await getExecutionRequestById(requestId);
  if (!request) {
    const error = new Error('Execution request not found');
    error.status = 404;
    throw error;
  }

  const safeStatus = normalizeExecutionStatus(input?.status);
  if (!['done', 'blocked', 'canceled'].includes(safeStatus)) {
    const error = new Error('Execution request can only be finished as done, blocked or canceled');
    error.status = 422;
    throw error;
  }

  const result = await pool.query(
    `
      UPDATE ops_execution_requests
      SET status = $2,
          runner_id = COALESCE(NULLIF($3, ''), runner_id),
          summary = COALESCE(NULLIF($4, ''), summary),
          result_message = COALESCE(NULLIF($5, ''), result_message),
          details_json = COALESCE($6::jsonb, details_json),
          finished_at = NOW(),
          canceled_at = CASE WHEN $2 = 'canceled' THEN NOW() ELSE canceled_at END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      request.id,
      safeStatus,
      normalizeValue(input?.runnerId),
      normalizeValue(input?.summary),
      normalizeValue(input?.resultMessage),
      normalizeJson(input?.details)
    ]
  );

  const updated = result.rows[0] || request;

  if (request.action_type === 'apply' && safeStatus === 'done') {
    await updateTaskStatus(request.task_id, 'done', {
      body: normalizeValue(input?.resultMessage) || normalizeValue(input?.summary) || 'Execution request completed.',
      details: {
        executionRequestId: request.id,
        executionRepo: request.repo_key,
        executionStatus: 'done',
        executionActionType: request.action_type
      }
    }).catch(() => null);
  } else if (request.action_type === 'apply' && safeStatus === 'blocked') {
    await updateTaskStatus(request.task_id, 'blocked', {
      body: normalizeValue(input?.resultMessage) || normalizeValue(input?.summary) || 'Execution request blocked.',
      details: {
        executionRequestId: request.id,
        executionRepo: request.repo_key,
        executionStatus: 'blocked',
        executionActionType: request.action_type
      }
    }).catch(() => null);
  } else if (safeStatus === 'done' || safeStatus === 'blocked') {
    const task = await getTaskById(request.task_id);
    const details = parseJson(task?.details_json, {});
    details.releaseAction = request.action_type;
    details.releaseRequestId = request.id;
    details.releaseStatus = safeStatus;
    details.releaseSummary = normalizeValue(input?.summary) || normalizeValue(input?.resultMessage) || null;

    await updateTaskStatus(request.task_id, task?.status || 'done', {
      details
    }).catch(() => null);
  }

  return {
    request: updated,
    task: await getTaskById(request.task_id)
  };
}

async function findLatestCompletedApplyRequest(taskId, repoKey = '') {
  await ensureOpsTables();
  const parsedId = Number(taskId || 0);
  if (!Number.isFinite(parsedId) || parsedId <= 0) {
    return null;
  }

  const params = [parsedId];
  const clauses = [`task_id = $1`, `action_type = 'apply'`, `status = 'done'`];
  const normalizedRepo = normalizeRepoKey(repoKey);
  if (normalizedRepo) {
    params.push(normalizedRepo);
    clauses.push(`repo_key = $${params.length}`);
  }

  const result = await pool.query(
    `
      SELECT *
      FROM ops_execution_requests
      WHERE ${clauses.join(' AND ')}
      ORDER BY finished_at DESC NULLS LAST, id DESC
      LIMIT 1
    `,
    params
  );

  return result.rows[0] || null;
}

module.exports = {
  cancelExecutionRequest,
  claimExecutionRequest,
  confirmExecutionRequestByCode,
  findLatestPendingConfirmationByChat,
  findLatestCompletedApplyRequest,
  finishExecutionRequest,
  getExecutionRequestById,
  inferRepoKeyFromTask,
  issueExecutionRequest,
  listExecutionRequests,
  normalizeActionType,
  normalizeRepoKey
};
