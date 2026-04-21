import AsyncStorage from '@react-native-async-storage/async-storage';

export type DirectBuyDraft = {
  amountTrx: string | number;
  contractAddress?: string;
};

const DIRECT_BUY_DRAFT_KEY = 'fourteen_direct_buy_draft_v1';

export async function saveDirectBuyDraft(draft: DirectBuyDraft) {
  await AsyncStorage.setItem(DIRECT_BUY_DRAFT_KEY, JSON.stringify(draft));
}

export async function getDirectBuyDraft(): Promise<DirectBuyDraft | null> {
  const raw = await AsyncStorage.getItem(DIRECT_BUY_DRAFT_KEY);

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as DirectBuyDraft;

    if (
      !parsed ||
      (typeof parsed.amountTrx !== 'string' && typeof parsed.amountTrx !== 'number')
    ) {
      return null;
    }

    return {
      amountTrx: String(parsed.amountTrx).trim(),
      contractAddress:
        typeof parsed.contractAddress === 'string' ? parsed.contractAddress.trim() : undefined,
    };
  } catch {
    return null;
  }
}

export async function clearDirectBuyDraft() {
  await AsyncStorage.removeItem(DIRECT_BUY_DRAFT_KEY);
}
