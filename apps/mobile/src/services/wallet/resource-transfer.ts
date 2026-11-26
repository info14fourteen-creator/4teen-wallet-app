import { runRecordedTransfer } from './recorded-transfer';
import { calculateTransferFeeSun } from './transfer-fee';
import { estimateAssetTransfer, sendAssetTransfer, waitForTransferConfirmation, type SendAssetTransferInput, type SendAssetTransferEstimate } from './send';
import { clearWalletRuntimeCaches, TRX_TOKEN_ID } from '../tron/api';
import { getPendingEnergyRentalQuote, rentEnergyForPurpose, type EnergyResaleQuote, type EnergyResaleProgress } from '../energy-resale';

export function sendWithResources(input: SendAssetTransferInput & {
  wallet: string;
  quote: EnergyResaleQuote | null;
  review?: SendAssetTransferEstimate;
  approvedFeeSun?: number;
  allowBurnFallback?: boolean;
  onProgress?: (progress: EnergyResaleProgress) => void;
}) {
  return runRecordedTransfer({
    key: `send:${input.wallet}`,
    identity: JSON.stringify([input.wallet, input.tokenId, input.toAddress, input.amount]),
    context: input.review,
    send: async beforeBroadcast => {
      clearWalletRuntimeCaches(input.wallet);
      let estimate = await estimateAssetTransfer(input);
      if (estimate.wallet.address !== input.wallet) throw new Error('Active wallet changed. Reopen the transfer.');
      if (estimate.token.isNative) {
        return sendAssetTransfer({ ...input, feeApproval: undefined, expectedWalletAddress: input.wallet,
          requireResources: false, maxNetworkFeeSun: input.approvedFeeSun, beforeBroadcast });
      }
      if (input.feeApproval) {
        return sendAssetTransfer({ ...input, expectedWalletAddress: input.wallet, beforeBroadcast });
      }
      const pending = await getPendingEnergyRentalQuote('send_transfer', input.wallet);
      const needsRental = estimate.resources.energyShortfall > 0 || estimate.resources.bandwidthShortfall > 0;
      // Never infer permission to burn from a failed or uncertain paid rental.
      if (needsRental && !pending && !input.quote && input.allowBurnFallback) {
        if (!Number.isSafeInteger(input.approvedFeeSun) || Number(input.approvedFeeSun) < 0 ||
            !Number.isSafeInteger(estimate.resources.estimatedBurnSun) ||
            estimate.resources.estimatedBurnSun > Number(input.approvedFeeSun)) {
          throw new Error('Transaction fee changed. Refresh and confirm the new amount.');
        }
        return sendAssetTransfer({
          ...input, expectedWalletAddress: input.wallet, requireResources: false,
          maxNetworkFeeSun: input.approvedFeeSun, beforeBroadcast,
        });
      }
      if (pending || needsRental) {
        const quote = pending || input.quote;
        if (!quote || quote.mode !== 'tronix') throw new Error('TronixRent is unavailable. The transfer has not been sent.');
        if (!pending && (
          Number(quote.requiredEnergy || 0) < estimate.resources.energyShortfall ||
          Number(quote.requiredBandwidth || 0) < estimate.resources.bandwidthShortfall
        )) throw new Error('Resource requirements changed. Refresh before approval.');
        if (!pending) {
          const payment = await estimateAssetTransfer({
            tokenId: TRX_TOKEN_ID, toAddress: quote.paymentAddress, amount: quote.amountTrx,
          });
          if (payment.wallet.address !== input.wallet) throw new Error('Active wallet changed. Reopen the transfer.');
          if (input.approvedFeeSun !== undefined && calculateTransferFeeSun(
            estimate.resources.estimatedBurnSun, quote, payment.resources.estimatedBurnSun,
          ) > input.approvedFeeSun) throw new Error('Transaction fee changed. Refresh and confirm the new amount.');
          const transferAmount = estimate.token.isNative ? BigInt(estimate.token.amountRaw) : 0n;
          const paymentTotal = BigInt(Math.ceil(payment.trxCoverage.requiredTrxSun));
          if (BigInt(payment.trxCoverage.trxBalanceRaw) < transferAmount + paymentTotal) {
            throw new Error('Not enough TRX for rental and transfer. No rental payment has been sent.');
          }
        }
        await rentEnergyForPurpose({
          purpose: 'send_transfer', wallet: input.wallet, quote, onProgress: input.onProgress,
          maxPaymentNetworkFeeSun: input.approvedFeeSun === undefined ? undefined :
            input.approvedFeeSun - Number(quote.amountSun),
        });
        clearWalletRuntimeCaches(input.wallet);
        estimate = await estimateAssetTransfer(input);
        if (estimate.resources.energyShortfall > 0 || estimate.resources.bandwidthShortfall > 0) {
          throw new Error('Resources are not ready. Retry the existing rental.');
        }
      }
      if (input.approvedFeeSun !== undefined && !pending && !needsRental &&
          estimate.resources.estimatedBurnSun > input.approvedFeeSun) {
        throw new Error('Transaction fee changed. Refresh and confirm the new amount.');
      }
      return sendAssetTransfer({ ...input, expectedWalletAddress: input.wallet, requireResources: true, beforeBroadcast });
    },
    confirm: waitForTransferConfirmation,
  });
}
