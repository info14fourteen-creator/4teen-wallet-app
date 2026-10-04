import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getActiveWallet, subscribeActiveWalletChange } from '../../services/wallet/storage';
import { getWalletPortfolio, type WalletPortfolioSnapshot } from '../../services/wallet/portfolio';
import { loadHistory, loadTokenBalances, PROTOCOL_CONTRACTS } from '../protocol-readonly/data';
import type { HistoryRow } from '../protocol-readonly/model';
import { formatUnits } from '../protocol-readonly/model';
import { useI18n } from '../../i18n';
import { ProductScreen, ProductSection, ProductStatGrid } from '../../ui/product-shell';
import { colors, radius } from '../../theme/tokens';
import { openInAppBrowser } from '../../utils/open-in-app-browser';

type Mode = 'buy' | 'swap';
type Snapshot = {
  address: string;
  name: string;
  portfolio?: WalletPortfolioSnapshot;
  balance?: { total: string; locked: string };
  records?: HistoryRow[];
};

export default function IOSExchangeInfoScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    setLoading(true);
    setError(false);
    setSnapshot(null);
    try {
      const wallet = await getActiveWallet();
      if (!wallet || signal.aborted) return;
      const next: Snapshot = { address: wallet.address, name: wallet.name };
      if (mode === 'buy') {
        const [balance, history] = await Promise.all([
          loadTokenBalances(wallet.address, signal),
          loadHistory('unlock', wallet.address, signal),
        ]);
        next.balance = balance;
        next.records = history.rows;
      } else {
        next.portfolio = await getWalletPortfolio(wallet.address);
      }
      if (!signal.aborted) setSnapshot(next);
    } catch {
      if (!signal.aborted) setError(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [mode]);

  useFocusEffect(useCallback(() => {
    const unsubscribe = subscribeActiveWalletChange(() => void load());
    void load();
    return () => { request.current?.abort(); unsubscribe(); setSnapshot(null); };
  }, [load]));

  const action = (label: string, onPress: () => void) => (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} style={styles.action}>
      <Text style={styles.actionText}>{t(label)} ↗</Text>
    </TouchableOpacity>
  );

  return (
    <ProductScreen eyebrow={t(mode === 'buy' ? 'BUY' : 'SWAP')}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => {
        void load();
      }} tintColor={colors.accent} />}>
      <View style={styles.intro}>
        <Text style={styles.title}>{t(mode === 'buy' ? '4TEEN contract minting' : 'Token exchange overview')}</Text>
        <Text style={styles.body}>{t(mode === 'buy'
          ? 'The 4TEEN contract issues tokens according to its on-chain rules. This page shows your confirmed contract records; it does not submit a mint transaction.'
          : 'Review your wallet assets here. This page does not quote, connect to, or execute an exchange.')}</Text>
      </View>
      {loading ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
      {error ? <View style={styles.panel}><Text style={styles.body}>{t('Data could not be loaded. Please try again.')}</Text>{action('Retry', () => {
        void load();
      })}</View> : null}
      {!loading && !error && !snapshot ? action('Wallet Setup', () => router.push('/wallet-access')) : null}
      {snapshot ? <View style={styles.panel}>
        <Text style={styles.title}>{snapshot.name}</Text>
        <Text selectable style={styles.muted}>{snapshot.address}</Text>
      </View> : null}
      {mode === 'buy' && snapshot?.balance ? <ProductStatGrid items={[
        { eyebrow: t('Balance'), value: `${formatUnits(snapshot.balance.total)} 4TEEN`, body: t('ON-CHAIN') },
        { eyebrow: t('Locked'), value: `${formatUnits(snapshot.balance.locked)} 4TEEN`, body: t('ON-CHAIN') },
      ]} /> : null}
      {mode === 'buy' && snapshot?.records ? <ProductSection eyebrow={t('ON-CHAIN')} title={t('Contract mint records')}>
        {snapshot.records.length === 0 ? <Text style={styles.body}>{t('No matching records in the loaded history.')}</Text> : null}
        {snapshot.records.map(row => <View key={row.id} style={styles.record}>
          <Text style={styles.title}>{row.amount} 4TEEN</Text>
          <Text style={styles.muted}>{new Date(row.timestamp).toLocaleString()}</Text>
          {action('View on Tronscan', () => void openInAppBrowser(router, `https://tronscan.org/#/transaction/${row.txId}`))}
        </View>)}
        {action('UNLOCK TIMELINE', () => router.push('/unlock-timeline'))}
        {action('View on Tronscan', () => void openInAppBrowser(router, `https://tronscan.org/#/contract/${PROTOCOL_CONTRACTS.token}`))}
      </ProductSection> : null}
      {mode === 'swap' && snapshot?.portfolio ? <ProductSection eyebrow={t('ASSETS')} title={t('Wallet assets')}>
        {snapshot.portfolio.assets.map(asset => <View key={asset.id} style={styles.record}>
          <Text style={styles.title}>{asset.symbol}</Text>
          <Text style={styles.body}>{asset.amountDisplay}</Text>
          <Text style={styles.muted}>{asset.valueDisplay}</Text>
        </View>)}
        {action('History', () => router.push('/wallet'))}
        {action('ASSETS', () => router.push('/manage-crypto'))}
      </ProductSection> : null}
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  intro: { backgroundColor: colors.surfaceSoft, borderColor: colors.lineStrong, borderWidth: 1, borderRadius: radius.lg, padding: 20, gap: 10 },
  panel: { backgroundColor: colors.surfaceSoft, borderRadius: radius.md, padding: 16, gap: 8 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  body: { color: colors.textSoft, fontSize: 14, lineHeight: 21 },
  muted: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  action: { minHeight: 48, justifyContent: 'center' },
  actionText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  record: { paddingVertical: 12, gap: 4, borderBottomColor: colors.lineSoft, borderBottomWidth: 1 },
  spinner: { marginVertical: 24 },
});
