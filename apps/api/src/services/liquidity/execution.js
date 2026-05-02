const { TronWeb } = require('tronweb');
const env = require('../../config/env');
const { rentResourcesForWallet } = require('../gasstation/gasStation');
const { getRuntimeState, setRuntimeState } = require('../ops/store');
const { recordOpsEvent, resolveOpsEvent } = require('../ops/events');

const LIQUIDITY_DAILY_STATE_KEY = 'liquidity.daily';
const LIQUIDITY_DAILY_FINGERPRINT = 'liquidity:daily_failed';
const TRON_DERIVATION_HEADERS = (() => {
  const apiKey =
    env.TRONGRID_API_KEY ||
    env.TRONGRID_API_KEY_1 ||
    env.TRONGRID_API_KEY_2 ||
    env.TRONGRID_API_KEY_3;

  return apiKey
    ? {
        'TRON-PRO-API-KEY': apiKey
      }
    : undefined;
})();

const BOOTSTRAPPER_ABI = [
  {
    inputs: [],
    name: 'bootstrapAndExecute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

function isEnabled() {
  return String(env.LIQUIDITY_AUTOMATION_ENABLED || '')
    .trim()
    .toLowerCase()
    .includes('true');
}

function getManagerWallet() {
  return String(env.LIQUIDITY_MANAGER_WALLET || env.OPERATOR_WALLET || '').trim();
}

function getManagerPrivateKey() {
  return String(
    env.LIQUIDITY_MANAGER_WALLET_PRIVATE_KEY ||
      env.OPERATOR_WALLET_PRIVATE_KEY ||
      env.MANAGER_WALLET_PRIVATE_KEY ||
      env.TRON_PRIVATE_KEY ||
      ''
  ).trim();
}

function createManagerTronWeb() {
  return new TronWeb({
    fullHost: env.TRON_FULL_HOST,
    headers: TRON_DERIVATION_HEADERS,
    privateKey: getManagerPrivateKey(),
  });
}

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function shouldAttemptToday(now = new Date()) {
  const scheduledHour = Math.max(0, Math.min(23, Number(env.LIQUIDITY_DAILY_HOUR_UTC || 0)));
  return now.getUTCHours() >= scheduledHour;
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTxInfo(tronWeb, txid, { attempts = 45, delayMs = 4000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const info = await tronWeb.trx.getTransactionInfo(txid).catch(() => null);

    if (info && (info.id || info.receipt)) {
      return info;
    }

    await wait(delayMs);
  }

  throw new Error(`Timeout waiting for liquidity tx confirmation: ${txid}`);
}

async function getWalletResources(wallet) {
  const tronWeb = createManagerTronWeb();
  const [accountResult, resourcesResult, balanceResult] = await Promise.allSettled([
    tronWeb.trx.getAccount(wallet),
    tronWeb.trx.getAccountResources(wallet),
    tronWeb.trx.getBalance(wallet),
  ]);

  const account = accountResult.status === 'fulfilled' ? accountResult.value : null;
  const resources = resourcesResult.status === 'fulfilled' ? resourcesResult.value : null;
  const balanceSun =
    balanceResult.status === 'fulfilled' && Number.isFinite(Number(balanceResult.value || 0))
      ? Number(balanceResult.value || 0)
      : 0;

  const freeNetLimit = Number(account?.freeNetLimit || 0);
  const freeNetUsed = Number(account?.freeNetUsed || 0);
  const netLimit = Number(account?.NetLimit || 0);
  const netUsed = Number(account?.NetUsed || 0);
  const energyLimit = Number(resources?.EnergyLimit || 0);
  const energyUsed = Number(resources?.EnergyUsed || 0);

  return {
    wallet,
    balanceSun,
    availableEnergy: Math.max(0, energyLimit - energyUsed),
    availableBandwidth: Math.max(0, freeNetLimit - freeNetUsed) + Math.max(0, netLimit - netUsed),
  };
}

function buildRentalPlan(snapshot) {
  const requiredEnergy = Math.max(0, Number(env.LIQUIDITY_REQUIRED_ENERGY || 0));
  const requiredBandwidth = Math.max(0, Number(env.LIQUIDITY_REQUIRED_BANDWIDTH || 0));
  const shortEnergy = Math.max(0, requiredEnergy - Number(snapshot.availableEnergy || 0));
  const shortBandwidth = Math.max(0, requiredBandwidth - Number(snapshot.availableBandwidth || 0));

  return {
    requiredEnergy,
    requiredBandwidth,
    shortEnergy,
    shortBandwidth,
    needsRental: shortEnergy > 0 || shortBandwidth > 0,
  };
}

async function maybeRentManagerResources(wallet) {
  const before = await getWalletResources(wallet);
  const plan = buildRentalPlan(before);

  if (!plan.needsRental) {
    return {
      rented: false,
      before,
      after: before,
      plan,
      rental: null,
    };
  }

  const rental = await rentResourcesForWallet({
    receiveAddress: wallet,
    energyNum: plan.shortEnergy,
    bandwidthNum: plan.shortBandwidth,
    requestPrefix: 'liquidity-execute',
    context: {
      purpose: 'liquidity_execute',
      wallet,
    },
  });

  const after = await getWalletResources(wallet);

  return {
    rented: true,
    before,
    after,
    plan,
    rental,
  };
}

async function sendLiquidityExecution(wallet) {
  const privateKey = getManagerPrivateKey();

  if (!wallet) {
    throw new Error('LIQUIDITY_MANAGER_WALLET is missing');
  }

  if (!privateKey) {
    throw new Error('LIQUIDITY_MANAGER_WALLET_PRIVATE_KEY is missing');
  }

  const tronWeb = createManagerTronWeb();
  const contract = await tronWeb.contract(
    BOOTSTRAPPER_ABI,
    String(env.LIQUIDITY_BOOTSTRAPPER_CONTRACT || '').trim()
  );

  const rawResult = await contract.bootstrapAndExecute().send({
    feeLimit: Number(env.LIQUIDITY_FEE_LIMIT_SUN || 220_000_000),
    callValue: 0,
    shouldPollResponse: false,
  });

  const txid =
    typeof rawResult === 'string'
      ? rawResult
      : String(
          rawResult?.txid ||
            rawResult?.txID ||
            rawResult?.transaction?.txID ||
            rawResult?.id ||
            ''
        ).trim();

  if (!txid) {
    throw new Error('Liquidity transaction sent but txid was not returned');
  }

  const txInfo = await waitForTxInfo(tronWeb, txid);
  const receiptResult = String(txInfo?.receipt?.result || '').trim() || 'UNKNOWN';

  return {
    txid,
    receiptResult,
    txInfo,
    tronscanUrl: `https://tronscan.org/#/transaction/${txid}`,
  };
}

async function writeDailyState(value) {
  return setRuntimeState(LIQUIDITY_DAILY_STATE_KEY, value);
}

async function runLiquidityDaily(input = {}) {
  const now = input.now instanceof Date ? input.now : new Date();
  const today = utcDateKey(now);

  if (!isEnabled()) {
    return {
      attempted: false,
      skipped: true,
      reason: 'disabled',
      today,
    };
  }

  if (!shouldAttemptToday(now)) {
    return {
      attempted: false,
      skipped: true,
      reason: 'before_window',
      today,
    };
  }

  const currentState = await getRuntimeState(LIQUIDITY_DAILY_STATE_KEY).catch(() => null);
  const currentValue = currentState?.value_json || {};

  if (currentValue?.day === today) {
    return {
      attempted: false,
      skipped: true,
      reason: 'already_processed_today',
      today,
      status: currentValue?.status || 'unknown',
    };
  }

  const wallet = getManagerWallet();
  const startedAt = new Date().toISOString();

  try {
    const resources = await maybeRentManagerResources(wallet);
    const execution = await sendLiquidityExecution(wallet);

    const result = {
      day: today,
      status: execution.receiptResult === 'SUCCESS' ? 'success' : 'submitted',
      wallet,
      startedAt,
      finishedAt: new Date().toISOString(),
      txid: execution.txid,
      tronscanUrl: execution.tronscanUrl,
      receiptResult: execution.receiptResult,
      resources,
    };

    await writeDailyState(result);
    await resolveOpsEvent({
      source: 'liquidity',
      category: 'execution',
      type: 'daily_failed',
      fingerprint: LIQUIDITY_DAILY_FINGERPRINT,
      message: 'Liquidity daily execution recovered.',
    }).catch(() => null);

    return {
      attempted: true,
      ok: execution.receiptResult === 'SUCCESS',
      today,
      ...result,
    };
  } catch (error) {
    const failure = {
      day: today,
      status: 'failed',
      wallet,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };

    await writeDailyState(failure).catch(() => null);
    await recordOpsEvent({
      source: 'liquidity',
      category: 'execution',
      type: 'daily_failed',
      severity: 'error',
      title: 'Liquidity daily execution failed',
      message: failure.error,
      fingerprint: LIQUIDITY_DAILY_FINGERPRINT,
      details: failure,
    }).catch(() => null);

    return {
      attempted: true,
      ok: false,
      today,
      ...failure,
    };
  }
}

module.exports = {
  runLiquidityDaily,
};
