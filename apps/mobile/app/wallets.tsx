import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import { ProductScreen } from '../src/ui/product-shell';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { useWalletSession } from '../src/wallet/wallet-session';

import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  canWalletExposeMnemonic,
  canWalletExposePrivateKey,
  getActiveWalletId,
  listWallets,
  removeWallet,
  renameWallet,
  setActiveWalletId,
  type WalletMeta,
} from '../src/services/wallet/storage';
import {
  getAllWalletPortfolios,
  type WalletPortfolioAggregate,
} from '../src/services/wallet/portfolio';
import {
  formatAdaptiveDisplayCurrency,
  formatAdaptiveSignedDisplayCurrency,
} from '../src/ui/currency-format';

import {
  AddWalletIcon,
  ConfirmIcon,
  DeclineIcon,
  OpenDownIcon,
  OpenRightIcon,
} from '../src/ui/ui-icons';

function formatWalletKind(kind: WalletMeta['kind']) {
  if (kind === 'mnemonic') return 'Seed Phrase';
  if (kind === 'private-key') return 'Private Key';
  return 'Watch-Only';
}

const MAX_WALLET_NAME_LENGTH = 18;
const REMOVE_HOLD_MS = 7000;
const REMOVE_DISPLAY_MAX = 114;

export default function WalletsScreen() {
  const router = useRouter();
  const notice = useNotice();
  const { setPendingWalletSelectionId } = useWalletSession();
  const [expandedWalletId, setExpandedWalletId] = useState<string | null>(null);
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [activeWalletId, setActiveWalletIdState] = useState<string | null>(null);
  const [walletList, setWalletList] = useState<WalletMeta[]>([]);
  const [aggregate, setAggregate] = useState<WalletPortfolioAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  useChromeLoading(loading || refreshing);

  const [removalWalletId, setRemovalWalletId] = useState<string | null>(null);
  const [removalProgress, setRemovalProgress] = useState(0);

  const removalStartedAtRef = useRef<number | null>(null);
  const removalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const removalCompletedRef = useRef(false);

  const clearRemovalTimer = useCallback(() => {
    if (removalTimerRef.current) {
      clearInterval(removalTimerRef.current);
      removalTimerRef.current = null;
    }
  }, []);

  const resetRemovalState = useCallback(() => {
    clearRemovalTimer();
    removalStartedAtRef.current = null;
    removalCompletedRef.current = false;
    setRemovalWalletId(null);
    setRemovalProgress(0);
  }, [clearRemovalTimer]);

  const load = useCallback(async () => {
    try {
      if (!aggregate) {
        setLoading(true);
      }

      const [activeId, nextWalletList] = await Promise.all([
        getActiveWalletId(),
        listWallets(),
      ]);

      setActiveWalletIdState(activeId);
      setWalletList(nextWalletList);

      const nextAggregate = await getAllWalletPortfolios();
      setAggregate(nextAggregate);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Wallet manager failed to load.', 2600);
    } finally {
      setLoading(false);
    }
  }, [aggregate, notice]);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    return () => {
      clearRemovalTimer();
    };
  }, [clearRemovalTimer]);

  const aggregateIndex = useMemo(() => {
    return new Map((aggregate?.items ?? []).map((item) => [item.wallet.id, item] as const));
  }, [aggregate?.items]);

  const wallets = useMemo(() => {
    return walletList.reduce<NonNullable<WalletPortfolioAggregate['items'][number]>[]>((acc, wallet) => {
      const item = aggregateIndex.get(wallet.id);
      if (item) {
        acc.push(item);
      }
      return acc;
    }, []);
  }, [aggregateIndex, walletList]);

  const totalDeltaStyle = useMemo(() => {
    if (aggregate?.totalDeltaTone === 'green') return styles.deltaPositive;
    if (aggregate?.totalDeltaTone === 'red') return styles.deltaNegative;
    return styles.deltaNeutral;
  }, [aggregate?.totalDeltaTone]);

  const handleSelectWallet = async (wallet: WalletMeta) => {
    try {
      await setActiveWalletId(wallet.id);
      setPendingWalletSelectionId(wallet.id);
      setActiveWalletIdState(wallet.id);
      notice.showSuccessNotice(`Active wallet: ${wallet.name}`, 2200);
      router.replace('/wallet');
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Wallet selection failed.', 2600);
    }
  };

  const handleRemoveConfirmed = useCallback(
    async (wallet: WalletMeta) => {
      try {
        await removeWallet(wallet.id);

        if (expandedWalletId === wallet.id) {
          setExpandedWalletId(null);
        }

        if (editingWalletId === wallet.id) {
          setEditingWalletId(null);
          setDraftName('');
        }

        resetRemovalState();
        await load();
        notice.showSuccessNotice('Wallet removed from this device.', 2400);
      } catch (error) {
        console.error(error);
        resetRemovalState();
        notice.showErrorNotice('Wallet removal failed.', 2600);
      }
    },
    [editingWalletId, expandedWalletId, load, notice, resetRemovalState]
  );

  const handleRemovePress = useCallback(() => {
    notice.showNeutralNotice('Press and hold to remove this wallet.', 2200);
  }, [notice]);

  const handleRemovePressIn = useCallback(
    (wallet: WalletMeta) => {
      clearRemovalTimer();
      removalCompletedRef.current = false;
      removalStartedAtRef.current = Date.now();
      setRemovalWalletId(wallet.id);
      setRemovalProgress(0);

      removalTimerRef.current = setInterval(() => {
        const startedAt = removalStartedAtRef.current;
        if (!startedAt) return;

        const elapsed = Date.now() - startedAt;
        const fraction = Math.max(0, Math.min(1, elapsed / REMOVE_HOLD_MS));
        const displayProgress = Math.round(fraction * REMOVE_DISPLAY_MAX);

        setRemovalProgress(displayProgress);

        if (fraction >= 1 && !removalCompletedRef.current) {
          removalCompletedRef.current = true;
          clearRemovalTimer();
          void handleRemoveConfirmed(wallet);
        }
      }, 50);
    },
    [clearRemovalTimer, handleRemoveConfirmed]
  );

  const handleRemovePressOut = useCallback(() => {
    if (removalCompletedRef.current) {
      return;
    }

    resetRemovalState();
  }, [resetRemovalState]);

  const handleRenameStart = (wallet: WalletMeta) => {
    resetRemovalState();
    setExpandedWalletId(wallet.id);
    setEditingWalletId(wallet.id);
    setDraftName(wallet.name);
  };

  const handleRenameCancel = () => {
    setEditingWalletId(null);
    setDraftName('');
  };

  const handleRenameSave = async (walletId: string) => {
    const nextName = draftName.trim();

    if (!nextName) {
      notice.showErrorNotice('Wallet name is required.', 2200);
      return;
    }

    if (nextName.length > MAX_WALLET_NAME_LENGTH) {
      notice.showErrorNotice(
        `Wallet name must be ${MAX_WALLET_NAME_LENGTH} characters or less.`,
        2600
      );
      return;
    }

    try {
      const updated = await renameWallet(walletId, nextName);
      setEditingWalletId(null);
      setDraftName('');
      await load();
      notice.showSuccessNotice(`Wallet renamed to ${updated.name}.`, 2400);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Wallet rename failed.', 2600);
    }
  };

  const handleOpenMnemonicExport = async (wallet: WalletMeta) => {
    if (!canWalletExposeMnemonic(wallet)) {
      notice.showErrorNotice('This wallet has no seed phrase to export.', 2400);
      return;
    }

    try {
      await setActiveWalletId(wallet.id);
      setPendingWalletSelectionId(wallet.id);
      setActiveWalletIdState(wallet.id);
      router.push({
        pathname: '/export-mnemonic',
        params: { walletId: wallet.id },
      });
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Seed phrase export failed to open.', 2400);
    }
  };

  const handleOpenPrivateKeyExport = async (wallet: WalletMeta) => {
    if (!canWalletExposePrivateKey(wallet)) {
      notice.showErrorNotice('This wallet has no private key to export.', 2400);
      return;
    }

    try {
      await setActiveWalletId(wallet.id);
      setPendingWalletSelectionId(wallet.id);
      setActiveWalletIdState(wallet.id);
      router.push({
        pathname: '/backup-private-key',
        params: { walletId: wallet.id },
      });
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Private key export failed to open.', 2400);
    }
  };

  if (loading && !aggregate) {
    return <ScreenLoadingState label="Loading wallets..." />;
  }

  return (
    <ProductScreen
      eyebrow="WALLET MANAGEMENT"
      browVariant="back"
      loadingOverlayVisible={refreshing}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
          progressBackgroundColor={colors.bg}
        />
      }
    >
          <View style={styles.summaryCard}>
            <Text style={ui.eyebrow}>Total Assets</Text>
            <Text
              style={styles.summaryValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {aggregate?.totalBalanceDisplay ?? formatAdaptiveDisplayCurrency(0)}
            </Text>
            <Text
              style={[styles.delta, totalDeltaStyle]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {aggregate?.totalDeltaDisplay ??
                `${formatAdaptiveSignedDisplayCurrency(0)} (0.00%)`}
            </Text>
            <Text style={styles.summaryHint}>
              Watch-only wallets are excluded from total balance.
            </Text>
          </View>

          <Text style={[ui.sectionEyebrow, styles.sectionEyebrowOutside]}>Managed Wallets</Text>

          {wallets.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No wallets added</Text>
              <Text style={styles.emptyText}>
                Import or create a wallet to start managing it here.
              </Text>
            </View>
          ) : (
            <View style={styles.walletList}>
              {wallets.map((item) => {
                const wallet = item.wallet;
                const expanded = expandedWalletId === wallet.id;
                const active = activeWalletId === wallet.id;
                const balanceDisplay =
                  item.portfolio?.totalBalanceDisplay ?? formatAdaptiveDisplayCurrency(0);
                const editing = editingWalletId === wallet.id;
                const removing = removalWalletId === wallet.id;
                const removalFillWidth = `${Math.min(
                  100,
                  (removalProgress / REMOVE_DISPLAY_MAX) * 100
                )}%`;
                const removalProgressColor =
                  removalProgress >= REMOVE_DISPLAY_MAX ? colors.white : colors.red;

                return (
                  <View key={wallet.id} style={styles.walletGroup}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[styles.walletRow, active ? styles.walletRowActive : styles.walletRowInactive]}
                      onPress={() => {
                        resetRemovalState();
                        setExpandedWalletId((prev) => (prev === wallet.id ? null : wallet.id));
                        setEditingWalletId((prev) => (prev === wallet.id ? prev : null));
                      }}
                    >
                      <View style={styles.walletText}>
                        <View style={styles.walletTitleRow}>
                          <Text style={ui.actionLabel}>{wallet.name}</Text>
                          {active ? <Text style={styles.activeBadge}>SELECTED</Text> : null}
                        </View>

                          <Text
                            style={styles.meta}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.72}
                          >
                            Balance: {balanceDisplay}
                          </Text>
                        <Text style={styles.meta}>Access: {formatWalletKind(wallet.kind)}</Text>
                        <Text
                          style={styles.address}
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {wallet.address}
                        </Text>
                      </View>

                      {expanded ? (
                        <OpenDownIcon width={22} height={22} />
                      ) : (
                        <OpenRightIcon width={18} height={18} />
                      )}
                    </TouchableOpacity>

                    {expanded ? (
                      <View style={styles.moreBlock}>
                        <StubRow
                          label="Open Wallet"
                          onPress={() => void handleSelectWallet(wallet)}
                        />

                        {editing ? (
                          <View style={styles.renameInlineRow}>
                            <TextInput
                              value={draftName}
                              onChangeText={(value) =>
                                setDraftName(value.slice(0, MAX_WALLET_NAME_LENGTH))
                              }
                              placeholder="Wallet name"
                              placeholderTextColor={colors.textDim}
                              style={styles.renameInput}
                              autoFocus
                              maxLength={MAX_WALLET_NAME_LENGTH}
                              returnKeyType="done"
                              onSubmitEditing={() => void handleRenameSave(wallet.id)}
                            />

                            <TouchableOpacity
                              activeOpacity={0.85}
                              style={styles.renameIconButton}
                              onPress={handleRenameCancel}
                            >
                              <DeclineIcon width={18} height={18} />
                            </TouchableOpacity>

                            <TouchableOpacity
                              activeOpacity={0.85}
                              style={[
                                styles.renameIconButton,
                                !draftName.trim() && styles.renameIconButtonDisabled,
                              ]}
                              onPress={() => void handleRenameSave(wallet.id)}
                            >
                              <ConfirmIcon width={18} height={18} />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <StubRow
                            label="Rename Wallet"
                            onPress={() => handleRenameStart(wallet)}
                          />
                        )}

                        {canWalletExposeMnemonic(wallet) ? (
                          <StubRow
                            label="Export Mnemonic"
                            onPress={() => void handleOpenMnemonicExport(wallet)}
                          />
                        ) : null}

                        {canWalletExposePrivateKey(wallet) ? (
                          <StubRow
                            label="Export Private Key"
                            onPress={() => void handleOpenPrivateKeyExport(wallet)}
                          />
                        ) : null}

                        <StubRow
                          label="Multisig Transactions"
                          onPress={() => router.push('/multisig-transactions')}
                        />

                        <StubRow
                          label="Connections"
                          onPress={() => router.push('/connections')}
                        />

                        <RemoveHoldRow
                          active={removing}
                          progress={removalProgress}
                          fillWidth={removalFillWidth}
                          progressColor={removalProgressColor}
                          onPress={handleRemovePress}
                          onPressIn={() => handleRemovePressIn(wallet)}
                          onPressOut={handleRemovePressOut}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.addWalletRow}
            onPress={() => router.push('/wallet-access')}
          >
            <Text style={ui.actionLabel}>Add Wallet</Text>
            <AddWalletIcon width={20} height={20} />
          </TouchableOpacity>
    </ProductScreen>
  );
}

function StubRow({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.stubRow} onPress={onPress}>
      <Text style={ui.actionLabel}>{label}</Text>
      <OpenRightIcon width={18} height={18} />
    </TouchableOpacity>
  );
}

function RemoveHoldRow({
  active,
  progress,
  fillWidth,
  progressColor,
  onPress,
  onPressIn,
  onPressOut,
}: {
  active: boolean;
  progress: number;
  fillWidth: string;
  progressColor: string;
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  return (
    <Pressable
      style={styles.removeHoldRow}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <>
        {active ? <View style={[styles.removeHoldFill, { width: fillWidth as any }]} /> : null}
        <Text style={[styles.destructiveLabel, active && styles.removeHoldLabelActive]}>
          Remove Wallet
        </Text>
        {active ? (
          <Text style={[styles.removeHoldProgress, { color: progressColor }]}>
            {progress}%
          </Text>
        ) : (
          <OpenRightIcon width={18} height={18} />
        )}
      </>
    </Pressable>
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
    paddingHorizontal: layout.screenPaddingX,
  },

  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    gap: 0,
  },

  summaryCard: {
    backgroundColor: 'rgba(255,105,0,0.06)',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 18,
    gap: 8,
  },

  summaryValue: {
    color: colors.white,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: 'Sora_700Bold',
  },

  delta: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  deltaPositive: {
    color: colors.green,
  },

  deltaNegative: {
    color: colors.red,
  },

  deltaNeutral: {
    color: colors.textDim,
  },

  summaryHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  sectionEyebrowOutside: {
    marginBottom: 12,
  },

  emptyState: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 6,
  },

  emptyTitle: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  walletList: {
    gap: 14,
  },

  walletGroup: {
    gap: 8,
  },

  walletRow: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  walletRowInactive: {
    borderColor: 'rgba(255,105,0,0.14)',
    backgroundColor: 'rgba(255,105,0,0.04)',
  },

  walletRowActive: {
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
  },

  walletText: {
    flex: 1,
    gap: 4,
  },

  walletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  activeBadge: {
    color: colors.green,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  meta: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  address: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  moreBlock: {
    gap: 2,
    paddingHorizontal: 2,
  },

  stubRow: {
    minHeight: 48,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },

  destructiveLabel: {
    color: colors.red,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  renameInlineRow: {
    minHeight: layout.fieldHeight,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  renameInput: {
    flex: 1,
    minHeight: layout.fieldHeight,
    paddingVertical: 0,
    color: colors.white,
    fontFamily: 'Sora_600SemiBold',
  },

  renameIconButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  renameIconButtonDisabled: {
    opacity: 0.35,
  },

  removeHoldRow: {
    minHeight: 48,
    overflow: 'hidden',
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    position: 'relative',
  },

  removeHoldFill: {
    position: 'absolute',
    left: 4,
    bottom: 6,
    height: 1,
    backgroundColor: colors.red,
    opacity: 0.95,
    borderRadius: radius.pill,
  },

  removeHoldLabelActive: {
    color: colors.white,
  },

  removeHoldProgress: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    zIndex: 2,
  },

  addWalletRow: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 20,
  },
});
