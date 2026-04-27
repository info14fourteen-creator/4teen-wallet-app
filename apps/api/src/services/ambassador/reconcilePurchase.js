const { pool } = require('../../db/pool');
const { getAmbassadorBySlug } = require('../../db/queries/ambassadors');
const { upsertBuyer } = require('../../db/queries/buyers');
const { upsertBuyerBinding } = require('../../db/queries/buyerBindings');
const {
  getPurchaseByTxHash,
  markPurchaseError,
  upsertCandidatePurchase,
  upsertPurchaseFromTokenEvent,
  upsertReconciledPurchase
} = require('../../db/queries/purchases');
const {
  getAllocationEventByTxHash,
  getBuyerAmbassador,
  isPurchaseProcessed,
  recordVerifiedPurchase
} = require('./controller');
const {
  hasEnoughAmbassadorAllocationResources,
  ensureAmbassadorAllocationResources
} = require('./resourceGate');
const { syncAmbassador } = require('./sync');
const { makePurchaseId, waitForBuyEventByTxHash } = require('./token');

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
}

function isValidSlug(value) {
  return /^[a-z0-9_-]{3,24}$/.test(String(value || ''));
}

function toErrorMessage(error) {
  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return 'Unknown error';
}

function isResourceConstraintError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('out of energy') ||
    message.includes('bandwidth') ||
    message.includes('resource') ||
    message.includes('fee limit') ||
    message.includes('safe floor')
  );
}

async function reconcilePurchase(txHash, options = {}) {
  const normalizedTxHash = String(txHash || '').trim().toLowerCase();
  const incomingSlug = isValidSlug(normalizeSlug(options.slug)) ? normalizeSlug(options.slug) : null;
  const existing = await getPurchaseByTxHash(normalizedTxHash);
  const parsed = await waitForBuyEventByTxHash(normalizedTxHash, {
    attempts: 10,
    delayMs: 1500
  });
  const purchaseId = makePurchaseId(normalizedTxHash, parsed.buyerWallet);

  let candidateSlugHash = existing?.candidate_slug_hash || null;
  let candidateAmbassadorWallet = existing?.candidate_ambassador_wallet || null;

  if (!candidateAmbassadorWallet && incomingSlug) {
    const ambassador = await getAmbassadorBySlug(incomingSlug);

    if (ambassador?.ambassador_wallet) {
      candidateAmbassadorWallet = ambassador.ambassador_wallet;
      candidateSlugHash = ambassador.slug_hash || null;
    }
  }

  const alreadyBoundAmbassadorWallet = await getBuyerAmbassador(parsed.buyerWallet);
  const alreadyProcessed = await isPurchaseProcessed(purchaseId);

  let resolvedAmbassadorWallet = alreadyBoundAmbassadorWallet || null;
  let resolutionSource = alreadyBoundAmbassadorWallet ? 'controller_binding' : 'none';
  let controllerTxHash = null;
  let allocationEvent = null;
  let finalStatus = 'detected';
  let processingError = null;
  let bindingAtUsed = null;
  const ambassadorForAllocation = alreadyBoundAmbassadorWallet || candidateAmbassadorWallet || null;
  let resourceState = await hasEnoughAmbassadorAllocationResources().catch(() => null);
  let rentalResult = null;

  if (alreadyProcessed) {
    finalStatus = 'processed';
    resolvedAmbassadorWallet = alreadyBoundAmbassadorWallet || candidateAmbassadorWallet || null;
  } else if (!ambassadorForAllocation) {
    finalStatus = 'awaiting_candidate';
    processingError = 'Buyer is not bound and referral slug was not resolved';
    resolvedAmbassadorWallet = null;
  } else {
    resolutionSource = alreadyBoundAmbassadorWallet ? 'controller_binding' : 'incoming_slug';

    try {
      const ensured = await ensureAmbassadorAllocationResources({
        buyerWallet: parsed.buyerWallet,
        ambassadorWallet: ambassadorForAllocation,
        txHash: normalizedTxHash
      });
      resourceState = ensured.resourceState;
      rentalResult = ensured.rentalResult || null;

      if (!resourceState?.hasEnough) {
        finalStatus = 'attributed';
        processingError = 'Allocation wallet resources are still below the safe floor.';
        resolvedAmbassadorWallet = ambassadorForAllocation;
        bindingAtUsed = parsed.tokenBlockTime;
      } else {
        controllerTxHash = await recordVerifiedPurchase({
          purchaseId,
          buyerWallet: parsed.buyerWallet,
          ambassadorCandidate: ambassadorForAllocation,
          purchaseAmountSun: parsed.purchaseAmountSun,
          ownerShareSun: parsed.ownerShareSun
        });

        allocationEvent = await getAllocationEventByTxHash(controllerTxHash).catch(() => null);
        resolvedAmbassadorWallet =
          (await getBuyerAmbassador(parsed.buyerWallet).catch(() => null)) || ambassadorForAllocation;
        finalStatus = 'processed';
        bindingAtUsed = parsed.tokenBlockTime;
      }
    } catch (error) {
      processingError = toErrorMessage(error);

      if (alreadyBoundAmbassadorWallet || isResourceConstraintError(error)) {
        resolvedAmbassadorWallet = ambassadorForAllocation;
        finalStatus = 'attributed';
        bindingAtUsed = parsed.tokenBlockTime;
      } else {
        resolvedAmbassadorWallet = null;
        finalStatus = 'awaiting_resources';
      }
    }
  }

  const buyerBoundAmbassadorWalletForDb =
    alreadyBoundAmbassadorWallet || (controllerTxHash ? resolvedAmbassadorWallet : null);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await upsertCandidatePurchase(
      {
        txHash: normalizedTxHash,
        purchaseId,
        buyerWallet: parsed.buyerWallet,
        candidateSlugHash: candidateSlugHash || null,
        candidateAmbassadorWallet: candidateAmbassadorWallet || null
      },
      client
    );

    await upsertPurchaseFromTokenEvent(
      {
        txHash: normalizedTxHash,
        purchaseId,
        buyerWallet: parsed.buyerWallet,
        purchaseAmountSun: parsed.purchaseAmountSun,
        ownerShareSun: parsed.ownerShareSun,
        tokenAmountRaw: parsed.tokenAmountRaw,
        tokenBlockNumber: parsed.tokenBlockNumber,
        tokenBlockTime: parsed.tokenBlockTime
      },
      client
    );

    await upsertBuyer(
      {
        buyerWallet: parsed.buyerWallet,
        boundAmbassadorWallet: buyerBoundAmbassadorWalletForDb || null,
        txHash: normalizedTxHash,
        blockTime: parsed.tokenBlockTime
      },
      client
    );

    if (controllerTxHash && resolvedAmbassadorWallet) {
      await upsertBuyerBinding(
        {
          buyerWallet: parsed.buyerWallet,
          ambassadorWallet: resolvedAmbassadorWallet,
          oldAmbassadorWallet: null,
          bindingAt: parsed.tokenBlockTime,
          source: 'after_buy_allocation',
          eventName: 'BuyerBound',
          bindingTxHash: controllerTxHash
        },
        client
      );
    }

    await upsertReconciledPurchase(
      {
        txHash: normalizedTxHash,
        purchaseId,
        buyerWallet: parsed.buyerWallet,
        purchaseAmountSun: parsed.purchaseAmountSun,
        ownerShareSun: parsed.ownerShareSun,
        tokenAmountRaw: parsed.tokenAmountRaw,
        tokenBlockNumber: parsed.tokenBlockNumber,
        tokenBlockTime: parsed.tokenBlockTime,
        candidateSlugHash: candidateSlugHash || null,
        candidateAmbassadorWallet: candidateAmbassadorWallet || null,
        resolvedAmbassadorWallet: resolvedAmbassadorWallet || null,
        controllerProcessed: Boolean(alreadyProcessed || controllerTxHash),
        controllerProcessedTxHash: controllerTxHash || null,
        controllerProcessedAt: controllerTxHash ? new Date().toISOString() : null,
        bindingAtUsed,
        status: finalStatus,
        processingError
      },
      client
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    await markPurchaseError({
      txHash: normalizedTxHash,
      errorMessage: error.message
    });
    throw error;
  } finally {
    client.release();
  }

  if (resolvedAmbassadorWallet) {
    try {
      await syncAmbassador(resolvedAmbassadorWallet);
    } catch (_) {}
  }

  return {
    ok: true,
    txHash: normalizedTxHash,
    purchaseId,
    buyerWallet: parsed.buyerWallet,
    incomingSlug,
    candidateSlugHash: candidateSlugHash || null,
    candidateAmbassadorWallet: candidateAmbassadorWallet || null,
    resolvedAmbassadorWallet: resolvedAmbassadorWallet || null,
    resolutionSource,
    controllerProcessed: Boolean(alreadyProcessed || controllerTxHash),
    controllerTxHash: controllerTxHash || null,
    allocationEvent,
    resourceState,
    rentalResult,
    status: finalStatus,
    processingError
  };
}

module.exports = {
  reconcilePurchase
};
