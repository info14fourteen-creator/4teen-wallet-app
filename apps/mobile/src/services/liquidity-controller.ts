import { TronWeb } from 'tronweb';

import { buildTrongridHeaders, TRONGRID_BASE_URL } from '../config/tron';
import { isValidPrivateKey, normalizePrivateKey } from './wallet/import';
import {
  ensureSigningWalletActive,
  getActiveWallet,
  getWalletSecret,
  type WalletMeta,
} from './wallet/storage';
import { getAccountResources, getTokenDetails, TRX_TOKEN_ID, trongridFetch } from './tron/api';
import {
  estimateContractCallResources,
  getAvailableResource,
  getResourceBurnSun,
  getResourceShortfall,
  getResourceUnitPricing,
  normalizeResourceAmount,
  type ContractCallResourceEstimate,
} from './wallet/resources';

const TRON_DERIVATION_PATH = "m/44'/195'/0'/0/0";
const SUN = 1_000_000;
const LIQUIDITY_EVENTS_LIMIT = 10;
const LIQUIDITY_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_EXECUTE_FEE_LIMIT_SUN = 150_000_000;
const DEFAULT_EXECUTION_FEE_LIMIT_FLOOR_SUN = 220_000_000;
const DEFAULT_EXECUTE_ESTIMATED_ENERGY = 220_000;
const DEFAULT_EXECUTE_ESTIMATED_BANDWIDTH = 650;

export const LIQUIDITY_CONTROLLER_ADDRESS = 'TVKBLwg222skKnZ3F3boTiH35KC7nvYEuZ';
export const LIQUIDITY_BOOTSTRAPPER_ADDRESS = 'TWfUee6qFV91t7KbFdYLEfpi8nprUaJ7dc';
export const LIQUIDITY_JUSTMONEY_EXECUTOR_ADDRESS = 'TWrz68MRTf1m9vv8xpcdMD4z9kjBxiHw7F';
export const LIQUIDITY_SUN_V3_EXECUTOR_ADDRESS = 'TU8EwEWg4K594zwThvhTZxqzEuEYuR46xh';
export const LIQUIDITY_CONTRACT_EVENTS_URL =
  'https://tronscan.org/#/contract/TVKBLwg222skKnZ3F3boTiH35KC7nvYEuZ/events';
export const LIQUIDITY_CONTROLLER_CONTRACT_URL =
  'https://tronscan.org/#/contract/TVKBLwg222skKnZ3F3boTiH35KC7nvYEuZ';
export const LIQUIDITY_BOOTSTRAPPER_CONTRACT_URL =
  'https://tronscan.org/#/contract/TWfUee6qFV91t7KbFdYLEfpi8nprUaJ7dc';
export const LIQUIDITY_JUSTMONEY_EXECUTOR_CONTRACT_URL =
  'https://tronscan.org/#/contract/TWrz68MRTf1m9vv8xpcdMD4z9kjBxiHw7F';
export const LIQUIDITY_SUN_V3_EXECUTOR_CONTRACT_URL =
  'https://tronscan.org/#/contract/TU8EwEWg4K594zwThvhTZxqzEuEYuR46xh';
export const LIQUIDITY_INFO_TITLE = 'Automated liquidity routing';
export const LIQUIDITY_INFO_TEXT =
  'Direct 4TEEN buys send 90% of purchase TRX into the FourteenLiquidityController. That controller holds the liquidity-side TRX and enforces the release rules on-chain.\n\nLiquidity can execute once per UTC day when the controller balance is at least 100 TRX. The released amount is 6.43% of the controller balance, split 50/50 between the JustMoney executor and the Sun.io V3 executor.\n\nThe LiquidityBootstrapper prepares executor token balances from FourteenVault before calling the controller. External automation may trigger this flow, but the schedule, threshold, percentage, and split are enforced by contracts.';

type LiquidityContract = {
  bootstrapAndExecute: () => {
    send: (options: {
      feeLimit?: number;
      shouldPollResponse?: boolean;
    }) => Promise<unknown>;
  };
};

type TrongridEventsResponse = {
  data?: {
    transaction_id?: string;
    block_timestamp?: number | string;
    result?: Record<string, string | number | undefined>;
  }[];
};

export type LiquidityExecutionEvent = {
  txId: string;
  explorerUrl: string;
  timestamp: number;
  totalTrx: number;
  justMoneyTrx: number;
  sunIoTrx: number;
};

export type LiquidityReceivedEvent = {
  txId: string;
  explorerUrl: string;
  timestamp: number;
  amountTrx: number;
};

export type LiquidityControllerSnapshot = {
  controllerAddress: string;
  bootstrapperAddress: string;
  justMoneyExecutorAddress: string;
  sunV3ExecutorAddress: string;
  executions: LiquidityExecutionEvent[];
  received: LiquidityReceivedEvent[];
  lastExecuteAt: number | null;
  latestReceivedTrx: number | null;
  historyStatus: 'ready' | 'empty' | 'unavailable';
  historyMessage: string;
};

export type LiquidityExecutionReceipt = {
  wallet: WalletMeta;
  txId: string;
  explorerUrl: string;
};

export type LiquidityExecutionReview = {
  wallet: WalletMeta;
  controllerAddress: string;
  bootstrapperAddress: string;
  resources: ContractCallResourceEstimate;
  trxCoverage: {
    trxBalanceSun: number;
    trxBalanceDisplay: string;
    missingTrxSun: number;
    canCoverBurn: boolean;
  };
};

type LiquidityCacheEntry = {
  savedAt: number;
  snapshot: LiquidityControllerSnapshot;
};

const liquidityMemoryCache = new Map<string, LiquidityCacheEntry>();
const liquidityInflight = new Map<string, Promise<LiquidityControllerSnapshot>>();

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

function buildExecutorAbi() {
  return [
    {
      constant: false,
      inputs: [],
      name: 'bootstrapAndExecute',
      outputs: [],
      payable: false,
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ];
}

function fromSun(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric / SUN;
}

function normalizeTimestamp(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function buildExplorerUrl(txId: string) {
  return txId ? `https://tronscan.org/#/transaction/${txId}` : 'https://tronscan.org/';
}

function extractTxId(result: unknown) {
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

function formatTrxBalanceDisplay(valueSun: number) {
  const trx = Math.max(0, Number(valueSun || 0)) / SUN;

  return `${trx.toFixed(trx >= 1 ? 3 : 6).replace(/\.?0+$/, '') || '0'} TRX`;
}

async function buildFallbackLiquidityResourceEstimate(input: {
  wallet: WalletMeta;
  privateKey: string;
}): Promise<ContractCallResourceEstimate> {
  const tronWeb = createTronWeb(input.privateKey, input.wallet.address);
  const [available, pricing] = await Promise.all([
    getAccountResources(input.wallet.address),
    getResourceUnitPricing(tronWeb),
  ]);

  const estimatedEnergy = normalizeResourceAmount(DEFAULT_EXECUTE_ESTIMATED_ENERGY);
  const estimatedBandwidth = normalizeResourceAmount(DEFAULT_EXECUTE_ESTIMATED_BANDWIDTH);
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
        DEFAULT_EXECUTE_FEE_LIMIT_SUN,
        Math.ceil(Math.max(estimatedBurnSun, 1_000_000) * 1.15)
      )
    ),
  };
}

async function fetchControllerEvents(eventName: 'LiquidityExecuted' | 'TRXReceived') {
  const response = await trongridFetch<TrongridEventsResponse>(
    `/v1/contracts/${LIQUIDITY_CONTROLLER_ADDRESS}/events`,
    {
      event_name: eventName,
      limit: LIQUIDITY_EVENTS_LIMIT,
    }
  );

  return Array.isArray(response.data) ? response.data : [];
}

function mapExecutionEvents(events: TrongridEventsResponse['data']): LiquidityExecutionEvent[] {
  return (events || [])
    .map((event) => {
      const txId = String(event.transaction_id || '').trim();
      const result = event.result || {};

      return {
        txId,
        explorerUrl: buildExplorerUrl(txId),
        timestamp: normalizeTimestamp(event.block_timestamp),
        totalTrx: fromSun(result.totalAmount),
        justMoneyTrx: fromSun(result.amountA),
        sunIoTrx: fromSun(result.amountB),
      };
    })
    .filter((event) => event.txId || event.timestamp || event.totalTrx > 0);
}

function mapReceivedEvents(events: TrongridEventsResponse['data']): LiquidityReceivedEvent[] {
  return (events || [])
    .map((event) => {
      const txId = String(event.transaction_id || '').trim();

      return {
        txId,
        explorerUrl: buildExplorerUrl(txId),
        timestamp: normalizeTimestamp(event.block_timestamp),
        amountTrx: fromSun(event.result?.amount),
      };
    })
    .filter((event) => event.txId || event.timestamp || event.amountTrx > 0);
}

async function readLiquiditySnapshot() {
  const [executionEvents, receivedEvents] = await Promise.all([
    fetchControllerEvents('LiquidityExecuted'),
    fetchControllerEvents('TRXReceived'),
  ]);

  const executions = mapExecutionEvents(executionEvents);
  const received = mapReceivedEvents(receivedEvents);

  return {
    controllerAddress: LIQUIDITY_CONTROLLER_ADDRESS,
    bootstrapperAddress: LIQUIDITY_BOOTSTRAPPER_ADDRESS,
    justMoneyExecutorAddress: LIQUIDITY_JUSTMONEY_EXECUTOR_ADDRESS,
    sunV3ExecutorAddress: LIQUIDITY_SUN_V3_EXECUTOR_ADDRESS,
    executions,
    received,
    lastExecuteAt: executions[0]?.timestamp || null,
    latestReceivedTrx: received[0]?.amountTrx ?? null,
    historyStatus: executions.length || received.length ? 'ready' : 'empty',
    historyMessage:
      executions.length || received.length
        ? ''
        : 'No controller events found yet.',
  } satisfies LiquidityControllerSnapshot;
}

export async function loadLiquidityControllerSnapshot(options?: {
  force?: boolean;
}): Promise<LiquidityControllerSnapshot> {
  const cacheKey = 'default';
  const cached = liquidityMemoryCache.get(cacheKey);

  if (!options?.force && cached && Date.now() - cached.savedAt < LIQUIDITY_CACHE_TTL_MS) {
    return cached.snapshot;
  }

  const inflightKey = options?.force ? `${cacheKey}:force` : cacheKey;
  const existing = liquidityInflight.get(inflightKey);

  if (existing) {
    return existing;
  }

  const task = readLiquiditySnapshot()
    .then((snapshot) => {
      liquidityMemoryCache.set(cacheKey, {
        savedAt: Date.now(),
        snapshot,
      });
      return snapshot;
    })
    .catch((error) => {
      const fallback: LiquidityControllerSnapshot = {
        controllerAddress: LIQUIDITY_CONTROLLER_ADDRESS,
        bootstrapperAddress: LIQUIDITY_BOOTSTRAPPER_ADDRESS,
        justMoneyExecutorAddress: LIQUIDITY_JUSTMONEY_EXECUTOR_ADDRESS,
        sunV3ExecutorAddress: LIQUIDITY_SUN_V3_EXECUTOR_ADDRESS,
        executions: [],
        received: [],
        lastExecuteAt: null,
        latestReceivedTrx: null,
        historyStatus: 'unavailable',
        historyMessage:
          error instanceof Error ? error.message : 'Could not load liquidity events.',
      };
      return fallback;
    })
    .finally(() => {
      liquidityInflight.delete(inflightKey);
    });

  liquidityInflight.set(inflightKey, task);
  return task;
}

export function clearLiquidityControllerCaches(): void {
  liquidityMemoryCache.clear();
  liquidityInflight.clear();
}

async function getSigningWalletContext() {
  const initialWallet = await getActiveWallet();
  const wallet = (await ensureSigningWalletActive()) ?? initialWallet;

  if (!wallet) {
    throw new Error('No wallet available for liquidity execution.');
  }

  if (wallet.kind === 'watch-only') {
    throw new Error('Liquidity execution requires a full-access wallet.');
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

  return { wallet, privateKey };
}

export async function executeLiquidityController(options?: {
  feeLimitSun?: number;
}): Promise<LiquidityExecutionReceipt> {
  const { wallet, privateKey } = await getSigningWalletContext();
  const tronWeb = createTronWeb(privateKey, wallet.address);
  const contract = (await tronWeb.contract(
    buildExecutorAbi(),
    LIQUIDITY_BOOTSTRAPPER_ADDRESS
  )) as unknown as LiquidityContract;

  const result = await contract.bootstrapAndExecute().send({
    feeLimit:
      typeof options?.feeLimitSun === 'number' && Number.isFinite(options.feeLimitSun)
        ? Math.max(1_000_000, Math.floor(Math.max(options.feeLimitSun, DEFAULT_EXECUTION_FEE_LIMIT_FLOOR_SUN)))
        : DEFAULT_EXECUTION_FEE_LIMIT_FLOOR_SUN,
    shouldPollResponse: false,
  });
  const txId = extractTxId(result);

  if (!txId) {
    throw new Error('Transaction sent but txid was not returned.');
  }

  liquidityMemoryCache.delete('default');

  return {
    wallet,
    txId,
    explorerUrl: buildExplorerUrl(txId),
  };
}

export async function estimateLiquidityControllerExecution(): Promise<LiquidityExecutionReview> {
  const { wallet, privateKey } = await getSigningWalletContext();
  const tronWeb = createTronWeb(privateKey, wallet.address);

  let resources = await estimateContractCallResources({
    tronWeb,
    privateKey,
    ownerAddress: wallet.address,
    contractAddress: LIQUIDITY_BOOTSTRAPPER_ADDRESS,
    functionSelector: 'bootstrapAndExecute()',
    parameters: [],
    feeLimitSun: DEFAULT_EXECUTE_FEE_LIMIT_SUN,
    maxFeeLimitSun: DEFAULT_EXECUTE_FEE_LIMIT_SUN,
  }).catch(async (error) => {
    console.warn('Liquidity resource estimate fallback:', error);
    return buildFallbackLiquidityResourceEstimate({ wallet, privateKey });
  });

  if (resources.estimatedEnergy <= 0) {
    console.warn('Liquidity resource estimate returned zero energy; using fallback.');
    resources = await buildFallbackLiquidityResourceEstimate({ wallet, privateKey });
  }

  const trxBalance = await getTokenDetails(wallet.address, TRX_TOKEN_ID, false, wallet.id);
  const trxBalanceSun = Math.max(0, Number(trxBalance.balanceRaw || '0'));

  return {
    wallet,
    controllerAddress: LIQUIDITY_CONTROLLER_ADDRESS,
    bootstrapperAddress: LIQUIDITY_BOOTSTRAPPER_ADDRESS,
    resources,
    trxCoverage: {
      trxBalanceSun,
      trxBalanceDisplay: formatTrxBalanceDisplay(trxBalanceSun),
      missingTrxSun: Math.max(0, resources.estimatedBurnSun - trxBalanceSun),
      canCoverBurn: trxBalanceSun >= resources.estimatedBurnSun,
    },
  };
}

export function formatLiquidityTrx(value: number | null | undefined) {
  const safe = Number(value || 0);

  if (!Number.isFinite(safe) || safe <= 0) {
    return '0.00';
  }

  if (Math.abs(safe) >= 1_000_000_000) {
    return `${(safe / 1_000_000_000).toFixed(2)}b`;
  }

  if (Math.abs(safe) >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(2)}m`;
  }

  if (Math.abs(safe) >= 1_000) {
    return `${(safe / 1_000).toFixed(2)}k`;
  }

  return safe.toFixed(2);
}

export function formatLiquidityDate(timestamp: number | null | undefined) {
  const safe = Number(timestamp || 0);

  if (!Number.isFinite(safe) || safe <= 0) {
    return '—';
  }

  return new Date(safe).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function shortLiquidityTx(txId: string) {
  const value = String(txId || '').trim();
  return value ? `${value.slice(0, 8)}...` : 'View';
}
