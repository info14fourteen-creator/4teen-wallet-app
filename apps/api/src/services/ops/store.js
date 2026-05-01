const crypto = require('crypto');
const { pool } = require('../../db/pool');

let ensureOpsTablesPromise = null;

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function hashFingerprint(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function ensureOpsTables() {
  if (ensureOpsTablesPromise) {
    return ensureOpsTablesPromise;
  }

  ensureOpsTablesPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ops_events (
        id BIGSERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        status TEXT NOT NULL DEFAULT 'open',
        fingerprint TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        details_json JSONB,
        count INTEGER NOT NULL DEFAULT 1,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_notified_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_events_open_fingerprint
        ON ops_events (fingerprint)
        WHERE resolved_at IS NULL
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ops_events_recent
        ON ops_events (last_seen_at DESC)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ops_telegram_targets (
        id BIGSERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL UNIQUE,
        chat_type TEXT NOT NULL,
        label TEXT,
        telegram_user_id TEXT,
        is_owner BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_ops_telegram_targets_active
        ON ops_telegram_targets (is_active, is_owner)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ops_runtime_state (
        key TEXT PRIMARY KEY,
        value_json JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  })().catch((error) => {
    ensureOpsTablesPromise = null;
    throw error;
  });

  return ensureOpsTablesPromise;
}

function buildEventFingerprint(input) {
  const explicit = normalizeValue(input?.fingerprint);
  if (explicit) {
    return hashFingerprint(explicit);
  }

  return hashFingerprint(
    [
      normalizeValue(input?.source),
      normalizeValue(input?.category),
      normalizeValue(input?.type),
      normalizeValue(input?.title)
    ].join('|')
  );
}

async function openOrIncrementEvent(input) {
  await ensureOpsTables();

  const fingerprint = buildEventFingerprint(input);
  const existingResult = await pool.query(
    `
      SELECT *
      FROM ops_events
      WHERE fingerprint = $1
        AND resolved_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    `,
    [fingerprint]
  );

  if (existingResult.rows[0]) {
    const updated = await pool.query(
      `
        UPDATE ops_events
        SET severity = $2,
            status = 'open',
            title = $3,
            message = $4,
            details_json = $5,
            count = count + 1,
            last_seen_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        existingResult.rows[0].id,
        normalizeValue(input?.severity) || 'info',
        normalizeValue(input?.title) || 'Untitled ops event',
        normalizeValue(input?.message) || 'No message provided',
        normalizeJson(input?.details)
      ]
    );

    return {
      event: updated.rows[0],
      fingerprint,
      created: false
    };
  }

  const inserted = await pool.query(
    `
      INSERT INTO ops_events (
        source,
        category,
        type,
        severity,
        status,
        fingerprint,
        title,
        message,
        details_json
      )
      VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8)
      RETURNING *
    `,
    [
      normalizeValue(input?.source) || 'unknown',
      normalizeValue(input?.category) || 'general',
      normalizeValue(input?.type) || 'event',
      normalizeValue(input?.severity) || 'info',
      fingerprint,
      normalizeValue(input?.title) || 'Untitled ops event',
      normalizeValue(input?.message) || 'No message provided',
      normalizeJson(input?.details)
    ]
  );

  return {
    event: inserted.rows[0],
    fingerprint,
    created: true
  };
}

async function markEventNotified(eventId) {
  await ensureOpsTables();

  const result = await pool.query(
    `
      UPDATE ops_events
      SET last_notified_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [eventId]
  );

  return result.rows[0] || null;
}

async function resolveEvent(input) {
  await ensureOpsTables();

  const fingerprint = buildEventFingerprint(input);
  const result = await pool.query(
    `
      UPDATE ops_events
      SET status = 'resolved',
          message = COALESCE(NULLIF($2, ''), message),
          details_json = COALESCE($3::jsonb, details_json),
          resolved_at = NOW(),
          updated_at = NOW()
      WHERE fingerprint = $1
        AND resolved_at IS NULL
      RETURNING *
    `,
    [
      fingerprint,
      normalizeValue(input?.message),
      normalizeJson(input?.details)
    ]
  );

  return result.rows[0] || null;
}

async function listRecentEvents(limit = 10, options = {}) {
  await ensureOpsTables();

  const safeLimit = Math.max(1, Math.min(Number(limit || 10) || 10, 50));
  const onlyOpen = options?.onlyOpen === true;
  const result = await pool.query(
    `
      SELECT *
      FROM ops_events
      ${onlyOpen ? 'WHERE resolved_at IS NULL' : ''}
      ORDER BY last_seen_at DESC, id DESC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

async function upsertTelegramTarget(input) {
  await ensureOpsTables();

  const chatId = normalizeValue(input?.chatId);
  const chatType = normalizeValue(input?.chatType) || 'private';

  if (!chatId) {
    throw new Error('chatId is required');
  }

  const result = await pool.query(
    `
      INSERT INTO ops_telegram_targets (
        chat_id,
        chat_type,
        label,
        telegram_user_id,
        is_owner,
        is_active,
        created_at,
        updated_at,
        last_seen_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW(),NOW())
      ON CONFLICT (chat_id)
      DO UPDATE SET
        chat_type = EXCLUDED.chat_type,
        label = COALESCE(EXCLUDED.label, ops_telegram_targets.label),
        telegram_user_id = COALESCE(EXCLUDED.telegram_user_id, ops_telegram_targets.telegram_user_id),
        is_owner = EXCLUDED.is_owner OR ops_telegram_targets.is_owner,
        is_active = EXCLUDED.is_active,
        updated_at = NOW(),
        last_seen_at = NOW()
      RETURNING *
    `,
    [
      chatId,
      chatType,
      normalizeValue(input?.label) || null,
      normalizeValue(input?.telegramUserId) || null,
      Boolean(input?.isOwner),
      input?.isActive !== false
    ]
  );

  return result.rows[0] || null;
}

async function touchTelegramTarget(chatId, telegramUserId = '') {
  await ensureOpsTables();

  const result = await pool.query(
    `
      UPDATE ops_telegram_targets
      SET telegram_user_id = COALESCE(NULLIF($2, ''), telegram_user_id),
          last_seen_at = NOW(),
          updated_at = NOW()
      WHERE chat_id = $1
      RETURNING *
    `,
    [normalizeValue(chatId), normalizeValue(telegramUserId)]
  );

  return result.rows[0] || null;
}

async function getOwnerTelegramTarget() {
  await ensureOpsTables();

  const result = await pool.query(
    `
      SELECT *
      FROM ops_telegram_targets
      WHERE is_owner = TRUE
        AND is_active = TRUE
      ORDER BY id ASC
      LIMIT 1
    `
  );

  return result.rows[0] || null;
}

async function getTelegramTargetByChatId(chatId) {
  await ensureOpsTables();

  const result = await pool.query(
    `
      SELECT *
      FROM ops_telegram_targets
      WHERE chat_id = $1
      LIMIT 1
    `,
    [normalizeValue(chatId)]
  );

  return result.rows[0] || null;
}

async function listActiveTelegramTargets() {
  await ensureOpsTables();

  const result = await pool.query(
    `
      SELECT *
      FROM ops_telegram_targets
      WHERE is_active = TRUE
      ORDER BY is_owner DESC, id ASC
    `
  );

  return result.rows;
}

async function setRuntimeState(key, value) {
  await ensureOpsTables();

  const result = await pool.query(
    `
      INSERT INTO ops_runtime_state (key, value_json, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET
        value_json = EXCLUDED.value_json,
        updated_at = NOW()
      RETURNING *
    `,
    [normalizeValue(key), normalizeJson(value)]
  );

  return result.rows[0] || null;
}

async function getRuntimeState(key) {
  await ensureOpsTables();

  const result = await pool.query(
    `
      SELECT *
      FROM ops_runtime_state
      WHERE key = $1
      LIMIT 1
    `,
    [normalizeValue(key)]
  );

  return result.rows[0] || null;
}

module.exports = {
  ensureOpsTables,
  getOwnerTelegramTarget,
  getRuntimeState,
  getTelegramTargetByChatId,
  listActiveTelegramTargets,
  listRecentEvents,
  markEventNotified,
  openOrIncrementEvent,
  resolveEvent,
  setRuntimeState,
  touchTelegramTarget,
  upsertTelegramTarget
};
