import AsyncStorage from '@react-native-async-storage/async-storage';
import { TronWeb } from 'tronweb';

import { getFourteenApiBaseUrls, TRONGRID_BASE_URL, buildTrongridHeaders } from '../config/tron';
import { translateNow } from '../i18n';
import { isValidPrivateKey, normalizePrivateKey } from './wallet/import';
import { getActiveWallet, getWalletSecret, type WalletMeta } from './wallet/storage';
import { trongridFetch } from './tron/api';

const TRON_DERIVATION_PATH = "m/44'/195'/0'/0/0";
const ZERO_ADDRESS_BASE58 = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const AIRDROP_VAULT_CONTRACT = 'TV6eXKWCsZ15c3Svz39mRQWtBsqvNNBwpQ';
const AIRDROP_TOKEN_DECIMALS = 6;
const AIRDROP_CACHE_TTL_MS = 60 * 1000;
const AIRDROP_CACHE_PREFIX = 'fourteen_airdrop_onchain_cache_v1';
const AIRDROP_EVENT_CACHE_PREFIX = 'fourteen_airdrop_event_cache_v1';
const AIRDROP_TOTAL_ALLOCATION_RAW = String(1_500_000 * 10 ** AIRDROP_TOKEN_DECIMALS);
const TRONSCAN_TX_BASE_URL = 'https://tronscan.org/#/transaction/';
const AIRDROP_EVENT_SCAN_PAGES = 40;

const AIRDROP_PLATFORM_CONFIG = [
  { key: 'instagram', bit: 1, title: 'Instagram' },
  { key: 'x', bit: 2, title: 'X' },
  { key: 'telegram', bit: 4, title: 'Telegram' },
  { key: 'facebook', bit: 8, title: 'Facebook' },
  { key: 'youtube', bit: 16, title: 'YouTube' },
] as const;

export type AirdropPlatformKey = (typeof AIRDROP_PLATFORM_CONFIG)[number]['key'];

export type AirdropPlatformClaim = {
  key: AirdropPlatformKey;
  title: string;
  bit: number;
  claimed: boolean;
  amountRaw: string | null;
  amountDisplay: string;
  claimedAt: number | null;
  claimedAtLabel: string;
  txId: string | null;
  explorerUrl: string | null;
};

export type AirdropVaultOnChainSnapshot = {
  walletAddress: string;
  contractAddress: string;
  operatorAddress: string;
  currentWave: number;
  nextWaveTime: number;
  nextWaveLabel: string;
  claimsCount: number;
  unlockedTotalRaw: string;
  unlockedTotalDisplay: string;
  totalDistributedRaw: string;
  totalDistributedDisplay: string;
  remainingUnlockedRaw: string;
  remainingUnlockedDisplay: string;
  remainingPlannedRaw: string;
  remainingPlannedDisplay: string;
  availableToDistributeNowRaw: string;
  availableToDistributeNowDisplay: string;
  vaultBalanceRaw: string;
  vaultBalanceDisplay: string;
  platforms: Record<AirdropPlatformKey, AirdropPlatformClaim>;
  loadedAt: number;
};

type AirdropOnChainCacheEntry = {
  savedAt: number;
  snapshot: AirdropVaultOnChainSnapshot;
};

type AirdropEventCacheEntry = {
  savedAt: number;
  eventsByBit: Record<number, { amountRaw: string; txId: string; timestamp: number }>;
};

type AirdropVaultContract = {
  operator: () => { call: () => Promise<unknown> };
  currentWave: () => { call: () => Promise<unknown> };
  nextWaveTime: () => { call: () => Promise<unknown> };
  waveInfo: () => { call: () => Promise<unknown> };
  availableToDistributeNow: () => { call: () => Promise<unknown> };
  claimsCount: (wallet: string) => { call: () => Promise<unknown> };
  isClaimedPlatform: (wallet: string, bit: number) => { call: () => Promise<unknown> };
};

type TrongridContractEventsResponse = {
  data?: {
    transaction_id?: string;
    block_timestamp?: number | string;
    result?: Record<string, unknown>;
  }[];
  meta?: {
    fingerprint?: string;
  };
};

const airdropMemoryCache = new Map<string, AirdropOnChainCacheEntry>();
const airdropInflight = new Map<string, Promise<AirdropVaultOnChainSnapshot>>();
const airdropEventMemoryCache = new Map<string, AirdropEventCacheEntry>();

export type TelegramAirdropGuard = {
  canLink: boolean;
  canQueueClaim: boolean;
  walletLinked: boolean;
  telegramLinked: boolean;
  walletAlreadyClaimed: boolean;
  telegramAlreadyClaimed: boolean;
  walletBlockedByLegacyClaim: boolean;
  telegramBlockedByLegacyClaim: boolean;
  walletLinkedTelegramUserId: string | null;
  telegramLinkedWalletAddress: string | null;
  claimedTxid: string | null;
};

export type TelegramAirdropOverview = {
  walletAddress: string;
  guard: TelegramAirdropGuard;
  link: {
    telegram_user_id?: string;
    telegram_username?: string | null;
    verified_at?: string;
  } | null;
  claim: {
    status?: string;
    reward_amount?: string;
    txid?: string | null;
    failure_reason?: string | null;
    queued_at?: string | null;
    sent_at?: string | null;
  } | null;
  session: {
    status?: string;
    expires_at?: string;
  } | null;
};

export type TelegramAirdropStartResult = {
  wallet: WalletMeta;
  sessionToken: string;
  httpsUrl: string;
  appUrl: string;
  expiresAt: string;
};

export const AIRDROP_SOCIAL_URLS: Record<AirdropPlatformKey, string> = {
  instagram: 'https://instagram.com/fourteentoken',
  x: 'https://x.com/4teen_me',
  telegram: 'https://t.me/fourteentoken',
  facebook: 'https://facebook.com/Fourteentoken',
  youtube: 'https://www.youtube.com/@4teentoken',
};

export type ActiveWalletAirdropSnapshot = {
  wallet: WalletMeta | null;
  overview: TelegramAirdropOverview | null;
  onChain: AirdropVaultOnChainSnapshot | null;
};

class AirdropApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AirdropApiError';
    this.status = status;
  }
}

function buildApiUrl(baseUrl: string, path: string, params?: Record<string, string>) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

function buildAirdropCacheKey(walletAddress: string) {
  return `${AIRDROP_CACHE_PREFIX}:${String(walletAddress || '').trim().toLowerCase()}`;
}

function buildAirdropEventCacheKey(walletAddress: string) {
  return `${AIRDROP_EVENT_CACHE_PREFIX}:${String(walletAddress || '').trim().toLowerCase()}`;
}

function createTronWeb(privateKey?: string, address?: string) {
  const tronWeb = new TronWeb({
    fullHost: TRONGRID_BASE_URL,
    headers: buildTrongridHeaders(),
    privateKey,
  });

  const ownerAddress = address || ZERO_ADDRESS_BASE58;

  if (ownerAddress) {
    try {
      tronWeb.setAddress(ownerAddress);
    } catch {}
  }

  return tronWeb;
}

function isUsableAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value || '').trim());
}

function buildAirdropVaultAbi() {
  return [
    {
      inputs: [],
      name: 'operator',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'currentWave',
      outputs: [{ internalType: 'int8', name: '', type: 'int8' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'nextWaveTime',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'waveInfo',
      outputs: [
        { internalType: 'int8', name: 'wave', type: 'int8' },
        { internalType: 'uint256', name: 'unlocked', type: 'uint256' },
        { internalType: 'uint256', name: 'distributed', type: 'uint256' },
        { internalType: 'uint256', name: 'remainingNow', type: 'uint256' },
        { internalType: 'uint256', name: 'balance', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'availableToDistributeNow',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: 'wallet', type: 'address' }],
      name: 'claimsCount',
      outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'wallet', type: 'address' },
        { internalType: 'uint8', name: 'platformBit', type: 'uint8' },
      ],
      name: 'isClaimedPlatform',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function',
    },
  ];
}

function readTupleValue(raw: unknown, index: number, name?: string) {
  const record = raw as Record<string, unknown> | null | undefined;
  const value = Array.isArray(raw) ? raw[index] : record?.[index] ?? (name ? record?.[name] : undefined);

  if (value === null || value === undefined) return '';

  if (typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    return (value as { toString: () => string }).toString();
  }

  return String(value);
}

function readBoolean(raw: unknown) {
  const value = String(
    (raw as { toString?: () => string })?.toString?.() ?? raw ?? ''
  )
    .trim()
    .toLowerCase();
  return value === 'true' || value === '1';
}

function normalizeIntegerString(value: unknown, fallback = '0') {
  const raw = String(
    (value as { toString?: () => string })?.toString?.() ?? value ?? fallback
  ).trim();

  if (/^-?\d+$/.test(raw)) {
    return raw;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)) : fallback;
}

function toSafeNumber(value: unknown, fallback = 0) {
  const parsed = Number(normalizeIntegerString(value, String(fallback)));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatTokenAmount(rawValue: unknown) {
  const raw = Number(normalizeIntegerString(rawValue, '0'));
  if (!Number.isFinite(raw) || raw <= 0) {
    return '0';
  }

  const normalized = raw / Math.pow(10, AIRDROP_TOKEN_DECIMALS);
  return normalized.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: AIRDROP_TOKEN_DECIMALS,
  });
}

function formatTimestampLabel(timestamp: number | null) {
  if (!timestamp || !Number.isFinite(timestamp) || timestamp <= 0) {
    return translateNow('Not received yet');
  }

  return new Date(timestamp).toLocaleString();
}

function resolveAddress(tronWeb: TronWeb, rawValue: unknown) {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  if (isUsableAddress(value)) {
    return value;
  }

  const normalizedHex = value.replace(/^0x/i, '');
  if (/^(41)?[0-9a-fA-F]{40}$/.test(normalizedHex)) {
    try {
      const candidate = normalizedHex.startsWith('41') ? normalizedHex : `41${normalizedHex}`;
      return tronWeb.address.fromHex(candidate);
    } catch {
      return '';
    }
  }

  return '';
}

async function readAirdropCache(walletAddress: string) {
  const cacheKey = buildAirdropCacheKey(walletAddress);
  const memory = airdropMemoryCache.get(cacheKey);

  if (memory && Date.now() - memory.savedAt < AIRDROP_CACHE_TTL_MS) {
    return memory.snapshot;
  }

  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as AirdropOnChainCacheEntry;
    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      !parsed.snapshot ||
      typeof parsed.snapshot.walletAddress !== 'string'
    ) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    if (Date.now() - parsed.savedAt >= AIRDROP_CACHE_TTL_MS) {
      return null;
    }

    airdropMemoryCache.set(cacheKey, parsed);
    return parsed.snapshot;
  } catch {
    return null;
  }
}

async function writeAirdropCache(walletAddress: string, snapshot: AirdropVaultOnChainSnapshot) {
  const cacheKey = buildAirdropCacheKey(walletAddress);
  const payload = {
    savedAt: Date.now(),
    snapshot,
  } satisfies AirdropOnChainCacheEntry;

  airdropMemoryCache.set(cacheKey, payload);
  await AsyncStorage.setItem(cacheKey, JSON.stringify(payload)).catch(() => null);
}

async function readAirdropEventCache(walletAddress: string) {
  const cacheKey = buildAirdropEventCacheKey(walletAddress);
  const memory = airdropEventMemoryCache.get(cacheKey);

  if (memory) {
    return new Map(
      Object.entries(memory.eventsByBit).map(([bit, event]) => [Number(bit), event] as const)
    );
  }

  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) {
      return new Map<number, { amountRaw: string; txId: string; timestamp: number }>();
    }

    const parsed = JSON.parse(raw) as AirdropEventCacheEntry;
    if (!parsed || !parsed.eventsByBit || typeof parsed.eventsByBit !== 'object') {
      await AsyncStorage.removeItem(cacheKey);
      return new Map<number, { amountRaw: string; txId: string; timestamp: number }>();
    }

    airdropEventMemoryCache.set(cacheKey, parsed);
    return new Map(
      Object.entries(parsed.eventsByBit).map(([bit, event]) => [Number(bit), event] as const)
    );
  } catch {
    return new Map<number, { amountRaw: string; txId: string; timestamp: number }>();
  }
}

async function writeAirdropEventCache(
  walletAddress: string,
  eventsByBit: Map<number, { amountRaw: string; txId: string; timestamp: number }>
) {
  const cacheKey = buildAirdropEventCacheKey(walletAddress);
  const payload = {
    savedAt: Date.now(),
    eventsByBit: Object.fromEntries(eventsByBit.entries()),
  } satisfies AirdropEventCacheEntry;

  airdropEventMemoryCache.set(cacheKey, payload);
  await AsyncStorage.setItem(cacheKey, JSON.stringify(payload)).catch(() => null);
}

async function fetchAirdropClaimEvents(
  walletAddress: string,
  options?: { requiredBits?: number[] }
) {
  const tronWeb = createTronWeb(undefined, walletAddress);
  const requiredBits = new Set((options?.requiredBits || []).filter((bit) => bit > 0));
  const eventsByBit = await readAirdropEventCache(walletAddress);
  let fingerprint: string | undefined;

  if (requiredBits.size > 0 && Array.from(requiredBits).every((bit) => eventsByBit.has(bit))) {
    return eventsByBit;
  }

  for (let page = 0; page < AIRDROP_EVENT_SCAN_PAGES; page += 1) {
    const response = await trongridFetch<TrongridContractEventsResponse>(
      `/v1/contracts/${AIRDROP_VAULT_CONTRACT}/events`,
      {
        event_name: 'Airdropped',
        only_confirmed: true,
        order_by: 'block_timestamp,desc',
        limit: 200,
        fingerprint,
      }
    );

    const rows = Array.isArray(response.data) ? response.data : [];

    for (const row of rows) {
      const result = row.result || {};
      const toAddress = resolveAddress(
        tronWeb,
        result.to ?? result._to ?? result[0]
      );

      if (toAddress !== walletAddress) {
        continue;
      }

      const bit = toSafeNumber(result.platformBit ?? result._platformBit ?? result[2], 0);
      if (!bit || eventsByBit.has(bit)) {
        continue;
      }

      const txId = String(row.transaction_id || '').trim();
      const timestamp = Number(row.block_timestamp || 0);
      const amountRaw = normalizeIntegerString(result.amount ?? result._amount ?? result[1], '0');

      if (!txId || !timestamp) {
        continue;
      }

      eventsByBit.set(bit, {
        amountRaw,
        txId,
        timestamp,
      });
    }

    if (
      requiredBits.size > 0
        ? Array.from(requiredBits).every((bit) => eventsByBit.has(bit))
        : eventsByBit.size >= AIRDROP_PLATFORM_CONFIG.length
    ) {
      break;
    }

    fingerprint = String(response.meta?.fingerprint || '').trim() || undefined;
    if (!fingerprint) {
      break;
    }
  }

  await writeAirdropEventCache(walletAddress, eventsByBit);
  return eventsByBit;
}

async function loadAirdropVaultOnChainSnapshot(
  walletAddress: string,
  options?: { force?: boolean }
): Promise<AirdropVaultOnChainSnapshot> {
  const wallet = String(walletAddress || '').trim();
  if (!isUsableAddress(wallet)) {
    throw new Error(translateNow('Wallet address is not available for airdrop lookup.'));
  }

  const cacheKey = buildAirdropCacheKey(wallet);

  if (!options?.force) {
    const cached = await readAirdropCache(wallet);
    if (cached) {
      return cached;
    }
  } else {
    airdropMemoryCache.delete(cacheKey);
    await AsyncStorage.removeItem(cacheKey).catch(() => null);
  }

  const inflight = airdropInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const tronWeb = createTronWeb(undefined, wallet);
    const contract = (await tronWeb.contract(
      buildAirdropVaultAbi(),
      AIRDROP_VAULT_CONTRACT
    )) as unknown as AirdropVaultContract;

    const [
      operatorRaw,
      currentWaveRaw,
      nextWaveTimeRaw,
      waveInfoRaw,
      availableNowRaw,
      claimsCountRaw,
      ...claimFlagsRaw
    ] = await Promise.all([
      contract.operator().call(),
      contract.currentWave().call(),
      contract.nextWaveTime().call(),
      contract.waveInfo().call(),
      contract.availableToDistributeNow().call(),
      contract.claimsCount(wallet).call(),
      ...AIRDROP_PLATFORM_CONFIG.map((platform) => contract.isClaimedPlatform(wallet, platform.bit).call()),
    ]);

    const currentWave = toSafeNumber(currentWaveRaw, -1);
    const nextWaveTime = toSafeNumber(nextWaveTimeRaw, 0);
    const unlockedTotalRaw = normalizeIntegerString(readTupleValue(waveInfoRaw, 1, 'unlocked'), '0');
    const totalDistributedRaw = normalizeIntegerString(readTupleValue(waveInfoRaw, 2, 'distributed'), '0');
    const remainingUnlockedRaw = normalizeIntegerString(readTupleValue(waveInfoRaw, 3, 'remainingNow'), '0');
    const vaultBalanceRaw = normalizeIntegerString(readTupleValue(waveInfoRaw, 4, 'balance'), '0');
    const availableToDistributeNowRaw = normalizeIntegerString(availableNowRaw, '0');
    const remainingPlannedRaw = String(BigInt(AIRDROP_TOTAL_ALLOCATION_RAW) - BigInt(totalDistributedRaw));
    const claimedBits = AIRDROP_PLATFORM_CONFIG.filter((platform, index) => readBoolean(claimFlagsRaw[index]))
      .map((platform) => platform.bit);
    const eventsByBit = await fetchAirdropClaimEvents(wallet, {
      requiredBits: claimedBits,
    }).catch(() => new Map<number, { amountRaw: string; txId: string; timestamp: number }>());

    const platforms = AIRDROP_PLATFORM_CONFIG.reduce((acc, platform, index) => {
      const claimed = readBoolean(claimFlagsRaw[index]);
      const event = eventsByBit.get(platform.bit) || null;

      acc[platform.key] = {
        key: platform.key,
        title: platform.title,
        bit: platform.bit,
        claimed,
        amountRaw: event?.amountRaw || null,
        amountDisplay: event ? formatTokenAmount(event.amountRaw) : claimed ? translateNow('Claimed') : '0',
        claimedAt: event?.timestamp || null,
        claimedAtLabel: event
          ? formatTimestampLabel(event.timestamp)
          : claimed
            ? translateNow('Claim confirmed on chain')
            : translateNow('Not received yet'),
        txId: event?.txId || null,
        explorerUrl: event?.txId ? `${TRONSCAN_TX_BASE_URL}${event.txId}` : null,
      };

      return acc;
    }, {} as Record<AirdropPlatformKey, AirdropPlatformClaim>);

    const snapshot = {
      walletAddress: wallet,
      contractAddress: AIRDROP_VAULT_CONTRACT,
      operatorAddress: resolveAddress(tronWeb, operatorRaw),
      currentWave,
      nextWaveTime,
      nextWaveLabel: nextWaveTime > 0 ? formatTimestampLabel(nextWaveTime * 1000) : translateNow('No next wave'),
      claimsCount: toSafeNumber(claimsCountRaw, 0),
      unlockedTotalRaw,
      unlockedTotalDisplay: formatTokenAmount(unlockedTotalRaw),
      totalDistributedRaw,
      totalDistributedDisplay: formatTokenAmount(totalDistributedRaw),
      remainingUnlockedRaw,
      remainingUnlockedDisplay: formatTokenAmount(remainingUnlockedRaw),
      remainingPlannedRaw,
      remainingPlannedDisplay: formatTokenAmount(remainingPlannedRaw),
      availableToDistributeNowRaw,
      availableToDistributeNowDisplay: formatTokenAmount(availableToDistributeNowRaw),
      vaultBalanceRaw,
      vaultBalanceDisplay: formatTokenAmount(vaultBalanceRaw),
      platforms,
      loadedAt: Date.now(),
    } satisfies AirdropVaultOnChainSnapshot;

    await writeAirdropCache(wallet, snapshot);
    return snapshot;
  })();

  airdropInflight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    airdropInflight.delete(cacheKey);
  }
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
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
      const response = await fetch(url, options);
      const payload = await readJson(response);

      if (!response.ok || payload?.ok === false) {
        throw new AirdropApiError(
          payload?.error || `Request failed with status ${response.status}`,
          response.status
        );
      }

      return payload as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(translateNow('4TEEN API is unavailable'));
}

async function getSigningWalletContext() {
  const wallet = await getActiveWallet();

  if (!wallet) {
    throw new Error(translateNow('No wallet available.'));
  }

  if (wallet.kind === 'watch-only') {
    throw new Error(translateNow('Telegram airdrop requires a full-access wallet.'));
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

export async function getTelegramAirdropOverview(walletAddress: string) {
  const payload = await fetchJsonAcrossApiOrigins<{
    ok?: boolean;
    result?: TelegramAirdropOverview;
  }>('/airdrop/telegram/overview', (baseUrl) => ({
    url: buildApiUrl(baseUrl, '/airdrop/telegram/overview', {
      walletAddress,
    }),
    options: {
      method: 'GET',
    },
  }));

  if (!payload.result) {
    throw new Error(translateNow('Telegram airdrop overview is unavailable.'));
  }

  return payload.result;
}

export async function startTelegramAirdropFlow(): Promise<TelegramAirdropStartResult> {
  const { wallet, privateKey } = await getSigningWalletContext();
  const sessionPayload = await fetchJsonAcrossApiOrigins<{
    ok?: boolean;
    result?: {
      walletAddress: string;
      sessionToken: string;
      challenge: string;
      expiresAt: string;
    };
  }>('/airdrop/telegram/session', (baseUrl) => ({
    url: buildApiUrl(baseUrl, '/airdrop/telegram/session'),
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: wallet.address,
      }),
    },
  }));

  const session = sessionPayload.result;

  if (!session?.sessionToken || !session.challenge) {
    throw new Error(translateNow('Telegram airdrop session could not be created.'));
  }

  const tronWeb = createTronWeb(privateKey, wallet.address);
  const signature = await tronWeb.trx.signMessageV2(session.challenge, privateKey);

  const verifyPayload = await fetchJsonAcrossApiOrigins<{
    ok?: boolean;
    result?: {
      session?: {
        status?: string;
      };
      links?: {
        httpsUrl?: string;
        appUrl?: string;
      };
    };
  }>('/airdrop/telegram/session/verify', (baseUrl) => ({
    url: buildApiUrl(baseUrl, '/airdrop/telegram/session/verify'),
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: wallet.address,
        sessionToken: session.sessionToken,
        signature,
      }),
    },
  }));

  if (!verifyPayload.result?.links?.httpsUrl) {
    throw new Error(translateNow('Telegram launch link is unavailable.'));
  }

  return {
    wallet,
    sessionToken: session.sessionToken,
    httpsUrl: String(verifyPayload.result.links.httpsUrl || '').trim(),
    appUrl: String(verifyPayload.result.links.appUrl || '').trim(),
    expiresAt: session.expiresAt,
  };
}

export async function getActiveWalletTelegramAirdropOverview() {
  const wallet = await getActiveWallet();

  if (!wallet) {
    return {
      wallet: null,
      overview: null,
    };
  }

  return {
    wallet,
    overview: await getTelegramAirdropOverview(wallet.address),
  };
}

export async function getActiveWalletAirdropSnapshot(
  options?: { force?: boolean }
): Promise<ActiveWalletAirdropSnapshot> {
  const wallet = await getActiveWallet();

  if (!wallet) {
    return {
      wallet: null,
      overview: null,
      onChain: null,
    };
  }

  const [overviewResult, onChainResult] = await Promise.allSettled([
    getTelegramAirdropOverview(wallet.address),
    loadAirdropVaultOnChainSnapshot(wallet.address, options),
  ]);

  return {
    wallet,
    overview: overviewResult.status === 'fulfilled' ? overviewResult.value : null,
    onChain: onChainResult.status === 'fulfilled' ? onChainResult.value : null,
  };
}

export async function getWalletAirdropOnChainSnapshot(
  walletAddress: string,
  options?: { force?: boolean }
) {
  return loadAirdropVaultOnChainSnapshot(walletAddress, options);
}
