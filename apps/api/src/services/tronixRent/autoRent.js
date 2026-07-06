const env = require('../../config/env');
const { tronWeb } = require('../tron/client');
const {
  createEnergyQuote,
  createEnergyOrder,
  createFrontedEnergyOrder,
  getEnergyOrder,
  submitEnergyOrderPayment,
  isEnabled: isTronixRentEnabled
} = require('./client');

const SUN = 1_000_000n;
const DEFAULT_DURATION_SECONDS = 3600;
const DEFAULT_CONFIRM_ATTEMPTS = 12;
const DEFAULT_CONFIRM_DELAY_MS = 5000;

function normalizeValue(value) {
  return String(value || '').trim();
}

function normalizeResourceAmount(value) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.ceil(parsed);
}

function normalizeSunAmount(value) {
  const raw = String(value || '0').trim();

  if (!/^\d+$/.test(raw)) {
    return 0n;
  }

  return BigInt(raw);
}

function normalizeDurationSeconds(value) {
  const parsed = Number(value || env.TRONIX_RENT_DEFAULT_DURATION_SECONDS || DEFAULT_DURATION_SECONDS);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DURATION_SECONDS;
  }

  return Math.floor(parsed);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveOperatorFundingConfig() {
  return {
    wallet: normalizeValue(env.OPERATOR_WALLET),
    privateKey: normalizeValue(
      env.OPERATOR_WALLET_PRIVATE_KEY ||
      env.MANAGER_WALLET_PRIVATE_KEY ||
      env.TRON_PRIVATE_KEY
    ),
    label: 'operator_wallet'
  };
}

function resolveAirdropFundingConfig() {
  const wallet = normalizeValue(env.AIRDROP_CONTROL_WALLET);
  const privateKey = normalizeValue(env.AIRDROP_CONTROL_WALLET_PRIVATE_KEY);

  if (!wallet || !privateKey) {
    return null;
  }

  return {
    wallet,
    privateKey,
    label: 'airdrop_control_wallet'
  };
}

function resolveFundingConfig(context = {}) {
  if (normalizeValue(context.purpose).toLowerCase() === 'airdrop_send') {
    return resolveAirdropFundingConfig() || resolveOperatorFundingConfig();
  }

  return resolveOperatorFundingConfig();
}

function shouldUseFrontedOrder(context = {}) {
  const purpose = normalizeValue(context.purpose).toLowerCase();
  const settlement = normalizeValue(context.settlement || context.settlementType).toLowerCase();

  return (
    context.fronted === true ||
    settlement === 'fronted' ||
    purpose === 'liquidity_execute'
  );
}

function shouldRequireFrontedOrder(context = {}) {
  const purpose = normalizeValue(context.purpose).toLowerCase();
  const settlement = normalizeValue(context.settlement || context.settlementType).toLowerCase();

  return (
    context.fronted === true ||
    settlement === 'fronted' ||
    purpose === 'liquidity_execute'
  );
}

async function rentResourcesWithFrontedOrder({
  receiveAddress,
  energyNum,
  bandwidthNum,
  durationSeconds,
  requestPrefix,
  context = {}
}) {
  const receiverAddress = normalizeValue(receiveAddress);
  const energyAmount = normalizeResourceAmount(energyNum);
  const bandwidthAmount = normalizeResourceAmount(bandwidthNum);

  if (!receiverAddress) {
    const error = new Error('receiveAddress is required for TronixRent fronted rental');
    error.status = 400;
    throw error;
  }

  if (energyAmount <= 0 && bandwidthAmount <= 0) {
    return {
      mode: 'tronix_fronted',
      provider: 'tronix_rent',
      skipped: true,
      reason: 'no resources requested',
      receiveAddress: receiverAddress
    };
  }

  const result = await createFrontedEnergyOrder({
    receiverAddress,
    energyAmount,
    bandwidthAmount,
    durationSeconds: normalizeDurationSeconds(durationSeconds),
    settlementType: normalizeValue(context.settlementType) || normalizeValue(context.purpose) || 'wallet-internal',
    metadata: {
      requestPrefix: normalizeValue(requestPrefix) || null,
      context
    }
  });
  const order = result?.order || result;
  const quote = result?.quote || {};

  return {
    mode: 'tronix_fronted',
    provider: 'tronix_rent',
    requestPrefix: normalizeValue(requestPrefix) || null,
    receiveAddress: receiverAddress,
    fundingWallet: null,
    fundingLabel: 'internal_fronted',
    quoteId: quote.quoteId || null,
    orderId: order.orderId || null,
    paymentAddress: null,
    paymentAmountSun: '0',
    paymentAmountTrx: '0',
    paymentTxHash: null,
    paymentStatus: order.paymentStatus || 'fronted',
    fulfillmentStatus: order.fulfillmentStatus || null,
    providerCode: order.providerCode || null,
    providerOrderId: order.providerOrderId || null,
    providerTxHash: order.providerTxHash || null,
    energyAmount: order.energyAmount || quote.energyAmount || energyAmount,
    bandwidthAmount: order.bandwidthAmount || quote.bandwidthAmount || bandwidthAmount,
    route: quote.route || null,
    latestOrder: order,
    context
  };
}

async function sendTrxPayment({ funding, toAddress, amountSun }) {
  if (!funding?.wallet || !funding?.privateKey) {
    const error = new Error('TronixRent funding wallet is not configured');
    error.status = 503;
    throw error;
  }

  const amount = normalizeSunAmount(amountSun);
  const fundingWallet = normalizeValue(funding.wallet);
  const paymentAddress = normalizeValue(toAddress);

  if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    const error = new Error('TronixRent payment amount is invalid');
    error.status = 400;
    error.details = { amountSun: amount.toString() };
    throw error;
  }

  if (fundingWallet && paymentAddress && fundingWallet === paymentAddress) {
    const error = new Error('TronixRent paid order would transfer TRX to the same account');
    error.status = 409;
    error.details = {
      fundingWallet,
      paymentAddress
    };
    throw error;
  }

  const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
    toAddress,
    Number(amount),
    funding.wallet
  );
  const signedTx = await tronWeb.trx.sign(unsignedTx, funding.privateKey);
  const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!broadcast?.result) {
    const error = new Error('Failed to pay TronixRent order');
    error.status = 502;
    error.details = {
      fundingWallet: funding.wallet,
      paymentAddress: toAddress,
      amountSun: amount.toString(),
      broadcast
    };
    throw error;
  }

  return normalizeValue(broadcast.txid || signedTx.txID).toLowerCase();
}

async function pollOrderUntilSettled(orderId, {
  attempts = DEFAULT_CONFIRM_ATTEMPTS,
  delayMs = DEFAULT_CONFIRM_DELAY_MS
} = {}) {
  let latest = await getEnergyOrder(orderId);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const fulfillmentStatus = normalizeValue(latest?.fulfillmentStatus).toLowerCase();
    const paymentStatus = normalizeValue(latest?.paymentStatus).toLowerCase();

    if (fulfillmentStatus === 'completed' || fulfillmentStatus === 'failed' || paymentStatus === 'expired') {
      return latest;
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
      latest = await getEnergyOrder(orderId);
    }
  }

  return latest;
}

async function rentResourcesWithTronixRent({
  receiveAddress,
  energyNum,
  bandwidthNum,
  durationSeconds,
  requestPrefix,
  context = {}
}) {
  if (!isTronixRentEnabled()) {
    const error = new Error('TronixRent is disabled');
    error.status = 503;
    throw error;
  }

  const receiverAddress = normalizeValue(receiveAddress);
  const energyAmount = normalizeResourceAmount(energyNum);
  const bandwidthAmount = normalizeResourceAmount(bandwidthNum);

  if (!receiverAddress) {
    const error = new Error('receiveAddress is required for TronixRent rental');
    error.status = 400;
    throw error;
  }

  if (energyAmount <= 0 && bandwidthAmount <= 0) {
    return {
      mode: 'tronix',
      provider: 'tronix_rent',
      skipped: true,
      reason: 'no resources requested',
      receiveAddress: receiverAddress
    };
  }

  if (shouldUseFrontedOrder(context)) {
    try {
      return await rentResourcesWithFrontedOrder({
        receiveAddress: receiverAddress,
        energyNum: energyAmount,
        bandwidthNum: bandwidthAmount,
        durationSeconds,
        requestPrefix,
        context
      });
    } catch (frontedError) {
      if (shouldRequireFrontedOrder(context)) {
        throw frontedError;
      }

      console.warn('[tronix-rent] fronted rental failed, falling back to paid order', {
        purpose: normalizeValue(context.purpose) || null,
        receiveAddress: receiverAddress,
        error: frontedError instanceof Error ? frontedError.message : String(frontedError)
      });
    }
  }

  const funding = resolveFundingConfig(context);
  const quote = await createEnergyQuote({
    receiverAddress,
    energyAmount,
    bandwidthAmount,
    durationSeconds: normalizeDurationSeconds(durationSeconds)
  });
  const order = await createEnergyOrder(quote.quoteId);
  const paymentAddress = normalizeValue(order.paymentAddress);
  const paymentAmountSun = normalizeSunAmount(order.paymentAmountSun || order.amountSun);

  if (!paymentAddress || paymentAmountSun <= 0n) {
    const error = new Error('TronixRent order returned invalid payment data');
    error.status = 502;
    error.details = { quote, order };
    throw error;
  }

  const paymentTxHash = await sendTrxPayment({
    funding,
    toAddress: paymentAddress,
    amountSun: paymentAmountSun
  });
  const submitted = await submitEnergyOrderPayment({
    orderId: order.orderId,
    paymentTxHash
  }).catch((error) => {
    error.details = {
      ...(error.details || {}),
      orderId: order.orderId,
      paymentTxHash,
      paymentAddress,
      paymentAmountSun: paymentAmountSun.toString()
    };
    throw error;
  });
  const latest = await pollOrderUntilSettled(order.orderId);

  return {
    mode: 'tronix',
    provider: 'tronix_rent',
    requestPrefix: normalizeValue(requestPrefix) || null,
    receiveAddress: receiverAddress,
    fundingWallet: funding.wallet,
    fundingLabel: funding.label,
    quoteId: quote.quoteId,
    orderId: order.orderId,
    paymentAddress,
    paymentAmountSun: paymentAmountSun.toString(),
    paymentAmountTrx: String(Number(paymentAmountSun) / Number(SUN)),
    paymentTxHash,
    paymentStatus: latest?.paymentStatus || submitted?.paymentStatus || order.paymentStatus || null,
    fulfillmentStatus:
      latest?.fulfillmentStatus || submitted?.fulfillmentStatus || order.fulfillmentStatus || null,
    energyAmount: latest?.energyAmount || order.energyAmount || quote.energyAmount || energyAmount,
    bandwidthAmount: latest?.bandwidthAmount || order.bandwidthAmount || quote.bandwidthAmount || bandwidthAmount,
    route: quote.route || null,
    latestOrder: latest,
    context
  };
}

module.exports = {
  rentResourcesWithTronixRent
};
