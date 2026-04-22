import { TronWeb } from 'tronweb';

import {
  buildTrongridHeaders,
  TRONGRID_BASE_URL,
} from '../config/tron';
import { FOURTEEN_CONTRACT, getAccountResources } from './tron/api';
import { getWalletPortfolio } from './wallet/portfolio';
import {
  estimateContractCallResources,
  getResourceUnitPricing,
  type ContractCallResourceEstimate,
} from './wallet/resources';
import {
  ensureSigningWalletActive,
  getActiveWallet,
  getWalletSecret,
  type WalletMeta,
} from './wallet/storage';

const SUN = 1_000_000;
const DEFAULT_DECIMALS = 6;
const TRON_DERIVATION_PATH = "m/44'/195'/0'/0/0";
const DEFAULT_DIRECT_BUY_CONTRACT = FOURTEEN_CONTRACT;
const DEFAULT_DIRECT_BUY_PRICE_SUN = 1_147_500;
const DEFAULT_PRICE_UPDATE_INTERVAL = 90 * 24 * 60 * 60;
const DEFAULT_LOCK_DURATION = 14 * 24 * 60 * 60;
const DEFAULT_ANNUAL_GROWTH_RATE = 1475;
const DEFAULT_DIRECT_BUY_FEE_LIMIT_SUN = 20_000_000;
const DEFAULT_DIRECT_BUY_ESTIMATED_ENERGY = 20_000;
const DEFAULT_DIRECT_BUY_ESTIMATED_BANDWIDTH = 420;

type FourteenContract = {
  tokenPrice: () => { call: () => Promise<unknown> };
  annualGrowthRate: () => { call: () => Promise<unknown> };
  lastPriceUpdate: () => { call: () => Promise<unknown> };
  priceUpdateInterval: () => { call: () => Promise<unknown> };
  decimals: () => { call: () => Promise<unknown> };
  owner: () => { call: () => Promise<unknown> };
  liquidityPool: () => { call: () => Promise<unknown> };
  airdropAddress: () => { call: () => Promise<unknown> };
  lockedBalanceOf: (address: string) => { call: () => Promise<unknown> };
  buyTokens: () => {
    send: (options: { callValue: number; shouldPollResponse: boolean }) => Promise<unknown>;
  };
};

export type DirectBuyContext = {
  wallet: WalletMeta;
  switchedFromWatchOnly: boolean;
  contractAddress: string;
  contractOwner: string;
  liquidityPoolAddress: string;
  airdropAddress: string;
  trxBalance: number;
  trxBalanceDisplay: string;
  trxValueDisplay: string;
  walletLockedTokenBalance: number;
  tokenDecimals: number;
  annualGrowthRateBps: number;
  priceUpdateIntervalSeconds: number;
  lastPriceUpdateAt: number;
  nextPriceUpdateAt: number;
  elapsedPricePeriods: number;
  storedTokenPriceSun: number;
  tokenPriceSun: number;
  tokenPriceTrx: number;
  ownerSharePercent: number;
  liquiditySharePercent: number;
  airdropSharePercent: number;
  lockDurationSeconds: number;
};

export type DirectBuyReceipt = {
  wallet: WalletMeta;
  txId: string;
  explorerUrl: string;
  amountTrx: number;
  estimatedTokens: number;
  ownerShareTrx: number;
  liquidityShareTrx: number;
  airdropShareTrx: number;
  lockReleaseAt: number;
};

export type DirectBuyReview = {
  wallet: WalletMeta;
  contractAddress: string;
  contractOwner: string;
  liquidityPoolAddress: string;
  airdropAddress: string;
  amountTrx: string;
  amountTrxValue: number;
  trxBalance: number;
  trxBalanceDisplay: string;
  trxValueDisplay: string;
  tokenPriceSun: number;
  tokenPriceTrx: number;
  tokenDecimals: number;
  estimatedTokens: number;
  ownerShareTrx: number;
  liquidityShareTrx: number;
  airdropShareTrx: number;
  annualGrowthRateBps: number;
  nextPriceUpdateAt: number;
  lockReleaseAt: number;
  walletLockedTokenBalance: number;
  trxCoverage: {
    trxBalanceSun: number;
    requiredTrxSun: number;
    missingTrxSun: number;
    canCoverBurn: boolean;
  };
  resources: ContractCallResourceEstimate;
};

export type DirectBuyPriceSnapshot = {
  contractAddress: string;
  tokenPriceSun: number;
  tokenPriceTrx: number;
  annualGrowthRateBps: number;
  nextPriceUpdateAt: number;
};

export const DEFAULT_DIRECT_BUY_BURN_BUFFER_TRX =
  (DEFAULT_DIRECT_BUY_ESTIMATED_ENERGY * 420 +
    DEFAULT_DIRECT_BUY_ESTIMATED_BANDWIDTH * 1_000) /
  SUN;

type DirectBuyContractState = {
  contractOwner: string;
  liquidityPoolAddress: string;
  airdropAddress: string;
  tokenDecimals: number;
  storedTokenPriceSun: number;
  annualGrowthRateBps: number;
  lastPriceUpdateAt: number;
  priceUpdateIntervalSeconds: number;
  elapsedPricePeriods: number;
  tokenPriceSun: number;
  nextPriceUpdateAt: number;
  walletLockedTokenBalance: number;
};

let lastKnownDirectBuyContractState: DirectBuyContractState | null = null;

export function clearDirectBuyCaches(): void {
  lastKnownDirectBuyContractState = null;
}

function createTronWeb(privateKey?: string, address?: string) {
  const tronWeb = new TronWeb({
    fullHost: TRONGRID_BASE_URL,
    headers: buildTrongridHeaders(),
    privateKey,
  });

  if (address) {
    try {
      tronWeb.setAddress(address);
    } catch {}
  }

  return tronWeb;
}

function normalizePrivateKey(value: string) {
  return String(value || '').trim().replace(/^0x/i, '');
}

function isValidPrivateKey(value: string) {
  return /^[0-9a-fA-F]{64}$/.test(normalizePrivateKey(value));
}

function normalizeAmountInput(value: string | number) {
  return String(value || '').replace(',', '.').trim();
}

function parsePositiveNumber(value: string | number) {
  const normalized = normalizeAmountInput(value);
  const parsed = Number.parseFloat(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed;
}

function toSun(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value * SUN);
}

function fromSun(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value / SUN;
}

function floorNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

function normalizeAddress(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCallNumber(value: unknown, fallback = 0) {
  const resolved =
    (value as { toString?: () => string })?.toString?.() ||
    (value as { _hex?: string })?._hex ||
    (value as { [index: number]: unknown })?.[0] ||
    value;

  const numeric = Number(resolved);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildContractAbi() {
  return [
    {
      inputs: [
        { internalType: 'address', name: '_liquidityPool', type: 'address' },
        { internalType: 'address', name: '_airdropAddress', type: 'address' },
      ],
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'address', name: 'owner', type: 'address' },
        { indexed: true, internalType: 'address', name: 'spender', type: 'address' },
        { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
      ],
      name: 'Approval',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'address', name: 'buyer', type: 'address' },
        { indexed: false, internalType: 'uint256', name: 'amountTRX', type: 'uint256' },
        { indexed: false, internalType: 'uint256', name: 'amountTokens', type: 'uint256' },
      ],
      name: 'BuyTokens',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'address', name: 'previousOwner', type: 'address' },
        { indexed: true, internalType: 'address', name: 'newOwner', type: 'address' },
      ],
      name: 'OwnershipTransferred',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: false, internalType: 'uint256', name: 'oldPrice', type: 'uint256' },
        { indexed: false, internalType: 'uint256', name: 'newPrice', type: 'uint256' },
      ],
      name: 'PriceUpdated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'address', name: 'from', type: 'address' },
        { indexed: true, internalType: 'address', name: 'to', type: 'address' },
        { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
      ],
      name: 'Transfer',
      type: 'event',
    },
    { inputs: [], name: 'airdropAddress', outputs: [{ internalType: 'address', name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ internalType: 'address', name: 'owner_', type: 'address' }, { internalType: 'address', name: 'spender', type: 'address' }], name: 'allowance', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'annualGrowthRate', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ internalType: 'address', name: 'spender', type: 'address' }, { internalType: 'uint256', name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ internalType: 'address', name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'buyTokens', outputs: [], stateMutability: 'payable', type: 'function' },
    { inputs: [], name: 'decimals', outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'getCurrentPrice', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [], name: 'initialSupply', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'lastPriceUpdate', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'liquidityPool', outputs: [{ internalType: 'address', name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ internalType: 'address', name: 'account', type: 'address' }], name: 'lockedBalanceOf', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'name', outputs: [{ internalType: 'string', name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'owner', outputs: [{ internalType: 'address', name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'priceUpdateInterval', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ internalType: 'address', name: '_addr', type: 'address' }], name: 'setAirdropAddress', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ internalType: 'uint256', name: 'newRate', type: 'uint256' }], name: 'setAnnualGrowthRate', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ internalType: 'address', name: '_pool', type: 'address' }], name: 'setLiquidityPool', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [], name: 'symbol', outputs: [{ internalType: 'string', name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'tokenPrice', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'totalSupply', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [{ internalType: 'address', name: 'recipient', type: 'address' }, { internalType: 'uint256', name: 'amount', type: 'uint256' }], name: 'transfer', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ internalType: 'address', name: 'sender', type: 'address' }, { internalType: 'address', name: 'recipient', type: 'address' }, { internalType: 'uint256', name: 'amount', type: 'uint256' }], name: 'transferFrom', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }], name: 'transferOwnership', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }], name: 'withdrawLiquidity', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { stateMutability: 'payable', type: 'receive' },
  ];
}

function extractTxid(result: unknown) {
  if (!result) return '';
  if (typeof result === 'string') return result;

  const candidate = result as {
    txid?: string;
    txID?: string;
    transaction?: string | { txID?: string };
    receipt?: { txID?: string };
    id?: string;
  };

  if (typeof candidate.txid === 'string') return candidate.txid;
  if (typeof candidate.txID === 'string') return candidate.txID;
  if (typeof candidate.transaction === 'string') return candidate.transaction;
  if (typeof candidate.transaction?.txID === 'string') return candidate.transaction.txID;
  if (typeof candidate.receipt?.txID === 'string') return candidate.receipt.txID;
  if (typeof candidate.id === 'string') return candidate.id;

  return '';
}

async function getSigningWalletContext() {
  const initialWallet = await getActiveWallet();
  const wallet = (await ensureSigningWalletActive()) ?? initialWallet;

  if (!wallet) {
    throw new Error('No wallet available for direct buy.');
  }

  if (wallet.kind === 'watch-only') {
    throw new Error('Direct buy requires a full-access wallet.');
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
    switchedFromWatchOnly: Boolean(initialWallet && initialWallet.id !== wallet.id),
  };
}

async function getContract(contractAddress: string, tronWeb?: TronWeb) {
  const resolved = tronWeb || createTronWeb(undefined, contractAddress);
  return (await resolved.contract(
    buildContractAbi(),
    contractAddress
  )) as unknown as FourteenContract;
}

function applyElapsedPriceGrowth(basePriceSun: number, annualGrowthRateBps: number, elapsedPeriods: number) {
  if (elapsedPeriods <= 0) {
    return floorNumber(basePriceSun);
  }

  let nextPrice = floorNumber(basePriceSun);

  for (let index = 0; index < elapsedPeriods; index += 1) {
    nextPrice = floorNumber((nextPrice * (10_000 + annualGrowthRateBps)) / 10_000);
  }

  return nextPrice;
}

async function readDirectBuyContractState(contractAddress: string, buyerAddress: string) {
  const contract = await getContract(contractAddress, createTronWeb(undefined, buyerAddress));
  const [
    tokenPriceRaw,
    annualGrowthRateRaw,
    lastPriceUpdateRaw,
    priceUpdateIntervalRaw,
    decimalsRaw,
    ownerRaw,
    liquidityPoolRaw,
    airdropAddressRaw,
    lockedBalanceRaw,
  ] = await Promise.all([
    contract.tokenPrice().call(),
    contract.annualGrowthRate().call(),
    contract.lastPriceUpdate().call(),
    contract.priceUpdateInterval().call(),
    contract.decimals().call(),
    contract.owner().call(),
    contract.liquidityPool().call(),
    contract.airdropAddress().call(),
    contract.lockedBalanceOf(buyerAddress).call(),
  ]);

  const tokenDecimals = normalizeCallNumber(decimalsRaw, DEFAULT_DECIMALS);
  const storedTokenPriceSun = normalizeCallNumber(tokenPriceRaw, DEFAULT_DIRECT_BUY_PRICE_SUN);
  const annualGrowthRateBps = normalizeCallNumber(annualGrowthRateRaw, DEFAULT_ANNUAL_GROWTH_RATE);
  const lastPriceUpdateAt = normalizeCallNumber(lastPriceUpdateRaw, 0);
  const priceUpdateIntervalSeconds = normalizeCallNumber(
    priceUpdateIntervalRaw,
    DEFAULT_PRICE_UPDATE_INTERVAL
  );
  const nowSeconds = Math.floor(Date.now() / 1000);
  const elapsedPricePeriods =
    lastPriceUpdateAt > 0 && priceUpdateIntervalSeconds > 0
      ? Math.floor(Math.max(0, nowSeconds - lastPriceUpdateAt) / priceUpdateIntervalSeconds)
      : 0;
  const tokenPriceSun = applyElapsedPriceGrowth(
    storedTokenPriceSun,
    annualGrowthRateBps,
    elapsedPricePeriods
  );
  const lastAppliedPriceUpdateAt =
    lastPriceUpdateAt > 0
      ? lastPriceUpdateAt + elapsedPricePeriods * priceUpdateIntervalSeconds
      : nowSeconds;
  const nextPriceUpdateAt = lastAppliedPriceUpdateAt + priceUpdateIntervalSeconds;

  const state = {
    contractOwner: normalizeAddress(ownerRaw),
    liquidityPoolAddress: normalizeAddress(liquidityPoolRaw),
    airdropAddress: normalizeAddress(airdropAddressRaw),
    tokenDecimals,
    storedTokenPriceSun,
    annualGrowthRateBps,
    lastPriceUpdateAt,
    priceUpdateIntervalSeconds,
    elapsedPricePeriods,
    tokenPriceSun,
    nextPriceUpdateAt,
    walletLockedTokenBalance:
      normalizeCallNumber(lockedBalanceRaw, 0) / 10 ** Math.max(0, tokenDecimals),
  };

  lastKnownDirectBuyContractState = state;

  return state;
}

function buildFallbackDirectBuyContractState(): DirectBuyContractState {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const lastPriceUpdateAt = nowSeconds;
  const nextPriceUpdateAt = nowSeconds + DEFAULT_PRICE_UPDATE_INTERVAL;

  return (
    lastKnownDirectBuyContractState || {
      contractOwner: '',
      liquidityPoolAddress: '',
      airdropAddress: '',
      tokenDecimals: DEFAULT_DECIMALS,
      storedTokenPriceSun: DEFAULT_DIRECT_BUY_PRICE_SUN,
      annualGrowthRateBps: DEFAULT_ANNUAL_GROWTH_RATE,
      lastPriceUpdateAt,
      priceUpdateIntervalSeconds: DEFAULT_PRICE_UPDATE_INTERVAL,
      elapsedPricePeriods: 0,
      tokenPriceSun: DEFAULT_DIRECT_BUY_PRICE_SUN,
      nextPriceUpdateAt,
      walletLockedTokenBalance: 0,
    }
  );
}

export function computeEstimatedDirectBuyTokens(
  trxAmount: number,
  tokenPriceSun: number,
  tokenDecimals: number = DEFAULT_DECIMALS
) {
  if (!Number.isFinite(trxAmount) || trxAmount <= 0) {
    return 0;
  }

  if (!Number.isFinite(tokenPriceSun) || tokenPriceSun <= 0) {
    return 0;
  }

  return (trxAmount * 10 ** Math.max(0, tokenDecimals)) / tokenPriceSun;
}

export function computeDirectBuySplit(trxAmount: number) {
  if (!Number.isFinite(trxAmount) || trxAmount <= 0) {
    return {
      ownerShareTrx: 0,
      liquidityShareTrx: 0,
      airdropShareTrx: 0,
    };
  }

  const ownerShareTrx = trxAmount * 0.07;
  const liquidityShareTrx = trxAmount * 0.9;
  const airdropShareTrx = Math.max(0, trxAmount - ownerShareTrx - liquidityShareTrx);

  return {
    ownerShareTrx,
    liquidityShareTrx,
    airdropShareTrx,
  };
}

export function formatDirectBuyPrice(tokenPriceSun: number, digits = 6) {
  return fromSun(tokenPriceSun).toFixed(digits);
}

export function formatDirectBuyAmountValue(value: number, digits = 6) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }

  return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function formatDirectBuyPercentFromBps(bps: number, digits = 2) {
  return `${(bps / 100).toFixed(digits)}%`;
}

export function formatDirectBuyDate(unixSeconds: number) {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return '—';
  }

  return new Date(unixSeconds * 1000).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function parseDirectBuyAmount(value: string) {
  return parsePositiveNumber(value);
}

export async function loadDirectBuyPriceSnapshot(input: {
  readerAddress: string;
  contractAddress?: string;
}): Promise<DirectBuyPriceSnapshot> {
  const contractAddress = String(input.contractAddress || DEFAULT_DIRECT_BUY_CONTRACT).trim();
  const readerAddress = normalizeAddress(input.readerAddress);

  if (!readerAddress) {
    throw new Error('Reader address is required.');
  }

  const contractState = await readDirectBuyContractState(contractAddress, readerAddress).catch(() =>
    buildFallbackDirectBuyContractState()
  );

  return {
    contractAddress,
    tokenPriceSun: contractState.tokenPriceSun,
    tokenPriceTrx: fromSun(contractState.tokenPriceSun),
    annualGrowthRateBps: contractState.annualGrowthRateBps,
    nextPriceUpdateAt: contractState.nextPriceUpdateAt,
  };
}

async function estimateDirectBuyResources(input: {
  wallet: WalletMeta;
  privateKey: string;
  contractAddress: string;
  amountTrx: number;
}) {
  const tronWeb = createTronWeb(input.privateKey);
  return estimateContractCallResources({
    tronWeb,
    privateKey: input.privateKey,
    ownerAddress: input.wallet.address,
    contractAddress: input.contractAddress,
    functionSelector: 'buyTokens()',
    parameters: [],
    callValue: toSun(input.amountTrx),
    feeLimitSun: DEFAULT_DIRECT_BUY_FEE_LIMIT_SUN,
    maxFeeLimitSun: DEFAULT_DIRECT_BUY_FEE_LIMIT_SUN,
  });
}

async function buildFallbackDirectBuyResourceEstimate(input: {
  wallet: WalletMeta;
  privateKey: string;
}): Promise<ContractCallResourceEstimate> {
  const tronWeb = createTronWeb(input.privateKey);
  const [available, pricing] = await Promise.all([
    getAccountResources(input.wallet.address),
    getResourceUnitPricing(tronWeb),
  ]);

  const availableEnergy = Math.max(0, available.energyLimit - available.energyUsed);
  const availableBandwidth = Math.max(0, available.bandwidthLimit - available.bandwidthUsed);
  const energyShortfall = Math.max(0, DEFAULT_DIRECT_BUY_ESTIMATED_ENERGY - availableEnergy);
  const bandwidthShortfall = Math.max(
    0,
    DEFAULT_DIRECT_BUY_ESTIMATED_BANDWIDTH - availableBandwidth
  );
  const estimatedBurnSun =
    energyShortfall * pricing.energySun + bandwidthShortfall * pricing.bandwidthSun;

  return {
    available,
    estimatedEnergy: DEFAULT_DIRECT_BUY_ESTIMATED_ENERGY,
    estimatedBandwidth: DEFAULT_DIRECT_BUY_ESTIMATED_BANDWIDTH,
    energyShortfall,
    bandwidthShortfall,
    estimatedBurnSun,
    energyPriceSun: pricing.energySun,
    bandwidthPriceSun: pricing.bandwidthSun,
    recommendedFeeLimitSun: Math.max(
      1_000_000,
      Math.min(
        DEFAULT_DIRECT_BUY_FEE_LIMIT_SUN,
        Math.ceil(Math.max(estimatedBurnSun, 1_000_000) * 1.15)
      )
    ),
  };
}

export async function buildDirectBuyReview(input: {
  trxAmount: string | number;
  contractAddress?: string;
}): Promise<DirectBuyReview> {
  const amountTrxValue =
    typeof input.trxAmount === 'number'
      ? input.trxAmount
      : parsePositiveNumber(input.trxAmount);

  if (amountTrxValue <= 0) {
    throw new Error('Enter a valid TRX amount.');
  }

  const context = await loadDirectBuyContext(input.contractAddress);
  const secret = await getWalletSecret(context.wallet.id);
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

  let resources = await estimateDirectBuyResources({
    wallet: context.wallet,
    privateKey,
    contractAddress: context.contractAddress,
    amountTrx: amountTrxValue,
  }).catch(async (error) => {
    console.warn('Direct buy resource estimate fallback:', error);
    return buildFallbackDirectBuyResourceEstimate({
      wallet: context.wallet,
      privateKey,
    });
  });

  if (resources.estimatedEnergy <= 0) {
    console.warn('Direct buy resource estimate returned zero energy; using fallback.');
    resources = await buildFallbackDirectBuyResourceEstimate({
      wallet: context.wallet,
      privateKey,
    });
  }

  const trxBalanceSun = toSun(context.trxBalance);
  const requiredTrxSun = toSun(amountTrxValue) + resources.estimatedBurnSun;
  const estimatedTokens = computeEstimatedDirectBuyTokens(
    amountTrxValue,
    context.tokenPriceSun,
    context.tokenDecimals
  );
  const split = computeDirectBuySplit(amountTrxValue);

  return {
    wallet: context.wallet,
    contractAddress: context.contractAddress,
    contractOwner: context.contractOwner,
    liquidityPoolAddress: context.liquidityPoolAddress,
    airdropAddress: context.airdropAddress,
    amountTrx:
      typeof input.trxAmount === 'number'
        ? formatDirectBuyAmountValue(input.trxAmount)
        : normalizeAmountInput(input.trxAmount),
    amountTrxValue,
    trxBalance: context.trxBalance,
    trxBalanceDisplay: context.trxBalanceDisplay,
    trxValueDisplay: context.trxValueDisplay,
    tokenPriceSun: context.tokenPriceSun,
    tokenPriceTrx: context.tokenPriceTrx,
    tokenDecimals: context.tokenDecimals,
    estimatedTokens,
    ownerShareTrx: split.ownerShareTrx,
    liquidityShareTrx: split.liquidityShareTrx,
    airdropShareTrx: split.airdropShareTrx,
    annualGrowthRateBps: context.annualGrowthRateBps,
    nextPriceUpdateAt: context.nextPriceUpdateAt,
    lockReleaseAt: Math.floor(Date.now() / 1000) + context.lockDurationSeconds,
    walletLockedTokenBalance: context.walletLockedTokenBalance,
    trxCoverage: {
      trxBalanceSun,
      requiredTrxSun,
      missingTrxSun: Math.max(0, requiredTrxSun - trxBalanceSun),
      canCoverBurn: trxBalanceSun >= requiredTrxSun,
    },
    resources,
  };
}

export async function loadDirectBuyContext(
  contractAddress: string = DEFAULT_DIRECT_BUY_CONTRACT
): Promise<DirectBuyContext> {
  const { wallet, switchedFromWatchOnly } = await getSigningWalletContext();
  const [portfolioResult, contractStateResult] = await Promise.allSettled([
    getWalletPortfolio(wallet.address),
    readDirectBuyContractState(contractAddress, wallet.address),
  ]);
  const contractState =
    contractStateResult.status === 'fulfilled'
      ? contractStateResult.value
      : buildFallbackDirectBuyContractState();
  const portfolio = portfolioResult.status === 'fulfilled' ? portfolioResult.value : null;
  const trxAsset = portfolio?.assets.find((asset) => asset.id === 'trx');

  return {
    wallet,
    switchedFromWatchOnly,
    contractAddress,
    contractOwner: contractState.contractOwner,
    liquidityPoolAddress: contractState.liquidityPoolAddress,
    airdropAddress: contractState.airdropAddress,
    trxBalance: trxAsset?.amount ?? 0,
    trxBalanceDisplay: trxAsset?.amountDisplay ?? '0',
    trxValueDisplay: trxAsset?.valueDisplay ?? '$0.00',
    walletLockedTokenBalance: contractState.walletLockedTokenBalance,
    tokenDecimals: contractState.tokenDecimals,
    annualGrowthRateBps: contractState.annualGrowthRateBps,
    priceUpdateIntervalSeconds: contractState.priceUpdateIntervalSeconds,
    lastPriceUpdateAt: contractState.lastPriceUpdateAt,
    nextPriceUpdateAt: contractState.nextPriceUpdateAt,
    elapsedPricePeriods: contractState.elapsedPricePeriods,
    storedTokenPriceSun: contractState.storedTokenPriceSun,
    tokenPriceSun: contractState.tokenPriceSun,
    tokenPriceTrx: fromSun(contractState.tokenPriceSun),
    ownerSharePercent: 7,
    liquiditySharePercent: 90,
    airdropSharePercent: 3,
    lockDurationSeconds: DEFAULT_LOCK_DURATION,
  };
}

export async function executeDirectBuy(input: {
  trxAmount: string | number;
  contractAddress?: string;
  feeLimitSun?: number;
}): Promise<DirectBuyReceipt> {
  const amountTrx =
    typeof input.trxAmount === 'number'
      ? input.trxAmount
      : parsePositiveNumber(input.trxAmount);

  if (amountTrx <= 0) {
    throw new Error('Enter a valid TRX amount.');
  }

  const { wallet, privateKey } = await getSigningWalletContext();
  const contractAddress = String(input.contractAddress || DEFAULT_DIRECT_BUY_CONTRACT).trim();
  const contractState = await readDirectBuyContractState(contractAddress, wallet.address).catch(() =>
    buildFallbackDirectBuyContractState()
  );
  const estimatedTokens = computeEstimatedDirectBuyTokens(
    amountTrx,
    contractState.tokenPriceSun,
    contractState.tokenDecimals
  );
  const callValue = toSun(amountTrx);

  if (callValue <= 0) {
    throw new Error('Enter a valid TRX amount.');
  }

  const tronWeb = createTronWeb(privateKey);
  const contract = await getContract(contractAddress, tronWeb);
  const result = await contract.buyTokens().send({
    callValue,
    feeLimit:
      typeof input.feeLimitSun === 'number' && Number.isFinite(input.feeLimitSun)
        ? Math.max(1_000_000, Math.floor(input.feeLimitSun))
        : DEFAULT_DIRECT_BUY_FEE_LIMIT_SUN,
    shouldPollResponse: false,
  });
  const txId = extractTxid(result);

  if (!txId) {
    throw new Error('Transaction sent but txid was not returned.');
  }

  const split = computeDirectBuySplit(amountTrx);

  return {
    wallet,
    txId,
    explorerUrl: `https://tronscan.org/#/transaction/${txId}`,
    amountTrx,
    estimatedTokens,
    ownerShareTrx: split.ownerShareTrx,
    liquidityShareTrx: split.liquidityShareTrx,
    airdropShareTrx: split.airdropShareTrx,
    lockReleaseAt: Math.floor(Date.now() / 1000) + DEFAULT_LOCK_DURATION,
  };
}
