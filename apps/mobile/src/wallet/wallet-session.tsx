import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getWalletPortfolio } from '../services/wallet/portfolio';
import {
  buildWalletHomeVisibleTokensStorageKey,
  getActiveWallet,
  subscribeActiveWalletChange,
  type WalletKind,
} from '../services/wallet/storage';
import {
  FOURTEEN_CONTRACT,
  FOURTEEN_LOGO,
  getCustomTokenCatalog,
  TRX_LOGO,
  TRX_TOKEN_ID,
  USDT_CONTRACT,
} from '../services/tron/api';

export type FooterTickerItem = {
  id: string;
  symbol: string;
  balanceLabel: string;
  logoUri?: string;
};

function areTickerItemsEqual(next: FooterTickerItem[], prev: FooterTickerItem[]) {
  if (next.length !== prev.length) return false;

  for (let index = 0; index < next.length; index += 1) {
    const nextItem = next[index];
    const prevItem = prev[index];

    if (
      nextItem.id !== prevItem.id ||
      nextItem.symbol !== prevItem.symbol ||
      nextItem.balanceLabel !== prevItem.balanceLabel ||
      nextItem.logoUri !== prevItem.logoUri
    ) {
      return false;
    }
  }

  return true;
}

type WalletSessionContextValue = {
  hasWallet: boolean;
  activeWalletKind: WalletKind | null;
  footerTickerItems: FooterTickerItem[];
  walletDataRefreshKey: number;
  navigationIntroKey: number;
  chromeLoaderVisible: boolean;
  chromeHidden: boolean;
  setPendingWalletSelectionId: (walletId: string | null) => void;
  consumePendingWalletSelectionId: () => string | null;
  triggerWalletDataRefresh: () => void;
  triggerNavigationIntro: () => void;
  consumeNavigationIntro: () => void;
  setChromeLoaderVisible: (visible: boolean) => void;
  setChromeHidden: (hidden: boolean) => void;
};

const WalletSessionContext = createContext<WalletSessionContextValue>({
  hasWallet: false,
  activeWalletKind: null,
  footerTickerItems: [],
  walletDataRefreshKey: 0,
  navigationIntroKey: 0,
  chromeLoaderVisible: false,
  chromeHidden: false,
  setPendingWalletSelectionId: () => {},
  consumePendingWalletSelectionId: () => null,
  triggerWalletDataRefresh: () => {},
  triggerNavigationIntro: () => {},
  consumeNavigationIntro: () => {},
  setChromeLoaderVisible: () => {},
  setChromeHidden: () => {},
});

function formatTickerBalance(value: number) {
  const num = Number(value || 0);

  if (!Number.isFinite(num)) {
    return '0.00';
  }

  const abs = Math.abs(num);

  if (abs >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}b`;
  }

  if (abs >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}m`;
  }

  if (abs >= 1_000) {
    return `${(num / 1_000).toFixed(2)}k`;
  }

  return num.toFixed(2);
}

const DEFAULT_HOME_VISIBLE_TOKEN_IDS = [
  TRX_TOKEN_ID,
  FOURTEEN_CONTRACT,
  USDT_CONTRACT,
] as const;

function normalizeAssetTokenKey(input: { id?: string; symbol?: string }) {
  const id = String(input.id || '').trim();
  const symbol = String(input.symbol || '').trim().toUpperCase();

  if (id === TRX_TOKEN_ID || symbol === 'TRX') return TRX_TOKEN_ID;
  if (id === FOURTEEN_CONTRACT || symbol === '4TEEN') return FOURTEEN_CONTRACT;
  if (id === USDT_CONTRACT || symbol === 'USDT') return USDT_CONTRACT;

  return id;
}

export function WalletSessionProvider({ children }: { children: React.ReactNode }) {
  const [walletDataRefreshKey, setWalletDataRefreshKey] = useState(0);
  const [navigationIntroKey, setNavigationIntroKey] = useState(0);
  const [chromeLoaderVisible, setChromeLoaderVisible] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [hasWallet, setHasWallet] = useState(false);
  const [activeWalletKind, setActiveWalletKind] = useState<WalletKind | null>(null);
  const [footerTickerItems, setFooterTickerItems] = useState<FooterTickerItem[]>([]);
  const pendingWalletSelectionIdRef = useRef<string | null>(null);

  const triggerNavigationIntro = useCallback(() => {
    setNavigationIntroKey((current) => current + 1);
  }, []);

  const consumeNavigationIntro = useCallback(() => {
    return;
  }, []);

  const setPendingWalletSelectionId = useCallback((walletId: string | null) => {
    const next = String(walletId || '').trim();
    pendingWalletSelectionIdRef.current = next || null;
  }, []);

  const consumePendingWalletSelectionId = useCallback(() => {
    const nextValue = pendingWalletSelectionIdRef.current;
    pendingWalletSelectionIdRef.current = null;
    return nextValue;
  }, []);

  const syncWalletSession = useCallback(async () => {
    try {
      const activeWallet = await getActiveWallet();

      if (!activeWallet) {
        setHasWallet(false);
        setActiveWalletKind(null);
        setFooterTickerItems([]);
        return;
      }

      setActiveWalletKind(activeWallet.kind);

      const portfolio = await getWalletPortfolio(activeWallet.address);
      const storageKey = buildWalletHomeVisibleTokensStorageKey(activeWallet.id);
      const [rawVisibleIds, customTokenCatalog] = await Promise.all([
        AsyncStorage.getItem(storageKey).catch(() => null),
        getCustomTokenCatalog(activeWallet.id).catch(() => []),
      ]);

      const savedVisibleIds = (() => {
        if (!rawVisibleIds) return [...DEFAULT_HOME_VISIBLE_TOKEN_IDS];

        try {
          const parsed = JSON.parse(rawVisibleIds);
          const next = Array.isArray(parsed)
            ? parsed.map((value) => String(value || '').trim()).filter(Boolean)
            : [];

          return next.length > 0 ? next : [...DEFAULT_HOME_VISIBLE_TOKEN_IDS];
        } catch {
          return [...DEFAULT_HOME_VISIBLE_TOKEN_IDS];
        }
      })();

      const portfolioIndex = new Map(
        portfolio.assets.map((asset) => [normalizeAssetTokenKey(asset), asset] as const)
      );
      const customCatalogIndex = new Map(
        customTokenCatalog.map((item) => [String(item.id || '').trim(), item] as const)
      );

      const visibleTickerItems = savedVisibleIds
        .flatMap((tokenId): FooterTickerItem[] => {
          const asset = portfolioIndex.get(tokenId);
          const customItem = customCatalogIndex.get(tokenId);

          if (!asset && !customItem && !DEFAULT_HOME_VISIBLE_TOKEN_IDS.includes(tokenId as any)) {
            return [];
          }

          const fallbackLogo =
            tokenId === TRX_TOKEN_ID
              ? TRX_LOGO
              : tokenId === FOURTEEN_CONTRACT
                ? FOURTEEN_LOGO
                : customItem?.logo;
          const logoUri = asset?.logo || fallbackLogo;
          const item: FooterTickerItem = {
            id: tokenId,
            symbol: asset?.symbol || customItem?.abbr || customItem?.name || tokenId,
            balanceLabel: formatTickerBalance(asset?.amount ?? 0),
          };

          if (logoUri) {
            item.logoUri = logoUri;
          }

          return [item];
        });

      setHasWallet(true);
      const nextTickerItems = [
        {
          id: 'wallet',
          symbol: 'WALLET',
          balanceLabel: 'WALLET',
        },
        ...visibleTickerItems,
      ];

      setFooterTickerItems((current) => {
        return areTickerItemsEqual(nextTickerItems, current) ? current : nextTickerItems;
      });
    } catch {
      const activeWallet = await getActiveWallet().catch(() => null);
      setHasWallet(Boolean(activeWallet));
      setActiveWalletKind(activeWallet?.kind ?? null);
      if (!activeWallet) {
        setFooterTickerItems([]);
      }
    }
  }, []);

  const triggerWalletDataRefresh = useCallback(() => {
    setWalletDataRefreshKey((current) => current + 1);
    void syncWalletSession();
  }, [syncWalletSession]);

  useEffect(() => {
    void syncWalletSession();

    const unsubscribeActiveWallet = subscribeActiveWalletChange(() => {
      void syncWalletSession();
      triggerWalletDataRefresh();
    });

    const intervalId = setInterval(() => {
      void syncWalletSession();
    }, 3000);

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncWalletSession();
      }
    });

    return () => {
      unsubscribeActiveWallet();
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [syncWalletSession, triggerWalletDataRefresh]);

  const value = useMemo<WalletSessionContextValue>(() => {
    return {
      hasWallet,
      activeWalletKind,
      footerTickerItems,
      walletDataRefreshKey,
      navigationIntroKey,
      chromeLoaderVisible,
      chromeHidden,
      setPendingWalletSelectionId,
      consumePendingWalletSelectionId,
      triggerWalletDataRefresh,
      triggerNavigationIntro,
      consumeNavigationIntro,
      setChromeLoaderVisible,
      setChromeHidden,
    };
  }, [
    chromeHidden,
    chromeLoaderVisible,
    consumeNavigationIntro,
    consumePendingWalletSelectionId,
    footerTickerItems,
    hasWallet,
    activeWalletKind,
    walletDataRefreshKey,
    navigationIntroKey,
    setPendingWalletSelectionId,
    setChromeHidden,
    triggerWalletDataRefresh,
    triggerNavigationIntro,
  ]);

  return (
    <WalletSessionContext.Provider value={value}>
      {children}
    </WalletSessionContext.Provider>
  );
}

export function useWalletSession() {
  return useContext(WalletSessionContext);
}
