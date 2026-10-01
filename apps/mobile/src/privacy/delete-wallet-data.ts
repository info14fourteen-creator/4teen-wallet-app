import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { freezeLocalWrites } from './deletion-barrier';
import type { WalletMeta } from '../services/wallet/storage';
import { deleteNotesForAddress } from '../features/transaction-notes/storage';

const LIST = 'fourteen_wallet_list_v1';
const ACTIVE = 'fourteen_active_wallet_id_v1';
const PASSCODE = 'fourteen_wallet_local_passcode_v1';
const SECURITY_KEYS = [PASSCODE, 'fourteen_wallet_biometrics_enabled_v1', 'fourteen_wallet_auto_lock_mode_v1'];
const CONTACT_KEYS = ['fourteen_wallet_address_book_v3', 'fourteen_wallet_recent_recipients_v1'];
const secretKey = (id: string) => `fourteen_wallet_secret_${id}`;

export type DeletionRequest = { walletId?: string; allWallets?: boolean; backupAcknowledged: boolean; passcode: string };
export class WalletDeletionError extends Error {
  constructor(public code: 'backup' | 'passcode' | 'storage' | 'missing' | 'busy') { super(code); }
}

type DeletionPlan = {
  requestKey: string;
  targets: WalletMeta[];
  remaining: WalletMeta[];
  asyncKeys: string[];
  contactUpdates: { key: string; value: string | null }[];
  nextActive: string | null;
  all: boolean;
};
let plan: DeletionPlan | null = null;
let executing = false;
export function isWalletDeletionRunning() { return executing; }
let deletionSettled: Promise<void> = Promise.resolve();
export function waitForWalletDeletion() { return deletionSettled; }

export async function listWalletsForDeletion(): Promise<WalletMeta[]> {
  const raw = await AsyncStorage.getItem(LIST);
  if (raw === null) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new WalletDeletionError('storage'); }
  if (!Array.isArray(value) || value.some(w => !w || typeof w.id !== 'string' || !w.id ||
    typeof w.address !== 'string' || !w.address || typeof w.name !== 'string' ||
    !['mnemonic', 'private-key', 'watch-only'].includes(w.kind))) {
    throw new WalletDeletionError('storage');
  }
  return value;
}

export function belongsToWallet(key: string, wallets: Pick<WalletMeta, 'id' | 'address'>[]) {
  const parts = key.toLowerCase().split(':');
  return wallets.some(w => parts.includes(w.id.toLowerCase()) || parts.includes(w.address.toLowerCase()));
}

async function prepare(request: DeletionRequest): Promise<DeletionPlan> {
  const wallets = await listWalletsForDeletion();
  const all = request.allWallets === true;
  const targets = all ? wallets : wallets.filter(w => w.id === request.walletId);
  if (!all && targets.length !== 1) throw new WalletDeletionError('missing');
  if (!request.backupAcknowledged) throw new WalletDeletionError('backup');
  // Do not use the development QA passcode bypass for destructive operations.
  const passcode = await SecureStore.getItemAsync(PASSCODE);
  if (passcode !== null && request.passcode !== passcode) throw new WalletDeletionError('passcode');
  const active = await AsyncStorage.getItem(ACTIVE);
  const remaining = wallets.filter(w => !targets.some(t => t.id === w.id));
  const allKeys = await AsyncStorage.getAllKeys();
  const asyncKeys = all ? allKeys.filter(k => k !== LIST && k !== ACTIVE)
    : allKeys.filter(k => belongsToWallet(k, targets));
  // Drafts may predate per-wallet IDs. Clear an unscoped draft only when the
  // deleted wallet is the selected wallet; never erase another wallet's draft.
  const swapKey = 'fourteen_swap_draft_v1';
  const swap = await AsyncStorage.getItem(swapKey);
  if (swap && !all) {
    let draft: { walletId?: string };
    try { draft = JSON.parse(swap); } catch { throw new WalletDeletionError('storage'); }
    if (targets.some(w => w.id === draft?.walletId) || (!draft?.walletId && targets.some(w => w.id === active))) asyncKeys.push(swapKey);
  }
  if (!all && targets.some(w => w.id === active)) asyncKeys.push('fourteen_direct_buy_draft_v1');
  const contactUpdates: DeletionPlan['contactUpdates'] = [];
  for (const key of CONTACT_KEYS) {
    const raw = await SecureStore.getItemAsync(key);
    if (all || raw === null) { contactUpdates.push({ key, value: null }); continue; }
    let contacts: unknown;
    try { contacts = JSON.parse(raw); } catch { throw new WalletDeletionError('storage'); }
    if (!Array.isArray(contacts) || contacts.some(c => !c || typeof c.address !== 'string')) throw new WalletDeletionError('storage');
    const kept = contacts.filter(c => !targets.some(w => w.address === c.address));
    contactUpdates.push({ key, value: kept.length ? JSON.stringify(kept) : null });
  }
  return { requestKey: all ? 'all' : String(request.walletId), targets, remaining, asyncKeys: [...new Set(asyncKeys)],
    contactUpdates, nextActive: remaining.some(w => w.id === active) ? active : remaining[0]?.id ?? null, all };
}

export async function deleteWalletData(request: DeletionRequest): Promise<void> {
  if (executing) throw new WalletDeletionError('busy');
  const requestKey = request.allWallets ? 'all' : String(request.walletId);
  if (plan && plan.requestKey !== requestKey) throw new WalletDeletionError('busy');
  executing = true;
  let settle!: () => void;
  deletionSettled = new Promise<void>(resolve => { settle = resolve; });
  try {
    if (!plan) {
      // Validate credentials/backup and read all data before touching any keys.
      await prepare(request);
      await freezeLocalWrites();
      // Drain in-flight persistence before taking the final snapshot.
      plan = await prepare(request);
    }
    const current = plan;
    if (current.asyncKeys.length) await AsyncStorage.multiRemove(current.asyncKeys);
    for (const { key, value } of current.contactUpdates) {
      if (value === null) await SecureStore.deleteItemAsync(key);
      else await SecureStore.setItemAsync(key, value);
    }
    // A second wallet entry can point to the same public address. Retain its
    // notes until the last entry for that address is deleted.
    for (const address of new Set(current.targets.map(wallet => wallet.address))) {
      if (!current.remaining.some(wallet => wallet.address === address)) {
        await deleteNotesForAddress('tron-mainnet', address);
      }
    }
    // Keep the registry until secrets are erased so a failed deletion can be retried.
    for (const wallet of current.targets) {
      await SecureStore.deleteItemAsync(secretKey(wallet.id));
      if (await SecureStore.getItemAsync(secretKey(wallet.id)) !== null) throw new WalletDeletionError('storage');
    }
    if (current.all) {
      for (const key of SECURITY_KEYS) await SecureStore.deleteItemAsync(key);
    }
    for (const key of current.asyncKeys) {
      if (await AsyncStorage.getItem(key) !== null) throw new WalletDeletionError('storage');
    }
    for (const { key, value } of current.contactUpdates) {
      if (await SecureStore.getItemAsync(key) !== value) throw new WalletDeletionError('storage');
    }
    if (current.all) {
      for (const key of SECURITY_KEYS) {
        if (await SecureStore.getItemAsync(key) !== null) throw new WalletDeletionError('storage');
      }
    }
    if (current.nextActive) await AsyncStorage.setItem(ACTIVE, current.nextActive);
    else await AsyncStorage.removeItem(ACTIVE);
    if (current.remaining.length) await AsyncStorage.setItem(LIST, JSON.stringify(current.remaining));
    else await AsyncStorage.removeItem(LIST);
    const persisted = await listWalletsForDeletion();
    if (JSON.stringify(persisted) !== JSON.stringify(current.remaining) || await AsyncStorage.getItem(ACTIVE) !== current.nextActive) {
      throw new WalletDeletionError('storage');
    }
    // Keep the barrier closed until reloadAppAsync clears screens, callbacks,
    // caches, and any previously viewed secrets from the JS runtime.
  } catch (error) {
    if (error instanceof WalletDeletionError) throw error;
    throw new WalletDeletionError('storage');
  } finally { executing = false; settle(); }
}
