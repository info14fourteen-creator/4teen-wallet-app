import { TronWeb } from 'tronweb';

import {
  buildTrongridHeaders,
  TRONGRID_BASE_URL,
} from '../../config/tron';
import {
  FOURTEEN_CONTRACT,
  FOURTEEN_LOGO,
  getAccountResources,
  TRX_LOGO,
  TRX_TOKEN_ID,
  USDT_CONTRACT,
} from '../tron/api';
import {
  getActiveWallet,
  getWalletById,
  getWalletSecret,
  type WalletMeta,
} from '../wallet/storage';
import {
  estimateContractCallResources,
  getAvailableResource,
  getResourceBurnSun,
  getResourceShortfall,
  getResourceUnitPricing,
  normalizeResourceAmount,
  type ContractCallResourceEstimate,
} from '../wallet/resources';

const TRX_CONTRACT = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const USDT_LOGO = 'https://s2.coinmarketcap.com/static/img/coins/64x64/825.png';
const ROUTER_URL = 'https://rot.endjgfsv.link/swap/routerUniversal';
const SMART_ROUTER_ADDRESS = 'TJ4NNy8xZEqsowCBhLvZ45LCqPdGjkET5j';
const DEFAULT_FEE_LIMIT_SUN = 180_000_000;
const DEFAULT_APPROVAL_EXECUTION_FEE_LIMIT_SUN = 180_000_000;
const DEFAULT_SWAP_EXECUTION_FEE_LIMIT_SUN = 350_000_000;
const DEFAULT_SLIPPAGE_BPS = 300;
const DEFAULT_DEADLINE_SECONDS = 60 * 20;
const TRON_DERIVATION_PATH = "m/44'/195'/0'/0/0";
const MAX_UINT256 = (2n ** 256n - 1n).toString();
const DEFAULT_APPROVAL_ESTIMATED_ENERGY = 65_000;
const DEFAULT_APPROVAL_ESTIMATED_BANDWIDTH = 420;
const DEFAULT_SWAP_ESTIMATED_ENERGY = 180_000;
const DEFAULT_SWAP_ESTIMATED_BANDWIDTH = 520;
const APPROVAL_RESOURCE_HEADROOM_MULTIPLIER = 1.25;
const SWAP_RESOURCE_HEADROOM_MULTIPLIER = 1.8;
const APPROVAL_RESOURCE_HEADROOM_ENERGY_FLOOR = 25_000;
const SWAP_RESOURCE_HEADROOM_ENERGY_FLOOR = 150_000;
const APPROVAL_RESOURCE_HEADROOM_BANDWIDTH_FLOOR = 120;
const SWAP_RESOURCE_HEADROOM_BANDWIDTH_FLOOR = 400;
const MIN_FOURTEEN_SWAP_REMAINDER_RAW = 1n;

const TRC20_ABI = [
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: 'remaining', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: 'success', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const SMART_ROUTER_ABI = [
  {
    inputs: [
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'string[]', name: 'poolVersion', type: 'string[]' },
      { internalType: 'uint256[]', name: 'versionLen', type: 'uint256[]' },
      { internalType: 'uint24[]', name: 'fees', type: 'uint24[]' },
      {
        components: [
          { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
          { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
          { internalType: 'address', name: 'to', type: 'address' },
          { internalType: 'uint256', name: 'deadline', type: 'uint256' },
        ],
        internalType: 'struct ISmartExchangeRouter.SwapData',
        name: 'data',
        type: 'tuple',
      },
    ],
    name: 'swapExactInput',
    outputs: [{ internalType: 'uint256[]', name: 'amountsOut', type: 'uint256[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
];

export type SwapTargetToken = 'TRX' | 'USDT';

export type SwapTokenMeta = {
  tokenId: string;
  name?: string;
  symbol: string;
  logo?: string;
  address: string;
  decimals: number;
  isNative?: boolean;
  balanceFormatted?: string;
  balance?: number;
  valueDisplay?: string;
  valueInUsd?: number;
};

export type SunioRoute = {
  id: string;
  provider: 'sunio';
  providerName: string;
  providerLogo: string;
  fromTokenId: string;
  fromTokenSymbol: string;
  toTokenId: string;
  toTokenSymbol: string;
  toTokenDecimals: number;
  path: string[];
  symbols: string[];
  via: string[];
  poolVersion: string[];
  versionLen: number[];
  fees: number[];
  expectedOut: number;
  expectedOutRaw: string;
  routeLabel: string;
  executionLabel: string;
  impactLabel: string;
  isExecutable: boolean;
};

export type FourteenSwapTokenMeta = {
  symbol: string;
  logo: string;
  address: string;
};

export type FourteenSwapReview = {
  wallet: WalletMeta;
  inputToken: SwapTokenMeta & {
    balanceFormatted: string;
    balance: number;
  };
  outputToken: SwapTokenMeta;
  route: SunioRoute;
  amountIn: string;
  expectedOut: string;
  minReceived: string;
  slippage: string;
  approvalRequired: boolean;
  routeChanged: boolean;
  resources: {
    approval: ContractCallResourceEstimate | null;
    swap: ContractCallResourceEstimate | null;
    estimatedBurnSun: number;
  };
};

export type SwapExecutionProgress = {
  step:
    | 'validating'
    | 'checking-allowance'
    | 'approval-required'
    | 'approval-submitted'
    | 'approval-confirmed'
    | 'swap-submitting'
    | 'swap-submitted'
    | 'swap-confirmed'
    | 'success';
  message: string;
  txid?: string;
};

export type ExecuteSwapResult = {
  txid: string;
  approvalTxid?: string | null;
};

export const FOURTEEN_SWAP_INPUT = {
  symbol: '4TEEN',
  logo: FOURTEEN_LOGO,
  address: FOURTEEN_CONTRACT,
} satisfies FourteenSwapTokenMeta;

export const FOURTEEN_SWAP_TARGETS: Record<SwapTargetToken, FourteenSwapTokenMeta> = {
  TRX: {
    symbol: 'TRX',
    logo: TRX_LOGO,
    address: TRX_CONTRACT,
  },
  USDT: {
    symbol: 'USDT',
    logo: USDT_LOGO,
    address: USDT_CONTRACT,
  },
};

function isNativeSwapToken(token: Pick<SwapTokenMeta, 'tokenId' | 'address' | 'isNative'>) {
  if (token.isNative) return true;
  const tokenId = String(token.tokenId || '').trim().toLowerCase();
  const address = String(token.address || '').trim();
  return tokenId === TRX_TOKEN_ID || address === TRX_CONTRACT;
}

function normalizeSwapTokenMeta(token: SwapTokenMeta): SwapTokenMeta {
  return {
    ...token,
    tokenId: String(token.tokenId || '').trim(),
    symbol: String(token.symbol || '').trim() || 'TOKEN',
    name: String(token.name || '').trim() || String(token.symbol || '').trim() || 'Token',
    address: String(token.address || '').trim(),
    decimals: Number.isFinite(token.decimals) ? Number(token.decimals) : 6,
    isNative: isNativeSwapToken(token),
    balanceFormatted: token.balanceFormatted ?? '',
    balance: Number.isFinite(token.balance) ? Number(token.balance) : 0,
    valueDisplay: token.valueDisplay ?? '',
    valueInUsd: Number.isFinite(token.valueInUsd) ? Number(token.valueInUsd) : 0,
  };
}

function getProtectedSwapReserveRaw(token: Pick<SwapTokenMeta, 'tokenId'>) {
  return String(token.tokenId || '').trim() === FOURTEEN_CONTRACT
    ? MIN_FOURTEEN_SWAP_REMAINDER_RAW
    : 0n;
}

function getSwapTokenBalanceRaw(
  token: Pick<SwapTokenMeta, 'balanceFormatted' | 'balance' | 'decimals'>
) {
  const formattedBalance = String(token.balanceFormatted || '').replace(/,/g, '').trim();

  if (formattedBalance) {
    try {
      return normalizeBigIntLike(decimalToRaw(formattedBalance, token.decimals));
    } catch {}
  }

  const numericBalance = Number.isFinite(token.balance) ? Number(token.balance) : 0;
  if (numericBalance <= 0) {
    return 0n;
  }

  return normalizeBigIntLike(decimalToRaw(numericBalance.toFixed(token.decimals), token.decimals));
}

function assertSwapAmountWithinSpendableBalance(
  token: Pick<SwapTokenMeta, 'tokenId' | 'symbol' | 'balanceFormatted' | 'balance' | 'decimals'>,
  amountIn: string
) {
  const balanceRaw = getSwapTokenBalanceRaw(token);
  const reserveRaw = getProtectedSwapReserveRaw(token);
  const spendableRaw = balanceRaw > reserveRaw ? balanceRaw - reserveRaw : 0n;
  const amountInRaw = normalizeBigIntLike(decimalToRaw(amountIn, token.decimals));

  if (amountInRaw <= spendableRaw) {
    return;
  }

  if (String(token.tokenId || '').trim() === FOURTEEN_CONTRACT) {
    throw new Error('You must keep at least 0.000001 4TEEN in the wallet.');
  }

  throw new Error(`Not enough ${token.symbol || 'token'} balance for this swap.`);
}

function applySwapEstimateHeadroom(
  estimate: ContractCallResourceEstimate,
  options: {
    energyMultiplier: number;
    energyFloor: number;
    bandwidthMultiplier: number;
    bandwidthFloor: number;
  }
): ContractCallResourceEstimate {
  const availableEnergy = getAvailableResource(estimate.available, 'energy');
  const availableBandwidth = getAvailableResource(estimate.available, 'bandwidth');
  const estimatedEnergyBase = normalizeResourceAmount(estimate.estimatedEnergy);
  const estimatedBandwidthBase = normalizeResourceAmount(estimate.estimatedBandwidth);
  const estimatedEnergy = normalizeResourceAmount(
    Math.max(
      estimatedEnergyBase + options.energyFloor,
      Math.ceil(estimatedEnergyBase * options.energyMultiplier)
    )
  );
  const estimatedBandwidth = normalizeResourceAmount(
    Math.max(
      estimatedBandwidthBase + options.bandwidthFloor,
      Math.ceil(estimatedBandwidthBase * options.bandwidthMultiplier)
    )
  );
  const energyShortfall = getResourceShortfall(estimatedEnergy, availableEnergy);
  const bandwidthShortfall = getResourceShortfall(estimatedBandwidth, availableBandwidth);
  const estimatedBurnSun = getResourceBurnSun({
    energyShortfall,
    bandwidthShortfall,
    energyPriceSun: estimate.energyPriceSun,
    bandwidthPriceSun: estimate.bandwidthPriceSun,
  });

  return {
    ...estimate,
    estimatedEnergy,
    estimatedBandwidth,
    energyShortfall,
    bandwidthShortfall,
    estimatedBurnSun,
    recommendedFeeLimitSun: Math.max(
      estimate.recommendedFeeLimitSun,
      Math.min(
        DEFAULT_FEE_LIMIT_SUN,
        Math.ceil(Math.max(estimatedBurnSun, 1_000_000) * 1.45)
      )
    ),
  };
}

function createTronWeb(privateKey?: string) {
  return new TronWeb({
    fullHost: TRONGRID_BASE_URL,
    headers: buildTrongridHeaders(),
    privateKey,
  });
}

function createReadOnlyTronWeb() {
  return new TronWeb({
    fullHost: TRONGRID_BASE_URL,
    headers: buildTrongridHeaders(),
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAddress(value: string) {
  return String(value || '').trim();
}

function isUsableAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(normalizeAddress(value));
}

function normalizePrivateKey(value: string) {
  return String(value || '').trim().replace(/^0x/i, '');
}

function isValidPrivateKey(value: string) {
  return /^[0-9a-fA-F]{64}$/.test(normalizePrivateKey(value));
}

function normalizeAmountInput(value: string) {
  return String(value || '')
    .replace(',', '.')
    .trim();
}

function decimalToRaw(amount: string | number, decimals: number) {
  const safe = normalizeAmountInput(String(amount));

  if (!/^\d+(\.\d*)?$/.test(safe)) {
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

function parseSlippageBps(value: string) {
  const parsed = Number.parseFloat(String(value || ''));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_SLIPPAGE_BPS;
  }

  return Math.round(parsed * 100);
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

function normalizeBigIntLike(value: unknown) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));

  if (typeof value === 'string') {
    const safe = value.trim();
    return safe ? BigInt(safe) : 0n;
  }

  if (value && typeof (value as { toString: () => string }).toString === 'function') {
    return BigInt((value as { toString: () => string }).toString());
  }

  return 0n;
}

function normalizePoolVersions(poolVersions: unknown) {
  if (!Array.isArray(poolVersions)) return [];

  return poolVersions
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizePoolFees(poolFees: unknown, tokenCount: number) {
  const normalized = Array.isArray(poolFees)
    ? poolFees.map((item) => Number.parseInt(String(item ?? '0'), 10) || 0)
    : [];

  if (normalized.length >= tokenCount) {
    return normalized.slice(0, tokenCount);
  }

  return [...normalized, ...new Array(Math.max(0, tokenCount - normalized.length)).fill(0)];
}

function buildVersionLen(poolVersions: string[]) {
  if (!poolVersions.length) return [];

  const result: number[] = [];
  let current = poolVersions[0];
  let count = 1;

  for (let index = 1; index < poolVersions.length; index += 1) {
    if (poolVersions[index] === current) {
      count += 1;
      continue;
    }

    result.push(result.length === 0 ? count + 1 : count);
    current = poolVersions[index];
    count = 1;
  }

  result.push(result.length === 0 ? count + 1 : count);
  return result;
}

function isExecutableRoute(path: string[], poolVersions: string[], versionLen: number[]) {
  return path.length >= 2 && poolVersions.length > 0 && versionLen.length > 0;
}

function formatExecutionLabel(value: unknown) {
  const safe = String(value ?? '').trim();
  return safe || 'Live route';
}

function formatImpactLabel(value: unknown) {
  const safe = String(value ?? '').trim();
  return safe ? `${safe}%` : '—';
}

async function getSigningContext(walletId?: string) {
  const wallet = walletId ? await getWalletById(walletId) : await getActiveWallet();

  if (!wallet) {
    throw new Error('No active wallet selected.');
  }

  if (wallet.kind === 'watch-only') {
    throw new Error('Watch-only wallet cannot sign swap. Switch to a full-access wallet first.');
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
    throw new Error('Invalid private key provided');
  }

  return {
    wallet,
    privateKey,
  };
}

function ensureTronWebAddress(tronWeb: TronWeb, address: string) {
  if (!isUsableAddress(address)) return;

  let hex = '';

  try {
    if (typeof tronWeb.address.toHex === 'function') {
      hex = tronWeb.address.toHex(address) || '';
    }
  } catch {}

  try {
    if (typeof tronWeb.setAddress === 'function') {
      tronWeb.setAddress(address);
    }
  } catch {}

  try {
    tronWeb.defaultAddress = {
      ...(tronWeb.defaultAddress || {}),
      base58: address,
      ...(hex ? { hex } : {}),
    };
  } catch {}
}

function prepareTronWebForSigning(tronWeb: TronWeb, owner: string) {
  if (!tronWeb) {
    throw new Error('tronWeb is not available');
  }

  if (!isUsableAddress(owner)) {
    throw new Error('Owner address is invalid.');
  }

  ensureTronWebAddress(tronWeb, owner);

  if (tronWeb?.defaultAddress?.base58 !== owner) {
    throw new Error('Wallet connection is not ready. Please try again.');
  }
}

function extractErrorMessage(error: unknown, fallback = 'Swap failed. Please try again.') {
  const candidates = [
    error instanceof Error ? error.message : '',
    typeof error === 'string' ? error : '',
    typeof (error as { error?: unknown })?.error === 'string'
      ? String((error as { error?: string }).error)
      : '',
    typeof (error as { data?: unknown })?.data === 'string'
      ? String((error as { data?: string }).data)
      : '',
    typeof (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message ===
    'string'
      ? String((error as { response?: { data?: { message?: string } } }).response?.data?.message)
      : '',
  ]
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const text = candidates[0] || fallback;
  const lower = text.toLowerCase();

  if (
    lower.includes('user denied') ||
    lower.includes('user rejected') ||
    lower.includes('cancelled') ||
    lower.includes('canceled')
  ) {
    return 'Transaction was cancelled in the wallet.';
  }

  if (lower.includes('out of energy') || lower.includes('not enough energy')) {
    return 'Not enough TRX energy for this transaction. Top up TRX and try again.';
  }

  if (lower.includes('bandwidth')) {
    return 'Not enough bandwidth for this transaction. Try again after wallet resources recover.';
  }

  if (lower.includes('allowance') || lower.includes('approve')) {
    return 'Token approval failed. Please try again.';
  }

  if (lower.includes('owner_address') || lower.includes('tronweb is not available')) {
    return 'Wallet connection is not ready. Please reconnect and try again.';
  }

  if (lower.includes('insufficient output amount') || lower.includes('amountoutmin')) {
    return 'Price moved before confirmation. Try again or increase slippage slightly.';
  }

  return text;
}

function mapApiRouteToRoute(
  apiRoute: Record<string, unknown>,
  sourceToken: SwapTokenMeta,
  targetToken: SwapTokenMeta
): SunioRoute {
  const path = Array.isArray(apiRoute.tokens)
    ? apiRoute.tokens.map((item) => String(item || '')).filter(Boolean)
    : [];
  const symbols = Array.isArray(apiRoute.symbols)
    ? apiRoute.symbols.map((item) => String(item || '')).filter(Boolean)
    : [];
  const poolVersion = normalizePoolVersions(apiRoute.poolVersions);
  const versionLen = buildVersionLen(poolVersion);
  const fees = normalizePoolFees(apiRoute.poolFees, path.length);
  const expectedOut = Number(apiRoute.amountOut || 0);
  const expectedOutRaw = String(apiRoute.amountOutRaw || '0');
  const hops = Math.max(0, symbols.length - 2);

  return {
    id: `sunio-${sourceToken.tokenId}-${targetToken.tokenId}-${path.join('-')}-${poolVersion.join('-')}`,
    provider: 'sunio',
    providerName: 'SUN.io',
    providerLogo: 'https://s2.coinmarketcap.com/static/img/exchanges/64x64/805.png',
    fromTokenId: sourceToken.tokenId,
    fromTokenSymbol: sourceToken.symbol,
    toTokenId: targetToken.tokenId,
    toTokenSymbol: targetToken.symbol,
    toTokenDecimals: targetToken.decimals,
    path,
    symbols,
    via: symbols.slice(1, -1),
    poolVersion,
    versionLen,
    fees,
    expectedOut,
    expectedOutRaw,
    routeLabel: hops > 0 ? `Optimized · ${hops} hop${hops > 1 ? 's' : ''}` : 'Direct · best route',
    executionLabel: formatExecutionLabel(apiRoute.fee),
    impactLabel: formatImpactLabel(apiRoute.impact),
    isExecutable: isExecutableRoute(path, poolVersion, versionLen),
  };
}

export async function getSwapQuotes(input: {
  amountIn: string;
  sourceToken: SwapTokenMeta;
  targetToken: SwapTokenMeta;
  routeCount?: number;
}) {
  const sourceToken = normalizeSwapTokenMeta(input.sourceToken);
  const targetToken = normalizeSwapTokenMeta(input.targetToken);
  const safeAmount = normalizeAmountInput(input.amountIn);

  if (!safeAmount || Number.parseFloat(safeAmount) <= 0) {
    return [];
  }

  if (!sourceToken.address || !targetToken.address) {
    throw new Error('Swap token addresses are missing.');
  }

  if (sourceToken.address === targetToken.address) {
    return [];
  }

  const amountInRaw = decimalToRaw(safeAmount, sourceToken.decimals);
  const url = new URL(ROUTER_URL);
  url.searchParams.set('fromToken', sourceToken.address);
  url.searchParams.set('toToken', targetToken.address);
  url.searchParams.set('amountIn', amountInRaw);
  url.searchParams.set('typeList', '');
  url.searchParams.set('includeUnverifiedV4Hook', 'true');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`Router request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    data?: Record<string, unknown>[];
  };

  if (Number(payload?.code) !== 0 || !Array.isArray(payload?.data)) {
    throw new Error(payload?.message || 'Swap router returned invalid payload.');
  }

  const routes = payload.data
    .slice(0, Math.max(1, Number(input.routeCount || 3)))
    .map((item) => mapApiRouteToRoute(item, sourceToken, targetToken))
    .sort((left, right) => {
      if (left.isExecutable !== right.isExecutable) {
        return left.isExecutable ? -1 : 1;
      }

      const leftRaw = normalizeBigIntLike(left.expectedOutRaw);
      const rightRaw = normalizeBigIntLike(right.expectedOutRaw);

      if (leftRaw > rightRaw) return -1;
      if (leftRaw < rightRaw) return 1;
      return right.expectedOut - left.expectedOut;
    });

  const executable = routes.filter((item) => item.isExecutable);
  return executable.length > 0 ? executable : routes;
}

export async function getFourteenSwapQuotes(input: {
  amountIn: string;
  targetToken: SwapTargetToken;
  routeCount?: number;
}) {
  return getSwapQuotes({
    amountIn: input.amountIn,
    sourceToken: {
      tokenId: FOURTEEN_CONTRACT,
      symbol: FOURTEEN_SWAP_INPUT.symbol,
      name: FOURTEEN_SWAP_INPUT.symbol,
      logo: FOURTEEN_SWAP_INPUT.logo,
      address: FOURTEEN_SWAP_INPUT.address,
      decimals: 6,
    },
    targetToken: {
      tokenId: input.targetToken === 'TRX' ? TRX_TOKEN_ID : USDT_CONTRACT,
      symbol: FOURTEEN_SWAP_TARGETS[input.targetToken].symbol,
      name: FOURTEEN_SWAP_TARGETS[input.targetToken].symbol,
      logo: FOURTEEN_SWAP_TARGETS[input.targetToken].logo,
      address: FOURTEEN_SWAP_TARGETS[input.targetToken].address,
      decimals: 6,
      isNative: input.targetToken === 'TRX',
    },
    routeCount: input.routeCount,
  });
}

async function waitForTransactionConfirmation(tronWeb: TronWeb, txid: string) {
  const startedAt = Date.now();
  const timeoutMs = 120_000;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const [infoResult, txResult] = await Promise.allSettled([
        tronWeb.trx.getTransactionInfo(txid),
        tronWeb.trx.getTransaction(txid),
      ]);

      const info = infoResult.status === 'fulfilled' ? infoResult.value as any : null;
      const tx = txResult.status === 'fulfilled' ? txResult.value as any : null;
      const receiptResult = info?.receipt?.result;

      if (receiptResult === 'SUCCESS') {
        return;
      }

      if (receiptResult && receiptResult !== 'SUCCESS') {
        throw new Error(`Transaction failed: ${receiptResult}`);
      }

      const txResultLabel = tx?.ret?.[0]?.contractRet || tx?.ret?.[0]?.contract_ret || tx?.result;
      if (String(txResultLabel || '').toUpperCase() === 'SUCCESS') {
        return;
      }
    } catch (error) {
      const message = String((error as Error)?.message || '');
      const isRetryable =
        message.includes('Transaction not found') ||
        message.includes('does not exist') ||
        message.toLowerCase().includes('network') ||
        message.toLowerCase().includes('fetch');

      if (!isRetryable) {
        throw error;
      }
    }

    await wait(1500);
  }

  throw new Error('Transaction confirmation timeout');
}

async function checkAllowance(
  tronWeb: TronWeb,
  owner: string,
  token: SwapTokenMeta,
  amountIn: string
) {
  if (isNativeSwapToken(token)) {
    return {
      hasEnoughAllowance: true,
    };
  }

  prepareTronWebForSigning(tronWeb, owner);

  const contract = await tronWeb.contract(TRC20_ABI, token.address);
  const allowanceRaw = normalizeBigIntLike(await contract.allowance(owner, SMART_ROUTER_ADDRESS).call());
  const requiredRaw = normalizeBigIntLike(decimalToRaw(amountIn, token.decimals));

  return {
    hasEnoughAllowance: allowanceRaw >= requiredRaw,
  };
}

function buildSwapFunctionParameters(input: {
  route: SunioRoute;
  owner: string;
  amountInRaw: string;
  amountOutMinRaw: string;
  deadline: string;
}) {
  return [
    { type: 'address[]', value: input.route.path },
    { type: 'string[]', value: input.route.poolVersion },
    { type: 'uint256[]', value: input.route.versionLen.map((value) => String(value)) },
    { type: 'uint24[]', value: input.route.fees.map((value) => Number(value)) },
    {
      type: 'tuple',
      value: {
        amountIn: input.amountInRaw,
        amountOutMin: input.amountOutMinRaw,
        to: input.owner,
        deadline: input.deadline,
      },
    },
  ];
}

async function estimateSwapResources(input: {
  wallet: WalletMeta;
  privateKey: string;
  owner: string;
  sourceToken: SwapTokenMeta;
  route: SunioRoute;
  amountIn: string;
  slippage: string;
  approvalRequired: boolean;
}) {
  const tronWeb = createTronWeb(input.privateKey);
  prepareTronWebForSigning(tronWeb, input.owner);

  const amountInRaw = decimalToRaw(input.amountIn, input.sourceToken.decimals);
  const slippageBps = BigInt(parseSlippageBps(input.slippage));
  const expectedOutRaw = normalizeBigIntLike(input.route.expectedOutRaw);
  const amountOutMinRaw = ((expectedOutRaw * (10_000n - slippageBps)) / 10_000n).toString();
  const deadline = String(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);

  const approvalEstimate = input.approvalRequired
    ? await estimateContractCallResources({
        tronWeb,
        privateKey: input.privateKey,
        ownerAddress: input.owner,
        contractAddress: input.sourceToken.address,
        functionSelector: 'approve(address,uint256)',
        parameters: [
          { type: 'address', value: SMART_ROUTER_ADDRESS },
          { type: 'uint256', value: MAX_UINT256 },
        ],
        callValue: 0,
        feeLimitSun: DEFAULT_FEE_LIMIT_SUN,
        maxFeeLimitSun: DEFAULT_FEE_LIMIT_SUN,
      }).catch(() => null)
    : null;
  const approval =
    input.approvalRequired && (!approvalEstimate || approvalEstimate.estimatedEnergy <= 0)
      ? await buildFallbackSwapResourceEstimate({
          wallet: input.wallet,
          privateKey: input.privateKey,
          estimatedEnergy: DEFAULT_APPROVAL_ESTIMATED_ENERGY,
          estimatedBandwidth: DEFAULT_APPROVAL_ESTIMATED_BANDWIDTH,
        })
      : approvalEstimate
        ? applySwapEstimateHeadroom(approvalEstimate, {
            energyMultiplier: APPROVAL_RESOURCE_HEADROOM_MULTIPLIER,
            energyFloor: APPROVAL_RESOURCE_HEADROOM_ENERGY_FLOOR,
            bandwidthMultiplier: APPROVAL_RESOURCE_HEADROOM_MULTIPLIER,
            bandwidthFloor: APPROVAL_RESOURCE_HEADROOM_BANDWIDTH_FLOOR,
          })
        : approvalEstimate;

  const swapEstimate = await estimateContractCallResources({
    tronWeb,
    privateKey: input.privateKey,
    ownerAddress: input.owner,
    contractAddress: SMART_ROUTER_ADDRESS,
    functionSelector:
      'swapExactInput(address[],string[],uint256[],uint24[],(uint256,uint256,address,uint256))',
    parameters: buildSwapFunctionParameters({
      route: input.route,
      owner: input.owner,
      amountInRaw,
      amountOutMinRaw,
      deadline,
    }),
    callValue: isNativeSwapToken(input.sourceToken) ? Number(amountInRaw) : 0,
    feeLimitSun: DEFAULT_FEE_LIMIT_SUN,
    maxFeeLimitSun: DEFAULT_FEE_LIMIT_SUN,
  }).catch(() => null);
  const swap =
    !swapEstimate || swapEstimate.estimatedEnergy <= 0
      ? await buildFallbackSwapResourceEstimate({
          wallet: input.wallet,
          privateKey: input.privateKey,
          estimatedEnergy: DEFAULT_SWAP_ESTIMATED_ENERGY,
          estimatedBandwidth: DEFAULT_SWAP_ESTIMATED_BANDWIDTH,
        })
      : applySwapEstimateHeadroom(swapEstimate, {
          energyMultiplier: SWAP_RESOURCE_HEADROOM_MULTIPLIER,
          energyFloor: SWAP_RESOURCE_HEADROOM_ENERGY_FLOOR,
          bandwidthMultiplier: SWAP_RESOURCE_HEADROOM_MULTIPLIER,
          bandwidthFloor: SWAP_RESOURCE_HEADROOM_BANDWIDTH_FLOOR,
        });

  return {
    approval,
    swap,
    estimatedBurnSun:
      Number(approval?.estimatedBurnSun || 0) + Number(swap?.estimatedBurnSun || 0),
  };
}

async function buildFallbackSwapResourceEstimate(input: {
  wallet: WalletMeta;
  privateKey: string;
  estimatedEnergy: number;
  estimatedBandwidth: number;
}): Promise<ContractCallResourceEstimate> {
  const tronWeb = createTronWeb(input.privateKey);
  const [available, pricing] = await Promise.all([
    getAccountResources(input.wallet.address),
    getResourceUnitPricing(tronWeb),
  ]);

  const estimatedEnergy = normalizeResourceAmount(input.estimatedEnergy);
  const estimatedBandwidth = normalizeResourceAmount(input.estimatedBandwidth);
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

  return {
    available,
    estimatedEnergy,
    estimatedBandwidth,
    energyShortfall,
    bandwidthShortfall,
    estimatedBurnSun,
    energyPriceSun: pricing.energySun,
    bandwidthPriceSun: pricing.bandwidthSun,
    recommendedFeeLimitSun: Math.max(
      1_000_000,
      Math.min(
        DEFAULT_FEE_LIMIT_SUN,
        Math.ceil(Math.max(estimatedBurnSun, 1_000_000) * 1.15)
      )
    ),
  };
}

export async function buildSwapReview(input: {
  amountIn: string;
  slippage: string;
  sourceToken: SwapTokenMeta;
  targetToken: SwapTokenMeta;
  preferredRouteId?: string;
  walletId?: string;
}): Promise<FourteenSwapReview> {
  const wallet = input.walletId ? await getWalletById(input.walletId) : await getActiveWallet();

  if (!wallet) {
    throw new Error('No active wallet selected.');
  }

  const amountIn = normalizeAmountInput(input.amountIn);
  const sourceToken = normalizeSwapTokenMeta(input.sourceToken);
  const targetToken = normalizeSwapTokenMeta(input.targetToken);

  if (!amountIn || Number.parseFloat(amountIn) <= 0) {
    throw new Error('Enter amount first.');
  }

  assertSwapAmountWithinSpendableBalance(sourceToken, amountIn);

  const quotes = await getSwapQuotes({
    amountIn,
    sourceToken,
    targetToken,
  });

  if (quotes.length <= 0) {
    throw new Error('No routes available right now.');
  }

  const route =
    quotes.find((item) => item.id === String(input.preferredRouteId || '').trim()) || quotes[0];

  const slippageBps = BigInt(parseSlippageBps(input.slippage));
  const expectedOutRaw = normalizeBigIntLike(route.expectedOutRaw);
  const minReceivedRaw = ((expectedOutRaw * (10_000n - slippageBps)) / 10_000n).toString();
  const approvalRequired =
    wallet.kind === 'watch-only'
      ? false
      : !(await checkAllowance(createReadOnlyTronWeb(), wallet.address, sourceToken, amountIn)).hasEnoughAllowance;
  const { privateKey } = await getSigningContext(wallet.id);
  const resources = await estimateSwapResources({
    wallet,
    privateKey,
    owner: wallet.address,
    sourceToken,
    route,
    amountIn,
    slippage: input.slippage,
    approvalRequired,
  }).catch(async (error) => {
    console.warn('Swap resource estimate fallback:', error);

    const approval = approvalRequired
      ? await buildFallbackSwapResourceEstimate({
          wallet,
          privateKey,
          estimatedEnergy: DEFAULT_APPROVAL_ESTIMATED_ENERGY,
          estimatedBandwidth: DEFAULT_APPROVAL_ESTIMATED_BANDWIDTH,
        })
      : null;

    const swap = await buildFallbackSwapResourceEstimate({
      wallet,
      privateKey,
      estimatedEnergy: DEFAULT_SWAP_ESTIMATED_ENERGY,
      estimatedBandwidth: DEFAULT_SWAP_ESTIMATED_BANDWIDTH,
    });

    return {
      approval,
      swap,
      estimatedBurnSun:
        Number(approval?.estimatedBurnSun || 0) + Number(swap?.estimatedBurnSun || 0),
    };
  });

  return {
    wallet,
    inputToken: {
      ...sourceToken,
      balanceFormatted: sourceToken.balanceFormatted || '',
      balance: Number.isFinite(sourceToken.balance) ? Number(sourceToken.balance) : 0,
    },
    outputToken: targetToken,
    route,
    amountIn,
    expectedOut: rawToDecimalString(route.expectedOutRaw, targetToken.decimals),
    minReceived: rawToDecimalString(minReceivedRaw, targetToken.decimals),
    slippage: input.slippage,
    approvalRequired,
    routeChanged: String(route.id) !== String(input.preferredRouteId || '').trim(),
    resources,
  };
}

export async function buildFourteenSwapReview(input: {
  amountIn: string;
  slippage: string;
  targetToken: SwapTargetToken;
  preferredRouteId?: string;
}): Promise<FourteenSwapReview> {
  return buildSwapReview({
    amountIn: input.amountIn,
    slippage: input.slippage,
    preferredRouteId: input.preferredRouteId,
    sourceToken: {
      tokenId: FOURTEEN_CONTRACT,
      symbol: FOURTEEN_SWAP_INPUT.symbol,
      name: FOURTEEN_SWAP_INPUT.symbol,
      logo: FOURTEEN_SWAP_INPUT.logo,
      address: FOURTEEN_SWAP_INPUT.address,
      decimals: 6,
    },
    targetToken: {
      tokenId: input.targetToken === 'TRX' ? TRX_TOKEN_ID : USDT_CONTRACT,
      symbol: FOURTEEN_SWAP_TARGETS[input.targetToken].symbol,
      name: FOURTEEN_SWAP_TARGETS[input.targetToken].symbol,
      logo: FOURTEEN_SWAP_TARGETS[input.targetToken].logo,
      address: FOURTEEN_SWAP_TARGETS[input.targetToken].address,
      decimals: 6,
      isNative: input.targetToken === 'TRX',
    },
  });
}

async function ensureApproval(
  tronWeb: TronWeb,
  owner: string,
  token: SwapTokenMeta,
  amountIn: string,
  feeLimitSun: number
) {
  if (isNativeSwapToken(token)) {
    return null;
  }

  const allowance = await checkAllowance(tronWeb, owner, token, amountIn);

  if (allowance.hasEnoughAllowance) {
    return null;
  }

  const contract = await tronWeb.contract(TRC20_ABI, token.address);
  const txid = await contract.approve(SMART_ROUTER_ADDRESS, MAX_UINT256).send({
    feeLimit: Math.max(
      1_000_000,
      Math.floor(
        Math.max(
          feeLimitSun || DEFAULT_FEE_LIMIT_SUN,
          DEFAULT_APPROVAL_EXECUTION_FEE_LIMIT_SUN
        )
      )
    ),
    callValue: 0,
    shouldPollResponse: false,
  });

  return String(txid || '');
}

export async function executeSwap(input: {
  route: SunioRoute;
  amountIn: string;
  slippage: string;
  sourceToken: SwapTokenMeta;
  walletId?: string;
  feeLimitSun?: number;
  approvalFeeLimitSun?: number;
  onProgress?: (progress: SwapExecutionProgress) => void;
}): Promise<ExecuteSwapResult> {
  const sourceToken = normalizeSwapTokenMeta(input.sourceToken);
  assertSwapAmountWithinSpendableBalance(sourceToken, input.amountIn);
  const { wallet, privateKey } = await getSigningContext(input.walletId);
  const owner = wallet.address;
  const tronWeb = createTronWeb(privateKey);
  prepareTronWebForSigning(tronWeb, owner);

  const report = (progress: SwapExecutionProgress) => {
    input.onProgress?.(progress);
  };

  try {
    report({
      step: 'validating',
      message: 'Preparing swap...',
    });

    report({
      step: 'checking-allowance',
      message: 'Checking token approval...',
    });

    const approvalTxid = await ensureApproval(
      tronWeb,
      owner,
      sourceToken,
      input.amountIn,
      input.approvalFeeLimitSun || input.feeLimitSun || DEFAULT_FEE_LIMIT_SUN
    );

    if (approvalTxid) {
      report({
        step: 'approval-required',
        message: 'Approval required before swap.',
      });

      report({
        step: 'approval-submitted',
        message: 'Approval transaction sent.',
        txid: approvalTxid,
      });

      await waitForTransactionConfirmation(tronWeb, approvalTxid);

      report({
        step: 'approval-confirmed',
        message: 'Approval confirmed.',
        txid: approvalTxid,
      });
    }

    const amountInRaw = decimalToRaw(input.amountIn, sourceToken.decimals);
    const slippageBps = BigInt(parseSlippageBps(input.slippage));
    const expectedOutRaw = normalizeBigIntLike(input.route.expectedOutRaw);
    const amountOutMinRaw = ((expectedOutRaw * (10_000n - slippageBps)) / 10_000n).toString();
    const deadline = String(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_SECONDS);
    const swapData = [amountInRaw, amountOutMinRaw, owner, deadline];

    report({
      step: 'swap-submitting',
      message: 'Sending swap transaction...',
    });

    const router = await tronWeb.contract(SMART_ROUTER_ABI, SMART_ROUTER_ADDRESS);
    const txid = await router.swapExactInput(
      input.route.path,
      input.route.poolVersion,
      input.route.versionLen.map((value: number) => String(value)),
      input.route.fees.map((value: number) => Number(value)),
      swapData
    ).send({
      feeLimit: Math.max(
        1_000_000,
        Math.floor(
          Math.max(
            input.feeLimitSun || DEFAULT_FEE_LIMIT_SUN,
            DEFAULT_SWAP_EXECUTION_FEE_LIMIT_SUN
          )
        )
      ),
      callValue: isNativeSwapToken(sourceToken) ? Number(amountInRaw) : 0,
      shouldPollResponse: false,
    });

    const normalizedTxid = String(txid || '');

    report({
      step: 'swap-submitted',
      message: 'Swap transaction sent.',
      txid: normalizedTxid,
    });

    await waitForTransactionConfirmation(tronWeb, normalizedTxid);

    report({
      step: 'swap-confirmed',
      message: 'Swap confirmed on-chain.',
      txid: normalizedTxid,
    });

    report({
      step: 'success',
      message: `Swap completed. ${input.route.toTokenSymbol} received.`,
      txid: normalizedTxid,
    });

    return {
      txid: normalizedTxid,
      approvalTxid,
    };
  } catch (error) {
    throw new Error(extractErrorMessage(error));
  }
}

export async function executeFourteenSwap(input: {
  route: SunioRoute;
  amountIn: string;
  slippage: string;
  onProgress?: (progress: SwapExecutionProgress) => void;
}): Promise<ExecuteSwapResult> {
  return executeSwap({
    route: input.route,
    amountIn: input.amountIn,
    slippage: input.slippage,
    sourceToken: {
      tokenId: FOURTEEN_CONTRACT,
      symbol: FOURTEEN_SWAP_INPUT.symbol,
      name: FOURTEEN_SWAP_INPUT.symbol,
      logo: FOURTEEN_SWAP_INPUT.logo,
      address: FOURTEEN_SWAP_INPUT.address,
      decimals: 6,
    },
    onProgress: input.onProgress,
  });
}

export async function getActiveSwapWallet(): Promise<WalletMeta | null> {
  return getActiveWallet();
}
