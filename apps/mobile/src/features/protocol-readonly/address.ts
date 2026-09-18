import { TronWeb } from 'tronweb';

export function normalizeAddress(address: string): string {
  if (address.startsWith('T') && TronWeb.isAddress(address)) return address;
  const hex = address.replace(/^0x/i, '');
  if (!/^(?:41)?[a-f0-9]{40}$/i.test(hex)) return '';
  try { return TronWeb.address.fromHex(hex.length === 40 ? `41${hex}` : hex); }
  catch { return ''; }
}
