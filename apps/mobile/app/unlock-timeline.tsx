import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotice } from '../src/notice/notice-provider';
import { FOURTEEN_LOGO } from '../src/services/tron/api';
import {
  formatUnlockAmount,
  formatUnlockCompact,
  getUnlockStatus,
  loadUnlockTimelineSnapshot,
  UNLOCK_TIMELINE_CONTRACT,
  UNLOCK_TIMELINE_INFO_TEXT,
  UNLOCK_TIMELINE_INFO_TITLE,
  type UnlockTimelineSnapshot,
} from '../src/services/unlock-timeline';
import { getAllWalletPortfolios } from '../src/services/wallet/portfolio';
import { getActiveWallet, setActiveWalletId, type WalletMeta } from '../src/services/wallet/storage';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import {
  FOOTER_NAV_BOTTOM_OFFSET,
  FOOTER_NAV_RESERVED_SPACE,
} from '../src/ui/footer-nav';
import { useNavigationInsets } from '../src/ui/navigation';
import SelectedWalletSwitcher, {
  type WalletSwitcherOption,
} from '../src/ui/selected-wallet-switcher';
import InfoToggleIcon from '../src/ui/info-toggle-icon';
import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingOverlay from '../src/ui/screen-loading-overlay';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import { useWalletSession } from '../src/wallet/wallet-session';

type WalletSwitcherItem = {
  id: string;
  name: string;
  address: string;
  kind: WalletMeta['kind'];
  balanceDisplay: string;
};

function formatDateParts(unlockAt: number) {
  const date = new Date(unlockAt);

  return {
    primary: date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    }),
    year: date.toLocaleString('en-GB', {
      year: 'numeric',
      timeZone: 'UTC',
    }),
  };
}

function formatCardValue(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return formatUnlockCompact(value);
}

function formatCardUsd(value: number | null | undefined) {
  const safe = Number(value || 0);
  if (!Number.isFinite(safe) || safe <= 0) return '—';
  if (Math.abs(safe) >= 1000) return formatUnlockCompact(safe);
  return safe.toFixed(2);
}

export default function UnlockTimelineScreen() {
  const router = useRouter();
  const notice = useNotice();
  const { setPendingWalletSelectionId } = useWalletSession();
  const navInsets = useNavigationInsets({ topExtra: 14 });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshot, setSnapshot] = useState<UnlockTimelineSnapshot | null>(null);
  const [activeWallet, setActiveWallet] = useState<WalletMeta | null>(null);
  const [walletChoices, setWalletChoices] = useState<WalletSwitcherItem[]>([]);
  const [walletOptionsOpen, setWalletOptionsOpen] = useState(false);
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [now, setNow] = useState(Date.now());

  useChromeLoading((loading && !snapshot) || refreshing);

  useEffect(() => {
    if (!snapshot?.events.length) {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [snapshot?.events.length]);

  const load = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    const silent = options?.silent === true;

    if (!silent) {
      setLoading(true);
    }

    try {
      const [wallet, aggregate] = await Promise.all([
        getActiveWallet(),
        getAllWalletPortfolios({ force: Boolean(options?.force) }),
      ]);

      const nextWalletChoices = aggregate.items.map((item) => ({
        id: item.wallet.id,
        name: item.wallet.name,
        address: item.wallet.address,
        kind: item.wallet.kind,
        balanceDisplay: item.portfolio?.totalBalanceDisplay ?? '$0.00',
      }));

      setWalletChoices(nextWalletChoices);
      setActiveWallet(wallet);
      setWalletOptionsOpen(false);
      setErrorText('');

      if (!wallet) {
        setSnapshot(null);
        return;
      }

      const nextSnapshot = await loadUnlockTimelineSnapshot({
        walletAddress: wallet.address,
        force: Boolean(options?.force),
      });

      setSnapshot(nextSnapshot);
    } catch (error) {
      console.error(error);
      setSnapshot(null);
      setErrorText(
        error instanceof Error ? error.message : 'Failed to load unlock timeline.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ silent: true, force: true });
  }, [load]);

  const handleToggleWalletOptions = useCallback(() => {
    if (walletChoices.length <= 1) {
      notice.showNeutralNotice('No other wallets available.', 2200);
      return;
    }

    setWalletOptionsOpen((prev) => !prev);
  }, [notice, walletChoices.length]);

  const handleChooseWallet = useCallback(
    async (wallet: WalletSwitcherOption) => {
      try {
        setSwitchingWalletId(wallet.id);
        setWalletOptionsOpen(false);
        await setActiveWalletId(wallet.id);
        setPendingWalletSelectionId(wallet.id);
        await load({ silent: true, force: true });
      } catch (error) {
        console.error(error);
        notice.showErrorNotice('Failed to switch timeline wallet.', 2400);
      } finally {
        setSwitchingWalletId(null);
      }
    },
    [load, notice, setPendingWalletSelectionId]
  );

  const visibleWalletChoices = useMemo(() => {
    return walletChoices.filter((wallet) => wallet.id !== activeWallet?.id);
  }, [activeWallet?.id, walletChoices]);
  const selectedWalletOption = useMemo(
    () => walletChoices.find((wallet) => wallet.id === activeWallet?.id) ?? null,
    [activeWallet?.id, walletChoices]
  );

  const historyRows = useMemo(() => {
    return (snapshot?.events || []).map((event) => ({
      event,
      ...getUnlockStatus(event, now),
      dateParts: formatDateParts(event.unlockAt),
    }));
  }, [now, snapshot?.events]);

  const canOpenSwap =
    activeWallet?.kind !== 'watch-only' && (snapshot?.availableBalance ?? 0) > 0;
  const hasUnlockedOnWatchOnly =
    activeWallet?.kind === 'watch-only' && (snapshot?.availableBalance ?? 0) > 0;

  const statusText =
    errorText ||
    (snapshot?.historyStatus && snapshot.historyStatus !== 'empty' ? snapshot.historyMessage : '') ||
    snapshot?.balanceError ||
    snapshot?.rateError ||
    '';

  const statusTone =
    errorText ||
    snapshot?.historyStatus === 'rate-limited' ||
    snapshot?.historyStatus === 'unavailable' ||
    snapshot?.balanceError
      ? styles.statusDanger
      : styles.statusNeutral;

  if (loading && !snapshot) {
    return <ScreenLoadingState label="Loading unlock timeline" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <ScreenLoadingOverlay visible={refreshing || Boolean(switchingWalletId)} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: navInsets.top,
            paddingBottom: FOOTER_NAV_RESERVED_SPACE + FOOTER_NAV_BOTTOM_OFFSET + 30,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
        scrollEventThrottle={16}
      >
        <ScreenBrow
          label="UNLOCK TIMELINE"
          variant="backLink"
          labelAccessory={<InfoToggleIcon expanded={infoExpanded} />}
          onLabelPress={() => setInfoExpanded((prev) => !prev)}
        />

        {infoExpanded ? (
          <View style={styles.infoPanel}>
            <Text style={styles.infoTitle}>{UNLOCK_TIMELINE_INFO_TITLE}</Text>
            <Text style={styles.infoText}>{UNLOCK_TIMELINE_INFO_TEXT}</Text>
          </View>
        ) : null}

        {activeWallet ? (
          <>
            <View style={styles.selectionBlock}>
              <SelectedWalletSwitcher
                wallet={{
                  id: activeWallet.id,
                  name: activeWallet.name,
                  address: activeWallet.address,
                  kind: activeWallet.kind,
                  balanceDisplay: selectedWalletOption?.balanceDisplay ?? '$0.00',
                }}
                visibleWalletChoices={visibleWalletChoices}
                walletOptionsOpen={walletOptionsOpen}
                switchingWalletId={switchingWalletId}
                onToggle={handleToggleWalletOptions}
                onChooseWallet={(wallet) => {
                  void handleChooseWallet(wallet);
                }}
              />
            </View>
          </>
        ) : (
          <View style={styles.emptyWalletCard}>
            <Image
              source={{ uri: FOURTEEN_LOGO }}
              style={styles.heroWatermark}
              contentFit="contain"
            />

            <Text style={styles.emptyWalletTitle}>No wallet connected</Text>
            <Text style={styles.emptyWalletBody}>
              Create or import a wallet to load balances, rate, and unlock history.
            </Text>
            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.primaryAction}
              onPress={() => router.push('/wallet-access')}
            >
              <Text style={styles.primaryActionLabel}>OPEN WALLET ACCESS</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.heroActions}>
          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.primaryAction}
            onPress={() => router.push('/buy')}
          >
            <Text style={styles.primaryActionLabel}>BUY 4TEEN</Text>
          </TouchableOpacity>

          {canOpenSwap ? (
            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.secondaryAction}
              onPress={() =>
                router.push({
                  pathname: '/swap',
                  params: {
                    tokenId: UNLOCK_TIMELINE_CONTRACT,
                    walletId: activeWallet?.id || '',
                  },
                } as any)
              }
            >
              <Text style={styles.secondaryActionLabel}>SWAP</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>DIRECT BUY PRICE</Text>
            <Text style={styles.summaryValue}>{formatCardValue(snapshot?.directBuyRateTrx)}</Text>
            <Text style={styles.summaryUnit}>
              TRX {snapshot?.directBuyRateUsd ? `• ${formatCardUsd(snapshot.directBuyRateUsd)} USD` : ''}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>MARKET PRICE</Text>
            <Text style={styles.summaryValue}>{formatCardValue(snapshot?.marketRateTrx)}</Text>
            <Text style={styles.summaryUnit}>
              TRX {snapshot?.marketRateUsd ? `• ${formatCardUsd(snapshot.marketRateUsd)} USD` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.detailGrid}>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>AVAILABLE NOW</Text>
            <Text style={[styles.detailValue, styles.detailValueAvailable]}>
              {formatCardValue(snapshot?.availableBalance)}
            </Text>
            <Text style={styles.detailUnit}>4TEEN</Text>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>TOTAL BALANCE</Text>
            <Text style={styles.detailValue}>
              {formatCardValue(snapshot?.totalBalance)}
            </Text>
            <Text style={styles.detailUnit}>4TEEN</Text>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>LOCKED BALANCE</Text>
            <Text style={[styles.detailValue, styles.detailValueLocked]}>
              {formatCardValue(snapshot?.lockedBalance)}
            </Text>
            <Text style={styles.detailUnit}>4TEEN</Text>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>CONVERSION</Text>
            <Text
              style={styles.detailValueSmall}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              1 4TEEN → {formatCardValue(snapshot?.marketRateTrx)} TRX
            </Text>
            <Text style={styles.detailSubvalue} numberOfLines={1}>
              ≈ {formatCardUsd(snapshot?.marketRateUsd)} USD
            </Text>
          </View>
        </View>

        {statusText ? (
          <View style={[styles.statusCard, statusTone]}>
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
        ) : null}

        {hasUnlockedOnWatchOnly ? (
          <View style={[styles.statusCard, styles.statusNeutral]}>
            <Text style={styles.statusText}>
              Unlocked 4TEEN is visible here, but swapping still requires a signing wallet.
            </Text>
          </View>
        ) : null}

        <View style={styles.historyHead}>
          <View>
            <Text style={styles.historyEyebrow}>UNLOCK HISTORY</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.historyAction}
            accessibilityRole="button"
            accessibilityLabel="Buy 4TEEN"
            onPress={() => router.push('/buy')}
          >
            <MaterialCommunityIcons name="cart-outline" size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {historyRows.length > 0 ? (
          <View style={styles.historyList}>
            {historyRows.map(({ event, unlocked, countdown, dateParts }) => (
              <TouchableOpacity
                key={`${event.txId}:${event.unlockAt}`}
                activeOpacity={0.9}
                style={styles.historyCard}
                onPress={() => void openInAppBrowser(router, event.explorerUrl)}
              >
                <View style={styles.historyTop}>
                  <View>
                    <Text style={styles.historyAmount}>{formatUnlockAmount(event.amount)} 4TEEN</Text>
                    <Text style={styles.historyTx}>TX • {event.txId.slice(0, 8)}...</Text>
                  </View>

                  <View style={[styles.statusPill, unlocked ? styles.statusPillUnlocked : styles.statusPillLocked]}>
                    <Text
                      style={[
                        styles.statusPillText,
                        unlocked ? styles.statusPillTextUnlocked : styles.statusPillTextLocked,
                      ]}
                    >
                      {unlocked ? 'UNLOCKED' : 'LOCKED'}
                    </Text>
                  </View>
                </View>

                <View style={styles.historyMetrics}>
                  <View style={styles.historyMetricCard}>
                    <Text style={styles.historyMetricLabel}>UNLOCK</Text>
                    <Text style={styles.historyMetricPrimary}>{dateParts.primary}</Text>
                    <Text style={styles.historyMetricSecondary}>{dateParts.year} UTC</Text>
                  </View>

                  <View style={styles.historyMetricCard}>
                    <Text style={styles.historyMetricLabel}>COUNTDOWN</Text>
                    <Text style={[styles.historyMetricPrimary, unlocked && styles.historyMetricPrimaryUnlocked]}>
                      {countdown}
                    </Text>
                    <Text style={styles.historyMetricSecondary}>
                      {unlocked ? 'Ready to move' : 'Live countdown'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyHistoryCard}>
            <Text style={styles.emptyHistoryTitle}>
              {snapshot?.historyMessage || 'No unlock entries yet.'}
            </Text>
            <Text style={styles.emptyHistoryBody}>
              Direct-buy transactions will appear here as separate lock batches with their own release time.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    paddingHorizontal: layout.screenPaddingX,
    gap: 0,
  },

  infoPanel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
    marginBottom: 16,
  },

  infoTitle: {
    ...ui.bodyStrong,
  },

  infoText: {
    ...ui.body,
    lineHeight: 25,
  },

  heroActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 0,
    marginBottom: 16,
  },

  primaryAction: {
    flex: 1,
    minHeight: 54,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
  },

  primaryActionLabel: {
    ...ui.buttonLabel,
    textTransform: 'uppercase',
  },

  secondaryAction: {
    flex: 1,
    minHeight: 54,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    paddingHorizontal: 18,
  },

  secondaryActionLabel: {
    ...ui.buttonLabel,
    textTransform: 'uppercase',
  },

  walletCard: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },

  heroWatermark: {
    position: 'absolute',
    top: 12,
    right: 20,
    width: 84,
    height: 84,
    opacity: 0.045,
  },

  walletCardText: {
    flex: 1,
    gap: 4,
  },

  selectionBlock: {
    marginBottom: 16,
  },

  selectionEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    marginBottom: 8,
  },

  walletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  walletName: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  activeBadge: {
    color: colors.green,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  walletBalance: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  walletAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  walletOptionsList: {
    gap: 10,
    marginTop: -6,
    marginBottom: 16,
  },

  walletOptionRow: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.14)',
    backgroundColor: 'rgba(255,105,0,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  walletOptionText: {
    flex: 1,
    gap: 4,
  },

  optionBalance: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  optionAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  emptyWalletCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    padding: 18,
    gap: 12,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16,
  },

  emptyWalletTitle: {
    ...ui.titleSm,
  },

  emptyWalletBody: {
    ...ui.body,
    lineHeight: 23,
  },

  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },

  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
  },

  summaryLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },

  summaryValue: {
    color: colors.white,
    fontSize: 25,
    lineHeight: 30,
    fontFamily: 'Sora_700Bold',
  },

  summaryUnit: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },

  detailCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },

  detailLabel: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  detailValue: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  detailValueSmall: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  detailValueLocked: {
    color: colors.red,
  },

  detailValueAvailable: {
    color: colors.green,
  },

  detailUnit: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  detailSubvalue: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  statusCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },

  statusDanger: {
    borderColor: withAlpha(colors.red, 0.34),
    backgroundColor: withAlpha(colors.red, 0.08),
  },

  statusNeutral: {
    borderColor: colors.line,
    backgroundColor: colors.surfaceSoft,
  },

  statusText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Sora_600SemiBold',
  },

  historyHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },

  historyEyebrow: {
    ...ui.eyebrow,
  },

  historyAction: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  historyList: {
    gap: 12,
  },

  historyCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    padding: 16,
    gap: 14,
  },

  historyTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  historyAmount: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  historyTx: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
    marginTop: 6,
  },

  historyMetrics: {
    flexDirection: 'row',
    gap: 10,
  },

  historyMetricCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 5,
  },

  historyMetricLabel: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },

  historyMetricPrimary: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 19,
    fontFamily: 'Sora_700Bold',
  },

  historyMetricPrimaryUnlocked: {
    color: colors.green,
  },

  historyMetricSecondary: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  statusPill: {
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  statusPillLocked: {
    borderColor: withAlpha(colors.red, 0.36),
    backgroundColor: withAlpha(colors.red, 0.08),
  },

  statusPillUnlocked: {
    borderColor: withAlpha(colors.green, 0.36),
    backgroundColor: withAlpha(colors.green, 0.08),
  },

  statusPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  statusPillTextLocked: {
    color: colors.red,
  },

  statusPillTextUnlocked: {
    color: colors.green,
  },

  emptyHistoryCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSoft,
    padding: 18,
    gap: 10,
  },

  emptyHistoryTitle: {
    ...ui.bodyStrong,
  },

  emptyHistoryBody: {
    ...ui.body,
    lineHeight: 23,
  },
});

function withAlpha(color: string, alpha: number) {
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
  }

  return color;
}
