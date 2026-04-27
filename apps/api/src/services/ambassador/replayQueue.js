const env = require('../../config/env');
const { pool } = require('../../db/pool');
const { replayPendingPurchases } = require('./replayPending');
const {
  ensureAmbassadorAllocationResources,
  getAmbassadorAllocationWalletResources,
  hasEnoughAmbassadorAllocationResources
} = require('./resourceGate');

let ambassadorReplayDrainPromise = Promise.resolve();

function normalizeValue(value) {
  return String(value || '').trim();
}

function isValidTronAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizeValue(value));
}

async function replayPendingAmbassadorAllocationsByWallet(wallet, options = {}) {
  const normalizedWallet = normalizeValue(wallet);

  if (!isValidTronAddress(normalizedWallet)) {
    throw new Error('invalid TRON address');
  }

  const { resourceState, rentalResult } = await ensureAmbassadorAllocationResources({
    walletAddress: normalizedWallet
  });

  if (!resourceState.hasEnough) {
    return {
      ok: true,
      wallet: normalizedWallet,
      queued: true,
      deferred: true,
      reason: 'Allocation wallet resources are still below the safe floor.',
      resourceState,
      rentalResult
    };
  }

  const payload = await replayPendingPurchases({
    wallet: normalizedWallet,
    limit: options.limit || 10,
    dryRun: Boolean(options.dryRun)
  });

  return {
    ...(payload || {}),
    resourceState,
    rentalResult
  };
}

async function listAmbassadorWalletsWithPendingAllocations(limit = env.AMBASSADOR_PENDING_QUEUE_LIMIT) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 25) || 25, 200));
  const result = await pool.query(
    `
      SELECT lower(resolved_ambassador_wallet) AS wallet
      FROM purchases
      WHERE resolved_ambassador_wallet IS NOT NULL
        AND status = 'attributed'
      GROUP BY lower(resolved_ambassador_wallet)
      ORDER BY MIN(token_block_time) ASC NULLS FIRST, MIN(id) ASC
      LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows
    .map((row) => normalizeValue(row.wallet))
    .filter(Boolean);
}

async function drainAmbassadorReplayQueue(limit = env.AMBASSADOR_PENDING_QUEUE_LIMIT) {
  const wallets = await listAmbassadorWalletsWithPendingAllocations(limit);
  const items = [];

  for (const wallet of wallets) {
    try {
      const result = await replayPendingAmbassadorAllocationsByWallet(wallet);
      items.push({
        wallet,
        ok: true,
        result
      });
    } catch (error) {
      items.push({
        wallet,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    totalWallets: wallets.length,
    succeeded: items.filter((item) => item.ok).length,
    failed: items.filter((item) => !item.ok).length,
    items
  };
}

function enqueueAmbassadorReplayDrain(limit = env.AMBASSADOR_PENDING_QUEUE_LIMIT) {
  const nextRun = ambassadorReplayDrainPromise.then(() => drainAmbassadorReplayQueue(limit));
  ambassadorReplayDrainPromise = nextRun.catch(() => ({
    totalWallets: 0,
    succeeded: 0,
    failed: 1,
    items: []
  }));
  return nextRun;
}

module.exports = {
  drainAmbassadorReplayQueue,
  enqueueAmbassadorReplayDrain,
  ensureAmbassadorAllocationResources,
  getAmbassadorAllocationWalletResources,
  hasEnoughAmbassadorAllocationResources,
  listAmbassadorWalletsWithPendingAllocations,
  replayPendingAmbassadorAllocationsByWallet
};
