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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

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
  getAllWalletPortfolios,
  getWalletPortfolio,
  type PortfolioAsset,
} from '../src/services/wallet/portfolio';
import {
  getActiveWallet,
  setActiveWalletId,
  type WalletMeta,
} from '../src/services/wallet/storage';

import OpenDownIcon from '../assets/icons/ui/open_down_btn.svg';
import OpenRightIcon from '../assets/icons/ui/open_right_btn.svg';

type WalletSwitcherItem = {
  id: string;
  name: string;
  address: string;
  kind: WalletMeta['kind'];
  balanceDisplay: string;
};

function getNonZeroAssets(assets: PortfolioAsset[]) {
  return assets.filter((asset) => {
    if (!Number.isFinite(asset.amount)) return false;
    return asset.amount > 0;
  });
}

function sortSendableAssets(assets: PortfolioAsset[]) {
  return [...assets].sort((a, b) => {
    if (b.valueInUsd !== a.valueInUsd) {
      return b.valueInUsd - a.valueInUsd;
    }

    if (b.amount !== a.amount) {
      return b.amount - a.amount;
    }

    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

export default function SendSelectTokenScreen() {
  const router = useRouter();
  const notice = useNotice();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    address?: string | string[];
    contactName?: string | string[];
  }>();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletOptionsOpen, setWalletOptionsOpen] = useState(false);
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);
  const [activeWalletIdValue, setActiveWalletIdValue] = useState<string | null>(null);
  const [walletName, setWalletName] = useState('');
  const [walletBalance, setWalletBalance] = useState('$0.00');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletChoices, setWalletChoices] = useState<WalletSwitcherItem[]>([]);
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [errorText, setErrorText] = useState('');

  const prefillAddress =
    typeof params.address === 'string'
      ? params.address.trim()
      : Array.isArray(params.address)
        ? String(params.address[0] || '').trim()
        : '';

  const contactName =
    typeof params.contactName === 'string'
      ? params.contactName.trim()
      : Array.isArray(params.contactName)
        ? String(params.contactName[0] || '').trim()
        : '';

  const contentBottomInset = 44 + Math.max(insets.bottom, 6);

  const load = useCallback(async (options?: { force?: boolean; preserveWalletMenu?: boolean }) => {
    try {
      setLoading(true);
      setErrorText('');

      const [wallet, aggregate] = await Promise.all([
        getActiveWallet(),
        getAllWalletPortfolios({ force: Boolean(options?.force) }),
      ]);

      if (!wallet) {
        throw new Error('No active wallet selected.');
      }

      const portfolio = await getWalletPortfolio(wallet.address, {
        force: Boolean(options?.force),
      });

      const sendableAssets = sortSendableAssets(getNonZeroAssets(portfolio.assets));
      const fullAccessWallets = aggregate.items
        .filter((item) => item.wallet.kind !== 'watch-only')
        .map((item) => ({
          id: item.wallet.id,
          name: item.wallet.name,
          address: item.wallet.address,
          kind: item.wallet.kind,
          balanceDisplay: item.portfolio?.totalBalanceDisplay ?? '$0.00',
        }));

      setActiveWalletIdValue(wallet.id);
      setWalletName(wallet.name);
      setWalletBalance(portfolio.totalBalanceDisplay ?? '$0.00');
      setWalletAddress(wallet.address);
      setWalletChoices(fullAccessWallets);
      setAssets(sendableAssets);

      if (!options?.preserveWalletMenu) {
        setWalletOptionsOpen(false);
      }
    } catch (error) {
      console.error(error);
      setActiveWalletIdValue(null);
      setWalletName('');
      setWalletBalance('$0.00');
      setWalletAddress('');
      setWalletChoices([]);
      setAssets([]);
      setErrorText(error instanceof Error ? error.message : 'Failed to load sendable assets.');
      notice.showErrorNotice('Failed to load sendable assets.', 2400);
    } finally {
      setLoading(false);
    }
  }, [notice]);

  useFocusEffect(
    useCallback(() => {
      notice.showNeutralNotice(subtitleText, 2200);
      void load();
    }, [load, notice, subtitleText])
  );

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load({ force: true, preserveWalletMenu: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const subtitleText = useMemo(() => {
    if (contactName && prefillAddress) {
      return `Recipient: ${contactName}`;
    }

    if (prefillAddress) {
      return 'Recipient address detected';
    }

    return 'Choose asset to send';
  }, [contactName, prefillAddress]);

  const visibleWalletChoices = useMemo(
    () => walletChoices.filter((wallet) => wallet.id !== activeWalletIdValue),
    [activeWalletIdValue, walletChoices]
  );

  const handleSelectAsset = useCallback(
    (asset: PortfolioAsset) => {
      router.push({
        pathname: '/send',
        params: {
          tokenId: asset.id,
          ...(prefillAddress ? { address: prefillAddress } : {}),
          ...(contactName ? { contactName } : {}),
        },
      } as any);
    },
    [contactName, prefillAddress, router]
  );

  const handleToggleWalletOptions = useCallback(() => {
    if (visibleWalletChoices.length <= 0) {
      notice.showNeutralNotice('No other full-access wallets available.', 2200);
      return;
    }

    setWalletOptionsOpen((prev) => !prev);
  }, [notice, visibleWalletChoices.length]);

  const handleChooseWallet = useCallback(
    async (wallet: WalletSwitcherItem) => {
      if (wallet.id === activeWalletIdValue) {
        setWalletOptionsOpen(false);
        return;
      }

      try {
        setSwitchingWalletId(wallet.id);
        await setActiveWalletId(wallet.id);
        await load({ force: true });
        notice.showSuccessNotice(`From wallet: ${wallet.name}`, 2200);
      } catch (error) {
        console.error(error);
        notice.showErrorNotice('Failed to switch from wallet.', 2400);
      } finally {
        setSwitchingWalletId(null);
      }
    },
    [activeWalletIdValue, load, notice]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader
            onMenuPress={() => setMenuOpen(true)}
            onSearchPress={() => router.push('/search-lab')}
          />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
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
          <SubmenuHeader title="SELECT TOKEN" onBack={() => router.back()} />

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : errorText ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{errorText}</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.walletCard,
                  walletOptionsOpen ? styles.walletCardOpen : styles.walletCardClosed,
                ]}
                onPress={handleToggleWalletOptions}
              >
                <View style={styles.walletCardText}>
                  <View style={styles.walletTitleRow}>
                    <Text style={styles.walletName}>{walletName}</Text>
                    {activeWalletIdValue ? <Text style={styles.activeBadge}>ACTIVE</Text> : null}
                  </View>

                  <Text style={styles.walletBalance}>Balance: {walletBalance}</Text>
                  <Text style={styles.walletAddress}>
                    {walletAddress}
                  </Text>
                </View>

                {walletOptionsOpen ? (
                  <OpenDownIcon width={22} height={22} />
                ) : (
                  <OpenRightIcon width={18} height={18} />
                )}
              </TouchableOpacity>

              {walletOptionsOpen ? (
                <View style={styles.walletOptionsList}>
                  {visibleWalletChoices.map((wallet) => {
                    const active = wallet.id === activeWalletIdValue;
                    const switching = wallet.id === switchingWalletId;

                    return (
                      <TouchableOpacity
                        key={wallet.id}
                        activeOpacity={0.9}
                        style={[
                          styles.walletOptionRow,
                          active ? styles.walletOptionRowActive : styles.walletOptionRowInactive,
                        ]}
                        onPress={() => void handleChooseWallet(wallet)}
                      >
                        <View style={styles.walletOptionText}>
                          <View style={styles.walletTitleRow}>
                            <Text style={ui.actionLabel}>{wallet.name}</Text>
                            {active ? <Text style={styles.activeBadge}>ACTIVE</Text> : null}
                          </View>

                          <Text style={styles.optionBalance}>Balance: {wallet.balanceDisplay}</Text>
                          <Text style={styles.optionAddress}>
                            {wallet.address}
                          </Text>
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

              <View style={styles.sectionHeader}>
                <Text style={[ui.sectionEyebrow, styles.sectionEyebrow]}>
                  Available Tokens
                </Text>
                <Text style={styles.sectionMeta}>{assets.length}</Text>
              </View>

              {assets.length > 0 ? (
                <View style={styles.assetList}>
                  {assets.map((asset) => (
                    <TouchableOpacity
                      key={asset.id}
                      activeOpacity={0.9}
                      style={styles.assetRow}
                      onPress={() => handleSelectAsset(asset)}
                    >
                      <View style={styles.assetLeft}>
                        {asset.logo ? (
                          <Image
                            source={{ uri: asset.logo }}
                            style={styles.assetLogo}
                            contentFit="contain"
                          />
                        ) : (
                          <View style={styles.assetFallbackLogo}>
                            <Text style={styles.assetFallbackText}>
                              {asset.symbol.slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                        )}

                        <View style={styles.assetMeta}>
                          <Text style={styles.assetName}>{asset.name}</Text>
                          <Text style={styles.assetAmount}>
                            {asset.symbol}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.assetRight}>
                        <Text style={styles.assetValue}>{asset.valueDisplay}</Text>
                        <Text style={styles.assetAction}>{asset.amountDisplay}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No sendable tokens</Text>
                  <Text style={styles.emptyText}>
                    The active wallet has no asset with non-zero balance.
                  </Text>
                </View>
              )}
            </>
          )}
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

  loadingWrap: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorWrap: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorText: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },

  walletCard: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },

  walletCardClosed: {
    borderColor: 'rgba(255,105,0,0.14)',
    backgroundColor: 'rgba(255,105,0,0.04)',
  },

  walletCardOpen: {
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
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

  walletBalance: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  activeBadge: {
    color: colors.green,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  walletOptionRowInactive: {
    borderColor: 'rgba(255,105,0,0.14)',
    backgroundColor: 'rgba(255,105,0,0.04)',
  },

  walletOptionRowActive: {
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
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

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  sectionEyebrow: {
    marginBottom: 0,
  },

  sectionMeta: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  assetList: {
    gap: 10,
  },

  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 72,
  },

  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 12,
  },

  assetLogo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  assetFallbackLogo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,105,0,0.12)',
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },

  assetFallbackText: {
    color: colors.accent,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  assetMeta: {
    flex: 1,
    gap: 4,
  },

  assetName: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  assetAmount: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  assetRight: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },

  assetValue: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  assetAction: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  emptyState: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 6,
  },

  emptyTitle: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
});
