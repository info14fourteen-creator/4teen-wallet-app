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
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
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
import { getActiveWallet } from '../src/services/wallet/storage';
import {
  clearTokenHistoryCache,
  getTokenDetails,
  getTokenHistoryPage,
  type TokenDetails,
  type TokenHistoryItem,
  type TokenPerformancePoint,
  type TokenPoolInfo,
} from '../src/services/tron/api';

import CopyIcon from '../assets/icons/ui/copy_btn.svg';
import OpenDownIcon from '../assets/icons/ui/open_down_btn.svg';
import OpenRightIcon from '../assets/icons/ui/open_right_btn.svg';
import ShareIcon from '../assets/icons/ui/share_btn.svg';

function formatUsd(value?: number, maximumFractionDigits = 2) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;

  return safe.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  });
}

function formatCompactCurrency(value?: number) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;

  return safe.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2,
  });
}

function formatCompactNumber(value?: number) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;

  return safe.toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  });
}

function formatPerformanceValue(point?: TokenPerformancePoint) {
  const value = point?.changePercent;

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }

  if (value === 0) {
    return '0.00%';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatHistoryTime(timestamp: number) {
  if (!timestamp) return 'Unknown time';

  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortHash(hash: string) {
  if (!hash || hash.length < 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

function historyTone(item: TokenHistoryItem) {
  if (item.displayType === 'RECEIVE') return styles.historyTypeGreen;
  if (item.displayType === 'SEND') return styles.historyTypeRed;
  return styles.historyTypeDim;
}

function historyTypeLabel(item: TokenHistoryItem) {
  if (item.displayType === 'RECEIVE') return 'RECEIVE';
  if (item.displayType === 'SEND') return 'SEND';
  return 'TRANSFER';
}

function formatHistoryAmount(item: TokenHistoryItem) {
  const clean = item.amountFormatted.replace(/^[+-]\s*/, '');

  if (item.displayType === 'RECEIVE') {
    return `+${clean}`;
  }

  if (item.displayType === 'SEND') {
    return `-${clean}`;
  }

  return clean;
}

function dedupeHistory(items: TokenHistoryItem[]) {
  const map = new Map<string, TokenHistoryItem>();

  for (const item of items) {
    const key = `${item.txHash}:${item.displayType}:${item.amountRaw}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
}

export default function TokenDetailsScreen() {
  const router = useRouter();
  const notice = useNotice();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tokenId?: string }>();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [poolsOpen, setPoolsOpen] = useState(false);
  const [marketInfoOpen, setMarketInfoOpen] = useState(false);
  const [details, setDetails] = useState<TokenDetails | null>(null);
  const [errorText, setErrorText] = useState('');

  const contentBottomInset = 44 + Math.max(insets.bottom, 6);

  const tokenId =
    typeof params.tokenId === 'string'
      ? params.tokenId
      : Array.isArray(params.tokenId)
        ? params.tokenId[0]
        : '';

  const performance = useMemo(() => {
    const source = details?.performance ?? [];
    const labels: ('5m' | '1h' | '4h' | '24h')[] = ['5m', '1h', '4h', '24h'];

    return labels.map((label) => source.find((item) => item.label === label) || { label });
  }, [details?.performance]);

  const priceChangePoint = useMemo(
    () => performance.find((point) => point.label === '24h'),
    [performance]
  );

  const load = useCallback(
    async (options?: { forceHistoryRefresh?: boolean }) => {
      try {
        setLoading(true);
        setErrorText('');

        const wallet = await getActiveWallet();

        if (!wallet) {
          throw new Error('No active wallet selected.');
        }

        if (!tokenId) {
          throw new Error('Token id is missing.');
        }

        if (options?.forceHistoryRefresh) {
          await clearTokenHistoryCache(wallet.address, tokenId);
        }

        const nextDetails = await getTokenDetails(wallet.address, tokenId);

        setDetails({
          ...nextDetails,
          history: dedupeHistory(nextDetails.history),
        });
      } catch (error) {
        console.error(error);
        setDetails(null);
        setErrorText('Failed to load token details.');
        notice.showErrorNotice('Failed to load token details.', 2600);
      } finally {
        setLoading(false);
      }
    },
    [notice, tokenId]
  );

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load({ forceHistoryRefresh: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleCopyAddress = async () => {
    if (!details?.address) return;
    await Clipboard.setStringAsync(details.address);
    notice.showSuccessNotice('Token address copied.', 2200);
  };

  const handleOpenTokenContract = useCallback(async () => {
    if (!details?.address) return;

    try {
      await Linking.openURL(`https://tronscan.org/#/contract/${details.address}`);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to open token contract.', 2200);
    }
  }, [details?.address, notice]);

  const handleOpenHistoryItem = async (item: TokenHistoryItem) => {
    try {
      await Linking.openURL(item.tronscanUrl);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to open Tronscan.', 2200);
    }
  };

  const handleLoadMoreHistory = async () => {
    if (!details?.historyHasMore || !details.historyNextFingerprint || historyLoadingMore) {
      return;
    }

    try {
      setHistoryLoadingMore(true);

      const page = await getTokenHistoryPage(
        details.walletAddress,
        details.tokenId,
        details.decimals,
        details.historyNextFingerprint
      );

      setDetails((current) => {
        if (!current) return current;

        const merged = dedupeHistory([...current.history, ...page.items]);
        const appendedUniqueCount = merged.length - current.history.length;

        return {
          ...current,
          history: merged,
          historyNextFingerprint: appendedUniqueCount > 0 ? page.nextFingerprint : undefined,
          historyHasMore: appendedUniqueCount > 0 ? page.hasMore : false,
        };
      });
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to load more history.', 2200);
    } finally {
      setHistoryLoadingMore(false);
    }
  };

  const priceToneStyle = useMemo(() => {
    const value = priceChangePoint?.changePercent;

    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
      return styles.priceValueDim;
    }

    return value > 0 ? styles.priceValueGreen : styles.priceValueRed;
  }, [priceChangePoint]);

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
          <SubmenuHeader title="TOKEN DETAILS" onBack={() => router.back()} />

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : details ? (
            <>
              <View style={styles.mainCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardHeaderText}>
                    <Text style={styles.tokenName}>{details.name}</Text>
                    <Text style={styles.tokenSymbol}>{details.symbol}</Text>
                  </View>

                  {details.logo ? (
                    <Image
                      source={{ uri: details.logo }}
                      style={styles.tokenLogo}
                      contentFit="contain"
                    />
                  ) : (
                    <View style={styles.tokenFallbackLogo}>
                      <Text style={styles.tokenFallbackText}>
                        {details.symbol.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.addressRow}>
                  <Text style={styles.tokenAddress} numberOfLines={1} ellipsizeMode="middle">
                    {details.address}
                  </Text>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleCopyAddress}
                    style={styles.copyButton}
                  >
                    <CopyIcon width={18} height={18} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => void handleOpenTokenContract()}
                    style={styles.copyButton}
                  >
                    <ShareIcon width={18} height={18} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.balanceAmount}>{details.balanceFormatted}</Text>

                <View style={styles.valueToggleRow}>
                  <Text style={styles.balanceValue}>{formatUsd(details.balanceValueUsd)}</Text>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.marketToggleButton}
                    onPress={() => setMarketInfoOpen((prev) => !prev)}
                  >
                    {marketInfoOpen ? (
                      <OpenDownIcon width={18} height={18} />
                    ) : (
                      <OpenRightIcon width={16} height={16} />
                    )}
                  </TouchableOpacity>
                </View>

                {marketInfoOpen ? (
                  <>
                    <View style={styles.statsGrid}>
                      <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Price</Text>
                        <Text style={[styles.statValue, priceToneStyle]} numberOfLines={1}>
                          {formatUsd(details.priceInUsd, 6)}
                        </Text>
                      </View>

                      <View style={styles.statCard}>
                        <Text style={styles.statLabel}>MCap</Text>
                        <Text style={styles.statValueCompact} numberOfLines={1}>
                          {formatCompactCurrency(details.marketCap)}
                        </Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.9}
                        style={styles.statCard}
                        onPress={() => setPoolsOpen((prev) => !prev)}
                      >
                        <View style={styles.statButtonRow}>
                          <View style={styles.statButtonText}>
                            <Text style={styles.statLabel}>Liquidity</Text>
                            <Text style={styles.statValueCompact} numberOfLines={1}>
                              {formatCompactCurrency(details.liquidityUsd)}
                            </Text>
                          </View>

                          {poolsOpen ? (
                            <OpenDownIcon width={18} height={18} />
                          ) : (
                            <OpenRightIcon width={16} height={16} />
                          )}
                        </View>
                      </TouchableOpacity>

                      <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Supply</Text>
                        <Text style={styles.statValueCompact} numberOfLines={1}>
                          {formatCompactNumber(details.totalSupply)}
                        </Text>
                      </View>
                    </View>

                    {poolsOpen ? (
                      <View style={styles.poolsWrap}>
                        {details.pools.length > 0 ? (
                          details.pools.map((pool: TokenPoolInfo) => (
                            <View key={pool.id} style={styles.poolRow}>
                              <View style={styles.poolLeft}>
                                <Text style={styles.poolDex}>{pool.dexName}</Text>
                                <Text style={styles.poolPair}>{pool.pairLabel}</Text>
                              </View>

                              <View style={styles.poolRight}>
                                <Text style={styles.poolLiquidity}>
                                  {formatCompactCurrency(pool.liquidityUsd)}
                                </Text>
                                <Text style={styles.poolVolume}>
                                  24h {formatCompactCurrency(pool.volume24h)}
                                </Text>
                              </View>
                            </View>
                          ))
                        ) : (
                          <View style={styles.poolEmpty}>
                            <Text style={styles.poolEmptyText}>No pool data.</Text>
                          </View>
                        )}
                      </View>
                    ) : null}

                    <View style={styles.performanceRow}>
                      {performance.map((point) => {
                        const value = point?.changePercent;
                        const tone =
                          typeof value !== 'number' || !Number.isFinite(value) || value === 0
                            ? styles.perfValueDim
                            : value > 0
                              ? styles.perfValueGreen
                              : styles.perfValueRed;

                        return (
                          <View key={point.label} style={styles.performanceCard}>
                            <Text style={styles.perfLabel}>{point.label}</Text>
                            <Text style={[styles.perfValue, tone]}>
                              {formatPerformanceValue(point)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </View>

              <Text style={[ui.sectionEyebrow, styles.historyEyebrow]}>History</Text>

              <View style={styles.historyBlock}>
                {details.history.length > 0 ? (
                  <View style={styles.historyList}>
                    {details.history.map((item, index) => (
                      <TouchableOpacity
                        key={`${item.txHash}-${item.displayType}-${index}`}
                        activeOpacity={0.9}
                        style={[
                          styles.historyRow,
                          item.displayType === 'SEND'
                            ? styles.historyRowSend
                            : item.displayType === 'RECEIVE'
                              ? styles.historyRowReceive
                              : null,
                        ]}
                        onPress={() => void handleOpenHistoryItem(item)}
                      >
                        <View style={styles.historyTopRow}>
                          <View style={styles.historyLeft}>
                            <Text style={[styles.historyType, historyTone(item)]}>
                              {historyTypeLabel(item)}
                            </Text>
                            <Text
                              style={[
                                styles.historyCounterparty,
                                item.isKnownContact ? styles.historyCounterpartyKnown : null,
                              ]}
                            >
                              {item.counterpartyLabel || 'Unknown'}
                            </Text>
                          </View>

                          <Text style={[styles.historyAmount, historyTone(item)]}>
                            {formatHistoryAmount(item)}
                          </Text>
                        </View>

                        <Text style={styles.historyTime}>{formatHistoryTime(item.timestamp)}</Text>

                        <View style={styles.historyBottomRow}>
                          <Text style={styles.historyHash}>{formatShortHash(item.txHash)}</Text>
                          <ShareIcon width={14} height={14} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.historyEmpty}>
                    <Text style={styles.historyEmptyText}>No transfers yet.</Text>
                  </View>
                )}

                {details.history.length >= 10 && details.historyHasMore ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.loadMoreButton}
                    onPress={() => void handleLoadMoreHistory()}
                    disabled={historyLoadingMore}
                  >
                    {historyLoadingMore ? (
                      <ActivityIndicator color={colors.accent} size="small" />
                    ) : (
                      <Text style={styles.loadMoreButtonText}>Load More</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            </>
          ) : (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>{errorText || 'Unable to load token details.'}</Text>
            </View>
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
  },

  content: {
    paddingTop: 14,
  },

  loadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorText: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  mainCard: {
    backgroundColor: 'rgba(255,105,0,0.06)',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 18,
    gap: 12,
  },

  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  cardHeaderText: {
    flex: 1,
    gap: 4,
  },

  tokenName: {
    color: colors.white,
    fontSize: 34,
    lineHeight: 38,
    fontFamily: 'Sora_700Bold',
  },

  tokenSymbol: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
  },

  tokenLogo: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  tokenFallbackLogo: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  tokenFallbackText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  tokenAddress: {
    flex: 1,
    color: colors.white,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
  },

  copyButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  balanceAmount: {
    color: colors.white,
    fontSize: 34,
    lineHeight: 38,
    fontFamily: 'Sora_700Bold',
  },

  valueToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  balanceValue: {
    flex: 1,
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
  },

  marketToggleButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  statCard: {
    width: '48.4%',
    minHeight: 74,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 6,
  },

  statLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
  },

  statValue: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  priceValueGreen: {
    color: colors.green,
  },

  priceValueRed: {
    color: colors.red,
  },

  priceValueDim: {
    color: colors.textDim,
  },

  statValueCompact: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
    flexShrink: 1,
  },

  statButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  statButtonText: {
    flex: 1,
    gap: 6,
  },

  poolsWrap: {
    gap: 10,
  },

  poolRow: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },

  poolLeft: {
    flex: 1,
    gap: 4,
  },

  poolRight: {
    alignItems: 'flex-end',
    gap: 4,
  },

  poolDex: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  poolPair: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  poolLiquidity: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
  },

  poolVolume: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
  },

  poolEmpty: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  poolEmptyText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  performanceRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },

  performanceCard: {
    flex: 1,
    minHeight: 58,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  perfLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
  },

  perfValue: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  perfValueGreen: {
    color: colors.green,
  },

  perfValueRed: {
    color: colors.red,
  },

  perfValueDim: {
    color: colors.textDim,
  },

  historyEyebrow: {
    marginBottom: 18,
  },

  historyBlock: {
    gap: 12,
    paddingBottom: 20,
  },

  historyList: {
    gap: 10,
  },

  historyRow: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },

  historyRowSend: {
    backgroundColor: 'rgba(255,48,73,0.03)',
  },

  historyRowReceive: {
    backgroundColor: 'rgba(24,224,58,0.03)',
  },

  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },

  historyLeft: {
    flex: 1,
    gap: 4,
  },

  historyBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  historyType: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  historyTypeGreen: {
    color: colors.green,
  },

  historyTypeRed: {
    color: colors.red,
  },

  historyTypeDim: {
    color: colors.textDim,
  },

  historyCounterparty: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  historyCounterpartyKnown: {
    color: colors.white,
  },

  historyAmount: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
    maxWidth: '45%',
  },

  historyTime: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
  },

  historyHash: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  historyEmpty: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },

  historyEmptyText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  loadMoreButton: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginTop: 4,
  },

  loadMoreButtonText: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
});
