import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import {
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { ProductScreen } from '../src/ui/product-shell';
import { goBackOrReplace } from '../src/ui/safe-back';
import { useWalletSession } from '../src/wallet/wallet-session';

import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  getActiveWalletId,
  listWallets,
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

import { AddWalletIcon, OpenRightIcon } from '../src/ui/ui-icons';

const BROW_SELECT_WALLET_CLOSE_SOURCE = require('../assets/icons/ui/brow_select_wallet_close.json');

function formatWalletKind(kind: WalletMeta['kind']) {
  if (kind === 'mnemonic') return 'Seed Phrase';
  if (kind === 'private-key') return 'Private Key';
  return 'Watch-Only';
}

export default function SelectWalletScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const notice = useNotice();
  const { setPendingWalletSelectionId } = useWalletSession();
  const [activeWalletId, setActiveWalletIdState] = useState<string | null>(null);
  const [walletList, setWalletList] = useState<WalletMeta[]>([]);
  const [aggregate, setAggregate] = useState<WalletPortfolioAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  useChromeLoading(loading || refreshing);

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
      notice.showErrorNotice('Wallet list failed to load.', 2600);
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

  if (loading && !aggregate) {
    return <ScreenLoadingState label="Loading wallet selector..." />;
  }

  const handleSelectWallet = async (wallet: WalletMeta) => {
    try {
      await setActiveWalletId(wallet.id);
      setPendingWalletSelectionId(wallet.id);
      setActiveWalletIdState(wallet.id);
      notice.showSuccessNotice(`Active wallet: ${wallet.name}`, 2200);
      goBackOrReplace(router, { pathname, fallback: '/wallet' });
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Wallet selection failed.', 2600);
    }
  };

  return (
    <ProductScreen
      eyebrow="SELECT WALLET"
      browVariant="backLink"
      browLabelPress={() => goBackOrReplace(router, { pathname, fallback: '/wallet' })}
      browLabelAccessoryAnimation={{
        source: BROW_SELECT_WALLET_CLOSE_SOURCE,
        frames: [0, 59],
        staticFrame: 59,
        size: 18,
        speed: 1.35,
      }}
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
              Tap any wallet below to open it immediately.
            </Text>
          </View>

          <Text style={[ui.sectionEyebrow, styles.sectionEyebrowOutside]}>Managed Wallets</Text>

          {wallets.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No wallets available</Text>
              <Text style={styles.emptyText}>
                Add or import a wallet first, then select it here.
              </Text>
            </View>
          ) : (
            <View style={styles.walletList}>
              {wallets.map((item) => {
                const wallet = item.wallet;
                const active = wallet.id === activeWalletId;
                const balanceDisplay =
                  item.portfolio?.totalBalanceDisplay ?? formatAdaptiveDisplayCurrency(0);

                return (
                  <TouchableOpacity
                    key={wallet.id}
                    activeOpacity={0.9}
                    style={[styles.walletRow, active ? styles.walletRowActive : styles.walletRowInactive]}
                    onPress={() => void handleSelectWallet(wallet)}
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

                    <OpenRightIcon width={18} height={18} />
                  </TouchableOpacity>
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
