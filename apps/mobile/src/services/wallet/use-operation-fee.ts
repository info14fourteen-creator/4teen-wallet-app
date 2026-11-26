import { useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import type { EnergyResalePurpose, EnergyResaleQuote } from '../energy-resale';
import { estimateAssetTransfer } from './send';
import { TRX_TOKEN_ID } from '../tron/api';
import { calculateOperationFee, type OperationFeeApproval } from './operation-fee';
import { readOperationLedger } from './operation-ledger';
import { calculateTransferFeeSun } from './transfer-fee';

type ResourceCost = { estimatedEnergy?: number; energyPriceSun?: number; bandwidthPriceSun?: number };

export function useOperationFee(input: {
  wallet?: string; purpose: EnergyResalePurpose; burnSun?: number;
  quote: EnergyResaleQuote | null; loading: boolean;
  resources?: ResourceCost & { approval?: ResourceCost | null; swap?: ResourceCost | null };
}) {
  const { wallet, purpose, burnSun, quote, loading, resources } = input;
  const [plan, setPlan] = useState<OperationFeeApproval | null>(null);
  const approved = useRef<OperationFeeApproval | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    if (!wallet || loading || burnSun === undefined) return;
    void (async () => {
      const existing = await readOperationLedger(wallet, purpose);
      if (existing) { if (!cancelled) setPlan(existing.approval); return; }
      let paymentSun = 0;
      if (quote) {
        const payment = await estimateAssetTransfer({ tokenId: TRX_TOKEN_ID, toAddress: quote.paymentAddress, amount: quote.amountTrx });
        if (payment.wallet.address !== wallet) throw new Error('Active wallet changed');
        paymentSun = payment.resources.estimatedBurnSun;
        calculateTransferFeeSun(burnSun, quote, paymentSun);
      }
      const parts = resources?.swap ? [resources.approval, resources.swap].filter(Boolean) : [resources];
      const fullBurn = parts.reduce((sum, part) => sum + Math.ceil(
        Number(part?.estimatedEnergy || 0) * Number(part?.energyPriceSun || 0) +
        2000 * Number(part?.bandwidthPriceSun || 0)), 0);
      // Match the existing 15% burn-estimate safety margin, independent of the rental price.
      const calculated = calculateOperationFee({ burnSun, maxFeeSun: Math.max(burnSun, Math.ceil(fullBurn * 1.15)),
        executionFloorSun: fullBurn,
        rentalSun: quote ? Number(quote.amountSun) : undefined, paymentSun });
      if (!cancelled) setPlan({ operationId: randomUUID(), wallet, purpose, feeSun: calculated.feeSun,
        maxFeeSun: calculated.maxFeeSun, paymentSun, quote: calculated.rent ? quote : null });
    })().catch(() => { if (!cancelled) setPlan(null); });
    return () => { cancelled = true; };
  }, [wallet, purpose, burnSun, quote, loading, resources]);
  return { plan, approved, capture: () => {
    if (!plan) throw new Error('Transaction fee is unavailable.');
    approved.current = plan;
  } };
}
