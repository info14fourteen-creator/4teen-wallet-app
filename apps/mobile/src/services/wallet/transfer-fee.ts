import type { EnergyResaleQuote } from '../energy-resale';

export function calculateTransferFeeSun(
  transferBurnSun: number,
  quote: Pick<EnergyResaleQuote, 'amountSun'> & Partial<Pick<EnergyResaleQuote, 'amountTrx'>> | null,
  paymentBurnSun?: number,
): number {
  const networkFee = quote ? paymentBurnSun : transferBurnSun;
  if (!Number.isSafeInteger(networkFee) || Number(networkFee) < 0) {
    throw new Error('Unable to calculate transaction fee. Refresh before approval.');
  }
  if (quote && !/^\d+$/.test(quote.amountSun)) throw new Error('Invalid transaction fee.');
  if (quote?.amountTrx !== undefined) {
    if (!/^\d+(\.\d{1,6})?$/.test(quote.amountTrx)) throw new Error('Invalid transaction fee.');
    const [whole, fraction = ''] = quote.amountTrx.split('.');
    if (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0')) !== BigInt(quote.amountSun)) {
      throw new Error('Transaction fee does not match the payment amount.');
    }
  }
  const total = (quote ? BigInt(quote.amountSun) : 0n) + BigInt(networkFee!);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid transaction fee.');
  return Number(total);
}
