import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  buildWalletHomeVisibleTokensStorageKey,
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
import {
  clearWalletHistoryCache,
  FOURTEEN_CONTRACT,
  getCustomTokenCatalog,
  getTokenDetails,
  getWalletHistoryPage,
  TRX_TOKEN_ID,
  USDT_CONTRACT,
  type CustomTokenCatalogItem,
  type WalletHistoryItem,
} from '../src/services/tron/api';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';

import OpenRightIcon from '../assets/icons/ui/open_right_btn.svg';
import WatchOnlyIcon from '../assets/icons/ui/watch_only_btn.svg';
import FullAccessIcon from '../assets/icons/ui/full_access_btn.svg';
import CopyIcon from '../assets/icons/ui/copy_btn.svg';
import QrIcon from '../assets/icons/ui/qr_btn.svg';
import ValueSortIcon from '../assets/icons/ui/value_sort_btn.svg';
import AzSortIcon from '../assets/icons/ui/az_sort_btn.svg';
import ManageFullIcon from '../assets/icons/ui/manage_full_btn.svg';
import ManageNewIcon from '../assets/icons/ui/manage_new_btn.svg';
import AddWalletIcon from '../assets/icons/ui/add_wallet_btn.svg';
import ShareIcon from '../assets/icons/ui/share_btn.svg';
import BrowserRefreshIcon from '../assets/icons/ui/browser_refresh_btn.svg';

const ASSET_SKELETON_ROWS = 4;
const HISTORY_SKELETON_ROWS = 4;

const DEFAULT_HOME_VISIBLE_TOKEN_IDS = [
  TRX_TOKEN_ID,
  FOURTEEN_CONTRACT,
  USDT_CONTRACT,
] as const;

type ContentMode = 'assets' | 'history';

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

function formatShortContract(value?: string) {
  const safe = String(value || '').trim();
  if (!safe) return 'Unknown token';
  if (safe.length <= 14) return safe;
  return `${safe.slice(0, 6)}...${safe.slice(-6)}`;
}

function getHistoryTokenLabel(item: WalletHistoryItem) {
  if (item.tokenId === TRX_TOKEN_ID) {
    return 'TRX';
  }

  const safeSymbol = String(item.tokenSymbol || '').trim();
  if (safeSymbol) {
    return safeSymbol;
  }

  const safeName = String(item.tokenName || '').trim();
  if (safeName && safeName.toLowerCase() != 'token') {
    return safeName.split(/\s+/)[0];
  }

  return formatShortContract(item.tokenId);
}

function historyTone(item: WalletHistoryItem) {
  if (item.displayType === 'RECEIVE') return styles.historyTypeGreen;
  return styles.historyTypeRed;
}

function historyRowTone(item: WalletHistoryItem) {
  if (item.displayType === 'RECEIVE') return styles.historyRowReceive;
  return styles.historyRowSend;
}

function historyTypeLabel(item: WalletHistoryItem) {
  if (item.displayType === 'RECEIVE') return 'RECEIVE';
  return 'SEND';
}

function formatHistoryAmount(item: WalletHistoryItem) {
  const clean = item.amountFormatted.replace(/^[+-]\s*/, '');

  if (item.displayType === 'RECEIVE') {
    return `+${clean}`;
  }

  return `-${clean}`;
}

function normalizeAssetTokenKey(asset: PortfolioAsset) {
  const id = String(asset.id || '').trim();
  const symbol = String(asset.symbol || '').trim().toUpperCase();

  if (id === TRX_TOKEN_ID || symbol === 'TRX') return TRX_TOKEN_ID;
  if (id === FOURTEEN_CONTRACT || symbol === '4TEEN') return FOURTEEN_CONTRACT;
  if (id === USDT_CONTRACT || symbol === 'USDT') return USDT_CONTRACT;

  return id;
}

function normalizeHistoryTokenKey(item: WalletHistoryItem) {
  const id = String(item.tokenId || '').trim();
  const symbol = String(item.tokenSymbol || '').trim().toUpperCase();

  if (id === TRX_TOKEN_ID || symbol === 'TRX') return TRX_TOKEN_ID;
  if (id === FOURTEEN_CONTRACT || symbol === '4TEEN') return FOURTEEN_CONTRACT;
  if (id === USDT_CONTRACT || symbol === 'USDT') return USDT_CONTRACT;

  return id;
}

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

  const [historyCache, setHistoryCache] = useState<Record<string, WalletHistoryItem[]>>({});
  const [historyNextCursorCache, setHistoryNextCursorCache] = useState<Record<string, string | undefined>>({});
  const [historyHasMoreCache, setHistoryHasMoreCache] = useState<Record<string, boolean>>({});
  const [historyLoadingWalletId, setHistoryLoadingWalletId] = useState<string | null>(null);
  const [historyLoadingMoreWalletId, setHistoryLoadingMoreWalletId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [assetSortMode, setAssetSortMode] = useState<'name' | 'value'>('name');
  const [contentMode, setContentMode] = useState<ContentMode>('assets');
  const [homeVisibleTokenIds, setHomeVisibleTokenIds] = useState<string[]>([
    ...DEFAULT_HOME_VISIBLE_TOKEN_IDS,
  ]);
  const [customTokenCatalog, setCustomTokenCatalog] = useState<CustomTokenCatalogItem[]>([]);
  const [visibleTokenMetaMap, setVisibleTokenMetaMap] = useState<
    Record<
      string,
      {
        name?: string;
        symbol?: string;
        logo?: string;
      }
    >
  >({});

  const cardWidth = Math.max(width - layout.screenPaddingX * 2, 1);
  const contentBottomInset = 44 + Math.max(insets.bottom, 6);

  const walletCards = useMemo(() => aggregate?.items ?? [], [aggregate]);

  const loadHomePreferences = useCallback(async (walletId?: string | null) => {
    const resolvedWalletId = String(walletId || activeWallet?.id || '').trim();

    if (!resolvedWalletId) {
      setHomeVisibleTokenIds([...DEFAULT_HOME_VISIBLE_TOKEN_IDS]);
      setCustomTokenCatalog([]);
      return;
    }

    try {
      const storageKey = buildWalletHomeVisibleTokensStorageKey(resolvedWalletId);
      const [rawVisibleIds, catalog] = await Promise.all([
        AsyncStorage.getItem(storageKey),
        getCustomTokenCatalog(resolvedWalletId).catch(() => []),
      ]);

      const safeCatalog = Array.isArray(catalog) ? catalog : [];
      const allowedCustomIds = new Set(
        safeCatalog.map((item) => String(item.id || '').trim()).filter(Boolean)
      );
      const allowedPortfolioIds = new Set(
        (portfolio?.assets ?? [])
          .map((asset) => normalizeAssetTokenKey(asset))
          .filter(Boolean)
      );

      setCustomTokenCatalog(safeCatalog);

      if (!rawVisibleIds) {
        setHomeVisibleTokenIds([...DEFAULT_HOME_VISIBLE_TOKEN_IDS]);
        return;
      }

      const parsed = JSON.parse(rawVisibleIds);
      const next = Array.isArray(parsed)
        ? parsed.map((value) => String(value || '').trim()).filter(Boolean)
        : [];

      const filtered = next.filter((tokenId) => {
        return (
          DEFAULT_HOME_VISIBLE_TOKEN_IDS.includes(
            tokenId as (typeof DEFAULT_HOME_VISIBLE_TOKEN_IDS)[number]
          ) ||
          allowedCustomIds.has(tokenId) ||
          allowedPortfolioIds.has(tokenId)
        );
      });

      setHomeVisibleTokenIds(
        filtered.length > 0 ? filtered : [...DEFAULT_HOME_VISIBLE_TOKEN_IDS]
      );
    } catch (error) {
      console.error(error);
      setHomeVisibleTokenIds([...DEFAULT_HOME_VISIBLE_TOKEN_IDS]);
      setCustomTokenCatalog([]);
    }
  }, [activeWallet?.id, portfolio?.assets]);

  useEffect(() => {
    void loadHomePreferences(activeWallet?.id);
  }, [activeWallet?.id, loadHomePreferences]);

  useEffect(() => {
    let cancelled = false;

    const loadVisibleTokenMeta = async () => {
      if (!activeWallet?.address) {
        if (!cancelled) {
          setVisibleTokenMetaMap({});
        }
        return;
      }

      const activeVisibleTokenIds =
        homeVisibleTokenIds.length > 0
          ? homeVisibleTokenIds
          : [...DEFAULT_HOME_VISIBLE_TOKEN_IDS];

      const presentIds = new Set(
        (portfolio?.assets ?? []).map((asset) => normalizeAssetTokenKey(asset))
      );

      const tokenIdsToLoad = activeVisibleTokenIds.filter((tokenId) => !presentIds.has(tokenId));

      if (tokenIdsToLoad.length === 0) {
        if (!cancelled) {
          setVisibleTokenMetaMap({});
        }
        return;
      }

      const customCatalogIndex = new Map(
        customTokenCatalog.map((item) => [String(item.id || '').trim(), item] as const)
      );

      const entries = await Promise.all(
        tokenIdsToLoad.map(async (tokenId) => {
          try {
            const details = await getTokenDetails(activeWallet.address, tokenId, false);
            return [
              tokenId,
              {
                name: details.name,
                symbol: details.symbol,
                logo: details.logo,
              },
            ] as const;
          } catch {
            const customItem = customCatalogIndex.get(tokenId);

            const fallbackName =
              customItem?.name ||
              customItem?.abbr ||
              (tokenId === TRX_TOKEN_ID
                ? 'TRX'
                : tokenId === FOURTEEN_CONTRACT
                  ? '4TEEN'
                  : tokenId === USDT_CONTRACT
                    ? 'USDT'
                    : tokenId);

            const fallbackSymbol =
              customItem?.abbr ||
              (tokenId === TRX_TOKEN_ID
                ? 'TRX'
                : tokenId === FOURTEEN_CONTRACT
                  ? '4TEEN'
                  : tokenId === USDT_CONTRACT
                    ? 'USDT'
                    : fallbackName);

            return [
              tokenId,
              {
                name: fallbackName,
                symbol: fallbackSymbol,
                logo: customItem?.logo,
              },
            ] as const;
          }
        })
      );

      if (!cancelled) {
        setVisibleTokenMetaMap(Object.fromEntries(entries));
      }
    };

    void loadVisibleTokenMeta();

    return () => {
      cancelled = true;
    };
  }, [activeWallet?.address, customTokenCatalog, homeVisibleTokenIds, portfolio?.assets]);

  const visibleHistory = useMemo(() => {
    if (!activeWallet?.id) return [];
    return historyCache[activeWallet.id] ?? [];
  }, [activeWallet?.id, historyCache]);

  const activeHistoryHasMore = useMemo(() => {
    if (!activeWallet?.id) return false;
    return Boolean(historyHasMoreCache[activeWallet.id]);
  }, [activeWallet?.id, historyHasMoreCache]);

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

  const visibleHomeAssets = useMemo(() => {
    const activeVisibleTokenIds =
      homeVisibleTokenIds.length > 0
        ? homeVisibleTokenIds
        : [...DEFAULT_HOME_VISIBLE_TOKEN_IDS];

    const visibleTokenIdSet = new Set(activeVisibleTokenIds);
    const sourceAssets: PortfolioAsset[] = (portfolio?.assets ?? []).filter((asset) =>
      visibleTokenIdSet.has(normalizeAssetTokenKey(asset))
    );

    const merged = [...sourceAssets];
    const customCatalogIndex = new Map(
      customTokenCatalog.map((item) => [String(item.id || '').trim(), item] as const)
    );

    if (activeWallet?.id) {
      const historyItems = historyCache[activeWallet.id] ?? [];
      const historyIndex = new Map(
        historyItems.map((item) => [normalizeHistoryTokenKey(item), item] as const)
      );

      for (const tokenId of activeVisibleTokenIds) {
        if (merged.some((asset) => normalizeAssetTokenKey(asset) === tokenId)) continue;

        const historyItem = historyIndex.get(tokenId);
        const customItem = customCatalogIndex.get(tokenId);
        const metaItem = visibleTokenMetaMap[tokenId];

        const isDefaultToken =
          tokenId === TRX_TOKEN_ID ||
          tokenId === FOURTEEN_CONTRACT ||
          tokenId === USDT_CONTRACT;

        if (!isDefaultToken && !historyItem && !customItem && !metaItem) {
          continue;
        }

        const fallbackName =
          historyItem?.tokenName ||
          metaItem?.name ||
          customItem?.name ||
          customItem?.abbr ||
          (tokenId === TRX_TOKEN_ID
            ? 'TRX'
            : tokenId === FOURTEEN_CONTRACT
              ? '4TEEN'
              : tokenId === USDT_CONTRACT
                ? 'USDT'
                : tokenId);

        const fallbackSymbol =
          historyItem?.tokenSymbol ||
          metaItem?.symbol ||
          customItem?.abbr ||
          (tokenId === TRX_TOKEN_ID
            ? 'TRX'
            : tokenId === FOURTEEN_CONTRACT
              ? '4TEEN'
              : tokenId === USDT_CONTRACT
                ? 'USDT'
                : fallbackName);

        merged.push({
          id: tokenId,
          name: fallbackName,
          symbol: fallbackSymbol,
          logo: historyItem?.tokenLogo || metaItem?.logo || customItem?.logo,
          amountDisplay: '0',
          valueDisplay: '$0.00',
          deltaDisplay: '—',
          deltaTone: 'dim',
          amount: 0,
          valueInUsd: 0,
          priceChange24h: undefined,
          deltaUsd24h: 0,
        });
      }
    }

    const deduped = merged.filter(
      (asset, index, array) =>
        array.findIndex((entry) => normalizeAssetTokenKey(entry) === normalizeAssetTokenKey(asset)) ===
        index
    );

    if (assetSortMode === 'value') {
      deduped.sort((a, b) => {
        if (b.valueInUsd !== a.valueInUsd) return b.valueInUsd - a.valueInUsd;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
    } else {
      deduped.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );
    }

    return deduped;
  }, [
    activeWallet?.id,
    assetSortMode,
    customTokenCatalog,
    historyCache,
    homeVisibleTokenIds,
    portfolio,
    visibleTokenMetaMap,
  ]);

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

  const ensureWalletHistoryLoaded = useCallback(
    async (wallet: WalletMeta, options?: { force?: boolean }) => {
      const force = Boolean(options?.force);

      if (!force && historyCache[wallet.id]) {
        return historyCache[wallet.id];
      }

      try {
        setHistoryLoadingWalletId(wallet.id);

        const page = await getWalletHistoryPage(wallet.address, {
          force,
          limit: 20,
        });

        setHistoryCache((prev) => ({
          ...prev,
          [wallet.id]: page.items,
        }));

        setHistoryNextCursorCache((prev) => ({
          ...prev,
          [wallet.id]: page.nextFingerprint,
        }));

        setHistoryHasMoreCache((prev) => ({
          ...prev,
          [wallet.id]: page.hasMore,
        }));

        return page.items;
      } catch (error) {
        console.error(error);
        notice.showErrorNotice('Failed to load wallet history.', 2400);
        return [];
      } finally {
        setHistoryLoadingWalletId((current) => (current === wallet.id ? null : current));
      }
    },
    [historyCache, notice]
  );

  const handleLoadMoreHistory = useCallback(async () => {
    if (!activeWallet?.id) return;
    if (!historyHasMoreCache[activeWallet.id]) return;
    if (historyLoadingMoreWalletId === activeWallet.id) return;

    const fingerprint = historyNextCursorCache[activeWallet.id];
    if (!fingerprint) return;

    try {
      setHistoryLoadingMoreWalletId(activeWallet.id);

      const page = await getWalletHistoryPage(activeWallet.address, {
        limit: 20,
        fingerprint,
      });

      setHistoryCache((prev) => {
        const current = prev[activeWallet.id] ?? [];
        const seen = new Set(
          current.map((item) => `${item.tokenId}:${item.txHash}:${item.displayType}:${item.amountRaw}`)
        );

        const merged = [...current];
        for (const item of page.items) {
          const key = `${item.tokenId}:${item.txHash}:${item.displayType}:${item.amountRaw}`;
          if (!seen.has(key)) {
            seen.add(key);
            merged.push(item);
          }
        }

        merged.sort((a, b) => b.timestamp - a.timestamp);

        return {
          ...prev,
          [activeWallet.id]: merged,
        };
      });

      setHistoryNextCursorCache((prev) => ({
        ...prev,
        [activeWallet.id]: page.nextFingerprint,
      }));

      setHistoryHasMoreCache((prev) => ({
        ...prev,
        [activeWallet.id]: page.hasMore,
      }));
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to load more history.', 2200);
    } finally {
      setHistoryLoadingMoreWalletId((current) => (current === activeWallet.id ? null : current));
    }
  }, [
    activeWallet,
    historyHasMoreCache,
    historyLoadingMoreWalletId,
    historyNextCursorCache,
    notice,
  ]);

  const load = useCallback(
    async (preferredWalletId?: string, options?: { force?: boolean }) => {
      const force = Boolean(options?.force);

      try {
        setLoading(true);
        setErrorText('');

        const [nextAggregate, storedActiveWalletId] = await Promise.all([
          getAllWalletPortfolios({ force }),
          getActiveWalletId(),
        ]);

        setAggregate(nextAggregate);

        const nextCacheFromAggregate = (nextAggregate?.items ?? []).reduce<
          Record<string, WalletPortfolioSnapshot>
        >((acc, item) => {
          if (item.portfolio) {
            acc[item.wallet.id] = item.portfolio;
          }
          return acc;
        }, {});

        setPortfolioCache((prev) => ({
          ...prev,
          ...nextCacheFromAggregate,
        }));

        const items = nextAggregate?.items ?? [];
        if (items.length === 0) {
          setActiveWallet(null);
          setPortfolio(null);
          setPortfolioLoadingWalletId(null);
          setHistoryLoadingWalletId(null);
          setHistoryLoadingMoreWalletId(null);
          setCurrentCardIndex(0);
          return;
        }

        const resolvedActiveWalletId =
          preferredWalletId ??
          storedActiveWalletId ??
          items[0]?.wallet.id ??
          null;

        const foundIndex = items.findIndex((item) => item.wallet.id === resolvedActiveWalletId);
        const nextIndex = foundIndex >= 0 ? foundIndex : 0;
        const nextActiveItem = items[nextIndex] ?? items[0];
        const nextActiveWallet = nextActiveItem.wallet;

        setActiveWallet(nextActiveWallet);
        setCurrentCardIndex(nextIndex);

        if (nextActiveItem.portfolio) {
          setPortfolio(nextActiveItem.portfolio);
          setPortfolioLoadingWalletId(null);
        } else {
          setPortfolioLoadingWalletId(nextActiveWallet.id);

          const nextPortfolio = await getWalletPortfolio(nextActiveWallet.address, { force });
          setPortfolio(nextPortfolio);
          setPortfolioLoadingWalletId(null);

          setPortfolioCache((prev) => ({
            ...prev,
            [nextActiveWallet.id]: nextPortfolio,
          }));
        }

        if (contentMode === 'history') {
          await ensureWalletHistoryLoaded(nextActiveWallet, { force });
        }
      } catch (error) {
        console.error(error);
        setPortfolio(null);
        setPortfolioLoadingWalletId(null);
        setHistoryLoadingWalletId(null);
        setHistoryLoadingMoreWalletId(null);
        setErrorText('Failed to load wallet data.');
        notice.showErrorNotice('Failed to load wallet data.', 2600);
      } finally {
        setLoading(false);
      }
    },
    [contentMode, ensureWalletHistoryLoaded, notice]
  );

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);

      if (activeWallet?.id) {
        setHistoryCache((prev) => {
          const next = { ...prev };
          delete next[activeWallet.id];
          return next;
        });

        setHistoryNextCursorCache((prev) => {
          const next = { ...prev };
          delete next[activeWallet.id];
          return next;
        });

        setHistoryHasMoreCache((prev) => {
          const next = { ...prev };
          delete next[activeWallet.id];
          return next;
        });

        await clearWalletHistoryCache(activeWallet.address, 20);
      }

      await load(activeWallet?.id, { force: true });

      if (contentMode === 'history' && activeWallet) {
        await ensureWalletHistoryLoaded(activeWallet, { force: true });
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeWallet, contentMode, ensureWalletHistoryLoaded, load]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadHomePreferences();

      return undefined;
    }, [load, loadHomePreferences])
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
        } else {
          setPortfolio(null);
          setPortfolioLoadingWalletId(nextItem.wallet.id);

          const nextPortfolio = await getWalletPortfolio(nextItem.wallet.address);
          setPortfolio(nextPortfolio);
          setPortfolioLoadingWalletId(null);

          setPortfolioCache((prev) => ({
            ...prev,
            [nextItem.wallet.id]: nextPortfolio,
          }));
        }

        if (contentMode === 'history') {
          await ensureWalletHistoryLoaded(nextItem.wallet);
        }
      } catch (error) {
        console.error(error);
        setPortfolioLoadingWalletId(null);
        setHistoryLoadingWalletId(null);
        setHistoryLoadingMoreWalletId(null);
        notice.showErrorNotice('Failed to switch wallet.', 2400);
      }
    },
    [activeWallet?.id, cardWidth, contentMode, ensureWalletHistoryLoaded, notice, portfolioCache, walletCards]
  );

  const handleWalletAssetPress = useCallback(() => {
    router.push('/select-wallet');
  }, [router]);

  const handleToggleHistoryMode = useCallback(async () => {
    if (!activeWallet) {
      notice.showErrorNotice('No active wallet selected.', 2200);
      return;
    }

    if (contentMode === 'assets') {
      setContentMode('history');
      await ensureWalletHistoryLoaded(activeWallet);
      return;
    }

    setContentMode('assets');
  }, [activeWallet, contentMode, ensureWalletHistoryLoaded, notice]);

  const handleHomeAction = useCallback(
    async (label: string) => {
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

      if (label === 'History') {
        await handleToggleHistoryMode();
        return;
      }

      if (label === 'Manage Crypto') {
        router.push('/manage-crypto');
        return;
      }

      notice.showNeutralNotice(`${label} is coming soon.`, 2200);
    },
    [activeWallet, handleToggleHistoryMode, notice, openQrModal, showWatchOnlyNotice]
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

  const handleOpenHistoryItem = useCallback(
    async (item: WalletHistoryItem) => {
      try {
        await openInAppBrowser(router, item.tronscanUrl);
      } catch (error) {
        console.error(error);
        notice.showErrorNotice('Failed to open Tronscan.', 2200);
      }
    },
    [notice, router]
  );

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

  const handleRefreshTransfers = useCallback(async () => {
    if (!activeWallet) return;

    try {
      setHistoryCache((prev) => {
        const next = { ...prev };
        delete next[activeWallet.id];
        return next;
      });

      setHistoryNextCursorCache((prev) => {
        const next = { ...prev };
        delete next[activeWallet.id];
        return next;
      });

      setHistoryHasMoreCache((prev) => {
        const next = { ...prev };
        delete next[activeWallet.id];
        return next;
      });

      await clearWalletHistoryCache(activeWallet.address, 20);
      await ensureWalletHistoryLoaded(activeWallet, { force: true });
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to refresh transfers.', 2200);
    }
  }, [activeWallet, ensureWalletHistoryLoaded, notice]);

  const isInitialScreenLoading = loading && !aggregate;
  const isActivePortfolioLoading =
    Boolean(activeWallet?.id) && portfolioLoadingWalletId === activeWallet?.id;
  const isActiveHistoryLoading =
    Boolean(activeWallet?.id) && historyLoadingWalletId === activeWallet?.id;
  const isActiveHistoryLoadingMore =
    Boolean(activeWallet?.id) && historyLoadingMoreWalletId === activeWallet?.id;

  const knownManagedTokenIds = useMemo(() => {
    const ids = new Set<string>();

    for (const asset of portfolio?.assets ?? []) {
      ids.add(normalizeAssetTokenKey(asset));
    }

    return Array.from(ids);
  }, [portfolio?.assets]);

  const hasHiddenManagedTokens = useMemo(() => {
    if (knownManagedTokenIds.length === 0) return false;
    const visibleSet = new Set(homeVisibleTokenIds);
    return knownManagedTokenIds.some((tokenId) => !visibleSet.has(tokenId));
  }, [homeVisibleTokenIds, knownManagedTokenIds]);

  const historyButtonIcon = contentMode === 'history' ? 'list-outline' : 'time-outline';
  const historyButtonLabel = contentMode === 'history' ? 'Assets' : 'History';

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
              activeOpacity={0.85}
              style={styles.walletAssetTitleButton}
              onPress={handleWalletAssetPress}
            >
              <Text style={[ui.sectionEyebrow, styles.walletAssetEyebrow]}>
                WALLET ASSET
              </Text>
              <View style={styles.walletAssetInlineArrowWrap}>
                <OpenRightIcon width={18} height={18} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.walletAssetAddButton}
              onPress={() => router.push('/ui-lab')}
            >
              <View style={styles.walletAssetAddIconWrap}>
                <AddWalletIcon width={16} height={16} />
              </View>
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
                            onPress={() => {
                              if (wallet.kind === 'watch-only') {
                                notice.showErrorNotice(
                                  'Make sure you have full access to this wallet. You will not be able to send anything from a watch-only wallet.',
                                  3200
                                );
                                return;
                              }

                              openQrModal(wallet);
                            }}
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
              <ActionButton icon="arrow-up-outline" label="Send" onPress={() => void handleHomeAction('Send')} />
            </View>

            <View style={styles.actionMiddleSlot}>
              <ActionButton icon="arrow-down-outline" label="Receive" onPress={() => void handleHomeAction('Receive')} />
            </View>

            <View style={styles.actionMiddleSlot}>
              <ActionButton icon={historyButtonIcon} label={historyButtonLabel} onPress={() => void handleHomeAction('History')} />
            </View>

            <View style={styles.actionEdgeSlotRight}>
              <ActionButton icon="grid-outline" label="More" onPress={() => void handleHomeAction('More')} />
            </View>
          </View>

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          {contentMode === 'assets' ? (
            <>
              <View style={styles.assetsHeaderRow}>
                <View style={styles.assetsHeaderSide}>
                  <Text style={[ui.sectionEyebrow, styles.assetsEyebrowBar]}>Assets</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.assetsHeaderLeftButton}
                    onPress={handleToggleAssetSort}
                  >
                    {assetSortMode === 'value' ? (
                      <ValueSortIcon width={20} height={20} />
                    ) : (
                      <AzSortIcon width={20} height={20} />
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.assetsHeaderSide}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.assetsHeaderRightButton}
                    onPress={() => void handleHomeAction('Manage Crypto')}
                  >
                    {hasHiddenManagedTokens ? (
                      <ManageNewIcon width={20} height={20} />
                    ) : (
                      <ManageFullIcon width={20} height={20} />
                    )}
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
                  visibleHomeAssets.map((asset) => (
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

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.manageCryptoTextButton}
                onPress={() => void handleHomeAction('Manage Crypto')}
              >
                <Text style={styles.manageCryptoText}>Manage Crypto</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.historyHeaderRow}>
                <View style={styles.historyHeaderSide}>
                  <Text style={[ui.sectionEyebrow, styles.historyEyebrowBar]}>Transfers</Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.historyRefreshButton}
                  onPress={() => void handleRefreshTransfers()}
                  disabled={isActiveHistoryLoading}
                >
                  {isActiveHistoryLoading ? (
                    <ActivityIndicator color={colors.accent} size="small" />
                  ) : (
                    <BrowserRefreshIcon width={18} height={18} />
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.historyBlockHome}>
                {isActiveHistoryLoading ? (
                  <View style={styles.historySkeletonList}>
                    {Array.from({ length: HISTORY_SKELETON_ROWS }).map((_, index) => (
                      <View key={`history-skeleton-${index}`} style={styles.historySkeletonRow}>
                        <View style={styles.historySkeletonTopRow}>
                          <View style={styles.historySkeletonLeft}>
                            <View style={styles.historySkeletonTag} />
                            <View style={styles.historySkeletonCounterparty} />
                          </View>
                          <View style={styles.historySkeletonAmount} />
                        </View>

                        <View style={styles.historySkeletonTime} />

                        <View style={styles.historySkeletonBottomRow}>
                          <View style={styles.historySkeletonHash} />
                          <View style={styles.historySkeletonShare} />
                        </View>
                      </View>
                    ))}
                  </View>
                ) : visibleHistory.length > 0 ? (
                  <>
                    <View style={styles.historyList}>
                      {visibleHistory.map((item, index) => (
                        <TouchableOpacity
                          key={`${item.tokenId}-${item.txHash}-${item.displayType}-${index}`}
                          activeOpacity={0.9}
                          style={[styles.historyRow, historyRowTone(item)]}
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
                            >
                              {item.counterpartyLabel || 'Unknown'}
                            </Text>

                            <View style={styles.historyTokenRow}>
                              {item.tokenLogo ? (
                                <Image
                                  source={{ uri: item.tokenLogo }}
                                  style={styles.historyTokenLogo}
                                  contentFit="contain"
                                />
                              ) : null}

                              <Text
                                style={styles.historyTokenLabel}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {getHistoryTokenLabel(item)}
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

                    {activeHistoryHasMore ? (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        style={styles.loadMoreButton}
                        onPress={() => void handleLoadMoreHistory()}
                        disabled={isActiveHistoryLoadingMore}
                      >
                        {isActiveHistoryLoadingMore ? (
                          <ActivityIndicator color={colors.accent} size="small" />
                        ) : (
                          <Text style={styles.loadMoreButtonText}>Load More</Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.historyEmpty}>
                    <Text style={styles.historyEmptyText}>No transfers yet.</Text>
                  </View>
                )}
              </View>
            </>
          )}
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
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },

  walletAssetTitleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },

  walletAssetInlineArrowWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },

  walletAssetAddButton: {
    minHeight: 36,
    minWidth: 36,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  walletAssetAddIconWrap: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  walletAssetEyebrow: {
    marginBottom: 0,
  },

  walletCardSection: {
    marginBottom: 18,
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

  assetsEyebrowBar: {
    marginBottom: 0,
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
    gap: 10,
    paddingBottom: 6,
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

  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    marginTop: 0,
    marginBottom: 6,
  },

  historyHeaderSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  historyHeaderMiniLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
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

  historyBlockHome: {
    minHeight: 318,
    gap: 10,
    paddingBottom: spacing[3],
  },

  historySkeletonList: {
    gap: 10,
  },

  historySkeletonRow: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 96,
    gap: 8,
  },

  historySkeletonTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },

  historySkeletonLeft: {
    flex: 1,
    gap: 8,
  },

  historySkeletonTag: {
    width: 110,
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  historySkeletonCounterparty: {
    width: '72%',
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  historySkeletonAmount: {
    width: 84,
    height: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  historySkeletonTime: {
    width: 132,
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  historySkeletonBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  historySkeletonHash: {
    width: 120,
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  historySkeletonShare: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    gap: 8,
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

  manageCryptoTextButton: {
    alignSelf: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    marginTop: 0,
    marginBottom: 12,
  },

  manageCryptoText: {
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

  historyTypeDim: {
    color: colors.textDim,
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
    marginTop: 2,
  },

  loadMoreButtonText: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
});
