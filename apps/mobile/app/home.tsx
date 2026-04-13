import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import AddressQrModal from '../src/ui/address-qr-modal';
import { colors, layout, spacing } from '../src/theme/tokens';
import { useNotice } from '../src/notice/notice-provider';
import {
  getActiveWalletId,
  setActiveWalletId,
  type WalletMeta,
} from '../src/services/wallet/storage';
import {
  getAllWalletPortfolios,
  getWalletPortfolio,
  type PortfolioAsset,
  type WalletPortfolioAggregate,
  type WalletPortfolioSnapshot,
} from '../src/services/wallet/portfolio';

import OpenRightIcon from '../assets/icons/ui/open_right_btn.svg';
import WatchOnlyIcon from '../assets/icons/ui/watch_only_btn.svg';
import FullAccessIcon from '../assets/icons/ui/full_access_btn.svg';
import CopyIcon from '../assets/icons/ui/copy_btn.svg';
import QrIcon from '../assets/icons/ui/qr_btn.svg';
import SettingsMiniIcon from '../assets/icons/ui/setings_btn.svg';
import PreferencesIcon from '../assets/icons/ui/preferences_btn.svg';
import AddWalletIcon from '../assets/icons/ui/add_wallet_btn.svg';

const ASSET_SKELETON_ROWS = 4;

export default function HomeScreen() {
  const router = useRouter();
  const notice = useNotice();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const pagerRef = useRef<ScrollView>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [qrWallet, setQrWallet] = useState<WalletMeta | null>(null);
  const [aggregate, setAggregate] = useState<WalletPortfolioAggregate | null>(null);
  const [activeWallet, setActiveWallet] = useState<WalletMeta | null>(null);
  const [portfolio, setPortfolio] = useState<WalletPortfolioSnapshot | null>(null);
  const [portfolioCache, setPortfolioCache] = useState<Record<string, WalletPortfolioSnapshot>>({});
  const [portfolioLoadingWalletId, setPortfolioLoadingWalletId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [assetSortMode, setAssetSortMode] = useState<'name' | 'value'>('name');

  const cardWidth = Math.max(width - layout.screenPaddingX * 2, 1);
  const contentBottomInset = 44 + Math.max(insets.bottom, 6);

  const walletCards = useMemo(() => aggregate?.items ?? [], [aggregate]);

  const showWatchOnlyNotice = useCallback(() => {
    notice.showSuccessNotice(
      'Watch-only wallet. You can view balances and assets here, but sending, signing, and full wallet actions are disabled.',
      3200
    );
  }, [notice]);

  const handleCopyAddress = useCallback(
    async (address?: string) => {
      if (!address) return;
      await Clipboard.setStringAsync(address);
      notice.showSuccessNotice('Wallet address copied.', 2200);
    },
    [notice]
  );

  const openQrModal = useCallback(
    (wallet?: WalletMeta | null) => {
      if (!wallet?.address) return;
      notice.hideNotice();
      setQrWallet(wallet);
      setQrVisible(true);
    },
    [notice]
  );

  const closeQrModal = useCallback(() => {
    setQrVisible(false);
  }, []);

  const handleCopyQrAddress = useCallback(async () => {
    if (!qrWallet?.address) return;
    await Clipboard.setStringAsync(qrWallet.address);
    notice.showSuccessNotice('Wallet address copied.', 2200);
  }, [notice, qrWallet?.address]);

  const load = useCallback(
    async (preferredWalletId?: string) => {
      try {
        setLoading(true);
        setErrorText('');

        const [nextAggregate, storedActiveWalletId] = await Promise.all([
          getAllWalletPortfolios(),
          getActiveWalletId(),
        ]);

        setAggregate(nextAggregate);

        const nextCacheFromAggregate = (nextAggregate?.items ?? []).reduce<Record<string, WalletPortfolioSnapshot>>(
          (acc, item) => {
            if (item.portfolio) {
              acc[item.wallet.id] = item.portfolio;
            }
            return acc;
          },
          {}
        );

        setPortfolioCache((prev) => ({
          ...prev,
          ...nextCacheFromAggregate,
        }));

        const items = nextAggregate?.items ?? [];
        if (items.length === 0) {
          setActiveWallet(null);
          setPortfolio(null);
          setPortfolioLoadingWalletId(null);
          setCurrentCardIndex(0);
          return;
        }

        const resolvedActiveWalletId =
          preferredWalletId ??
          storedActiveWalletId ??
          items[0]?.wallet.id ??
          null;

        const nextIndex = Math.max(
          0,
          items.findIndex((item) => item.wallet.id === resolvedActiveWalletId)
        );

        const nextActiveItem = items[nextIndex] ?? items[0];
        const nextActiveWallet = nextActiveItem.wallet;

        setActiveWallet(nextActiveWallet);
        setCurrentCardIndex(nextIndex);

        if (nextActiveItem.portfolio) {
          setPortfolio(nextActiveItem.portfolio);
          setPortfolioLoadingWalletId(null);
          return;
        }

        setPortfolioLoadingWalletId(nextActiveWallet.id);

        const nextPortfolio = await getWalletPortfolio(nextActiveWallet.address);
        setPortfolio(nextPortfolio);
        setPortfolioLoadingWalletId(null);

        setPortfolioCache((prev) => ({
          ...prev,
          [nextActiveWallet.id]: nextPortfolio,
        }));
      } catch (error) {
        console.error(error);
        setPortfolio(null);
        setPortfolioLoadingWalletId(null);
        setErrorText('Failed to load wallet data.');
        notice.showErrorNotice('Failed to load wallet data.', 2600);
      } finally {
        setLoading(false);
      }
    },
    [notice]
  );

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load(activeWallet?.id);
    } finally {
      setRefreshing(false);
    }
  }, [activeWallet?.id, load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    pagerRef.current?.scrollTo({
      x: currentCardIndex * cardWidth,
      animated: false,
    });
  }, [cardWidth, currentCardIndex]);

  const handleWalletCardSnap = useCallback(
    async (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / cardWidth);
      const nextItem = walletCards[nextIndex];

      if (!nextItem) return;

      setCurrentCardIndex(nextIndex);

      if (nextItem.wallet.id === activeWallet?.id) {
        return;
      }

      try {
        await setActiveWalletId(nextItem.wallet.id);
        setActiveWallet(nextItem.wallet);

        const cached = portfolioCache[nextItem.wallet.id] ?? nextItem.portfolio ?? null;

        if (cached) {
          setPortfolio(cached);
          setPortfolioLoadingWalletId(null);

          setPortfolioCache((prev) => ({
            ...prev,
            [nextItem.wallet.id]: cached,
          }));
          return;
        }

        setPortfolio(null);
        setPortfolioLoadingWalletId(nextItem.wallet.id);

        const nextPortfolio = await getWalletPortfolio(nextItem.wallet.address);
        setPortfolio(nextPortfolio);
        setPortfolioLoadingWalletId(null);

        setPortfolioCache((prev) => ({
          ...prev,
          [nextItem.wallet.id]: nextPortfolio,
        }));
      } catch (error) {
        console.error(error);
        setPortfolioLoadingWalletId(null);
        notice.showErrorNotice('Failed to switch wallet.', 2400);
      }
    },
    [activeWallet?.id, cardWidth, notice, portfolioCache, walletCards]
  );

  const handleWalletAssetPress = useCallback(() => {
    router.push('/select-wallet');
  }, [router]);

  const handleHomeAction = useCallback(
    (label: string) => {
      if (label === 'Receive') {
        if (activeWallet?.kind === 'watch-only') {
          notice.showErrorNotice(
            'Make sure you have full access to this wallet. You will not be able to send anything from a watch-only wallet.',
            3200
          );
          return;
        }

        openQrModal(activeWallet);
        return;
      }

      if (activeWallet?.kind === 'watch-only' && label === 'Send') {
        showWatchOnlyNotice();
        return;
      }

      notice.showNeutralNotice(`${label} is coming soon.`, 2200);
    },
    [activeWallet, notice, openQrModal, showWatchOnlyNotice]
  );

  const handleOpenToken = useCallback(
    (asset: PortfolioAsset) => {
      router.push({
        pathname: '/token-details',
        params: {
          tokenId: asset.id,
        },
      });
    },
    [router]
  );

  const sortedAssets = useMemo(() => {
    const assets: PortfolioAsset[] = portfolio?.assets ?? [];
    const next = [...assets];

    if (assetSortMode === 'value') {
      next.sort((a, b) => {
        if (b.valueInUsd !== a.valueInUsd) return b.valueInUsd - a.valueInUsd;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      return next;
    }

    next.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
    return next;
  }, [assetSortMode, portfolio]);

  const handleToggleAssetSort = useCallback(() => {
    setAssetSortMode((prev) => {
      const next = prev === 'name' ? 'value' : 'name';
      notice.showNeutralNotice(
        next === 'name' ? 'Assets are now sorted by name.' : 'Assets are now sorted by value.',
        1800
      );
      return next;
    });
  }, [notice]);

  const isInitialScreenLoading = loading && !aggregate;
  const isActivePortfolioLoading =
    Boolean(activeWallet?.id) && portfolioLoadingWalletId === activeWallet?.id;

  if (isInitialScreenLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.screenLoaderWrap}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

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
          <View style={styles.walletAssetRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.walletAssetMainButton}
              onPress={handleWalletAssetPress}
            >
              <Text style={styles.walletAssetEyebrow}>WALLET ASSET</Text>
              <OpenRightIcon width={18} height={18} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.walletAssetAddButton}
              onPress={() => router.push('/ui-lab')}
            >
              <AddWalletIcon width={16} height={16} />
            </TouchableOpacity>
          </View>

          {walletCards.length > 0 ? (
            <View style={styles.walletCardSection}>
              <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={false}
                overScrollMode="never"
                onMomentumScrollEnd={handleWalletCardSnap}
                contentContainerStyle={styles.walletPagerContent}
              >
                {walletCards.map((item) => {
                  const wallet = item.wallet;
                  const isActive = wallet.id === activeWallet?.id;

                  const fallbackPortfolio = portfolioCache[wallet.id] ?? item.portfolio ?? null;
                  const visiblePortfolio = isActive ? portfolio : fallbackPortfolio;

                  const balanceDisplay = visiblePortfolio?.totalBalanceDisplay ?? '$0.00';
                  const deltaDisplay = visiblePortfolio?.totalDeltaDisplay ?? '$0.00 (0.00%)';
                  const deltaTone = visiblePortfolio?.totalDeltaTone ?? 'dim';

                  return (
                    <View key={wallet.id} style={[styles.walletCardPage, { width: cardWidth }]}>
                      <View style={styles.walletCard}>
                        <View style={styles.walletNameRow}>
                          <Text style={styles.walletName}>{wallet.name}</Text>

                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={styles.watchOnlyButton}
                            onPress={wallet.kind === 'watch-only' ? showWatchOnlyNotice : undefined}
                          >
                            {wallet.kind === 'watch-only' ? (
                              <WatchOnlyIcon width={18} height={18} />
                            ) : (
                              <FullAccessIcon width={18} height={18} />
                            )}
                          </TouchableOpacity>
                        </View>

                        <View style={styles.addressRow}>
                          <Text style={styles.walletAddress} numberOfLines={1} ellipsizeMode="middle">
                            {wallet.address}
                          </Text>

                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => void handleCopyAddress(wallet.address)}
                            style={styles.iconActionButton}
                          >
                            <CopyIcon width={18} height={18} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => openQrModal(wallet)}
                            style={styles.iconActionButton}
                          >
                            <QrIcon width={18} height={18} />
                          </TouchableOpacity>
                        </View>

                        <View style={styles.balanceBlock}>
                          {isActive && isActivePortfolioLoading ? (
                            <View style={styles.balanceLoaderWrap}>
                              <ActivityIndicator color={colors.accent} />
                            </View>
                          ) : (
                            <>
                              <Text style={styles.balanceValue}>{balanceDisplay}</Text>
                              <Text
                                style={[
                                  styles.balanceDelta,
                                  deltaTone === 'green'
                                    ? styles.deltaGreen
                                    : deltaTone === 'red'
                                      ? styles.deltaRed
                                      : styles.deltaDim,
                                ]}
                              >
                                {deltaDisplay}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              {walletCards.length > 1 ? (
                <View style={styles.walletDots}>
                  {walletCards.map((item, index) => (
                    <View
                      key={item.wallet.id}
                      style={[styles.walletDot, index === currentCardIndex && styles.walletDotActive]}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.emptyWalletCard}>
              <Text style={styles.emptyWalletTitle}>No wallet selected</Text>
              <Text style={styles.emptyWalletText}>
                Add or import a wallet first, then balances, tokens and activity will appear here.
              </Text>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.primaryButton}
                onPress={() => router.push('/ui-lab')}
              >
                <Text style={styles.primaryButtonText}>Add Wallet</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.actionsRow}>
            <View style={styles.actionEdgeSlot}>
              <ActionButton icon="arrow-up-outline" label="Send" onPress={() => handleHomeAction('Send')} />
            </View>

            <View style={styles.actionMiddleSlot}>
              <ActionButton icon="arrow-down-outline" label="Receive" onPress={() => handleHomeAction('Receive')} />
            </View>

            <View style={styles.actionMiddleSlot}>
              <ActionButton icon="time-outline" label="History" onPress={() => handleHomeAction('History')} />
            </View>

            <View style={styles.actionEdgeSlotRight}>
              <ActionButton icon="grid-outline" label="More" onPress={() => handleHomeAction('More')} />
            </View>
          </View>

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          <View style={styles.assetsHeaderRow}>
            <View style={styles.assetsHeaderSide}>
              <Text style={styles.assetsHeaderMiniLabel}>Assets</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.assetsHeaderLeftButton}
                onPress={handleToggleAssetSort}
              >
                <PreferencesIcon width={20} height={20} />
              </TouchableOpacity>
            </View>

            <View style={styles.assetsHeaderSide}>
              <Text style={styles.assetsHeaderMiniLabel}>Manage</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.assetsHeaderRightButton}
                onPress={() => handleHomeAction('Manage Crypto')}
              >
                <SettingsMiniIcon width={20} height={20} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.assetList}>
            {isActivePortfolioLoading ? (
              <View style={styles.assetSkeletonList}>
                {Array.from({ length: ASSET_SKELETON_ROWS }).map((_, index) => (
                  <View key={`asset-skeleton-${index}`} style={styles.assetSkeletonRow}>
                    <View style={styles.assetSkeletonLeft}>
                      <View style={styles.assetSkeletonLogo} />
                      <View style={styles.assetSkeletonMeta}>
                        <View style={styles.assetSkeletonName} />
                        <View style={styles.assetSkeletonAmount} />
                      </View>
                    </View>

                    <View style={styles.assetSkeletonRight}>
                      <View style={styles.assetSkeletonValue} />
                      <View style={styles.assetSkeletonDelta} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              sortedAssets.map((asset) => (
                <TouchableOpacity
                  key={asset.id}
                  activeOpacity={0.9}
                  style={styles.assetRow}
                  onPress={() => handleOpenToken(asset)}
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
                      <Text style={styles.assetAmount}>{asset.amountDisplay}</Text>
                    </View>
                  </View>

                  <View style={styles.assetRight}>
                    <Text style={styles.assetValue}>{asset.valueDisplay}</Text>
                    <Text
                      style={[
                        styles.assetDelta,
                        asset.deltaTone === 'green'
                          ? styles.deltaGreen
                          : asset.deltaTone === 'red'
                            ? styles.deltaRed
                            : styles.deltaDim,
                      ]}
                    >
                      {asset.deltaDisplay}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />

        <AddressQrModal
          visible={qrVisible}
          walletName={qrWallet?.name}
          address={qrWallet?.address}
          onClose={closeQrModal}
          onCopy={() => {
            void handleCopyQrAddress();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.actionButton} onPress={onPress}>
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={30} color={colors.accent} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
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

  screenLoaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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

  walletAssetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
    marginBottom: 10,
  },

  walletAssetMainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 24,
    alignSelf: 'flex-start',
  },

  walletAssetAddButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  walletAssetEyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.45,
  },

  walletCardSection: {
    marginBottom: 16,
  },

  walletPagerContent: {
    alignItems: 'stretch',
  },

  walletCardPage: {
    paddingRight: 0,
  },

  walletCard: {
    backgroundColor: 'rgba(255,105,0,0.08)',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 18,
    padding: 16,
  },

  walletNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  walletName: {
    flex: 1,
    color: colors.white,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: 'Sora_700Bold',
  },

  watchOnlyButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },

  walletAddress: {
    flex: 1,
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  iconActionButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  balanceBlock: {
    minHeight: 92,
    justifyContent: 'center',
  },

  balanceLoaderWrap: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },

  balanceValue: {
    marginTop: 16,
    color: colors.white,
    fontSize: 32,
    lineHeight: 38,
    fontFamily: 'Sora_700Bold',
  },

  balanceDelta: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  walletDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },

  walletDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  walletDotActive: {
    backgroundColor: colors.accent,
  },

  deltaGreen: {
    color: colors.green,
  },

  deltaRed: {
    color: colors.red,
  },

  deltaDim: {
    color: colors.textDim,
  },

  emptyWalletCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
  },

  emptyWalletTitle: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Sora_700Bold',
  },

  emptyWalletText: {
    marginTop: 10,
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  primaryButton: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  primaryButtonText: {
    color: colors.bg,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  actionEdgeSlot: {
    width: 72,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },

  actionEdgeSlotRight: {
    width: 72,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  actionMiddleSlot: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionButton: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    paddingVertical: 8,
  },

  actionIconWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -6,
    backgroundColor: 'transparent',
  },

  actionLabel: {
    color: colors.white,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
    marginTop: -2,
    marginBottom: 2,
  },

  errorText: {
    marginBottom: 14,
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  assetsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    marginTop: 0,
    marginBottom: 6,
  },

  assetsHeaderSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  assetsHeaderMiniLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  assetsHeaderLeftButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  assetsHeaderRightButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  assetList: {
    minHeight: 318,
    gap: 10,
    paddingBottom: spacing[3],
  },

  assetSkeletonList: {
    gap: 10,
  },

  assetSkeletonRow: {
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

  assetSkeletonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 12,
  },

  assetSkeletonLogo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },

  assetSkeletonMeta: {
    flex: 1,
    gap: 8,
  },

  assetSkeletonName: {
    width: '62%',
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  assetSkeletonAmount: {
    width: '44%',
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  assetSkeletonRight: {
    alignItems: 'flex-end',
    gap: 8,
    width: 96,
    flexShrink: 0,
  },

  assetSkeletonValue: {
    width: 72,
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  assetSkeletonDelta: {
    width: 56,
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
    borderColor: colors.line,
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

  assetDelta: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
});
