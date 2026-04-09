import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import SubmenuHeader from '../src/ui/submenu-header';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  getActiveWalletId,
  listWallets,
  setActiveWalletId,
  type WalletMeta,
} from '../src/services/wallet/storage';

import AddWalletIcon from '../assets/icons/ui/add_wallet_btn.svg';
import OpenRightIcon from '../assets/icons/ui/open_right_btn.svg';

function formatKind(value: WalletMeta['kind']) {
  if (value === 'mnemonic') return 'Seed Phrase';
  if (value === 'private-key') return 'Private Key';
  return 'Watch-Only';
}

export default function SelectWalletScreen() {
  const router = useRouter();
  const notice = useNotice();

  const [menuOpen, setMenuOpen] = useState(false);
  const [wallets, setWallets] = useState<WalletMeta[]>([]);
  const [activeWalletId, setActiveWalletIdState] = useState<string | null>(null);

  const loadWallets = useCallback(async () => {
    try {
      const [items, activeId] = await Promise.all([
        listWallets(),
        getActiveWalletId(),
      ]);

      setWallets(items);
      setActiveWalletIdState(activeId);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to load wallets.', 2600);
    }
  }, [notice]);

  useFocusEffect(
    useCallback(() => {
      void loadWallets();
    }, [loadWallets])
  );

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
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <SubmenuHeader title="SELECT WALLET" onBack={() => router.back()} />

          <View style={styles.summaryCard}>
            <Text style={ui.eyebrow}>Available Wallets</Text>
            <Text style={styles.summaryValue}>{wallets.length}</Text>
            <Text style={styles.delta}>
              {wallets.length > 0
                ? 'Tap a wallet to make it active'
                : 'No wallets available yet'}
            </Text>
          </View>

          <View style={styles.block}>
            <Text style={ui.sectionEyebrow}>Wallet List</Text>

            {wallets.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No wallets available</Text>
                <Text style={styles.emptyText}>
                  Add or import a wallet first, then select it here.
                </Text>
              </View>
            ) : (
              <View style={styles.walletList}>
                {wallets.map((wallet) => {
                  const active = wallet.id === activeWalletId;

                  return (
                    <TouchableOpacity
                      key={wallet.id}
                      activeOpacity={0.9}
                      style={[styles.walletRow, active && styles.walletRowActive]}
                      onPress={() => void handleSelectWallet(wallet)}
                    >
                      <View style={styles.walletText}>
                        <View style={styles.walletTitleRow}>
                          <Text style={styles.walletName}>{wallet.name}</Text>
                          {active ? <Text style={styles.activeBadge}>ACTIVE</Text> : null}
                        </View>

                        <Text style={styles.walletAddress} numberOfLines={1} ellipsizeMode="middle">
                          {wallet.address}
                        </Text>

                        <Text style={styles.meta}>{formatKind(wallet.kind)}</Text>
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
              onPress={() => router.push('/import-wallet')}
            >
              <Text style={ui.actionLabel}>Add Wallet</Text>
              <AddWalletIcon width={20} height={20} />
            </TouchableOpacity>
          </View>
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
  },

  content: {
    paddingTop: 14,
    paddingBottom: spacing[7],
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
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  block: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 18,
    gap: 12,
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
    gap: 12,
  },

  walletRow: {
    minHeight: 82,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  walletRowActive: {
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.05)',
  },

  walletText: {
    flex: 1,
    gap: 6,
  },

  walletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  walletName: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  activeBadge: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
  },

  walletAddress: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  meta: {
    color: colors.textDim,
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
  },
});
