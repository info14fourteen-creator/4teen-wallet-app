import { TronWeb } from 'tronweb';

import { buildTrongridHeaders, TRONGRID_BASE_URL } from '../config/tron';
import {
  FOURTEEN_CONTRACT,
  FOURTEEN_LOGO,
  TRX_TOKEN_ID,
  getTokenDetails,
  trongridFetch,
} from './tron/api';
import { loadDirectBuyPriceSnapshot } from './direct-buy';

const DEFAULT_DECIMALS = 6;
const DEFAULT_UNLOCK_DAYS = 14;
const LOCK_DURATION_MS = DEFAULT_UNLOCK_DAYS * 24 * 60 * 60 * 1000;
const UNLOCK_TIMELINE_CACHE_TTL_MS = 60 * 1000;

export const UNLOCK_TIMELINE_INFO_TITLE = 'Direct-buy lock map';
export const UNLOCK_TIMELINE_INFO_TEXT =
  'Every direct 4TEEN buy mints tokens immediately, then locks that batch for 14 days. This view tracks only direct buys tied to the selected wallet, not generic swap history.\n\nEach row shows the amount, UTC unlock time, live countdown, current lock state, and the Tronscan transaction behind the event. You can verify the buyer, amount, block time, and event path on-chain.\n\nWhen the countdown hits zero, the batch moves to Unlocked automatically and becomes free to move or swap. Use this as your release map: what is locked, what is liquid, and what unlocks next.';

export type UnlockTimelineEvent = {
  txId: string;
  explorerUrl: string;
  amount: number;
  unlockAt: number;
  unlockLabel: string;
};

export type UnlockTimelineSnapshot = {
  contractAddress: string;
  contractLogo: string;
  totalBalance: number | null;
  lockedBalance: number | null;
  availableBalance: number | null;
  marketRateTrx: number | null;
  marketRateUsd: number | null;
  directBuyRateTrx: number | null;
  directBuyRateUsd: number | null;
  events: UnlockTimelineEvent[];
  balanceError: string | null;
  rateError: string | null;
  historyStatus: 'ready' | 'empty' | 'rate-limited' | 'unavailable';
  historyMessage: string;
};

type UnlockTimelineCacheEntry = {
  savedAt: number;
  snapshot: UnlockTimelineSnapshot;
};

type FourteenTimelineContract = {
  balanceOf: (address: string) => { call: () => Promise<unknown> };
  lockedBalanceOf: (address: string) => { call: () => Promise<unknown> };
};

type TrongridEventsResponse = {
  data?: {
    transaction_id?: string;
    block_timestamp?: number | string;
    result?: {
      buyer?: string;
      amountTokens?: string;
    };
  }[];
};

const unlockTimelineMemoryCache = new Map<string, UnlockTimelineCacheEntry>();
const unlockTimelineInflight = new Map<string, Promise<UnlockTimelineSnapshot>>();

function createReadonlyTronWeb(address?: string) {
  const tronWeb = new TronWeb({
    fullHost: TRONGRID_BASE_URL,
    headers: buildTrongridHeaders(),
  });

  if (address) {
    try {
      tronWeb.setAddress(address);
    } catch {}
  }

  return tronWeb;
}

function normalizeAddress(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isUsableAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value || '').trim());
}

function normalizeCallNumber(value: unknown) {
  const resolved =
    (value as { toString?: () => string })?.toString?.() ||
    (value as { _hex?: string })?._hex ||
    (value as { [index: number]: unknown })?.[0] ||
    value;

  const numeric = Number(resolved);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeTokenUnits(value: unknown, decimals = DEFAULT_DECIMALS) {
  const raw = normalizeCallNumber(value);
  if (!Number.isFinite(raw)) return null;
  return raw / Math.pow(10, decimals);
}

function decodeHexUint256(hexValue: string | null | undefined) {
  if (!hexValue || typeof hexValue !== 'string') return null;

  try {
    return parseInt(hexValue, 16);
  } catch {
    return null;
  }
}

function buildContractAbi() {
  return [
    {
      inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
      name: 'lockedBalanceOf',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ];
}

function formatUnlockDate(unlockAt: number) {
  return new Date(unlockAt).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  });
}

async function readContractUint256(input: {
  walletAddress: string;
  contractAddress: string;
  methodName: 'balanceOf' | 'lockedBalanceOf';
  decimals?: number;
}) {
  const walletAddress = normalizeAddress(input.walletAddress);
  const contractAddress = normalizeAddress(input.contractAddress);
  const decimals = input.decimals ?? DEFAULT_DECIMALS;

  if (!isUsableAddress(walletAddress)) {
    throw new Error(`${input.methodName}: invalid wallet address`);
  }

  if (!isUsableAddress(contractAddress)) {
    throw new Error(`${input.methodName}: invalid contract address`);
  }

  const tronWeb = createReadonlyTronWeb(walletAddress);

  try {
    const contract = (await tronWeb.contract(
      buildContractAbi(),
      contractAddress
    )) as unknown as FourteenTimelineContract;
    const raw = await contract[input.methodName](walletAddress).call();
    const normalized = normalizeTokenUnits(raw, decimals);

    if (normalized === null) {
      throw new Error(`${input.methodName}: invalid result`);
    }

    return normalized;
  } catch (contractError) {
    const ownerHex = tronWeb.address.toHex(walletAddress);
    const contractHex = tronWeb.address.toHex(contractAddress);

    const result = await tronWeb.transactionBuilder.triggerConstantContract(
      contractHex,
      `${input.methodName}(address)`,
      {},
      [{ type: 'address', value: walletAddress }],
      ownerHex
    );

    const decoded = decodeHexUint256(result?.constant_result?.[0] || null);
    const normalized = normalizeTokenUnits(decoded, decimals);

    if (normalized === null) {
      throw contractError;
    }

    return normalized;
  }
}

function resolveBuyerAddress(tronWeb: TronWeb, rawBuyer: string) {
  const value = String(rawBuyer || '').trim();
  if (!value) return '';

  if (isUsableAddress(value)) {
    return value;
  }

  const normalizedHex = value.replace(/^0x/i, '');
  if (/^(41)?[0-9a-fA-F]{40}$/.test(normalizedHex) || /^41[0-9a-fA-F]{40}$/.test(normalizedHex)) {
    try {
      const candidate = normalizedHex.startsWith('41') ? normalizedHex : `41${normalizedHex}`;
      return tronWeb.address.fromHex(candidate);
    } catch {
      return '';
    }
  }

  return '';
}

async function fetchUnlockEvents(input: {
  walletAddress: string;
  contractAddress?: string;
  decimals?: number;
  unlockDays?: number;
}) {
  const walletAddress = normalizeAddress(input.walletAddress);
  const contractAddress = normalizeAddress(input.contractAddress || FOURTEEN_CONTRACT);
  const decimals = input.decimals ?? DEFAULT_DECIMALS;
  const lockDurationMs = (input.unlockDays ?? DEFAULT_UNLOCK_DAYS) * 24 * 60 * 60 * 1000;
  const tronWeb = createReadonlyTronWeb(walletAddress);

  const response = await trongridFetch<TrongridEventsResponse>(
    `/v1/contracts/${contractAddress}/events`,
    {
      event_name: 'BuyTokens',
      limit: 200,
    }
  );

  const events = Array.isArray(response.data) ? response.data : [];
  const dedupe = new Set<string>();

  return events
    .filter((event) => {
      const buyer = resolveBuyerAddress(tronWeb, String(event.result?.buyer || ''));
      return buyer === walletAddress;
    })
    .map((event) => {
      const txId = String(event.transaction_id || '').trim();
      const blockTimestamp = Number(event.block_timestamp || 0);
      const amountRaw = Number(event.result?.amountTokens || 0);
      const amount = Number.isFinite(amountRaw) ? amountRaw / Math.pow(10, decimals) : 0;
      const unlockAt = blockTimestamp + lockDurationMs;
      const dedupeKey = `${txId}:${unlockAt}`;

      if (!txId || !blockTimestamp || !Number.isFinite(amount) || amount <= 0 || dedupe.has(dedupeKey)) {
        return null;
      }

      dedupe.add(dedupeKey);

      return {
        txId,
        explorerUrl: `https://tronscan.org/#/transaction/${txId}`,
        amount,
        unlockAt,
        unlockLabel: formatUnlockDate(unlockAt),
      } satisfies UnlockTimelineEvent;
    })
    .filter((event): event is UnlockTimelineEvent => Boolean(event))
    .sort((left, right) => left.unlockAt - right.unlockAt);
}

export async function loadUnlockTimelineSnapshot(input: {
  walletAddress: string;
  contractAddress?: string;
  force?: boolean;
}) {
  const walletAddress = normalizeAddress(input.walletAddress);
  const contractAddress = normalizeAddress(input.contractAddress || FOURTEEN_CONTRACT);
  const force = input.force === true;

  if (!isUsableAddress(walletAddress)) {
    throw new Error('Wallet address not available.');
  }

  const cacheKey = `${walletAddress.toLowerCase()}:${contractAddress.toLowerCase()}`;

  if (!force) {
    const cached = unlockTimelineMemoryCache.get(cacheKey);

    if (cached && Date.now() - cached.savedAt < UNLOCK_TIMELINE_CACHE_TTL_MS) {
      return cached.snapshot;
    }
  } else {
    unlockTimelineMemoryCache.delete(cacheKey);
  }

  const inflight = unlockTimelineInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const [balancesResult, marketPriceResult, directBuyPriceResult, eventsResult] =
      await Promise.allSettled([
      Promise.all([
        readContractUint256({
          walletAddress,
          contractAddress,
          methodName: 'balanceOf',
        }),
        readContractUint256({
          walletAddress,
          contractAddress,
          methodName: 'lockedBalanceOf',
        }),
      ]),
      Promise.all([
        getTokenDetails(walletAddress, contractAddress, false),
        getTokenDetails(walletAddress, TRX_TOKEN_ID, false),
      ]),
      loadDirectBuyPriceSnapshot({
        contractAddress,
        readerAddress: walletAddress,
      }),
      fetchUnlockEvents({
        walletAddress,
        contractAddress,
      }),
    ]);

    const totalBalance =
      balancesResult.status === 'fulfilled' ? balancesResult.value[0] : null;
    const lockedBalance =
      balancesResult.status === 'fulfilled' ? balancesResult.value[1] : null;
    const availableBalance =
      totalBalance !== null && lockedBalance !== null
        ? Math.max(0, Number((totalBalance - lockedBalance).toFixed(6)))
        : null;

    const marketRateUsd =
      marketPriceResult.status === 'fulfilled'
        ? Number(marketPriceResult.value[0]?.priceInUsd || 0) || null
        : null;
    const trxUsd =
      marketPriceResult.status === 'fulfilled'
        ? Number(marketPriceResult.value[1]?.priceInUsd || 0) || null
        : null;
    const marketRateTrx =
      marketRateUsd && trxUsd && trxUsd > 0 ? Number((marketRateUsd / trxUsd).toFixed(6)) : null;
    const directBuyRateTrx =
      directBuyPriceResult.status === 'fulfilled'
        ? Number(directBuyPriceResult.value.tokenPriceTrx || 0) || null
        : null;
    const directBuyRateUsd =
      directBuyRateTrx && trxUsd && trxUsd > 0
        ? Number((directBuyRateTrx * trxUsd).toFixed(6))
        : null;
    const events = eventsResult.status === 'fulfilled' ? eventsResult.value : [];

    let historyStatus: UnlockTimelineSnapshot['historyStatus'] = 'ready';
    let historyMessage = '';

    if (eventsResult.status === 'rejected') {
      const message = String(
        eventsResult.reason instanceof Error ? eventsResult.reason.message : eventsResult.reason || ''
      );
      const isRateLimited = message.includes('429') || message.toLowerCase().includes('rate limit');
      historyStatus = isRateLimited ? 'rate-limited' : 'unavailable';
      historyMessage = isRateLimited
        ? 'Unlock history is temporarily rate-limited. Pull to refresh in a moment.'
        : 'Unlock history is temporarily unavailable.';
    } else if (events.length === 0) {
      historyStatus = 'empty';
      historyMessage = 'No direct-buy unlock entries found for this wallet yet.';
    }

    const snapshot = {
      contractAddress,
      contractLogo: FOURTEEN_LOGO,
      totalBalance,
      lockedBalance,
      availableBalance,
      marketRateTrx,
      marketRateUsd,
      directBuyRateTrx,
      directBuyRateUsd,
      events,
      balanceError:
        balancesResult.status === 'rejected'
          ? balancesResult.reason instanceof Error
            ? balancesResult.reason.message
            : 'Failed to load balances.'
          : null,
      rateError:
        marketPriceResult.status === 'rejected' && directBuyPriceResult.status === 'rejected'
          ? marketPriceResult.reason instanceof Error
            ? marketPriceResult.reason.message
            : 'Failed to load 4TEEN price.'
          : null,
      historyStatus,
      historyMessage,
    } satisfies UnlockTimelineSnapshot;

    unlockTimelineMemoryCache.set(cacheKey, {
      savedAt: Date.now(),
      snapshot,
    });

    return snapshot;
  })();

  unlockTimelineInflight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    unlockTimelineInflight.delete(cacheKey);
  }
}

export function formatUnlockCountdown(ms: number) {
  if (ms <= 0) return '00:00:00';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export function formatUnlockAmount(value: number, digits = 6) {
  const safe = Number(value || 0);

  if (!Number.isFinite(safe)) {
    return '0.000000';
  }

  return safe.toFixed(digits);
}

export function formatUnlockCompact(value: number | null | undefined) {
  const safe = Number(value || 0);

  if (!Number.isFinite(safe)) {
    return '0.00';
  }

  const abs = Math.abs(safe);

  if (abs >= 1_000_000_000) {
    return `${(safe / 1_000_000_000).toFixed(2)}b`;
  }

  if (abs >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(2)}m`;
  }

  if (abs >= 1_000) {
    return `${(safe / 1_000).toFixed(2)}k`;
  }

  return safe.toFixed(2);
}

export function formatUnlockRate(value: number | null | undefined) {
  const safe = Number(value || 0);

  if (!Number.isFinite(safe) || safe <= 0) {
    return '—';
  }

  return safe.toFixed(6);
}

export function formatUnlockUsd(value: number | null | undefined) {
  const safe = Number(value || 0);

  if (!Number.isFinite(safe) || safe <= 0) {
    return '—';
  }

  return safe.toFixed(6);
}

export function getUnlockStatus(event: UnlockTimelineEvent, now = Date.now()) {
  const unlocked = event.unlockAt <= now;

  return {
    unlocked,
    countdown: unlocked ? '00:00:00' : formatUnlockCountdown(event.unlockAt - now),
  };
}

export const UNLOCK_TIMELINE_CONTRACT = FOURTEEN_CONTRACT;
export const UNLOCK_TIMELINE_DECIMALS = DEFAULT_DECIMALS;
export const UNLOCK_TIMELINE_DAYS = DEFAULT_UNLOCK_DAYS;
export const UNLOCK_TIMELINE_LOCK_DURATION_MS = LOCK_DURATION_MS;
