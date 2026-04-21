import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SwapTokenMeta } from './sunio';

export type FourteenSwapDraft = {
  walletId?: string;
  amountIn: string;
  slippage: string;
  sourceToken: SwapTokenMeta;
  targetToken: SwapTokenMeta;
  preferredRouteId: string;
};

const SWAP_DRAFT_KEY = 'fourteen_swap_draft_v1';

export async function saveFourteenSwapDraft(draft: FourteenSwapDraft) {
  await AsyncStorage.setItem(SWAP_DRAFT_KEY, JSON.stringify(draft));
}

export async function getFourteenSwapDraft(): Promise<FourteenSwapDraft | null> {
  const raw = await AsyncStorage.getItem(SWAP_DRAFT_KEY);

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as FourteenSwapDraft;

    if (
      !parsed ||
      typeof parsed.amountIn !== 'string' ||
      typeof parsed.slippage !== 'string' ||
      !parsed.sourceToken ||
      typeof parsed.sourceToken !== 'object' ||
      !parsed.targetToken ||
      typeof parsed.targetToken !== 'object' ||
      typeof parsed.preferredRouteId !== 'string'
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function clearFourteenSwapDraft() {
  await AsyncStorage.removeItem(SWAP_DRAFT_KEY);
}
