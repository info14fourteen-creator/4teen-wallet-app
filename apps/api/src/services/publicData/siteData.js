const crypto = require('crypto');

const env = require('../../config/env');
const { pool } = require('../../db/pool');
const { ensureTelegramAirdropTables, PLATFORM_TELEGRAM } = require('../airdrop/telegramClaims');
const {
  getAmbassadorAllocationWalletResources,
  hasEnoughAmbassadorAllocationResources
} = require('../ambassador/resourceGate');
const { getGasStationRuntimeState } = require('../gasstation/gasStation');
const { proxyRequest } = require('../proxy/apiProxy');

const SITE_SNAPSHOT_AMBASSADOR = 'ambassador_summary_v1';
const SITE_SNAPSHOT_AIRDROP = 'airdrop_summary_v1';
const SITE_SNAPSHOT_MARKET_PRICE = 'market_price_v1';
const SITE_PUBLIC_SCHEMA_LOCK_KEY = 14014042;

const AIRDROP_TOKEN_DECIMALS = 6;
const AIRDROP_TOTAL_ALLOCATION_RAW = BigInt(1_500_000) * BigInt(10 ** AIRDROP_TOKEN_DECIMALS);
const AIRDROP_ISSUE_TS = 1763865465;
const AIRDROP_VAULT_CONTRACT = env.AIRDROP_VAULT_CONTRACT || 'TV6eXKWCsZ15c3Svz39mRQWtBsqvNNBwpQ';
const FOURTEEN_CONTROLLER_CONTRACT =
  env.FOURTEEN_CONTROLLER_CONTRACT || 'TF8yhohRfMxsdVRr7fFrYLh5fxK8sAFkeZ';
const FOURTEEN_TOKEN_CONTRACT = env.FOURTEEN_TOKEN_CONTRACT || 'TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A';

const AIRDROP_WAVE_TIMES = [
  1765075065,
  1772851065,
  1780627065,
  1788403065,
  1796179065,
  1803955065
];

const AIRDROP_WAVE_CAPS = [500_000, 350_000, 250_000, 180_000, 120_000, 100_000];
const AIRDROP_PLATFORM_ROUTES = [
  {
    key: 'telegram',
    title: 'Telegram',
    bit: 4,
    status: 'Live now',
    note: 'Wallet session, bot state, and on-chain claim state are already wired in the mobile app.',
    href: 'https://t.me/fourteentoken'
  },
  {
    key: 'instagram',
    title: 'Instagram',
    bit: 1,
    status: 'Rollout placeholder',
    note: 'Route exists in the contract mask model, but the live claim flow is not open yet.',
    href: 'https://instagram.com/fourteentoken'
  },
  {
    key: 'x',
    title: 'X',
    bit: 2,
    status: 'Rollout placeholder',
    note: 'Route exists in the contract mask model, but the live claim flow is not open yet.',
    href: 'https://x.com/4teen_me'
  },
  {
    key: 'facebook',
    title: 'Facebook',
    bit: 8,
    status: 'Rollout placeholder',
    note: 'Route exists in the contract mask model, but the live claim flow is not open yet.',
    href: 'https://facebook.com/Fourteentoken'
  },
  {
    key: 'youtube',
    title: 'YouTube',
    bit: 16,
    status: 'Rollout placeholder',
    note: 'Route exists in the contract mask model, but the live claim flow is not open yet.',
    href: 'https://www.youtube.com/@4teentoken'
  }
];

const PUBLIC_ICONS = {
  FOURTEEN:
    'https://static.tronscan.org/production/upload/logo/new/TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A.png',
  TRX: 'https://static.tronscan.org/production/upload/logo/TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR.png',
  USDT: 'https://static.tronscan.org/production/logo/usdtlogo.png'
};

const TRX_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const USDT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const ROUTER_UNIVERSAL_URL = 'https://rot.endjgfsv.link/swap/routerUniversal';
const ONE_4TEEN_RAW = '1000000';

let ensureSiteSnapshotTablePromise = null;

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest();
}

function base58Encode(input) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = BigInt(`0x${input.toString('hex')}`);
  let output = '';

  while (value > 0) {
    const remainder = Number(value % BigInt(58));
    output = alphabet[remainder] + output;
    value /= BigInt(58);
  }

  for (const byte of input) {
    if (byte !== 0) break;
    output = `1${output}`;
  }

  return output || '1';
}

function tronHexToBase58(rawHex) {
  const clean = String(rawHex || '').replace(/^0x/i, '').trim();
  const addressHex = clean.length >= 40 ? `41${clean.slice(-40)}` : clean;
  const payload = Buffer.from(addressHex, 'hex');
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return base58Encode(Buffer.concat([payload, checksum]));
}

function normalizeHex(result) {
  return String(result || '').replace(/^0x/i, '').trim();
}

function hexToBigInt(hex) {
  const clean = normalizeHex(hex);
  return clean ? BigInt(`0x${clean}`) : BigInt(0);
}

function hexToSignedNumber(hex) {
  const clean = normalizeHex(hex);
  if (!clean) return 0;

  const value = BigInt(`0x${clean}`);
  const bits = BigInt(clean.length * 4);
  const signBit = BigInt(1) << (bits - BigInt(1));
  const signed = value >= signBit ? value - (BigInt(1) << bits) : value;
  return Number(signed);
}

function splitWords(hex) {
  const clean = normalizeHex(hex);
  const words = [];

  for (let index = 0; index < clean.length; index += 64) {
    words.push(clean.slice(index, index + 64));
  }

  return words.filter(Boolean);
}

function formatTokenAmount(rawValue, decimals = AIRDROP_TOKEN_DECIMALS) {
  const normalized = Number(rawValue) / Math.pow(10, decimals);
  if (!Number.isFinite(normalized) || normalized <= 0) return '0';

  return normalized.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

function formatUtcLabel(unixSeconds) {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return 'No next wave';
  }

  return (
    new Date(unixSeconds * 1000).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'UTC'
    }) + ' UTC'
  );
}

function formatTimestampLabel(timestampMs) {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return 'No confirmed claim yet';
  }

  return (
    new Date(timestampMs).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'UTC'
    }) + ' UTC'
  );
}

function buildWaveStatus(currentWave, number) {
  if (currentWave >= 0 && number === currentWave + 1) return 'current';
  if (currentWave >= 0 && number < currentWave + 1) return 'unlocked';
  return 'upcoming';
}

function jsonParseSafe(value) {
  if (!value) return null;

  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (_) {
    return null;
  }
}

async function ensureSiteSnapshotTable() {
  if (!ensureSiteSnapshotTablePromise) {
    ensureSiteSnapshotTablePromise = (async () => {
      const client = await pool.connect();

      try {
        await client.query('SELECT pg_advisory_lock($1)', [SITE_PUBLIC_SCHEMA_LOCK_KEY]);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS site_public_snapshots (
            snapshot_key TEXT PRIMARY KEY,
            payload_json JSONB NOT NULL,
            source TEXT NOT NULL DEFAULT 'live',
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_error TEXT
          )
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_site_public_snapshots_expires_at
            ON site_public_snapshots (expires_at)
        `);
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [SITE_PUBLIC_SCHEMA_LOCK_KEY]).catch(() => null);
        client.release();
      }
    })().catch((error) => {
      ensureSiteSnapshotTablePromise = null;
      throw error;
    });
  }

  await ensureSiteSnapshotTablePromise;
}

async function readSnapshot(snapshotKey) {
  await ensureSiteSnapshotTable();

  const result = await pool.query(
    `
      SELECT snapshot_key, payload_json, source, fetched_at, expires_at, updated_at, last_error
      FROM site_public_snapshots
      WHERE snapshot_key = $1
      LIMIT 1
    `,
    [snapshotKey]
  );

  return result.rows[0] || null;
}

async function writeSnapshot({ snapshotKey, payload, source, ttlSeconds, lastError = null }) {
  await ensureSiteSnapshotTable();

  const result = await pool.query(
    `
      INSERT INTO site_public_snapshots (
        snapshot_key,
        payload_json,
        source,
        fetched_at,
        expires_at,
        updated_at,
        last_error
      )
      VALUES ($1, $2::jsonb, $3, NOW(), NOW() + ($4 * INTERVAL '1 second'), NOW(), $5)
      ON CONFLICT (snapshot_key)
      DO UPDATE SET
        payload_json = EXCLUDED.payload_json,
        source = EXCLUDED.source,
        fetched_at = EXCLUDED.fetched_at,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW(),
        last_error = EXCLUDED.last_error
      RETURNING snapshot_key, payload_json, source, fetched_at, expires_at, updated_at, last_error
    `,
    [snapshotKey, JSON.stringify(payload), source, Math.max(30, Number(ttlSeconds) || 120), lastError]
  );

  return result.rows[0] || null;
}

function rowToSnapshotResponse(row, stale) {
  return {
    ok: true,
    stale: Boolean(stale),
    source: row?.source || 'cache',
    fetchedAt: row?.fetched_at ? new Date(row.fetched_at).toISOString() : null,
    expiresAt: row?.expires_at ? new Date(row.expires_at).toISOString() : null,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    lastError: row?.last_error || null,
    snapshot: jsonParseSafe(row?.payload_json)
  };
}

async function getCachedOrRefresh({ snapshotKey, ttlSeconds, source, build }) {
  const cached = await readSnapshot(snapshotKey);
  const now = Date.now();
  const cachedExpiresAt = cached?.expires_at ? new Date(cached.expires_at).getTime() : 0;
  const isFresh = cached && cachedExpiresAt > now;

  if (isFresh) {
    return rowToSnapshotResponse(cached, false);
  }

  try {
    const payload = await build();
    const saved = await writeSnapshot({
      snapshotKey,
      payload,
      source,
      ttlSeconds,
      lastError: null
    });
    return rowToSnapshotResponse(saved, false);
  } catch (error) {
    if (cached) {
      return rowToSnapshotResponse(
        {
          ...cached,
          last_error: error instanceof Error ? error.message : String(error)
        },
        true
      );
    }

    throw error;
  }
}

function buildRouterQuoteUrl(toTokenAddress) {
  return (
    `${ROUTER_UNIVERSAL_URL}?fromToken=${encodeURIComponent(FOURTEEN_TOKEN_CONTRACT)}` +
    `&toToken=${encodeURIComponent(toTokenAddress)}` +
    `&amountIn=${encodeURIComponent(ONE_4TEEN_RAW)}` +
    '&typeList=&includeUnverifiedV4Hook=true'
  );
}

function findAmountOutDeep(input) {
  if (!input || typeof input !== 'object') return null;

  const priorityKeys = [
    'amountOut',
    'amountOutStr',
    'toAmount',
    'toTokenAmount',
    'outputAmount',
    'amountOutMin'
  ];

  for (const key of priorityKeys) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '') {
      return input[key];
    }
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      const nested = findAmountOutDeep(item);
      if (nested !== null) return nested;
    }
    return null;
  }

  for (const value of Object.values(input)) {
    if (value && typeof value === 'object') {
      const nested = findAmountOutDeep(value);
      if (nested !== null) return nested;
    }
  }

  return null;
}

function quoteToNumber(value, decimals) {
  const raw = String(value || '').trim();
  if (!raw) return NaN;

  if (/^\d+$/.test(raw)) {
    return Number(raw) / Math.pow(10, decimals);
  }

  const asNumber = Number(raw.replace(/,/g, ''));
  if (Number.isFinite(asNumber)) return asNumber;

  return NaN;
}

function formatPrice(value, decimals = 6) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.000000';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

async function triggerConstant(functionSelector, contractAddress = AIRDROP_VAULT_CONTRACT) {
  const body = JSON.stringify({
    owner_address: contractAddress,
    contract_address: contractAddress,
    function_selector: functionSelector,
    visible: true
  });

  const keys = Array.from(
    new Set(
      [
        env.TRONGRID_API_KEY_1,
        env.TRONGRID_API_KEY_2,
        env.TRONGRID_API_KEY_3,
        env.TRONGRID_API_KEY
      ]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );

  const targets = keys.length ? keys : [''];
  let lastError = null;

  for (const apiKey of targets) {
    try {
      const response = await fetch(`${env.TRON_FULL_HOST.replace(/\/+$/, '')}/wallet/triggerconstantcontract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {})
        },
        body
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${functionSelector}`);
      }

      const json = await response.json();
      const result = json?.constant_result?.[0];
      if (!result) {
        throw new Error(`No constant_result for ${functionSelector}`);
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('triggerConstant failed');
    }
  }

  throw lastError || new Error(`Contract call failed for ${functionSelector}`);
}

async function fetchTrongridJson(path, query) {
  const response = await proxyRequest({
    provider: 'trongrid',
    path,
    query: query || {},
    method: 'GET'
  });

  return jsonParseSafe(response.body);
}

async function fetchRouterQuote(toTokenAddress) {
  const response = await fetch(buildRouterQuoteUrl(toTokenAddress), {
    headers: {
      Accept: 'application/json, text/plain, */*'
    }
  });

  if (!response.ok) {
    throw new Error(`Router request failed: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const amountOut = findAmountOutDeep(payload);

  if (amountOut === null) {
    throw new Error('amountOut not found in router response');
  }

  return String(amountOut).trim();
}

async function buildMarketPriceSnapshot() {
  const [trxRaw, usdtRaw, directPriceRaw] = await Promise.all([
    fetchRouterQuote(TRX_ADDRESS),
    fetchRouterQuote(USDT_ADDRESS),
    triggerConstant('getCurrentPrice()', FOURTEEN_TOKEN_CONTRACT).catch(() =>
      triggerConstant('tokenPrice()', FOURTEEN_TOKEN_CONTRACT)
    )
  ]);

  const dexTrxNumber = quoteToNumber(trxRaw, 6);
  const dexUsdtNumber = quoteToNumber(usdtRaw, 6);
  const directTrxNumber = Number(formatTokenAmount(hexToBigInt(directPriceRaw), 6).replace(/,/g, ''));

  return {
    base: {
      symbol: '4TEEN',
      value: '1.00',
      icon: PUBLIC_ICONS.FOURTEEN
    },
    quotes: [
      {
        symbol: 'TRX',
        value: formatPrice(dexTrxNumber, 2),
        icon: PUBLIC_ICONS.TRX
      },
      {
        symbol: 'USDT',
        value: formatPrice(dexUsdtNumber, 2),
        icon: PUBLIC_ICONS.USDT
      }
    ],
    direct: {
      trx: formatPrice(directTrxNumber, 6)
    },
    dex: {
      trx: formatPrice(dexTrxNumber, 2),
      usdt: formatPrice(dexUsdtNumber, 2)
    },
    updatedAt: new Date().toISOString()
  };
}

async function buildAirdropDbFootprint() {
  await ensureTelegramAirdropTables();

  const [legacyResult, currentResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::INT AS claims_count,
        COALESCE(SUM(reward_amount), 0)::TEXT AS total_reward,
        MAX(claimed_at) AS latest_claim_at
      FROM legacy_telegram_claims
    `),
    pool.query(
      `
        SELECT
          COUNT(*)::INT AS claims_count,
          COALESCE(SUM(reward_amount), 0)::TEXT AS total_reward,
          MAX(sent_at) AS latest_claim_at
        FROM airdrop_claims
        WHERE platform = $1
          AND status = 'sent'
      `,
      [PLATFORM_TELEGRAM]
    )
  ]);

  const legacy = legacyResult.rows[0] || {};
  const current = currentResult.rows[0] || {};

  const legacyClaimsCount = Number(legacy.claims_count || 0);
  const currentClaimsCount = Number(current.claims_count || 0);
  const legacyReward = Number(legacy.total_reward || 0);
  const currentReward = Number(current.total_reward || 0);
  const latestLegacyAt = legacy.latest_claim_at ? new Date(legacy.latest_claim_at).getTime() : 0;
  const latestCurrentAt = current.latest_claim_at ? new Date(current.latest_claim_at).getTime() : 0;

  return {
    claimsCount: legacyClaimsCount + currentClaimsCount,
    claimedWalletsCount: legacyClaimsCount + currentClaimsCount,
    dbDistributedDisplay: (legacyReward + currentReward).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6
    }),
    latestRecordedClaimAt: Math.max(latestLegacyAt, latestCurrentAt),
    legacyClaimsCount,
    currentClaimsCount
  };
}

async function buildAmbassadorDbFootprint() {
  const [purchasesResult, withdrawalsResult, ambassadorsResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE resolved_ambassador_wallet IS NOT NULL
            AND status IN ('processed', 'attributed')
        )::INT AS purchases_total,
        COUNT(*) FILTER (
          WHERE resolved_ambassador_wallet IS NOT NULL
            AND (status = 'processed' OR controller_processed = true)
        )::INT AS purchases_processed,
        COUNT(*) FILTER (
          WHERE resolved_ambassador_wallet IS NOT NULL
            AND status = 'attributed'
            AND COALESCE(controller_processed, false) = false
        )::INT AS purchases_pending,
        COUNT(DISTINCT lower(resolved_ambassador_wallet)) FILTER (
          WHERE resolved_ambassador_wallet IS NOT NULL
            AND status IN ('processed', 'attributed')
        )::INT AS ambassadors_with_purchases,
        COUNT(DISTINCT lower(buyer_wallet)) FILTER (
          WHERE resolved_ambassador_wallet IS NOT NULL
            AND status IN ('processed', 'attributed')
        )::INT AS buyers_total,
        MAX(token_block_time) AS latest_purchase_at
      FROM purchases
    `),
    pool.query(`
      SELECT
        COUNT(*)::INT AS withdrawals_count,
        MAX(block_time) AS latest_withdrawal_at
      FROM ambassador_reward_withdrawals
    `),
    pool.query(`
      SELECT
        COUNT(*)::INT AS profiles_total,
        COUNT(*) FILTER (WHERE exists_on_chain = true)::INT AS profiles_on_chain,
        COUNT(*) FILTER (WHERE exists_on_chain = true AND active = true)::INT AS profiles_active
      FROM ambassadors
    `)
  ]);

  const purchases = purchasesResult.rows[0] || {};
  const withdrawals = withdrawalsResult.rows[0] || {};
  const ambassadors = ambassadorsResult.rows[0] || {};

  return {
    purchasesTotal: Number(purchases.purchases_total || 0),
    purchasesProcessed: Number(purchases.purchases_processed || 0),
    purchasesPending: Number(purchases.purchases_pending || 0),
    ambassadorsWithPurchases: Number(purchases.ambassadors_with_purchases || 0),
    buyersTotal: Number(purchases.buyers_total || 0),
    latestPurchaseAt: purchases.latest_purchase_at
      ? new Date(purchases.latest_purchase_at).getTime()
      : 0,
    withdrawalsCount: Number(withdrawals.withdrawals_count || 0),
    latestWithdrawalAt: withdrawals.latest_withdrawal_at
      ? new Date(withdrawals.latest_withdrawal_at).getTime()
      : 0,
    profilesTotal: Number(ambassadors.profiles_total || 0),
    profilesOnChain: Number(ambassadors.profiles_on_chain || 0),
    profilesActive: Number(ambassadors.profiles_active || 0)
  };
}

async function buildAmbassadorRuntime() {
  const [resourceState, resources, runtime] = await Promise.all([
    hasEnoughAmbassadorAllocationResources().catch(() => null),
    getAmbassadorAllocationWalletResources().catch(() => null),
    getGasStationRuntimeState().catch(() => null)
  ]);

  return {
    operatorWallet: String(env.OPERATOR_WALLET || '').trim() || null,
    requirements: {
      requiredEnergy: Number(env.AMBASSADOR_ALLOCATION_REQUIRED_ENERGY || 0),
      requiredBandwidth: Number(env.AMBASSADOR_ALLOCATION_REQUIRED_BANDWIDTH || 0),
      minEnergyFloor: Number(env.AMBASSADOR_ALLOCATION_MIN_ENERGY_FLOOR || 0),
      minBandwidthFloor: Number(env.AMBASSADOR_ALLOCATION_MIN_BANDWIDTH_FLOOR || 0)
    },
    resourceState,
    resources,
    runtime,
    readyNow: Boolean(resourceState?.hasEnough)
  };
}

async function buildAmbassadorSnapshot() {
  const [systemStatsHex, systemBalancesHex, dbFootprint, allocationRuntime] = await Promise.all([
    triggerConstant('getSystemStats()', FOURTEEN_CONTROLLER_CONTRACT),
    triggerConstant('getSystemBalances()', FOURTEEN_CONTROLLER_CONTRACT),
    buildAmbassadorDbFootprint(),
    buildAmbassadorRuntime()
  ]);

  const [
    ambassadorsCountWord,
    activeAmbassadorsCountWord,
    boundBuyersCountWord,
    trackedVolumeWord,
    rewardsAccruedWord,
    rewardsClaimedWord
  ] = splitWords(systemStatsHex);

  const [
    controllerBalanceWord,
    ownerAvailableBalanceWord,
    reservedRewardsWord,
    unallocatedPurchaseFundsWord
  ] = splitWords(systemBalancesHex);

  const trackedVolumeRaw = hexToBigInt(trackedVolumeWord);
  const rewardsAccruedRaw = hexToBigInt(rewardsAccruedWord);
  const rewardsClaimedRaw = hexToBigInt(rewardsClaimedWord);
  const controllerBalanceRaw = hexToBigInt(controllerBalanceWord);
  const ownerAvailableBalanceRaw = hexToBigInt(ownerAvailableBalanceWord);
  const reservedRewardsRaw = hexToBigInt(reservedRewardsWord);
  const unallocatedPurchaseFundsRaw = hexToBigInt(unallocatedPurchaseFundsWord);

  return {
    contractAddress: FOURTEEN_CONTROLLER_CONTRACT,
    loadedAt: new Date().toISOString(),
    levels: [
      { key: 'bronze', label: 'Bronze', buyersRange: '0-9 buyers', rewardPercent: 10 },
      { key: 'silver', label: 'Silver', buyersRange: '10-99 buyers', rewardPercent: 25 },
      { key: 'gold', label: 'Gold', buyersRange: '100-999 buyers', rewardPercent: 50 },
      { key: 'platinum', label: 'Platinum', buyersRange: '1000+ buyers', rewardPercent: 75 }
    ],
    system: {
      ambassadorsCount: Number(hexToBigInt(ambassadorsCountWord)),
      activeAmbassadorsCount: Number(hexToBigInt(activeAmbassadorsCountWord)),
      boundBuyersCount: Number(hexToBigInt(boundBuyersCountWord)),
      trackedVolumeRaw: trackedVolumeRaw.toString(),
      trackedVolumeDisplay: formatTokenAmount(trackedVolumeRaw),
      rewardsAccruedRaw: rewardsAccruedRaw.toString(),
      rewardsAccruedDisplay: formatTokenAmount(rewardsAccruedRaw),
      rewardsClaimedRaw: rewardsClaimedRaw.toString(),
      rewardsClaimedDisplay: formatTokenAmount(rewardsClaimedRaw),
      controllerBalanceRaw: controllerBalanceRaw.toString(),
      controllerBalanceDisplay: formatTokenAmount(controllerBalanceRaw),
      ownerAvailableBalanceRaw: ownerAvailableBalanceRaw.toString(),
      ownerAvailableBalanceDisplay: formatTokenAmount(ownerAvailableBalanceRaw),
      reservedRewardsRaw: reservedRewardsRaw.toString(),
      reservedRewardsDisplay: formatTokenAmount(reservedRewardsRaw),
      unallocatedPurchaseFundsRaw: unallocatedPurchaseFundsRaw.toString(),
      unallocatedPurchaseFundsDisplay: formatTokenAmount(unallocatedPurchaseFundsRaw)
    },
    db: {
      purchasesTotal: dbFootprint.purchasesTotal,
      purchasesProcessed: dbFootprint.purchasesProcessed,
      purchasesPending: dbFootprint.purchasesPending,
      ambassadorsWithPurchases: dbFootprint.ambassadorsWithPurchases,
      buyersTotal: dbFootprint.buyersTotal,
      withdrawalsCount: dbFootprint.withdrawalsCount,
      profilesTotal: dbFootprint.profilesTotal,
      profilesOnChain: dbFootprint.profilesOnChain,
      profilesActive: dbFootprint.profilesActive,
      latestPurchaseAt: dbFootprint.latestPurchaseAt,
      latestPurchaseLabel: formatTimestampLabel(dbFootprint.latestPurchaseAt),
      latestWithdrawalAt: dbFootprint.latestWithdrawalAt,
      latestWithdrawalLabel: formatTimestampLabel(dbFootprint.latestWithdrawalAt)
    },
    runtime: allocationRuntime
  };
}

async function buildAirdropSnapshot() {
  const [operatorHex, currentWaveHex, nextWaveHex, waveInfoHex, availableNowHex, latestEvent, dbFootprint] =
    await Promise.all([
      triggerConstant('operator()'),
      triggerConstant('currentWave()'),
      triggerConstant('nextWaveTime()'),
      triggerConstant('waveInfo()'),
      triggerConstant('availableToDistributeNow()'),
      fetchTrongridJson(`/v1/contracts/${AIRDROP_VAULT_CONTRACT}/events`, {
        event_name: 'Airdropped',
        only_confirmed: 'true',
        order_by: 'block_timestamp,desc',
        limit: 1
      }),
      buildAirdropDbFootprint()
    ]);

  const currentWave = hexToSignedNumber(currentWaveHex);
  const nextWaveAt = Number(hexToBigInt(nextWaveHex));
  const availableNowRaw = hexToBigInt(availableNowHex);
  const [, unlockedWord, distributedWord, remainingUnlockedWord, vaultBalanceWord] =
    splitWords(waveInfoHex);

  const unlockedRaw = hexToBigInt(unlockedWord);
  const distributedRaw = hexToBigInt(distributedWord);
  const remainingUnlockedRaw = hexToBigInt(remainingUnlockedWord);
  const vaultBalanceRaw = hexToBigInt(vaultBalanceWord);
  const remainingPlannedRaw = AIRDROP_TOTAL_ALLOCATION_RAW - distributedRaw;

  const eventRow = Array.isArray(latestEvent?.data) ? latestEvent.data[0] : null;
  const eventAmountRaw = BigInt(String(eventRow?.result?.amount ?? eventRow?.result?.['1'] ?? '0'));
  const lastClaimAt = Number(eventRow?.block_timestamp || 0);
  const currentWaveNumber = currentWave >= 0 ? currentWave + 1 : 0;

  return {
    contractAddress: AIRDROP_VAULT_CONTRACT,
    currentWave,
    currentWaveLabel: currentWaveNumber > 0 ? `Wave ${currentWaveNumber} of 6` : 'Before Wave 1',
    currentWaveStatus:
      currentWaveNumber > 0
        ? `Wave ${currentWaveNumber} is unlocked by contract time.`
        : 'No wave is unlocked yet.',
    nextWaveAt,
    nextWaveLabel: formatUtcLabel(nextWaveAt),
    availableNowDisplay: formatTokenAmount(availableNowRaw),
    availableNowRaw: availableNowRaw.toString(),
    totalAllocationDisplay: formatTokenAmount(AIRDROP_TOTAL_ALLOCATION_RAW),
    totalAllocationRaw: AIRDROP_TOTAL_ALLOCATION_RAW.toString(),
    unlockedDisplay: formatTokenAmount(unlockedRaw),
    unlockedRaw: unlockedRaw.toString(),
    distributedDisplay: formatTokenAmount(distributedRaw),
    distributedRaw: distributedRaw.toString(),
    remainingUnlockedDisplay: formatTokenAmount(remainingUnlockedRaw),
    remainingUnlockedRaw: remainingUnlockedRaw.toString(),
    remainingPlannedDisplay: formatTokenAmount(remainingPlannedRaw),
    remainingPlannedRaw: remainingPlannedRaw.toString(),
    vaultBalanceDisplay: formatTokenAmount(vaultBalanceRaw),
    vaultBalanceRaw: vaultBalanceRaw.toString(),
    issueDateLabel: formatUtcLabel(AIRDROP_ISSUE_TS),
    operatorAddress: tronHexToBase58(operatorHex),
    platformRoutes: AIRDROP_PLATFORM_ROUTES,
    lastClaimAt,
    lastClaimLabel: formatTimestampLabel(lastClaimAt),
    lastClaimAmountDisplay:
      eventAmountRaw > BigInt(0) ? formatTokenAmount(eventAmountRaw) : '0',
    loadedAt: new Date().toISOString(),
    claimsCount: dbFootprint.claimsCount,
    claimedWalletsCount: dbFootprint.claimedWalletsCount,
    dbDistributedDisplay: dbFootprint.dbDistributedDisplay,
    latestRecordedClaimAt: dbFootprint.latestRecordedClaimAt,
    legacyClaimsCount: dbFootprint.legacyClaimsCount,
    currentClaimsCount: dbFootprint.currentClaimsCount,
    waves: AIRDROP_WAVE_TIMES.map((unlockAt, index) => ({
      capDisplay: formatTokenAmount(
        BigInt(AIRDROP_WAVE_CAPS[index]) * BigInt(10 ** AIRDROP_TOKEN_DECIMALS)
      ),
      capRaw: String(BigInt(AIRDROP_WAVE_CAPS[index]) * BigInt(10 ** AIRDROP_TOKEN_DECIMALS)),
      number: index + 1,
      status: buildWaveStatus(currentWave, index + 1),
      unlockAt,
      unlockLabel: formatUtcLabel(unlockAt)
    }))
  };
}

async function getPublicMarketPriceSnapshot(options = {}) {
  return getCachedOrRefresh({
    snapshotKey: SITE_SNAPSHOT_MARKET_PRICE,
    ttlSeconds: options.ttlSeconds || env.SITE_PUBLIC_MARKET_TTL_SECONDS || 120,
    source: 'market_price_live',
    build: buildMarketPriceSnapshot
  });
}

async function getPublicAmbassadorSnapshot(options = {}) {
  return getCachedOrRefresh({
    snapshotKey: SITE_SNAPSHOT_AMBASSADOR,
    ttlSeconds: options.ttlSeconds || env.SITE_PUBLIC_AMBASSADOR_TTL_SECONDS || 120,
    source: 'ambassador_live',
    build: buildAmbassadorSnapshot
  });
}

async function getPublicAirdropSnapshot(options = {}) {
  return getCachedOrRefresh({
    snapshotKey: SITE_SNAPSHOT_AIRDROP,
    ttlSeconds: options.ttlSeconds || env.SITE_PUBLIC_AIRDROP_TTL_SECONDS || 120,
    source: 'airdrop_live',
    build: buildAirdropSnapshot
  });
}

async function getPublicSiteSummary() {
  const [airdrop, ambassador, marketPrice] = await Promise.all([
    getPublicAirdropSnapshot(),
    getPublicAmbassadorSnapshot(),
    getPublicMarketPriceSnapshot()
  ]);

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    airdrop,
    ambassador,
    marketPrice
  };
}

async function refreshPublicSiteData() {
  const [airdrop, ambassador, marketPrice] = await Promise.allSettled([
    getPublicAirdropSnapshot({ ttlSeconds: 120 }),
    getPublicAmbassadorSnapshot({ ttlSeconds: 120 }),
    getPublicMarketPriceSnapshot({ ttlSeconds: 120 })
  ]);

  return {
    airdrop:
      airdrop.status === 'fulfilled'
        ? { ok: true, stale: airdrop.value.stale, fetchedAt: airdrop.value.fetchedAt }
        : { ok: false, error: airdrop.reason instanceof Error ? airdrop.reason.message : String(airdrop.reason) },
    ambassador:
      ambassador.status === 'fulfilled'
        ? { ok: true, stale: ambassador.value.stale, fetchedAt: ambassador.value.fetchedAt }
        : { ok: false, error: ambassador.reason instanceof Error ? ambassador.reason.message : String(ambassador.reason) },
    marketPrice:
      marketPrice.status === 'fulfilled'
        ? { ok: true, stale: marketPrice.value.stale, fetchedAt: marketPrice.value.fetchedAt }
        : { ok: false, error: marketPrice.reason instanceof Error ? marketPrice.reason.message : String(marketPrice.reason) }
  };
}

module.exports = {
  ensureSiteSnapshotTable,
  getPublicAirdropSnapshot,
  getPublicAmbassadorSnapshot,
  getPublicMarketPriceSnapshot,
  getPublicSiteSummary,
  refreshPublicSiteData
};
