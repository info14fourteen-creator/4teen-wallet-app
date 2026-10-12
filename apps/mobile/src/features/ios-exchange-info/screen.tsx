import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getActiveWallet, subscribeActiveWalletChange } from '../../services/wallet/storage';
import { getWalletPortfolio, type WalletPortfolioSnapshot } from '../../services/wallet/portfolio';
import { loadHistory, loadTokenBalances, PROTOCOL_CONTRACTS } from '../protocol-readonly/data';
import type { HistoryRow } from '../protocol-readonly/model';
import { formatUnits } from '../protocol-readonly/model';
import { useI18n } from '../../i18n';
import { ProductScreen } from '../../ui/product-shell';
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
  const [infoExpanded, setInfoExpanded] = useState(false);
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
      <Text style={styles.actionText}>{t(label)}</Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.accent} />
    </TouchableOpacity>
  );

  const description = mode === 'buy'
    ? 'The 4TEEN contract issues tokens according to its on-chain rules. This page shows your confirmed contract records; it does not submit a mint transaction.'
    : 'Review your wallet assets here. This page does not quote, connect to, or execute an exchange.';
  const swapAssets = snapshot?.portfolio?.assets ?? [];
  const token4teen = swapAssets.find(asset => asset.symbol === '4TEEN');
  const tokenTrx = swapAssets.find(asset => asset.symbol === 'TRX');

  return (
    <ProductScreen eyebrow={t(mode === 'buy' ? 'BUY' : 'SWAP')}
      headerInfo={{ title: t('Read-only'), text: t(description), expanded: infoExpanded, onToggle: () => setInfoExpanded(value => !value) }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => {
        void load();
      }} tintColor={colors.accent} />}>
      {loading ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
      {error ? <View style={styles.panel}><Text style={styles.body}>{t('Data could not be loaded. Please try again.')}</Text>{action('Retry', () => {
        void load();
      })}</View> : null}
      {!loading && !error && !snapshot ? action('Wallet Setup', () => router.push('/wallet-access')) : null}
      {snapshot ? <>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.tokenMark}><Text style={styles.tokenMarkText}>{mode === 'buy' ? '4' : '↔'}</Text></View>
            <View style={styles.heroHeading}>
              <Text style={styles.heroTicker}>{mode === 'buy' ? '4TEEN' : '4TEEN / TRX'}</Text>
              <Text style={styles.heroSubtitle}>{t(mode === 'buy' ? 'Balance' : 'SWAP')}</Text>
            </View>
            <View style={styles.readOnlyPill}><Text style={styles.readOnlyText}>{t('Read-only')}</Text></View>
          </View>
          {mode === 'buy' ? <><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={styles.heroValue}>
            {formatUnits(snapshot.balance?.total ?? '0')} 4TEEN
          </Text><View style={styles.heroBottom}>
            <Text style={styles.heroBottomLabel}>{t('Locked')}</Text>
            <Text style={styles.heroBottomValue}>{formatUnits(snapshot.balance?.locked ?? '0')} 4TEEN</Text>
          </View></> : <>
            <View style={styles.pair}>
              <View style={styles.pairRow}><Text style={styles.pairSymbol}>4TEEN</Text><Text style={styles.pairBalance}>{token4teen?.amountDisplay ?? '0'}</Text></View>
              <View style={styles.pairDivider} />
              <View style={styles.pairRow}><Text style={styles.pairSymbol}>TRX</Text><Text style={styles.pairBalance}>{tokenTrx?.amountDisplay ?? '0'}</Text></View>
            </View>
            <View style={styles.heroBottom}><Text style={styles.heroBottomLabel}>{t('Wallet assets')}</Text><Text style={styles.heroBottomValue}>{snapshot.portfolio?.totalBalanceDisplay ?? '—'}</Text></View>
          </>}
        </View>
        <View style={styles.walletLine}>
          <Text style={styles.walletName}>{snapshot.name}</Text>
          <Text selectable numberOfLines={1} style={styles.walletAddress}>{snapshot.address}</Text>
        </View>
      </> : null}
      {mode === 'buy' && snapshot?.records ? <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>{t('ON-CHAIN')}</Text>
        <Text style={styles.sectionTitle}>{t('Contract mint records')}</Text>
        {snapshot.records.length === 0 ? <Text style={styles.empty}>{t('No matching records in the loaded history.')}</Text> : null}
        {snapshot.records.map(row => <View key={row.id} style={styles.record}>
          <View><Text style={styles.recordTitle}>{row.amount} 4TEEN</Text><Text style={styles.muted}>{new Date(row.timestamp).toLocaleString()}</Text></View>
          {action('View on Tronscan', () => void openInAppBrowser(router, `https://tronscan.org/#/transaction/${row.txId}`))}
        </View>)}
        {action('UNLOCK TIMELINE', () => router.push('/unlock-timeline'))}
        {action('View on Tronscan', () => void openInAppBrowser(router, `https://tronscan.org/#/contract/${PROTOCOL_CONTRACTS.token}`))}
      </View> : null}
      {mode === 'swap' && snapshot?.portfolio ? <View style={styles.section}>
        {action('Wallet', () => router.push('/wallet'))}
        {action('Manage Crypto', () => router.push('/manage-crypto'))}
      </View> : null}
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 8, padding: 22, borderRadius: radius.lg, backgroundColor: 'rgba(255,105,0,0.10)', borderWidth: 1, borderColor: colors.lineStrong, gap: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tokenMark: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  tokenMarkText: { color: colors.bg, fontSize: 25, fontWeight: '900' },
  heroHeading: { flex: 1, gap: 2 },
  heroTicker: { color: colors.text, fontSize: 18, fontWeight: '800' },
  heroSubtitle: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  readOnlyPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.lineSoft },
  readOnlyText: { color: colors.textDim, fontSize: 10, fontWeight: '700' },
  heroValue: { color: colors.text, fontSize: 32, fontWeight: '800' },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.lineStrong, paddingTop: 14 },
  heroBottomLabel: { color: colors.textDim, fontSize: 14 },
  heroBottomValue: { color: colors.text, fontSize: 14, fontWeight: '700' },
  pair: { borderRadius: radius.md, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.lineSoft, overflow: 'hidden' },
  pairRow: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pairSymbol: { color: colors.text, fontSize: 18, fontWeight: '800' },
  pairBalance: { color: colors.textSoft, fontSize: 16, fontWeight: '700' },
  pairDivider: { height: 1, backgroundColor: colors.lineSoft },
  delta: { color: colors.green, fontSize: 14, fontWeight: '600' },
  walletLine: { paddingHorizontal: 2, paddingVertical: 14, gap: 4 },
  walletName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  walletAddress: { color: colors.textDim, fontSize: 11 },
  section: { marginTop: 10, backgroundColor: colors.surfaceSoft, borderColor: colors.lineSoft, borderWidth: 1, borderRadius: radius.lg, padding: 18, gap: 4 },
  sectionEyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 10 },
  panel: { backgroundColor: colors.surfaceSoft, borderRadius: radius.md, padding: 16, gap: 8 },
  body: { color: colors.textSoft, fontSize: 14, lineHeight: 21 },
  muted: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  empty: { color: colors.textDim, fontSize: 13, lineHeight: 19, paddingVertical: 10 },
  action: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopColor: colors.lineSoft, borderTopWidth: 1 },
  actionText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  record: { paddingVertical: 12, gap: 4 },
  recordTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  spinner: { marginVertical: 24 },
});
