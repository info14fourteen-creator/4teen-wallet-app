const express = require('express');
const { pool } = require('../db/pool');
const { loadAmbassadorCabinetDb } = require('../db/queries/ambassadorCabinet');
const {
  getWithdrawalEventByTxHash,
  readAmbassadorDashboardOnChain
} = require('../services/ambassador/controller');

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

function isValidTronAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value || '').trim());
}

function buildReferralLink(slug) {
  const normalized = normalizeSlug(slug);
  return normalized ? `https://4teen.me/?ref=${normalized}` : '';
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

    // Contract fields are authoritative and must win over DB sync snapshots.
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
        total_volume_sun: onChainSummary.total_volume_sun,
        total_rewards_accrued_sun: onChainSummary.total_rewards_accrued_sun,
        total_rewards_claimed_sun: onChainSummary.total_rewards_claimed_sun,
        claimable_rewards_sun: onChainSummary.claimable_rewards_sun
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
