import { TronWeb } from 'tronweb';

export type NoteTarget = {
  network: 'tron-mainnet';
  address: string;
  txHash: string;
};

export const NOTE_MAX_LENGTH = 120;

export function noteKey(target: NoteTarget): string {
  if (
    !target ||
    target.network !== 'tron-mainnet' ||
    typeof target.address !== 'string' ||
    target.address.length !== 34 ||
    !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(target.address) ||
    !TronWeb.isAddress(target.address) ||
    typeof target.txHash !== 'string' ||
    target.txHash.length !== 64 ||
    !/^[a-fA-F0-9]{64}$/.test(target.txHash)
  ) {
    throw new Error('Invalid transaction note target');
  }

  return `fourteen_transaction_note_v1.${target.network}.${target.address}.${target.txHash.toLowerCase()}`;
}

export function normalizeNote(text: string): string {
  if (typeof text !== 'string') throw new TypeError('Invalid transaction note');
  const normalized = text.trim();
  if (Array.from(normalized).length > NOTE_MAX_LENGTH) {
    throw new RangeError('Transaction note exceeds 120 Unicode code points');
  }
  return normalized;
}
