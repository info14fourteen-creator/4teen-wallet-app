import { TronWeb } from 'tronweb';

import {
  buildTrongridHeaders,
  TRONGRID_BASE_URL,
} from '../../config/tron';
import {
  TRX_TOKEN_ID,
  getAccountResources,
  getTokenDetails,
  type WalletAccountResources,
} from '../tron/api';
import { getWalletPortfolio } from './portfolio';
import {
  getActiveWallet,
  getWalletSecret,
  type WalletMeta,
} from './storage';

const DEFAULT_TRC20_FEE_LIMIT_SUN = 100_000_000;
const DEFAULT_BANDWIDTH_PRICE_SUN = 1_000;
const DEFAULT_ENERGY_PRICE_SUN = 420;
const RESOURCE_PRICING_CACHE_TTL_MS = 2 * 60 * 1000;
const TRON_DERIVATION_PATH = "m/44'/195'/0'/0/0";

type ResourceUnitPricing = {
  energySun: number;
  bandwidthSun: number;
};

let resourceUnitPricingCache:
  | {
      value: ResourceUnitPricing;
      expiresAt: number;
    }
  | null = null;

function formatUsd(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

export type SendAssetTransferInput = {
  tokenId: string;
  toAddress: string;
  amount: string;
  feeLimitSun?: number;
};

export type SendAssetTransferResult = {
  txId: string;
  explorerUrl: string;
  receipt: unknown;
};

export type SendAssetTransferEstimate = {
  wallet: WalletMeta;
  requestedTokenId: string;
  token: {
    tokenId: string;
    symbol: string;
    name: string;
    logo: string | null;
    decimals: number;
    amount: string;
    amountRaw: string;
    amountDisplay: string;
    isNative: boolean;
    recommendedFeeLimitSun: number;
  };
  recipientAddress: string;
  trxCoverage: {
    trxBalanceRaw: string;
    trxBalanceDisplay: string;
    requiredTrxSun: number;
    missingTrxSun: number;
    canCoverBurn: boolean;
  };
  resources: {
    available: WalletAccountResources;
    estimatedEnergy: number;
    estimatedBandwidth: number;
    energyShortfall: number;
    bandwidthShortfall: number;
    estimatedBurnSun: number;
    energyPriceSun: number;
    bandwidthPriceSun: number;
  };
};

function createTronWeb(privateKey?: string) {
  return new TronWeb({
    fullHost: TRONGRID_BASE_URL,
    headers: buildTrongridHeaders(),
    privateKey,
  });
}

function normalizePrivateKey(value: string) {
  return String(value || '').trim().replace(/^0x/i, '');
}

function isValidPrivateKey(value: string) {
  return /^[0-9a-fA-F]{64}$/.test(normalizePrivateKey(value));
}

function formatTokenAmountDisplay(value: string, symbol: string) {
  return `${value} ${symbol}`.trim();
}

function normalizeAddress(value: string) {
  return String(value || '').trim();
}

function assertResolvedTokenId(requestedTokenId: string, resolvedTokenId: string) {
  const requested = String(requestedTokenId || '').trim() || TRX_TOKEN_ID;
  const resolved = String(resolvedTokenId || '').trim() || TRX_TOKEN_ID;

  if (requested !== resolved) {
    throw new Error('Selected token changed before send confirmation. Go back and try again.');
  }
}

function isValidTronAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizeAddress(value));
}

function normalizeAmountInput(value: string) {
  return String(value || '')
    .replace(',', '.')
    .trim();
}

function decimalToRaw(amount: string, decimals: number) {
  const safe = normalizeAmountInput(amount);

  if (!/^\d+(\.\d+)?$/.test(safe)) {
    throw new Error('Enter a valid amount.');
  }

  const [wholePart, fractionPart = ''] = safe.split('.');

  if (fractionPart.length > decimals) {
    throw new Error(`Too many decimal places. Max allowed: ${decimals}.`);
  }

  const paddedFraction = fractionPart.padEnd(decimals, '0');
  const normalized = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, '');

  return normalized || '0';
}

function rawToDecimalString(raw: string, decimals: number) {
  const safeRaw = String(raw || '0').replace(/\D/g, '') || '0';

  if (decimals <= 0) {
    return safeRaw;
  }

  const padded = safeRaw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '');

  return fraction ? `${whole}.${fraction}` : whole;
}

function compareRawAmounts(left: string, right: string) {
  const a = String(left || '0').replace(/^0+/, '') || '0';
  const b = String(right || '0').replace(/^0+/, '') || '0';

  if (a.length !== b.length) {
    return a.length > b.length ? 1 : -1;
  }

  if (a === b) {
    return 0;
  }

  return a > b ? 1 : -1;
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

async function getResourceUnitPricing(tronWeb: TronWeb): Promise<ResourceUnitPricing> {
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

function getAvailableResource(resource: WalletAccountResources, kind: 'energy' | 'bandwidth') {
  if (kind === 'energy') {
    return Math.max(0, resource.energyLimit - resource.energyUsed);
  }

  return Math.max(0, resource.bandwidthLimit - resource.bandwidthUsed);
}

function estimateSignedTransactionBandwidth(unsignedTx: any, signedTx?: any) {
  const rawBytes = Math.ceil(String(unsignedTx?.raw_data_hex || '').length / 2);
  const signatures = Array.isArray(signedTx?.signature) ? signedTx.signature : [];
  const signatureBytes = signatures.reduce((sum: number, item: unknown) => {
    return sum + Math.ceil(String(item || '').length / 2);
  }, 0);

  if (!signatures.length) {
    return rawBytes;
  }

  return rawBytes + signatureBytes + 6;
}

async function estimateTrc20TransferEnergy(
  tronWeb: TronWeb,
  contractAddress: string,
  walletAddress: string,
  toAddress: string,
  amountRaw: string,
  feeLimitSun: number
) {
  const parameters = [
    { type: 'address', value: toAddress },
    { type: 'uint256', value: amountRaw },
  ];

  try {
    const directEstimate = await tronWeb.transactionBuilder.estimateEnergy(
      contractAddress,
      'transfer(address,uint256)',
      {
        feeLimit: feeLimitSun,
        callValue: 0,
      },
      parameters,
      walletAddress
    );

    return Math.max(0, Number((directEstimate as any)?.energy_required || 0));
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : '';
    const canFallback =
      safeMessage.includes('does not support estimate energy') ||
      safeMessage.includes('this node does not support estimate energy');

    if (!canFallback) {
      throw error;
    }
  }

  const constantResult = await tronWeb.transactionBuilder.triggerConstantContract(
    contractAddress,
    'transfer(address,uint256)',
    {
      feeLimit: feeLimitSun,
      callValue: 0,
    },
    parameters,
    walletAddress
  );

  return Math.max(
    0,
    Number((constantResult as any)?.energy_used || 0) +
      Number((constantResult as any)?.energy_penalty || 0)
  );
}

async function getSigningContext(): Promise<{
  wallet: WalletMeta;
  privateKey: string;
}> {
  const wallet = await getActiveWallet();

  if (!wallet) {
    throw new Error('No active wallet selected.');
  }

  if (wallet.kind === 'watch-only') {
    throw new Error('Watch-only wallet cannot sign transactions.');
  }

  const secret = await getWalletSecret(wallet.id);
  let privateKey = normalizePrivateKey(secret?.privateKey || '');

  if (!isValidPrivateKey(privateKey) && secret?.mnemonic) {
    try {
      const derived = TronWeb.fromMnemonic(String(secret.mnemonic).trim(), TRON_DERIVATION_PATH);
      privateKey = normalizePrivateKey(derived?.privateKey || '');
    } catch {}
  }

  if (!isValidPrivateKey(privateKey)) {
    throw new Error('Private key not found for this wallet.');
  }

  return {
    wallet,
    privateKey,
  };
}

export async function sendAssetTransfer(
  input: SendAssetTransferInput
): Promise<SendAssetTransferResult> {
  const tokenId = String(input.tokenId || '').trim() || TRX_TOKEN_ID;
  const toAddress = normalizeAddress(input.toAddress);
  const amount = normalizeAmountInput(input.amount);
  const feeLimitSun =
    typeof input.feeLimitSun === 'number' && Number.isFinite(input.feeLimitSun)
      ? Math.max(1_000_000, Math.floor(input.feeLimitSun))
      : DEFAULT_TRC20_FEE_LIMIT_SUN;

  if (!isValidTronAddress(toAddress)) {
    throw new Error('Enter a valid TRON address.');
  }

  if (!amount) {
    throw new Error('Amount is required.');
  }

  const { wallet, privateKey } = await getSigningContext();
  const tronWeb = createTronWeb(privateKey);
  const trxBalance = await getTokenDetails(wallet.address, TRX_TOKEN_ID, false, wallet.id);

  if (tokenId === TRX_TOKEN_ID) {
    const amountRaw = decimalToRaw(amount, 6);

    if (compareRawAmounts(amountRaw, '0') <= 0) {
      throw new Error('Amount must be greater than zero.');
    }

    if (compareRawAmounts(amountRaw, trxBalance.balanceRaw) > 0) {
      throw new Error('Insufficient TRX balance.');
    }

    const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
      toAddress,
      Number(amountRaw),
      wallet.address
    );

    const signedTx = await tronWeb.trx.sign(unsignedTx, privateKey);
    const pricing = await getResourceUnitPricing(tronWeb);
    const available = await getAccountResources(wallet.address);
    const estimatedBandwidth = estimateSignedTransactionBandwidth(unsignedTx, signedTx);
    const availableBandwidth = getAvailableResource(available, 'bandwidth');
    const bandwidthShortfall = Math.max(0, estimatedBandwidth - availableBandwidth);
    const estimatedBurnSun = bandwidthShortfall * pricing.bandwidthSun;
    const totalRequiredSun = Number(amountRaw) + estimatedBurnSun;

    if (Number(trxBalance.balanceRaw || '0') < totalRequiredSun) {
      throw new Error('Not enough TRX to cover amount and network burn. Top up TRX first.');
    }

    const receipt = await tronWeb.trx.sendRawTransaction(signedTx);

    const txId =
      String(
        (receipt as any)?.txid ||
        (receipt as any)?.txID ||
        (receipt as any)?.transaction?.txID ||
        signedTx?.txID ||
        ''
      ).trim();

    if (!(receipt as any)?.result || !txId) {
      throw new Error(
        String((receipt as any)?.code || (receipt as any)?.message || 'Failed to broadcast TRX transaction.')
      );
    }

    return {
      txId,
      explorerUrl: `https://tronscan.org/#/transaction/${txId}`,
      receipt,
    };
  }

  const token = await getTokenDetails(wallet.address, tokenId, false, wallet.id);
  assertResolvedTokenId(tokenId, token.tokenId);
  const amountRaw = decimalToRaw(amount, token.decimals);

  if (compareRawAmounts(amountRaw, '0') <= 0) {
    throw new Error('Amount must be greater than zero.');
  }

  if (compareRawAmounts(amountRaw, token.balanceRaw) > 0) {
    throw new Error(`Insufficient ${token.symbol} balance.`);
  }

  const parameters = [
    { type: 'address', value: toAddress },
    { type: 'uint256', value: amountRaw },
  ];

  const triggerResult = await tronWeb.transactionBuilder.triggerSmartContract(
    token.address,
    'transfer(address,uint256)',
    {
      feeLimit: feeLimitSun,
      callValue: 0,
    },
    parameters,
    wallet.address
  );

  const unsignedTx =
    (triggerResult as any)?.transaction ||
    (triggerResult as any)?.transaction?.transaction;

  if (!unsignedTx) {
    throw new Error('Failed to build TRC20 transfer transaction.');
  }

  const signedTx = await tronWeb.trx.sign(unsignedTx, privateKey);
  const available = await getAccountResources(wallet.address);
  const pricing = await getResourceUnitPricing(tronWeb);
  const estimatedEnergy = await estimateTrc20TransferEnergy(
    tronWeb,
    token.address,
    wallet.address,
    toAddress,
    amountRaw,
    feeLimitSun
  );
  const estimatedBandwidth = estimateSignedTransactionBandwidth(unsignedTx, signedTx);
  const availableEnergy = getAvailableResource(available, 'energy');
  const availableBandwidth = getAvailableResource(available, 'bandwidth');
  const energyShortfall = Math.max(0, estimatedEnergy - availableEnergy);
  const bandwidthShortfall = Math.max(0, estimatedBandwidth - availableBandwidth);
  const estimatedBurnSun =
    energyShortfall * pricing.energySun + bandwidthShortfall * pricing.bandwidthSun;

  if (Number(trxBalance.balanceRaw || '0') < estimatedBurnSun) {
    throw new Error('Not enough TRX to cover network burn. Top up TRX first.');
  }

  const receipt = await tronWeb.trx.sendRawTransaction(signedTx);

  const txId =
    String(
      (receipt as any)?.txid ||
      (receipt as any)?.txID ||
      (receipt as any)?.transaction?.txID ||
      signedTx?.txID ||
      ''
    ).trim();

  if (!(receipt as any)?.result || !txId) {
    throw new Error(
      String((receipt as any)?.code || (receipt as any)?.message || 'Failed to broadcast token transaction.')
    );
  }

  return {
    txId,
    explorerUrl: `https://tronscan.org/#/transaction/${txId}`,
    receipt,
  };
}

export async function estimateAssetTransfer(
  input: SendAssetTransferInput
): Promise<SendAssetTransferEstimate> {
  const tokenId = String(input.tokenId || '').trim() || TRX_TOKEN_ID;
  const toAddress = normalizeAddress(input.toAddress);
  const amount = normalizeAmountInput(input.amount);
  const feeLimitSun =
    typeof input.feeLimitSun === 'number' && Number.isFinite(input.feeLimitSun)
      ? Math.max(1_000_000, Math.floor(input.feeLimitSun))
      : DEFAULT_TRC20_FEE_LIMIT_SUN;

  if (!isValidTronAddress(toAddress)) {
    throw new Error('Enter a valid TRON address.');
  }

  if (!amount) {
    throw new Error('Amount is required.');
  }

  const { wallet, privateKey } = await getSigningContext();
  const tronWeb = createTronWeb(privateKey);
  const available = await getAccountResources(wallet.address);
  const pricing = await getResourceUnitPricing(tronWeb);
  const trxBalance = await getTokenDetails(wallet.address, TRX_TOKEN_ID, false, wallet.id);

  if (tokenId === TRX_TOKEN_ID) {
    const token = await getTokenDetails(wallet.address, TRX_TOKEN_ID, false, wallet.id);
    const amountRaw = decimalToRaw(amount, token.decimals);

    if (compareRawAmounts(amountRaw, '0') <= 0) {
      throw new Error('Amount must be greater than zero.');
    }

    if (compareRawAmounts(amountRaw, token.balanceRaw) > 0) {
      throw new Error('Insufficient TRX balance.');
    }

    const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
      toAddress,
      Number(amountRaw),
      wallet.address
    );
    const signedTx = await tronWeb.trx.sign(unsignedTx, privateKey);

    const estimatedBandwidth = estimateSignedTransactionBandwidth(unsignedTx, signedTx);
    const availableBandwidth = getAvailableResource(available, 'bandwidth');
    const bandwidthShortfall = Math.max(0, estimatedBandwidth - availableBandwidth);
    const estimatedBurnSun = bandwidthShortfall * pricing.bandwidthSun;

    return {
      wallet,
      requestedTokenId: tokenId,
      token: {
        tokenId: token.tokenId,
        symbol: token.symbol,
        name: token.name,
        logo: token.logo || null,
        decimals: token.decimals,
        amount,
        amountRaw,
        amountDisplay: formatTokenAmountDisplay(amount, token.symbol),
        isNative: true,
        recommendedFeeLimitSun: 0,
      },
      recipientAddress: toAddress,
      trxCoverage: {
        trxBalanceRaw: trxBalance.balanceRaw,
        trxBalanceDisplay: formatTokenAmountDisplay(
          rawToDecimalString(trxBalance.balanceRaw, trxBalance.decimals),
          trxBalance.symbol
        ),
        requiredTrxSun: Number(amountRaw) + estimatedBurnSun,
        missingTrxSun: Math.max(0, Number(amountRaw) + estimatedBurnSun - Number(trxBalance.balanceRaw || '0')),
        canCoverBurn: Number(trxBalance.balanceRaw || '0') >= Number(amountRaw) + estimatedBurnSun,
      },
      resources: {
        available,
        estimatedEnergy: 0,
        estimatedBandwidth,
        energyShortfall: 0,
        bandwidthShortfall,
        estimatedBurnSun,
        energyPriceSun: pricing.energySun,
        bandwidthPriceSun: pricing.bandwidthSun,
      },
    };
  }

  const token = await getTokenDetails(wallet.address, tokenId, false, wallet.id);
  assertResolvedTokenId(tokenId, token.tokenId);
  const amountRaw = decimalToRaw(amount, token.decimals);

  if (compareRawAmounts(amountRaw, '0') <= 0) {
    throw new Error('Amount must be greater than zero.');
  }

  if (compareRawAmounts(amountRaw, token.balanceRaw) > 0) {
    throw new Error(`Insufficient ${token.symbol} balance.`);
  }

  const parameters = [
    { type: 'address', value: toAddress },
    { type: 'uint256', value: amountRaw },
  ];

  const triggerResult = await tronWeb.transactionBuilder.triggerSmartContract(
    token.address,
    'transfer(address,uint256)',
    {
      feeLimit: feeLimitSun,
      callValue: 0,
    },
    parameters,
    wallet.address
  );

  const unsignedTx =
    (triggerResult as any)?.transaction ||
    (triggerResult as any)?.transaction?.transaction;

  if (!unsignedTx) {
    throw new Error('Failed to build TRC20 transfer transaction.');
  }

  const signedTx = await tronWeb.trx.sign(unsignedTx, privateKey);
  const estimatedEnergy = await estimateTrc20TransferEnergy(
    tronWeb,
    token.address,
    wallet.address,
    toAddress,
    amountRaw,
    feeLimitSun
  );
  const estimatedBandwidth = estimateSignedTransactionBandwidth(unsignedTx, signedTx);
  const availableEnergy = getAvailableResource(available, 'energy');
  const availableBandwidth = getAvailableResource(available, 'bandwidth');
  const energyShortfall = Math.max(0, estimatedEnergy - availableEnergy);
  const bandwidthShortfall = Math.max(0, estimatedBandwidth - availableBandwidth);
  const estimatedBurnSun =
    energyShortfall * pricing.energySun + bandwidthShortfall * pricing.bandwidthSun;
  const recommendedFeeLimitSun = Math.max(
    1_000_000,
    Math.min(DEFAULT_TRC20_FEE_LIMIT_SUN, Math.ceil(Math.max(estimatedBurnSun, 500_000) * 1.15))
  );

  return {
    wallet,
    requestedTokenId: tokenId,
    token: {
      tokenId: token.tokenId,
      symbol: token.symbol,
      name: token.name,
      logo: token.logo || null,
      decimals: token.decimals,
      amount,
      amountRaw,
      amountDisplay: formatTokenAmountDisplay(amount, token.symbol),
      isNative: false,
      recommendedFeeLimitSun,
    },
    recipientAddress: toAddress,
    trxCoverage: {
      trxBalanceRaw: trxBalance.balanceRaw,
      trxBalanceDisplay: formatTokenAmountDisplay(
        rawToDecimalString(trxBalance.balanceRaw, trxBalance.decimals),
        trxBalance.symbol
      ),
      requiredTrxSun: estimatedBurnSun,
      missingTrxSun: Math.max(0, estimatedBurnSun - Number(trxBalance.balanceRaw || '0')),
      canCoverBurn: Number(trxBalance.balanceRaw || '0') >= estimatedBurnSun,
    },
    resources: {
      available,
      estimatedEnergy,
      estimatedBandwidth,
      energyShortfall,
      bandwidthShortfall,
      estimatedBurnSun,
      energyPriceSun: pricing.energySun,
      bandwidthPriceSun: pricing.bandwidthSun,
    },
  };
}

export async function getSendAssetDraft(tokenId?: string) {
  const wallet = await getActiveWallet();

  if (!wallet) {
    throw new Error('No active wallet selected.');
  }

  const requestedTokenId = String(tokenId || '').trim();
  let resolvedTokenId = requestedTokenId;

  if (!resolvedTokenId) {
    const portfolio = await getWalletPortfolio(wallet.address, { force: false });
    const sendableAssets = (portfolio.assets || [])
      .filter((asset) => Number.isFinite(asset.amount) && asset.amount > 0)
      .sort((a, b) => {
        const aUsd =
          typeof a.valueInUsd === 'number' && Number.isFinite(a.valueInUsd) ? a.valueInUsd : 0;
        const bUsd =
          typeof b.valueInUsd === 'number' && Number.isFinite(b.valueInUsd) ? b.valueInUsd : 0;

        if (bUsd !== aUsd) return bUsd - aUsd;
        if (b.amount !== a.amount) return b.amount - a.amount;

        return a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      });

    resolvedTokenId = sendableAssets[0]?.id || TRX_TOKEN_ID;
  }

  const token = await getTokenDetails(wallet.address, resolvedTokenId, false, wallet.id);
  const valueInUsd =
    typeof token.valueInUsd === 'number' && Number.isFinite(token.valueInUsd)
      ? token.valueInUsd
      : 0;

  return {
    wallet,
    token: {
      ...token,
      valueDisplay: formatUsd(valueInUsd),
    },
    spendableAmount: rawToDecimalString(token.balanceRaw, token.decimals),
  };
}
