import { TronWeb } from 'tronweb';

import { getFourteenApiBaseUrls, TRONGRID_BASE_URL, buildTrongridHeaders } from '../config/tron';
import { isValidPrivateKey, normalizePrivateKey } from './wallet/import';
import { getActiveWallet, getWalletSecret, type WalletMeta } from './wallet/storage';

const TRON_DERIVATION_PATH = "m/44'/195'/0'/0/0";
const ZERO_ADDRESS_BASE58 = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

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

  throw lastError instanceof Error ? lastError : new Error('4TEEN API is unavailable');
}

async function getSigningWalletContext() {
  const wallet = await getActiveWallet();

  if (!wallet) {
    throw new Error('No wallet available.');
  }

  if (wallet.kind === 'watch-only') {
    throw new Error('Telegram airdrop requires a full-access wallet.');
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
    throw new Error('Telegram airdrop overview is unavailable.');
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
    throw new Error('Telegram airdrop session could not be created.');
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
    throw new Error('Telegram launch link is unavailable.');
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
