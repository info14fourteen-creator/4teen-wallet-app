import { useCallback, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import SubmenuHeader from '../src/ui/submenu-header';
import { colors, layout, radius } from '../src/theme/tokens';
import { useNotice } from '../src/notice/notice-provider';
import { getActiveWallet } from '../src/services/wallet/storage';
import {
  FOURTEEN_CONTRACT,
  getTokenDetails,
  getWalletHistoryPage,
  TRX_TOKEN_ID,
  USDT_CONTRACT,
} from '../src/services/tron/api';
import {
  getWalletPortfolio,
  type PortfolioAsset,
  type WalletPortfolioSnapshot,
} from '../src/services/wallet/portfolio';

import ToggleOffIcon from '../assets/icons/ui/toggle_off_btn.svg';
import ToggleOnIcon from '../assets/icons/ui/toggle_on_btn.svg';

const DEFAULT_HOME_VISIBLE_TOKEN_IDS = [
  TRX_TOKEN_ID,
  FOURTEEN_CONTRACT,
  USDT_CONTRACT,
] as const;

const HOME_VISIBLE_TOKENS_STORAGE_KEY = 'wallet.homeVisibleTokenIds.v1';

function normalizeAssetTokenKey(asset: PortfolioAsset) {
  const id = String(asset.id || '').trim();
  const symbol = String(asset.symbol || '').trim().toUpperCase();

  if (id === TRX_TOKEN_ID || symbol === 'TRX') return TRX_TOKEN_ID;
  if (id === FOURTEEN_CONTRACT || symbol === '4TEEN') return FOURTEEN_CONTRACT;
  if (id === USDT_CONTRACT || symbol === 'USDT') return USDT_CONTRACT;

  return id;
}

function sortAssetsByName(items: PortfolioAsset[]) {
  return [...items].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

export default function ManageCryptoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notice = useNotice();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portfolio, setPortfolio] = useState<WalletPortfolioSnapshot | null>(null);
  const [homeVisibleTokenIds, setHomeVisibleTokenIds] = useState<string[]>([
    ...DEFAULT_HOME_VISIBLE_TOKEN_IDS,
  ]);
  const [errorText, setErrorText] = useState('');

  const contentBottomInset = 44 + Math.max(insets.bottom, 6);

  const load = useCallback(async (force = false) => {
    try {
      setLoading(true);
      setErrorText('');

      const activeWallet = await getActiveWallet();
      if (!activeWallet) {
        throw new Error('No active wallet selected.');
      }

      const [nextPortfolio, storedVisibleRaw] = await Promise.all([
        getWalletPortfolio(activeWallet.address, { force }),
        AsyncStorage.getItem(HOME_VISIBLE_TOKENS_STORAGE_KEY),
      ]);

      let nextAssets = [...(nextPortfolio.assets ?? [])];

      try {
        const historyPage = await getWalletHistoryPage(activeWallet.address, {
          force,
          limit: 20,
        });

        const historyTokenIds = new Set(
          historyPage.items
            .map((item) => String(item.tokenId || '').trim())
            .filter(Boolean)
        );

        const existingIds = new Set(
          nextAssets.map((asset) => normalizeAssetTokenKey(asset))
        );

        for (const tokenId of historyTokenIds) {
          if (!tokenId || existingIds.has(tokenId)) continue;

          try {
            const details = await getTokenDetails(activeWallet.address, tokenId, force);
            nextAssets.push({
              id: details.tokenId,
              name: details.name || details.symbol || tokenId,
              symbol: details.symbol || '',
              logo: details.logo,
              amountDisplay: details.balanceFormatted || '0',
              valueDisplay: '$0.00',
              deltaDisplay: '—',
              deltaTone: 'dim',
              amount: 0,
              valueInUsd: Number(details.balanceValueUsd || 0),
              priceChange24h: undefined,
              deltaUsd24h: 0,
            });
            existingIds.add(tokenId);
          } catch {
            // Ignore unknown extras from history.
          }
        }
      } catch {
        // Ignore history fetch failure.
      }

      const deduped = nextAssets.filter(
        (asset, index, array) =>
          array.findIndex(
            (entry) => normalizeAssetTokenKey(entry) === normalizeAssetTokenKey(asset)
          ) === index
      );

      let storedVisibleIds: string[] = [...DEFAULT_HOME_VISIBLE_TOKEN_IDS];
      try {
        const parsed = storedVisibleRaw ? JSON.parse(storedVisibleRaw) : null;
        const next = Array.isArray(parsed)
          ? parsed.map((value) => String(value || '').trim()).filter(Boolean)
          : [];
        if (next.length > 0) {
          storedVisibleIds = next;
        }
      } catch {
        storedVisibleIds = [...DEFAULT_HOME_VISIBLE_TOKEN_IDS];
      }

      setPortfolio({
        ...nextPortfolio,
        assets: deduped,
      });
      setHomeVisibleTokenIds(storedVisibleIds);
    } catch (error) {
      console.error(error);
      setPortfolio(null);
      setErrorText('Failed to load assets.');
      notice.showErrorNotice('Failed to load assets.', 2400);
    } finally {
      setLoading(false);
    }
  }, [notice]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const toggleTokenVisibility = useCallback(
    async (tokenId: string) => {
      const safeTokenId = String(tokenId || '').trim();
      if (!safeTokenId) return;

      try {
        let nextIds: string[] = [];

        setHomeVisibleTokenIds((current) => {
          const exists = current.includes(safeTokenId);

          if (exists) {
            nextIds = current.filter((id) => id !== safeTokenId);
          } else {
            nextIds = [...current, safeTokenId];
          }

          return nextIds;
        });

        await AsyncStorage.setItem(
          HOME_VISIBLE_TOKENS_STORAGE_KEY,
          JSON.stringify(nextIds)
        );
      } catch (error) {
        console.error(error);
        notice.showErrorNotice('Failed to update visible assets.', 2200);
      }
    },
    [notice]
  );

  const allAssets = useMemo(() => {
    return sortAssetsByName(portfolio?.assets ?? []);
  }, [portfolio?.assets]);

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
          <SubmenuHeader title="MANAGE CRYPTO" onBack={() => router.back()} />

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          <View style={styles.assetList}>
            {loading ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : allAssets.length > 0 ? (
              allAssets.map((asset) => {
                const tokenKey = normalizeAssetTokenKey(asset);
                const enabled = homeVisibleTokenIds.includes(tokenKey);

                return (
                  <View key={asset.id} style={styles.assetRow}>
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
                            {String(asset.symbol || asset.name || '?').slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                      )}

                      <View style={styles.assetMeta}>
                        <Text style={styles.assetName}>{asset.name}</Text>
                        <Text style={styles.assetAmount}>{asset.amountDisplay}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.toggleButton}
                      onPress={() => void toggleTokenVisibility(tokenKey)}
                    >
                      {enabled ? (
                        <ToggleOnIcon width={64} height={36} />
                      ) : (
                        <ToggleOffIcon width={64} height={36} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No assets found.</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.addCustomTokenButton}
            onPress={() => router.push('/add-custom-token')}
          >
            <Text style={styles.addCustomTokenText}>Add custom token</Text>
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

  errorText: {
    marginBottom: 10,
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  assetList: {
    gap: 10,
    paddingBottom: 6,
  },

  loaderWrap: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
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

  toggleButton: {
    width: 72,
    minHeight: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },

  emptyState: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  emptyText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  addCustomTokenButton: {
    alignSelf: 'center',
    paddingVertical: 6,
    marginTop: 4,
    marginBottom: 10,
  },

  addCustomTokenText: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
});
