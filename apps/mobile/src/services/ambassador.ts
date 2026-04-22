import { TronWeb } from 'tronweb';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { buildTrongridHeaders, FOURTEEN_API_BASE_URL, TRONGRID_BASE_URL } from '../config/tron';
import { getTokenDetails, TRX_TOKEN_ID } from './tron/api';
import {
  estimateContractCallResources,
  type ContractCallResourceEstimate,
} from './wallet/resources';
import { normalizePrivateKey, isValidPrivateKey } from './wallet/import';
import {
  getActiveWallet,
  getWalletSecret,
  type WalletMeta,
} from './wallet/storage';

export const FOURTEEN_CONTROLLER_ADDRESS = 'TF8yhohRfMxsdVRr7fFrYLh5fxK8sAFkeZ';
export const AMBASSADOR_REFERRAL_BASE_URL = 'https://4teen.me/?ref=';

const DEFAULT_AMBASSADOR_BACKEND_BASE_URL =
  'https://fourteen-allocation-worker-6e0e920395d8.herokuapp.com';
const ZERO_ADDRESS_BASE58 = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
const TRON_DERIVATION_PATH = "m/44'/195'/0'/0/0";
const SLUG_MAX_LENGTH = 24;
const AMBASSADOR_CACHE_TTL_MS = 45_000;
const AMBASSADOR_POSITIVE_IDENTITY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_REGISTER_FEE_LIMIT_SUN = 120_000_000;
const DEFAULT_WITHDRAW_FEE_LIMIT_SUN = 80_000_000;
const LOCAL_AMBASSADOR_SLUG_KEY_PREFIX = 'fourteen_ambassador_local_slug_v1';
const LOCAL_AMBASSADOR_IDENTITY_KEY_PREFIX = 'fourteen_ambassador_identity_v1';
const AMBASSADOR_IDENTITY_CACHE_VERSION = 2;

export const AMBASSADOR_BACKEND_BASE_URL = String(
  process.env.EXPO_PUBLIC_AMBASSADOR_API_BASE_URL ||
    DEFAULT_AMBASSADOR_BACKEND_BASE_URL
)
  .trim()
  .replace(/\/+$/, '');

const WALLET_API_BASE_URL = FOURTEEN_API_BASE_URL.replace(/\/+$/, '');

type FourteenControllerContract = {
  ambassadorExists: (ambassadorAddress: string) => {
    call: () => Promise<unknown>;
  };
  ambassadorActive: (ambassadorAddress: string) => {
    call: () => Promise<unknown>;
  };
  ambassadorMeta: (ambassadorAddress: string) => {
    call: () => Promise<unknown>;
  };
  getDashboardCore: (ambassadorAddress: string) => {
    call: () => Promise<unknown>;
  };
  getDashboardStats: (ambassadorAddress: string) => {
    call: () => Promise<unknown>;
  };
  getDashboardProfile: (ambassadorAddress: string) => {
    call: () => Promise<unknown>;
  };
  getBuyerAmbassador: (buyer: string) => {
    call: () => Promise<unknown>;
  };
  isSlugTaken: (slugHash: string) => {
    call: () => Promise<unknown>;
  };
  registerAsAmbassador: (
    slugHash: string,
    metaHash: string
  ) => {
    send: (options?: { feeLimit?: number; shouldPollResponse?: boolean }) => Promise<unknown>;
  };
  withdrawRewards: () => {
    send: (options?: { feeLimit?: number; shouldPollResponse?: boolean }) => Promise<unknown>;
  };
};

type CabinetRowsPayload = {
  ok?: boolean;
  total?: number;
  rows?: Record<string, unknown>[];
};

type CabinetSummaryPayload = {
  ok?: boolean;
  summary?: AmbassadorCabinetSummary;
};

type WalletApiCabinetPayload = {
  ok?: boolean;
  result?: AmbassadorCabinetDashboard;
};

export type AmbassadorProfile = {
  wallet: string;
  slug: string;
  status: string;
  referralLink: string;
};

export type AmbassadorCabinetSummary = {
  ambassador_wallet?: string;
  slug?: string | null;
  slug_hash?: string | null;
  meta_hash?: string | null;
  exists_on_chain?: boolean;
  active?: boolean;
  self_registered?: boolean;
  manual_assigned?: boolean;
  override_enabled?: boolean;
  current_level?: number | string;
  override_level?: number | string;
  effective_level?: number | string;
  reward_percent?: number | string;
  created_at_chain?: number | string | null;
  total_buyers?: number | string;
  total_volume_sun?: number | string;
  total_rewards_accrued_sun?: number | string;
  total_rewards_claimed_sun?: number | string;
  claimable_rewards_sun?: number | string;
  processed_count?: number | string;
  attributed_count?: number | string;
  unattributed_count?: number | string;
  buyers_count?: number | string;
  buyers_total_purchase_amount_sun?: number | string;
  buyers_processed_purchase_amount_sun?: number | string;
  buyers_pending_purchase_amount_sun?: number | string;
  buyers_total_reward_sun?: number | string;
  buyers_processed_reward_sun?: number | string;
  buyers_pending_reward_sun?: number | string;
  last_chain_sync_at?: string | null;
};

export type AmbassadorCabinetDashboard = {
  profile: AmbassadorProfile;
  summary: AmbassadorCabinetSummary;
  buyersRows: Record<string, unknown>[];
  purchasesRows: Record<string, unknown>[];
  pendingRows: Record<string, unknown>[];
  buyersTotal: number;
  purchasesTotal: number;
  pendingTotal: number;
  source?: {
    onChain?: boolean;
    db?: boolean;
    dbError?: string | null;
    onChainError?: string | null;
  };
};

export type AmbassadorScreenSnapshot = {
  wallet: WalletMeta | null;
  signingWalletAvailable: boolean;
  switchedFromWatchOnly: boolean;
  registered: boolean;
  profile: AmbassadorProfile | null;
  cabinet: AmbassadorCabinetDashboard | null;
  status: 'no-wallet' | 'watch-only' | 'register' | 'cabinet' | 'unavailable';
  message: string;
};

export type AmbassadorRegistrationReceipt = {
  wallet: WalletMeta;
  txId: string;
  explorerUrl: string;
  slug: string;
  slugHash: string;
  referralLink: string;
  profile: AmbassadorProfile;
};

export type AmbassadorRegistrationEnergyQuote = {
  mode?: 'api' | 'resale' | string;
  wallet: string;
  slug: string;
  paymentAddress: string;
  amountSun: string;
  amountTrx: string;
  energyQuantity: number;
  readyEnergy?: number;
};

export type AmbassadorRegistrationEnergyConfirmation = {
  id?: number | string;
  wallet?: string;
  slug?: string;
  payment_tx_hash?: string;
  payment_amount_sun?: string;
  energy_quantity?: number;
  request_id?: string;
  trade_no?: string;
  status?: string;
};

export type AmbassadorWithdrawalReceipt = {
  wallet: WalletMeta;
  txId: string;
  explorerUrl: string;
};

export type AmbassadorWithdrawalReview = {
  wallet: WalletMeta;
  controllerAddress: string;
  claimableRewardsSun: string;
  resources: ContractCallResourceEstimate;
  trxCoverage: {
    trxBalanceSun: number;
    trxBalanceDisplay: string;
    missingTrxSun: number;
    canCoverBurn: boolean;
  };
};

type AmbassadorCacheEntry = {
  savedAt: number;
  snapshot: AmbassadorScreenSnapshot;
};

type AmbassadorIdentityCache = {
  version?: number;
  savedAt: number;
  wallet: string;
  registered: boolean;
  active?: boolean;
  slug?: string;
  referralLink?: string;
};

const ambassadorMemoryCache = new Map<string, AmbassadorCacheEntry>();
const ambassadorInflight = new Map<string, Promise<AmbassadorScreenSnapshot>>();

function getSnapshotMemoryCacheTtl(snapshot: AmbassadorScreenSnapshot) {
  if (snapshot.status === 'cabinet') return AMBASSADOR_CACHE_TTL_MS;
  if (snapshot.status === 'no-wallet') return 5_000;
  return 0;
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

function normalizeAddress(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';

  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    try {
      return TronWeb.address.fromHex(`41${raw.slice(2)}`);
    } catch {
      return `41${raw.slice(2)}`;
    }
  }

  if (/^41[0-9a-fA-F]{40}$/.test(raw)) {
    try {
      return TronWeb.address.fromHex(raw);
    } catch {
      return raw;
    }
  }

  return raw;
}

function isZeroAddress(value: string) {
  const safe = normalizeAddress(value);
  return !safe || safe === ZERO_ADDRESS_BASE58 || /^41(?:0{40})$/i.test(safe);
}

function buildLocalSlugKey(walletAddress: string) {
  return `${LOCAL_AMBASSADOR_SLUG_KEY_PREFIX}:${walletAddress.trim().toLowerCase()}`;
}

function buildIdentityKey(walletAddress: string) {
  return `${LOCAL_AMBASSADOR_IDENTITY_KEY_PREFIX}:${walletAddress.trim().toLowerCase()}`;
}

async function readLocalAmbassadorSlug(walletAddress: string) {
  try {
    const value = await AsyncStorage.getItem(buildLocalSlugKey(walletAddress));
    return normalizeAmbassadorSlug(value || '');
  } catch {
    return '';
  }
}

async function saveLocalAmbassadorSlug(walletAddress: string, slug: string) {
  const normalized = normalizeAmbassadorSlug(slug);
  if (!walletAddress || !normalized) return;

  try {
    await AsyncStorage.setItem(buildLocalSlugKey(walletAddress), normalized);
  } catch {}
}

async function readAmbassadorIdentityCache(walletAddress: string) {
  try {
    const raw = await AsyncStorage.getItem(buildIdentityKey(walletAddress));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AmbassadorIdentityCache;
    if (parsed.version !== AMBASSADOR_IDENTITY_CACHE_VERSION) {
      return null;
    }

    if (!parsed || parsed.wallet?.toLowerCase() !== walletAddress.trim().toLowerCase()) {
      return null;
    }

    if (parsed.registered !== true) {
      return null;
    }

    const age = Date.now() - Number(parsed.savedAt || 0);
    return age >= 0 && age < AMBASSADOR_POSITIVE_IDENTITY_CACHE_TTL_MS ? parsed : null;
  } catch {
    return null;
  }
}

async function writeAmbassadorIdentityCache(input: Omit<AmbassadorIdentityCache, 'savedAt'>) {
  const wallet = normalizeAddress(input.wallet);
  if (!wallet || input.registered !== true) return;

  const payload = {
    ...input,
    version: AMBASSADOR_IDENTITY_CACHE_VERSION,
    wallet,
    slug: normalizeAmbassadorSlug(input.slug || ''),
    referralLink: input.referralLink || buildAmbassadorReferralLink(input.slug || ''),
    savedAt: Date.now(),
  } satisfies AmbassadorIdentityCache;

  try {
    await AsyncStorage.setItem(buildIdentityKey(wallet), JSON.stringify(payload));
  } catch {}
}

export function normalizeAmbassadorSlug(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, SLUG_MAX_LENGTH);
}

export function isValidAmbassadorSlug(value: string) {
  return /^[a-z0-9_-]{3,24}$/.test(normalizeAmbassadorSlug(value));
}

export function generateAmbassadorSlug() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';

  for (let index = 0; index < 6; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `amb-${suffix}`;
}

export function buildAmbassadorReferralLink(slug: string) {
  const normalized = normalizeAmbassadorSlug(slug);
  return normalized ? `${AMBASSADOR_REFERRAL_BASE_URL}${normalized}` : '';
}

function buildBackendUrl(path: string, params?: Record<string, string | number | boolean>) {
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
  const url = new URL(`${AMBASSADOR_BACKEND_BASE_URL}${normalizedPath}`);

  Object.entries(params || {}).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

function buildWalletApiUrl(path: string, params?: Record<string, string | number | boolean>) {
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
  const url = new URL(`${WALLET_API_BASE_URL}${normalizedPath}`);

  Object.entries(params || {}).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
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

async function fetchJsonOrThrow<T>(
  url: string,
  options?: RequestInit & { notFoundAsNull?: boolean }
): Promise<T | null> {
  const { notFoundAsNull, ...fetchOptions } = options || {};
  const response = await fetch(url, fetchOptions);
  const payload = await readJson(response);

  if (response.status === 404 && notFoundAsNull) {
    return null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `HTTP ${response.status}`);
  }

  return payload as T;
}

function readTupleValue(raw: unknown, index: number, name?: string) {
  const record = raw as Record<string, unknown> | null | undefined;
  const value =
    Array.isArray(raw)
      ? raw[index]
      : record?.[index] ?? (name ? record?.[name] : undefined);

  if (value === null || value === undefined) return '';

  if (typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    return (value as { toString: () => string }).toString();
  }

  return String(value);
}

function readTupleBoolean(raw: unknown, index = 0, name?: string) {
  const value = readTupleValue(raw, index, name).trim().toLowerCase();
  return value === 'true' || value === '1';
}

function decodeHexBoolean(hexValue: unknown) {
  const clean = String(hexValue || '').replace(/^0x/i, '').trim();
  if (!clean || !/^[0-9a-fA-F]+$/.test(clean)) return null;

  try {
    return BigInt(`0x${clean}`) !== 0n;
  } catch {
    return null;
  }
}

async function readControllerAddressBoolean(
  methodName: 'ambassadorExists' | 'ambassadorActive',
  wallet: string
) {
  let abiResult: boolean | null = null;
  let abiError: unknown = null;

  try {
    const contract = await getControllerContract(createTronWeb());
    abiResult = readTupleBoolean(await contract[methodName](wallet).call());

    if (abiResult) {
      return true;
    }
  } catch (error) {
    abiError = error;
  }

  try {
    const tronWeb = createTronWeb(undefined, wallet);
    const result = await tronWeb.transactionBuilder.triggerConstantContract(
      FOURTEEN_CONTROLLER_ADDRESS,
      `${methodName}(address)`,
      {},
      [{ type: 'address', value: wallet }],
      wallet
    );
    const decoded = decodeHexBoolean(result?.constant_result?.[0]);

    if (decoded !== null) {
      return decoded;
    }
  } catch (fallbackError) {
    if (abiError) {
      throw fallbackError;
    }
  }

  return Boolean(abiResult);
}

async function lookupAmbassadorOnChain(
  walletAddress: string,
  options?: { force?: boolean }
): Promise<AmbassadorProfile | null> {
  const wallet = normalizeAddress(walletAddress);
  if (!wallet) return null;

  if (!options?.force) {
    const cached = await readAmbassadorIdentityCache(wallet);

    if (cached) {
      const slug = cached.slug || (await readLocalAmbassadorSlug(wallet));

      return {
        wallet,
        slug,
        status: cached.active === false ? 'inactive' : 'active',
        referralLink: cached.referralLink || buildAmbassadorReferralLink(slug),
      };
    }
  }

  const exists = await readControllerAddressBoolean('ambassadorExists', wallet);
  console.info('[4TEEN] ambassador exists lookup', { wallet, exists });

  if (!exists) {
    return null;
  }

  const [active, localSlug] = await Promise.all([
    readControllerAddressBoolean('ambassadorActive', wallet).catch(() => true),
    readLocalAmbassadorSlug(wallet),
  ]);
  const profile = {
    wallet,
    slug: localSlug,
    status: active ? 'active' : 'inactive',
    referralLink: buildAmbassadorReferralLink(localSlug),
  } satisfies AmbassadorProfile;

  await writeAmbassadorIdentityCache({
    wallet,
    registered: true,
    active,
    slug: localSlug,
    referralLink: profile.referralLink,
  });

  return profile;
}

async function fetchCabinetRows(path: string) {
  const payload = await fetchJsonOrThrow<CabinetRowsPayload>(buildBackendUrl(path), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => ({ ok: true, total: 0, rows: [] }));

  return {
    rows: Array.isArray(payload?.rows) ? payload.rows : [],
    total: Number(payload?.total || 0) || 0,
  };
}

export function sunToTrx(value: unknown) {
  const raw = String(value ?? '0').trim();
  if (!/^-?\d+$/.test(raw)) return 0;
  return Number(BigInt(raw)) / 1_000_000;
}

export function formatTrxFromSun(value: unknown) {
  const trx = sunToTrx(value);

  if (!Number.isFinite(trx) || trx === 0) {
    return '0.00';
  }

  return trx >= 1 ? trx.toFixed(2) : trx.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function formatTrxBalanceDisplay(valueSun: number) {
  const value = Math.max(0, Number(valueSun || 0)) / 1_000_000;

  if (!Number.isFinite(value) || value <= 0) {
    return '0.00 TRX';
  }

  return `${value.toFixed(value >= 1 ? 2 : 6).replace(/\.?0+$/, '')} TRX`;
}

function normalizeSunInteger(value: unknown) {
  const raw = String(value ?? '0').trim();
  return /^\d+$/.test(raw) ? raw : '0';
}

export function levelToLabel(level: unknown) {
  const numeric = Number(level || 0);
  if (numeric === 0) return 'Bronze';
  if (numeric === 1) return 'Silver';
  if (numeric === 2) return 'Gold';
  if (numeric === 3) return 'Platinum';
  return `Level ${numeric}`;
}

export async function loadAmbassadorCabinet(
  profile: AmbassadorProfile
): Promise<AmbassadorCabinetDashboard | null> {
  const wallet = normalizeAddress(profile.wallet);
  if (!wallet) return null;

  const proxyPayload = await fetchJsonOrThrow<WalletApiCabinetPayload>(
    buildWalletApiUrl(`/ambassador/cabinet/${encodeURIComponent(wallet)}`, {
      limit: 100,
      offset: 0,
    }),
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      notFoundAsNull: true,
    }
  ).catch((error) => {
    console.error('[4TEEN] ambassador proxy cabinet failed', error);
    return null;
  });

  if (proxyPayload?.result?.summary) {
    const proxyProfile = proxyPayload.result.profile || profile;
    const summarySlug = normalizeAmbassadorSlug(String(proxyPayload.result.summary.slug || ''));
    const slug = normalizeAmbassadorSlug(proxyProfile.slug || profile.slug || summarySlug);
    const resolvedProfile = {
      ...profile,
      ...proxyProfile,
      wallet,
      slug,
      referralLink:
        proxyProfile.referralLink ||
        profile.referralLink ||
        buildAmbassadorReferralLink(slug),
      status:
        proxyPayload.result.summary.active === false
          ? 'inactive'
          : proxyProfile.status || profile.status || 'active',
    };

    return {
      ...proxyPayload.result,
      profile: resolvedProfile,
      buyersRows: Array.isArray(proxyPayload.result.buyersRows) ? proxyPayload.result.buyersRows : [],
      purchasesRows: Array.isArray(proxyPayload.result.purchasesRows) ? proxyPayload.result.purchasesRows : [],
      pendingRows: Array.isArray(proxyPayload.result.pendingRows) ? proxyPayload.result.pendingRows : [],
      buyersTotal: Number(proxyPayload.result.buyersTotal || 0) || 0,
      purchasesTotal: Number(proxyPayload.result.purchasesTotal || 0) || 0,
      pendingTotal: Number(proxyPayload.result.pendingTotal || 0) || 0,
    };
  }

  const summaryPayload = await fetchJsonOrThrow<CabinetSummaryPayload>(
    buildBackendUrl(`/cabinet/ambassador/${encodeURIComponent(wallet)}/summary`),
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      notFoundAsNull: true,
    }
  ).catch(() => null);

  if (summaryPayload?.summary) {
    const [buyers, purchases, pending] = await Promise.all([
      fetchCabinetRows(`/cabinet/ambassador/${encodeURIComponent(wallet)}/buyers?limit=100&offset=0`),
      fetchCabinetRows(`/cabinet/ambassador/${encodeURIComponent(wallet)}/purchases?limit=100&offset=0`),
      fetchCabinetRows(`/cabinet/ambassador/${encodeURIComponent(wallet)}/pending?limit=100&offset=0`),
    ]);

    const summarySlug = normalizeAmbassadorSlug(String(summaryPayload.summary.slug || ''));
    const resolvedProfile = {
      ...profile,
      slug: profile.slug || summarySlug,
      referralLink: profile.referralLink || buildAmbassadorReferralLink(summarySlug),
      status: summaryPayload.summary.active === false ? 'inactive' : profile.status || 'active',
    };

    return {
      profile: resolvedProfile,
      summary: summaryPayload.summary,
      buyersRows: buyers.rows,
      purchasesRows: purchases.rows,
      pendingRows: pending.rows,
      buyersTotal: buyers.total,
      purchasesTotal: purchases.total,
      pendingTotal: pending.total,
    };
  }

  return loadAmbassadorCabinetOnChain(profile);
}

async function loadAmbassadorCabinetOnChain(
  profile: AmbassadorProfile
): Promise<AmbassadorCabinetDashboard | null> {
  const wallet = normalizeAddress(profile.wallet);
  if (!wallet) return null;

  const contract = await getControllerContract(createTronWeb());
  const [core, stats, dashboardProfile] = await Promise.all([
    contract.getDashboardCore(wallet).call(),
    contract.getDashboardStats(wallet).call(),
    contract.getDashboardProfile(wallet).call(),
  ]);

  const exists = readTupleBoolean(core, 0, 'exists');
  if (!exists) return null;

  const slugHash = readTupleValue(dashboardProfile, 5, 'slugHash');
  const metaHash = readTupleValue(dashboardProfile, 6, 'metaHash');

  return {
    profile,
    summary: {
      ambassador_wallet: wallet,
      slug: profile.slug || null,
      slug_hash: slugHash || null,
      meta_hash: metaHash || null,
      exists_on_chain: true,
      active: readTupleBoolean(core, 1, 'active'),
      effective_level: readTupleValue(core, 2, 'effectiveLevel'),
      reward_percent: readTupleValue(core, 3, 'rewardPercent'),
      created_at_chain: readTupleValue(core, 4, 'createdAt'),
      self_registered: readTupleBoolean(dashboardProfile, 0, 'selfRegistered'),
      manual_assigned: readTupleBoolean(dashboardProfile, 1, 'manualAssigned'),
      override_enabled: readTupleBoolean(dashboardProfile, 2, 'overrideEnabled'),
      current_level: readTupleValue(dashboardProfile, 3, 'currentLevel'),
      override_level: readTupleValue(dashboardProfile, 4, 'overrideLevel'),
      total_buyers: readTupleValue(stats, 0, 'totalBuyers'),
      buyers_count: readTupleValue(stats, 0, 'totalBuyers'),
      total_volume_sun: readTupleValue(stats, 1, 'totalVolumeSun'),
      total_rewards_accrued_sun: readTupleValue(stats, 2, 'totalRewardsAccruedSun'),
      total_rewards_claimed_sun: readTupleValue(stats, 3, 'totalRewardsClaimedSun'),
      claimable_rewards_sun: readTupleValue(stats, 4, 'claimableRewardsSun'),
    },
    buyersRows: [],
    purchasesRows: [],
    pendingRows: [],
    buyersTotal: Number(readTupleValue(stats, 0, 'totalBuyers') || 0) || 0,
    purchasesTotal: 0,
    pendingTotal: 0,
  };
}

async function getSigningWalletContext() {
  const wallet = await getActiveWallet();

  if (!wallet) {
    throw new Error('No wallet available.');
  }

  if (wallet.kind === 'watch-only') {
    throw new Error('This action requires a full-access wallet.');
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
    switchedFromWatchOnly: false,
  };
}

async function getControllerContract(tronWeb?: TronWeb) {
  const resolved = tronWeb || createTronWeb();
  return (await resolved.contract(
    [
      {
        inputs: [{ internalType: 'address', name: 'ambassadorAddress', type: 'address' }],
        name: 'ambassadorExists',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: 'ambassadorAddress', type: 'address' }],
        name: 'ambassadorActive',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: 'ambassadorAddress', type: 'address' }],
        name: 'ambassadorMeta',
        outputs: [
          { internalType: 'bytes32', name: '', type: 'bytes32' },
          { internalType: 'bytes32', name: '', type: 'bytes32' },
        ],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: 'ambassadorAddress', type: 'address' }],
        name: 'getDashboardCore',
        outputs: [
          { internalType: 'bool', name: 'exists', type: 'bool' },
          { internalType: 'bool', name: 'active', type: 'bool' },
          { internalType: 'uint8', name: 'effectiveLevel', type: 'uint8' },
          { internalType: 'uint256', name: 'rewardPercent', type: 'uint256' },
          { internalType: 'uint256', name: 'createdAt', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: 'ambassadorAddress', type: 'address' }],
        name: 'getDashboardStats',
        outputs: [
          { internalType: 'uint256', name: 'totalBuyers', type: 'uint256' },
          { internalType: 'uint256', name: 'totalVolumeSun', type: 'uint256' },
          { internalType: 'uint256', name: 'totalRewardsAccruedSun', type: 'uint256' },
          { internalType: 'uint256', name: 'totalRewardsClaimedSun', type: 'uint256' },
          { internalType: 'uint256', name: 'claimableRewardsSun', type: 'uint256' },
        ],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: 'ambassadorAddress', type: 'address' }],
        name: 'getDashboardProfile',
        outputs: [
          { internalType: 'bool', name: 'selfRegistered', type: 'bool' },
          { internalType: 'bool', name: 'manualAssigned', type: 'bool' },
          { internalType: 'bool', name: 'overrideEnabled', type: 'bool' },
          { internalType: 'uint8', name: 'currentLevel', type: 'uint8' },
          { internalType: 'uint8', name: 'overrideLevel', type: 'uint8' },
          { internalType: 'bytes32', name: 'slugHash', type: 'bytes32' },
          { internalType: 'bytes32', name: 'metaHash', type: 'bytes32' },
        ],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: 'buyer', type: 'address' }],
        name: 'getBuyerAmbassador',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'bytes32', name: 'slugHash', type: 'bytes32' }],
        name: 'isSlugTaken',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'bytes32', name: 'slugHash', type: 'bytes32' },
          { internalType: 'bytes32', name: 'metaHash', type: 'bytes32' },
        ],
        name: 'registerAsAmbassador',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [],
        name: 'withdrawRewards',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ],
    FOURTEEN_CONTROLLER_ADDRESS
  )) as unknown as FourteenControllerContract;
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

export function buildAmbassadorSlugHash(slug: string) {
  const normalized = normalizeAmbassadorSlug(slug);
  if (!normalized) return '';
  return TronWeb.sha3(normalized);
}

export async function checkAmbassadorSlugAvailability(slug: string) {
  const normalizedSlug = normalizeAmbassadorSlug(slug);

  if (!isValidAmbassadorSlug(normalizedSlug)) {
    throw new Error('Slug must be 3-24 chars: a-z, 0-9, underscore or dash.');
  }

  const slugHash = buildAmbassadorSlugHash(normalizedSlug);
  const contract = await getControllerContract(createTronWeb());
  const takenOnChain = readTupleBoolean(await contract.isSlugTaken(slugHash).call());

  if (takenOnChain) {
    throw new Error('Slug is already taken on-chain.');
  }

  const payload = await fetchJsonOrThrow<{ ok?: boolean; available?: boolean; slug?: string }>(
    buildBackendUrl('/slug/check', { slug: normalizedSlug }),
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  ).catch(() => null);

  if (payload && !payload.available) {
    throw new Error('Slug is already taken in ambassador backend.');
  }

  return {
    slug: normalizedSlug,
    available: true,
  };
}

export async function registerAmbassador(slug: string): Promise<AmbassadorRegistrationReceipt> {
  const normalizedSlug = normalizeAmbassadorSlug(slug);

  if (!isValidAmbassadorSlug(normalizedSlug)) {
    throw new Error('Slug must be 3-24 chars: a-z, 0-9, underscore or dash.');
  }

  const { wallet, privateKey } = await getSigningWalletContext();
  const existing = await lookupAmbassadorOnChain(wallet.address, { force: true });

  if (existing) {
    throw new Error('This wallet is already registered as ambassador.');
  }

  await checkAmbassadorSlugAvailability(normalizedSlug);

  const slugHash = buildAmbassadorSlugHash(normalizedSlug);
  const tronWeb = createTronWeb(privateKey, wallet.address);
  const contract = await getControllerContract(tronWeb);
  const result = await contract.registerAsAmbassador(slugHash, ZERO_BYTES32).send({
    feeLimit: DEFAULT_REGISTER_FEE_LIMIT_SUN,
    shouldPollResponse: false,
  });
  const txId = extractTxid(result);

  if (!txId) {
    throw new Error('Registration transaction sent but txid was not returned.');
  }

  const completed = await fetchJsonOrThrow<{
    ok?: boolean;
    result?: { wallet?: string; slug?: string; referralLink?: string; status?: string };
  }>(buildBackendUrl('/ambassador/register-complete'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: normalizedSlug,
      slugHash,
      wallet: wallet.address,
      txid: txId,
    }),
  }).catch(() => null);

  const completedSlug = normalizeAmbassadorSlug(completed?.result?.slug || normalizedSlug);
  const profile = {
    wallet: wallet.address,
    slug: completedSlug,
    status: String(completed?.result?.status || 'active').trim().toLowerCase(),
    referralLink:
      String(completed?.result?.referralLink || '').trim() ||
      buildAmbassadorReferralLink(completedSlug),
  };

  await saveLocalAmbassadorSlug(wallet.address, completedSlug);
  await writeAmbassadorIdentityCache({
    wallet: wallet.address,
    registered: true,
    active: true,
    slug: completedSlug,
    referralLink: profile.referralLink,
  });
  ambassadorMemoryCache.delete(wallet.address);

  return {
    wallet,
    txId,
    explorerUrl: `https://tronscan.org/#/transaction/${txId}`,
    slug: completedSlug,
    slugHash,
    referralLink: profile.referralLink,
    profile,
  };
}

export async function getAmbassadorRegistrationEnergyQuote(input: {
  wallet: string;
  slug: string;
}): Promise<AmbassadorRegistrationEnergyQuote> {
  const wallet = normalizeAddress(input.wallet);
  const slug = normalizeAmbassadorSlug(input.slug);

  if (!wallet) {
    throw new Error('Wallet is missing.');
  }

  if (!isValidAmbassadorSlug(slug)) {
    throw new Error('Slug must be 3-24 chars: a-z, 0-9, underscore or dash.');
  }

  const payload = await fetchJsonOrThrow<{
    ok?: boolean;
    result?: AmbassadorRegistrationEnergyQuote;
  }>(buildWalletApiUrl('/ambassador/registration-energy/quote'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, slug }),
  });

  const result = payload?.result;

  if (!result?.paymentAddress || !result?.amountTrx) {
    throw new Error('Energy rental quote is unavailable.');
  }

  return {
    mode: String(result.mode || 'api'),
    wallet: normalizeAddress(result.wallet || wallet),
    slug: normalizeAmbassadorSlug(result.slug || slug),
    paymentAddress: normalizeAddress(result.paymentAddress),
    amountSun: String(result.amountSun || '0'),
    amountTrx: String(result.amountTrx || '0'),
    energyQuantity: Number(result.energyQuantity || 0),
    readyEnergy: Number(result.readyEnergy || 0) || undefined,
  };
}

export async function confirmAmbassadorRegistrationEnergy(input: {
  wallet: string;
  slug: string;
  paymentTxId: string;
}): Promise<AmbassadorRegistrationEnergyConfirmation> {
  const wallet = normalizeAddress(input.wallet);
  const slug = normalizeAmbassadorSlug(input.slug);
  const paymentTxId = String(input.paymentTxId || '').trim();

  if (!wallet) {
    throw new Error('Wallet is missing.');
  }

  if (!isValidAmbassadorSlug(slug)) {
    throw new Error('Slug must be 3-24 chars: a-z, 0-9, underscore or dash.');
  }

  if (!paymentTxId) {
    throw new Error('Energy rental payment txid is missing.');
  }

  const payload = await fetchJsonOrThrow<{
    ok?: boolean;
    result?: AmbassadorRegistrationEnergyConfirmation;
  }>(buildWalletApiUrl('/ambassador/registration-energy/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet,
      slug,
      paymentTxId,
    }),
  });

  return payload?.result || {};
}

export async function withdrawAmbassadorRewards(): Promise<AmbassadorWithdrawalReceipt> {
  const { wallet, privateKey } = await getSigningWalletContext();
  const tronWeb = createTronWeb(privateKey, wallet.address);
  const contract = await getControllerContract(tronWeb);
  const result = await contract.withdrawRewards().send({
    feeLimit: DEFAULT_WITHDRAW_FEE_LIMIT_SUN,
    shouldPollResponse: false,
  });
  const txId = extractTxid(result);

  if (!txId) {
    throw new Error('Withdrawal transaction sent but txid was not returned.');
  }

  await fetchJsonOrThrow(buildWalletApiUrl('/ambassador/withdrawal/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet: wallet.address,
      txid: txId,
    }),
  });

  ambassadorMemoryCache.delete(wallet.address);

  return {
    wallet,
    txId,
    explorerUrl: `https://tronscan.org/#/transaction/${txId}`,
  };
}

export async function estimateAmbassadorWithdrawal(): Promise<AmbassadorWithdrawalReview> {
  const { wallet, privateKey } = await getSigningWalletContext();
  const profile = await lookupAmbassadorOnChain(wallet.address, { force: true });

  if (!profile) {
    throw new Error('This wallet is not registered as ambassador.');
  }

  const cabinet = await loadAmbassadorCabinet(profile).catch(() => null);
  const claimableRewardsSun = normalizeSunInteger(cabinet?.summary?.claimable_rewards_sun);

  if (BigInt(claimableRewardsSun) <= 0n) {
    throw new Error('No on-chain rewards are available for withdrawal yet.');
  }

  const tronWeb = createTronWeb(privateKey, wallet.address);
  const resources = await estimateContractCallResources({
    tronWeb,
    privateKey,
    ownerAddress: wallet.address,
    contractAddress: FOURTEEN_CONTROLLER_ADDRESS,
    functionSelector: 'withdrawRewards()',
    feeLimitSun: DEFAULT_WITHDRAW_FEE_LIMIT_SUN,
    maxFeeLimitSun: DEFAULT_WITHDRAW_FEE_LIMIT_SUN,
  });
  const trxBalance = await getTokenDetails(wallet.address, TRX_TOKEN_ID, false, wallet.id);
  const trxBalanceSun = Math.max(0, Number(trxBalance.balanceRaw || '0'));
  const missingTrxSun = Math.max(0, resources.estimatedBurnSun - trxBalanceSun);

  return {
    wallet,
    controllerAddress: FOURTEEN_CONTROLLER_ADDRESS,
    claimableRewardsSun,
    resources,
    trxCoverage: {
      trxBalanceSun,
      trxBalanceDisplay: formatTrxBalanceDisplay(trxBalanceSun),
      missingTrxSun,
      canCoverBurn: trxBalanceSun >= resources.estimatedBurnSun,
    },
  };
}

export async function replayAmbassadorPendingRewards(walletAddress: string) {
  const wallet = normalizeAddress(walletAddress);

  if (!wallet) {
    throw new Error('Wallet is missing.');
  }

  const payload = await fetchJsonOrThrow<{ ok?: boolean; result?: unknown }>(
    buildBackendUrl('/cabinet/replay-pending'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet }),
    }
  );

  ambassadorMemoryCache.delete(wallet);
  return payload?.result || payload;
}

async function readAmbassadorSnapshot(options?: { force?: boolean }): Promise<AmbassadorScreenSnapshot> {
  const activeWallet = await getActiveWallet();

  if (!activeWallet) {
    return {
      wallet: null,
      signingWalletAvailable: false,
      switchedFromWatchOnly: false,
      registered: false,
      profile: null,
      cabinet: null,
      status: 'no-wallet',
      message: 'Import or create a wallet to use ambassador flows.',
    };
  }

  const wallet = activeWallet;
  const signingWalletAvailable = activeWallet.kind !== 'watch-only';

  if (!signingWalletAvailable) {
    return {
      wallet,
      signingWalletAvailable: false,
      switchedFromWatchOnly: false,
      registered: false,
      profile: null,
      cabinet: null,
      status: 'watch-only',
      message:
        'Watch-only wallets are not available for ambassador registration or cabinet actions. Select a seed phrase or private-key wallet.',
    };
  }

  let onChainProfile: AmbassadorProfile | null = null;

  try {
    onChainProfile = await lookupAmbassadorOnChain(wallet.address, { force: options?.force });
  } catch (error) {
    console.error('[4TEEN] ambassador on-chain lookup failed', error);
    return {
      wallet,
      signingWalletAvailable,
      switchedFromWatchOnly: false,
      registered: false,
      profile: null,
      cabinet: null,
      status: 'unavailable',
      message: 'Could not verify ambassador status on-chain. Try again in a moment.',
    };
  }

  if (!onChainProfile) {
    return {
      wallet,
      signingWalletAvailable,
      switchedFromWatchOnly: false,
      registered: false,
      profile: null,
      cabinet: null,
      status: 'register',
      message: 'This wallet is not registered as an ambassador yet.',
    };
  }

  const cabinet = await loadAmbassadorCabinet(onChainProfile).catch(() => null);
  const profile = cabinet?.profile || onChainProfile;

  if (profile.slug) {
    await saveLocalAmbassadorSlug(wallet.address, profile.slug);
  }

  await writeAmbassadorIdentityCache({
    wallet: wallet.address,
    registered: true,
    active: profile.status !== 'inactive',
    slug: profile.slug,
    referralLink: profile.referralLink,
  });

  return {
    wallet,
    signingWalletAvailable,
    switchedFromWatchOnly: false,
    registered: true,
    profile,
    cabinet,
    status: 'cabinet',
    message: cabinet ? '' : 'Ambassador profile found, but cabinet data is temporarily unavailable.',
  };
}

export async function loadAmbassadorScreenSnapshot(options?: {
  force?: boolean;
}): Promise<AmbassadorScreenSnapshot> {
  const activeWallet = await getActiveWallet();
  const cacheKey = activeWallet?.address || 'no-wallet';
  const cached = ambassadorMemoryCache.get(cacheKey);

  if (
    !options?.force &&
    cached &&
    Date.now() - cached.savedAt < getSnapshotMemoryCacheTtl(cached.snapshot)
  ) {
    return cached.snapshot;
  }

  const inflightKey = options?.force ? `${cacheKey}:force` : cacheKey;
  const existing = ambassadorInflight.get(inflightKey);

  if (existing) {
    return existing;
  }

  const task = readAmbassadorSnapshot({ force: options?.force })
    .then((snapshot) => {
      if (getSnapshotMemoryCacheTtl(snapshot) > 0) {
        ambassadorMemoryCache.set(cacheKey, {
          savedAt: Date.now(),
          snapshot,
        });
      } else {
        ambassadorMemoryCache.delete(cacheKey);
      }

      return snapshot;
    })
    .finally(() => {
      ambassadorInflight.delete(inflightKey);
    });

  ambassadorInflight.set(inflightKey, task);
  return task;
}

export async function clearAmbassadorCaches(): Promise<void> {
  ambassadorMemoryCache.clear();
  ambassadorInflight.clear();

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter(
      (key) =>
        key.startsWith(LOCAL_AMBASSADOR_SLUG_KEY_PREFIX) ||
        key.startsWith(LOCAL_AMBASSADOR_IDENTITY_KEY_PREFIX)
    );

    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch (error) {
    console.error('Failed to clear ambassador caches:', error);
    throw error;
  }
}

export async function getBuyerAmbassadorAddress(buyerWallet: string) {
  const buyer = normalizeAddress(buyerWallet);
  if (!buyer) {
    throw new Error('Buyer wallet is missing.');
  }

  const tronWeb = createTronWeb();
  const contract = await getControllerContract(tronWeb);
  const raw = await contract.getBuyerAmbassador(buyer).call();
  const value = normalizeAddress((raw as { toString?: () => string })?.toString?.() || raw);

  return isZeroAddress(value) ? null : value;
}

export async function waitForBuyerAmbassadorBinding(input: {
  buyerWallet: string;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  const timeoutMs = Math.max(2_000, Math.floor(Number(input.timeoutMs || 18_000)));
  const intervalMs = Math.max(750, Math.floor(Number(input.intervalMs || 2_250)));
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ambassadorWallet = await getBuyerAmbassadorAddress(input.buyerWallet).catch(() => null);

    if (ambassadorWallet) {
      return {
        status: 'bound' as const,
        ambassadorWallet,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    status: 'not-bound-yet' as const,
    ambassadorWallet: null,
  };
}
