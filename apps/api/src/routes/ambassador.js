const express = require('express');
const { pool } = require('../db/pool');
const { loadAmbassadorCabinetDb } = require('../db/queries/ambassadorCabinet');
const {
  getAmbassadorBySlug,
  getAmbassadorByWallet,
  setAmbassadorSlug
} = require('../db/queries/ambassadors');
const {
  getWithdrawalEventByTxHash,
  readAmbassadorDashboardOnChain
} = require('../services/ambassador/controller');
const { reconcilePurchase } = require('../services/ambassador/reconcilePurchase');
const { syncAmbassador } = require('../services/ambassador/sync');
const {
  enqueueAmbassadorReplayDrain,
  getAmbassadorAllocationWalletResources,
  hasEnoughAmbassadorAllocationResources,
  replayPendingAmbassadorAllocationsByWallet
} = require('../services/ambassador/replayQueue');
const env = require('../config/env');

const router = express.Router();

function normalizeWallet(value) {
  return String(value || '').trim();
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
}

function normalizeTxid(value) {
  return String(value || '').trim().toLowerCase();
}

function readAdminToken(req) {
  const authHeader = normalizeWallet(req.headers.authorization);

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return normalizeWallet(authHeader.slice(7));
  }

  return (
    normalizeWallet(req.headers['x-admin-token']) ||
    normalizeWallet(req.query.adminToken) ||
    normalizeWallet(req.body?.adminToken)
  );
}

function requireAdminToken(req, res, next) {
  const expected = normalizeWallet(env.ADMIN_SYNC_TOKEN);

  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: 'ADMIN_SYNC_TOKEN is not configured'
    });
  }

  const received = readAdminToken(req);

  if (!received || received !== expected) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized'
    });
  }

  return next();
}

function isValidTronAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value || '').trim());
}

function buildReferralLink(slug) {
  const normalized = normalizeSlug(slug);
  return normalized ? `https://4teen.me/?r=${normalized}` : '';
}

function normalizeHash(value) {
  const text = String(value || '').trim();
  return text ? text.toLowerCase() : '';
}

function buildDbFallbackSummary(wallet, ambassador, dbSummary) {
  if (!ambassador) {
    return {
      ambassador_wallet: wallet,
      slug: dbSummary.slug || null,
      exists_on_chain: false,
      active: false,
      effective_level: '0',
      reward_percent: '0',
      created_at_chain: null,
      self_registered: false,
      manual_assigned: false,
      override_enabled: false,
      current_level: '0',
      override_level: '0',
      slug_hash: null,
      meta_hash: null,
      total_buyers: '0',
      buyers_count: String(dbSummary.buyers_count || 0),
      total_volume_sun: '0',
      total_rewards_accrued_sun: '0',
      total_rewards_claimed_sun: '0',
      claimable_rewards_sun: '0',
      ...dbSummary
    };
  }

  return {
    ambassador_wallet: ambassador.ambassador_wallet || wallet,
    slug: ambassador.slug || dbSummary.slug || null,
    exists_on_chain: Boolean(ambassador.exists_on_chain),
    active: Boolean(ambassador.active),
    self_registered: Boolean(ambassador.self_registered),
    manual_assigned: Boolean(ambassador.manual_assigned),
    override_enabled: Boolean(ambassador.override_enabled),
    current_level: String(ambassador.current_level || '0'),
    override_level: String(ambassador.override_level || '0'),
    effective_level: String(ambassador.effective_level || '0'),
    reward_percent: String(ambassador.reward_percent || '0'),
    slug_hash: ambassador.slug_hash || null,
    meta_hash: ambassador.meta_hash || null,
    created_at_chain: ambassador.created_at_chain == null ? null : String(ambassador.created_at_chain),
    total_buyers: String(ambassador.total_buyers || '0'),
    total_volume_sun: String(ambassador.total_volume_sun || '0'),
    total_rewards_accrued_sun: String(ambassador.total_rewards_accrued_sun || '0'),
    total_rewards_claimed_sun: String(ambassador.total_rewards_claimed_sun || '0'),
    claimable_rewards_sun: String(ambassador.claimable_rewards_sun || '0'),
    ...dbSummary
  };
}

function publicErrorMessage(error, fallback) {
  const message = String(error?.message || '').trim();
  return message || error?.code || error?.name || fallback;
}

router.get('/slug/check', async (req, res) => {
  try {
    const slug = normalizeSlug(req.query.slug);

    if (!slug) {
      return res.status(400).json({
        ok: false,
        error: 'slug is required'
      });
    }

    const existing = await getAmbassadorBySlug(slug);

    return res.json({
      ok: true,
      slug,
      available: !existing
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/by-wallet', async (req, res) => {
  try {
    const wallet = normalizeWallet(req.query.wallet);

    if (!wallet) {
      return res.status(400).json({
        ok: false,
        error: 'wallet is required'
      });
    }

    let ambassador = await getAmbassadorByWallet(wallet);

    if (!ambassador || !ambassador.exists_on_chain) {
      try {
        await syncAmbassador(wallet);
      } catch (_) {}
      ambassador = await getAmbassadorByWallet(wallet);
    }

    if (!ambassador || !ambassador.exists_on_chain) {
      return res.status(404).json({
        ok: false,
        error: 'Ambassador not found'
      });
    }

    return res.json({
      ok: true,
      registered: true,
      result: {
        wallet: ambassador.ambassador_wallet,
        slug: ambassador.slug || '',
        status: ambassador.active ? 'active' : 'inactive',
        referralLink: ambassador.slug ? buildReferralLink(ambassador.slug) : ''
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/register-complete', async (req, res) => {
  try {
    const wallet = normalizeWallet(req.body?.wallet);
    const slug = normalizeSlug(req.body?.slug);
    const requestedSlugHash = normalizeHash(req.body?.slugHash);

    if (!wallet) {
      return res.status(400).json({
        ok: false,
        error: 'wallet is required'
      });
    }

    if (!isValidTronAddress(wallet)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid TRON address'
      });
    }

    if (!slug) {
      return res.status(400).json({
        ok: false,
        error: 'slug is required'
      });
    }

    const existingBySlug = await getAmbassadorBySlug(slug);

    if (
      existingBySlug &&
      String(existingBySlug.ambassador_wallet || '').toLowerCase() !== wallet.toLowerCase()
    ) {
      return res.status(409).json({
        ok: false,
        error: 'Slug is already taken'
      });
    }

    await syncAmbassador(wallet);

    const ambassador = await getAmbassadorByWallet(wallet);

    if (!ambassador || !ambassador.exists_on_chain) {
      return res.status(400).json({
        ok: false,
        error: 'Ambassador was not found on chain after registration'
      });
    }

    const storedSlugHash = normalizeHash(ambassador.slug_hash);

    if (requestedSlugHash && storedSlugHash && storedSlugHash !== requestedSlugHash) {
      return res.status(409).json({
        ok: false,
        error: 'slugHash mismatch with on-chain ambassador profile'
      });
    }

    const updated = await setAmbassadorSlug(wallet, slug);

    return res.json({
      ok: true,
      result: {
        wallet,
        slug: updated?.slug || slug,
        status: ambassador.active ? 'active' : 'inactive',
        referralLink: buildReferralLink(updated?.slug || slug)
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/after-buy', async (req, res) => {
  try {
    const txHash = normalizeTxid(req.body?.txHash);
    const buyerWallet = normalizeWallet(req.body?.buyerWallet);
    const slug = normalizeSlug(req.body?.slug);

    if (!txHash) {
      return res.status(400).json({
        ok: false,
        error: 'txHash is required'
      });
    }

    if (!buyerWallet) {
      return res.status(400).json({
        ok: false,
        error: 'buyerWallet is required'
      });
    }

    if (!isValidTronAddress(buyerWallet)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid TRON address'
      });
    }

    if (!slug) {
      return res.status(400).json({
        ok: false,
        error: 'slug is required'
      });
    }

    const result = await reconcilePurchase(txHash, {
      buyerWallet,
      slug
    });

    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/cabinet/:wallet', async (req, res) => {
  try {
    const wallet = normalizeWallet(req.params.wallet);

    if (!wallet) {
      return res.status(400).json({ ok: false, error: 'wallet is required' });
    }

    if (!isValidTronAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'invalid TRON address' });
    }

    const limit = req.query.limit;
    const offset = req.query.offset;
    const [onChainResult, dbResult] = await Promise.all([
      readAmbassadorDashboardOnChain(wallet).catch((error) => ({ error })),
      loadAmbassadorCabinetDb(wallet, { limit, offset }).catch((error) => ({ error }))
    ]);
    const dbError = dbResult?.error || null;
    const onChainError = onChainResult?.error || null;

    if (dbError) {
      console.error('[4TEEN API] ambassador cabinet DB read failed:', dbError);
    }

    if (onChainError) {
      console.error('[4TEEN API] ambassador cabinet on-chain read failed:', onChainError);
    }

    const db = dbError ? null : dbResult;
    const onChain = onChainError ? null : onChainResult;
    const dbAmbassador = db?.ambassador || null;

    if (!onChain?.exists && !dbAmbassador?.exists_on_chain) {
      return res.status(404).json({
        ok: false,
        error: 'Ambassador not found'
      });
    }

    const slug = normalizeSlug(dbAmbassador?.slug || db?.summary?.slug || '');
    const onChainSummary = onChain?.summary || null;
    const summary = {
      ...(onChainSummary || buildDbFallbackSummary(wallet, dbAmbassador, db?.summary || {})),
      slug: slug || onChainSummary?.slug || null,
      ...(db?.summary || {})
    };

    if (onChainSummary) {
      Object.assign(summary, {
        ambassador_wallet: wallet,
        exists_on_chain: onChainSummary.exists_on_chain,
        active: onChainSummary.active,
        effective_level: onChainSummary.effective_level,
        reward_percent: onChainSummary.reward_percent,
        created_at_chain: onChainSummary.created_at_chain,
        self_registered: onChainSummary.self_registered,
        manual_assigned: onChainSummary.manual_assigned,
        override_enabled: onChainSummary.override_enabled,
        current_level: onChainSummary.current_level,
        override_level: onChainSummary.override_level,
        slug_hash: onChainSummary.slug_hash,
        meta_hash: onChainSummary.meta_hash,
        total_buyers: onChainSummary.total_buyers,
        buyers_count: onChainSummary.buyers_count || onChainSummary.total_buyers,
        total_volume_sun: onChainSummary.total_volume_sun,
        total_rewards_accrued_sun: onChainSummary.total_rewards_accrued_sun,
        total_rewards_claimed_sun: onChainSummary.total_rewards_claimed_sun,
        claimable_rewards_sun: onChainSummary.claimable_rewards_sun,
        level_progress_current_level: onChainSummary.level_progress_current_level,
        level_progress_buyers_count: onChainSummary.level_progress_buyers_count,
        level_next_threshold: onChainSummary.level_next_threshold,
        level_remaining_to_next: onChainSummary.level_remaining_to_next
      });
    }

    const profile = {
      wallet,
      slug,
      status: summary.active === false ? 'inactive' : 'active',
      referralLink: buildReferralLink(slug)
    };

    res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');

    return res.json({
      ok: true,
      result: {
        profile,
        summary,
        buyersRows: db?.buyers?.rows || [],
        purchasesRows: db?.purchases?.rows || [],
        pendingRows: db?.pending?.rows || [],
        buyersTotal: Number(db?.buyers?.total || summary.buyers_count || summary.total_buyers || 0),
        purchasesTotal: Number(db?.purchases?.total || 0),
        pendingTotal: Number(db?.pending?.total || 0),
        source: {
          onChain: Boolean(onChainSummary),
          db: Boolean(db),
          dbError: dbError ? publicErrorMessage(dbError, 'Database read failed') : null,
          onChainError: onChainError ? publicErrorMessage(onChainError, 'On-chain read failed') : null
        }
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/allocation/health', async (_req, res) => {
  try {
    const resourceState = await hasEnoughAmbassadorAllocationResources().catch(() => null);
    const resources = await getAmbassadorAllocationWalletResources().catch(() => null);

    return res.json({
      ok: true,
      result: {
        operatorWallet: String(env.OPERATOR_WALLET || '').trim() || null,
        resources,
        resourceState
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/replay-pending', async (req, res) => {
  try {
    const wallet = normalizeWallet(req.body?.wallet);
    const feeLimitSun = req.body?.feeLimitSun;

    if (!wallet) {
      return res.status(400).json({ ok: false, error: 'wallet is required' });
    }

    if (!isValidTronAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'invalid TRON address' });
    }

    const result = await replayPendingAmbassadorAllocationsByWallet(wallet, {
      feeLimitSun:
        feeLimitSun === undefined || feeLimitSun === null ? undefined : Number(feeLimitSun)
    });

    return res.json({
      ok: true,
      result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/admin/process-pending', requireAdminToken, async (req, res) => {
  try {
    const limit = req.body?.limit ?? req.query?.limit;
    const result = await enqueueAmbassadorReplayDrain(limit);
    const resourceState = await hasEnoughAmbassadorAllocationResources().catch(() => null);

    return res.json({
      ok: true,
      result,
      resourceState
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/withdrawal/confirm', async (req, res) => {
  try {
    const wallet = normalizeWallet(req.body?.wallet);
    const txid = normalizeTxid(req.body?.txid);

    if (!wallet) {
      return res.status(400).json({ ok: false, error: 'wallet is required' });
    }

    if (!isValidTronAddress(wallet)) {
      return res.status(400).json({ ok: false, error: 'invalid TRON address' });
    }

    if (!txid) {
      return res.status(400).json({ ok: false, error: 'txid is required' });
    }

    const event = await getWithdrawalEventByTxHash(txid);

    if (event.ambassadorWallet !== wallet) {
      return res.status(400).json({
        ok: false,
        error: 'Withdrawal transaction does not belong to the provided wallet'
      });
    }

    const insertResult = await pool.query(
      `
        INSERT INTO ambassador_reward_withdrawals (
          ambassador_wallet,
          amount_sun,
          tx_hash,
          block_time
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tx_hash)
        DO NOTHING
        RETURNING
          id,
          ambassador_wallet,
          amount_sun,
          tx_hash,
          block_time,
          created_at
      `,
      [event.ambassadorWallet, event.amountSun, event.txHash, event.blockTime]
    );

    return res.json({
      ok: true,
      result: {
        wallet,
        txid: event.txHash,
        amountSun: event.amountSun,
        blockTime: event.blockTime,
        inserted: insertResult.rowCount > 0
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message
    });
  }
});

module.exports = router;
