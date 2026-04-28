import { useCallback, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { ProductScreen } from '../src/ui/product-shell';
import { useI18n } from '../src/i18n';

import { colors, layout, radius } from '../src/theme/tokens';
import { useNotice } from '../src/notice/notice-provider';
import { useWalletSession } from '../src/wallet/wallet-session';
import {
  FOURTEEN_CONTRACT,
  TRX_TOKEN_ID,
  USDT_CONTRACT,
  getCustomTokenCatalog,
  getTronscanTokenList,
  setCustomTokenCatalog,
  type CustomTokenCatalogItem,
  type TronscanTokenListItem,
} from '../src/services/tron/api';

import { ToggleOffIcon, ToggleOnIcon } from '../src/ui/ui-icons';
import {
  buildWalletHomeVisibleTokensStorageKey,
  getActiveWallet,
} from '../src/services/wallet/storage';

const DEFAULT_HOME_VISIBLE_TOKEN_IDS = [
  TRX_TOKEN_ID,
  FOURTEEN_CONTRACT,
  USDT_CONTRACT,
] as const;

function isDefaultHomeTokenId(tokenId: string) {
  return DEFAULT_HOME_VISIBLE_TOKEN_IDS.includes(
    tokenId as (typeof DEFAULT_HOME_VISIBLE_TOKEN_IDS)[number]
  );
}

function mapTokenListItemToCustomToken(token: TronscanTokenListItem): CustomTokenCatalogItem {
  return {
    id: String(token.id || '').trim(),
    name: String(token.name || '').trim(),
    abbr: String(token.abbr || '').trim(),
    logo: token.logo,
  };
}

export default function AddCustomTokenScreen() {
  const { t } = useI18n();
  const notice = useNotice();
  const { triggerWalletDataRefresh } = useWalletSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tokens, setTokens] = useState<TronscanTokenListItem[]>([]);
  const [homeVisibleTokenIds, setHomeVisibleTokenIds] = useState<string[]>([
    ...DEFAULT_HOME_VISIBLE_TOKEN_IDS,
  ]);
  const [customTokenCatalog, setCustomTokenCatalogState] = useState<CustomTokenCatalogItem[]>([]);
  const [errorText, setErrorText] = useState('');
  useChromeLoading((loading && tokens.length === 0) || refreshing);

  const load = useCallback(
    async (force = false) => {
      try {
        setLoading(true);
        setErrorText('');

        const activeWallet = await getActiveWallet();
        if (!activeWallet) {
          throw new Error(t('No active wallet selected.'));
        }

        const visibleStorageKey = buildWalletHomeVisibleTokensStorageKey(activeWallet.id);

        const [tokenList, storedVisibleRaw, selectedCustomTokens] = await Promise.all([
          getTronscanTokenList({ force }),
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

        const selectedIds = new Set(
          selectedCustomTokens.map((item) => String(item.id || '').trim()).filter(Boolean)
        );

        const filteredVisibleIds = storedVisibleIds.filter((tokenId) => {
          return isDefaultHomeTokenId(tokenId) || selectedIds.has(tokenId);
        });

        setTokens(tokenList);
        setHomeVisibleTokenIds(
          filteredVisibleIds.length > 0
            ? filteredVisibleIds
            : [...DEFAULT_HOME_VISIBLE_TOKEN_IDS]
        );
        setCustomTokenCatalogState(selectedCustomTokens);
      } catch (error) {
        console.error(error);
        setTokens([]);
        setErrorText(t('Failed to load custom tokens.'));
        notice.showErrorNotice(t('Custom token list failed to load.'), 2400);
      } finally {
        setLoading(false);
      }
    },
    [notice, t]
  );

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

  const handleToggleToken = useCallback(
    async (token: TronscanTokenListItem) => {
      const safeTokenId = String(token.id || '').trim();
      if (!safeTokenId) return;

      try {
        const currentVisibleIds =
          homeVisibleTokenIds.length > 0
            ? [...homeVisibleTokenIds]
            : [...DEFAULT_HOME_VISIBLE_TOKEN_IDS];

        const currentCustomCatalog = [...customTokenCatalog];
        const isSelectedCustom = currentCustomCatalog.some((item) => item.id === safeTokenId);
        const isVisible = currentVisibleIds.includes(safeTokenId);

        let nextVisibleIds = currentVisibleIds;
        let nextCustomCatalog = currentCustomCatalog;

        if (isDefaultHomeTokenId(safeTokenId)) {
          nextVisibleIds = isVisible
            ? currentVisibleIds.filter((id) => id !== safeTokenId)
            : [...currentVisibleIds, safeTokenId];
        } else if (isSelectedCustom) {
          nextVisibleIds = currentVisibleIds.filter((id) => id !== safeTokenId);
          nextCustomCatalog = currentCustomCatalog.filter((item) => item.id !== safeTokenId);
        } else {
          nextVisibleIds = currentVisibleIds.includes(safeTokenId)
            ? currentVisibleIds
            : [...currentVisibleIds, safeTokenId];
          nextCustomCatalog = [...currentCustomCatalog, mapTokenListItemToCustomToken(token)];
        }

        const activeWallet = await getActiveWallet();
        if (!activeWallet) {
          throw new Error(t('No active wallet selected.'));
        }

        await Promise.all([
          AsyncStorage.setItem(
            buildWalletHomeVisibleTokensStorageKey(activeWallet.id),
            JSON.stringify(nextVisibleIds)
          ),
          setCustomTokenCatalog(activeWallet.id, nextCustomCatalog),
        ]);

        setHomeVisibleTokenIds(nextVisibleIds);
        setCustomTokenCatalogState(nextCustomCatalog);
        triggerWalletDataRefresh();
      } catch (error) {
        console.error(error);
        notice.showErrorNotice(t('Custom token update failed.'), 2200);
      }
    },
    [customTokenCatalog, homeVisibleTokenIds, notice, t, triggerWalletDataRefresh]
  );

  const filteredTokens = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) {
      return tokens;
    }

    return tokens.filter((token) => {
      const name = token.name.toLowerCase();
      const abbr = token.abbr.toLowerCase();
      const id = token.id.toLowerCase();

      return name.includes(q) || abbr.includes(q) || id.includes(q);
    });
  }, [search, tokens]);

  const selectedCustomTokenIds = useMemo(() => {
    return new Set(
      customTokenCatalog.map((item) => String(item.id || '').trim()).filter(Boolean)
    );
  }, [customTokenCatalog]);

  if (loading && tokens.length === 0) {
    return <ScreenLoadingState label={t('Loading custom token...')} />;
  }

  return (
    <ProductScreen
      eyebrow={`${t('ADD CUSTOM TOKEN')} (${filteredTokens.length})`}
      browVariant="back"
      keyboardAware
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

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('Search by contract / name / symbol')}
          placeholderTextColor={colors.textDim}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          keyboardAppearance="dark"
          selectionColor={colors.accent}
          returnKeyType="search"
          blurOnSubmit
        />
      </View>

      <View style={styles.assetList}>
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : filteredTokens.length > 0 ? (
          filteredTokens.map((token) => {
            const tokenId = String(token.id || '').trim();
            const enabled =
              homeVisibleTokenIds.includes(tokenId) || selectedCustomTokenIds.has(tokenId);

            return (
              <View key={token.id} style={styles.assetRow}>
                <View style={styles.assetLeft}>
                  {token.logo ? (
                    <Image source={{ uri: token.logo }} style={styles.assetLogo} contentFit="contain" />
                  ) : (
                    <View style={styles.assetFallbackLogo}>
                      <Text style={styles.assetFallbackText}>
                        {String(token.abbr || token.name || '?').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.assetMeta}>
                    <Text style={styles.assetName}>
                      {token.name} {token.abbr ? `(${token.abbr})` : ''}
                    </Text>
                    <Text style={styles.assetAddress}>{token.id}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.toggleButton}
                  onPress={() => void handleToggleToken(token)}
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
            <Text style={styles.emptyText}>Token not found.</Text>
          </View>
        )}
      </View>
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

  searchWrap: {
    marginBottom: 12,
  },

  searchInput: {
    minHeight: layout.fieldHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    color: colors.white,
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

  assetAddress: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
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
});
