import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getLanguageLocaleTag, useI18n, useLocaleLayout } from '../../i18n';
import { getActiveWallet, subscribeActiveWalletChange, type WalletMeta } from '../../services/wallet/storage';
import type { AmbassadorCabinetDashboard } from '../../services/ambassador';
import { ProductScreen, ProductSection, ProductStatGrid } from '../../ui/product-shell';
import { colors, radius } from '../../theme/tokens';
import { openInAppBrowser } from '../../utils/open-in-app-browser';
import { loadCabinet, loadHistory, loadLiquidityBalance, loadTokenBalances, PROTOCOL_CONTRACTS } from './data';
import { formatUnits, type HistoryRow } from './model';

type Section = 'ambassador' | 'airdrop' | 'unlock' | 'info' | 'liquidity';
type Snapshot = {
  wallet: WalletMeta;
  cabinet?: AmbassadorCabinetDashboard | null;
  rows?: HistoryRow[];
  cursor?: string;
  balances?: { total: string; locked: string };
  liquidity?: string;
};
type SectionErrors = { history?: 'refresh' | 'more'; balances?: boolean };
function sameWallet(left: WalletMeta | undefined, right: WalletMeta) {
  return left?.id === right.id && left.address === right.address;
}
const TITLES = { ambassador: 'AMBASSADOR', airdrop: 'AIRDROP', unlock: 'UNLOCK TIMELINE', info: 'INFO', liquidity: 'LIQUIDITY' };
export const READ_ONLY_NOTICE = 'This section displays records only. Transactions and participation are unavailable in this iOS version.';
export const OPERATION_UNAVAILABLE = 'This operation is unavailable in the iOS app.';

function ProtocolReadOnlyScreen({ section }: { section: Section }) {
  const router = useRouter();
  const { t, language } = useI18n();
  const locale = useLocaleLayout();
  const request = useRef<AbortController | null>(null);
  const [lastSnapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const snapshot = walletReady ? lastSnapshot : null;
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [sectionErrors, setSectionErrors] = useState<SectionErrors>({});
  const [noWallet, setNoWallet] = useState(false);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    setBusy(true);
    setError(false);
    setSectionErrors({});
    // Hide retained data until the active wallet has been verified again.
    setWalletReady(false);
    setNoWallet(false);
    try {
      const wallet = await getActiveWallet();
      if (signal.aborted) return;
      setNoWallet(!wallet);
      setSnapshot(previous => {
        if (!wallet) return null;
        return previous && sameWallet(previous.wallet, wallet) ? { ...previous, wallet } : { wallet };
      });
      setWalletReady(true);
      if (!wallet) return;
      const publish = (patch: Partial<Omit<Snapshot, 'wallet'>>) => {
        if (signal.aborted) return;
        setSnapshot(previous => {
          if (signal.aborted || !previous || !sameWallet(previous.wallet, wallet)) return previous;
          return { ...previous, ...patch };
        });
      };
      if (section === 'ambassador') publish({ cabinet: await loadCabinet(wallet.address, signal) });
      if (section === 'airdrop' || section === 'unlock') {
        const historyRequest = (async () => {
          try {
            const history = await loadHistory(section, wallet.address, signal);
            publish({ rows: history.rows, cursor: history.cursor });
          } catch {
            if (!signal.aborted) setSectionErrors(previous => ({ ...previous, history: 'refresh' }));
          }
        })();
        const balancesRequest = (async () => {
          if (section !== 'unlock') return;
          try {
            publish({ balances: await loadTokenBalances(wallet.address, signal) });
          } catch {
            if (!signal.aborted) setSectionErrors(previous => ({ ...previous, balances: true }));
          }
        })();
        await Promise.all([historyRequest, balancesRequest]);
      }
      if (section === 'liquidity') publish({ liquidity: await loadLiquidityBalance(signal) });
    } catch {
      if (!signal.aborted) setError(true);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }, [section]);

  useFocusEffect(useCallback(() => {
    const unsubscribe = subscribeActiveWalletChange(() => { void load(); });
    void load();
    return () => {
      unsubscribe();
      request.current?.abort();
      setWalletReady(false);
    };
  }, [load]));

  const loadMore = async () => {
    if (!snapshot?.cursor || (section !== 'airdrop' && section !== 'unlock') || busy) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setSectionErrors(previous => ({ ...previous, history: undefined }));
    try {
      const history = await loadHistory(section, snapshot.wallet.address, controller.signal, snapshot.cursor);
      if (controller.signal.aborted) return;
      setSnapshot(previous => {
        if (controller.signal.aborted || !previous || !sameWallet(previous.wallet, snapshot.wallet)) return previous;
        const allRows = new Map((previous.rows ?? []).map(row => [row.id, row]));
        for (const row of history.rows) allRows.set(row.id, row);
        return { ...previous, rows: [...allRows.values()], cursor: history.cursor };
      });
    } catch {
      if (!controller.signal.aborted) setSectionErrors(previous => ({ ...previous, history: 'more' }));
    }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };

  const text = (value: string) => <Text style={[styles.body, locale.textStart]}>{t(value)}</Text>;
  const action = (label: string, onPress: () => void) => (
    <TouchableOpacity accessibilityRole="button" style={styles.action} onPress={onPress}>
      <Text style={[styles.actionText, locale.textStart]}>{t(label)}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.accent} />
    </TouchableOpacity>
  );
  const date = (value: number) => new Date(value).toLocaleString(getLanguageLocaleTag(language), { timeZone: 'UTC' });
  const sectionError = (label: string, retry: () => void) => (
    <View accessibilityRole="alert" style={styles.wallet}>
      <Text style={[styles.heading, locale.textStart]}>{t(label)}</Text>
      {text('Data could not be loaded. Please try again.')}
      {action('Retry', retry)}
    </View>
  );
  const contractLink = (label: string, address: string) => (
    <View key={address} style={styles.record}>
      <Text style={[styles.heading, locale.textStart]}>{label}</Text>
      <Text selectable style={[styles.address, locale.textStart]}>{address}</Text>
      {action('View on Tronscan', () => void openInAppBrowser(router, `https://tronscan.org/#/contract/${address}`))}
    </View>
  );
  const summary = snapshot?.cabinet?.summary;

  return (
    <ProductScreen eyebrow={t(TITLES[section])} browVariant="backLink"
      // ProductScreen overlays all data when refreshing=true. Use the inline
      // indicator so a slow section cannot mask another section's results.
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={colors.accent} />}>
      <View style={[styles.notice, locale.row]}>
        <MaterialCommunityIcons name="eye-outline" size={24} color={colors.accent} />
        <View style={styles.noticeText}>
          <Text style={[styles.heading, locale.textStart]}>{t('Read-only')}</Text>
          {text(READ_ONLY_NOTICE)}
        </View>
      </View>
      {snapshot ? (
        <View style={styles.wallet}>
          <Text style={[styles.heading, locale.textStart]}>{snapshot.wallet.name}</Text>
          <Text selectable style={[styles.address, locale.textStart]}>{snapshot.wallet.address}</Text>
          {action('Wallets', () => router.push('/wallet-manager'))}
        </View>
      ) : null}
      {busy ? <ActivityIndicator color={colors.accent} size="large" style={styles.spinner} /> : null}
      {error ? <View style={styles.wallet}>{text('Data could not be loaded. Please try again.')}{action('Retry', () => void load())}</View> : null}
      {noWallet ? action('Wallet Setup', () => router.push('/wallet-access')) : null}
      {section === 'ambassador' && snapshot?.cabinet === null ? text('No matching records in the loaded history.') : null}

      {summary ? <>
        <ProductStatGrid items={[
          { eyebrow: t('Accrued total'), value: `${formatUnits(summary.total_rewards_accrued_sun)} TRX`, body: t('ON-CHAIN') },
          { eyebrow: t('Claimed total'), value: `${formatUnits(summary.total_rewards_claimed_sun)} TRX`, body: t('History') },
          { eyebrow: t('Claimable now'), value: `${formatUnits(summary.claimable_rewards_sun)} TRX`, body: t('Read-only') },
          { eyebrow: t('Pending'), value: `${formatUnits(summary.buyers_pending_reward_sun)} TRX`, body: t('Read-only') },
        ]} />
        <ProductSection eyebrow={t('AMBASSADOR')} title={t('History')}>
          {summary.last_chain_sync_at ? text(`${t('Updated')}: ${new Date(summary.last_chain_sync_at).toLocaleString(getLanguageLocaleTag(language))}`) : null}
          {(snapshot?.cabinet?.purchasesRows ?? []).length === 0 ? text('No matching records in the loaded history.') : null}
          {(snapshot?.cabinet?.purchasesRows ?? []).map((row, index) => {
            const txId = String(row.tx_hash ?? '');
            return <View key={`${txId}:${index}`} style={styles.record}>
              <Text style={[styles.heading, locale.textStart]}>{formatUnits(row.purchase_amount_sun)} TRX</Text>
              {text(`${t('Reward')}: ${formatUnits(row.ambassador_reward_sun)} TRX`)}
              {text(row.controller_processed === true ? 'Processed' : 'Pending')}
              {/^[a-f0-9]{64}$/i.test(txId) ? action('View on Tronscan', () => void openInAppBrowser(router, `https://tronscan.org/#/transaction/${txId}`)) : null}
            </View>;
          })}
          {(snapshot?.cabinet?.purchasesTotal ?? 0) > (snapshot?.cabinet?.purchasesRows.length ?? 0) ? text('Some older records have not been loaded yet.') : null}
        </ProductSection>
      </> : null}

      {walletReady && sectionErrors.balances ? sectionError('Balance', () => void load()) : null}
      {snapshot?.balances ? <ProductStatGrid items={[
        { eyebrow: t('Balance'), value: `${formatUnits(snapshot.balances.total)} 4TEEN`, body: t('ON-CHAIN') },
        { eyebrow: t('Locked'), value: `${formatUnits(snapshot.balances.locked)} 4TEEN`, body: t('ON-CHAIN') },
      ]} /> : null}
      {walletReady && sectionErrors.history ? sectionError('History', () => void (sectionErrors.history === 'more' ? loadMore() : load())) : null}
      {snapshot?.rows ? <ProductSection eyebrow={t('ON-CHAIN')} title={t(section === 'airdrop' ? 'Received distributions' : 'UNLOCK TIMELINE')}>
        {snapshot.rows.length === 0 ? text('No matching records in the loaded history.') : null}
        {snapshot.rows.map(row => <View key={row.id} style={styles.record}>
          <Text style={[styles.heading, locale.textStart]}>{row.amount} 4TEEN</Text>
          <Text style={[styles.body, locale.textStart]}>{date(row.timestamp)} UTC</Text>
          {row.unlockAt ? <>
            {text(row.unlockAt <= Date.now() ? 'Unlocked' : 'Locked')}
            <Text style={[styles.body, locale.textStart]}>{date(row.unlockAt)} UTC</Text>
          </> : null}
          {action('View on Tronscan', () => void openInAppBrowser(router, `https://tronscan.org/#/transaction/${row.txId}`))}
        </View>)}
        {snapshot.cursor ? <>{text('Some older records have not been loaded yet.')}{action(busy ? 'Loading...' : 'Load More', () => void loadMore())}</> : null}
      </ProductSection> : null}

      {section === 'liquidity' && snapshot?.liquidity !== undefined ? <ProductSection eyebrow={t('ON-CHAIN')} title={t('LIQUIDITY')}>
        <Text style={[styles.value, locale.textStart]}>{formatUnits(snapshot.liquidity)} TRX</Text>
        {contractLink('LiquidityController', PROTOCOL_CONTRACTS.liquidity)}
      </ProductSection> : null}
      {section === 'info' && snapshot ? <ProductSection eyebrow="4TEEN" title={t('Protocol overview')}>
        {contractLink('FourteenToken', PROTOCOL_CONTRACTS.token)}
        {contractLink('FourteenController', PROTOCOL_CONTRACTS.controller)}
        {contractLink('AirdropVault', PROTOCOL_CONTRACTS.airdrop)}
        {contractLink('LiquidityController', PROTOCOL_CONTRACTS.liquidity)}
      </ProductSection> : null}
      {snapshot ? action('Refresh', () => void load()) : null}
    </ProductScreen>
  );
}

export function AmbassadorReadOnlyScreen() { return <ProtocolReadOnlyScreen section="ambassador" />; }
export function AirdropReadOnlyScreen() { return <ProtocolReadOnlyScreen section="airdrop" />; }
export function UnlockReadOnlyScreen() { return <ProtocolReadOnlyScreen section="unlock" />; }
export function ProtocolInfoScreen() { return <ProtocolReadOnlyScreen section="info" />; }
export function LiquidityReadOnlyScreen() { return <ProtocolReadOnlyScreen section="liquidity" />; }

const styles = StyleSheet.create({
  notice: { gap: 12, padding: 18, borderRadius: radius.lg, backgroundColor: 'rgba(255,153,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,153,0,0.24)' },
  noticeText: { flex: 1, gap: 8 },
  heading: { color: colors.white, fontSize: 16, fontWeight: '700' },
  body: { color: colors.textDim, fontSize: 14, lineHeight: 21 },
  address: { color: colors.textDim, fontSize: 12, lineHeight: 20 },
  wallet: { padding: 18, gap: 8, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.035)' },
  action: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actionText: { flex: 1, color: colors.accent, fontSize: 14, fontWeight: '600' },
  record: { paddingVertical: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  value: { color: colors.white, fontSize: 28, fontWeight: '700' },
  spinner: { marginVertical: 30 },
});
