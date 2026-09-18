export type HistoryKind = 'airdrop' | 'unlock';
export type ChainEvent = {
  transaction_id?: string;
  block_timestamp?: number | string;
  event_index?: number;
  result?: Record<string, unknown>;
};
export type HistoryRow = {
  id: string;
  txId: string;
  amount: string;
  timestamp: number;
  unlockAt?: number;
};

// Decimal strings preserve the smallest unit and do not lose uint256 precision.
export function formatUnits(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return '—';
  const padded = raw.replace(/^0+(?=\d)/, '').padStart(7, '0');
  const fraction = padded.slice(-6).replace(/0+$/, '');
  return `${padded.slice(0, -6)}${fraction ? `.${fraction}` : ''}`;
}

export function historyRows(
  kind: HistoryKind,
  wallet: string,
  events: ChainEvent[],
  normalizeAddress: (value: string) => string,
): HistoryRow[] {
  const seen = new Set<string>();
  return events.flatMap((event) => {
    const result = event.result ?? {};
    const address = kind === 'airdrop' ? result.to ?? result._to ?? result[0] : result.buyer;
    if (normalizeAddress(String(address ?? '')) !== wallet) return [];
    const txId = String(event.transaction_id ?? '');
    const timestamp = Number(event.block_timestamp);
    const raw = kind === 'airdrop' ? result.amount ?? result._amount ?? result[1] : result.amountTokens;
    const amount = formatUnits(raw);
    const id = `${txId}:${event.event_index ?? 0}`;
    if (!/^[a-f0-9]{64}$/i.test(txId) || !Number.isFinite(timestamp) || timestamp <= 0 ||
      amount === '—' || amount === '0' || seen.has(id)) return [];
    seen.add(id);
    return [{ id, txId, amount, timestamp, ...(kind === 'unlock' ? { unlockAt: timestamp + 14 * 86400000 } : {}) }];
  }).sort((a, b) => b.timestamp - a.timestamp);
}
