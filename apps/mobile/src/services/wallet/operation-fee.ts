import type { EnergyResalePurpose, EnergyResaleQuote } from '../energy-resale';

export type OperationFeeApproval = {
  operationId?: string;
  wallet: string;
  purpose: EnergyResalePurpose;
  feeSun: number;
  maxFeeSun: number;
  paymentSun: number;
  quote: EnergyResaleQuote | null;
};

function money(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Transaction fee is unavailable. Refresh before approval.');
  return value;
}

export function formatOperationSun(value: number) {
  money(value);
  return (value / 1_000_000).toFixed(6).replace(/\.?0+$/, '') || '0';
}

export function calculateOperationFee(input: { burnSun: number; maxFeeSun?: number; rentalSun?: number; paymentSun?: number; executionFloorSun?: number }) {
  const burnSun = money(input.burnSun);
  const maxFeeSun = money(input.maxFeeSun ?? burnSun);
  if (burnSun > maxFeeSun) throw new Error('Transaction fee exceeds its maximum');
  const rental = input.rentalSun === undefined ? null : money(input.rentalSun) + money(input.paymentSun ?? 0);
  if (rental !== null) money(rental);
  const executionFloor = money(input.executionFloorSun ?? 0);
  const rent = rental !== null && rental > 0 && rental < burnSun && rental + executionFloor <= maxFeeSun;
  return { feeSun: rent ? rental! : burnSun, maxFeeSun, rent };
}

export function remainingOperationFee(maximum: number, spent: number[]) {
  let remaining = money(maximum);
  for (const value of spent) remaining -= money(value);
  if (remaining < 0) throw new Error('Transaction fee limit exceeded. Reconciliation required.');
  return remaining;
}
