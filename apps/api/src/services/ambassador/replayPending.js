const { pool } = require('../../db/pool');
const { upsertBuyerBinding } = require('../../db/queries/buyerBindings');
const { applyAllocationResult, getReplayablePendingPurchases } = require('../../db/queries/purchases');
const {
  getAllocationEventByTxHash,
  getBuyerAmbassador,
  isPurchaseProcessed,
  recordVerifiedPurchase
} = require('./controller');
const { ensureAmbassadorAllocationResources } = require('./resourceGate');
const { syncAmbassador } = require('./sync');

function toErrorMessage(error) {
  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return 'Unknown error';
}

async function replayPendingPurchaseRow(row) {
  const purchaseId = String(row.purchase_id || '').trim();
  const buyerWallet = String(row.buyer_wallet || '').trim();
  const ambassadorWallet = String(row.resolved_ambassador_wallet || '').trim();
  const purchaseTxHash = String(row.tx_hash || '').trim().toLowerCase();

  if (!purchaseId || !buyerWallet || !ambassadorWallet) {
    throw new Error('Pending purchase row is incomplete');
  }

  const resourceProvision = await ensureAmbassadorAllocationResources({
    buyerWallet,
    ambassadorWallet,
    txHash: purchaseTxHash
  });

  if (!resourceProvision.resourceState?.hasEnough) {
    return {
      ok: false,
      deferred: true,
      reason: 'Allocation wallet resources are still below the safe floor.',
      resourceState: resourceProvision.resourceState,
      rentalResult: resourceProvision.rentalResult || null
    };
  }

  const alreadyProcessed = await isPurchaseProcessed(purchaseId);

  if (alreadyProcessed) {
    return {
      ok: true,
      skipped: true,
      reason: 'Purchase is already processed on-chain',
      resourceState: resourceProvision.resourceState,
      rentalResult: resourceProvision.rentalResult || null
    };
  }

  const allocationTxHash = await recordVerifiedPurchase({
    purchaseId,
    buyerWallet,
    ambassadorCandidate: ambassadorWallet,
    purchaseAmountSun: row.purchase_amount_sun,
    ownerShareSun: row.owner_share_sun
  });

  const allocationEvent = await getAllocationEventByTxHash(allocationTxHash).catch(() => null);

  if (allocationEvent) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await applyAllocationResult(
        {
          ...allocationEvent,
          purchaseTxHash,
          allocationAt: allocationEvent.blockTime
        },
        client
      );

      const boundAmbassadorWallet =
        (await getBuyerAmbassador(buyerWallet).catch(() => null)) || allocationEvent.ambassadorWallet;

      if (allocationTxHash && boundAmbassadorWallet) {
        await upsertBuyerBinding(
          {
            buyerWallet,
            ambassadorWallet: boundAmbassadorWallet,
            oldAmbassadorWallet: null,
            bindingAt: row.token_block_time || allocationEvent.blockTime,
            source: 'pending_replay_allocation',
            eventName: 'BuyerBound',
            bindingTxHash: allocationTxHash
          },
          client
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  await syncAmbassador(ambassadorWallet).catch(() => null);

  return {
    ok: true,
    txHash: allocationTxHash,
    allocationEvent,
    resourceState: resourceProvision.resourceState,
    rentalResult: resourceProvision.rentalResult || null
  };
}

async function replayPendingPurchases({ wallet, limit = 10, dryRun = false }) {
  const rows = await getReplayablePendingPurchases(wallet, limit);
  const items = [];

  for (const row of rows) {
    if (dryRun) {
      items.push({
        purchaseId: row.purchase_id,
        ok: true,
        skipped: true,
        reason: 'dry-run'
      });
      continue;
    }

    try {
      const result = await replayPendingPurchaseRow(row);
      items.push({
        purchaseId: row.purchase_id,
        ok: Boolean(result?.ok),
        skipped: Boolean(result?.skipped),
        deferred: Boolean(result?.deferred),
        reason: result?.reason || null,
        result
      });

      if (result?.deferred) {
        break;
      }
    } catch (error) {
      items.push({
        purchaseId: row.purchase_id,
        ok: false,
        error: toErrorMessage(error)
      });
    }
  }

  return {
    wallet,
    totalFound: rows.length,
    attempted: items.length,
    succeeded: items.filter((item) => item.ok && !item.skipped).length,
    failed: items.filter((item) => !item.ok).length,
    skipped: items.filter((item) => item.skipped).length,
    deferred: items.some((item) => item.deferred),
    items
  };
}

module.exports = {
  replayPendingPurchases
};
