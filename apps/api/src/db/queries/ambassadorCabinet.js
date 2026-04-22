const { pool } = require('../pool');

function clampLimit(value, fallback = 100, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function clampOffset(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function toText(value, fallback = '0') {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function addBig(a, b) {
  return (BigInt(toText(a)) + BigInt(toText(b))).toString();
}

function calcAmbassadorRewardSun(ownerShareSun, rewardPercent) {
  const owner = BigInt(toText(ownerShareSun, '0'));
  const percent = BigInt(String(rewardPercent == null ? 0 : rewardPercent));
  return ((owner * percent) / 100n).toString();
}

function getEffectiveRewardSun(row, rewardPercent) {
  if (row.controller_processed && row.controller_reward_sun != null) {
    return toText(row.controller_reward_sun, '0');
  }

  return calcAmbassadorRewardSun(row.owner_share_sun, rewardPercent);
}

function isoDate(value) {
  return value ? new Date(value).toISOString() : null;
}

async function getAmbassadorDb(wallet) {
  const result = await pool.query(
    `
      SELECT
        ambassador_wallet,
        slug,
        exists_on_chain,
        active,
        self_registered,
        manual_assigned,
        override_enabled,
        current_level,
        override_level,
        effective_level,
        reward_percent,
        slug_hash,
        meta_hash,
        created_at_chain,
        total_buyers,
        total_volume_sun,
        total_rewards_accrued_sun,
        total_rewards_claimed_sun,
        claimable_rewards_sun,
        last_chain_sync_at
      FROM ambassadors
      WHERE lower(ambassador_wallet) = lower($1)
      LIMIT 1
    `,
    [wallet]
  );

  return result.rows[0] || null;
}

async function getAttributedAndProcessedPurchases(wallet) {
  const result = await pool.query(
    `
      SELECT
        id,
        tx_hash,
        purchase_id,
        buyer_wallet,
        purchase_amount_sun,
        owner_share_sun,
        controller_reward_sun,
        controller_owner_part_sun,
        controller_level,
        token_amount_raw,
        token_block_number,
        token_block_time,
        resolved_ambassador_wallet,
        controller_processed,
        controller_processed_tx_hash,
        controller_processed_at,
        status,
        binding_at_used,
        created_at,
        updated_at
      FROM purchases
      WHERE lower(resolved_ambassador_wallet) = lower($1)
        AND status IN ('processed', 'attributed')
      ORDER BY token_block_time DESC NULLS LAST, id DESC
    `,
    [wallet]
  );

  return result.rows;
}

async function getLatestBuyerBindings(wallet) {
  const result = await pool.query(
    `
      SELECT DISTINCT ON (buyer_wallet)
        buyer_wallet,
        ambassador_wallet,
        binding_at,
        source,
        event_name,
        old_ambassador_wallet,
        new_ambassador_wallet,
        created_at,
        updated_at
      FROM buyer_bindings
      WHERE lower(ambassador_wallet) = lower($1)
      ORDER BY buyer_wallet, binding_at DESC NULLS LAST, created_at DESC
    `,
    [wallet]
  );

  return new Map(result.rows.map((row) => [row.buyer_wallet, row]));
}

function mapPurchase(row, rewardPercent) {
  return {
    id: String(row.id),
    tx_hash: row.tx_hash,
    purchase_id: row.purchase_id,
    buyer_wallet: row.buyer_wallet,
    purchase_amount_sun: toText(row.purchase_amount_sun),
    owner_share_sun: toText(row.owner_share_sun),
    ambassador_reward_sun: getEffectiveRewardSun(row, rewardPercent),
    reward_percent: String(rewardPercent),
    controller_owner_part_sun:
      row.controller_owner_part_sun == null ? null : toText(row.controller_owner_part_sun),
    controller_level: row.controller_level == null ? null : Number(row.controller_level),
    token_amount_raw: row.token_amount_raw == null ? null : String(row.token_amount_raw),
    token_block_number: row.token_block_number == null ? null : String(row.token_block_number),
    token_block_time: isoDate(row.token_block_time),
    resolved_ambassador_wallet: row.resolved_ambassador_wallet,
    controller_processed: Boolean(row.controller_processed),
    controller_processed_tx_hash: row.controller_processed_tx_hash,
    controller_processed_at: isoDate(row.controller_processed_at),
    status: row.status,
    binding_at_used: isoDate(row.binding_at_used),
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at)
  };
}

function buildDbSummary(ambassador, purchases, rewardPercent) {
  let processedCount = 0;
  let attributedCount = 0;
  let buyersTotalPurchaseAmountSun = '0';
  let buyersProcessedPurchaseAmountSun = '0';
  let buyersPendingPurchaseAmountSun = '0';
  let buyersTotalRewardSun = '0';
  let buyersProcessedRewardSun = '0';
  let buyersPendingRewardSun = '0';
  const buyerSet = new Set();

  for (const row of purchases) {
    const purchaseAmountSun = toText(row.purchase_amount_sun);
    const rewardSun = getEffectiveRewardSun(row, rewardPercent);

    buyerSet.add(row.buyer_wallet);
    buyersTotalPurchaseAmountSun = addBig(buyersTotalPurchaseAmountSun, purchaseAmountSun);
    buyersTotalRewardSun = addBig(buyersTotalRewardSun, rewardSun);

    if (row.status === 'processed' || row.controller_processed) {
      processedCount += 1;
      buyersProcessedPurchaseAmountSun = addBig(buyersProcessedPurchaseAmountSun, purchaseAmountSun);
      buyersProcessedRewardSun = addBig(buyersProcessedRewardSun, rewardSun);
    } else {
      attributedCount += 1;
      buyersPendingPurchaseAmountSun = addBig(buyersPendingPurchaseAmountSun, purchaseAmountSun);
      buyersPendingRewardSun = addBig(buyersPendingRewardSun, rewardSun);
    }
  }

  return {
    slug: ambassador?.slug || null,
    last_chain_sync_at: ambassador?.last_chain_sync_at
      ? new Date(ambassador.last_chain_sync_at).toISOString()
      : null,
    processed_count: processedCount,
    attributed_count: attributedCount,
    unattributed_count: 0,
    buyers_count: buyerSet.size,
    buyers_total_purchase_amount_sun: buyersTotalPurchaseAmountSun,
    buyers_processed_purchase_amount_sun: buyersProcessedPurchaseAmountSun,
    buyers_pending_purchase_amount_sun: buyersPendingPurchaseAmountSun,
    buyers_total_reward_sun: buyersTotalRewardSun,
    buyers_processed_reward_sun: buyersProcessedRewardSun,
    buyers_pending_reward_sun: buyersPendingRewardSun
  };
}

function buildBuyerRows(wallet, purchases, bindings, rewardPercent, limit, offset) {
  const grouped = new Map();

  for (const row of purchases) {
    const buyerWallet = row.buyer_wallet;
    const purchaseAmountSun = toText(row.purchase_amount_sun);
    const ownerShareSun = toText(row.owner_share_sun);
    const rewardSun = getEffectiveRewardSun(row, rewardPercent);
    const tokenBlockTime = isoDate(row.token_block_time);

    if (!grouped.has(buyerWallet)) {
      const binding = bindings.get(buyerWallet) || null;

      grouped.set(buyerWallet, {
        buyer_wallet: buyerWallet,
        ambassador_wallet: wallet,
        binding_at: isoDate(binding?.binding_at),
        purchase_count: 0,
        total_purchase_amount_sun: '0',
        total_owner_share_sun: '0',
        total_reward_amount_sun: '0',
        processed_purchase_count: 0,
        processed_purchase_amount_sun: '0',
        processed_reward_amount_sun: '0',
        pending_purchase_count: 0,
        pending_purchase_amount_sun: '0',
        pending_reward_amount_sun: '0',
        first_attributed_purchase_at: tokenBlockTime,
        last_attributed_purchase_at: tokenBlockTime,
        created_at: isoDate(binding?.created_at),
        updated_at: isoDate(binding?.updated_at)
      });
    }

    const item = grouped.get(buyerWallet);

    item.purchase_count += 1;
    item.total_purchase_amount_sun = addBig(item.total_purchase_amount_sun, purchaseAmountSun);
    item.total_owner_share_sun = addBig(item.total_owner_share_sun, ownerShareSun);
    item.total_reward_amount_sun = addBig(item.total_reward_amount_sun, rewardSun);

    if (!item.first_attributed_purchase_at || (tokenBlockTime && tokenBlockTime < item.first_attributed_purchase_at)) {
      item.first_attributed_purchase_at = tokenBlockTime;
    }

    if (!item.last_attributed_purchase_at || (tokenBlockTime && tokenBlockTime > item.last_attributed_purchase_at)) {
      item.last_attributed_purchase_at = tokenBlockTime;
    }

    if (row.status === 'processed' || row.controller_processed) {
      item.processed_purchase_count += 1;
      item.processed_purchase_amount_sun = addBig(item.processed_purchase_amount_sun, purchaseAmountSun);
      item.processed_reward_amount_sun = addBig(item.processed_reward_amount_sun, rewardSun);
    } else {
      item.pending_purchase_count += 1;
      item.pending_purchase_amount_sun = addBig(item.pending_purchase_amount_sun, purchaseAmountSun);
      item.pending_reward_amount_sun = addBig(item.pending_reward_amount_sun, rewardSun);
    }
  }

  const rows = Array.from(grouped.values()).sort((a, b) => {
    const left = a.last_attributed_purchase_at || '';
    const right = b.last_attributed_purchase_at || '';
    return right.localeCompare(left);
  });

  return {
    total: rows.length,
    rows: rows.slice(offset, offset + limit)
  };
}

async function loadAmbassadorCabinetDb(wallet, options = {}) {
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);
  const [ambassador, purchases, bindings] = await Promise.all([
    getAmbassadorDb(wallet),
    getAttributedAndProcessedPurchases(wallet),
    getLatestBuyerBindings(wallet)
  ]);
  const rewardPercent = Number(ambassador?.reward_percent || options.rewardPercent || 0);
  const summary = buildDbSummary(ambassador, purchases, rewardPercent);
  const buyers = buildBuyerRows(wallet, purchases, bindings, rewardPercent, limit, offset);
  const mappedPurchases = purchases.map((row) => mapPurchase(row, rewardPercent));
  const pendingRows = mappedPurchases.filter((row) => row.status === 'attributed');

  return {
    ambassador,
    summary,
    buyers,
    purchases: {
      total: mappedPurchases.length,
      rows: mappedPurchases.slice(offset, offset + limit)
    },
    pending: {
      total: pendingRows.length,
      rows: pendingRows.slice(offset, offset + limit)
    }
  };
}

module.exports = {
  loadAmbassadorCabinetDb
};
