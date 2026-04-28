import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useNavigationInsets } from '../src/ui/navigation';
import ScreenLoadingOverlay from '../src/ui/screen-loading-overlay';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import ScreenBrow from '../src/ui/screen-brow';
import useChromeLoading from '../src/ui/use-chrome-loading';
import LottieIcon from '../src/ui/lottie-icon';

import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import { ensureSigningWalletActive, getActiveWallet } from '../src/services/wallet/storage';
import {
  clearTokenHistoryCache,
  getTokenDetails,
  getTokenHistoryPage,
  type TokenDetails,
  type TokenHistoryItem,
  type TokenPerformancePoint,
  type TokenPoolInfo,
} from '../src/services/tron/api';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import { useWalletSession } from '../src/wallet/wallet-session';

import {
  ShareIcon,
} from '../src/ui/ui-icons';
import CopyWalletSvg from '../assets/icons/ui/copy_btn.svg';

const TOKEN_DETAILS_HISTORY_REFRESH_SOURCE = require('../assets/icons/ui/wallet_action_history_loop.json');
const TOKEN_DETAILS_MARKET_TOGGLE_SOURCE = require('../assets/icons/ui/token_details_market_toggle.json');
const TOKEN_DETAILS_SHARE_SOURCE = require('../assets/icons/ui/token_details_share.json');

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
    return `+ ${clean}`;
  }

  if (item.displayType === 'SEND') {
    return `- ${clean}`;
  }

  return clean;
}

function getTokenHistoryBadgeLabel(details: TokenDetails | null) {
  const safeSymbol = String(details?.symbol || '').trim();
  if (safeSymbol) return safeSymbol;

  const safeName = String(details?.name || '').trim();
  if (safeName) return safeName.split(/\s+/)[0];

  return 'TOKEN';
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
  const { walletDataRefreshKey } = useWalletSession();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const params = useLocalSearchParams<{ tokenId?: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefreshAnimating, setHistoryRefreshAnimating] = useState(false);
  const [historyRefreshPlayToken, setHistoryRefreshPlayToken] = useState(0);
  const [poolsOpen, setPoolsOpen] = useState(false);
  const [marketInfoOpen, setMarketInfoOpen] = useState(false);
  const [marketToggleAnimating, setMarketToggleAnimating] = useState(false);
  const [marketTogglePlayToken, setMarketTogglePlayToken] = useState(0);
  const [marketToggleFrames, setMarketToggleFrames] = useState<[number, number]>([0, 29]);
  const [poolsToggleAnimating, setPoolsToggleAnimating] = useState(false);
  const [poolsTogglePlayToken, setPoolsTogglePlayToken] = useState(0);
  const [poolsToggleFrames, setPoolsToggleFrames] = useState<[number, number]>([0, 29]);
  const [shareAnimating, setShareAnimating] = useState(false);
  const [sharePlayToken, setSharePlayToken] = useState(0);
  const [details, setDetails] = useState<TokenDetails | null>(null);
  const copyIconScale = useRef(new Animated.Value(1)).current;
  const [errorText, setErrorText] = useState('');
  useChromeLoading((loading && !details) || refreshing);

  const contentBottomInset = useBottomInset();

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

        const nextDetails = await getTokenDetails(wallet.address, tokenId, true);

        setDetails({
          ...nextDetails,
          history: dedupeHistory(nextDetails.history),
        });
      } catch (error) {
        console.error(error);
        setDetails(null);
        setErrorText('Failed to load token details.');
        notice.showErrorNotice('Token details failed to load.', 2600);
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

  useEffect(() => {
    if (!tokenId || walletDataRefreshKey === 0) return;
    void load();
  }, [load, tokenId, walletDataRefreshKey]);

  const handleCopyAddress = useCallback(async () => {
    if (!details?.address) return;
    copyIconScale.stopAnimation();
    copyIconScale.setValue(0.92);
    Animated.sequence([
      Animated.timing(copyIconScale, {
        toValue: 1.06,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(copyIconScale, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
    await Clipboard.setStringAsync(details.address);
    notice.showSuccessNotice('Token contract copied.', 2200);
  }, [copyIconScale, details?.address, notice]);

  const handleOpenTokenContract = useCallback(async () => {
    if (!details?.address) return;

    try {
      await openInAppBrowser(router, `https://tronscan.org/#/contract/${details.address}`);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to open token contract.', 2200);
    }
  }, [details?.address, notice, router]);

  const handleOpenHistoryItem = async (item: TokenHistoryItem) => {
    try {
      await openInAppBrowser(router, item.tronscanUrl);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to open Tronscan.', 2200);
    }
  };

  const reloadHistory = useCallback(async () => {
    if (!tokenId || !details) return;

    try {
      setHistoryLoading(true);

      const page = await getTokenHistoryPage(
        details.walletAddress,
        tokenId,
        details.decimals
      );

      setDetails((current) => {
        if (!current) return current;

        return {
          ...current,
          history: dedupeHistory(page.items),
          historyNextFingerprint: page.nextFingerprint,
          historyHasMore: page.hasMore,
        };
      });
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Token history failed to load.', 2200);
    } finally {
      setHistoryLoading(false);
    }
  }, [details, notice, tokenId]);

  const handleReloadHistory = useCallback(() => {
    if (!tokenId || !details || historyLoading || historyRefreshAnimating) return;
    setHistoryRefreshAnimating(true);
    setHistoryRefreshPlayToken((current) => current + 1);
  }, [details, historyLoading, historyRefreshAnimating, tokenId]);

  const handleToggleMarketInfo = useCallback(() => {
    setMarketToggleAnimating(true);
    setMarketTogglePlayToken((current) => current + 1);
    setMarketToggleFrames(marketInfoOpen ? [29, 0] : [0, 29]);
    setMarketInfoOpen((prev) => !prev);
  }, [marketInfoOpen]);

  const handleTogglePools = useCallback(() => {
    setPoolsToggleAnimating(true);
    setPoolsTogglePlayToken((current) => current + 1);
    setPoolsToggleFrames(poolsOpen ? [29, 0] : [0, 29]);
    setPoolsOpen((prev) => !prev);
  }, [poolsOpen]);

  const handleAnimateOpenTokenContract = useCallback(() => {
    if (!details?.address || shareAnimating) return;
    setShareAnimating(true);
    setSharePlayToken((current) => current + 1);
  }, [details?.address, shareAnimating]);

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

        return {
          ...current,
          history: merged,
          historyNextFingerprint: page.nextFingerprint,
          historyHasMore: page.hasMore,
        };
      });
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('More token history failed to load.', 2200);
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

  if (loading && !details) {
    return <ScreenLoadingState label="Loading token details..." />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScreenLoadingOverlay visible={refreshing} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: navInsets.top, paddingBottom: contentBottomInset },
          ]}
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
          <ScreenBrow label="TOKEN DETAILS" variant="back" />

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : details ? (
            <>
              <View style={styles.mainCard}>
                {details.logo ? (
                  <Image
                    source={{ uri: details.logo }}
                    style={styles.mainCardLogoBackdrop}
                    contentFit="contain"
                  />
                ) : null}

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

                <Text style={styles.balanceAmount}>{details.balanceFormatted}</Text>

                <View style={styles.valueToggleRow}>
                  <Text style={styles.balanceValue}>{formatUsd(details.balanceValueUsd)}</Text>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.marketToggleButton}
                    onPress={handleToggleMarketInfo}
                  >
                    {marketToggleAnimating ? (
                      <LottieIcon
                        key={`market-toggle-${marketTogglePlayToken}`}
                        source={TOKEN_DETAILS_MARKET_TOGGLE_SOURCE}
                        size={18}
                        playToken={marketTogglePlayToken}
                        frames={marketToggleFrames}
                        onAnimationFinish={() => {
                          setMarketToggleAnimating(false);
                        }}
                      />
                    ) : (
                      <LottieIcon
                        source={TOKEN_DETAILS_MARKET_TOGGLE_SOURCE}
                        size={18}
                        staticFrame={marketInfoOpen ? 29 : 0}
                      />
                    )}
                  </TouchableOpacity>
                </View>

                {marketInfoOpen ? (
                  <>
                    <View style={styles.addressRow}>
                      <Text style={styles.tokenAddress} numberOfLines={1} ellipsizeMode="middle">
                        {details.address}
                      </Text>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={handleCopyAddress}
                        style={styles.copyButton}
                      >
                        <Animated.View style={{ transform: [{ scale: copyIconScale }] }}>
                          <CopyWalletSvg width={18} height={18} />
                        </Animated.View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={handleAnimateOpenTokenContract}
                        style={styles.copyButton}
                      >
                        {shareAnimating ? (
                          <LottieIcon
                            key={`token-details-share-${sharePlayToken}`}
                            source={TOKEN_DETAILS_SHARE_SOURCE}
                            size={18}
                            playToken={sharePlayToken}
                            frames={[0, 88]}
                            onAnimationFinish={(isCancelled) => {
                              setShareAnimating(false);
                              if (!isCancelled) {
                                void handleOpenTokenContract();
                              }
                            }}
                          />
                        ) : (
                          <LottieIcon
                            source={TOKEN_DETAILS_SHARE_SOURCE}
                            size={18}
                            staticFrame={0}
                          />
                        )}
                      </TouchableOpacity>
                    </View>

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
                        onPress={handleTogglePools}
                      >
                        <View style={styles.statButtonRow}>
                          <View style={styles.statButtonText}>
                            <Text style={styles.statLabel}>Liquidity</Text>
                            <Text style={styles.statValueCompact} numberOfLines={1}>
                              {formatCompactCurrency(details.liquidityUsd)}
                            </Text>
                          </View>

                          {poolsToggleAnimating ? (
                            <LottieIcon
                              key={`pools-toggle-${poolsTogglePlayToken}`}
                              source={TOKEN_DETAILS_MARKET_TOGGLE_SOURCE}
                              size={18}
                              playToken={poolsTogglePlayToken}
                              frames={poolsToggleFrames}
                              onAnimationFinish={() => {
                                setPoolsToggleAnimating(false);
                              }}
                            />
                          ) : (
                            <LottieIcon
                              source={TOKEN_DETAILS_MARKET_TOGGLE_SOURCE}
                              size={18}
                              staticFrame={poolsOpen ? 29 : 0}
                            />
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

              <View style={styles.tokenActionsRow}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.tokenPrimaryButton}
                  onPress={() => void (async () => {
                    const wallet = await getActiveWallet();

                    if (wallet?.kind === 'watch-only') {
                      const signingWallet = await ensureSigningWalletActive();
                      if (!signingWallet) {
                        notice.showNeutralNotice(
                          'Send requires a signing wallet. Import or switch to a full-access wallet first.',
                          3200
                        );
                        return;
                      }
                    }

                    router.push({
                      pathname: '/send',
                      params: { tokenId: details.tokenId },
                    } as any);
                  })()}
                >
                  <Text style={styles.tokenPrimaryButtonText}>Send</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.tokenSecondaryButton}
                  onPress={() => void (async () => {
                    const wallet = await getActiveWallet();
                    let targetWalletId: string | undefined;

                    if (wallet?.kind === 'watch-only') {
                      const signingWallet = await ensureSigningWalletActive();
                      if (!signingWallet) {
                        notice.showNeutralNotice(
                          'Swap requires a signing wallet. Import or switch to a full-access wallet first.',
                          3200
                        );
                        return;
                      }

                      targetWalletId = signingWallet.id;
                    } else if (wallet?.id) {
                      targetWalletId = wallet.id;
                    }

                    router.push({
                      pathname: '/swap',
                      params: {
                        tokenId: details.tokenId,
                        walletId: targetWalletId,
                      },
                    } as any);
                  })()}
                >
                  <Text style={styles.tokenSecondaryButtonText}>Swap</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.historyHeaderBar}>
                <Text style={[ui.sectionEyebrow, styles.historyEyebrowBar]}>Transfers</Text>

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.historyRefreshButton}
                  onPress={() => void handleReloadHistory()}
                  disabled={historyLoading || historyRefreshAnimating}
                >
                  {historyLoading ? (
                    <LottieIcon
                      source={TOKEN_DETAILS_HISTORY_REFRESH_SOURCE}
                      size={18}
                      loop
                      playToken={1}
                    />
                  ) : historyRefreshAnimating ? (
                    <LottieIcon
                      key={`token-history-refresh-${historyRefreshPlayToken}`}
                      source={TOKEN_DETAILS_HISTORY_REFRESH_SOURCE}
                      size={18}
                      playToken={historyRefreshPlayToken}
                      frames={[0, 59]}
                      onAnimationFinish={(isCancelled) => {
                        setHistoryRefreshAnimating(false);
                        if (!isCancelled) {
                          void reloadHistory();
                        }
                      }}
                    />
                  ) : (
                    <LottieIcon
                      source={TOKEN_DETAILS_HISTORY_REFRESH_SOURCE}
                      size={18}
                      staticFrame={0}
                    />
                  )}
                </TouchableOpacity>
              </View>

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
                        <View style={styles.historyTopLine}>
                          <Text style={[styles.historyType, historyTone(item)]}>
                            {historyTypeLabel(item)}
                          </Text>

                          <Text
                            style={[styles.historyAmount, historyTone(item)]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {formatHistoryAmount(item)}
                          </Text>
                        </View>

                        <View style={styles.historyAddressRow}>
                          <Text
                            style={[
                              styles.historyCounterparty,
                              item.isKnownContact ? styles.historyCounterpartyKnown : null,
                            ]}
                            numberOfLines={1}
                            ellipsizeMode="middle"
                          >
                            {item.counterpartyLabel || 'Unknown'}
                          </Text>

                          <View style={styles.historyTokenRow}>
                            {details?.logo ? (
                              <Image
                                source={{ uri: details.logo }}
                                style={styles.historyTokenLogo}
                                contentFit="contain"
                              />
                            ) : null}

                            <Text
                              style={styles.historyTokenLabel}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {getTokenHistoryBadgeLabel(details)}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.historyTime}>{formatHistoryTime(item.timestamp)}</Text>

                        <View style={styles.historyBottomRow}>
                          <Text style={styles.historyHash}>{formatShortHash(item.txHash)}</Text>

                          <View style={styles.historyBottomAction}>
                            <ShareIcon width={14} height={14} />
                          </View>
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
  },

  scroll: {
    flex: 1,
  },

  content: {
    gap: 0,
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
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,105,0,0.06)',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 18,
    gap: 12,
  },

  mainCardLogoBackdrop: {
    position: 'absolute',
    top: 10,
    right: -6,
    width: 158,
    height: 158,
    opacity: 0.085,
  },

  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginTop: 0,
  },

  tokenFallbackLogo: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
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

  tokenActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },

  tokenPrimaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  tokenPrimaryButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  tokenSecondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  tokenSecondaryButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  historyHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },

  historyEyebrowBar: {
    marginBottom: 0,
  },

  historyRefreshButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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

  historyTopLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  historyAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  historyBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  historyBottomAction: {
    width: 18,
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
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
    flex: 1,
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    paddingRight: 12,
  },

  historyCounterpartyKnown: {
    color: colors.white,
  },

  historyAmount: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
    maxWidth: '48%',
    flexShrink: 1,
  },

  historyTime: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
  },

  historyHash: {
    flex: 1,
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  historyTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexShrink: 0,
    maxWidth: 120,
  },

  historyTokenLogo: {
    width: 14,
    height: 14,
    borderRadius: 0,
  },

  historyTokenLabel: {
    color: colors.white,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    maxWidth: 108,
    textAlign: 'right',
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
