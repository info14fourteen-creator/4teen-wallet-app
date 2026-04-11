import { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  removeWallet,
  renameWallet,
  setActiveWalletId,
  type WalletMeta,
} from '../src/services/wallet/storage';
import {
  getAllWalletPortfolios,
  type WalletPortfolioAggregate,
} from '../src/services/wallet/portfolio';
import { FOOTER_NAV_RESERVED_SPACE } from '../src/ui/footer-nav';

import AddWalletIcon from '../assets/icons/ui/add_wallet_btn.svg';
import OpenDownIcon from '../assets/icons/ui/open_down_btn.svg';
import OpenRightIcon from '../assets/icons/ui/open_right_btn.svg';

function formatWalletKind(kind: WalletMeta['kind']) {
  if (kind === 'mnemonic') return 'Seed Phrase';
  if (kind === 'private-key') return 'Private Key';
  return 'Watch-Only';
}

export default function WalletsScreen() {
  const router = useRouter();
  const notice = useNotice();
  const insets = useSafeAreaInsets();

  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedWalletId, setExpandedWalletId] = useState<string | null>(null);
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [activeWalletId, setActiveWalletIdState] = useState<string | null>(null);
  const [aggregate, setAggregate] = useState<WalletPortfolioAggregate | null>(null);

  const contentBottomInset =
    FOOTER_NAV_RESERVED_SPACE + Math.max(insets.bottom, 6) + spacing[4];

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
      notice.showErrorNotice('Failed to load wallet management.', 2600);
    }
  }, [notice]);

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

  const handleRemoveWallet = (wallet: WalletMeta) => {
    notice.showAckNotice(
      `Remove "${wallet.name}" from this device?`,
      [
        {
          label: 'Remove',
          onPress: () => {
            void (async () => {
              try {
                await removeWallet(wallet.id);

                if (expandedWalletId === wallet.id) {
                  setExpandedWalletId(null);
                }

                if (editingWalletId === wallet.id) {
                  setEditingWalletId(null);
                  setDraftName('');
                }

                await load();
                notice.showSuccessNotice('Wallet removed from this device.', 2400);
              } catch (error) {
                console.error(error);
                notice.showErrorNotice('Failed to remove wallet.', 2600);
              }
            })();
          },
        },
        {
          label: 'Cancel',
          onPress: () => {},
        },
      ],
      'error'
    );
  };

  const handleRenamePrompt = (wallet: WalletMeta) => {
    notice.showAckNotice(
      `Change wallet name for "${wallet.name}"?`,
      [
        {
          label: 'Change',
          onPress: () => {
            setExpandedWalletId(wallet.id);
            setEditingWalletId(wallet.id);
            setDraftName(wallet.name);
          },
        },
        {
          label: 'Cancel',
          onPress: () => {},
        },
      ],
      'neutral'
    );
  };

  const handleRenameSave = async (walletId: string) => {
    const nextName = draftName.trim();

    if (!nextName) {
      notice.showErrorNotice('Wallet name is required.', 2200);
      return;
    }

    try {
      const updated = await renameWallet(walletId, nextName);
      setEditingWalletId(null);
      setDraftName('');
      await load();
      notice.showSuccessNotice(`Wallet renamed: ${updated.name}`, 2400);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to rename wallet.', 2600);
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
          bounces={false}
        >
          <SubmenuHeader title="WALLET MANAGEMENT" onBack={() => router.back()} />

          <View style={styles.summaryCard}>
            <Text style={ui.eyebrow}>Total Assets</Text>
            <Text style={styles.summaryValue}>
              {aggregate?.totalBalanceDisplay ?? '$0.00'}
            </Text>
            <Text style={[styles.delta, totalDeltaStyle]}>
              {aggregate?.totalDeltaDisplay ?? '$0.00 (0.00%)'}
            </Text>
            <Text style={styles.summaryHint}>
              Watch-only wallets are excluded from total balance.
            </Text>
          </View>

          <View style={styles.block}>
            <Text style={ui.sectionEyebrow}>Wallets</Text>

            {wallets.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No wallets added</Text>
                <Text style={styles.emptyText}>
                  Import or create a wallet to start managing it here.
                </Text>
              </View>
            ) : (
              wallets.map((item) => {
                const wallet = item.wallet;
                const expanded = expandedWalletId === wallet.id;
                const active = activeWalletId === wallet.id;
                const balanceDisplay = item.portfolio?.totalBalanceDisplay ?? '$0.00';
                const editing = editingWalletId === wallet.id;

                return (
                  <View key={wallet.id} style={styles.walletGroup}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[styles.walletRow, active && styles.walletRowActive]}
                      onPress={() =>
                        setExpandedWalletId((prev) => (prev === wallet.id ? null : wallet.id))
                      }
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

                      {expanded ? (
                        <OpenDownIcon width={22} height={22} />
                      ) : (
                        <OpenRightIcon width={18} height={18} />
                      )}
                    </TouchableOpacity>

                    {expanded ? (
                      <View style={styles.moreBlock}>
                        <Text style={ui.sectionEyebrow}>More</Text>

                        <StubRow
                          label="Select Wallet"
                          onPress={() => void handleSelectWallet(wallet)}
                        />

                        <StubRow
                          label="Wallet Name"
                          onPress={() => handleRenamePrompt(wallet)}
                        />

                        {editing ? (
                          <View style={styles.renameCard}>
                            <TextInput
                              value={draftName}
                              onChangeText={setDraftName}
                              placeholder="Wallet name"
                              placeholderTextColor={colors.textDim}
                              style={styles.renameInput}
                            />

                            <View style={styles.renameActions}>
                              <TouchableOpacity
                                activeOpacity={0.9}
                                style={styles.renameSaveButton}
                                onPress={() => void handleRenameSave(wallet.id)}
                              >
                                <Text style={styles.renameSaveText}>Save</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                activeOpacity={0.9}
                                style={styles.renameCancelButton}
                                onPress={() => {
                                  setEditingWalletId(null);
                                  setDraftName('');
                                }}
                              >
                                <Text style={styles.renameCancelText}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : null}

                        <StubRow
                          label="Back Up Private Key"
                          onPress={() =>
                            notice.showNeutralNotice('Backup flow is not wired yet.', 2200)
                          }
                        />
                        <StubRow
                          label="Multisig Transactions"
                          onPress={() =>
                            notice.showNeutralNotice('Multisig flow is not wired yet.', 2200)
                          }
                        />
                        <StubRow
                          label="Connections"
                          onPress={() =>
                            notice.showNeutralNotice('Connections flow is not wired yet.', 2200)
                          }
                        />

                        <TouchableOpacity
                          activeOpacity={0.9}
                          style={styles.removeButton}
                          onPress={() => handleRemoveWallet(wallet)}
                        >
                          <Text style={styles.removeButtonText}>Remove Wallet</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.addWalletRow}
              onPress={() => router.push('/ui-lab')}
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

  block: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 16,
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

  walletGroup: {
    gap: 10,
  },

  walletRow: {
    minHeight: 86,
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

  moreBlock: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    padding: 12,
    gap: 10,
  },

  stubRow: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  renameCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    padding: 12,
    gap: 10,
  },

  renameInput: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    color: colors.white,
    fontFamily: 'Sora_600SemiBold',
  },

  renameActions: {
    flexDirection: 'row',
    gap: 10,
  },

  renameSaveButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  renameSaveText: {
    color: colors.bg,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  renameCancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  renameCancelText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  removeButton: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.35)',
    backgroundColor: 'rgba(255,77,77,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  removeButtonText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
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
    marginTop: 4,
  },
});
