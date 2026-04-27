import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotice } from '../src/notice/notice-provider';
import {
  clearWalletHistoryCache,
  getWalletHistory,
  type WalletHistoryItem,
} from '../src/services/tron/api';
import { getAllWalletPortfolios } from '../src/services/wallet/portfolio';
import {
  getActiveWallet,
  setActiveWalletId,
  type WalletMeta,
} from '../src/services/wallet/storage';
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
import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingOverlay from '../src/ui/screen-loading-overlay';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import useChromeLoading from '../src/ui/use-chrome-loading';
import LottieIcon from '../src/ui/lottie-icon';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import { useWalletSession } from '../src/wallet/wallet-session';

const APPROVAL_HISTORY_LIMIT = 100;
const CONNECTIONS_INFO_ARROW_SOURCE = require('../assets/icons/ui/connections_info_arrow_down.json');
const CONNECTIONS_INFO_CROSS_SOURCE = require('../assets/icons/ui/connections_info_cross.json');
const CONNECTIONS_INFO_ARROW_FRAMES: [number, number] = [0, 59];
const CONNECTIONS_INFO_CROSS_FRAMES: [number, number] = [0, 58];
const CONNECTIONS_INFO_ARROW_STATIC_PROGRESS = 1;
const CONNECTIONS_INFO_CROSS_STATIC_PROGRESS = 1;
const CONNECTIONS_INFO_TITLE = 'Connected sites and token permissions';
const CONNECTIONS_INFO_TEXT =
  'This page separates browser connections from on-chain token approvals. Connected sites should list domains that were granted wallet access inside the in-app browser. Approval cards show spender contracts that already received token spend permission from the active wallet.';

const KNOWN_SPENDER_INDEX: Record<
  string,
  {
    title: string;
    site?: string;
    body: string;
  }
> = {
  tj4nny8xzeqsowcbhlvz45lcqpdgjket5j: {
    title: 'SunSwap Smart Router',
    site: 'sun.io',
    body: '4TEEN swap approvals route through the SunSwap smart router contract.',
  },
};

type WalletSwitcherItem = {
  id: string;
  name: string;
  address: string;
  kind: WalletMeta['kind'];
  balanceDisplay: string;
};

type ApprovalItem = {
  txHash: string;
  tronscanUrl: string;
  spenderAddress: string;
  spenderLabel: string;
  tokenSymbol: string;
  amountFormatted: string;
  timestamp: number;
  status: 'success' | 'failed' | 'pending';
  siteLabel?: string;
  description?: string;
};

type ApprovalGroup = {
  key: string;
  spenderAddress: string;
  spenderLabel: string;
  siteLabel?: string;
  description?: string;
  latestTimestamp: number;
  latestTronscanUrl: string;
  successfulCount: number;
  pendingCount: number;
  failedCount: number;
  approvals: ApprovalItem[];
};

type InfoToggleIconState = 'closed-static' | 'opening' | 'open-static' | 'closing';

function shortAddress(address: string) {
  const safe = String(address || '').trim();
  if (!safe) return '—';
  if (safe.length <= 14) return safe;
  return `${safe.slice(0, 8)}...${safe.slice(-6)}`;
}

function formatTime(timestamp: number) {
  if (!timestamp) return 'Unknown time';

  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isApprovalItem(item: WalletHistoryItem) {
  return String(item.methodName || '').trim().toLowerCase().includes('approve');
}

function normalizeApprovalStatus(
  status?: WalletHistoryItem['transactionStatus']
): 'success' | 'failed' | 'pending' {
  if (status === 'failed') return 'failed';
  if (status === 'pending') return 'pending';
  return 'success';
}

function mapApprovalItem(item: WalletHistoryItem): ApprovalItem | null {
  if (!isApprovalItem(item)) {
    return null;
  }

  const spenderAddress = String(item.counterpartyAddress || item.to || '').trim();
  if (!spenderAddress) {
    return null;
  }

  const known = KNOWN_SPENDER_INDEX[spenderAddress.toLowerCase()];

  return {
    txHash: item.txHash,
    tronscanUrl: item.tronscanUrl,
    spenderAddress,
    spenderLabel:
      known?.title ||
      String(item.counterpartyLabel || '').trim() ||
      shortAddress(spenderAddress),
    tokenSymbol: String(item.tokenSymbol || '').trim() || 'TOKEN',
    amountFormatted: String(item.amountFormatted || '').trim() || 'Unknown amount',
    timestamp: Number(item.timestamp || 0),
    status: normalizeApprovalStatus(item.transactionStatus),
    siteLabel: known?.site,
    description: known?.body,
  };
}

function groupApprovals(items: ApprovalItem[]) {
  const index = new Map<string, ApprovalGroup>();

  for (const item of items) {
    const key = item.spenderAddress.toLowerCase();
    const current = index.get(key);

    if (!current) {
      index.set(key, {
        key,
        spenderAddress: item.spenderAddress,
        spenderLabel: item.spenderLabel,
        siteLabel: item.siteLabel,
        description: item.description,
        latestTimestamp: item.timestamp,
        latestTronscanUrl: item.tronscanUrl,
        successfulCount: item.status === 'success' ? 1 : 0,
        pendingCount: item.status === 'pending' ? 1 : 0,
        failedCount: item.status === 'failed' ? 1 : 0,
        approvals: [item],
      });
      continue;
    }

    current.approvals.push(item);
    current.successfulCount += item.status === 'success' ? 1 : 0;
    current.pendingCount += item.status === 'pending' ? 1 : 0;
    current.failedCount += item.status === 'failed' ? 1 : 0;

    if (item.timestamp >= current.latestTimestamp) {
      current.latestTimestamp = item.timestamp;
      current.latestTronscanUrl = item.tronscanUrl;
    }
  }

  return Array.from(index.values())
    .map((group) => ({
      ...group,
      approvals: [...group.approvals].sort((left, right) => right.timestamp - left.timestamp),
    }))
    .sort((left, right) => right.latestTimestamp - left.latestTimestamp);
}

function ConnectionsInfoToggleIcon({ expanded }: { expanded: boolean }) {
  const previousExpandedRef = useRef(expanded);
  const [playToken, setPlayToken] = useState(0);
  const [state, setState] = useState<InfoToggleIconState>(
    expanded ? 'open-static' : 'closed-static'
  );

  useEffect(() => {
    if (previousExpandedRef.current === expanded) {
      return;
    }

    previousExpandedRef.current = expanded;
    setState(expanded ? 'opening' : 'closing');
    setPlayToken((value) => value + 1);
  }, [expanded]);

  if (state === 'opening') {
    return (
      <LottieIcon
        key={`connections-info-opening-${playToken}`}
        source={CONNECTIONS_INFO_ARROW_SOURCE}
        size={16}
        playToken={playToken}
        frames={CONNECTIONS_INFO_ARROW_FRAMES}
        speed={1.2}
        onAnimationFinish={(isCancelled) => {
          if (!isCancelled) {
            setState((current) => (current === 'opening' ? 'open-static' : current));
          }
        }}
      />
    );
  }

  if (state === 'closing') {
    return (
      <LottieIcon
        key={`connections-info-closing-${playToken}`}
        source={CONNECTIONS_INFO_CROSS_SOURCE}
        size={16}
        playToken={playToken}
        frames={CONNECTIONS_INFO_CROSS_FRAMES}
        speed={1.2}
        onAnimationFinish={(isCancelled) => {
          if (!isCancelled) {
            setState((current) => (current === 'closing' ? 'closed-static' : current));
          }
        }}
      />
    );
  }

  if (state === 'open-static') {
    return (
      <LottieIcon
        key="connections-info-open-static"
        source={CONNECTIONS_INFO_CROSS_SOURCE}
        size={16}
        progress={CONNECTIONS_INFO_CROSS_STATIC_PROGRESS}
      />
    );
  }

  return (
    <LottieIcon
      key="connections-info-closed-static"
      source={CONNECTIONS_INFO_ARROW_SOURCE}
      size={16}
      progress={CONNECTIONS_INFO_ARROW_STATIC_PROGRESS}
    />
  );
}

export default function ConnectionsScreen() {
  const router = useRouter();
  const notice = useNotice();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const { setPendingWalletSelectionId } = useWalletSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<WalletMeta | null>(null);
  const [walletChoices, setWalletChoices] = useState<WalletSwitcherItem[]>([]);
  const [walletOptionsOpen, setWalletOptionsOpen] = useState(false);
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);
  const [approvalItems, setApprovalItems] = useState<ApprovalItem[]>([]);
  const [infoExpanded, setInfoExpanded] = useState(false);

  useChromeLoading((loading && !wallet) || refreshing || Boolean(switchingWalletId));

  const load = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    const silent = options?.silent === true;
    const force = Boolean(options?.force);

    if (!silent) {
      setLoading(true);
    }

    try {
      const [activeWallet, aggregate] = await Promise.all([
        getActiveWallet(),
        getAllWalletPortfolios({ force }),
      ]);

      setWalletChoices(
        aggregate.items.map((item) => ({
          id: item.wallet.id,
          name: item.wallet.name,
          address: item.wallet.address,
          kind: item.wallet.kind,
          balanceDisplay: item.portfolio?.totalBalanceDisplay ?? '$0.00',
        }))
      );
      setWallet(activeWallet);
      setWalletOptionsOpen(false);

      if (!activeWallet) {
        setApprovalItems([]);
        return;
      }

      if (force) {
        await clearWalletHistoryCache(activeWallet.address, APPROVAL_HISTORY_LIMIT);
      }

      const history = await getWalletHistory(activeWallet.address, {
        force,
        limit: APPROVAL_HISTORY_LIMIT,
      });

      setApprovalItems(
        history.map(mapApprovalItem).filter((item): item is ApprovalItem => Boolean(item))
      );
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Connections failed to load.', 2600);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notice]);

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
    const availableChoices = walletChoices.filter((item) => item.id !== wallet?.id);

    if (availableChoices.length <= 0) {
      notice.showNeutralNotice('No other wallets available.', 2200);
      return;
    }

    setWalletOptionsOpen((prev) => !prev);
  }, [notice, wallet?.id, walletChoices]);

  const handleChooseWallet = useCallback(
    (nextWallet: WalletSwitcherOption) => {
      void (async () => {
        try {
          setSwitchingWalletId(nextWallet.id);
          setWalletOptionsOpen(false);
          await setActiveWalletId(nextWallet.id);
          setPendingWalletSelectionId(nextWallet.id);
          await load({ silent: true, force: true });
        } catch (error) {
          console.error(error);
          notice.showErrorNotice('Failed to switch active wallet.', 2400);
        } finally {
          setSwitchingWalletId(null);
        }
      })();
    },
    [load, notice, setPendingWalletSelectionId]
  );

  const approvalGroups = useMemo(() => groupApprovals(approvalItems), [approvalItems]);
  const approvedTokenCount = useMemo(() => {
    return new Set(
      approvalItems
        .filter((item) => item.status === 'success')
        .map((item) => `${item.spenderAddress.toLowerCase()}:${item.tokenSymbol}`)
    ).size;
  }, [approvalItems]);
  const pendingApprovalCount = useMemo(
    () => approvalItems.filter((item) => item.status === 'pending').length,
    [approvalItems]
  );
  const visibleWalletChoices = useMemo(
    () => walletChoices.filter((item) => item.id !== wallet?.id),
    [wallet?.id, walletChoices]
  );
  const selectedWalletOption = useMemo(
    () => walletChoices.find((item) => item.id === wallet?.id) ?? null,
    [wallet?.id, walletChoices]
  );

  if (loading && !wallet) {
    return <ScreenLoadingState label="Loading connections" />;
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
          label="CONNECTIONS"
          variant="backLink"
          labelAccessory={<ConnectionsInfoToggleIcon expanded={infoExpanded} />}
          onLabelPress={() => setInfoExpanded((prev) => !prev)}
        />

        {infoExpanded ? (
          <View style={styles.infoPanel}>
            <Text style={styles.infoTitle}>{CONNECTIONS_INFO_TITLE}</Text>
            <Text style={styles.infoText}>{CONNECTIONS_INFO_TEXT}</Text>
          </View>
        ) : null}

        {wallet ? (
          <View style={styles.selectionBlock}>
            <SelectedWalletSwitcher
              wallet={{
                id: wallet.id,
                name: wallet.name,
                address: wallet.address,
                kind: wallet.kind,
                balanceDisplay: selectedWalletOption?.balanceDisplay ?? '$0.00',
              }}
              visibleWalletChoices={visibleWalletChoices}
              walletOptionsOpen={walletOptionsOpen}
              switchingWalletId={switchingWalletId}
              onToggle={handleToggleWalletOptions}
              onChooseWallet={handleChooseWallet}
            />
          </View>
        ) : (
          <View style={styles.emptyWalletCard}>
            <Text style={styles.emptyWalletTitle}>No wallet connected</Text>
            <Text style={styles.emptyWalletBody}>
              Create or import a wallet to review connected sites and recent token approvals.
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
            onPress={handleRefresh}
          >
            <Text style={styles.primaryActionLabel}>REFRESH</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.secondaryAction}
            onPress={() => router.push('/browser')}
          >
            <Text style={styles.secondaryActionLabel}>OPEN BROWSER</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsStack}>
          <View style={styles.metricCard}>
            <View style={styles.metricCopy}>
              <Text style={styles.summaryLabel}>CONNECTED SITES</Text>
              <Text style={styles.summaryUnit}>No browser sessions are stored yet.</Text>
            </View>
            <Text style={styles.summaryValue}>0</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricCopy}>
              <Text style={styles.summaryLabel}>APPROVED CONTRACTS</Text>
              <Text style={styles.summaryUnit}>Unique spender contracts in recent history.</Text>
            </View>
            <Text style={styles.summaryValue}>{approvalGroups.length}</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricCopy}>
              <Text style={styles.summaryLabel}>APPROVED TOKENS</Text>
              <Text style={styles.summaryUnit}>Successful approve events</Text>
            </View>
            <Text style={styles.summaryValue}>{approvedTokenCount}</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricCopy}>
              <Text style={styles.summaryLabel}>PENDING</Text>
              <Text style={styles.summaryUnit}>Approval tx waiting to finalize</Text>
            </View>
            <Text style={styles.summaryValue}>{pendingApprovalCount}</Text>
          </View>
        </View>

        <View style={[styles.statusCard, styles.statusNeutral]}>
          <Text style={styles.statusText}>
            Connected sites and on-chain approvals are different layers. This build already reads approval history, but browser-side wallet connect sessions are not persisted yet.
          </Text>
        </View>

        <View style={styles.historyHead}>
          <View>
            <Text style={styles.historyEyebrow}>CONNECTED SITES</Text>
          </View>
        </View>

        <View style={styles.emptyHistoryCard}>
          <Text style={styles.emptyHistoryTitle}>No connected site cards yet.</Text>
          <Text style={styles.emptyHistoryBody}>
            The in-app browser opens websites, but it does not store per-domain wallet access state yet. Once browser-side connect sessions exist, this section should render those domains as cards.
          </Text>
        </View>

        <View style={styles.historyHead}>
          <View>
            <Text style={styles.historyEyebrow}>ON-CHAIN APPROVALS</Text>
          </View>
        </View>

        {approvalGroups.length > 0 ? (
          <View style={styles.historyList}>
            {approvalGroups.map((group) => (
              <TouchableOpacity
                key={group.key}
                activeOpacity={0.9}
                style={styles.historyCard}
                onPress={() => void openInAppBrowser(router, group.latestTronscanUrl)}
              >
                <View style={styles.historyTop}>
                  <View style={styles.historyTitleWrap}>
                    <Text style={styles.historyAmount}>{group.spenderLabel}</Text>
                    <Text style={styles.historyTx}>
                      {group.siteLabel ? `${group.siteLabel} • ` : ''}
                      {shortAddress(group.spenderAddress)}
                    </Text>
                  </View>

                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>
                      {group.pendingCount > 0 ? 'PENDING' : 'ACTIVE'}
                    </Text>
                  </View>
                </View>

                <View style={styles.historyMetaRow}>
                  <View style={styles.historyMetaPrimary}>
                    <Text style={styles.historyMetricLabel}>LATEST</Text>
                    <Text style={styles.historyMetricPrimary}>{formatTime(group.latestTimestamp)}</Text>
                  </View>

                  <View style={styles.historyStatsInline}>
                    <View style={[styles.inlineStatPill, styles.inlineStatPillSuccess]}>
                      <Text style={[styles.inlineStatValue, styles.inlineStatValueSuccess]}>
                        {group.successfulCount}
                      </Text>
                      <Text style={styles.inlineStatLabel}>ok</Text>
                    </View>
                    <View style={[styles.inlineStatPill, styles.inlineStatPillPending]}>
                      <Text style={[styles.inlineStatValue, styles.inlineStatValuePending]}>
                        {group.pendingCount}
                      </Text>
                      <Text style={styles.inlineStatLabel}>wait</Text>
                    </View>
                    <View style={[styles.inlineStatPill, styles.inlineStatPillFailed]}>
                      <Text style={[styles.inlineStatValue, styles.inlineStatValueFailed]}>
                        {group.failedCount}
                      </Text>
                      <Text style={styles.inlineStatLabel}>fail</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.historyDescription}>
                  {group.description || 'Most recent approval in wallet history'}
                </Text>

                <View style={styles.approvalRows}>
                  {group.approvals.slice(0, 3).map((item) => (
                    <View key={`${item.txHash}-${item.tokenSymbol}`} style={styles.approvalRow}>
                      <View style={styles.approvalTokenWrap}>
                        <Text style={styles.approvalToken}>{item.tokenSymbol}</Text>
                        <Text style={styles.approvalAmount}>{item.amountFormatted}</Text>
                      </View>
                      <Text
                        style={[
                          styles.approvalMeta,
                          item.status === 'success'
                            ? styles.approvalMetaSuccess
                            : item.status === 'pending'
                              ? styles.approvalMetaPending
                              : styles.approvalMetaFailed,
                        ]}
                      >
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={styles.cardPrimaryAction}
                    onPress={() =>
                      void openInAppBrowser(
                        router,
                        `https://tronscan.org/#/contract/${group.spenderAddress}`
                      )
                    }
                  >
                    <Text style={styles.cardPrimaryActionLabel}>OPEN CONTRACT</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.88}
                    style={styles.cardSecondaryAction}
                    onPress={() => void openInAppBrowser(router, group.latestTronscanUrl)}
                  >
                    <Text style={styles.cardSecondaryActionLabel}>OPEN LATEST TX</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyHistoryCard}>
            <Text style={styles.emptyHistoryTitle}>No approval cards yet.</Text>
            <Text style={styles.emptyHistoryBody}>
              This wallet has no recent approve events in the current history window. When a dapp receives token spend permission, it should appear here as a spender card.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function withAlpha(rgb: string, alpha: number) {
  const values = rgb.match(/\d+/g);
  if (!values || values.length < 3) {
    return rgb;
  }

  return `rgba(${values[0]},${values[1]},${values[2]},${alpha})`;
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

  selectionBlock: {
    marginBottom: 16,
  },

  emptyWalletCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    padding: 18,
    gap: 12,
    marginBottom: 16,
  },

  emptyWalletTitle: {
    ...ui.titleSm,
  },

  emptyWalletBody: {
    ...ui.body,
    lineHeight: 23,
  },

  heroActions: {
    flexDirection: 'row',
    gap: 10,
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

  metricsStack: {
    gap: 12,
    marginBottom: 16,
  },

  metricCard: {
    minHeight: 84,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },

  metricCopy: {
    flex: 1,
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
    minWidth: 32,
    color: colors.accent,
    fontSize: 34,
    lineHeight: 34,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },

  summaryUnit: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  statusCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
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

  emptyHistoryCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    padding: 16,
    gap: 8,
    marginBottom: 16,
  },

  emptyHistoryTitle: {
    ...ui.titleSm,
  },

  emptyHistoryBody: {
    ...ui.body,
    color: colors.textDim,
    lineHeight: 22,
  },

  historyList: {
    gap: 12,
  },

  historyCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    padding: 14,
    gap: 12,
  },

  historyTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  historyTitleWrap: {
    flex: 1,
    gap: 4,
  },

  historyAmount: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: 'Sora_700Bold',
  },

  historyTx: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  statusPill: {
    minHeight: 30,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: withAlpha(colors.accent, 0.28),
    backgroundColor: withAlpha(colors.accent, 0.12),
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statusPillText: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
  },

  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },

  historyMetaPrimary: {
    flex: 1,
    gap: 4,
  },

  historyMetricLabel: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  historyMetricPrimary: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  historyDescription: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
  },

  approvalRows: {
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },

  approvalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },

  approvalTokenWrap: {
    flex: 1,
    gap: 2,
  },

  approvalToken: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_700Bold',
  },

  approvalAmount: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  approvalMeta: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
  },

  approvalMetaSuccess: {
    color: colors.green,
  },

  approvalMetaPending: {
    color: colors.accent,
  },

  approvalMetaFailed: {
    color: colors.red,
  },

  historyStatsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },

  inlineStatPill: {
    minHeight: 30,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  inlineStatPillSuccess: {
    borderColor: withAlpha(colors.green, 0.28),
    backgroundColor: withAlpha(colors.green, 0.1),
  },

  inlineStatPillPending: {
    borderColor: withAlpha(colors.accent, 0.28),
    backgroundColor: withAlpha(colors.accent, 0.1),
  },

  inlineStatPillFailed: {
    borderColor: withAlpha(colors.red, 0.24),
    backgroundColor: withAlpha(colors.red, 0.1),
  },

  inlineStatValue: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
  },

  inlineStatValueSuccess: {
    color: colors.green,
  },

  inlineStatValuePending: {
    color: colors.accent,
  },

  inlineStatValueFailed: {
    color: colors.red,
  },

  inlineStatLabel: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'Sora_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.28,
  },

  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },

  cardPrimaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
  },

  cardPrimaryActionLabel: {
    ...ui.buttonLabel,
    textTransform: 'uppercase',
    fontSize: 13,
  },

  cardSecondaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
  },

  cardSecondaryActionLabel: {
    ...ui.buttonLabel,
    textTransform: 'uppercase',
    fontSize: 13,
  },
});
