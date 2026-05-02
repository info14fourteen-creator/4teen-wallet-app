const { pool } = require('../../db/pool');

function normalizeStatus(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function statusToLabel(status) {
  if (status === 0) return 'created';
  if (status === 1) return 'delegated';
  if (status === 2) return 'failed';
  if (status === 10) return 'reclaimed';
  return 'unknown';
}

async function ensureGasStationNotificationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gasstation_notifications (
      id BIGSERIAL PRIMARY KEY,
      trade_no TEXT,
      request_id TEXT NOT NULL,
      status INTEGER NOT NULL,
      status_label TEXT NOT NULL,
      raw_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gasstation_notifications_request_id
      ON gasstation_notifications (request_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gasstation_notifications_trade_no
      ON gasstation_notifications (trade_no)
  `);
}

async function recordGasStationNotification(input) {
  const requestId = String(input?.request_id || input?.requestId || '').trim();
  const tradeNo = String(input?.trade_no || input?.tradeNo || '').trim();
  const status = normalizeStatus(input?.status);

  if (!requestId || status === null) {
    const error = new Error('Invalid GasStation notification payload');
    error.status = 400;
    throw error;
  }

  await ensureGasStationNotificationsTable();

  const result = await pool.query(
    `
      INSERT INTO gasstation_notifications (
        trade_no,
        request_id,
        status,
        status_label,
        raw_json
      )
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `,
    [
      tradeNo || null,
      requestId,
      status,
      statusToLabel(status),
      JSON.stringify(input || {})
    ]
  );

  return result.rows[0];
}

module.exports = {
  recordGasStationNotification,
  statusToLabel
};
