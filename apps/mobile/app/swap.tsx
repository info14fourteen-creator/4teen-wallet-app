import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  type LayoutChangeEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingOverlay from '../src/ui/screen-loading-overlay';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import KeyboardView from '../src/ui/KeyboardView';
import InfoToggleIcon from '../src/ui/info-toggle-icon';
import NumericKeypad from '../src/ui/numeric-keypad';
import SelectedWalletSwitcher from '../src/ui/selected-wallet-switcher';
import { useNavigationInsets } from '../src/ui/navigation';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useSwipeDownDismiss } from '../src/ui/use-swipe-down-dismiss';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { FOOTER_NAV_BOTTOM_OFFSET, FOOTER_NAV_RESERVED_SPACE } from '../src/ui/footer-nav';
import { useNotice } from '../src/notice/notice-provider';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import {
  FOURTEEN_CONTRACT,
  TRX_CONTRACT,
  TRX_LOGO,
  TRX_TOKEN_ID,
  USDT_CONTRACT,
  getCustomTokenCatalog,
  getTokenDetails,
  getTronscanTokenList,
  getWalletSnapshot,
} from '../src/services/tron/api';
import {
  FOURTEEN_SWAP_INPUT,
  FOURTEEN_SWAP_TARGETS,
  getActiveSwapWallet,
  getSwapQuotes,
  type SunioRoute,
  type SwapTokenMeta,
} from '../src/services/swap/sunio';
import { saveFourteenSwapDraft } from '../src/services/swap/draft';
import { BackspaceIcon, CloseIcon } from '../src/ui/ui-icons';
import {
  getAllWalletPortfolios,
  getWalletPortfolio,
  type PortfolioAsset,
} from '../src/services/wallet/portfolio';
import {
  getWalletById,
  setActiveWalletId,
  type WalletMeta,
} from '../src/services/wallet/storage';
import { useWalletSession } from '../src/wallet/wallet-session';

const SWAP_INFO_TITLE = 'How swap works';
const SWAP_INFO_TEXT =
  'Choose the active signing wallet, select the input asset, enter the amount, and review the available routes. This screen builds quotes and routing options only.\n\nSlippage protects the minimum amount you receive. A route can be visible here and still be marked as not executable until the current quote and route checks pass.\n\nThe real resource check, protected minimum, and final signature happen on the confirmation step before any swap is sent.';

function resolveParam(value: string | string[] | undefined) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return String(value[0] || '');
  return '';
}

function normalizeAmountInput(value: string) {
  const clean = String(value || '').replace(',', '.');
  const filtered = clean.replace(/[^\d.]/g, '');
  if (filtered === '.') return '0.';
  const firstDot = filtered.indexOf('.');

  if (firstDot === -1) {
    return filtered;
  }

  const normalized = `${filtered.slice(0, firstDot + 1)}${filtered
    .slice(firstDot + 1)
    .replace(/\./g, '')}`;

  return normalized.startsWith('.') ? `0${normalized}` : normalized;
}

function formatTokenAmount(value?: number, maximumFractionDigits = 6) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

function formatUsd(value?: number) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : 0;

  return safe.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: safe >= 1 ? 2 : 4,
    maximumFractionDigits: safe >= 1 ? 2 : 6,
  });
}

function getProtectedSwapReserve(token?: Pick<SwapTokenMeta, 'tokenId' | 'decimals'> | null) {
  if (!token || String(token.tokenId || '').trim() !== FOURTEEN_CONTRACT) {
    return 0;
  }

  const decimals = Number.isFinite(token.decimals) ? Number(token.decimals) : 6;
  return 1 / 10 ** Math.max(0, decimals);
}

function getProtectedSpendableSwapBalance(
  token?: Pick<SwapTokenMeta, 'tokenId' | 'decimals' | 'balance'> | null
) {
  const balance = Number.isFinite(token?.balance) ? Number(token?.balance) : 0;
  return Math.max(0, balance - getProtectedSwapReserve(token));
}

function buildRoutePathLabel(route: SunioRoute) {
  if (route.symbols.length > 0) {
    return route.symbols.join(' → ');
  }

  return `${route.fromTokenSymbol} → ${route.toTokenSymbol}`;
}

function amountAsNumber(value: string) {
  const parsed = Number.parseFloat(
    String(value || '0')
      .replace(/,/g, '')
      .trim()
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSearchTerm(value: string) {
  return String(value || '').trim().toLowerCase();
}

type WalletSwitcherItem = {
  id: string;
  name: string;
  address: string;
  kind: WalletMeta['kind'];
  balanceDisplay: string;
};

type SwapAssetChoice = PortfolioAsset & SwapTokenMeta;

function getNonZeroAssets(assets: PortfolioAsset[]) {
  return assets.filter((asset) => Number.isFinite(asset.amount) && asset.amount > 0);
}

function sortAssetsByValue(assets: PortfolioAsset[]) {
  return [...assets].sort((a, b) => {
    if (b.valueInUsd !== a.valueInUsd) return b.valueInUsd - a.valueInUsd;
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function buildSwapAssetChoices(input: {
  assets: PortfolioAsset[];
  walletSnapshot: Awaited<ReturnType<typeof getWalletSnapshot>>;
}): SwapAssetChoice[] {
  const { assets, walletSnapshot } = input;
  const trc20Map = new Map(walletSnapshot.trc20Assets.map((asset) => [asset.tokenId, asset]));

  return assets.map((asset) => {
    if (asset.id === TRX_TOKEN_ID) {
      return {
        ...asset,
        tokenId: TRX_TOKEN_ID,
        symbol: 'TRX',
        name: 'TRX',
        address: TRX_CONTRACT,
        decimals: 6,
        logo: asset.logo || TRX_LOGO,
        isNative: true,
      };
    }

    const token = trc20Map.get(asset.id);

    return {
      ...asset,
      tokenId: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      address: token?.tokenId || asset.id,
      decimals: token?.tokenDecimal ?? 6,
      logo: asset.logo,
      isNative: false,
    };
  });
}

function dedupeSwapAssetChoices(items: SwapAssetChoice[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.tokenId || item.address || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCatalogSwapAssetChoices(
  items: { id: string; name: string; abbr: string; logo?: string }[]
): SwapAssetChoice[] {
  return items
    .map((item) => {
      const tokenId = String(item.id || '').trim();
      if (!tokenId || tokenId === TRX_TOKEN_ID) return null;

      return {
        id: tokenId,
        tokenId,
        name: String(item.name || item.abbr || tokenId).trim(),
        symbol: String(item.abbr || item.name || 'TOKEN').trim() || 'TOKEN',
        address: tokenId,
        decimals: 6,
        logo: item.logo,
        isNative: false,
        amountDisplay: '0',
        valueDisplay: '$0.00',
        deltaDisplay: '—',
        deltaTone: 'dim',
        amount: 0,
        valueInUsd: 0,
        deltaUsd24h: 0,
      } satisfies SwapAssetChoice;
    })
    .filter((item): item is SwapAssetChoice => Boolean(item));
}

export default function SwapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tokenId?: string | string[]; walletId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const [amountKeyboardVisible, setAmountKeyboardVisible] = useState(false);
  const contentBottomInset = useBottomInset(amountKeyboardVisible ? 312 : 0);
  const amountBackspaceActsAsClose = amount === '' || amount === '0';
  const notice = useNotice();
  const { setPendingWalletSelectionId } = useWalletSession();
  const scrollRef = useRef<any>(null);

  const requestedTokenId = resolveParam(params.tokenId).trim();
  const requestedWalletId = resolveParam(params.walletId).trim();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [walletChoices, setWalletChoices] = useState<WalletSwitcherItem[]>([]);
  const [tokenChoices, setTokenChoices] = useState<SwapAssetChoice[]>([]);
  const [walletOptionsOpen, setWalletOptionsOpen] = useState(false);
  const [sourceTokenOptionsOpen, setSourceTokenOptionsOpen] = useState(false);
  const [targetTokenOptionsOpen, setTargetTokenOptionsOpen] = useState(false);
  const [sourceTokenSearch, setSourceTokenSearch] = useState('');
  const [targetTokenSearch, setTargetTokenSearch] = useState('');
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);
  const [activeWallet, setActiveWallet] = useState<WalletMeta | null>(null);
  const [amount, setAmount] = useState('');
  const [sourceTokenId, setSourceTokenId] = useState('');
  const [targetTokenId, setTargetTokenId] = useState('');
  const [slippage, setSlippage] = useState('3.00');
  const [routes, setRoutes] = useState<SunioRoute[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [openingRouteId, setOpeningRouteId] = useState('');
  const [statusText, setStatusText] = useState('');
  const [errorText, setErrorText] = useState('');
  const quotesRequestRef = useRef(0);
  const [amountSectionY, setAmountSectionY] = useState(0);
  const sourceTokenIdRef = useRef('');
  const targetTokenIdRef = useRef('');

  useEffect(() => {
    sourceTokenIdRef.current = sourceTokenId;
  }, [sourceTokenId]);

  useEffect(() => {
    targetTokenIdRef.current = targetTokenId;
  }, [targetTokenId]);

  useChromeLoading(loading || refreshing);

  const closeInlinePickers = useCallback(() => {
    setWalletOptionsOpen(false);
    setSourceTokenOptionsOpen(false);
    setTargetTokenOptionsOpen(false);
  }, []);

  const loadSwapContext = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');

      const [aggregate, currentWallet, explicitWallet] = await Promise.all([
        getAllWalletPortfolios({ force: Boolean(refreshing) }),
        getActiveSwapWallet(),
        requestedWalletId ? getWalletById(requestedWalletId) : Promise.resolve(null),
      ]);

      const baseWallet = explicitWallet ?? currentWallet;

      if (!baseWallet) {
        throw new Error('No active wallet selected.');
      }

      const signingWalletItems = aggregate.items.filter((item) => item.wallet.kind !== 'watch-only');
      const resolvedWallet =
        baseWallet.kind !== 'watch-only'
          ? baseWallet
          : signingWalletItems[0]?.wallet ?? null;

      if (!resolvedWallet) {
        notice.showNeutralNotice(
          'Swap requires a signing wallet. Import or switch to a full-access wallet first.',
          3200
        );
        router.replace('/wallet');
        setActiveWallet(null);
        setWalletChoices([]);
        setTokenChoices([]);
        setSourceTokenId('');
        setTargetTokenId('');
        return;
      }

      if (resolvedWallet.id !== currentWallet?.id) {
        await setActiveWalletId(resolvedWallet.id);
        setPendingWalletSelectionId(resolvedWallet.id);
      }

      const [portfolio, walletSnapshot, customCatalog, tronscanCatalog] = await Promise.all([
        getWalletPortfolio(resolvedWallet.address, { force: Boolean(refreshing) }),
        getWalletSnapshot(resolvedWallet.address, { force: Boolean(refreshing) }),
        getCustomTokenCatalog(resolvedWallet.id).catch(() => []),
        getTronscanTokenList().catch(() => []),
      ]);

      const nextWalletChoices = signingWalletItems.map((item) => ({
        id: item.wallet.id,
        name: item.wallet.name,
        address: item.wallet.address,
        kind: item.wallet.kind,
        balanceDisplay: item.portfolio?.totalBalanceDisplay ?? '$0.00',
      }));

      const sendableAssets = buildSwapAssetChoices({
        assets: sortAssetsByValue(getNonZeroAssets(portfolio.assets)),
        walletSnapshot,
      });

      const catalogTargets = dedupeSwapAssetChoices([
        ...buildCatalogSwapAssetChoices(customCatalog),
        ...buildCatalogSwapAssetChoices(tronscanCatalog),
      ]);

      const defaultTargets = dedupeSwapAssetChoices([
        ...sendableAssets,
        ...catalogTargets,
        {
          id: TRX_TOKEN_ID,
          tokenId: TRX_TOKEN_ID,
          name: 'TRX',
          symbol: 'TRX',
          address: TRX_CONTRACT,
          decimals: 6,
          logo: TRX_LOGO,
          isNative: true,
          amountDisplay: '0',
          valueDisplay: '$0.00',
          deltaDisplay: '—',
          deltaTone: 'dim',
          amount: 0,
          valueInUsd: 0,
          deltaUsd24h: 0,
        },
        {
          id: USDT_CONTRACT,
          tokenId: USDT_CONTRACT,
          name: 'USDT',
          symbol: 'USDT',
          address: USDT_CONTRACT,
          decimals: 6,
          logo: FOURTEEN_SWAP_TARGETS.USDT.logo,
          isNative: false,
          amountDisplay: '0',
          valueDisplay: '$0.00',
          deltaDisplay: '—',
          deltaTone: 'dim',
          amount: 0,
          valueInUsd: 0,
          deltaUsd24h: 0,
        },
        {
          id: FOURTEEN_CONTRACT,
          tokenId: FOURTEEN_CONTRACT,
          name: '4TEEN',
          symbol: '4TEEN',
          address: FOURTEEN_CONTRACT,
          decimals: 6,
          logo: FOURTEEN_SWAP_INPUT.logo,
          isNative: false,
          amountDisplay: '0',
          valueDisplay: '$0.00',
          deltaDisplay: '—',
          deltaTone: 'dim',
          amount: 0,
          valueInUsd: 0,
          deltaUsd24h: 0,
        },
      ]);

      const nextRequestedSource =
        sendableAssets.find((item) => item.tokenId === requestedTokenId) ??
        sendableAssets.find((item) => item.tokenId === sourceTokenIdRef.current) ??
        sendableAssets.find((item) => item.tokenId === FOURTEEN_CONTRACT) ??
        sendableAssets[0] ??
        null;

      const nextTargetChoices = defaultTargets.filter(
        (item) => item.tokenId !== nextRequestedSource?.tokenId
      );
      const nextTarget =
        nextTargetChoices.find((item) => item.tokenId === targetTokenIdRef.current) ??
        nextTargetChoices.find((item) => item.tokenId === TRX_TOKEN_ID) ??
        nextTargetChoices[0] ??
        null;

      setActiveWallet(resolvedWallet);
      setWalletChoices(nextWalletChoices);
      setTokenChoices(defaultTargets);
      setSourceTokenId(nextRequestedSource?.tokenId || '');
      setTargetTokenId(nextTarget?.tokenId || '');
      setWalletOptionsOpen(false);
      setSourceTokenOptionsOpen(false);
      setTargetTokenOptionsOpen(false);
    } catch (error) {
      console.error(error);
      setActiveWallet(null);
      setWalletChoices([]);
      setTokenChoices([]);
      setSourceTokenId('');
      setTargetTokenId('');
      setErrorText(error instanceof Error ? error.message : 'Failed to load swap.');
    } finally {
      setLoading(false);
    }
  }, [notice, refreshing, requestedTokenId, requestedWalletId, router, setPendingWalletSelectionId]);

  const refreshSwapContext = useCallback(async () => {
    try {
      setRefreshing(true);
      await loadSwapContext();
    } finally {
      setRefreshing(false);
    }
  }, [loadSwapContext]);

  useEffect(() => {
    void loadSwapContext();
  }, [loadSwapContext]);

  const selectedWalletOption = walletChoices.find((wallet) => wallet.id === activeWallet?.id) ?? null;
  const selectedSourceToken = tokenChoices.find((asset) => asset.tokenId === sourceTokenId) ?? null;
  const selectedTargetToken = tokenChoices.find((asset) => asset.tokenId === targetTokenId) ?? null;
  const visibleWalletChoices = walletChoices.filter((wallet) => wallet.id !== activeWallet?.id);
  const visibleSourceTokenChoices = tokenChoices.filter((asset) => {
    if (asset.tokenId === sourceTokenId || asset.amount <= 0) return false;

    const query = normalizeSearchTerm(sourceTokenSearch);
    if (!query) return true;

    return (
      normalizeSearchTerm(asset.name).includes(query) ||
      normalizeSearchTerm(asset.symbol).includes(query) ||
      normalizeSearchTerm(asset.tokenId).includes(query)
    );
  });
  const visibleTargetTokenChoices = tokenChoices.filter((asset) => {
    if (asset.tokenId === sourceTokenId || asset.tokenId === targetTokenId) return false;

    const query = normalizeSearchTerm(targetTokenSearch);
    if (!query) return true;

    return (
      normalizeSearchTerm(asset.name).includes(query) ||
      normalizeSearchTerm(asset.symbol).includes(query) ||
      normalizeSearchTerm(asset.tokenId).includes(query)
    );
  });

  useEffect(() => {
    const safeAmount = normalizeAmountInput(amount);

    if (!selectedSourceToken || !selectedTargetToken || !safeAmount || amountAsNumber(safeAmount) <= 0) {
      quotesRequestRef.current += 1;
      setRoutes([]);
      setStatusText('');
      setQuotesLoading(false);
      return;
    }

    const requestId = ++quotesRequestRef.current;
    const timeoutId = setTimeout(() => {
      setQuotesLoading(true);

      void getSwapQuotes({
        amountIn: safeAmount,
        sourceToken: selectedSourceToken,
        targetToken: selectedTargetToken,
      })
        .then((nextRoutes) => {
          if (quotesRequestRef.current !== requestId) return;
          setRoutes(nextRoutes);
          setStatusText(
            nextRoutes[0]
              ? `Best route: ${nextRoutes[0].providerName} · ${formatTokenAmount(
                  nextRoutes[0].expectedOut
                )} ${nextRoutes[0].toTokenSymbol}`
              : 'No routes available right now.'
          );
        })
        .catch((error) => {
          if (quotesRequestRef.current !== requestId) return;
          console.error(error);
          setRoutes([]);
          setStatusText(error instanceof Error ? error.message : 'Failed to load swap routes.');
        })
        .finally(() => {
          if (quotesRequestRef.current === requestId) {
            setQuotesLoading(false);
          }
        });
    }, 260);

    return () => clearTimeout(timeoutId);
  }, [amount, selectedSourceToken, selectedTargetToken]);

  const bestRoute = routes[0] || null;
  const spendableInputBalance = getProtectedSpendableSwapBalance(selectedSourceToken);
  const enteredAmount = amountAsNumber(amount);
  const canContinue =
    activeWallet?.kind !== 'watch-only' &&
    enteredAmount > 0 &&
    enteredAmount <= spendableInputBalance &&
    routes.length > 0 &&
    !quotesLoading;

  const handleSelectMax = useCallback(() => {
    if (!selectedSourceToken) return;
    setAmount(formatTokenAmount(spendableInputBalance, selectedSourceToken.decimals));
  }, [selectedSourceToken, spendableInputBalance]);

  const openAmountKeyboard = useCallback(() => {
    closeInlinePickers();
    Keyboard.dismiss();
    setAmountKeyboardVisible(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const targetY = Math.max(0, amountSectionY - 120);
        if (typeof scrollRef.current?.scrollToPosition === 'function') {
          scrollRef.current.scrollToPosition(0, targetY, true);
          return;
        }
        scrollRef.current?.scrollTo?.({ y: targetY, animated: true });
      }, 60);
    });
  }, [amountSectionY, closeInlinePickers]);

  const closeAmountKeyboard = useCallback(() => {
    setAmountKeyboardVisible(false);
  }, []);
  const amountKeyboardSwipeGesture = useSwipeDownDismiss(closeAmountKeyboard);

  const handleAmountSectionLayout = useCallback((event: LayoutChangeEvent) => {
    setAmountSectionY(event.nativeEvent.layout.y);
  }, []);

  const handleAmountDigitPress = useCallback((digit: string) => {
    setAmount((prev) => normalizeAmountInput(`${prev}${digit}`));
  }, []);

  const handleAmountDotPress = useCallback(() => {
    setAmount((prev) => {
      if (!prev) return '0.';
      if (prev.includes('.')) return prev;
      return normalizeAmountInput(`${prev}.`);
    });
  }, []);

  const handleAmountBackspace = useCallback(() => {
    setAmount((prev) => {
      if (prev === '' || prev === '0') {
        closeAmountKeyboard();
        return prev;
      }
      return prev.slice(0, -1);
    });
  }, [closeAmountKeyboard]);

  const handleOpenReview = useCallback(
    async (route: SunioRoute) => {
      if (openingRouteId) return;

      if (activeWallet?.kind === 'watch-only') {
        notice.showErrorNotice(
          'Watch-only wallet cannot sign swap. Switch to a full-access wallet first.',
          2800
        );
        return;
      }

      if (!enteredAmount || enteredAmount <= 0) {
        notice.showErrorNotice('Enter amount first.', 2200);
        return;
      }

      if (enteredAmount > spendableInputBalance) {
        notice.showErrorNotice(
          selectedSourceToken?.tokenId === FOURTEEN_CONTRACT
            ? 'You must keep at least 0.000001 4TEEN in the wallet.'
            : `Not enough ${selectedSourceToken?.symbol || 'token'} balance for this swap.`,
          2600
        );
        return;
      }

      if (!route.isExecutable) {
        notice.showErrorNotice('This quote is visible, but this route cannot be executed yet.', 2800);
        return;
      }

      try {
        closeAmountKeyboard();
        setOpeningRouteId(route.id);

        await saveFourteenSwapDraft({
          walletId: activeWallet?.id,
          amountIn: amount,
          slippage,
          sourceToken: selectedSourceToken!,
          targetToken: selectedTargetToken!,
          preferredRouteId: route.id,
        });
        router.push('/swap-confirm');
      } catch (error) {
        console.error(error);
        notice.showErrorNotice(
          error instanceof Error ? error.message : 'Failed to open swap review.',
          3200
        );
      } finally {
        setOpeningRouteId('');
      }
    },
    [
      amount,
      enteredAmount,
      openingRouteId,
      spendableInputBalance,
      notice,
      router,
      slippage,
      activeWallet?.id,
      activeWallet?.kind,
      selectedSourceToken,
      selectedTargetToken,
      closeAmountKeyboard,
    ]
  );

  const handleToggleWalletOptions = useCallback(() => {
    if (visibleWalletChoices.length <= 0) {
      notice.showNeutralNotice('No other wallets available.', 2200);
      return;
    }
    closeAmountKeyboard();
    setSourceTokenOptionsOpen(false);
    setTargetTokenOptionsOpen(false);
    setWalletOptionsOpen((prev) => !prev);
  }, [closeAmountKeyboard, notice, visibleWalletChoices.length]);

  const handleChooseWallet = useCallback(async (wallet: WalletSwitcherItem) => {
    try {
      setSwitchingWalletId(wallet.id);
      setAmount('');
      closeAmountKeyboard();
      closeInlinePickers();
      await setActiveWalletId(wallet.id);
      setPendingWalletSelectionId(wallet.id);
      await loadSwapContext();
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to switch swap wallet.', 2400);
    } finally {
      setSwitchingWalletId(null);
    }
  }, [closeAmountKeyboard, closeInlinePickers, loadSwapContext, notice, setPendingWalletSelectionId]);

  const handleToggleSourceTokenOptions = useCallback(() => {
    if (visibleSourceTokenChoices.length <= 0) {
      notice.showNeutralNotice('No other funded assets in this wallet.', 2200);
      return;
    }
    closeAmountKeyboard();
    setWalletOptionsOpen(false);
    setTargetTokenOptionsOpen(false);
    setTargetTokenSearch('');
    setSourceTokenOptionsOpen((prev) => !prev);
  }, [closeAmountKeyboard, notice, visibleSourceTokenChoices.length]);

  const handleChooseSourceToken = useCallback((asset: SwapAssetChoice) => {
    setAmount('');
    closeAmountKeyboard();
    Keyboard.dismiss();
    setWalletOptionsOpen(false);
    setSourceTokenOptionsOpen(false);
    setSourceTokenSearch('');
    if (asset.tokenId === targetTokenId) {
      const fallbackTarget = tokenChoices.find((item) => item.tokenId !== asset.tokenId);
      setTargetTokenId(fallbackTarget?.tokenId || '');
    }
    setSourceTokenId(asset.tokenId);
  }, [closeAmountKeyboard, targetTokenId, tokenChoices]);

  const handleToggleTargetTokenOptions = useCallback(() => {
    if (visibleTargetTokenChoices.length <= 0) {
      notice.showNeutralNotice('No target assets available for this wallet yet.', 2200);
      return;
    }
    closeAmountKeyboard();
    setWalletOptionsOpen(false);
    setSourceTokenOptionsOpen(false);
    setSourceTokenSearch('');
    setTargetTokenOptionsOpen((prev) => !prev);
  }, [closeAmountKeyboard, notice, visibleTargetTokenChoices.length]);

  const handleChooseTargetToken = useCallback(
    async (asset: SwapAssetChoice) => {
      try {
        closeAmountKeyboard();
        Keyboard.dismiss();
        setWalletOptionsOpen(false);
        setTargetTokenOptionsOpen(false);
        setTargetTokenSearch('');

        if (activeWallet && asset.amount <= 0) {
          const details = await getTokenDetails(activeWallet.address, asset.tokenId, false, activeWallet.id);

          setTokenChoices((current) =>
            current.map((item) =>
              item.tokenId === asset.tokenId
                ? {
                    ...item,
                    name: details.name || item.name,
                    symbol: details.symbol || item.symbol,
                    address: details.address || item.address,
                    decimals: Number.isFinite(details.decimals) ? details.decimals : item.decimals,
                    logo: details.logo || item.logo,
                    valueDisplay: item.valueDisplay || '$0.00',
                    amountDisplay: item.amountDisplay || '0',
                  }
                : item
            )
          );
        }

        setTargetTokenId(asset.tokenId);
      } catch (error) {
        console.error(error);
        notice.showErrorNotice('Failed to load target token.', 2400);
      }
    },
    [activeWallet, closeAmountKeyboard, notice]
  );

  const slippageOptions = ['0.50', '1.00', '3.00'];

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScreenLoadingOverlay visible={refreshing || Boolean(switchingWalletId)} />
        {loading ? (
          <ScreenLoadingState label="Loading swap..." />
        ) : (
          <>
          <KeyboardView
            innerRef={(ref: any) => {
              scrollRef.current = ref;
            }}
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              { paddingTop: navInsets.top, paddingBottom: contentBottomInset },
            ]}
            enableAutomaticScroll={false}
            extraScrollHeight={0}
            refreshControl={
              <RefreshControl
                tintColor={colors.accent}
                colors={[colors.accent]}
                refreshing={refreshing}
                onRefresh={() => void refreshSwapContext()}
              />
            }
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={() => {
              closeAmountKeyboard();
              closeInlinePickers();
            }}
          >
            <ScreenBrow
              label="SWAP"
              variant="backLink"
              onLabelPress={() => setInfoExpanded((prev) => !prev)}
              labelAccessory={<InfoToggleIcon expanded={infoExpanded} />}
            />

            {infoExpanded ? (
              <View style={styles.infoPanel}>
                <Text style={styles.infoTitle}>{SWAP_INFO_TITLE}</Text>
                <Text style={styles.infoText}>{SWAP_INFO_TEXT}</Text>
              </View>
            ) : null}

            <View style={styles.swapSelectionBlock}>
              <SelectedWalletSwitcher
                wallet={
                  activeWallet
                    ? {
                        id: activeWallet.id,
                        name: activeWallet.name,
                        address: activeWallet.address,
                        kind: activeWallet.kind,
                        balanceDisplay: selectedWalletOption?.balanceDisplay ?? '$0.00',
                      }
                    : null
                }
                visibleWalletChoices={visibleWalletChoices}
                walletOptionsOpen={walletOptionsOpen}
                switchingWalletId={switchingWalletId}
                onToggle={handleToggleWalletOptions}
                onChooseWallet={(wallet) => {
                  void handleChooseWallet(wallet);
                }}
                emptyTitle="No wallet selected"
                emptyBody="Create or import a full-access wallet first."
              />
            </View>

            <View style={styles.swapSelectionBlock}>
              <Text style={styles.swapSelectionEyebrow}>SELECTED ASSET · TAP TO SWITCH</Text>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.swapAssetRow}
                onPress={handleToggleSourceTokenOptions}
              >
                <View style={styles.swapAssetLeft}>
                  <Image
                    source={{ uri: selectedSourceToken?.logo || FOURTEEN_SWAP_INPUT.logo }}
                    style={styles.swapAssetLogo}
                    contentFit="contain"
                  />

                  <View style={styles.swapAssetMeta}>
                    <Text style={styles.swapAssetName}>
                      {selectedSourceToken?.name || 'Select token'}
                    </Text>
                    <Text style={styles.swapAssetAmount}>{selectedSourceToken?.symbol || 'TOKEN'}</Text>
                  </View>
                </View>

                <View style={styles.swapAssetRight}>
                  <Text style={styles.swapAssetValue}>{selectedSourceToken?.valueDisplay || '$0.00'}</Text>
                  <Text style={styles.swapAssetAction}>{selectedSourceToken?.amountDisplay || '0'}</Text>
                </View>
              </TouchableOpacity>

              {sourceTokenOptionsOpen ? (
                <View style={styles.swapPinnedSearchWrap}>
                  <TextInput
                    value={sourceTokenSearch}
                    onChangeText={setSourceTokenSearch}
                    placeholder="Filter assets"
                    placeholderTextColor={colors.textDim}
                    style={styles.swapTokenSearchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    selectionColor={colors.accent}
                    onFocus={closeAmountKeyboard}
                  />
                </View>
              ) : null}
            </View>

            {sourceTokenOptionsOpen ? (
              <ScrollView
                style={styles.swapTokenOptionsList}
                contentContainerStyle={styles.swapTokenOptionsContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {visibleSourceTokenChoices.map((asset) => (
                  <TouchableOpacity
                    key={asset.tokenId}
                    activeOpacity={0.9}
                    style={styles.swapAssetOptionRow}
                    onPress={() => handleChooseSourceToken(asset)}
                  >
                    <View style={styles.swapAssetLeft}>
                      <Image
                        source={{ uri: asset.logo || FOURTEEN_SWAP_INPUT.logo }}
                        style={styles.swapAssetLogo}
                        contentFit="contain"
                      />

                      <View style={styles.swapAssetMeta}>
                        <Text style={styles.swapAssetName}>{asset.name}</Text>
                        <Text style={styles.swapAssetAmount}>{asset.symbol}</Text>
                      </View>
                    </View>

                    <View style={styles.swapAssetRight}>
                      <Text style={styles.swapAssetValue}>{asset.valueDisplay}</Text>
                      <Text style={styles.swapAssetAction}>{asset.amountDisplay}</Text>
                    </View>
                  </TouchableOpacity>
                ))}

                {visibleSourceTokenChoices.length === 0 ? (
                  <View style={styles.swapTokenEmptyState}>
                    <Text style={styles.swapTokenEmptyText}>Nothing matched this filter.</Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}

            <View style={styles.swapSectionBlock} onLayout={handleAmountSectionLayout}>
              <View style={styles.swapFieldHeaderRow}>
                <Text style={styles.swapSectionFieldTitle}>AMOUNT</Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleSelectMax}
                  style={styles.swapInputMaxButton}
                >
                  <Text style={styles.swapInputMaxButtonText}>MAX</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                activeOpacity={1}
                onPress={openAmountKeyboard}
                style={[styles.swapInputShell, styles.swapInputShellAmount]}
              >
                <TextInput
                  value={amount}
                  onChangeText={(value) => setAmount(normalizeAmountInput(value))}
                  placeholder="0.00"
                  placeholderTextColor={colors.textDim}
                  style={styles.swapAmountInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  showSoftInputOnFocus={false}
                  onFocus={openAmountKeyboard}
                  selectionColor={colors.accent}
                />

                <View style={styles.swapInputSuffix}>
                  <Image
                    source={{ uri: selectedSourceToken?.logo || FOURTEEN_SWAP_INPUT.logo }}
                    style={styles.swapInputTokenLogo}
                    contentFit="contain"
                  />
                  <Text style={styles.swapInputTokenLabel}>
                    {selectedSourceToken?.symbol || 'TOKEN'}
                  </Text>
                </View>
              </TouchableOpacity>

              <Text style={styles.swapHint}>
                {selectedSourceToken?.valueInUsd && selectedSourceToken?.amount
                  ? `${selectedSourceToken.symbol} price: ${formatUsd(
                      selectedSourceToken.valueInUsd / Math.max(selectedSourceToken.amount, 1e-9)
                    )}`
                  : 'Choose the amount you want to swap from the selected token.'}
              </Text>
            </View>

            <View style={styles.swapSectionBlock}>
              <Text style={styles.swapSelectionEyebrow}>RECEIVE ASSET · TAP TO SWITCH</Text>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.swapAssetRow}
                onPress={handleToggleTargetTokenOptions}
              >
                <View style={styles.swapAssetLeft}>
                  <Image
                    source={{ uri: selectedTargetToken?.logo || FOURTEEN_SWAP_TARGETS.TRX.logo }}
                    style={styles.swapAssetLogo}
                    contentFit="contain"
                  />

                  <View style={styles.swapAssetMeta}>
                    <Text style={styles.swapAssetName}>
                      {selectedTargetToken?.name || 'Select token'}
                    </Text>
                    <Text style={styles.swapAssetAmount}>{selectedTargetToken?.symbol || 'TOKEN'}</Text>
                  </View>
                </View>

                <View style={styles.swapAssetRight}>
                  <Text style={styles.swapAssetValue}>
                    {bestRoute ? formatTokenAmount(bestRoute.expectedOut) : selectedTargetToken?.valueDisplay || '$0.00'}
                  </Text>
                  <Text style={styles.swapAssetAction}>
                    {bestRoute?.providerName || selectedTargetToken?.symbol || 'TOKEN'}
                  </Text>
                </View>
              </TouchableOpacity>

              {targetTokenOptionsOpen ? (
                <View style={styles.swapPinnedSearchWrap}>
                  <TextInput
                    value={targetTokenSearch}
                    onChangeText={setTargetTokenSearch}
                    placeholder="Filter assets"
                    placeholderTextColor={colors.textDim}
                    style={styles.swapTokenSearchInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    selectionColor={colors.accent}
                    onFocus={closeAmountKeyboard}
                  />
                </View>
              ) : null}
            </View>

            {targetTokenOptionsOpen ? (
              <ScrollView
                style={styles.swapTokenOptionsList}
                contentContainerStyle={styles.swapTokenOptionsContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {visibleTargetTokenChoices.map((asset) => (
                  <TouchableOpacity
                    key={asset.tokenId}
                    activeOpacity={0.9}
                    style={styles.swapAssetOptionRow}
                    onPress={() => handleChooseTargetToken(asset)}
                  >
                    <View style={styles.swapAssetLeft}>
                      <Image
                        source={{ uri: asset.logo || FOURTEEN_SWAP_TARGETS.TRX.logo }}
                        style={styles.swapAssetLogo}
                        contentFit="contain"
                      />

                      <View style={styles.swapAssetMeta}>
                        <Text style={styles.swapAssetName}>{asset.name}</Text>
                        <Text style={styles.swapAssetAmount}>{asset.symbol}</Text>
                      </View>
                    </View>

                    <View style={styles.swapAssetRight}>
                      <Text style={styles.swapAssetValue}>{asset.valueDisplay}</Text>
                      <Text style={styles.swapAssetAction}>{asset.amountDisplay}</Text>
                    </View>
                  </TouchableOpacity>
                ))}

                {visibleTargetTokenChoices.length === 0 ? (
                  <View style={styles.swapTokenEmptyState}>
                    <Text style={styles.swapTokenEmptyText}>Nothing matched this filter.</Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}

            <View style={styles.swapSectionBlock}>
              <View style={styles.swapFieldHeaderRow}>
                <Text style={styles.swapSectionFieldTitle}>PRICE TOLERANCE</Text>
                <Text style={styles.swapInlineMeta}>Tap to change</Text>
              </View>

              <View style={styles.slippageRow}>
                {slippageOptions.map((option) => {
                  const active = slippage === option;

                  return (
                    <TouchableOpacity
                      key={option}
                      activeOpacity={0.9}
                      style={[styles.slippageButton, active ? styles.slippageButtonActive : null]}
                      onPress={() => {
                        closeAmountKeyboard();
                        setSlippage(option);
                      }}
                    >
                      <Text
                        style={[
                          styles.slippageLabel,
                          active ? styles.slippageLabelActive : null,
                        ]}
                      >
                        {option}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.routesHeader}>
              <Text style={styles.routesTitle}>ROUTES</Text>
              {quotesLoading ? <ActivityIndicator color={colors.accent} size="small" /> : null}
            </View>

            {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}

            {errorText ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{errorText}</Text>
              </View>
            ) : null}

            {!amount || enteredAmount <= 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Enter amount to preview swap routes.</Text>
              </View>
            ) : routes.length === 0 && !quotesLoading ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No routes available right now.</Text>
              </View>
            ) : (
              <View style={styles.routesList}>
                {routes.map((route) => {
                  const routeBusy = openingRouteId === route.id;
                  const disabled =
                    routeBusy || openingRouteId !== '' || !canContinue || !route.isExecutable;

                  return (
                    <View key={route.id} style={styles.routeCard}>
                      <View style={styles.routeTopRow}>
                        <View>
                          <Text style={styles.routeEyebrow}>ROUTE</Text>
                          <Text style={styles.routeReceiveValue}>
                            {formatTokenAmount(route.expectedOut)} {route.toTokenSymbol}
                          </Text>
                          <Text style={styles.routeMinReceived}>
                            Min protected by {slippage}% slippage
                          </Text>
                        </View>

                        <View style={styles.providerBadge}>
                          <Text style={styles.providerBadgeText}>{route.providerName}</Text>
                        </View>
                      </View>

                      <View style={styles.routeDetailRow}>
                        <Text style={styles.routeDetailLabel}>ROUTE</Text>
                        <Text style={styles.routeDetailValue}>{buildRoutePathLabel(route)}</Text>
                      </View>

                      <View style={styles.routeDetailRow}>
                        <Text style={styles.routeDetailLabel}>DEX</Text>
                        <Text style={styles.routeDetailValue}>{route.routeLabel}</Text>
                      </View>

                      <View style={styles.routeDetailRow}>
                        <Text style={styles.routeDetailLabel}>STATUS</Text>
                        <Text style={styles.routeDetailValue}>{route.executionLabel}</Text>
                      </View>

                      <View style={styles.routeDetailRow}>
                        <Text style={styles.routeDetailLabel}>PRICE IMPACT</Text>
                        <Text style={styles.routeDetailValue}>{route.impactLabel}</Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.9}
                        style={[styles.routeAction, disabled ? styles.routeActionDisabled : null]}
                        disabled={disabled}
                        onPress={() => void handleOpenReview(route)}
                      >
                        {routeBusy ? (
                          <ActivityIndicator color={colors.white} size="small" />
                        ) : (
                          <Text style={styles.routeActionText}>
                            {activeWallet?.kind === 'watch-only'
                              ? 'SIGNING WALLET REQUIRED'
                              : !route.isExecutable
                                ? 'UNAVAILABLE'
                                : 'CONTINUE'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </KeyboardView>
          {amountKeyboardVisible ? (
            <Pressable style={styles.amountKeyboardBackdrop} onPress={closeAmountKeyboard} />
          ) : null}
          {amountKeyboardVisible ? (
            <View
              style={[styles.amountKeyboardDock, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}
            >
              <GestureDetector gesture={amountKeyboardSwipeGesture}>
                <View style={styles.amountKeyboardHandleArea}>
                  <View style={styles.amountKeyboardHandle} />
                </View>
              </GestureDetector>
              <NumericKeypad
                onDigitPress={handleAmountDigitPress}
                onBackspacePress={handleAmountBackspace}
                showDot
                onDotPress={handleAmountDotPress}
                backspaceIcon={
                  amountBackspaceActsAsClose ? (
                    <CloseIcon width={22} height={22} />
                  ) : (
                    <BackspaceIcon width={22} height={22} />
                  )
                }
              />
            </View>
          ) : null}
          </>
        )}
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
    backgroundColor: colors.bg,
  },

  content: {
    gap: 0,
  },

  swapSelectionBlock: {
    marginBottom: 16,
  },

  swapSectionBlock: {
    marginBottom: 16,
  },

  swapSelectionEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    marginBottom: 8,
  },

  swapWalletCard: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  swapWalletCardText: {
    flex: 1,
    gap: 4,
  },

  swapWalletOptionsList: {
    gap: 10,
    marginTop: -6,
    marginBottom: 16,
  },

  swapWalletOptionRow: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.14)',
    backgroundColor: 'rgba(255,105,0,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  swapWalletOptionText: {
    flex: 1,
    gap: 4,
  },

  swapWalletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  swapWalletName: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  swapActiveBadge: {
    color: colors.green,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  swapWalletBalance: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  swapWalletAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  swapAssetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 72,
  },

  swapTokenOptionsList: {
    marginTop: -4,
    marginBottom: 16,
    maxHeight: 272,
  },

  swapTokenOptionsContent: {
    gap: 10,
    paddingBottom: 2,
  },

  swapPinnedSearchWrap: {
    marginTop: 10,
  },

  swapTokenSearchInput: {
    minHeight: 50,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.20)',
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 14,
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  swapTokenEmptyState: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },

  swapTokenEmptyText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  swapAssetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 72,
  },

  swapAssetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 12,
  },

  swapAssetLogo: {
    width: 38,
    height: 38,
  },

  swapAssetMeta: {
    flex: 1,
    gap: 2,
  },

  swapAssetName: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  swapAssetAmount: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  swapAssetRight: {
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },

  swapAssetValue: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  swapAssetAction: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  infoPanel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
    marginBottom: 16,
  },

  infoTitle: {
    ...ui.bodyStrong,
  },

  infoText: {
    ...ui.body,
    lineHeight: 25,
  },

  swapFieldHeaderRow: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  swapSectionFieldTitle: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  swapInlineMeta: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
  },

  swapInputShell: {
    minHeight: layout.fieldHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 10,
  },

  swapInputShellAmount: {
    borderColor: 'rgba(255,105,0,0.20)',
    backgroundColor: 'rgba(255,105,0,0.08)',
  },

  swapAmountInput: {
    flex: 1,
    minHeight: layout.fieldHeight,
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
    paddingRight: 12,
  },

  swapInputSuffix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },

  swapInputTokenLogo: {
    width: 22,
    height: 22,
  },

  swapInputTokenLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  swapInputMaxButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  swapInputMaxButtonText: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.3,
  },

  swapHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
    marginTop: 8,
  },

  amountKeyboardDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: FOOTER_NAV_RESERVED_SPACE + FOOTER_NAV_BOTTOM_OFFSET - 23,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 18,
  },

  amountKeyboardHandleArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 12,
  },

  amountKeyboardHandle: {
    width: 42,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.textDim,
  },

  amountKeyboardBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },

  swapQuoteCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.sm,
    padding: 16,
    gap: 12,
  },

  swapQuoteTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  swapQuoteAmountBlock: {
    flex: 1,
  },

  swapQuoteValue: {
    color: colors.white,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: 'Sora_700Bold',
  },

  swapQuoteTokenLabel: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  swapQuoteTokenLogo: {
    width: 28,
    height: 28,
  },

  swapQuoteMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  swapQuoteMetaLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
    width: 88,
  },

  swapQuoteMetaValue: {
    flex: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'right',
  },

  slippageRow: {
    flexDirection: 'row',
    gap: 10,
  },

  slippageButton: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },

  slippageButtonActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,105,0,0.10)',
  },

  slippageLabel: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  slippageLabelActive: {
    color: colors.white,
  },

  estimateBlock: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 16,
    gap: 8,
  },

  estimateEyebrow: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },

  estimateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },

  estimateValue: {
    flex: 1,
    color: colors.white,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: 'Sora_700Bold',
  },

  estimateTokenWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  estimateTokenLogo: {
    width: 24,
    height: 24,
  },

  estimateTokenLabel: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  statusText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
    marginBottom: 12,
  },

  routesHeader: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  routesList: {
    gap: 12,
  },

  routesTitle: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  routeCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.sm,
    padding: 16,
    gap: 12,
  },

  routeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  routeEyebrow: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },

  routeReceiveValue: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: 'Sora_700Bold',
    marginTop: 2,
  },

  routeMinReceived: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },

  providerBadge: {
    minHeight: 30,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },

  providerBadgeText: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  routeDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  routeDetailLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
    width: 88,
  },

  routeDetailValue: {
    flex: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'right',
  },

  routeAction: {
    marginTop: 4,
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  routeActionDisabled: {
    backgroundColor: 'rgba(255,105,0,0.34)',
  },

  routeActionText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  emptyCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.sm,
    padding: 18,
  },

  emptyText: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
  },

  errorCard: {
    backgroundColor: 'rgba(255,48,73,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,48,73,0.18)',
    borderRadius: radius.sm,
    padding: 16,
  },

  errorText: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },
});
