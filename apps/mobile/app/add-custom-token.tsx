import { useCallback, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

import ToggleOffIcon from '../assets/icons/ui/toggle_off_btn.svg';
import ToggleOnIcon from '../assets/icons/ui/toggle_on_btn.svg';

const DEFAULT_HOME_VISIBLE_TOKEN_IDS = [
  TRX_TOKEN_ID,
  FOURTEEN_CONTRACT,
  USDT_CONTRACT,
] as const;

const HOME_VISIBLE_TOKENS_STORAGE_KEY = 'wallet.homeVisibleTokenIds.v1';

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notice = useNotice();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tokens, setTokens] = useState<TronscanTokenListItem[]>([]);
  const [homeVisibleTokenIds, setHomeVisibleTokenIds] = useState<string[]>([
    ...DEFAULT_HOME_VISIBLE_TOKEN_IDS,
  ]);
  const [customTokenCatalog, setCustomTokenCatalogState] = useState<CustomTokenCatalogItem[]>([]);
  const [errorText, setErrorText] = useState('');

  const contentBottomInset = 44 + Math.max(insets.bottom, 6);

  const load = useCallback(
    async (force = false) => {
      try {
        setLoading(true);
        setErrorText('');

        const [tokenList, storedVisibleRaw, selectedCustomTokens] = await Promise.all([
          getTronscanTokenList({ force }),
          AsyncStorage.getItem(HOME_VISIBLE_TOKENS_STORAGE_KEY),
          getCustomTokenCatalog(),
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
        setErrorText('Failed to load custom tokens.');
        notice.showErrorNotice('Failed to load custom tokens.', 2400);
      } finally {
        setLoading(false);
      }
    },
    [notice]
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

        await Promise.all([
          AsyncStorage.setItem(
            HOME_VISIBLE_TOKENS_STORAGE_KEY,
            JSON.stringify(nextVisibleIds)
          ),
          setCustomTokenCatalog(nextCustomCatalog),
        ]);

        setHomeVisibleTokenIds(nextVisibleIds);
        setCustomTokenCatalogState(nextCustomCatalog);
      } catch (error) {
        console.error(error);
        notice.showErrorNotice('Failed to update custom tokens.', 2200);
      }
    },
    [customTokenCatalog, homeVisibleTokenIds, notice]
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
          <SubmenuHeader title="CUSTOM TOKEN" onBack={() => router.back()} />

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          <View style={styles.searchWrap}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by contract / name / symbol"
              placeholderTextColor={colors.textDim}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
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
                        <Image
                          source={{ uri: token.logo }}
                          style={styles.assetLogo}
                          contentFit="contain"
                        />
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

  searchWrap: {
    marginBottom: 12,
  },

  searchInput: {
    minHeight: 52,
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
