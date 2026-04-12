import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import SubmenuHeader from '../src/ui/submenu-header';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  getActiveWalletId,
  setActiveWalletId,
  type WalletMeta,
} from '../src/services/wallet/storage';
import {
  getAllWalletPortfolios,
  type WalletPortfolioAggregate,
} from '../src/services/wallet/portfolio';

import AddWalletIcon from '../assets/icons/ui/add_wallet_btn.svg';
import OpenRightIcon from '../assets/icons/ui/open_right_btn.svg';

function formatWalletKind(kind: WalletMeta['kind']) {
  if (kind === 'mnemonic') return 'Seed Phrase';
  if (kind === 'private-key') return 'Private Key';
  return 'Watch-Only';
}

export default function SelectWalletScreen() {
  const router = useRouter();
  const notice = useNotice();
  const insets = useSafeAreaInsets();

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeWalletId, setActiveWalletIdState] = useState<string | null>(null);
  const [aggregate, setAggregate] = useState<WalletPortfolioAggregate | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const contentBottomInset = 44 + Math.max(insets.bottom, 6);

  const load = useCallback(async () => {
    try {
      const [activeId, nextAggregate] = await Promise.all([
        getActiveWalletId(),
        getAllWalletPortfolios(),
      ]);

      setActiveWalletIdState(activeId);
      setAggregate(nextAggregate);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to load wallets.', 2600);
    }
  }, [notice]);

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

  const wallets = aggregate?.items ?? [];

  const totalDeltaStyle = useMemo(() => {
    if (aggregate?.totalDeltaTone === 'green') return styles.deltaPositive;
    if (aggregate?.totalDeltaTone === 'red') return styles.deltaNegative;
    return styles.deltaNeutral;
  }, [aggregate?.totalDeltaTone]);

  const handleSelectWallet = async (wallet: WalletMeta) => {
    try {
      await setActiveWalletId(wallet.id);
      setActiveWalletIdState(wallet.id);
      notice.showSuccessNotice(`Selected: ${wallet.name}`, 2200);
      router.replace('/home');
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to select wallet.', 2600);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
          bounces
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
          <SubmenuHeader title="SELECT WALLET" onBack={() => router.back()} />

          <View style={styles.summaryCard}>
            <Text style={ui.eyebrow}>Total Assets</Text>
            <Text style={styles.summaryValue}>
              {aggregate?.totalBalanceDisplay ?? '$0.00'}
            </Text>
            <Text style={[styles.delta, totalDeltaStyle]}>
              {aggregate?.totalDeltaDisplay ?? '$0.00 (0.00%)'}
            </Text>
            <Text style={styles.summaryHint}>
              Tap any wallet below to open it immediately.
            </Text>
          </View>

          <Text style={[ui.sectionEyebrow, styles.sectionEyebrowOutside]}>
            Select Wallet
          </Text>

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
                const balanceDisplay = item.portfolio?.totalBalanceDisplay ?? '$0.00';

                return (
                  <TouchableOpacity
                    key={wallet.id}
                    activeOpacity={0.9}
                    style={[styles.walletRow, active && styles.walletRowActive]}
                    onPress={() => void handleSelectWallet(wallet)}
                  >
                    <View style={styles.walletText}>
                      <View style={styles.walletTitleRow}>
                        <Text style={ui.actionLabel}>{wallet.name}</Text>
                        {active ? <Text style={styles.activeBadge}>ACTIVE</Text> : null}
                      </View>

                      <Text style={styles.meta}>Balance: {balanceDisplay}</Text>
                      <Text style={styles.meta}>Type: {formatWalletKind(wallet.kind)}</Text>
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
            onPress={() => router.push('/ui-lab')}
          >
            <Text style={ui.actionLabel}>Add Wallet</Text>
            <AddWalletIcon width={20} height={20} />
          </TouchableOpacity>
        </ScrollView>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      </View>
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
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: APP_HEADER_TOP_PADDING,
  },

  headerSlot: {
    height: APP_HEADER_HEIGHT,
    justifyContent: 'center',
  },

  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    paddingTop: 14,
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
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  walletRowActive: {
    borderColor: 'rgba(255,105,0,0.16)',
    backgroundColor: 'rgba(255,105,0,0.03)',
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
    color: colors.accent,
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
