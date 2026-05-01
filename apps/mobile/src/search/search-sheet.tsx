import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { colors, radius } from '../theme/tokens';
import { APP_HEADER_HEIGHT, APP_HEADER_TOP_PADDING, APP_HEADER_DROP_OFFSET, APP_HEADER_SIDE_PADDING } from '../ui/app-header.constants';
import ThinOrangeLoader from '../ui/thin-orange-loader';
import LottieIcon from '../ui/lottie-icon';
import { APP_SEARCH_ROUTES } from './search-routes';
import type {
  SearchQuickPageIcon,
  SearchSuggestion,
  SearchTokenItem,
} from './search-types';
import { openInAppBrowser } from '../utils/open-in-app-browser';
import { useNotice } from '../notice/notice-provider';
import { translateNow, useI18n } from '../i18n';
import {
  getCustomTokenCatalog,
  getCmcDexSearchToken,
  getTronscanTokenList,
  type CustomTokenCatalogItem,
  type TronscanTokenListItem,
} from '../services/tron/api';
import { getWalletPortfolio, type PortfolioAsset } from '../services/wallet/portfolio';
import {
  getActiveWallet,
  listWallets,
  type WalletMeta,
} from '../services/wallet/storage';
import {
  listSavedContacts,
  type SavedContact,
} from '../services/address-book';

import {
  AddressIcon,
  AirdropQuickIcon,
  AmbassadorQuickIcon,
  BuyQuickIcon,
  CreateAddWalletQuickIcon,
  LiquidityQuickIcon,
  PasteIcon,
  PreferencesIcon,
  SearchIcon,
  SelectWalletQuickIcon,
  SendQuickIcon,
  SwapQuickIcon,
  UnlockQuickIcon,
  WalletIcon,
  AddContactIcon as ContactIcon,
} from '../ui/ui-icons';

const searchMagnifierSource = require('../../assets/icons/search/search_magnifier.json');
const searchCloseSource = require('../../assets/icons/search/search_close.json');

function isTronAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());
}

function looksLikeUrl(value: string) {
  const safe = value.trim().toLowerCase();
  if (!safe) return false;

  return (
    safe.startsWith('http://') ||
    safe.startsWith('https://') ||
    safe.startsWith('www.') ||
    safe.includes('.')
  );
}

function normalize(value: string) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUrl(value: string) {
  const safe = value.trim();
  if (!safe) return safe;
  if (/^https?:\/\//i.test(safe)) return safe;
  if (safe.startsWith('www.')) return `https://${safe}`;
  if (safe.includes('.')) return `https://${safe}`;
  return safe;
}

function routeToSearchTerms(route: string) {
  const safe = String(route || '').trim().replace(/^\//, '');
  if (!safe) return [];

  return safe
    .split('/')
    .flatMap((part) => part.split(/[-_]/g))
    .map((part) => part.trim())
    .filter(Boolean);
}

function shortenMiddle(value: string, left = 6, right = 6) {
  const safe = String(value || '').trim();
  if (!safe) return '';
  if (safe.length <= left + right + 3) return safe;
  return `${safe.slice(0, left)}...${safe.slice(-right)}`;
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const map = new Map<string, T>();

  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }

  return Array.from(map.values());
}

function scoreTextMatch(query: string, candidates: string[]) {
  const q = normalize(query);
  if (!q) return 0;

  let best = 0;

  for (const rawCandidate of candidates) {
    const candidate = normalize(rawCandidate);
    if (!candidate) continue;

    if (candidate === q) {
      best = Math.max(best, 1000);
      continue;
    }

    if (candidate.startsWith(q)) {
      best = Math.max(best, 700 - Math.max(0, candidate.length - q.length));
      continue;
    }

    const wordIndex = candidate.indexOf(` ${q}`);
    if (wordIndex >= 0) {
      best = Math.max(best, 520 - wordIndex);
      continue;
    }

    const index = candidate.indexOf(q);
    if (index >= 0) {
      best = Math.max(best, 420 - index);
      continue;
    }
  }

  return best;
}

function sourceLabel(source: SearchTokenItem['source']) {
  if (source === 'portfolio') return translateNow('MY');
  if (source === 'custom') return translateNow('CUSTOM');
  if (source === 'cmc') return 'CMC';
  return translateNow('CATALOG');
}

function suggestionTagLabel(item: SearchSuggestion): string | null {
  if (item.type === 'route') return translateNow('PAGE');
  if (item.type === 'wallet') return translateNow('WALLET');
  if (item.type === 'contact') return translateNow('CONTACT');
  if (item.type === 'address') return translateNow('ADDRESS');
  if (item.type === 'url') return 'URL';
  return null;
}

function buildTokenSearchItems(params: {
  portfolioAssets: PortfolioAsset[];
  customTokens: CustomTokenCatalogItem[];
  catalogTokens: TronscanTokenListItem[];
}) {
  const portfolioItems: SearchTokenItem[] = params.portfolioAssets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    abbr: asset.symbol,
    logo: asset.logo,
    source: 'portfolio',
  }));

  const customItems: SearchTokenItem[] = params.customTokens.map((item) => ({
    id: item.id,
    name: item.name,
    abbr: item.abbr,
    logo: item.logo,
    source: 'custom',
  }));

  const catalogItems: SearchTokenItem[] = params.catalogTokens.map((item) => ({
    id: item.id,
    name: item.name,
    abbr: item.abbr,
    logo: item.logo,
    source: 'catalog',
  }));

  return uniqueById<SearchTokenItem>([
    ...portfolioItems,
    ...customItems,
    ...catalogItems,
  ]);
}

function renderQuickPageIcon(icon: SearchQuickPageIcon | undefined) {
  switch (icon) {
    case 'addWallet':
      return <CreateAddWalletQuickIcon width={18} height={18} />;
    case 'send':
      return <SendQuickIcon width={18} height={18} />;
    case 'swap':
      return <SwapQuickIcon width={18} height={18} />;
    case 'buy':
      return <BuyQuickIcon width={18} height={18} />;
    case 'unlock':
      return <UnlockQuickIcon width={18} height={18} />;
    case 'liquidity':
      return <LiquidityQuickIcon width={18} height={18} />;
    case 'ambassador':
      return <AmbassadorQuickIcon width={18} height={18} />;
    case 'airdrop':
      return <AirdropQuickIcon width={18} height={18} />;
    case 'wallet':
      return <SelectWalletQuickIcon width={18} height={18} />;
    default:
      return <WalletIcon width={18} height={18} />;
  }
}

function renderSuggestionIcon(item: SearchSuggestion) {
  if (item.type === 'route') {
    const matchedRoute = APP_SEARCH_ROUTES.find((route) => route.id === item.id);
    return renderQuickPageIcon(matchedRoute?.quickPageIcon);
  }

  if (item.type === 'wallet') {
    return <WalletIcon width={18} height={18} />;
  }

  if (item.type === 'contact') {
    return <ContactIcon width={18} height={18} />;
  }

  if (item.type === 'address') {
    return <AddressIcon width={18} height={18} />;
  }

  if (item.type === 'url') {
    return <SearchIcon width={18} height={18} />;
  }

  return <PreferencesIcon width={18} height={18} />;
}

type SearchSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export default function SearchSheet({ visible, onClose }: SearchSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const notice = useNotice();
  const { t } = useI18n();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchIconPlayToken, setSearchIconPlayToken] = useState(0);
  const [searchIconAnimating, setSearchIconAnimating] = useState(false);
  const [closeIconPlayToken, setCloseIconPlayToken] = useState(0);
  const [closeIconAnimating, setCloseIconAnimating] = useState(false);

  const [activeWallet, setActiveWallet] = useState<WalletMeta | null>(null);
  const [wallets, setWallets] = useState<WalletMeta[]>([]);
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [portfolioAssets, setPortfolioAssets] = useState<PortfolioAsset[]>([]);
  const [customTokens, setCustomTokens] = useState<CustomTokenCatalogItem[]>([]);
  const [catalogTokens, setCatalogTokens] = useState<TronscanTokenListItem[]>([]);
  const [liveContractToken, setLiveContractToken] = useState<SearchTokenItem | null>(null);

  const focusInput = useCallback((nextValue?: string) => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();

      if (typeof nextValue === 'string') {
        const cursor = nextValue.length;
        inputRef.current?.setNativeProps?.({
          selection: { start: cursor, end: cursor },
        });
      }
    });
  }, []);

  const loadIndex = useCallback(async () => {
    try {
      setLoading(true);

      const nextActiveWallet = await getActiveWallet();
      const [nextWallets, nextContacts] = await Promise.all([
        listWallets(),
        listSavedContacts(),
      ]);

      let nextPortfolioAssets: PortfolioAsset[] = [];
      let nextCustomTokens: CustomTokenCatalogItem[] = [];

      if (nextActiveWallet) {
        const [portfolio, customCatalog] = await Promise.all([
          getWalletPortfolio(nextActiveWallet.address).catch(() => null),
          getCustomTokenCatalog(nextActiveWallet.id).catch(() => []),
        ]);

        nextPortfolioAssets = portfolio?.assets ?? [];
        nextCustomTokens = customCatalog;
      }

      const nextCatalogTokens = await getTronscanTokenList().catch(() => []);

      setActiveWallet(nextActiveWallet);
      setWallets(nextWallets);
      setContacts(nextContacts);
      setPortfolioAssets(nextPortfolioAssets);
      setCustomTokens(nextCustomTokens);
      setCatalogTokens(nextCatalogTokens);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void loadIndex();
  }, [visible, loadIndex]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setLiveContractToken(null);
      setSearchIconAnimating(false);
      setCloseIconAnimating(false);
      return;
    }

    setSearchIconAnimating(true);
    setSearchIconPlayToken((value) => value + 1);

    const timer = setTimeout(() => {
      focusInput(query);
    }, 60);

    return () => clearTimeout(timer);
  }, [visible, focusInput, query]);

  const normalized = query.trim();

  const tokenItems = useMemo(
    () =>
      buildTokenSearchItems({
        portfolioAssets,
        customTokens,
        catalogTokens,
      }),
    [portfolioAssets, customTokens, catalogTokens]
  );

  useEffect(() => {
    if (!visible) return;

    const q = normalized;
    if (!isTronAddress(q)) {
      setLiveContractToken(null);
      return;
    }

    const normalizedQuery = normalize(q);
    const hasLocalExactMatch = tokenItems.some((token) => normalize(token.id) === normalizedQuery);
    if (hasLocalExactMatch) {
      setLiveContractToken(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      const token = await getCmcDexSearchToken(q).catch(() => null);
      if (cancelled) return;

      if (!token) {
        setLiveContractToken(null);
        return;
      }

      setLiveContractToken({
        id: token.id,
        name: token.name,
        abbr: token.abbr,
        logo: token.logo,
        source: 'cmc',
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [normalized, tokenItems, visible]);

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    const q = normalized;
    if (!q) return [];

    const next: SearchSuggestion[] = [];
    const normalizedQuery = normalize(q);
    const exactContractToken =
      tokenItems.find(
        (token) => normalize(token.id) === normalizedQuery
      ) ||
      (liveContractToken && normalize(liveContractToken.id) === normalizedQuery
        ? liveContractToken
        : undefined);

    if (exactContractToken) {
      next.push({
        id: `token:${exactContractToken.id}`,
        type: 'token',
        title:
          exactContractToken.name ||
          exactContractToken.abbr ||
          shortenMiddle(exactContractToken.id),
        subtitle: `${exactContractToken.abbr || t('TOKEN')} • ${shortenMiddle(exactContractToken.id)} • ${sourceLabel(exactContractToken.source)}`,
        tokenId: exactContractToken.id,
        logo: exactContractToken.logo,
        badge: sourceLabel(exactContractToken.source),
        score: 2600,
      });
    }

    if (isTronAddress(q)) {
      const matchedContact = contacts.find(
        (item) => normalize(item.address) === normalizedQuery
      );

      next.push({
        id: `address:${q}`,
        type: 'address',
        title: matchedContact
          ? translateNow('Wallet address • {{name}}', { name: matchedContact.name })
          : exactContractToken
            ? translateNow('Wallet address also matches this contract')
            : translateNow('Wallet address detected'),
        subtitle: q,
        address: q,
        score: exactContractToken ? 2050 : 2200,
      });
    }

    if (looksLikeUrl(q)) {
      next.push({
        id: `url:${q}`,
        type: 'url',
        title: translateNow('Open in browser'),
        subtitle: normalizeUrl(q),
        url: normalizeUrl(q),
        score: 1500,
      });
    }

    for (const token of tokenItems) {
      if (exactContractToken && token.id === exactContractToken.id) {
        continue;
      }

      const score = scoreTextMatch(q, [
        token.name,
        token.abbr,
        token.id,
        `${token.name} ${token.abbr}`,
      ]);

      if (score <= 0) continue;

      next.push({
        id: `token:${token.id}`,
        type: 'token',
        title: token.name || token.abbr || shortenMiddle(token.id),
        subtitle: `${token.abbr || t('TOKEN')} • ${shortenMiddle(token.id)} • ${sourceLabel(token.source)}`,
        tokenId: token.id,
        logo: token.logo,
        badge: sourceLabel(token.source),
        score:
          score + (token.source === 'portfolio' ? 220 : token.source === 'custom' ? 140 : 0),
      });
    }

    for (const wallet of wallets) {
      const score = scoreTextMatch(q, [
        wallet.name,
        wallet.address,
        wallet.kind,
      ]);

      if (score <= 0) continue;

      next.push({
        id: `wallet:${wallet.id}`,
        type: 'wallet',
        title: wallet.name,
        subtitle: `${wallet.kind} • ${shortenMiddle(wallet.address)}`,
        walletId: wallet.id,
        score: score + (activeWallet?.id === wallet.id ? 120 : 0),
      });
    }

    for (const contact of contacts) {
      const score = scoreTextMatch(q, [
        contact.name,
        contact.address,
      ]);

      if (score <= 0) continue;

      next.push({
        id: `contact:${contact.id}`,
        type: 'contact',
        title: contact.name,
        subtitle: shortenMiddle(contact.address),
        address: contact.address,
        score,
      });
    }

    for (const route of APP_SEARCH_ROUTES) {
      const routeTerms = routeToSearchTerms(route.route);
      const translatedRouteTitle = translateNow(route.title);
      const translatedRouteSubtitle = translateNow(route.subtitle);
      const routeCandidates = [
        route.title,
        route.subtitle,
        translatedRouteTitle,
        translatedRouteSubtitle,
        route.route,
        ...routeTerms,
        ...route.keywords,
        ...(route.aliases ?? []),
      ];

      const score = scoreTextMatch(q, routeCandidates);
      if (score <= 0) continue;

      const exactRouteIntent = routeCandidates.some(
        (candidate) => normalize(candidate) === normalizedQuery
      );

      next.push({
        id: route.id,
        type: 'route',
        title: translatedRouteTitle,
        subtitle: translatedRouteSubtitle,
        route: route.route,
        score: score + 80 + (exactRouteIntent ? 900 : 0),
      });
    }

    return uniqueById(next)
      .sort((a, b) => b.score - a.score)
      .slice(0, 14);
  }, [activeWallet?.id, contacts, liveContractToken, normalized, t, tokenItems, wallets]);

  const quickRoutes = useMemo(() => {
    const hasWallets = wallets.length > 0;

    return APP_SEARCH_ROUTES
      .filter((item) => {
        const visibility = item.quickPageVisibility ?? 'always';

        if (visibility === 'hasWallets') return hasWallets;
        if (visibility === 'noWallets') return !hasWallets;
        return typeof item.quickPageOrder === 'number';
      })
      .filter((item) => typeof item.quickPageOrder === 'number')
      .sort((a, b) => (a.quickPageOrder ?? 999) - (b.quickPageOrder ?? 999));
  }, [wallets.length]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    notice.hideNotice();
    onClose();
  }, [notice, onClose]);

  const handleAnimatedClose = useCallback(() => {
    setCloseIconAnimating(true);
    setCloseIconPlayToken((value) => value + 1);
    Keyboard.dismiss();
    notice.hideNotice();
    setTimeout(() => {
      onClose();
    }, 110);
  }, [notice, onClose]);

  const handlePastePress = useCallback(async () => {
    try {
      const hasString =
        typeof Clipboard.hasStringAsync === 'function'
          ? await Clipboard.hasStringAsync()
          : true;

      if (!hasString) {
        notice.showNeutralNotice(translateNow('Clipboard is empty.'), 1800);
        focusInput(query);
        return;
      }

      const text = await Clipboard.getStringAsync();
      const trimmed = text.trim();

      if (!trimmed) {
        notice.showNeutralNotice(translateNow('Clipboard is empty.'), 1800);
        focusInput(query);
        return;
      }

      setQuery(trimmed);
      notice.showSuccessNotice(translateNow('Pasted from clipboard.'), 1400);
      focusInput(trimmed);
    } catch (error) {
      console.error('Failed to read clipboard.', error);
      notice.showErrorNotice(translateNow('Clipboard read failed.'), 2200);
      focusInput(query);
    }
  }, [focusInput, notice, query]);

  const handlePrimaryPress = useCallback(
    async (item: SearchSuggestion) => {
      Keyboard.dismiss();

      if (item.type === 'token') {
        onClose();
        router.push({
          pathname: '/token-details',
          params: { tokenId: item.tokenId },
        } as any);
        return;
      }

      if (item.type === 'wallet') {
        onClose();
        router.push('/wallet-manager');
        return;
      }

      if (item.type === 'contact') {
        onClose();
        router.push({
          pathname: '/send',
          params: {
            address: item.address,
            contactName: item.title,
          },
        } as any);
        return;
      }

      if (item.type === 'address') {
        onClose();
        router.push({
          pathname: '/send',
          params: {
            address: item.address,
          },
        } as any);
        return;
      }

      if (item.type === 'route') {
        onClose();
        router.push(item.route as any);
        return;
      }

      if (item.type === 'url') {
        await openInAppBrowser(router, item.url);
        onClose();
      }
    },
    [onClose, router]
  );

  const handleUrlSubmit = useCallback(async () => {
    const value = normalized;
    if (!value) return;

    if (looksLikeUrl(value)) {
      Keyboard.dismiss();
      await openInAppBrowser(router, normalizeUrl(value));
      onClose();
      return;
    }

    if (suggestions[0]) {
      await handlePrimaryPress(suggestions[0]);
    }
  }, [handlePrimaryPress, normalized, onClose, router, suggestions]);

  const handleAddressBookAdd = useCallback(
    (address: string, suggestedName?: string) => {
      Keyboard.dismiss();
      onClose();
      router.push({
        pathname: '/address-book',
        params: {
          openAdd: '1',
          prefillAddress: address,
          prefillName: suggestedName || '',
        },
      } as any);
    },
    [onClose, router]
  );

  if (!visible) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable style={styles.overlay} onPress={handleClose} />

      <View
        style={[
          styles.panelWrap,
          {
            paddingTop: Math.max(insets.top, APP_HEADER_TOP_PADDING) + APP_HEADER_DROP_OFFSET,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.panel}>
          <View style={styles.searchRow}>
            <View style={styles.searchInputWrap}>
              <View style={styles.searchInner}>
                {searchIconAnimating ? (
                  <LottieIcon
                    key={`search-magnifier-animated-${searchIconPlayToken}`}
                    source={searchMagnifierSource}
                    size={16}
                    playToken={searchIconPlayToken}
                    frames={[0, 119]}
                    speed={1.8}
                    onAnimationFinish={() => {
                      setSearchIconAnimating(false);
                    }}
                  />
                ) : (
                  <LottieIcon
                    key="search-magnifier-static"
                    source={searchMagnifierSource}
                    size={16}
                    staticFrame={119}
                  />
                )}

                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('crypto, address, dapp...')}
                  placeholderTextColor={colors.textDim}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="done"
                  enterKeyHint="done"
                  blurOnSubmit
                  onSubmitEditing={() => void handleUrlSubmit()}
                />

                <TouchableOpacity
                  activeOpacity={0.88}
                  style={[styles.inlineIconButton, styles.pasteIconButton]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => void handlePastePress()}
                >
                  <PasteIcon width={18} height={18} />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.88}
                  style={[styles.inlineIconButton, styles.closeIconButton]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={handleAnimatedClose}
                >
                  {closeIconAnimating ? (
                    <LottieIcon
                      key={`search-close-animated-${closeIconPlayToken}`}
                      source={searchCloseSource}
                      size={18}
                      playToken={closeIconPlayToken}
                      frames={[0, 58]}
                      speed={1.8}
                    />
                  ) : (
                    <LottieIcon
                      key="search-close-static"
                      source={searchCloseSource}
                      size={18}
                      staticFrame={58}
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingCard}>
              <ThinOrangeLoader size={18} strokeWidth={2} />
              <Text style={styles.loadingText}>{t('Loading search index...')}</Text>
            </View>
          ) : normalized.length === 0 ? (
            <View style={styles.dropdownCard}>
              <Text style={styles.sectionLabel}>{t('QUICK PAGES')}</Text>

              <ScrollView
                style={styles.resultsScroll}
                showsVerticalScrollIndicator={false}
                bounces
                keyboardShouldPersistTaps="always"
              >
                {quickRoutes.map((item, index) => (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.88}
                    style={[
                      styles.suggestionRow,
                      styles.quickRow,
                      index !== quickRoutes.length - 1 && styles.suggestionRowBorder,
                    ]}
                    onPress={() => {
                      Keyboard.dismiss();
                      onClose();
                      router.push(item.route as any);
                    }}
                  >
                    <View style={styles.iconSlot}>
                      {renderQuickPageIcon(item.quickPageIcon)}
                    </View>

                    <View style={styles.suggestionTextWrap}>
                      <Text style={styles.suggestionTitle} numberOfLines={1}>
                        {t(item.title)}
                      </Text>
                      <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                        {t(item.subtitle)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : suggestions.length > 0 ? (
            <View style={styles.dropdownCard}>
              <ScrollView
                style={styles.resultsScroll}
                showsVerticalScrollIndicator={false}
                bounces
                keyboardShouldPersistTaps="always"
              >
                {suggestions.map((item, index) => {
                  const suggestionTag = suggestionTagLabel(item);

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.suggestionBlock,
                        index !== suggestions.length - 1 && styles.suggestionRowBorder,
                      ]}
                    >
                      <TouchableOpacity
                        activeOpacity={0.88}
                        style={styles.suggestionRow}
                        onPress={() => void handlePrimaryPress(item)}
                      >
                        <View style={styles.suggestionLeft}>
                          {item.type === 'token' ? (
                            item.logo ? (
                              <Image
                                source={{ uri: item.logo }}
                                style={styles.tokenLogo}
                                contentFit="contain"
                              />
                            ) : (
                              <View style={styles.tokenLogoFallback}>
                                <Text style={styles.tokenLogoFallbackText}>
                                  {item.title.slice(0, 1).toUpperCase()}
                                </Text>
                              </View>
                            )
                          ) : (
                            <View style={styles.iconSlot}>
                              {renderSuggestionIcon(item)}
                            </View>
                          )}

                          <View style={styles.suggestionTextWrap}>
                            <View style={styles.suggestionTitleRow}>
                              <Text style={styles.suggestionTitle} numberOfLines={1}>
                                {item.title}
                              </Text>

                              {item.type === 'token' ? (
                                <View style={styles.badge}>
                                  <Text style={styles.badgeText}>{item.badge}</Text>
                                </View>
                              ) : null}

                              {suggestionTag ? (
                                <View style={styles.metaTag}>
                                  <Text style={styles.metaTagText}>{suggestionTag}</Text>
                                </View>
                              ) : null}
                            </View>

                            <Text style={styles.suggestionSubtitle} numberOfLines={1}>
                              {item.subtitle}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>

                      {item.type === 'address' ? (
                        <View style={styles.inlineActions}>
                          <TouchableOpacity
                            activeOpacity={0.88}
                            style={[styles.inlineActionButton, styles.inlineActionPrimary]}
                          onPress={() => void handlePrimaryPress(item)}
                        >
                            <Text style={styles.inlineActionPrimaryText}>{t('Send')}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={0.88}
                            style={[styles.inlineActionButton, styles.inlineActionSecondary]}
                            onPress={() => handleAddressBookAdd(item.address)}
                          >
                            <Text style={styles.inlineActionSecondaryText}>
                              {t('Add to Address Book')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('Nothing matched yet')}</Text>
              <Text style={styles.emptyText}>
                {t(
                  'Try token name, symbol, contract, wallet name, contact, TRON address, route word, or website.'
                )}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },

  panelWrap: {
    flex: 1,
    paddingHorizontal: APP_HEADER_SIDE_PADDING,
    alignItems: 'stretch',
  },

  panel: {
    gap: 10,
  },

  searchRow: {
    height: APP_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },

  searchInputWrap: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
  },

  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  input: {
    flex: 1,
    color: colors.white,
    fontFamily: 'Sora_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
    paddingVertical: 0,
    paddingLeft: 8,
  },

  inlineIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  pasteIconButton: {
    marginLeft: 8,
  },

  closeIconButton: {
    marginLeft: 4,
    marginRight: -4,
  },

  loadingCard: {
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
  },

  loadingText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  dropdownCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(10,10,10,0.98)',
    overflow: 'hidden',
  },

  sectionLabel: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },

  resultsScroll: {
    maxHeight: 440,
  },

  suggestionBlock: {
    paddingBottom: 10,
  },

  suggestionRow: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },

  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  suggestionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },

  suggestionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  suggestionTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },

  suggestionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  suggestionTitle: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  suggestionSubtitle: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  tokenLogo: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },

  tokenLogoFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,105,0,0.10)',
  },

  tokenLogoFallbackText: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  iconSlot: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  badge: {
    paddingHorizontal: 8,
    minHeight: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,105,0,0.12)',
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },

  badgeText: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'Sora_700Bold',
  },

  metaTag: {
    paddingHorizontal: 7,
    minHeight: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  metaTagText: {
    color: colors.textDim,
    fontSize: 9,
    lineHeight: 11,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },

  inlineActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
  },

  inlineActionButton: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  inlineActionPrimary: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,105,0,0.12)',
  },

  inlineActionSecondary: {
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
  },

  inlineActionPrimaryText: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  inlineActionSecondaryText: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  emptyCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(10,10,10,0.98)',
    padding: 16,
    gap: 8,
  },

  emptyTitle: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
});
