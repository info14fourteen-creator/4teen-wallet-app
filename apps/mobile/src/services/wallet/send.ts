import { TronWeb } from 'tronweb';

import {
  buildTrongridHeaders,
  TRONGRID_BASE_URL,
} from '../../config/tron';
import {
  FOURTEEN_CONTRACT,
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
import {
  getResourceBurnSun,
  getResourceShortfall,
  normalizeResourceAmount,
  normalizeSunAmount,
} from './resources';
import { getDisplayCurrency } from '../../settings/display-currency';
import { formatDisplayCurrency } from '../../ui/currency-format';
import { translateNow } from '../../i18n';
import { executeContractOperation } from './contract-operation';
import type { OperationFeeApproval } from './operation-fee';

const DEFAULT_TRC20_FEE_LIMIT_SUN = 100_000_000;
const DEFAULT_TRC20_EXECUTION_FEE_LIMIT_SUN = 150_000_000;
const DEFAULT_TRC20_TRANSFER_ESTIMATED_ENERGY = 65_000;
const DEFAULT_BANDWIDTH_PRICE_SUN = 1_000;
const DEFAULT_ENERGY_PRICE_SUN = 420;
const RESOURCE_PRICING_CACHE_TTL_MS = 2 * 60 * 1000;
const TRON_DERIVATION_PATH = "m/44'/195'/0'/0/0";
const MIN_FOURTEEN_REMAINDER_RAW = '1';

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

export function clearSendAssetCaches(): void {
  resourceUnitPricingCache = null;
}

export type SendAssetTransferInput = {
  tokenId: string;
  toAddress: string;
  amount: string;
  feeLimitSun?: number;
  expectedWalletAddress?: string;
  requireResources?: boolean;
  maxNetworkFeeSun?: number;
  feeApproval?: OperationFeeApproval;
  beforeBroadcast?: (txId: string, signedTransaction?: unknown) => Promise<void>;
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

async function readLiveResources(tronWeb: TronWeb, address: string): Promise<WalletAccountResources> {
  const resources = await tronWeb.trx.getAccountResources(address);
  return {
    address,
    energyLimit: Number(resources.EnergyLimit || 0),
    energyUsed: Number(resources.EnergyUsed || 0),
    bandwidthLimit: Number(resources.freeNetLimit || 0) + Number(resources.NetLimit || 0),
    bandwidthUsed: Number(resources.freeNetUsed || 0) + Number(resources.NetUsed || 0),
  };
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
    throw new Error(translateNow('Selected token changed before send confirmation. Go back and try again.'));
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
    throw new Error(translateNow('Enter a valid amount.'));
  }

  const [wholePart, fractionPart = ''] = safe.split('.');
  const normalizedFraction = fractionPart.slice(0, Math.max(0, decimals));
  const paddedFraction = normalizedFraction.padEnd(decimals, '0');
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

function isProtectedFourteenToken(tokenId: string) {
  return String(tokenId || '').trim() === FOURTEEN_CONTRACT;
}

function getProtectedTokenRemainderRaw(tokenId: string) {
  return isProtectedFourteenToken(tokenId) ? MIN_FOURTEEN_REMAINDER_RAW : '0';
}

function subtractRawAmounts(left: string, right: string) {
  if (compareRawAmounts(left, right) <= 0) {
    return '0';
  }

  return String(BigInt(left || '0') - BigInt(right || '0'));
}

function getTokenSpendableRaw(tokenId: string, balanceRaw: string) {
  return subtractRawAmounts(balanceRaw, getProtectedTokenRemainderRaw(tokenId));
}

function assertTokenTransferWithinSpendableBalance(
  tokenId: string,
  symbol: string,
  amountRaw: string,
  balanceRaw: string
) {
  const spendableRaw = getTokenSpendableRaw(tokenId, balanceRaw);

  if (compareRawAmounts(amountRaw, spendableRaw) <= 0) {
    return;
  }

  if (isProtectedFourteenToken(tokenId)) {
    throw new Error(translateNow('You must keep at least 0.000001 4TEEN in the wallet.'));
  }

  throw new Error(translateNow('Insufficient {{symbol}} balance.', { symbol }));
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
    return getResourceShortfall(resource.energyLimit, resource.energyUsed);
  }

  return getResourceShortfall(resource.bandwidthLimit, resource.bandwidthUsed);
}

function estimateSignedTransactionBandwidth(unsignedTx: any, signedTx?: any) {
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

async function estimateTrc20TransferEnergy(
  tronWeb: TronWeb,
  contractAddress: string,
  walletAddress: string,
  toAddress: string,
  amountRaw: string,
  feeLimitSun: number,
  strict = false
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

    const estimated = normalizeResourceAmount((directEstimate as any)?.energy_required);

    if (estimated > 0) {
      return estimated;
    }
  } catch {
    // Some Trongrid nodes either do not support estimateEnergy or rate-limit it.
    // Keep the confirmation usable and fall back to constant call/default sizing.
  }

  try {
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

    const estimated = normalizeResourceAmount(
      Number((constantResult as any)?.energy_used || 0) +
        Number((constantResult as any)?.energy_penalty || 0)
    );

    if (estimated > 0) {
      return estimated;
    }
  } catch {}

  if (strict) throw new Error('Unable to verify transfer Energy requirements. The transfer has not been sent.');
  return DEFAULT_TRC20_TRANSFER_ESTIMATED_ENERGY;
}

async function getSigningContext(): Promise<{
  wallet: WalletMeta;
  privateKey: string;
}> {
  const wallet = await getActiveWallet();

  if (!wallet) {
    throw new Error(translateNow('No active wallet selected.'));
  }

  if (wallet.kind === 'watch-only') {
    throw new Error(translateNow('Watch-only wallet cannot sign transactions.'));
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
    throw new Error(translateNow('Private key not found for this wallet.'));
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
      ? Math.max(1_000_000, Math.floor(Math.max(input.feeLimitSun, DEFAULT_TRC20_EXECUTION_FEE_LIMIT_SUN)))
      : DEFAULT_TRC20_EXECUTION_FEE_LIMIT_SUN;

  if (!isValidTronAddress(toAddress)) {
    throw new Error(translateNow('Enter a valid TRON address.'));
  }

  if (!amount) {
    throw new Error(translateNow('Amount is required.'));
  }

  const { wallet, privateKey } = await getSigningContext();
  if (input.expectedWalletAddress && wallet.address !== input.expectedWalletAddress) {
    throw new Error('Active wallet changed. Reopen the transfer.');
  }
  const tronWeb = createTronWeb(privateKey);
  const trxBalance = await getTokenDetails(wallet.address, TRX_TOKEN_ID, false, wallet.id);

  if (tokenId === TRX_TOKEN_ID) {
    const amountRaw = decimalToRaw(amount, 6);

    if (compareRawAmounts(amountRaw, '0') <= 0) {
      throw new Error(translateNow('Amount must be greater than zero.'));
    }

    if (compareRawAmounts(amountRaw, trxBalance.balanceRaw) > 0) {
      throw new Error(translateNow('Insufficient TRX balance.'));
    }

    const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
      toAddress,
      Number(amountRaw),
      wallet.address
    );

    const signedTx = await tronWeb.trx.sign(unsignedTx, privateKey);
    const pricing = await getResourceUnitPricing(tronWeb);
    const available = input.requireResources || input.maxNetworkFeeSun !== undefined
      ? await readLiveResources(tronWeb, wallet.address)
      : await getAccountResources(wallet.address);
    const estimatedBandwidth = estimateSignedTransactionBandwidth(unsignedTx, signedTx);
    const availableBandwidth = getAvailableResource(available, 'bandwidth');
    const bandwidthShortfall = getResourceShortfall(estimatedBandwidth, availableBandwidth);
    const estimatedBurnSun = getResourceBurnSun({
      bandwidthShortfall,
      bandwidthPriceSun: pricing.bandwidthSun,
    });
    const totalRequiredSun = Number(amountRaw) + estimatedBurnSun;

    if (input.maxNetworkFeeSun !== undefined && (
      !Number.isSafeInteger(input.maxNetworkFeeSun) || input.maxNetworkFeeSun < 0 ||
      estimatedBurnSun > input.maxNetworkFeeSun
    )) throw new Error('Transaction fee changed. Refresh and confirm the new amount.');

    if (Number(trxBalance.balanceRaw || '0') < totalRequiredSun) {
      throw new Error(translateNow('Not enough TRX to cover amount and network burn. Top up TRX first.'));
    }

    if (input.requireResources && bandwidthShortfall > 0) {
      throw new Error('Bandwidth is not ready. The transfer has not been sent.');
    }
    await input.beforeBroadcast?.(String(signedTx.txID || ''), signedTx);
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
        String((receipt as any)?.code || (receipt as any)?.message || translateNow('Failed to broadcast TRX transaction.'))
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
    throw new Error(translateNow('Amount must be greater than zero.'));
  }

  assertTokenTransferWithinSpendableBalance(
    token.tokenId,
    token.symbol,
    amountRaw,
    token.balanceRaw
  );

  const parameters = [
    { type: 'address', value: toAddress },
    { type: 'uint256', value: amountRaw },
  ];

  const guardedBurn = input.maxNetworkFeeSun !== undefined;
  if (input.feeApproval) {
    const txId = await executeContractOperation({ tronWeb, privateKey, wallet: wallet.address,
      approval: input.feeApproval, identity: JSON.stringify(['send', tokenId, toAddress, amountRaw]),
      contractAddress: token.address, functionSelector: 'transfer(address,uint256)', parameters,
      beforeBroadcast: input.beforeBroadcast });
    return { txId, explorerUrl: `https://tronscan.org/#/transaction/${txId}`, receipt: null };
  }
  const available = input.requireResources || guardedBurn
    ? await readLiveResources(tronWeb, wallet.address)
    : await getAccountResources(wallet.address);
  const pricing = await getResourceUnitPricing(tronWeb);
  // Bound bandwidth separately because a contract fee_limit covers Energy only.
  const bandwidthReserveSun = Math.ceil(1000 * pricing.bandwidthSun);
  const contractFeeLimitSun = guardedBurn
    ? Math.min(feeLimitSun, Number(input.maxNetworkFeeSun) - bandwidthReserveSun)
    : feeLimitSun;
  if (guardedBurn && (!Number.isSafeInteger(input.maxNetworkFeeSun) ||
      !Number.isSafeInteger(contractFeeLimitSun) || contractFeeLimitSun <= 0)) {
    throw new Error('Transaction fee changed. Refresh and confirm the new amount.');
  }

  const triggerResult = await tronWeb.transactionBuilder.triggerSmartContract(
    token.address,
    'transfer(address,uint256)',
    {
      feeLimit: contractFeeLimitSun,
      callValue: 0,
    },
    parameters,
    wallet.address
  );

  const unsignedTx =
    (triggerResult as any)?.transaction ||
    (triggerResult as any)?.transaction?.transaction;

  if (!unsignedTx) {
    throw new Error(translateNow('Failed to build TRC20 transfer transaction.'));
  }

  const signedTx = await tronWeb.trx.sign(unsignedTx, privateKey);
  const estimatedEnergy = await estimateTrc20TransferEnergy(
    tronWeb,
    token.address,
    wallet.address,
    toAddress,
    amountRaw,
    contractFeeLimitSun,
    input.requireResources === true || guardedBurn
  );
  const estimatedBandwidth = estimateSignedTransactionBandwidth(unsignedTx, signedTx);
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

  if (guardedBurn && (estimatedBandwidth > 1000 ||
      estimatedBurnSun > Number(input.maxNetworkFeeSun) ||
      energyShortfall * pricing.energySun > contractFeeLimitSun)) {
    throw new Error('Transaction fee changed. Refresh and confirm the new amount.');
  }

  if (Number(trxBalance.balanceRaw || '0') < estimatedBurnSun) {
    throw new Error(translateNow('Not enough TRX to cover network burn. Top up TRX first.'));
  }

  if (input.requireResources && (energyShortfall > 0 || bandwidthShortfall > 0)) {
    throw new Error('Resources are not ready. The transfer has not been sent.');
  }
  await input.beforeBroadcast?.(String(signedTx.txID || ''), signedTx);
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
      String((receipt as any)?.code || (receipt as any)?.message || translateNow('Failed to broadcast token transaction.'))
    );
  }

  return {
    txId,
    explorerUrl: `https://tronscan.org/#/transaction/${txId}`,
    receipt,
  };
}

export async function waitForTransferConfirmation(txId: string, signedTransaction?: unknown): Promise<SendAssetTransferResult> {
  const tronWeb = createTronWeb();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let info: any = null;
    try {
      info = await tronWeb.trx.getTransactionInfo(txId);
    } catch {
      // A temporarily unavailable node is not proof that a transaction failed.
    }
    if (info?.id === txId && typeof info.blockNumber === 'number') {
      const result = info.receipt?.result || info.result;
      if (result && result !== 'SUCCESS') throw new Error(`Transaction failed: ${result} (${txId})`);
      return { txId, explorerUrl: `https://tronscan.org/#/transaction/${txId}`, receipt: info };
    }
    if (attempt === 0 && signedTransaction) {
      const transaction = signedTransaction as any;
      if (transaction.txID !== txId) throw new Error('Stored transaction hash mismatch');
      if (Number(transaction.raw_data?.expiration || 0) > Date.now()) {
        try {
          // Rebroadcast the identical signed transaction, never create a new payment.
          await tronWeb.trx.sendRawTransaction(transaction);
        } catch {
          // A duplicate response or lost acknowledgement still requires a chain read.
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error(`Transaction confirmation is pending. Retry to check the same transaction: ${txId}`);
}

export async function estimateAssetTransfer(
  input: SendAssetTransferInput
): Promise<SendAssetTransferEstimate> {
  const tokenId = String(input.tokenId || '').trim() || TRX_TOKEN_ID;
  const toAddress = normalizeAddress(input.toAddress);
  const amount = normalizeAmountInput(input.amount);
  const feeLimitSun =
    typeof input.feeLimitSun === 'number' && Number.isFinite(input.feeLimitSun)
      ? Math.max(1_000_000, Math.floor(Math.max(input.feeLimitSun, DEFAULT_TRC20_EXECUTION_FEE_LIMIT_SUN)))
      : DEFAULT_TRC20_EXECUTION_FEE_LIMIT_SUN;

  if (!isValidTronAddress(toAddress)) {
    throw new Error(translateNow('Enter a valid TRON address.'));
  }

  if (!amount) {
    throw new Error(translateNow('Amount is required.'));
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
      throw new Error(translateNow('Amount must be greater than zero.'));
    }

    if (compareRawAmounts(amountRaw, token.balanceRaw) > 0) {
      throw new Error(translateNow('Insufficient TRX balance.'));
    }

    const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
      toAddress,
      Number(amountRaw),
      wallet.address
    );
    const signedTx = await tronWeb.trx.sign(unsignedTx, privateKey);

    const estimatedBandwidth = estimateSignedTransactionBandwidth(unsignedTx, signedTx);
    const availableBandwidth = getAvailableResource(available, 'bandwidth');
    const bandwidthShortfall = getResourceShortfall(estimatedBandwidth, availableBandwidth);
    const estimatedBurnSun = getResourceBurnSun({
      bandwidthShortfall,
      bandwidthPriceSun: pricing.bandwidthSun,
    });

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
        missingTrxSun: normalizeSunAmount(Number(amountRaw) + estimatedBurnSun - Number(trxBalance.balanceRaw || '0')),
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
    throw new Error(translateNow('Amount must be greater than zero.'));
  }

  assertTokenTransferWithinSpendableBalance(
    token.tokenId,
    token.symbol,
    amountRaw,
    token.balanceRaw
  );

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
    throw new Error(translateNow('Failed to build TRC20 transfer transaction.'));
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
      missingTrxSun: normalizeSunAmount(estimatedBurnSun - Number(trxBalance.balanceRaw || '0')),
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
    throw new Error(translateNow('No active wallet selected.'));
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
    typeof token.balanceValueUsd === 'number' && Number.isFinite(token.balanceValueUsd)
      ? token.balanceValueUsd
      : 0;
  const displayCurrency = await getDisplayCurrency();

  return {
    wallet,
    token: {
      ...token,
      valueDisplay: formatDisplayCurrency(valueInUsd, { currency: displayCurrency }),
    },
    spendableAmount: rawToDecimalString(
      getTokenSpendableRaw(token.tokenId, token.balanceRaw),
      token.decimals
    ),
  };
}
