import type { TronWeb } from 'tronweb';
import { rentEnergyForPurpose, getPendingEnergyRentalQuote } from '../energy-resale';
import { runRecordedTransfer } from './recorded-transfer';
import { waitForTransferConfirmation } from './send';
import { getResourceUnitPricing, estimateSignedTransactionBandwidth } from './resources';
import { remainingOperationFee, type OperationFeeApproval } from './operation-fee';
import { readCompletedOperation, readOperationLedger, writeOperationLedger } from './operation-ledger';

const active = new Set<string>();

export async function executeContractOperation(input: {
  tronWeb: TronWeb; privateKey: string; wallet: string;
  approval?: OperationFeeApproval; identity: string; stage?: string;
  contractAddress: string; functionSelector: string;
  parameters?: { type: string; value: unknown }[]; callValue?: number;
  beforeBroadcast?: (txId: string, signedTransaction?: unknown) => Promise<void>;
}) {
  const approval = input.approval;
  if (!approval || approval.wallet !== input.wallet) throw new Error('Confirm the transaction fee before sending.');
  if (active.has(input.wallet)) throw new Error('Another operation is still processing.');
  active.add(input.wallet);
  try {
    let ledger = await readCompletedOperation(approval) ?? await readOperationLedger(input.wallet, approval.purpose);
    if (ledger && ledger.identity !== input.identity) throw new Error('Previous operation requires reconciliation.');
    if (!ledger) {
      remainingOperationFee(approval.maxFeeSun, [approval.feeSun]);
      ledger = { identity: input.identity, approval, rentalReservedSun: 0, stages: {} };
      await writeOperationLedger(ledger);
    }
    const saved = ledger;
    const plan = saved.approval;
    const stage = input.stage || 'execute';
    const confirmed = saved.stages[stage];
    if (confirmed) {
      // Stage receipts outlive individual journals during interrupted cleanup.
      await waitForTransferConfirmation(confirmed.txId);
      await input.beforeBroadcast?.(confirmed.txId);
      return confirmed.txId;
    }
    const key = `operation:${input.wallet}:${plan.purpose}:${stage}`;
    const result = await runRecordedTransfer({
      key, identity: JSON.stringify([input.identity, stage, input.contractAddress, input.functionSelector]),
      context: plan,
      send: async beforeBroadcast => {
        const pricing = await getResourceUnitPricing(input.tronWeb);
        const parameters = input.parameters || [];
        const maximum = remainingOperationFee(plan.maxFeeSun, Object.values(saved.stages).map(s => s.feeSun));
        const balance = Number(await input.tronWeb.trx.getBalance(input.wallet));
        const required = (input.callValue || 0) + remainingOperationFee(maximum, [saved.rentalReservedSun]);
        if (!Number.isSafeInteger(balance) || balance < required) throw new Error('Insufficient balance for the approved transaction budget.');
        const options = { callValue: input.callValue || 0, feeLimit: maximum };
        const estimate = await input.tronWeb.transactionBuilder.estimateEnergy(
          input.contractAddress, input.functionSelector, options, parameters as never[], input.wallet,
        );
        const energy = Number(estimate.energy_required);
        if (!Number.isSafeInteger(energy) || energy <= 0) throw new Error('Unable to verify transaction resources.');
        // Reserve a full byte budget even if the account currently has free Bandwidth.
        const bandwidthReserveSun = Math.ceil(2000 * pricing.bandwidthSun);
        const executionFloor = Math.ceil(energy * pricing.energySun) + bandwidthReserveSun;
        const pending = await getPendingEnergyRentalQuote(plan.purpose, input.wallet);
        if (pending && pending.orderId !== plan.quote?.orderId) throw new Error('Previous rental requires reconciliation.');
        if (!saved.rentalReservedSun && plan.quote && !Object.keys(saved.stages).length) {
          const rentalCost = Number(plan.quote.amountSun) + plan.paymentSun;
          if (pending || rentalCost + executionFloor <= maximum) {
            remainingOperationFee(maximum, [rentalCost]);
            saved.rentalReservedSun = rentalCost;
            await writeOperationLedger(saved);
          }
        }
        if (saved.rentalReservedSun && plan.quote && !Object.keys(saved.stages).length) {
          // Unknown purchase/delivery outcomes stop here; never silently pay and burn.
          await rentEnergyForPurpose({ purpose: plan.purpose, wallet: input.wallet, quote: plan.quote,
            maxPaymentNetworkFeeSun: plan.paymentSun });
        }
        const remaining = remainingOperationFee(maximum, [saved.rentalReservedSun]);
        const feeLimit = remaining - bandwidthReserveSun;
        if (feeLimit < energy * pricing.energySun) throw new Error('Remaining transaction budget is insufficient. Reconciliation required.');
        const built = await input.tronWeb.transactionBuilder.triggerSmartContract(
          input.contractAddress, input.functionSelector,
          { callValue: input.callValue || 0, feeLimit }, parameters as never[], input.wallet,
        );
        if (!built.transaction || !built.result?.result) throw new Error('Unable to build transaction.');
        const signed = await input.tronWeb.trx.sign(built.transaction, input.privateKey);
        if (estimateSignedTransactionBandwidth(built.transaction, signed) > 2000) {
          throw new Error('Transaction bandwidth exceeds the approved budget.');
        }
        if (Number(signed.raw_data.fee_limit) !== feeLimit) throw new Error('Transaction fee limit mismatch');
        await beforeBroadcast(String(signed.txID), signed);
        await input.beforeBroadcast?.(String(signed.txID), signed);
        const receipt = await input.tronWeb.trx.sendRawTransaction(signed);
        if (!receipt.result) throw new Error('Transaction broadcast requires reconciliation.');
        return { txId: signed.txID };
      },
      confirm: waitForTransferConfirmation,
    });
    const feeSun = Number((result.receipt as { fee?: number })?.fee || 0);
    saved.stages[stage] = { txId: result.txId, feeSun };
    remainingOperationFee(plan.maxFeeSun, [saved.rentalReservedSun, ...Object.values(saved.stages).map(s => s.feeSun)]);
    await writeOperationLedger(saved);
    // A resumed inner transaction may not have reached the outer journal callback.
    await input.beforeBroadcast?.(result.txId);
    return result.txId;
  } finally {
    active.delete(input.wallet);
  }
}
