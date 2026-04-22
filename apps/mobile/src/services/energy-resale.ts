import { FOURTEEN_API_BASE_URL } from '../config/tron';
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
  } | null;
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

export async function getEnergyResaleQuote(input: {
  purpose: EnergyResalePurpose;
  wallet: string;
  requiredEnergy?: number;
  requiredBandwidth?: number;
}): Promise<EnergyResaleQuote | null> {
  try {
    const payload = await fetchJsonOrThrow<{ ok?: boolean; result?: EnergyResaleQuote }>(
      buildApiUrl('/resources/rental/quote'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }
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
}): Promise<EnergyResaleConfirmation> {
  try {
    const payload = await fetchJsonOrThrow<{
      ok?: boolean;
      result?: EnergyResaleConfirmation;
    }>(buildApiUrl('/resources/rental/confirm'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    return payload.result || {};
  } catch (error) {
    if (!(error instanceof EnergyResaleApiError) || error.status !== 202) {
      throw error;
    }

    const status = await waitForEnergyResaleReady({
      purpose: input.purpose,
      wallet: input.wallet,
      requiredEnergy: input.requiredEnergy,
      requiredBandwidth: input.requiredBandwidth,
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
  const payload = await fetchJsonOrThrow<{ ok?: boolean; result?: EnergyResaleStatus }>(
    buildApiUrl('/resources/rental/status', {
      purpose: input.purpose,
      wallet: input.wallet,
      requiredEnergy: input.requiredEnergy ? String(input.requiredEnergy) : '',
      requiredBandwidth: input.requiredBandwidth ? String(input.requiredBandwidth) : '',
    }),
    { method: 'GET' }
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
}) {
  let lastStatus: EnergyResaleStatus | null = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    lastStatus = await getEnergyResaleStatus(input);

    if (lastStatus.ready) {
      return lastStatus;
    }

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
}) {
  const payment = await sendAssetTransfer({
    tokenId: TRX_TOKEN_ID,
    toAddress: input.quote.paymentAddress,
    amount: input.quote.amountTrx,
  });

  const confirmation = await confirmEnergyResalePayment({
    purpose: input.purpose,
    wallet: input.wallet,
    paymentTxId: payment.txId,
    requiredEnergy: input.quote.requiredEnergy,
    requiredBandwidth: input.quote.requiredBandwidth,
  });

  return {
    payment,
    confirmation,
  };
}
