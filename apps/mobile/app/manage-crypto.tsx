import { useCallback, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { ProductScreen } from '../src/ui/product-shell';

import { colors, layout, radius } from '../src/theme/tokens';
import { useNotice } from '../src/notice/notice-provider';
import {
  buildWalletHomeVisibleTokensStorageKey,
  getActiveWallet,
} from '../src/services/wallet/storage';
import {
  FOURTEEN_CONTRACT,
  getCustomTokenCatalog,
  getTokenDetails,
  getWalletHistoryPage,
  TRX_TOKEN_ID,
  USDT_CONTRACT,
  type CustomTokenCatalogItem,
} from '../src/services/tron/api';
import {
  getWalletPortfolio,
  type PortfolioAsset,
  type WalletPortfolioSnapshot,
} from '../src/services/wallet/portfolio';

import { ToggleOffIcon, ToggleOnIcon } from '../src/ui/ui-icons';

const DEFAULT_HOME_VISIBLE_TOKEN_IDS = [
  TRX_TOKEN_ID,
  FOURTEEN_CONTRACT,
  USDT_CONTRACT,
] as const;

function mapCustomTokenToAsset(item: CustomTokenCatalogItem): PortfolioAsset {
  return {
    id: item.id,
    name: item.name || item.abbr || item.id,
    symbol: item.abbr || item.name || item.id.slice(0, 6),
    logo: item.logo,
    amountDisplay: '0',
    valueDisplay: '$0.00',
    deltaDisplay: '—',
    deltaTone: 'dim',
    amount: 0,
    valueInUsd: 0,
    priceChange24h: undefined,
    deltaUsd24h: 0,
  };
}

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

async function buildManageFallbackAsset(
  walletAddress: string,
  tokenId: string
): Promise<PortfolioAsset> {
  try {
    const details = await getTokenDetails(walletAddress, tokenId, false);

    return {
      id: details.tokenId,
      name: details.name || details.symbol || tokenId,
      symbol: details.symbol || details.name || tokenId.slice(0, 6),
      logo: details.logo,
      amountDisplay: details.balanceFormatted || '0',
      valueDisplay: '$0.00',
      deltaDisplay: '—',
      deltaTone: 'dim',
      amount: 0,
      valueInUsd: Number(details.balanceValueUsd || 0),
      priceChange24h: undefined,
      deltaUsd24h: 0,
    };
  } catch {
    const fallbackName =
      tokenId === TRX_TOKEN_ID
        ? 'TRX'
        : tokenId === FOURTEEN_CONTRACT
          ? '4TEEN'
          : tokenId === USDT_CONTRACT
            ? 'USDT'
            : tokenId;

    return {
      id: tokenId,
      name: fallbackName,
      symbol: fallbackName,
      amountDisplay: '0',
      valueDisplay: '$0.00',
      deltaDisplay: '—',
      deltaTone: 'dim',
      amount: 0,
      valueInUsd: 0,
      priceChange24h: undefined,
      deltaUsd24h: 0,
    };
  }
}

export default function ManageCryptoScreen() {
  const router = useRouter();
  const notice = useNotice();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portfolio, setPortfolio] = useState<WalletPortfolioSnapshot | null>(null);
  const [homeVisibleTokenIds, setHomeVisibleTokenIds] = useState<string[]>([
    ...DEFAULT_HOME_VISIBLE_TOKEN_IDS,
  ]);
  const [errorText, setErrorText] = useState('');
  useChromeLoading((loading && !portfolio) || refreshing);

  const load = useCallback(async (force = false) => {
    try {
      setLoading(true);
      setErrorText('');

      const activeWallet = await getActiveWallet();
      if (!activeWallet) {
        throw new Error('No active wallet selected.');
      }

      const visibleStorageKey = buildWalletHomeVisibleTokensStorageKey(activeWallet.id);

      const [nextPortfolio, storedVisibleRaw, customCatalog] = await Promise.all([
        getWalletPortfolio(activeWallet.address, { force }),
        AsyncStorage.getItem(visibleStorageKey),
        getCustomTokenCatalog(activeWallet.id),
      ]);

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

      const selectedCustomIds = new Set(
        customCatalog.map((item) => String(item.id || '').trim()).filter(Boolean)
      );
      const portfolioTokenIds = new Set(
        (nextPortfolio.assets ?? [])
          .map((asset) => normalizeAssetTokenKey(asset))
          .filter(Boolean)
      );

      storedVisibleIds = storedVisibleIds.filter((tokenId) => {
        return (
          DEFAULT_HOME_VISIBLE_TOKEN_IDS.includes(
            tokenId as (typeof DEFAULT_HOME_VISIBLE_TOKEN_IDS)[number]
          ) ||
          selectedCustomIds.has(tokenId) ||
          portfolioTokenIds.has(tokenId)
        );
      });

      let nextAssets = [...(nextPortfolio.assets ?? [])];

      try {
        const historyPage = await getWalletHistoryPage(activeWallet.address, {
          force,
          limit: 20,
        });

        const historyTokenIds = [
          ...new Set(
            historyPage.items
              .map((item) => String(item.tokenId || '').trim())
              .filter(Boolean)
          ),
        ];

        const existingIds = new Set(
          nextAssets.map((asset) => normalizeAssetTokenKey(asset))
        );

        const missingHistoryIds = historyTokenIds.filter(
          (tokenId) => tokenId && !existingIds.has(tokenId)
        );

        const historyAssets = await Promise.all(
          missingHistoryIds.map(async (tokenId) => {
            try {
              const details = await getTokenDetails(activeWallet.address, tokenId, force);
              return {
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
              } satisfies PortfolioAsset;
            } catch {
              return null;
            }
          })
        );

        nextAssets.push(
          ...historyAssets.filter((asset): asset is PortfolioAsset => Boolean(asset))
        );
      } catch {
      }

      const existingIds = new Set(nextAssets.map((asset) => normalizeAssetTokenKey(asset)));

      const missingDefaultIds = DEFAULT_HOME_VISIBLE_TOKEN_IDS.filter(
        (tokenId) => !existingIds.has(tokenId)
      );

      if (missingDefaultIds.length > 0) {
        const fallbackAssets = await Promise.all(
          missingDefaultIds.map((tokenId) =>
            buildManageFallbackAsset(activeWallet.address, tokenId)
          )
        );
        nextAssets.push(...fallbackAssets);
      }

      for (const item of customCatalog) {
        const tokenId = String(item.id || '').trim();
        if (!tokenId || existingIds.has(tokenId)) continue;
        nextAssets.push(mapCustomTokenToAsset(item));
        existingIds.add(tokenId);
      }

      const deduped = nextAssets.filter(
        (asset, index, array) =>
          array.findIndex(
            (entry) => normalizeAssetTokenKey(entry) === normalizeAssetTokenKey(asset)
          ) === index
      );

      setPortfolio({
        ...nextPortfolio,
        assets: deduped,
      });
      setHomeVisibleTokenIds(
        storedVisibleIds.length > 0
          ? storedVisibleIds
          : [...DEFAULT_HOME_VISIBLE_TOKEN_IDS]
      );
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

        const activeWallet = await getActiveWallet();
        if (!activeWallet) {
          throw new Error('No active wallet selected.');
        }

        await AsyncStorage.setItem(
          buildWalletHomeVisibleTokensStorageKey(activeWallet.id),
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

  if (loading && !portfolio) {
    return <ScreenLoadingState label="Loading manage crypto..." />;
  }

  return (
    <ProductScreen
      eyebrow="MANAGE CRYPTO"
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
                    <Image source={{ uri: asset.logo }} style={styles.assetLogo} contentFit="contain" />
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
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: -1,
    marginBottom: 10,
  },

  addCustomTokenText: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
});
