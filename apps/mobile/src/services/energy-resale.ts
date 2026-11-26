import { FOURTEEN_API_BASE_URL, getFourteenApiBaseUrls } from '../config/tron';
import { translateNow } from '../i18n';
import { TRX_TOKEN_ID } from './tron/api';
import AsyncStorage from '../privacy/async-storage';
import { sendAssetTransfer, waitForTransferConfirmation } from './wallet/send';
import { getRecordedTransfer, runRecordedTransfer } from './wallet/recorded-transfer';

const API_BASE_URL = FOURTEEN_API_BASE_URL.replace(/\/+$/, '');

export type EnergyResalePurpose =
  | 'ambassador_registration'
  | 'send_transfer'
  | 'swap'
  | 'direct_buy'
  | 'liquidity_execute'
  | 'ambassador_withdraw';

export type EnergyResaleQuote = {
  purpose: string;
  mode: string;
  wallet: string | null;
  paymentAddress: string;
  amountSun: string;
  amountTrx: string;
  energyQuantity: number;
  bandwidthQuantity?: number;
  readyEnergy?: number;
  readyBandwidth?: number;
  requiredEnergy?: number;
  requiredBandwidth?: number;
  packageCount?: number;
  rentalPeriodSeconds?: number;
  label?: string;
  orderId?: string;
  quoteId?: string;
  expiresAt?: string | null;
};

export type EnergyResaleConfirmation = {
  status?: string;
  energy_quantity?: number;
  row_json?: unknown;
};

export type EnergyResaleStatus = {
  purpose: string;
  wallet: string;
  ready: boolean;
  requiredEnergy: number;
  requiredBandwidth?: number;
  energyState?: {
    energyLimit?: number;
    energyUsed?: number;
    availableEnergy?: number;
    bandwidthLimit?: number;
    bandwidthUsed?: number;
    availableBandwidth?: number;
  };
  lastOrder?: {
    status?: string;
    payment_tx_hash?: string;
    order_id?: string | null;
    error_message?: string | null;
  } | null;
};

export type EnergyResaleProgress = {
  step: 'payment-submitted' | 'waiting-energy' | 'energy-ready';
  message: string;
};

class EnergyResaleApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'EnergyResaleApiError';
    this.status = status;
    this.details = details;
  }
}

function isServerSideRentalError(error: unknown) {
  if (!(error instanceof EnergyResaleApiError)) {
    return false;
  }

  return error.status >= 500;
}

function toUserFacingEnergyResaleError(error: unknown) {
  if (isServerSideRentalError(error)) {
    return new Error(
      translateNow('Energy rental failed.')
    );
  }

  return error instanceof Error ? error : new Error(translateNow('Energy rental failed.'));
}

function toUserFacingEnergyResaleFailureMessage(message: string | null | undefined) {
  const text = String(message || '').trim();

  if (!text) {
    return translateNow('Energy rental failed.');
  }

  if (/operator wallet does not have enough confirmed trx|top up gas station deposit address/i.test(text)) {
    return translateNow(
      'Energy rental is temporarily unavailable. Your buy has not been sent yet.'
    );
  }

  return text;
}

function shouldRetryAcrossOrigins(error: unknown) {
  if (!(error instanceof EnergyResaleApiError)) {
    return true;
  }

  return error.status >= 500;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildApiUrl(path: string, params?: Record<string, string>) {
  const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchJsonOrThrow<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = await readJson(response);

  if (!response.ok || response.status === 202 || payload?.ok === false) {
    throw new EnergyResaleApiError(
      payload?.error ||
        translateNow('Request failed with status {{status}}.', {
          status: String(response.status),
        }),
      response.status,
      payload?.details
    );
  }

  return payload as T;
}

async function fetchJsonAcrossApiOrigins<T>(
  path: string,
  optionsFactory: (baseUrl: string) => { url: string; options: RequestInit }
): Promise<T> {
  const origins = getFourteenApiBaseUrls();
  let lastError: unknown = null;

  for (const baseUrl of origins) {
    try {
      const { url, options } = optionsFactory(baseUrl);
      return await fetchJsonOrThrow<T>(url, options);
    } catch (error) {
      lastError = error;
      if (!shouldRetryAcrossOrigins(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(translateNow('4TEEN API is unavailable'));
}

export async function getEnergyResaleQuote(input: {
  purpose: EnergyResalePurpose;
  wallet: string;
  requiredEnergy?: number;
  requiredBandwidth?: number;
  metadata?: Record<string, unknown>;
}): Promise<EnergyResaleQuote | null> {
  try {
    const payload = await fetchJsonAcrossApiOrigins<{ ok?: boolean; result?: EnergyResaleQuote }>(
      '/resources/rental/quote',
      (baseUrl) => ({
        url: buildApiUrl('/resources/rental/quote').replace(API_BASE_URL, baseUrl.replace(/\/+$/, '')),
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purpose: input.purpose,
            wallet: input.wallet,
            requiredEnergy: input.requiredEnergy,
            requiredBandwidth: input.requiredBandwidth,
            ...(input.metadata || {}),
          }),
        },
      })
    );

    return payload.result || null;
  } catch (error) {
    console.info('[4TEEN] energy resale quote unavailable:', error);
    return null;
  }
}

export async function confirmEnergyResalePayment(input: {
  purpose: EnergyResalePurpose;
  wallet: string;
  paymentTxId: string;
  rentalOrderId?: string;
  requiredEnergy?: number;
  requiredBandwidth?: number;
  metadata?: Record<string, unknown>;
  onProgress?: (progress: EnergyResaleProgress) => void;
}): Promise<EnergyResaleConfirmation> {
  try {
    const payload = await fetchJsonAcrossApiOrigins<{
      ok?: boolean;
      result?: EnergyResaleConfirmation;
    }>(
      '/resources/rental/confirm',
      (baseUrl) => ({
        url: buildApiUrl('/resources/rental/confirm').replace(API_BASE_URL, baseUrl.replace(/\/+$/, '')),
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purpose: input.purpose,
            wallet: input.wallet,
            paymentTxId: input.paymentTxId,
            rentalOrderId: input.rentalOrderId,
            requiredEnergy: input.requiredEnergy,
            requiredBandwidth: input.requiredBandwidth,
            ...(input.metadata || {}),
          }),
        },
      })
    );

    if (!payload.result || payload.result.status !== 'completed') {
      throw new EnergyResaleApiError('Energy delivery pending', 202);
    }
    await waitForEnergyResaleReady(input);
    return payload.result;
  } catch (error) {
    if (isServerSideRentalError(error)) {
      throw toUserFacingEnergyResaleError(error);
    }

    if (!(error instanceof EnergyResaleApiError) || error.status !== 202) {
      throw toUserFacingEnergyResaleError(error);
    }

    input.onProgress?.({
      step: 'waiting-energy',
      message: translateNow(
        'Energy rental payment confirmed. Waiting for Energy delivery. The final transaction has not been sent yet.'
      ),
    });

    const status = await waitForEnergyResaleReady({
      purpose: input.purpose,
      wallet: input.wallet,
      rentalOrderId: input.rentalOrderId,
      requiredEnergy: input.requiredEnergy,
      requiredBandwidth: input.requiredBandwidth,
      onProgress: input.onProgress,
    });

    return {
      status: 'completed',
      row_json: {
        mode: 'resale',
        energyState: status.energyState,
      },
    };
  }
}

export async function getEnergyResaleStatus(input: {
  purpose: EnergyResalePurpose;
  wallet: string;
  rentalOrderId?: string;
  requiredEnergy?: number;
  requiredBandwidth?: number;
}): Promise<EnergyResaleStatus> {
  let payload: { ok?: boolean; result?: EnergyResaleStatus };

  try {
    payload = await fetchJsonAcrossApiOrigins<{ ok?: boolean; result?: EnergyResaleStatus }>(
      '/resources/rental/status',
      (baseUrl) => ({
        url: buildApiUrl('/resources/rental/status', {
          purpose: input.purpose,
          wallet: input.wallet,
          rentalOrderId: input.rentalOrderId || '',
          requiredEnergy: input.requiredEnergy ? String(input.requiredEnergy) : '',
          requiredBandwidth: input.requiredBandwidth ? String(input.requiredBandwidth) : '',
        }).replace(API_BASE_URL, baseUrl.replace(/\/+$/, '')),
        options: { method: 'GET' },
      })
    );
  } catch (error) {
    throw toUserFacingEnergyResaleError(error);
  }

  if (!payload.result) {
    throw new Error(translateNow('Energy resale status is unavailable'));
  }

  return payload.result;
}

async function waitForEnergyResaleReady(input: {
  purpose: EnergyResalePurpose;
  wallet: string;
  rentalOrderId?: string;
  requiredEnergy?: number;
  requiredBandwidth?: number;
  onProgress?: (progress: EnergyResaleProgress) => void;
}) {
  let lastStatus: EnergyResaleStatus | null = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    lastStatus = await getEnergyResaleStatus(input);

    if (lastStatus.lastOrder?.status === 'failed') {
      throw new Error(toUserFacingEnergyResaleFailureMessage(lastStatus.lastOrder.error_message));
    }
    const resourcesReady =
      Number(lastStatus.energyState?.availableEnergy ?? -1) >= Number(input.requiredEnergy || 0) &&
      Number(lastStatus.energyState?.availableBandwidth ?? -1) >= Number(input.requiredBandwidth || 0);
    if (lastStatus.ready && resourcesReady) {
      input.onProgress?.({
        step: 'energy-ready',
        message: translateNow('Energy is live. Continuing transaction...'),
      });
      return lastStatus;
    }

    if (lastStatus.lastOrder?.status === 'failed') {
      throw new Error(
        toUserFacingEnergyResaleFailureMessage(lastStatus.lastOrder.error_message)
      );
    }

    input.onProgress?.({
      step: 'waiting-energy',
      message:
        attempt < 5
          ? translateNow('Waiting for Energy delivery. Keep this screen open.')
          : translateNow('Energy is still pending. Keep this screen open. The final transaction will continue automatically as soon as Energy arrives.'),
    });

    await wait(attempt < 5 ? 3000 : 5000);
  }

  const available = lastStatus?.energyState?.availableEnergy ?? 0;
  throw new Error(
    translateNow('Energy rental is still pending. Available Energy: {{amount}}. Pull to refresh in a moment.', {
      amount: available,
    })
  );
}

const rentalInflight = new Map<string, Promise<unknown>>();
function pendingRentalKey(purpose: string, wallet: string) {
  return `pending-rental:v1:${wallet}:${purpose}`;
}

export async function getPendingEnergyRentalQuote(purpose: EnergyResalePurpose, wallet: string): Promise<EnergyResaleQuote | null> {
  const raw = await AsyncStorage.getItem(pendingRentalKey(purpose, wallet));
  if (raw === null) return null;
  const quote = JSON.parse(raw) as EnergyResaleQuote;
  if (quote.wallet !== wallet || quote.purpose !== purpose || !quote.orderId || quote.mode !== 'tronix') {
    throw new Error('Stored rental requires reconciliation');
  }
  return quote;
}

export async function completeEnergyRental(purpose: EnergyResalePurpose, wallet: string) {
  const { finishOperationLedger } = await import('./wallet/operation-ledger');
  await AsyncStorage.removeItem(pendingRentalKey(purpose, wallet));
  await finishOperationLedger(wallet, purpose);
}

type RentalInput = {
  maxPaymentNetworkFeeSun?: number;
  purpose: EnergyResalePurpose;
  wallet: string;
  quote: EnergyResaleQuote;
  metadata?: Record<string, unknown>;
  onProgress?: (progress: EnergyResaleProgress) => void;
};

export function rentEnergyForPurpose(input: RentalInput) {
  const key = pendingRentalKey(input.purpose, input.wallet);
  const existing = rentalInflight.get(key);
  if (existing) return existing;
  const promise = rentEnergyOnce(input);
  rentalInflight.set(key, promise);
  void promise.finally(() => rentalInflight.delete(key)).catch(() => {});
  return promise;
}

async function rentEnergyOnce(input: RentalInput) {
  const saved = await getPendingEnergyRentalQuote(input.purpose, input.wallet);
  const quote = saved || input.quote;
  if (quote.mode !== 'tronix' || !quote.orderId || quote.wallet !== input.wallet || quote.purpose !== input.purpose) {
    throw new Error('A valid TronixRent order is required before payment');
  }
  if (quote.expiresAt && Date.parse(quote.expiresAt) <= Date.now()) {
    const payment = await getRecordedTransfer(`rental:${input.wallet}:${quote.orderId}`);
    if (!payment) {
      if (saved) await AsyncStorage.removeItem(pendingRentalKey(input.purpose, input.wallet));
      throw new Error('Transaction fee expired. Refresh before approval.');
    }
  }
  if (!saved) await AsyncStorage.setItem(pendingRentalKey(input.purpose, input.wallet), JSON.stringify(quote));
  const payment = await runRecordedTransfer({
    key: `rental:${input.wallet}:${quote.orderId}`,
    identity: JSON.stringify([input.wallet, quote.orderId, quote.paymentAddress, quote.amountTrx]),
    send: beforeBroadcast => sendAssetTransfer({
      tokenId: TRX_TOKEN_ID,
      toAddress: quote.paymentAddress,
      amount: quote.amountTrx,
      expectedWalletAddress: input.wallet,
      maxNetworkFeeSun: input.maxPaymentNetworkFeeSun,
      beforeBroadcast,
    }),
    confirm: waitForTransferConfirmation,
  });

  input.onProgress?.({
    step: 'payment-submitted',
    message: translateNow(
      'Energy rental payment sent. Waiting for network confirmation before the final transaction can continue...'
    ),
  });

  const confirmation = await confirmEnergyResalePayment({
    purpose: input.purpose,
    wallet: input.wallet,
    paymentTxId: payment.txId,
    rentalOrderId: quote.orderId,
    requiredEnergy: quote.requiredEnergy,
    requiredBandwidth: quote.requiredBandwidth,
    metadata: input.metadata,
    onProgress: input.onProgress,
  });

  return {
    payment,
    confirmation,
  };
}
