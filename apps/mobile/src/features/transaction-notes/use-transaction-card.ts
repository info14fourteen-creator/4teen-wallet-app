import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { subscribeActiveWalletChange } from '../../services/wallet/storage';
import { openInAppBrowser } from '../../utils/open-in-app-browser';
import { useNotice } from '../../notice/notice-provider';
import { useI18n } from '../../i18n';
import type { NoteTransaction } from './transaction-card';

export function useTransactionCard(address: string | undefined) {
  const [selected, select] = useState<NoteTransaction | null>(null);
  const router = useRouter();
  const notice = useNotice();
  const { t } = useI18n();
  const close = useCallback(() => select(null), []);
  useEffect(close, [address, close]);
  useFocusEffect(useCallback(() => {
    const unsubscribe = subscribeActiveWalletChange(close);
    return () => { unsubscribe(); close(); };
  }, [close]));
  const openExplorer = useCallback(async () => {
    if (!selected) return;
    // Construct the URL from the validated public hash only. Note text never
    // enters navigation, browser parameters, logging or network requests.
    const url = `https://tronscan.org/#/transaction/${selected.target.txHash}`;
    close();
    try { await openInAppBrowser(router, url); }
    catch { notice.showErrorNotice(t('Failed to open Tronscan.'), 2200); }
  }, [close, notice, router, selected, t]);
  return { selected: selected?.target.address === address ? selected : null, select, close, openExplorer };
}
