import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getLanguageLocaleTag, useI18n, useLocaleLayout } from '../../i18n';
import { getActiveWallet, subscribeActiveWalletChange, type WalletMeta } from '../../services/wallet/storage';
import type { AmbassadorCabinetDashboard } from '../../services/ambassador';
import { getTelegramAirdropOverview, getWalletAirdropOnChainSnapshot, type AirdropVaultOnChainSnapshot, type TelegramAirdropOverview } from '../../services/airdrop';
import { ProductScreen, ProductSection, ProductStatGrid } from '../../ui/product-shell';
import { colors, radius } from '../../theme/tokens';
import { openInAppBrowser } from '../../utils/open-in-app-browser';
import { loadCabinet, loadHistory, loadLiquidityBalance, loadTokenBalances, PROTOCOL_CONTRACTS } from './data';
import { formatUnits, type HistoryRow } from './model';
import TelegramIcon from '../../../assets/icons/ui/socials/telegram_social.svg';
import InstagramIcon from '../../../assets/icons/ui/socials/instagram_social.svg';
import XIcon from '../../../assets/icons/ui/socials/x_social.svg';
import FacebookIcon from '../../../assets/icons/ui/socials/facebook_social.svg';
import YoutubeIcon from '../../../assets/icons/ui/socials/youtube_social.svg';

type Section = 'ambassador' | 'airdrop' | 'unlock' | 'info' | 'liquidity';
type Snapshot = {
  wallet: WalletMeta;
  cabinet?: AmbassadorCabinetDashboard | null;
  rows?: HistoryRow[];
  cursor?: string;
  balances?: { total: string; locked: string };
  liquidity?: string;
  airdrop?: AirdropVaultOnChainSnapshot;
  telegram?: TelegramAirdropOverview | null;
};
type SectionErrors = { history?: 'refresh' | 'more'; balances?: boolean; airdrop?: boolean };
function sameWallet(left: WalletMeta | undefined, right: WalletMeta) {
  return left?.id === right.id && left.address === right.address;
}
const TITLES = { ambassador: 'AMBASSADOR', airdrop: 'AIRDROP', unlock: 'UNLOCK TIMELINE', info: 'INFO', liquidity: 'LIQUIDITY' };
const SOCIAL_ICONS = { telegram: TelegramIcon, instagram: InstagramIcon, x: XIcon, facebook: FacebookIcon, youtube: YoutubeIcon };
export const READ_ONLY_NOTICE = 'View on-chain records, balances and contract details. This section does not create or sign transactions.';

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
  const [noticeExpanded, setNoticeExpanded] = useState(false);

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
        const airdropRequest = (async () => {
          if (section !== 'airdrop') return;
          const [onChain, telegram] = await Promise.allSettled([
            getWalletAirdropOnChainSnapshot(wallet.address),
            getTelegramAirdropOverview(wallet.address),
          ]);
          if (signal.aborted) return;
          if (onChain.status === 'fulfilled') publish({ airdrop: onChain.value });
          else setSectionErrors(previous => ({ ...previous, airdrop: true }));
          publish({ telegram: telegram.status === 'fulfilled' ? telegram.value : null });
        })();
        await Promise.all([historyRequest, balancesRequest, airdropRequest]);
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
      <TouchableOpacity accessibilityRole="button" onPress={() => setNoticeExpanded(value => !value)} style={styles.notice}>
        <View style={[styles.noticeHeader, locale.row]}>
          <MaterialCommunityIcons name="eye-outline" size={18} color={colors.accent} />
          <Text style={styles.noticeLabel}>{t('Read-only')}</Text>
          <MaterialCommunityIcons name={noticeExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textDim} />
        </View>
        {noticeExpanded ? text(READ_ONLY_NOTICE) : null}
      </TouchableOpacity>
      {snapshot ? (
        <View style={styles.wallet}>
          <Text style={[styles.walletName, locale.textStart]}>{snapshot.wallet.name}</Text>
          <Text selectable style={[styles.address, locale.textStart]}>{snapshot.wallet.address}</Text>
        </View>
      ) : null}
      {busy ? <ActivityIndicator color={colors.accent} size="large" style={styles.spinner} /> : null}
      {error ? <View style={styles.wallet}>{text('Data could not be loaded. Please try again.')}{action('Retry', () => void load())}</View> : null}
      {noWallet ? action('Wallet Setup', () => router.push('/wallet-access')) : null}
      {section === 'ambassador' && snapshot?.cabinet === null ? <ProductSection
        eyebrow={t('AMBASSADOR REGISTRATION')} title={t('No ambassador profile for this wallet')}>
        {text('This wallet has no registered ambassador identity. Registration and reward withdrawal are unavailable in this iOS version.')}
        {action('Wallet', () => router.push('/wallet'))}
      </ProductSection> : null}
      {section === 'airdrop' && snapshot ? <View style={styles.airdropHero}>
        <View style={styles.airdropMark}><MaterialCommunityIcons name="gift-outline" size={28} color={colors.accent} /></View>
        <View style={styles.airdropHeroText}>
          <Text style={styles.rewardEyebrow}>{t('AIRDROP')}</Text>
          <Text style={styles.airdropTitle}>4TEEN</Text>
        </View>
      </View> : null}

      {summary ? <>
        <View style={styles.rewardHero}>
          <Text style={styles.rewardEyebrow}>{t('Claimable now')}</Text>
          <Text style={styles.rewardValue}>{formatUnits(summary.claimable_rewards_sun)} TRX</Text>
          <Text style={styles.rewardFoot}>{t('Pending')}: {formatUnits(summary.buyers_pending_reward_sun ?? 0)} TRX</Text>
          <Text style={styles.rewardFoot}>{t('Accrued total')}: {formatUnits(summary.total_rewards_accrued_sun)} TRX</Text>
        </View>
        <ProductStatGrid items={[
          { eyebrow: t('Slug'), value: snapshot?.cabinet?.profile.slug || '—', body: t('AMBASSADOR') },
          { eyebrow: t('Level'), value: String(summary.effective_level ?? '—'), body: t('ON-CHAIN') },
          { eyebrow: t('Reward'), value: `${summary.reward_percent ?? 0}%`, body: t('Current effective reward') },
          { eyebrow: t('Claimed total'), value: `${formatUnits(summary.total_rewards_claimed_sun)} TRX`, body: t('History') },
          { eyebrow: t('Linked buyers'), value: String(summary.buyers_count ?? summary.total_buyers ?? 0), body: t('ON-CHAIN') },
          { eyebrow: t('Attributed volume'), value: `${formatUnits(summary.buyers_total_purchase_amount_sun ?? summary.total_volume_sun ?? 0)} TRX`, body: t('History') },
          { eyebrow: t('Pending reward'), value: `${formatUnits(summary.buyers_pending_reward_sun ?? 0)} TRX`, body: t('Pending rows') },
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
      {walletReady && sectionErrors.airdrop ? sectionError('AIRDROP', () => void load()) : null}
      {section === 'airdrop' && snapshot?.airdrop ? <View style={styles.socialGrid}>
        {(['telegram', 'instagram', 'x', 'facebook', 'youtube'] as const).map(platform => {
          const claim = snapshot.airdrop!.platforms[platform];
          const queued = platform === 'telegram' && snapshot.telegram?.claim?.status === 'queued';
          const sent = platform === 'telegram' && snapshot.telegram?.claim?.status === 'sent';
          const status = claim.claimed || sent ? 'RECEIVED' : queued ? 'QUEUED' : platform === 'telegram' ? 'Not received yet' : 'NOT LIVE';
          const Icon = SOCIAL_ICONS[platform];
          const received = claim.claimed || sent;
          return <View key={platform} style={[styles.socialCard, received ? styles.socialCardGreen : queued ? styles.socialCardOrange : styles.socialCardRed]}>
            <View style={styles.socialHeader}>
              <Icon width={54} height={54} />
              <View style={styles.socialHeaderCopy}>
                <Text style={styles.socialKicker}>{t('SOCIAL AIRDROP')}</Text>
                <Text style={styles.socialTitle}>{t(claim.title)}</Text>
              </View>
              <View style={[styles.socialStatusPill, received ? styles.socialStatusPillGreen : !queued && styles.socialStatusPillRed]}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.socialStatus, received ? styles.socialStatusGreen : !queued && styles.socialStatusRed]}>{t(status)}</Text>
              </View>
            </View>
            <View style={styles.socialMetaGrid}>
              <View style={styles.socialMetaCard}>
                <Text style={styles.socialMetaLabel}>{t('Amount')}</Text>
                <Text style={styles.socialAmount}>{claim.claimed ? `${claim.amountDisplay} 4TEEN` : t('TBA')}</Text>
              </View>
              <View style={styles.socialMetaCard}>
                <Text style={styles.socialMetaLabel}>{t('Received')}</Text>
                <Text style={styles.socialWhen}>{claim.claimed ? claim.claimedAtLabel : t('Not received yet')}</Text>
              </View>
            </View>
            {claim.explorerUrl ? action('VIEW TX', () => void openInAppBrowser(router, claim.explorerUrl!)) : null}
          </View>;
        })}
      </View> : null}
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
  notice: { gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: radius.md, backgroundColor: 'rgba(255,153,0,0.06)', borderWidth: 1, borderColor: 'rgba(255,153,0,0.18)' },
  noticeHeader: { alignItems: 'center', gap: 8 },
  noticeLabel: { flex: 1, color: colors.textDim, fontSize: 12, fontWeight: '700' },
  heading: { color: colors.white, fontSize: 16, fontWeight: '700' },
  body: { color: colors.textDim, fontSize: 14, lineHeight: 21 },
  address: { color: colors.textDim, fontSize: 12, lineHeight: 20 },
  wallet: { paddingHorizontal: 2, paddingVertical: 12, gap: 2 },
  walletName: { color: colors.white, fontSize: 14, fontWeight: '700' },
  rewardHero: { marginTop: 4, padding: 22, gap: 12, borderRadius: radius.lg, backgroundColor: 'rgba(255,105,0,0.10)', borderWidth: 1, borderColor: colors.lineStrong },
  rewardEyebrow: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  rewardValue: { color: colors.white, fontSize: 32, fontWeight: '800' },
  rewardFoot: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  airdropHero: { marginTop: 4, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.lg, backgroundColor: 'rgba(255,105,0,0.10)', borderWidth: 1, borderColor: colors.lineStrong },
  airdropMark: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.graphite, alignItems: 'center', justifyContent: 'center' },
  airdropHeroText: { flex: 1, gap: 6 },
  airdropTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  action: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actionText: { flex: 1, color: colors.accent, fontSize: 14, fontWeight: '600' },
  record: { paddingVertical: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  value: { color: colors.white, fontSize: 28, fontWeight: '700' },
  spinner: { marginVertical: 30 },
  socialGrid: { gap: 14 },
  socialCard: { width: '100%', minHeight: 176, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  socialCardGreen: { backgroundColor: 'rgba(24,224,58,0.06)', borderColor: 'rgba(24,224,58,0.18)' },
  socialCardOrange: { backgroundColor: 'rgba(255,105,0,0.06)', borderColor: 'rgba(255,105,0,0.18)' },
  socialCardRed: { backgroundColor: 'rgba(255,66,66,0.06)', borderColor: 'rgba(255,66,66,0.18)' },
  socialHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  socialHeaderCopy: { flex: 1, gap: 2 },
  socialKicker: { color: colors.textDim, fontSize: 10, lineHeight: 12, fontWeight: '700', letterSpacing: 0.5 },
  socialTitle: { color: colors.white, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  socialStatusPill: { maxWidth: 132, minHeight: 30, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: 'rgba(255,105,0,0.12)', borderColor: 'rgba(255,105,0,0.22)' },
  socialStatusPillGreen: { backgroundColor: 'rgba(24,224,58,0.12)', borderColor: 'rgba(24,224,58,0.22)' },
  socialStatusPillRed: { backgroundColor: 'rgba(255,66,66,0.12)', borderColor: 'rgba(255,66,66,0.22)' },
  socialStatus: { color: colors.accent, fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.4 },
  socialStatusGreen: { color: colors.green },
  socialStatusRed: { color: '#ff6262' },
  socialMetaGrid: { flexDirection: 'row', gap: 10 },
  socialMetaCard: { flex: 1, minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 12, paddingVertical: 10, gap: 6, justifyContent: 'center' },
  socialMetaLabel: { color: colors.textDim, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  socialAmount: { color: colors.white, fontSize: 16, lineHeight: 20, fontWeight: '700' },
  socialWhen: { color: colors.textSoft, fontSize: 12, lineHeight: 16, fontWeight: '600' },
});
