import { FOURTEEN_API_BASE_URL, getFourteenApiBaseUrls } from '../config/tron';
import { TRX_TOKEN_ID } from './tron/api';
import { sendAssetTransfer } from './wallet/send';

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
  gasStationAccount?: string;
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
    row_json?: {
      error?: {
        message?: string;
      };
    };
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

  if (!response.ok || payload?.ok === false) {
    throw new EnergyResaleApiError(
      payload?.error || `Request failed with status ${response.status}`,
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
    }
  }

  throw lastError instanceof Error ? lastError : new Error('4TEEN API is unavailable');
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
  requiredEnergy?: number;
  requiredBandwidth?: number;
  metadata?: Record<string, unknown>;
  onProgress?: (progress: EnergyResaleProgress) => void;
}): Promise<EnergyResaleConfirmation> {
  try {
    let payload:
      | {
          ok?: boolean;
          result?: EnergyResaleConfirmation;
        }
      | null = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        payload = await fetchJsonAcrossApiOrigins<{
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
                requiredEnergy: input.requiredEnergy,
                requiredBandwidth: input.requiredBandwidth,
                ...(input.metadata || {}),
              }),
            },
          })
        );
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || '');
        const shouldRetryConfirm =
          error instanceof EnergyResaleApiError &&
          error.status === 202 &&
          message.toLowerCase().includes('transaction not found');

        if (!shouldRetryConfirm || attempt >= 3) {
          throw error;
        }

        input.onProgress?.({
          step: 'waiting-energy',
          message: 'Payment sent. Waiting for TRON confirmation...',
        });
        await wait(1500);
      }
    }

    input.onProgress?.({
      step: 'energy-ready',
      message: 'Energy rental confirmed. Continuing transaction...',
    });

    return payload?.result || {};
  } catch (error) {
    if (!(error instanceof EnergyResaleApiError) || error.status !== 202) {
      throw error;
    }

    input.onProgress?.({
      step: 'waiting-energy',
      message: 'Payment confirmed. Waiting for Energy distribution...',
    });

    const status = await waitForEnergyResaleReady({
      purpose: input.purpose,
      wallet: input.wallet,
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
  requiredEnergy?: number;
  requiredBandwidth?: number;
}): Promise<EnergyResaleStatus> {
  const payload = await fetchJsonAcrossApiOrigins<{ ok?: boolean; result?: EnergyResaleStatus }>(
    '/resources/rental/status',
    (baseUrl) => ({
      url: buildApiUrl('/resources/rental/status', {
        purpose: input.purpose,
        wallet: input.wallet,
        requiredEnergy: input.requiredEnergy ? String(input.requiredEnergy) : '',
        requiredBandwidth: input.requiredBandwidth ? String(input.requiredBandwidth) : '',
      }).replace(API_BASE_URL, baseUrl.replace(/\/+$/, '')),
      options: { method: 'GET' },
    })
  );

  if (!payload.result) {
    throw new Error('Energy resale status is unavailable');
  }

  return payload.result;
}

async function waitForEnergyResaleReady(input: {
  purpose: EnergyResalePurpose;
  wallet: string;
  requiredEnergy?: number;
  requiredBandwidth?: number;
  onProgress?: (progress: EnergyResaleProgress) => void;
}) {
  let lastStatus: EnergyResaleStatus | null = null;
  let transientStatusFailures = 0;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      lastStatus = await getEnergyResaleStatus(input);
      transientStatusFailures = 0;
    } catch (error) {
      const retryableStatusError =
        error instanceof EnergyResaleApiError &&
        (error.status === 503 || error.status === 502 || error.status === 504);

      if (!retryableStatusError || transientStatusFailures >= 4) {
        throw error;
      }

      transientStatusFailures += 1;
      input.onProgress?.({
        step: 'waiting-energy',
        message: 'Waiting for Energy distribution...',
      });
      await wait(2000);
      continue;
    }

    if (lastStatus.lastOrder?.status === 'failed') {
      const failureMessage =
        lastStatus.lastOrder?.row_json?.error?.message ||
        'Energy rental failed on the server side.';
      throw new Error(failureMessage);
    }

    if (lastStatus.ready) {
      input.onProgress?.({
        step: 'energy-ready',
        message: 'Energy is live. Continuing transaction...',
      });
      return lastStatus;
    }

    input.onProgress?.({
      step: 'waiting-energy',
      message:
        attempt < 5
          ? 'Waiting for Energy distribution...'
          : 'Energy is still pending. Keeping the transaction queued...',
    });

    await wait(attempt < 5 ? 3000 : 5000);
  }

  const available = lastStatus?.energyState?.availableEnergy ?? 0;
  throw new Error(
    `Energy rental is still pending. Available Energy: ${available}. Pull to refresh in a moment.`
  );
}

export async function rentEnergyForPurpose(input: {
  purpose: EnergyResalePurpose;
  wallet: string;
  quote: EnergyResaleQuote;
  metadata?: Record<string, unknown>;
  onProgress?: (progress: EnergyResaleProgress) => void;
}) {
  const payment = await sendAssetTransfer({
    tokenId: TRX_TOKEN_ID,
    toAddress: input.quote.paymentAddress,
    amount: input.quote.amountTrx,
  });

  input.onProgress?.({
    step: 'payment-submitted',
    message: 'Energy rental payment sent. Waiting for confirmation...',
  });

  const confirmation = await confirmEnergyResalePayment({
    purpose: input.purpose,
    wallet: input.wallet,
    paymentTxId: payment.txId,
    requiredEnergy: input.quote.requiredEnergy,
    requiredBandwidth: input.quote.requiredBandwidth,
    metadata: input.metadata,
    onProgress: input.onProgress,
  });

  return {
    payment,
    confirmation,
  };
}
