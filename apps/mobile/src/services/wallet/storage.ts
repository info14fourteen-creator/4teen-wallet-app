import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export type WalletKind = 'mnemonic' | 'private-key' | 'watch-only';

export type WalletMeta = {
  id: string;
  name: string;
  address: string;
  kind: WalletKind;
  createdAt: string;
};

export type WalletSecretPayload = {
  mnemonic?: string;
  privateKey?: string;
};

const WALLET_LIST_KEY = 'fourteen_wallet_list_v1';
const ACTIVE_WALLET_ID_KEY = 'fourteen_active_wallet_id_v1';

function buildSecretKey(id: string) {
  return `fourteen_wallet_secret_${id}`;
}

function buildWalletId() {
  return `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function listWallets(): Promise<WalletMeta[]> {
  const raw = await AsyncStorage.getItem(WALLET_LIST_KEY);

  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as WalletMeta[];
    if (!Array.isArray(parsed)) return [];

    return parsed.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } catch {
    return [];
  }
}

export async function getWalletById(id: string): Promise<WalletMeta | null> {
  const items = await listWallets();
  return items.find((item) => item.id === id) ?? null;
}

export async function getWalletByAddress(address: string): Promise<WalletMeta | null> {
  const normalized = address.trim().toLowerCase();
  const items = await listWallets();

  return items.find((item) => item.address.trim().toLowerCase() === normalized) ?? null;
}

export async function saveWallet(
  input: {
    name: string;
    address: string;
    kind: WalletKind;
    secret?: WalletSecretPayload;
  }
): Promise<WalletMeta> {
  const name = input.name.trim();
  const address = input.address.trim();

  if (!name) {
    throw new Error('Wallet name is required.');
  }

  if (!address) {
    throw new Error('Wallet address is required.');
  }

  const existing = await getWalletByAddress(address);
  if (existing) {
    throw new Error('This wallet is already imported.');
  }

  const wallet: WalletMeta = {
    id: buildWalletId(),
    name,
    address,
    kind: input.kind,
    createdAt: new Date().toISOString(),
  };

  const current = await listWallets();
  await AsyncStorage.setItem(WALLET_LIST_KEY, JSON.stringify([wallet, ...current]));

  if (input.secret && (input.secret.mnemonic || input.secret.privateKey)) {
    await SecureStore.setItemAsync(
      buildSecretKey(wallet.id),
      JSON.stringify(input.secret)
    );
  }

  await setActiveWalletId(wallet.id);

  return wallet;
}

export async function getWalletSecret(id: string): Promise<WalletSecretPayload | null> {
  const raw = await SecureStore.getItemAsync(buildSecretKey(id));

  if (!raw) return null;

  try {
    return JSON.parse(raw) as WalletSecretPayload;
  } catch {
    return null;
  }
}

export async function setActiveWalletId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_WALLET_ID_KEY, id);
}

export async function getActiveWalletId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_WALLET_ID_KEY);
}

export async function getActiveWallet(): Promise<WalletMeta | null> {
  const id = await getActiveWalletId();
  if (!id) return null;
  return getWalletById(id);
}

export async function renameWallet(id: string, nextName: string): Promise<WalletMeta> {
  const name = nextName.trim();

  if (!name) {
    throw new Error('Wallet name is required.');
  }

  const current = await listWallets();
  const index = current.findIndex((item) => item.id === id);

  if (index === -1) {
    throw new Error('Wallet not found.');
  }

  const updated: WalletMeta = {
    ...current[index],
    name,
  };

  const next = [...current];
  next[index] = updated;

  await AsyncStorage.setItem(WALLET_LIST_KEY, JSON.stringify(next));

  return updated;
}

export async function removeWallet(id: string): Promise<void> {
  const current = await listWallets();
  const target = current.find((item) => item.id === id);

  if (!target) {
    throw new Error('Wallet not found.');
  }

  const next = current.filter((item) => item.id !== id);

  await AsyncStorage.setItem(WALLET_LIST_KEY, JSON.stringify(next));
  await SecureStore.deleteItemAsync(buildSecretKey(id));

  const activeId = await getActiveWalletId();

  if (activeId === id) {
    if (next.length > 0) {
      await setActiveWalletId(next[0].id);
    } else {
      await AsyncStorage.removeItem(ACTIVE_WALLET_ID_KEY);
    }
  }
}
