const { upsertAmbassador } = require('../../db/queries/ambassadors');
const { readAmbassadorDashboardOnChain } = require('./controller');

function toBool(value) {
  return Boolean(value);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toText(value, fallback = '0') {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

async function syncAmbassador(ambassadorWallet) {
  const onChain = await readAmbassadorDashboardOnChain(ambassadorWallet);
  const summary = onChain?.summary || null;

  if (!summary) {
    return null;
  }

  const record = await upsertAmbassador({
    ambassador_wallet: ambassadorWallet,
    slug: null,
    slug_hash: summary.slug_hash || null,
    meta_hash: summary.meta_hash || null,
    exists_on_chain: toBool(summary.exists_on_chain),
    active: toBool(summary.active),
    self_registered: toBool(summary.self_registered),
    manual_assigned: toBool(summary.manual_assigned),
    override_enabled: toBool(summary.override_enabled),
    current_level: toNumber(summary.current_level, 0),
    override_level: toNumber(summary.override_level, 0),
    effective_level: toNumber(summary.effective_level, 0),
    reward_percent: toText(summary.reward_percent, '0'),
    created_at_chain: toNumber(summary.created_at_chain, 0),
    total_buyers: toText(summary.total_buyers, '0'),
    total_volume_sun: toText(summary.total_volume_sun, '0'),
    total_rewards_accrued_sun: toText(summary.total_rewards_accrued_sun, '0'),
    total_rewards_claimed_sun: toText(summary.total_rewards_claimed_sun, '0'),
    claimable_rewards_sun: toText(summary.claimable_rewards_sun, '0'),
    last_chain_sync_at: new Date().toISOString()
  });

  return {
    ok: true,
    ambassadorWallet,
    record
  };
}

module.exports = {
  syncAmbassador
};
