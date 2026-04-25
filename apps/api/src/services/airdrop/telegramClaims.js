const crypto = require('crypto');
const { Client } = require('pg');
const { pool } = require('../../db/pool');
const env = require('../../config/env');

const PLATFORM_TELEGRAM = 'telegram';
const PLATFORM_TELEGRAM_BIT = 4;
const SESSION_TTL_MS = 10 * 60 * 1000;

function normalizeWallet(value) {
  return String(value || '').trim();
}

function normalizeTelegramUserId(value) {
  return String(value || '').trim();
}

function normalizeTelegramUsername(value) {
  const next = String(value || '').trim().replace(/^@+/, '');
  return next || null;
}

function normalizeTxid(value) {
  const next = String(value || '').trim().toLowerCase();
  return next || null;
}

function normalizeSessionToken(value) {
  return String(value || '').trim();
}

function normalizeSessionStatus(value, fallback = 'pending') {
  const next = String(value || '').trim().toLowerCase();
  return next || fallback;
}

function normalizeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value;
}

function hashLegacyValue(value) {
  const salt = String(env.TELEGRAM_LEGACY_HASH_SALT || '').trim();

  if (!salt) {
    return null;
  }

  return crypto
    .createHash('sha256')
    .update(`${salt}:${String(value || '').trim()}`)
    .digest('hex');
}

function hashSessionToken(value) {
  return crypto
    .createHash('sha256')
    .update(normalizeSessionToken(value))
    .digest('hex');
}

function isValidTronAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizeWallet(value));
}

async function ensureTelegramAirdropTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legacy_telegram_claims (
      id BIGSERIAL PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'legacy_bot',
      telegram_user_id_hash TEXT NOT NULL UNIQUE,
      wallet_hash TEXT NOT NULL UNIQUE,
      txid TEXT,
      reward_amount NUMERIC(18,6) NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta_json JSONB
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_legacy_telegram_claims_txid
      ON legacy_telegram_claims (txid)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_account_links (
      id BIGSERIAL PRIMARY KEY,
      wallet_address TEXT NOT NULL UNIQUE,
      telegram_user_id TEXT NOT NULL UNIQUE,
      telegram_username TEXT,
      telegram_chat_id TEXT,
      legacy_claimed BOOLEAN NOT NULL DEFAULT FALSE,
      verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_telegram_account_links_username
      ON telegram_account_links (telegram_username)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS airdrop_claim_sessions (
      id BIGSERIAL PRIMARY KEY,
      session_token_hash TEXT NOT NULL UNIQUE,
      wallet_address TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_bit INTEGER NOT NULL,
      telegram_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload_json JSONB
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_airdrop_claim_sessions_wallet_platform
      ON airdrop_claim_sessions (wallet_address, platform)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_airdrop_claim_sessions_status_expires
      ON airdrop_claim_sessions (status, expires_at)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS airdrop_claims (
      id BIGSERIAL PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_bit INTEGER NOT NULL,
      telegram_user_id TEXT,
      reward_amount NUMERIC(18,6) NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      txid TEXT,
      failure_reason TEXT,
      queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      meta_json JSONB,
      UNIQUE (wallet_address, platform),
      UNIQUE (platform, telegram_user_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_airdrop_claims_status
      ON airdrop_claims (status)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_airdrop_claims_txid
      ON airdrop_claims (txid)
  `);
}

async function importLegacyTelegramClaims({ sourceConnectionString } = {}) {
  const resolvedConnectionString =
    String(sourceConnectionString || env.LEGACY_TELEGRAM_BOT_DATABASE_URL || '').trim();

  if (!resolvedConnectionString) {
    const error = new Error('Legacy Telegram bot DATABASE_URL is missing');
    error.status = 400;
    throw error;
  }

  await ensureTelegramAirdropTables();

  const sourceClient = new Client({
    connectionString: resolvedConnectionString,
    ssl: resolvedConnectionString ? { rejectUnauthorized: false } : false
  });

  await sourceClient.connect();

  try {
    const sourceResult = await sourceClient.query(`
      SELECT
        telegram_user_id_hash,
        wallet_hash,
        txid,
        reward_amount,
        claimed_at
      FROM claims
      ORDER BY claimed_at ASC, id ASC
    `);

    let imported = 0;
    let skipped = 0;

    for (const row of sourceResult.rows) {
      const insertResult = await pool.query(
        `
          INSERT INTO legacy_telegram_claims (
            source,
            telegram_user_id_hash,
            wallet_hash,
            txid,
            reward_amount,
            claimed_at,
            meta_json
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT DO NOTHING
        `,
        [
          'legacy_bot',
          String(row.telegram_user_id_hash || '').trim(),
          String(row.wallet_hash || '').trim(),
          normalizeTxid(row.txid),
          String(row.reward_amount || '0'),
          row.claimed_at,
          JSON.stringify({
            imported_from: 'legacy_telegram_bot',
            imported_at: new Date().toISOString()
          })
        ]
      );

      if (insertResult.rowCount > 0) {
        imported += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      sourceRows: sourceResult.rowCount,
      imported,
      skipped
    };
  } finally {
    await sourceClient.end().catch(() => null);
  }
}

async function getTelegramAirdropGuardStatus({ walletAddress, telegramUserId }) {
  await ensureTelegramAirdropTables();

  const wallet = normalizeWallet(walletAddress);
  const telegramId = normalizeTelegramUserId(telegramUserId);

  const response = {
    walletAddress: wallet || null,
    telegramUserId: telegramId || null,
    platform: PLATFORM_TELEGRAM,
    platformBit: PLATFORM_TELEGRAM_BIT,
    legacyHashChecksAvailable: Boolean(String(env.TELEGRAM_LEGACY_HASH_SALT || '').trim()),
    walletLinked: false,
    telegramLinked: false,
    walletAlreadyClaimed: false,
    telegramAlreadyClaimed: false,
    walletBlockedByLegacyClaim: false,
    telegramBlockedByLegacyClaim: false,
    walletLinkedTelegramUserId: null,
    telegramLinkedWalletAddress: null,
    claimedTxid: null,
    canLink: false,
    canQueueClaim: false
  };

  if (wallet) {
    const [walletLinkResult, walletClaimResult] = await Promise.all([
      pool.query(
        `
          SELECT telegram_user_id
          FROM telegram_account_links
          WHERE wallet_address = $1
          LIMIT 1
        `,
        [wallet]
      ),
      pool.query(
        `
          SELECT txid
          FROM airdrop_claims
          WHERE wallet_address = $1
            AND platform = $2
          LIMIT 1
        `,
        [wallet, PLATFORM_TELEGRAM]
      )
    ]);

    response.walletLinked = walletLinkResult.rowCount > 0;
    response.walletLinkedTelegramUserId =
      walletLinkResult.rows[0]?.telegram_user_id || null;
    response.walletAlreadyClaimed = walletClaimResult.rowCount > 0;
    response.claimedTxid = walletClaimResult.rows[0]?.txid || null;

    const walletHash = hashLegacyValue(wallet);

    if (walletHash) {
      const legacyWalletResult = await pool.query(
        `
          SELECT txid
          FROM legacy_telegram_claims
          WHERE wallet_hash = $1
          LIMIT 1
        `,
        [walletHash]
      );

      response.walletBlockedByLegacyClaim = legacyWalletResult.rowCount > 0;
      response.claimedTxid = response.claimedTxid || legacyWalletResult.rows[0]?.txid || null;
    }
  }

  if (telegramId) {
    const [telegramLinkResult, telegramClaimResult] = await Promise.all([
      pool.query(
        `
          SELECT wallet_address
          FROM telegram_account_links
          WHERE telegram_user_id = $1
          LIMIT 1
        `,
        [telegramId]
      ),
      pool.query(
        `
          SELECT wallet_address, txid
          FROM airdrop_claims
          WHERE telegram_user_id = $1
            AND platform = $2
          LIMIT 1
        `,
        [telegramId, PLATFORM_TELEGRAM]
      )
    ]);

    response.telegramLinked = telegramLinkResult.rowCount > 0;
    response.telegramLinkedWalletAddress =
      telegramLinkResult.rows[0]?.wallet_address || null;
    response.telegramAlreadyClaimed = telegramClaimResult.rowCount > 0;
    response.claimedTxid = response.claimedTxid || telegramClaimResult.rows[0]?.txid || null;

    const telegramHash = hashLegacyValue(telegramId);

    if (telegramHash) {
      const legacyTelegramResult = await pool.query(
        `
          SELECT txid
          FROM legacy_telegram_claims
          WHERE telegram_user_id_hash = $1
          LIMIT 1
        `,
        [telegramHash]
      );

      response.telegramBlockedByLegacyClaim = legacyTelegramResult.rowCount > 0;
      response.claimedTxid = response.claimedTxid || legacyTelegramResult.rows[0]?.txid || null;
    }
  }

  const walletConflict =
    response.walletLinked &&
    telegramId &&
    response.walletLinkedTelegramUserId !== telegramId;
  const telegramConflict =
    response.telegramLinked &&
    wallet &&
    response.telegramLinkedWalletAddress !== wallet;

  response.canLink =
    Boolean(wallet && telegramId) &&
    !walletConflict &&
    !telegramConflict &&
    !response.walletBlockedByLegacyClaim &&
    !response.telegramBlockedByLegacyClaim;

  response.canQueueClaim =
    response.canLink &&
    !response.walletAlreadyClaimed &&
    !response.telegramAlreadyClaimed;

  return response;
}

async function upsertTelegramAccountLink({
  walletAddress,
  telegramUserId,
  telegramUsername,
  telegramChatId,
  legacyClaimed = false,
  notes = null
}) {
  await ensureTelegramAirdropTables();

  const wallet = normalizeWallet(walletAddress);
  const telegramId = normalizeTelegramUserId(telegramUserId);

  if (!wallet) {
    const error = new Error('walletAddress is required');
    error.status = 400;
    throw error;
  }

  if (!telegramId) {
    const error = new Error('telegramUserId is required');
    error.status = 400;
    throw error;
  }

  const guard = await getTelegramAirdropGuardStatus({
    walletAddress: wallet,
    telegramUserId: telegramId
  });

  if (!guard.canLink) {
    const error = new Error('Wallet and Telegram link is not allowed');
    error.status = 409;
    error.details = guard;
    throw error;
  }

  const result = await pool.query(
    `
      INSERT INTO telegram_account_links (
        wallet_address,
        telegram_user_id,
        telegram_username,
        telegram_chat_id,
        legacy_claimed,
        notes,
        verified_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
      ON CONFLICT (wallet_address)
      DO UPDATE SET
        telegram_user_id = EXCLUDED.telegram_user_id,
        telegram_username = EXCLUDED.telegram_username,
        telegram_chat_id = EXCLUDED.telegram_chat_id,
        legacy_claimed = EXCLUDED.legacy_claimed,
        notes = EXCLUDED.notes,
        verified_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `,
    [
      wallet,
      telegramId,
      normalizeTelegramUsername(telegramUsername),
      normalizeTelegramUserId(telegramChatId) || null,
      Boolean(legacyClaimed),
      notes ? String(notes) : null
    ]
  );

  return result.rows[0];
}

async function createTelegramClaimSession({
  walletAddress,
  sessionToken,
  challenge,
  expiresAt,
  payload = null
}) {
  await ensureTelegramAirdropTables();

  const wallet = normalizeWallet(walletAddress);
  const token = normalizeSessionToken(sessionToken);

  if (!wallet) {
    const error = new Error('walletAddress is required');
    error.status = 400;
    throw error;
  }

  if (!isValidTronAddress(wallet)) {
    const error = new Error('invalid TRON address');
    error.status = 400;
    throw error;
  }

  if (!token) {
    const error = new Error('sessionToken is required');
    error.status = 400;
    throw error;
  }

  const resolvedExpiresAt = expiresAt || new Date(Date.now() + SESSION_TTL_MS);
  const payloadJson = normalizeJsonObject({
    ...(normalizeJsonObject(payload) || {}),
    challenge: String(challenge || '').trim()
  });

  const result = await pool.query(
    `
      INSERT INTO airdrop_claim_sessions (
        session_token_hash,
        wallet_address,
        platform,
        platform_bit,
        status,
        expires_at,
        payload_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `,
    [
      hashSessionToken(token),
      wallet,
      PLATFORM_TELEGRAM,
      PLATFORM_TELEGRAM_BIT,
      'pending',
      resolvedExpiresAt,
      payloadJson ? JSON.stringify(payloadJson) : null
    ]
  );

  return result.rows[0];
}

async function getTelegramClaimSessionByToken(sessionToken) {
  await ensureTelegramAirdropTables();

  const token = normalizeSessionToken(sessionToken);

  if (!token) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM airdrop_claim_sessions
      WHERE session_token_hash = $1
        AND platform = $2
      LIMIT 1
    `,
    [hashSessionToken(token), PLATFORM_TELEGRAM]
  );

  return result.rows[0] || null;
}

async function updateTelegramClaimSession({
  sessionId,
  status,
  telegramUserId,
  consumed = false,
  payloadPatch = null
}) {
  await ensureTelegramAirdropTables();

  const nextStatus = normalizeSessionStatus(status, '');

  if (!sessionId || !nextStatus) {
    const error = new Error('sessionId and status are required');
    error.status = 400;
    throw error;
  }

  const currentResult = await pool.query(
    `
      SELECT payload_json
      FROM airdrop_claim_sessions
      WHERE id = $1
      LIMIT 1
    `,
    [sessionId]
  );

  if (currentResult.rowCount === 0) {
    const error = new Error('Session not found');
    error.status = 404;
    throw error;
  }

  const nextPayload =
    payloadPatch && typeof payloadPatch === 'object'
      ? {
          ...(currentResult.rows[0]?.payload_json || {}),
          ...payloadPatch
        }
      : currentResult.rows[0]?.payload_json || null;

  const result = await pool.query(
    `
      UPDATE airdrop_claim_sessions
      SET
        status = $2,
        telegram_user_id = COALESCE($3, telegram_user_id),
        consumed_at = CASE WHEN $4 THEN NOW() ELSE consumed_at END,
        payload_json = $5
      WHERE id = $1
      RETURNING *
    `,
    [
      sessionId,
      nextStatus,
      normalizeTelegramUserId(telegramUserId) || null,
      Boolean(consumed),
      nextPayload ? JSON.stringify(nextPayload) : null
    ]
  );

  return result.rows[0] || null;
}

async function getTelegramAirdropOverview({ walletAddress }) {
  await ensureTelegramAirdropTables();

  const wallet = normalizeWallet(walletAddress);

  if (!wallet) {
    const error = new Error('walletAddress is required');
    error.status = 400;
    throw error;
  }

  if (!isValidTronAddress(wallet)) {
    const error = new Error('invalid TRON address');
    error.status = 400;
    throw error;
  }

  const [guard, linkResult, claimResult, sessionResult] = await Promise.all([
    getTelegramAirdropGuardStatus({ walletAddress: wallet }),
    pool.query(
      `
        SELECT *
        FROM telegram_account_links
        WHERE wallet_address = $1
        LIMIT 1
      `,
      [wallet]
    ),
    pool.query(
      `
        SELECT *
        FROM airdrop_claims
        WHERE wallet_address = $1
          AND platform = $2
        LIMIT 1
      `,
      [wallet, PLATFORM_TELEGRAM]
    ),
    pool.query(
      `
        SELECT *
        FROM airdrop_claim_sessions
        WHERE wallet_address = $1
          AND platform = $2
          AND expires_at > NOW()
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
      [wallet, PLATFORM_TELEGRAM]
    )
  ]);

  let claim = claimResult.rows[0] || null;

  if (claim?.status === 'queued') {
    const queueResult = await pool.query(
      `
        SELECT
          COUNT(*)::INT AS queue_size,
          COUNT(*) FILTER (
            WHERE queued_at < $2
               OR (queued_at = $2 AND id <= $3)
          )::INT AS queue_position
        FROM airdrop_claims
        WHERE platform = $1
          AND status = 'queued'
      `,
      [PLATFORM_TELEGRAM, claim.queued_at, claim.id]
    );

    claim = {
      ...claim,
      queue_size: Number(queueResult.rows[0]?.queue_size || 0),
      queue_position: Number(queueResult.rows[0]?.queue_position || 0)
    };
  }

  return {
    walletAddress: wallet,
    guard,
    link: linkResult.rows[0] || null,
    claim,
    session: sessionResult.rows[0] || null
  };
}

async function queueTelegramClaim({
  walletAddress,
  telegramUserId,
  rewardAmount,
  meta = null
}) {
  await ensureTelegramAirdropTables();

  const wallet = normalizeWallet(walletAddress);
  const telegramId = normalizeTelegramUserId(telegramUserId);

  if (!wallet || !telegramId) {
    const error = new Error('walletAddress and telegramUserId are required');
    error.status = 400;
    throw error;
  }

  const guard = await getTelegramAirdropGuardStatus({
    walletAddress: wallet,
    telegramUserId: telegramId
  });

  if (!guard.canQueueClaim) {
    const error = new Error('Telegram claim is not allowed');
    error.status = 409;
    error.details = guard;
    throw error;
  }

  const result = await pool.query(
    `
      INSERT INTO airdrop_claims (
        wallet_address,
        platform,
        platform_bit,
        telegram_user_id,
        reward_amount,
        status,
        meta_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (wallet_address, platform)
      DO UPDATE SET
        telegram_user_id = EXCLUDED.telegram_user_id,
        reward_amount = EXCLUDED.reward_amount,
        meta_json = EXCLUDED.meta_json
      RETURNING *
    `,
    [
      wallet,
      PLATFORM_TELEGRAM,
      PLATFORM_TELEGRAM_BIT,
      telegramId,
      String(rewardAmount),
      'queued',
      meta && typeof meta === 'object' ? JSON.stringify(meta) : null
    ]
  );

  return result.rows[0] || null;
}

async function updateTelegramClaim({
  claimId,
  status,
  txid = null,
  failureReason = null,
  metaPatch = null
}) {
  await ensureTelegramAirdropTables();

  const nextStatus = normalizeSessionStatus(status, '');

  if (!claimId || !nextStatus) {
    const error = new Error('claimId and status are required');
    error.status = 400;
    throw error;
  }

  const currentResult = await pool.query(
    `
      SELECT meta_json
      FROM airdrop_claims
      WHERE id = $1
      LIMIT 1
    `,
    [claimId]
  );

  if (currentResult.rowCount === 0) {
    const error = new Error('Claim not found');
    error.status = 404;
    throw error;
  }

  const nextMeta =
    metaPatch && typeof metaPatch === 'object'
      ? {
          ...(currentResult.rows[0]?.meta_json || {}),
          ...metaPatch
        }
      : currentResult.rows[0]?.meta_json || null;

  const result = await pool.query(
    `
      UPDATE airdrop_claims
      SET
        status = $2,
        txid = COALESCE($3, txid),
        failure_reason = CASE WHEN $2 = 'failed' THEN $4 ELSE NULL END,
        sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
        failed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE failed_at END,
        meta_json = $5
      WHERE id = $1
      RETURNING *
    `,
    [
      claimId,
      nextStatus,
      normalizeTxid(txid),
      failureReason ? String(failureReason) : null,
      nextMeta ? JSON.stringify(nextMeta) : null
    ]
  );

  return result.rows[0] || null;
}

async function listQueuedTelegramClaims(limit = 10) {
  await ensureTelegramAirdropTables();

  const result = await pool.query(
    `
      SELECT *
      FROM airdrop_claims
      WHERE platform = $1
        AND status = 'queued'
      ORDER BY queued_at ASC, id ASC
      LIMIT $2
    `,
    [PLATFORM_TELEGRAM, Math.max(1, Number(limit) || 10)]
  );

  return result.rows;
}

module.exports = {
  PLATFORM_TELEGRAM,
  PLATFORM_TELEGRAM_BIT,
  ensureTelegramAirdropTables,
  createTelegramClaimSession,
  getTelegramAirdropOverview,
  getTelegramAirdropGuardStatus,
  getTelegramClaimSessionByToken,
  importLegacyTelegramClaims,
  isValidTronAddress,
  listQueuedTelegramClaims,
  queueTelegramClaim,
  updateTelegramClaim,
  updateTelegramClaimSession,
  upsertTelegramAccountLink
};
