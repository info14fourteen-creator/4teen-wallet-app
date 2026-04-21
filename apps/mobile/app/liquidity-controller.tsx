import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  LIQUIDITY_BOOTSTRAPPER_CONTRACT_URL,
  LIQUIDITY_CONTRACT_EVENTS_URL,
  LIQUIDITY_CONTROLLER_CONTRACT_URL,
  LIQUIDITY_INFO_TEXT,
  LIQUIDITY_INFO_TITLE,
  LIQUIDITY_JUSTMONEY_EXECUTOR_CONTRACT_URL,
  LIQUIDITY_SUN_V3_EXECUTOR_CONTRACT_URL,
  executeLiquidityController,
  formatLiquidityDate,
  formatLiquidityTrx,
  loadLiquidityControllerSnapshot,
  shortLiquidityTx,
  type LiquidityControllerSnapshot,
} from '../src/services/liquidity-controller';
import { FOURTEEN_LOGO } from '../src/services/tron/api';
import { getAllWalletPortfolios } from '../src/services/wallet/portfolio';
import { getActiveWallet, setActiveWalletId, type WalletMeta } from '../src/services/wallet/storage';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import {
  FOOTER_NAV_BOTTOM_OFFSET,
  FOOTER_NAV_RESERVED_SPACE,
} from '../src/ui/footer-nav';
import { useNavigationInsets } from '../src/ui/navigation';
import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { OpenDownIcon, OpenRightIcon } from '../src/ui/ui-icons';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';

type WalletSwitcherItem = {
  id: string;
  name: string;
  address: string;
  kind: WalletMeta['kind'];
  balanceDisplay: string;
};

function formatWalletAccessLabel(kind: WalletMeta['kind']) {
  if (kind === 'mnemonic') return 'SEED PHRASE';
  if (kind === 'private-key') return 'PRIVATE KEY';
  return 'WATCH ONLY';
}

function shortenAddress(address: string) {
  const value = String(address || '').trim();
  if (!value) return '—';
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

export default function LiquidityControllerScreen() {
  const router = useRouter();
  const notice = useNotice();
  const navInsets = useNavigationInsets({ topExtra: 14 });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [snapshot, setSnapshot] = useState<LiquidityControllerSnapshot | null>(null);
  const [activeWallet, setActiveWallet] = useState<WalletMeta | null>(null);
  const [walletChoices, setWalletChoices] = useState<WalletSwitcherItem[]>([]);
  const [walletOptionsOpen, setWalletOptionsOpen] = useState(false);
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');

  useChromeLoading((loading && !snapshot) || refreshing || executing);

  const load = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    const silent = options?.silent === true;

    if (!silent) {
      setLoading(true);
    }

    try {
      const [wallet, aggregate, nextSnapshot] = await Promise.all([
        getActiveWallet(),
        getAllWalletPortfolios({ force: Boolean(options?.force) }),
        loadLiquidityControllerSnapshot({ force: Boolean(options?.force) }),
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
      setSnapshot(nextSnapshot);
      setErrorText('');
    } catch (error) {
      console.error(error);
      setSnapshot(null);
      setErrorText(
        error instanceof Error ? error.message : 'Failed to load liquidity controller.'
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
    async (wallet: WalletSwitcherItem) => {
      try {
        setSwitchingWalletId(wallet.id);
        setWalletOptionsOpen(false);
        await setActiveWalletId(wallet.id);
        await load({ silent: true, force: true });
        notice.showSuccessNotice(`Liquidity wallet: ${wallet.name}`, 2200);
      } catch (error) {
        console.error(error);
        notice.showErrorNotice('Failed to switch liquidity wallet.', 2400);
      } finally {
        setSwitchingWalletId(null);
      }
    },
    [load, notice]
  );

  const handleExecute = useCallback(async () => {
    if (executing) return;

    if (!activeWallet) {
      setStatusText('');
      setErrorText('Create or import a wallet before execution.');
      return;
    }

    try {
      setExecuting(true);
      setStatusText('Sending liquidity bootstrap transaction...');
      setErrorText('');

      const receipt = await executeLiquidityController();
      setStatusText(`Liquidity trigger sent: ${shortLiquidityTx(receipt.txId)}`);
      notice.showSuccessNotice('Liquidity trigger sent.', 2400);
      await load({ silent: true, force: true });
    } catch (error) {
      console.error(error);
      setStatusText('');
      setErrorText(error instanceof Error ? error.message : 'Liquidity execution failed.');
      notice.showErrorNotice('Liquidity execution failed.', 2600);
    } finally {
      setExecuting(false);
    }
  }, [activeWallet, executing, load, notice]);

  const visibleWalletChoices = useMemo(() => {
    return walletChoices.filter((wallet) => wallet.id !== activeWallet?.id);
  }, [activeWallet?.id, walletChoices]);
  const selectedWalletOption = useMemo(
    () => walletChoices.find((wallet) => wallet.id === activeWallet?.id) ?? null,
    [activeWallet?.id, walletChoices]
  );

  const screenStatusText =
    errorText ||
    statusText ||
    (snapshot?.historyStatus === 'unavailable' ? snapshot.historyMessage : '');
  const statusTone = errorText || snapshot?.historyStatus === 'unavailable'
    ? styles.statusDanger
    : styles.statusNeutral;
  const contractLinks = useMemo(
    () => [
      {
        label: 'Controller',
        address: snapshot?.controllerAddress || '',
        body: 'release rules',
        url: LIQUIDITY_CONTROLLER_CONTRACT_URL,
      },
      {
        label: 'Bootstrapper',
        address: snapshot?.bootstrapperAddress || '',
        body: 'vault top-up + trigger',
        url: LIQUIDITY_BOOTSTRAPPER_CONTRACT_URL,
      },
      {
        label: 'JustMoney executor',
        address: snapshot?.justMoneyExecutorAddress || '',
        body: 'AMM liquidity path',
        url: LIQUIDITY_JUSTMONEY_EXECUTOR_CONTRACT_URL,
      },
      {
        label: 'Sun.io V3 executor',
        address: snapshot?.sunV3ExecutorAddress || '',
        body: 'concentrated liquidity path',
        url: LIQUIDITY_SUN_V3_EXECUTOR_CONTRACT_URL,
      },
    ],
    [
      snapshot?.bootstrapperAddress,
      snapshot?.controllerAddress,
      snapshot?.justMoneyExecutorAddress,
      snapshot?.sunV3ExecutorAddress,
    ]
  );

  if (loading && !snapshot) {
    return <ScreenLoadingState label="Loading liquidity controller" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
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
        onScrollBeginDrag={() => setWalletOptionsOpen(false)}
        scrollEventThrottle={16}
      >
        <ScreenBrow
          label="LIQUIDITY CONTROLLER"
          variant="backLink"
          labelChevron={infoExpanded ? 'up' : 'down'}
          onLabelPress={() => setInfoExpanded((prev) => !prev)}
        />

        {infoExpanded ? (
          <View style={styles.infoPanel}>
            <Text style={styles.infoTitle}>{LIQUIDITY_INFO_TITLE}</Text>
            <Text style={styles.infoText}>{LIQUIDITY_INFO_TEXT}</Text>
          </View>
        ) : null}

        {activeWallet ? (
          <>
            <View style={styles.selectionBlock}>
              <Text style={styles.selectionEyebrow}>SELECTED WALLET · TAP TO SWITCH</Text>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.walletCard}
                onPress={handleToggleWalletOptions}
              >
                <Image
                  source={{ uri: FOURTEEN_LOGO }}
                  style={styles.heroWatermark}
                  contentFit="contain"
                />

                <View style={styles.walletCardText}>
                  <View style={styles.walletTitleRow}>
                    <Text style={styles.walletName}>{activeWallet.name}</Text>
                    <Text style={styles.activeBadge}>SELECTED</Text>
                  </View>
                  <Text style={styles.walletBalance}>
                    Balance: {selectedWalletOption?.balanceDisplay ?? '$0.00'}
                  </Text>
                  <Text style={styles.walletBalance}>
                    Access: {formatWalletAccessLabel(activeWallet.kind)}
                  </Text>
                  <Text style={styles.walletAddress}>{activeWallet.address}</Text>
                </View>

                {walletOptionsOpen ? (
                  <OpenDownIcon width={22} height={22} />
                ) : (
                  <OpenRightIcon width={18} height={18} />
                )}
              </TouchableOpacity>
            </View>

            {walletOptionsOpen ? (
              <View style={styles.walletOptionsList}>
                {visibleWalletChoices.map((wallet) => {
                  const switching = switchingWalletId === wallet.id;

                  return (
                    <TouchableOpacity
                      key={wallet.id}
                      activeOpacity={0.9}
                      style={styles.walletOptionRow}
                      onPress={() => void handleChooseWallet(wallet)}
                    >
                      <View style={styles.walletOptionText}>
                        <View style={styles.walletTitleRow}>
                          <Text style={ui.actionLabel}>{wallet.name}</Text>
                        </View>

                        <Text style={styles.optionBalance}>Balance: {wallet.balanceDisplay}</Text>
                        <Text style={styles.optionBalance}>
                          Access: {formatWalletAccessLabel(wallet.kind)}
                        </Text>
                        <Text style={styles.optionAddress}>{wallet.address}</Text>
                      </View>

                      {switching ? (
                        <ActivityIndicator color={colors.accent} />
                      ) : (
                        <OpenRightIcon width={18} height={18} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
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
              Create or import a signing wallet to execute liquidity routing.
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
            style={[styles.primaryAction, (!activeWallet || executing) && styles.actionDisabled]}
            disabled={!activeWallet || executing}
            onPress={() => void handleExecute()}
          >
            {executing ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.primaryActionLabel}>TRIGGER LIQUIDITY</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.88}
            style={styles.secondaryAction}
            onPress={() => void openInAppBrowser(router, LIQUIDITY_CONTRACT_EVENTS_URL)}
          >
            <MaterialCommunityIcons name="open-in-new" size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>CONTROLLER</Text>
            <Text style={styles.summaryValueSmall}>
              {shortenAddress(snapshot?.controllerAddress || '')}
            </Text>
            <Text style={styles.summaryUnit}>on-chain</Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>LAST EXECUTE</Text>
            <Text style={styles.summaryValueSmall}>
              {formatLiquidityDate(snapshot?.lastExecuteAt)}
            </Text>
            <Text style={styles.summaryUnit}>UTC</Text>
          </View>
        </View>

        <View style={styles.detailGrid}>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>LATEST TRX RECEIVED</Text>
            <Text style={styles.detailValue}>
              {formatLiquidityTrx(snapshot?.latestReceivedTrx)}
            </Text>
            <Text style={styles.detailUnit}>TRX</Text>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>MIN BALANCE</Text>
            <Text style={styles.detailValue}>100.00</Text>
            <Text style={styles.detailUnit}>TRX required</Text>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>DAILY RELEASE</Text>
            <Text style={[styles.detailValue, styles.detailValueAvailable]}>6.43%</Text>
            <Text style={styles.detailUnit}>of controller balance</Text>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>CADENCE</Text>
            <Text style={styles.detailValueSmall}>once per UTC day</Text>
            <Text style={styles.detailSubvalue}>contract-enforced</Text>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>TARGET SPLIT</Text>
            <Text style={styles.detailValueSmall}>50 / 50</Text>
            <Text style={styles.detailSubvalue}>JustMoney · Sun.io V3</Text>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>BOOTSTRAPPER</Text>
            <Text style={styles.detailValueSmall}>
              {shortenAddress(snapshot?.bootstrapperAddress || '')}
            </Text>
            <Text style={styles.detailSubvalue}>vault top-up + trigger</Text>
          </View>
        </View>

        <View style={styles.contractSection}>
          <View style={styles.contractHead}>
            <Text style={styles.historyEyebrow}>CONTRACT LINKS</Text>
          </View>

          <View style={styles.contractGrid}>
            {contractLinks.map((contract) => (
              <TouchableOpacity
                key={contract.label}
                activeOpacity={0.88}
                style={styles.contractCard}
                onPress={() => void openInAppBrowser(router, contract.url)}
              >
                <Text style={styles.contractLabel}>{contract.label}</Text>
                <Text style={styles.contractAddress}>
                  {shortenAddress(contract.address)}
                </Text>
                <View style={styles.contractMetaRow}>
                  <Text style={styles.contractBody}>{contract.body}</Text>
                  <MaterialCommunityIcons name="open-in-new" size={14} color={colors.accent} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {screenStatusText ? (
          <View style={[styles.statusCard, statusTone]}>
            <Text style={styles.statusText}>{screenStatusText}</Text>
          </View>
        ) : null}

        <View style={styles.historyHead}>
          <View>
            <Text style={styles.historyEyebrow}>LIQUIDITY EXECUTIONS</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.historyAction}
            accessibilityRole="button"
            accessibilityLabel="Open controller events"
            onPress={() => void openInAppBrowser(router, LIQUIDITY_CONTRACT_EVENTS_URL)}
          >
            <MaterialCommunityIcons name="open-in-new" size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {snapshot?.executions.length ? (
          <View style={styles.historyList}>
            {snapshot.executions.map((event) => (
              <TouchableOpacity
                key={`${event.txId}:${event.timestamp}`}
                activeOpacity={0.9}
                style={styles.historyCard}
                onPress={() => void openInAppBrowser(router, event.explorerUrl)}
              >
                <View style={styles.historyTop}>
                  <View>
                    <Text style={styles.historyAmount}>
                      {formatLiquidityTrx(event.totalTrx)} TRX
                    </Text>
                    <Text style={styles.historyTx}>TX · {shortLiquidityTx(event.txId)}</Text>
                  </View>

                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>EXECUTED</Text>
                  </View>
                </View>

                <View style={styles.historyMetrics}>
                  <View style={styles.historyMetricCard}>
                    <Text style={styles.historyMetricLabel}>DATE</Text>
                    <Text style={styles.historyMetricPrimary}>
                      {formatLiquidityDate(event.timestamp)}
                    </Text>
                    <Text style={styles.historyMetricSecondary}>UTC</Text>
                  </View>

                  <View style={styles.historyMetricCard}>
                    <Text style={styles.historyMetricLabel}>JUSTMONEY</Text>
                    <Text style={styles.historyMetricPrimary}>
                      {formatLiquidityTrx(event.justMoneyTrx)}
                    </Text>
                    <Text style={styles.historyMetricSecondary}>TRX</Text>
                  </View>

                  <View style={styles.historyMetricCard}>
                    <Text style={styles.historyMetricLabel}>SUN.IO</Text>
                    <Text style={styles.historyMetricPrimary}>
                      {formatLiquidityTrx(event.sunIoTrx)}
                    </Text>
                    <Text style={styles.historyMetricSecondary}>TRX</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyHistoryCard}>
            <Text style={styles.emptyHistoryTitle}>No liquidity executions yet.</Text>
            <Text style={styles.emptyHistoryBody}>
              Controller execution events will appear here after the first on-chain trigger.
            </Text>
          </View>
        )}

        <View style={styles.historyHead}>
          <View>
            <Text style={styles.historyEyebrow}>TRX RECEIVED</Text>
          </View>
        </View>

        {snapshot?.received.length ? (
          <View style={styles.historyList}>
            {snapshot.received.map((event) => (
              <TouchableOpacity
                key={`${event.txId}:${event.timestamp}`}
                activeOpacity={0.9}
                style={styles.historyCard}
                onPress={() => void openInAppBrowser(router, event.explorerUrl)}
              >
                <View style={styles.historyTop}>
                  <View>
                    <Text style={styles.historyAmount}>
                      {formatLiquidityTrx(event.amountTrx)} TRX
                    </Text>
                    <Text style={styles.historyTx}>TX · {shortLiquidityTx(event.txId)}</Text>
                  </View>

                  <View style={[styles.statusPill, styles.statusPillReceived]}>
                    <Text style={[styles.statusPillText, styles.statusPillTextReceived]}>
                      RECEIVED
                    </Text>
                  </View>
                </View>

                <View style={styles.historyMetrics}>
                  <View style={styles.historyMetricCard}>
                    <Text style={styles.historyMetricLabel}>DATE</Text>
                    <Text style={styles.historyMetricPrimary}>
                      {formatLiquidityDate(event.timestamp)}
                    </Text>
                    <Text style={styles.historyMetricSecondary}>UTC</Text>
                  </View>

                  <View style={styles.historyMetricCard}>
                    <Text style={styles.historyMetricLabel}>AMOUNT</Text>
                    <Text style={styles.historyMetricPrimary}>
                      {formatLiquidityTrx(event.amountTrx)}
                    </Text>
                    <Text style={styles.historyMetricSecondary}>TRX</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyHistoryCard}>
            <Text style={styles.emptyHistoryTitle}>No TRX received events yet.</Text>
            <Text style={styles.emptyHistoryBody}>
              Incoming controller deposits from token sales will appear here.
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
    padding: 14,
    gap: 8,
    marginBottom: 16,
  },

  infoTitle: {
    ...ui.bodyStrong,
  },

  infoText: {
    ...ui.body,
    lineHeight: 24,
  },

  selectionBlock: {
    marginBottom: 18,
  },

  selectionEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    marginBottom: 8,
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
    marginBottom: 18,
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

  actionDisabled: {
    opacity: 0.55,
  },

  primaryActionLabel: {
    ...ui.buttonLabel,
    textTransform: 'uppercase',
  },

  secondaryAction: {
    width: 54,
    minHeight: 54,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
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

  summaryValueSmall: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 19,
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

  contractSection: {
    marginBottom: 16,
  },

  contractHead: {
    marginBottom: 12,
  },

  contractGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  contractCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },

  contractLabel: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  contractAddress: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  contractMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  contractBody: {
    flex: 1,
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
    marginBottom: 16,
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
    flexWrap: 'wrap',
    gap: 10,
  },

  historyMetricCard: {
    flexGrow: 1,
    flexBasis: '30%',
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
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  historyMetricSecondary: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  statusPill: {
    minHeight: 28,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: withAlpha(colors.green, 0.36),
    backgroundColor: withAlpha(colors.green, 0.08),
  },

  statusPillReceived: {
    borderColor: withAlpha(colors.accent, 0.36),
    backgroundColor: withAlpha(colors.accent, 0.08),
  },

  statusPillText: {
    color: colors.green,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  statusPillTextReceived: {
    color: colors.accent,
  },

  emptyHistoryCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSoft,
    padding: 18,
    gap: 10,
    marginBottom: 16,
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
