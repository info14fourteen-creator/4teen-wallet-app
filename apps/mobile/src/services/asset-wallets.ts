import { TronWeb } from 'tronweb';

import { buildTrongridHeaders, TRONGRID_BASE_URL } from '../config/tron';
import { FOURTEEN_CONTRACT, tronscanFetch } from './tron/api';

const TOKEN_DECIMALS = 6;
const ASSET_WALLETS_CACHE_TTL_MS = 30 * 60 * 1000;
const TRANSFER_LOOKUP_LIMIT = 200;

export const ASSET_WALLET_DEFINITIONS = [
  {
    id: 'fourteen-vault',
    label: 'FourteenVault',
    address: 'TNwkuHA727RZGtpbowH7q5B1yZWk2JEZTq',
    role: 'liquidity token reserve',
  },
  {
    id: 'airdrop-vault',
    label: 'AirdropVault',
    address: 'TV6eXKWCsZ15c3Svz39mRQWtBsqvNNBwpQ',
    role: 'community distribution reserve',
  },
  {
    id: 'team-lock-vault',
    label: 'TeamLockVault',
    address: 'TYBfbgvMW6awPdZfSSwWoEX3nJjrKWZS3h',
    role: 'team allocation lock vault',
  },
] as const;

type AssetWalletDefinition = (typeof ASSET_WALLET_DEFINITIONS)[number];

type FourteenBalanceContract = {
  balanceOf: (address: string) => { call: () => Promise<unknown> };
};

type TronscanTrc20TransferItem = {
  transaction_id?: string;
  status?: number;
  block_ts?: number;
  from_address?: string;
  to_address?: string;
  quant?: string | number;
  confirmed?: boolean;
  revert?: boolean;
  contractRet?: string;
  finalResult?: string;
};

type TronscanTrc20TransferResponse = {
  token_transfers?: TronscanTrc20TransferItem[];
};

export type AssetWalletDeposit = {
  txId: string;
  explorerUrl: string;
  fromAddress: string;
  timestamp: number;
  amount: number;
};

export type AssetWalletSnapshotItem = {
  id: AssetWalletDefinition['id'];
  label: string;
  address: string;
  role: string;
  explorerUrl: string;
  balance: number | null;
  lastDeposit: AssetWalletDeposit | null;
  status: 'ready' | 'partial' | 'unavailable';
  message: string;
};

export type AssetWalletsSnapshot = {
  tokenAddress: string;
  tokenExplorerUrl: string;
  wallets: AssetWalletSnapshotItem[];
  loadedAt: number;
  status: 'ready' | 'partial' | 'unavailable';
  message: string;
};

type AssetWalletsCacheEntry = {
  savedAt: number;
  snapshot: AssetWalletsSnapshot;
};

const assetWalletsMemoryCache = new Map<string, AssetWalletsCacheEntry>();
const assetWalletsInflight = new Map<string, Promise<AssetWalletsSnapshot>>();

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

function buildTokenAbi() {
  return [
    {
      inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ];
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

function decodeHexUint256(hexValue: string | null | undefined) {
  if (!hexValue || typeof hexValue !== 'string') return null;

  try {
    return parseInt(hexValue, 16);
  } catch {
    return null;
  }
}

function fromTokenUnits(value: unknown) {
  const raw = normalizeCallNumber(value);
  if (!Number.isFinite(raw)) return null;
  return raw / Math.pow(10, TOKEN_DECIMALS);
}

function buildExplorerUrl(txId: string) {
  return txId ? `https://tronscan.org/#/transaction/${txId}` : 'https://tronscan.org/';
}

function buildContractUrl(address: string) {
  return `https://tronscan.org/#/contract/${address}`;
}

function isSuccessfulTransfer(row: TronscanTrc20TransferItem) {
  const contractRet = String(row.contractRet || row.finalResult || '').toUpperCase();
  return row.revert !== true && contractRet !== 'REVERT' && contractRet !== 'FAILED';
}

async function readTokenBalance(walletAddress: string) {
  const tronWeb = createReadonlyTronWeb(walletAddress);

  try {
    const contract = (await tronWeb.contract(
      buildTokenAbi(),
      FOURTEEN_CONTRACT
    )) as unknown as FourteenBalanceContract;
    const raw = await contract.balanceOf(walletAddress).call();
    const normalized = fromTokenUnits(raw);

    if (normalized === null) {
      throw new Error('balanceOf: invalid result');
    }

    return normalized;
  } catch (contractError) {
    const ownerHex = tronWeb.address.toHex(walletAddress);
    const contractHex = tronWeb.address.toHex(FOURTEEN_CONTRACT);

    const result = await tronWeb.transactionBuilder.triggerConstantContract(
      contractHex,
      'balanceOf(address)',
      {},
      [{ type: 'address', value: walletAddress }],
      ownerHex
    );

    const decoded = decodeHexUint256(result?.constant_result?.[0] || null);
    const normalized = fromTokenUnits(decoded);

    if (normalized === null) {
      throw contractError;
    }

    return normalized;
  }
}

async function readLastIncomingDeposit(walletAddress: string): Promise<AssetWalletDeposit | null> {
  const findIncoming = (rows: TronscanTrc20TransferItem[]) =>
    rows.find((row) => {
      return (
        String(row.to_address || '') === walletAddress &&
        Number(row.quant || 0) > 0 &&
        isSuccessfulTransfer(row)
      );
    });

  const response = await tronscanFetch<TronscanTrc20TransferResponse>('/token_trc20/transfers', {
    relatedAddress: walletAddress,
    contract_address: FOURTEEN_CONTRACT,
    start: 0,
    limit: TRANSFER_LOOKUP_LIMIT,
    reverse: true,
  });

  const primaryRows = response.token_transfers ?? [];
  let incoming = findIncoming(primaryRows);

  if (!incoming) {
    const targeted = await tronscanFetch<TronscanTrc20TransferResponse>('/token_trc20/transfers', {
      toAddress: walletAddress,
      contract_address: FOURTEEN_CONTRACT,
      start: 0,
      limit: TRANSFER_LOOKUP_LIMIT,
      reverse: true,
    }).catch(() => null);

    incoming = findIncoming(targeted?.token_transfers ?? []);
  }

  if (!incoming) {
    const targetedAlt = await tronscanFetch<TronscanTrc20TransferResponse>('/token_trc20/transfers', {
      to_address: walletAddress,
      contract_address: FOURTEEN_CONTRACT,
      start: 0,
      limit: TRANSFER_LOOKUP_LIMIT,
      reverse: true,
    }).catch(() => null);

    incoming = findIncoming(targetedAlt?.token_transfers ?? []);
  }

  if (!incoming) {
    return null;
  }

  const txId = String(incoming.transaction_id || '').trim();

  return {
    txId,
    explorerUrl: buildExplorerUrl(txId),
    fromAddress: String(incoming.from_address || ''),
    timestamp: Number(incoming.block_ts || 0),
    amount: Number(incoming.quant || 0) / Math.pow(10, TOKEN_DECIMALS),
  };
}

async function readAssetWallet(definition: AssetWalletDefinition): Promise<AssetWalletSnapshotItem> {
  const [balanceResult, depositResult] = await Promise.allSettled([
    readTokenBalance(definition.address),
    readLastIncomingDeposit(definition.address),
  ]);

  const balance =
    balanceResult.status === 'fulfilled' && Number.isFinite(balanceResult.value)
      ? balanceResult.value
      : null;
  const lastDeposit = depositResult.status === 'fulfilled' ? depositResult.value : null;
  const failures = [balanceResult, depositResult].filter((result) => result.status === 'rejected');
  const status = failures.length === 0 ? 'ready' : failures.length === 2 ? 'unavailable' : 'partial';

  return {
    id: definition.id,
    label: definition.label,
    address: definition.address,
    role: definition.role,
    explorerUrl: buildContractUrl(definition.address),
    balance,
    lastDeposit,
    status,
    message:
      status === 'ready'
        ? ''
        : status === 'partial'
          ? 'Part of this wallet data is temporarily unavailable.'
          : 'Could not load this wallet on-chain data.',
  };
}

async function readAssetWalletsSnapshot(): Promise<AssetWalletsSnapshot> {
  const wallets = await Promise.all(ASSET_WALLET_DEFINITIONS.map(readAssetWallet));
  const readyCount = wallets.filter((wallet) => wallet.status === 'ready').length;
  const status = readyCount === wallets.length ? 'ready' : readyCount === 0 ? 'unavailable' : 'partial';

  return {
    tokenAddress: FOURTEEN_CONTRACT,
    tokenExplorerUrl: `https://tronscan.org/#/token20/${FOURTEEN_CONTRACT}`,
    wallets,
    loadedAt: Date.now(),
    status,
    message:
      status === 'ready'
        ? ''
        : status === 'partial'
          ? 'Some asset wallet data is temporarily unavailable.'
          : 'Asset wallet data is temporarily unavailable.',
  };
}

export async function loadAssetWalletsSnapshot(options?: {
  force?: boolean;
}): Promise<AssetWalletsSnapshot> {
  const cacheKey = 'asset-wallets';
  const cached = assetWalletsMemoryCache.get(cacheKey);

  if (!options?.force && cached && Date.now() - cached.savedAt < ASSET_WALLETS_CACHE_TTL_MS) {
    return cached.snapshot;
  }

  const inflightKey = options?.force ? `${cacheKey}:force` : cacheKey;
  const existing = assetWalletsInflight.get(inflightKey);

  if (existing) {
    return existing;
  }

  const task = readAssetWalletsSnapshot()
    .then((snapshot) => {
      assetWalletsMemoryCache.set(cacheKey, {
        savedAt: Date.now(),
        snapshot,
      });
      return snapshot;
    })
    .finally(() => {
      assetWalletsInflight.delete(inflightKey);
    });

  assetWalletsInflight.set(inflightKey, task);
  return task;
}

export function clearAssetWalletsCaches(): void {
  assetWalletsMemoryCache.clear();
  assetWalletsInflight.clear();
}
