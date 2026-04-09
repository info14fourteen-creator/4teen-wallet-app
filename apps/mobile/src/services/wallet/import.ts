import { validateMnemonic, wordlists } from 'bip39';
import { TronWeb } from 'tronweb';
import { saveWallet, type WalletMeta } from './storage';

const TRON_DERIVATION_PATH = "m/44'/195'/0'/0/0";

export function normalizeMnemonicInput(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\b\d+\s*[\.\)]\s*/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/[,:;]+/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getMnemonicSuggestions(prefix: string): string[] {
  const value = prefix.trim().toLowerCase();
  if (!value) return [];
  return wordlists.english.filter((word) => word.startsWith(value)).slice(0, 4);
}

export function normalizePrivateKey(value: string): string {
  return value.trim().replace(/^0x/i, '');
}

export function isValidPrivateKey(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(normalizePrivateKey(value));
}

export function isValidTronAddress(value: string): boolean {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());
}

export async function importWalletFromMnemonic(input: {
  name: string;
  mnemonic: string;
}): Promise<WalletMeta> {
  const words = normalizeMnemonicInput(input.mnemonic);
  const normalizedMnemonic = words.join(' ');

  if (words.length !== 12 && words.length !== 24) {
    throw new Error('Seed phrase must contain 12 or 24 words.');
  }

  if (!validateMnemonic(normalizedMnemonic, wordlists.english)) {
    throw new Error('Seed phrase is invalid.');
  }

  const account = TronWeb.fromMnemonic(normalizedMnemonic, TRON_DERIVATION_PATH);

  if (!account?.address || !account?.privateKey) {
    throw new Error('Failed to derive wallet from seed phrase.');
  }

  return saveWallet({
    name: input.name,
    address: account.address,
    kind: 'mnemonic',
    secret: {
      mnemonic: normalizedMnemonic,
      privateKey: account.privateKey,
    },
  });
}

export async function importWalletFromPrivateKey(input: {
  name: string;
  privateKey: string;
}): Promise<WalletMeta> {
  const privateKey = normalizePrivateKey(input.privateKey);

  if (!isValidPrivateKey(privateKey)) {
    throw new Error('Private key must be 64 hex characters.');
  }

  const address = TronWeb.address.fromPrivateKey(privateKey);

  if (!address || !isValidTronAddress(address)) {
    throw new Error('Failed to derive TRON address from private key.');
  }

  return saveWallet({
    name: input.name,
    address,
    kind: 'private-key',
    secret: {
      privateKey,
    },
  });
}

export async function importWalletFromWatchOnly(input: {
  name: string;
  address: string;
}): Promise<WalletMeta> {
  const address = input.address.trim();

  if (!isValidTronAddress(address)) {
    throw new Error('Enter a valid TRON address.');
  }

  return saveWallet({
    name: input.name,
    address,
    kind: 'watch-only',
  });
}
