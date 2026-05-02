const env = require('../../config/env');
const { getWalletSnapshot } = require('../proxy/walletSnapshot');
const { getEnergyResalePackage } = require('../gasstation/energyResale');
const { recordOpsEvent, resolveOpsEvent } = require('./events');
const { getRuntimeState, setRuntimeState } = require('./store');
const { getAirdropResourceSignal, getAmbassadorResourceSignal } = require('./resourceSignals');

const SCREENERS_STATE_KEY = 'screeners.last_run';
const SCREENERS_MIN_INTERVAL_MS = 15 * 60 * 1000;

let inflightPromise = null;

function normalizeValue(value) {
  return String(value || '').trim();
}

function isValidTronAddress(value) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizeValue(value));
}

function pickProbeWallet() {
  const preferred = normalizeValue(env.OPERATOR_WALLET);
  if (isValidTronAddress(preferred)) {
    return preferred;
  }

  const fallback = normalizeValue(env.AIRDROP_CONTROL_WALLET);
  if (isValidTronAddress(fallback)) {
    return fallback;
  }

  throw new Error('Probe wallet is not configured');
}

function buildCounts(items) {
  const counts = {
    total: items.length,
    ok: 0,
    warn: 0,
    fail: 0
  };

  items.forEach((item) => {
    if (item.status === 'ok') counts.ok += 1;
    else if (item.status === 'warn') counts.warn += 1;
    else counts.fail += 1;
  });

  return {
    ...counts,
    healthy: counts.warn === 0 && counts.fail === 0
  };
}

function buildEventTitle(item) {
  if (item.status === 'warn') {
    return `${item.label} просел`;
  }

  return `${item.label} сломался`;
}

function buildEventMessage(item) {
  return [item.summary, item.recommendation].filter(Boolean).join(' ');
}

async function syncScreenerEvent(item, trigger) {
  const fingerprint = `screener:${item.key}`;

  if (item.status === 'ok') {
    await resolveOpsEvent({
      source: 'screeners',
      category: 'flow',
      type: item.key,
      fingerprint,
      message: `${item.label} снова проходит проверку.`,
      details: {
        trigger,
        checkedAt: item.checkedAt,
        durationMs: item.durationMs,
        summary: item.summary,
        meta: item.meta || null
      },
      notifyOnResolve: true
    }).catch(() => null);
    return;
  }

  await recordOpsEvent({
    source: 'screeners',
    category: 'flow',
    type: item.key,
    severity: item.status === 'warn' ? 'warning' : 'error',
    title: buildEventTitle(item),
    message: buildEventMessage(item),
    fingerprint,
    details: {
      trigger,
      checkedAt: item.checkedAt,
      durationMs: item.durationMs,
      status: item.status,
      label: item.label,
      summary: item.summary,
      recommendation: item.recommendation,
      meta: item.meta || null
    }
  }).catch(() => null);
}

function formatNumber(value, digits = 2) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return '0';
  }

  return numeric.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

async function runWalletMarketPipeline() {
  const address = pickProbeWallet();
  const snapshot = await getWalletSnapshot(address);
  const trxBalance = Number(snapshot?.trx?.balanceTrx || 0);
  const price = Number(snapshot?.trx?.priceInUsd || 0);
  const tokens = Array.isArray(snapshot?.trc20Assets) ? snapshot.trc20Assets.length : 0;

  if (!Number.isFinite(trxBalance) || !Number.isFinite(price) || price <= 0) {
    throw new Error('Wallet snapshot came back incomplete');
  }

  return {
    status: 'ok',
    summary: `Кошелёк и рынок читаются: ${formatNumber(trxBalance, 4)} TRX, цена TRX $${formatNumber(price, 4)}, токенов ${tokens}.`,
    recommendation: 'Если этот тест падает, у пользователя обычно ломается домашний экран кошелька или рынок.',
    meta: {
      walletAddress: address,
      trxBalance,
      priceInUsd: price,
      tokens
    }
  };
}

async function runAmbassadorEnergyQuoteFlow() {
  const requiredEnergy = Math.max(1, Number(env.GASSTATION_REGISTRATION_ENERGY || 100000));
  const quote = await getEnergyResalePackage('ambassador_registration', {
    requiredEnergy,
    requiredBandwidth: 0
  });

  const amountSun = String(quote?.amountSun || '').trim();
  const readyEnergy = Number(quote?.readyEnergy || quote?.energyQuantity || 0);

  if (!isValidTronAddress(quote?.paymentAddress) || !/^\d+$/.test(amountSun) || BigInt(amountSun) <= 0n) {
    throw new Error('Energy quote returned invalid payment data');
  }

  if (!Number.isFinite(readyEnergy) || readyEnergy <= 0) {
    throw new Error('Energy quote returned zero ready energy');
  }

  return {
    status: 'ok',
    summary: `Quote на energy готов: режим ${normalizeValue(quote?.mode) || 'unknown'}, цена ${normalizeValue(quote?.amountTrx) || '0'} TRX, ready energy ${readyEnergy}.`,
    recommendation: 'Если этот тест падает, регистрация ambassador с докупкой energy начнёт сыпаться ещё до отправки транзакции.',
    meta: {
      mode: normalizeValue(quote?.mode) || null,
      amountTrx: normalizeValue(quote?.amountTrx) || null,
      paymentAddress: quote?.paymentAddress || null,
      readyEnergy,
      requiredEnergy
    }
  };
}

async function runTelegramAirdropFlow() {
  const resourceState = await getAirdropResourceSignal();
  const energyAvailable = Number(resourceState?.energyAvailable || 0);
  const bandwidthAvailable = Number(resourceState?.bandwidthAvailable || 0);
  const probe = resourceState?._probe || {};
  const freshness = probe.stale ? ' по кэшу' : '';

  if (!resourceState || !isValidTronAddress(resourceState.walletAddress)) {
    if (probe.rateLimited) {
      return {
        status: 'warn',
        summary: 'Airdrop probe поставлен на паузу после 429. Жду cooldown и не долблю провайдеров повторно.',
        recommendation: 'Бот держит паузу, чтобы не насиловать проект. Если нужно, смотрим последний clock/runtime-state.',
        meta: {
          probe
        }
      };
    }

    throw new Error(probe.lastError || 'Airdrop wallet state is unavailable');
  }

  if (resourceState.hasEnough === false) {
    return {
      status: 'warn',
      summary: `Airdrop flow${freshness} под давлением: energy ${energyAvailable}, bandwidth ${bandwidthAvailable}.`,
      recommendation: 'Пополните ресурсы airdrop-кошелька, иначе Telegram claim начнут вставать в очередь или падать.',
      meta: {
        ...resourceState,
        probe
      }
    };
  }

  return {
    status: 'ok',
    summary: `Airdrop flow${freshness} держится: energy ${energyAvailable}, bandwidth ${bandwidthAvailable}.`,
    recommendation: 'Если этот тест позже пожелтеет, пользователи первыми это заметят на Telegram airdrop.',
    meta: {
      ...resourceState,
      probe
    }
  };
}

async function runAmbassadorAllocationFlow() {
  const resourceState = await getAmbassadorResourceSignal();
  const energyAvailable = Number(resourceState?.energyAvailable || 0);
  const bandwidthAvailable = Number(resourceState?.bandwidthAvailable || 0);
  const probe = resourceState?._probe || {};
  const freshness = probe.stale ? ' по кэшу' : '';

  if (!resourceState || !isValidTronAddress(resourceState.walletAddress)) {
    if (probe.rateLimited) {
      return {
        status: 'warn',
        summary: 'Ambassador probe поставлен на паузу после 429. Жду cooldown и не долблю ресурсы повторно.',
        recommendation: 'Бот бережёт провайдеров и проект. Для живой картины можно открыть последний runtime-state/clock.',
        meta: {
          probe
        }
      };
    }

    throw new Error(probe.lastError || 'Ambassador allocation state is unavailable');
  }

  if (resourceState.hasEnough === false) {
    return {
      status: 'warn',
      summary: `Ambassador allocation${freshness} под давлением: energy ${energyAvailable}, bandwidth ${bandwidthAvailable}.`,
      recommendation: 'Проверьте operator wallet, иначе аллокации и replay для ambassador начнут откладываться.',
      meta: {
        ...resourceState,
        probe
      }
    };
  }

  return {
    status: 'ok',
    summary: `Ambassador allocation${freshness} держится: energy ${energyAvailable}, bandwidth ${bandwidthAvailable}.`,
    recommendation: 'Если этот тест пожелтеет, покупки будут проходить, а аллокации могут залипать уже в фоне.',
    meta: {
      ...resourceState,
      probe
    }
  };
}

const SCREENERS = [
  {
    key: 'wallet_market_pipeline',
    label: 'Кошелёк и рынок',
    run: runWalletMarketPipeline
  },
  {
    key: 'ambassador_energy_quote',
    label: 'Energy quote для ambassador',
    run: runAmbassadorEnergyQuoteFlow
  },
  {
    key: 'telegram_airdrop_flow',
    label: 'Telegram airdrop flow',
    run: runTelegramAirdropFlow
  },
  {
    key: 'ambassador_allocation_flow',
    label: 'Ambassador allocation flow',
    run: runAmbassadorAllocationFlow
  }
];

async function executeScreener(definition) {
  const startedAt = Date.now();

  try {
    const outcome = await definition.run();
    return {
      key: definition.key,
      label: definition.label,
      status: outcome?.status === 'warn' ? 'warn' : 'ok',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      summary: normalizeValue(outcome?.summary) || 'Проверка прошла без деталей.',
      recommendation: normalizeValue(outcome?.recommendation),
      meta: outcome?.meta || null
    };
  } catch (error) {
    return {
      key: definition.key,
      label: definition.label,
      status: 'fail',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      summary: error instanceof Error ? error.message : String(error),
      recommendation: 'Здесь уже сломан сам сценарий. Стоит открыть связанный раздел и проверить провайдеров, ресурсы и конфиг.',
      meta: null
    };
  }
}

function normalizeScreenerState(value) {
  const safe = value && typeof value === 'object' ? value : {};
  const items = Array.isArray(safe.items) ? safe.items : [];
  const summary = safe.summary && typeof safe.summary === 'object'
    ? safe.summary
    : buildCounts(items);

  return {
    trigger: normalizeValue(safe.trigger) || 'unknown',
    checkedAt: normalizeValue(safe.checkedAt) || '',
    durationMs: Number(safe.durationMs || 0),
    items,
    summary: {
      total: Number(summary.total || items.length || 0),
      ok: Number(summary.ok || 0),
      warn: Number(summary.warn || 0),
      fail: Number(summary.fail || 0),
      healthy:
        typeof summary.healthy === 'boolean'
          ? summary.healthy
          : Number(summary.warn || 0) === 0 && Number(summary.fail || 0) === 0
    }
  };
}

async function getSyntheticScreenerSnapshot() {
  const state = await getRuntimeState(SCREENERS_STATE_KEY).catch(() => null);
  return normalizeScreenerState(state?.value_json || {});
}

async function runSyntheticScreeners(trigger = 'interval', options = {}) {
  if (inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = (async () => {
    const force = options?.force === true;
    const existing = await getSyntheticScreenerSnapshot().catch(() => null);
    const lastCheckedAt = new Date(existing?.checkedAt || 0).getTime();

    if (
      !force &&
      Number.isFinite(lastCheckedAt) &&
      lastCheckedAt > 0 &&
      Date.now() - lastCheckedAt < SCREENERS_MIN_INTERVAL_MS
    ) {
      return {
        ...(existing || normalizeScreenerState({})),
        skipped: true
      };
    }

    const startedAt = Date.now();
    const items = [];

    for (const definition of SCREENERS) {
      const item = await executeScreener(definition);
      items.push(item);
      await syncScreenerEvent(item, trigger);
    }

    const snapshot = {
      trigger: normalizeValue(trigger) || 'unknown',
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      items,
      summary: buildCounts(items)
    };

    await setRuntimeState(SCREENERS_STATE_KEY, snapshot).catch(() => null);

    return snapshot;
  })();

  try {
    return await inflightPromise;
  } finally {
    inflightPromise = null;
  }
}

module.exports = {
  getSyntheticScreenerSnapshot,
  runSyntheticScreeners
};
