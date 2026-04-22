import { TronWeb } from 'tronweb';

import { getAccountResources, type WalletAccountResources } from '../tron/api';

const DEFAULT_BANDWIDTH_PRICE_SUN = 1_000;
const DEFAULT_ENERGY_PRICE_SUN = 420;
const RESOURCE_PRICING_CACHE_TTL_MS = 2 * 60 * 1000;

export type ResourceUnitPricing = {
  energySun: number;
  bandwidthSun: number;
};

export type ContractCallResourceEstimate = {
  available: WalletAccountResources;
  estimatedEnergy: number;
  estimatedBandwidth: number;
  energyShortfall: number;
  bandwidthShortfall: number;
  estimatedBurnSun: number;
  energyPriceSun: number;
  bandwidthPriceSun: number;
  recommendedFeeLimitSun: number;
};

type ContractCallParameter = {
  type: string;
  value: unknown;
};

let resourceUnitPricingCache:
  | {
      value: ResourceUnitPricing;
      expiresAt: number;
    }
  | null = null;

export function clearWalletResourcePricingCache(): void {
  resourceUnitPricingCache = null;
}

export function normalizeResourceAmount(value: unknown): number {
  const num = typeof value === 'bigint' ? Number(value) : Number(value ?? 0);

  if (!Number.isFinite(num) || Math.abs(num) < 1) {
    return 0;
  }

  return Math.max(0, Math.floor(num));
}

export function normalizeSunAmount(value: unknown): number {
  const num = typeof value === 'bigint' ? Number(value) : Number(value ?? 0);

  if (!Number.isFinite(num) || Math.abs(num) < 1) {
    return 0;
  }

  return Math.max(0, Math.floor(num));
}

export function getResourceShortfall(required: unknown, available: unknown): number {
  return Math.max(0, normalizeResourceAmount(required) - normalizeResourceAmount(available));
}

export function getResourceBurnSun(input: {
  energyShortfall?: unknown;
  bandwidthShortfall?: unknown;
  energyPriceSun?: unknown;
  bandwidthPriceSun?: unknown;
}): number {
  const energy = normalizeResourceAmount(input.energyShortfall);
  const bandwidth = normalizeResourceAmount(input.bandwidthShortfall);
  const energyPrice = normalizeSunAmount(input.energyPriceSun);
  const bandwidthPrice = normalizeSunAmount(input.bandwidthPriceSun);

  return normalizeSunAmount(energy * energyPrice + bandwidth * bandwidthPrice);
}

export function clampResourcePercent(value: unknown): number {
  const num = Number(value ?? 0);

  if (!Number.isFinite(num) || Math.abs(num) < 0.01) {
    return 0;
  }

  return Math.max(0, Math.min(100, num));
}

export function formatResourceAmount(value: unknown): string {
  const safe = normalizeResourceAmount(value);

  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  }

  if (safe >= 1_000) {
    return `${(safe / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }

  return String(safe);
}

export function formatTrxFromSunAmount(value: unknown): string {
  const sun = normalizeSunAmount(value);
  const trx = sun / 1_000_000;

  if (trx <= 0) {
    return '0';
  }

  return trx.toFixed(trx >= 1 ? 3 : 6).replace(/\.?0+$/, '') || '0';
}

export function formatTrxFromSunAmountFixed(value: unknown, digits = 2): string {
  const trx = normalizeSunAmount(value) / 1_000_000;
  return trx.toFixed(digits);
}

function parseUnitPriceValue(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const safe = value.trim();
  if (!safe) return fallback;

  const direct = Number(safe);
  if (Number.isFinite(direct) && direct > 0) {
    return Math.floor(direct);
  }

  const latestSegment = safe.split(',').map((item) => item.trim()).filter(Boolean).pop() || '';
  if (!latestSegment) return fallback;

  const latestValue = Number(latestSegment.split(':').pop() || '');
  if (Number.isFinite(latestValue) && latestValue > 0) {
    return Math.floor(latestValue);
  }

  return fallback;
}

export async function getResourceUnitPricing(tronWeb: TronWeb): Promise<ResourceUnitPricing> {
  const now = Date.now();

  if (resourceUnitPricingCache && resourceUnitPricingCache.expiresAt > now) {
    return resourceUnitPricingCache.value;
  }

  let energySun = DEFAULT_ENERGY_PRICE_SUN;
  let bandwidthSun = DEFAULT_BANDWIDTH_PRICE_SUN;

  try {
    const chainParameters = await tronWeb.trx.getChainParameters();
    const energyParam = chainParameters.find((item: any) => item?.key === 'getEnergyFee');
    const bandwidthParam = chainParameters.find((item: any) => item?.key === 'getTransactionFee');

    energySun = parseUnitPriceValue(energyParam?.value, energySun);
    bandwidthSun = parseUnitPriceValue(bandwidthParam?.value, bandwidthSun);
  } catch {}

  try {
    const [energyPrices, bandwidthPrices] = await Promise.allSettled([
      tronWeb.trx.getEnergyPrices(),
      tronWeb.trx.getBandwidthPrices(),
    ]);

    if (energyPrices.status === 'fulfilled') {
      energySun = parseUnitPriceValue(energyPrices.value, energySun);
    }

    if (bandwidthPrices.status === 'fulfilled') {
      bandwidthSun = parseUnitPriceValue(bandwidthPrices.value, bandwidthSun);
    }
  } catch {}

  const value = {
    energySun,
    bandwidthSun,
  };

  resourceUnitPricingCache = {
    value,
    expiresAt: now + RESOURCE_PRICING_CACHE_TTL_MS,
  };

  return value;
}

export function getAvailableResource(
  resource: WalletAccountResources,
  kind: 'energy' | 'bandwidth'
) {
  if (kind === 'energy') {
    return getResourceShortfall(resource.energyLimit, resource.energyUsed);
  }

  return getResourceShortfall(resource.bandwidthLimit, resource.bandwidthUsed);
}

export function estimateSignedTransactionBandwidth(unsignedTx: any, signedTx?: any) {
  const rawBytes = normalizeResourceAmount(
    Math.ceil(String(unsignedTx?.raw_data_hex || '').length / 2)
  );
  const signatures = Array.isArray(signedTx?.signature) ? signedTx.signature : [];
  const signatureBytes = signatures.reduce((sum: number, item: unknown) => {
    return sum + normalizeResourceAmount(Math.ceil(String(item || '').length / 2));
  }, 0);

  if (!signatures.length) {
    return rawBytes;
  }

  return normalizeResourceAmount(rawBytes + signatureBytes + 6);
}

async function estimateContractEnergy(input: {
  tronWeb: TronWeb;
  contractAddress: string;
  functionSelector: string;
  options: { feeLimit: number; callValue: number };
  parameters: ContractCallParameter[];
  ownerAddress: string;
}) {
  try {
    const directEstimate = await input.tronWeb.transactionBuilder.estimateEnergy(
      input.contractAddress,
      input.functionSelector,
      input.options,
      input.parameters,
      input.ownerAddress
    );

    return normalizeResourceAmount((directEstimate as any)?.energy_required);
  } catch {}

  try {
    const constantResult = await input.tronWeb.transactionBuilder.triggerConstantContract(
      input.contractAddress,
      input.functionSelector,
      input.options,
      input.parameters,
      input.ownerAddress
    );

    return normalizeResourceAmount(
      Number((constantResult as any)?.energy_used || 0) +
        Number((constantResult as any)?.energy_penalty || 0)
    );
  } catch {
    return 0;
  }
}

export async function estimateContractCallResources(input: {
  tronWeb: TronWeb;
  privateKey: string;
  ownerAddress: string;
  contractAddress: string;
  functionSelector: string;
  parameters?: ContractCallParameter[];
  callValue?: number;
  feeLimitSun: number;
  maxFeeLimitSun?: number;
}): Promise<ContractCallResourceEstimate> {
  const parameters = input.parameters ?? [];
  const callValue = normalizeSunAmount(input.callValue);
  const feeLimitSun = Math.max(1_000_000, normalizeSunAmount(input.feeLimitSun));
  const maxFeeLimitSun = Math.max(
    feeLimitSun,
    normalizeSunAmount(input.maxFeeLimitSun || feeLimitSun)
  );

  const [available, pricing, triggerResult] = await Promise.all([
    getAccountResources(input.ownerAddress),
    getResourceUnitPricing(input.tronWeb),
    input.tronWeb.transactionBuilder.triggerSmartContract(
      input.contractAddress,
      input.functionSelector,
      {
        feeLimit: feeLimitSun,
        callValue,
      },
      parameters,
      input.ownerAddress
    ),
  ]);

  const unsignedTx =
    (triggerResult as any)?.transaction || (triggerResult as any)?.transaction?.transaction;

  if (!unsignedTx) {
    throw new Error('Failed to build contract transaction for resource estimate.');
  }

  const signedTx = await input.tronWeb.trx.sign(unsignedTx, input.privateKey);
  const estimatedEnergy = await estimateContractEnergy({
    tronWeb: input.tronWeb,
    contractAddress: input.contractAddress,
    functionSelector: input.functionSelector,
    options: {
      feeLimit: feeLimitSun,
      callValue,
    },
    parameters,
    ownerAddress: input.ownerAddress,
  });
  const estimatedBandwidth = normalizeResourceAmount(
    estimateSignedTransactionBandwidth(unsignedTx, signedTx)
  );
  const availableEnergy = getAvailableResource(available, 'energy');
  const availableBandwidth = getAvailableResource(available, 'bandwidth');
  const energyShortfall = getResourceShortfall(estimatedEnergy, availableEnergy);
  const bandwidthShortfall = getResourceShortfall(estimatedBandwidth, availableBandwidth);
  const estimatedBurnSun = getResourceBurnSun({
    energyShortfall,
    bandwidthShortfall,
    energyPriceSun: pricing.energySun,
    bandwidthPriceSun: pricing.bandwidthSun,
  });
  const recommendedFeeLimitSun = Math.max(
    1_000_000,
    Math.min(maxFeeLimitSun, Math.ceil(Math.max(estimatedBurnSun, 1_000_000) * 1.15))
  );

  return {
    available,
    estimatedEnergy,
    estimatedBandwidth,
    energyShortfall,
    bandwidthShortfall,
    estimatedBurnSun,
    energyPriceSun: pricing.energySun,
    bandwidthPriceSun: pricing.bandwidthSun,
    recommendedFeeLimitSun,
  };
}
