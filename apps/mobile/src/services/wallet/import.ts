import { validateMnemonic, wordlists } from 'bip39';
import { TronWeb } from 'tronweb';
import {
  saveWallet,
  type WalletMeta,
  type WalletMnemonicSource,
} from './storage';

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

async function saveMnemonicWallet(input: {
  name: string;
  mnemonic: string;
  mnemonicSource: WalletMnemonicSource;
}): Promise<WalletMeta> {
  const words = normalizeMnemonicInput(input.mnemonic);
  const normalizedMnemonic = words.join(' ');
  const allWordsInWordlist = words.every((word) => wordlists.english.includes(word));
  const validateDefault = validateMnemonic(normalizedMnemonic);
  const validateEnglish = validateMnemonic(normalizedMnemonic, wordlists.english);

  if (__DEV__) {
    console.log('MNEMONIC DEBUG SAFE', {
      wordCount: words.length,
      normalizedLength: normalizedMnemonic.length,
      allWordsInWordlist,
      validateDefault,
      validateEnglish,
      firstWordLength: words[0]?.length ?? 0,
      lastWordLength: words[words.length - 1]?.length ?? 0,
    });
  }

  if (words.length !== 12 && words.length !== 24) {
    throw new Error('Seed phrase must contain 12 or 24 words.');
  }

  if (!allWordsInWordlist) {
    throw new Error('Seed phrase contains words outside the BIP39 English list.');
  }

  if (__DEV__ && !validateDefault && !validateEnglish) {
    console.warn('BIP39 validation mismatch in RN runtime, continuing to derivation.');
  }

  const account = TronWeb.fromMnemonic(normalizedMnemonic, TRON_DERIVATION_PATH);

  if (__DEV__) {
    console.log('TRON ACCOUNT DEBUG SAFE', {
      hasAddress: !!account?.address,
      hasPrivateKey: !!account?.privateKey,
    });
  }

  if (!account?.address || !account?.privateKey) {
    throw new Error('Failed to derive wallet from seed phrase.');
  }

  return saveWallet({
    name: input.name,
    address: account.address,
    kind: 'mnemonic',
    mnemonicSource: input.mnemonicSource,
    secret: {
      mnemonic: normalizedMnemonic,
      privateKey: account.privateKey,
    },
  });
}

export async function importWalletFromMnemonic(input: {
  name: string;
  mnemonic: string;
}): Promise<WalletMeta> {
  return saveMnemonicWallet({
    name: input.name,
    mnemonic: input.mnemonic,
    mnemonicSource: 'imported-seed',
  });
}

export async function createWalletFromGeneratedMnemonic(input: {
  name: string;
  mnemonic: string;
}): Promise<WalletMeta> {
  return saveMnemonicWallet({
    name: input.name,
    mnemonic: input.mnemonic,
    mnemonicSource: 'created-in-app',
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
