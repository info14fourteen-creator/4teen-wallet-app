import storage from '../../privacy/async-storage';
import { acknowledgeRecordedTransfer } from './recorded-transfer';
import type { OperationFeeApproval } from './operation-fee';

export type OperationLedger = {
  identity: string;
  approval: OperationFeeApproval;
  rentalReservedSun: number;
  stages: Record<string, { txId: string; feeSun: number }>;
};
const key = (wallet: string, purpose: string) => `operation-fee:v1:${wallet}:${purpose}`;
const completedKey = (approval: OperationFeeApproval) => `operation-completed:v1:${approval.wallet}:${approval.purpose}:${approval.operationId}`;
export async function readCompletedOperation(approval: OperationFeeApproval): Promise<OperationLedger | null> {
  if (!approval.operationId) return null;
  const raw = await storage.getItem(completedKey(approval));
  if (raw === null) return null;
  const value = JSON.parse(raw) as OperationLedger;
  if (value.approval?.operationId !== approval.operationId || value.approval.wallet !== approval.wallet ||
      value.approval.purpose !== approval.purpose || !value.stages) throw new Error('Stored operation requires reconciliation');
  return value;
}
export async function readOperationLedger(wallet: string, purpose: string): Promise<OperationLedger | null> {
  const raw = await storage.getItem(key(wallet, purpose));
  if (raw === null) return null;
  const value = JSON.parse(raw) as OperationLedger;
  if (!value.identity || value.approval?.wallet !== wallet || value.approval?.purpose !== purpose ||
      !value.stages || !Number.isSafeInteger(value.rentalReservedSun) || value.rentalReservedSun < 0) {
    throw new Error('Stored operation requires reconciliation');
  }
  return value;
}
export function writeOperationLedger(value: OperationLedger) {
  return storage.setItem(key(value.approval.wallet, value.approval.purpose), JSON.stringify(value));
}
export async function finishOperationLedger(wallet: string, purpose: string) {
  const ledger = await readOperationLedger(wallet, purpose);
  if (!ledger) return;
  if (!Object.keys(ledger.stages).length) throw new Error('Operation is not confirmed');
  if (ledger.approval.operationId) await storage.setItem(completedKey(ledger.approval), JSON.stringify(ledger));
  for (const [stage, result] of Object.entries(ledger.stages)) {
    await acknowledgeRecordedTransfer(`operation:${wallet}:${purpose}:${stage}`, result.txId);
  }
  await storage.removeItem(key(wallet, purpose));
}
