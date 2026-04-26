import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import KeyboardView from '../src/ui/KeyboardView';
import { useNavigationInsets } from '../src/ui/navigation';
import ScreenLoadingOverlay from '../src/ui/screen-loading-overlay';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import ScreenBrow from '../src/ui/screen-brow';
import SelectedWalletSwitcher from '../src/ui/selected-wallet-switcher';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useSwipeDownDismiss } from '../src/ui/use-swipe-down-dismiss';
import { colors, layout, radius } from '../src/theme/tokens';
import { useNotice } from '../src/notice/notice-provider';
import { listSavedContacts, type SavedContact } from '../src/services/address-book';
import {
  listRecentRecipients,
  type RecentRecipient,
} from '../src/services/recent-recipients';
import { TRX_TOKEN_ID } from '../src/services/tron/api';
import { getSendAssetDraft } from '../src/services/wallet/send';
import {
  getAllWalletPortfolios,
  getWalletPortfolio,
  type PortfolioAsset,
} from '../src/services/wallet/portfolio';
import { setActiveWalletId, type WalletMeta } from '../src/services/wallet/storage';
import { useWalletSession } from '../src/wallet/wallet-session';

import NumericKeypad from '../src/ui/numeric-keypad';
import { FOOTER_NAV_BOTTOM_OFFSET, FOOTER_NAV_RESERVED_SPACE } from '../src/ui/footer-nav';
import {
  BackspaceIcon,
  CloseIcon,
  OpenRightIcon,
  PasteIcon,
  ScanIcon,
  SwapQuickIcon,
} from '../src/ui/ui-icons';

type SendDraft = Awaited<ReturnType<typeof getSendAssetDraft>>;

type WalletSwitcherItem = {
  id: string;
  name: string;
  address: string;
  kind: WalletMeta['kind'];
  balanceDisplay: string;
};

function isValidTronAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(value || '').trim());
}

function getNonZeroAssets(assets: PortfolioAsset[]) {
  return assets.filter((asset) => {
    if (!Number.isFinite(asset.amount)) return false;
    return asset.amount > 0;
  });
}

function sortSendableAssets(assets: PortfolioAsset[]) {
  return [...assets].sort((a, b) => {
    if (b.valueInUsd !== a.valueInUsd) {
      return b.valueInUsd - a.valueInUsd;
    }

    if (b.amount !== a.amount) {
      return b.amount - a.amount;
    }

    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

function parseDecimalInput(value: string) {
  const safe = String(value || '').replace(',', '.').trim();
  if (!safe) return null;
  if (!/^\d*(\.\d*)?$/.test(safe)) return null;
  const parsed = Number(safe);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function formatDisplayNumber(value: number, maxFractionDigits = 6) {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

function formatInputNumber(value: number, maxFractionDigits = 6) {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(maxFractionDigits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function trimFractionDigits(value: string, maxFractionDigits: number) {
  const safe = String(value || '');
  if (!safe.includes('.')) return safe;

  const [whole = '', fraction = ''] = String(value || '').split('.');
  if (!fraction) return `${whole}.`;
  return `${whole}.${fraction.slice(0, maxFractionDigits)}`;
}

function sanitizeRecipientInput(value: string) {
  return String(value || '').replace(/[^1-9A-HJ-NP-Za-km-z]/g, '').slice(0, 34);
}

function normalizeAddressMatch(value: string) {
  return sanitizeRecipientInput(String(value || '').trim()).toLowerCase();
}

export default function SendScreen() {
  const router = useRouter();
  const notice = useNotice();
  const { setPendingWalletSelectionId } = useWalletSession();
  const insets = useSafeAreaInsets();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const params = useLocalSearchParams<{
    tokenId?: string | string[];
    address?: string | string[];
    contactName?: string | string[];
  }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);
  const [walletOptionsOpen, setWalletOptionsOpen] = useState(false);
  const [tokenOptionsOpen, setTokenOptionsOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [draft, setDraft] = useState<SendDraft | null>(null);
  const [walletChoices, setWalletChoices] = useState<WalletSwitcherItem[]>([]);
  const [tokenChoices, setTokenChoices] = useState<PortfolioAsset[]>([]);
  const [savedContacts, setSavedContacts] = useState<SavedContact[]>([]);
  const [recentRecipients, setRecentRecipients] = useState<RecentRecipient[]>([]);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [amountInputMode, setAmountInputMode] = useState<'token' | 'usd'>('token');
  const [amountKeyboardVisible, setAmountKeyboardVisible] = useState(false);
  const [systemKeyboardVisible, setSystemKeyboardVisible] = useState(false);
  const scrollRef = useRef<any>(null);
  const [amountSectionY, setAmountSectionY] = useState(0);

  const initialTokenId =
    typeof params.tokenId === 'string'
      ? params.tokenId
      : Array.isArray(params.tokenId)
        ? params.tokenId[0]
        : '';

  const [selectedTokenId, setSelectedTokenId] = useState(initialTokenId);

  const prefillAddress =
    typeof params.address === 'string'
      ? params.address.trim()
      : Array.isArray(params.address)
        ? String(params.address[0] || '').trim()
        : '';

  const contactName =
    typeof params.contactName === 'string'
      ? params.contactName.trim()
      : Array.isArray(params.contactName)
        ? String(params.contactName[0] || '').trim()
        : '';

  const recipientTrimmed = recipient.trim();
  const recipientHasValue = recipientTrimmed.length > 0;
  const recipientIsValid = isValidTronAddress(recipientTrimmed);
  useChromeLoading((loading && !draft) || refreshing);

  const contentBottomInset = useBottomInset(amountKeyboardVisible ? 312 : 0);

  const recipientFontSize = useMemo(() => {
    if (recipientTrimmed.length > 32) return 11;
    if (recipientTrimmed.length > 26) return 12;
    if (recipientTrimmed.length > 20) return 13;
    return 14;
  }, [recipientTrimmed.length]);

  const recipientShellState = useMemo(() => {
    if (!recipientHasValue) return styles.inputShellRecipientIdle;
    if (recipientIsValid) return styles.inputShellRecipientValid;
    return styles.inputShellRecipientInvalid;
  }, [recipientHasValue, recipientIsValid]);

  const routeRecipientLabel = useMemo(() => {
    if (!contactName || !prefillAddress) return '';
    return normalizeAddressMatch(prefillAddress) === normalizeAddressMatch(recipientTrimmed)
      ? contactName
      : '';
  }, [contactName, prefillAddress, recipientTrimmed]);

  const matchedContact = useMemo(() => {
    const normalizedRecipient = normalizeAddressMatch(recipientTrimmed);
    if (!normalizedRecipient) return null;
    return (
      savedContacts.find(
        (contact) => normalizeAddressMatch(contact.address) === normalizedRecipient
      ) ?? null
    );
  }, [recipientTrimmed, savedContacts]);

  const displayedContactLabel = matchedContact?.name || routeRecipientLabel;

  const filteredContacts = useMemo(() => {
    const query = String(recipientTrimmed || '').toLowerCase();
    if (!query) {
      return savedContacts;
    }

    return savedContacts.filter((contact) => {
      return (
        contact.name.toLowerCase().includes(query) ||
        contact.address.toLowerCase().includes(query)
      );
    });
  }, [recipientTrimmed, savedContacts]);

  const filteredRecentRecipients = useMemo(() => {
    const query = String(recipientTrimmed || '').toLowerCase();
    if (!query) {
      return recentRecipients;
    }

    return recentRecipients.filter((recipientItem) => {
      return (
        recipientItem.name.toLowerCase().includes(query) ||
        recipientItem.address.toLowerCase().includes(query)
      );
    });
  }, [recentRecipients, recipientTrimmed]);

  const filteredContactAddresses = useMemo(() => {
    return new Set(
      filteredRecentRecipients.map((recipientItem) =>
        normalizeAddressMatch(recipientItem.address)
      )
    );
  }, [filteredRecentRecipients]);

  const visibleContacts = useMemo(() => {
    return filteredContacts.filter(
      (contact) => !filteredContactAddresses.has(normalizeAddressMatch(contact.address))
    );
  }, [filteredContactAddresses, filteredContacts]);

  const hasInlineRecipients = filteredRecentRecipients.length > 0 || visibleContacts.length > 0;
  const hasAnyInlineRecipients = recentRecipients.length > 0 || savedContacts.length > 0;
  const contactsListMaxHeight = systemKeyboardVisible ? 184 : 264;
  const normalizedSelectedTokenId = String(selectedTokenId || '').trim();
  const normalizedDraftTokenId = String(draft?.token?.tokenId || '').trim();
  const tokenSelectionSyncPending = Boolean(
    normalizedSelectedTokenId &&
      normalizedDraftTokenId &&
      normalizedSelectedTokenId !== normalizedDraftTokenId
  );

  const load = useCallback(
    async (options?: { preserveWalletMenu?: boolean; preserveTokenMenu?: boolean }) => {
      try {
        setLoading(true);
        setErrorText('');

        const [nextDraft, aggregate, contacts, recents] = await Promise.all([
          getSendAssetDraft(selectedTokenId),
          getAllWalletPortfolios(),
          listSavedContacts(),
          listRecentRecipients(),
        ]);

        const fullAccessWallets = aggregate.items
          .filter((item) => item.wallet.kind !== 'watch-only')
          .map((item) => ({
            id: item.wallet.id,
            name: item.wallet.name,
            address: item.wallet.address,
            kind: item.wallet.kind,
            balanceDisplay: item.portfolio?.totalBalanceDisplay ?? '$0.00',
          }));

        const activePortfolio = await getWalletPortfolio(nextDraft.wallet.address, {
          force: Boolean(refreshing),
        });

        const sendableAssets = sortSendableAssets(getNonZeroAssets(activePortfolio.assets));

        setDraft(nextDraft);
        setWalletChoices(fullAccessWallets);
        setTokenChoices(sendableAssets);
        setSavedContacts(contacts);
        setRecentRecipients(recents);

        if (!options?.preserveWalletMenu) {
          setWalletOptionsOpen(false);
        }

        if (!options?.preserveTokenMenu) {
          setTokenOptionsOpen(false);
        }
      } catch (error) {
        console.error(error);
        setDraft(null);
        setWalletChoices([]);
        setTokenChoices([]);
        setSavedContacts([]);
        setRecentRecipients([]);
        setErrorText(error instanceof Error ? error.message : 'Failed to load send screen.');
        notice.showErrorNotice('Send flow failed to load.', 2400);
      } finally {
        setLoading(false);
      }
    },
    [notice, refreshing, selectedTokenId]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!normalizedSelectedTokenId) return;
    if (!normalizedDraftTokenId) return;
    if (!tokenSelectionSyncPending) return;

    void load({ preserveWalletMenu: true, preserveTokenMenu: true });
  }, [load, normalizedDraftTokenId, normalizedSelectedTokenId, tokenSelectionSyncPending]);

  useEffect(() => {
    if (prefillAddress) {
      setRecipient(sanitizeRecipientInput(prefillAddress));
    }
  }, [prefillAddress]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setSystemKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setSystemKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const resolvedTokenId = String(draft?.token?.tokenId || '').trim();
    if (!resolvedTokenId) return;

    setSelectedTokenId((current) => {
      const safeCurrent = String(current || '').trim();
      return safeCurrent === resolvedTokenId ? current : resolvedTokenId;
    });
  }, [draft?.token?.tokenId]);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load({ preserveWalletMenu: true, preserveTokenMenu: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const visibleWalletChoices = useMemo(
    () => walletChoices.filter((wallet) => wallet.id !== draft?.wallet.id),
    [draft?.wallet.id, walletChoices]
  );

  const visibleTokenChoices = useMemo(
    () => tokenChoices.filter((asset) => asset.id !== draft?.token.tokenId),
    [draft?.token.tokenId, tokenChoices]
  );

  const selectedTokenAsset = useMemo(
    () => tokenChoices.find((asset) => asset.id === draft?.token.tokenId) ?? null,
    [draft?.token.tokenId, tokenChoices]
  );

  const selectedWalletOption = useMemo(
    () => walletChoices.find((wallet) => wallet.id === draft?.wallet.id) ?? null,
    [draft?.wallet.id, walletChoices]
  );

  const selectedTokenUnitLabel = useMemo(() => {
    return selectedTokenAsset?.symbol || draft?.token?.symbol || 'TOKEN';
  }, [draft?.token?.symbol, selectedTokenAsset?.symbol]);

  const selectedTokenDecimals = useMemo(() => {
    const decimals = Number(selectedTokenAsset?.decimals ?? draft?.token?.decimals ?? 6);
    return Number.isFinite(decimals) && decimals >= 0 ? decimals : 6;
  }, [draft?.token?.decimals, selectedTokenAsset?.decimals]);

  const selectedTokenPriceUsd = useMemo(() => {
    if (
      selectedTokenAsset &&
      Number.isFinite(selectedTokenAsset.valueInUsd) &&
      Number.isFinite(selectedTokenAsset.amount) &&
      selectedTokenAsset.amount > 0
    ) {
      return selectedTokenAsset.valueInUsd / selectedTokenAsset.amount;
    }
    return 0;
  }, [selectedTokenAsset]);

  const parsedAmountValue = useMemo(() => parseDecimalInput(amount), [amount]);

  const convertedPreviewText = useMemo(() => {
    if (parsedAmountValue === null || parsedAmountValue <= 0 || selectedTokenPriceUsd <= 0) {
      return amountInputMode === 'token' ? '$0.00' : `0 ${selectedTokenUnitLabel}`;
    }

    if (amountInputMode === 'token') {
      const usdValue = parsedAmountValue * selectedTokenPriceUsd;
      return `$${formatDisplayNumber(usdValue, 2)}`;
    }

    const tokenValue = parsedAmountValue / selectedTokenPriceUsd;
    return `${formatDisplayNumber(tokenValue, selectedTokenDecimals)} ${selectedTokenUnitLabel}`;
  }, [amountInputMode, parsedAmountValue, selectedTokenDecimals, selectedTokenPriceUsd, selectedTokenUnitLabel]);

  const amountSuffixLabel = amountInputMode === 'token' ? selectedTokenUnitLabel : 'USD';

  const normalizedSendAmount = useMemo(() => {
    if (amountInputMode === 'token') {
      return amount.trim();
    }

    if (parsedAmountValue === null || parsedAmountValue <= 0 || selectedTokenPriceUsd <= 0) {
      return '';
    }

    return formatInputNumber(parsedAmountValue / selectedTokenPriceUsd, selectedTokenDecimals);
  }, [amount, amountInputMode, parsedAmountValue, selectedTokenDecimals, selectedTokenPriceUsd]);

  const maxTokenAmountValue = useMemo(() => {
    return parseDecimalInput(draft?.spendableAmount ?? '') ?? 0;
  }, [draft?.spendableAmount]);

  const maxUsdAmountValue = useMemo(() => {
    if (selectedTokenAsset && Number.isFinite(selectedTokenAsset.valueInUsd)) {
      return Math.max(0, selectedTokenAsset.valueInUsd);
    }
    return 0;
  }, [selectedTokenAsset]);

  const amountPrecision = amountInputMode === 'token' ? selectedTokenDecimals : 2;
  const maxAmountValue = amountInputMode === 'token' ? maxTokenAmountValue : maxUsdAmountValue;
  const amountBackspaceActsAsClose = amount === '' || amount === '0';

  const normalizeAmountInput = useCallback(
    (rawValue: string) => {
      const safeValue = String(rawValue || '').replace(',', '.');
      if (!safeValue) return '';
      if (!/^\d*(\.\d*)?$/.test(safeValue)) return null;

      const trimmedValue = trimFractionDigits(safeValue, amountPrecision);
      const parsedValue = parseDecimalInput(trimmedValue);
      if (parsedValue === null) return trimmedValue;
      if (parsedValue <= maxAmountValue) return trimmedValue;
      return formatInputNumber(maxAmountValue, amountPrecision);
    },
    [amountPrecision, maxAmountValue]
  );

  const handleToggleAmountMode = useCallback(() => {
    if (parsedAmountValue === null || parsedAmountValue <= 0 || selectedTokenPriceUsd <= 0) {
      setAmountInputMode((prev) => (prev === 'token' ? 'usd' : 'token'));
      return;
    }

    if (amountInputMode === 'token') {
      const usdValue = parsedAmountValue * selectedTokenPriceUsd;
      setAmount(formatInputNumber(usdValue, 2));
      setAmountInputMode('usd');
      return;
    }

    const tokenValue = parsedAmountValue / selectedTokenPriceUsd;
    setAmount(formatInputNumber(tokenValue, selectedTokenDecimals));
    setAmountInputMode('token');
  }, [amountInputMode, parsedAmountValue, selectedTokenDecimals, selectedTokenPriceUsd]);

  const openAmountKeyboard = useCallback(() => {
    setWalletOptionsOpen(false);
    setTokenOptionsOpen(false);
    setContactsOpen(false);
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
  }, [amountSectionY]);

  const closeAmountKeyboard = useCallback(() => {
    setAmountKeyboardVisible(false);
  }, []);
  const amountKeyboardSwipeGesture = useSwipeDownDismiss(closeAmountKeyboard);

  const closeInlinePickers = useCallback(() => {
    setWalletOptionsOpen(false);
    setTokenOptionsOpen(false);
    setContactsOpen(false);
  }, []);

  const handleAmountSectionLayout = useCallback((event: LayoutChangeEvent) => {
    setAmountSectionY(event.nativeEvent.layout.y);
  }, []);

  const handleSetMax = useCallback(() => {
    if (amountInputMode === 'token') {
      setAmount(formatInputNumber(maxTokenAmountValue, selectedTokenDecimals));
      return;
    }
    setAmount(formatInputNumber(maxUsdAmountValue, 2));
  }, [amountInputMode, maxTokenAmountValue, maxUsdAmountValue, selectedTokenDecimals]);

  useEffect(() => {
    setAmount((current) => {
      const next = normalizeAmountInput(current);
      return next === null || next === current ? current : next;
    });
  }, [normalizeAmountInput]);


  const handleAmountDigitPress = useCallback((digit: string) => {
    setAmount((prev) => {
      const next = normalizeAmountInput(`${prev}${digit}`);
      return next === null ? prev : next;
    });
  }, [normalizeAmountInput]);

  const handleAmountDotPress = useCallback(() => {
    setAmount((prev) => {
      if (!prev) return '0.';
      if (prev.includes('.')) return prev;
      const next = normalizeAmountInput(`${prev}.`);
      return next === null ? prev : next;
    });
  }, [normalizeAmountInput]);

  const handleAmountBackspace = useCallback(() => {
    setAmount((prev) => {
      if (prev === '' || prev === '0') {
        closeAmountKeyboard();
        return prev;
      }
      return prev.slice(0, -1);
    });
  }, [closeAmountKeyboard]);

  const handlePasteRecipient = useCallback(async () => {
    closeAmountKeyboard();
    setContactsOpen(false);
    const value = await Clipboard.getStringAsync();
    if (value) {
      setRecipient(sanitizeRecipientInput(String(value).trim()));
    }
  }, [closeAmountKeyboard]);

  const handleToggleContacts = useCallback(() => {
    closeAmountKeyboard();
    setWalletOptionsOpen(false);
    setTokenOptionsOpen(false);
    if (savedContacts.length <= 0) {
      notice.showNeutralNotice('No saved contacts yet. Add one first.', 2200);
      return;
    }
    setContactsOpen((prev) => !prev);
  }, [closeAmountKeyboard, notice, savedContacts.length]);

  const handleOpenAddressBookManage = useCallback(() => {
    closeAmountKeyboard();
    setContactsOpen(false);
    router.push({
      pathname: '/address-book',
      params: {
        ...(selectedTokenId ? { tokenId: selectedTokenId } : {}),
        ...(contactName ? { contactName } : {}),
      },
    } as any);
  }, [closeAmountKeyboard, contactName, router, selectedTokenId]);

  const handleChooseContact = useCallback((contact: SavedContact) => {
    Keyboard.dismiss();
    setRecipient(sanitizeRecipientInput(contact.address));
    setContactsOpen(false);
  }, []);

  const handleChooseRecentRecipient = useCallback((recipientItem: RecentRecipient) => {
    Keyboard.dismiss();
    setRecipient(sanitizeRecipientInput(recipientItem.address));
    setContactsOpen(false);
  }, []);

  const handleRecipientFocus = useCallback(() => {
    closeAmountKeyboard();
    if (!recipientTrimmed && hasAnyInlineRecipients) {
      setContactsOpen(true);
    }
  }, [closeAmountKeyboard, hasAnyInlineRecipients, recipientTrimmed]);

  const handleOpenScan = useCallback(() => {
    closeAmountKeyboard();
    setContactsOpen(false);
    router.push({
      pathname: '/scan',
      params: {
        mode: 'send',
        ...(selectedTokenId ? { tokenId: selectedTokenId } : {}),
        ...(contactName ? { contactName } : {}),
      },
    } as any);
  }, [closeAmountKeyboard, contactName, router, selectedTokenId]);

  const handleToggleTokenOptions = useCallback(() => {
    if (visibleTokenChoices.length <= 0) {
      notice.showNeutralNotice('No other funded assets in this wallet.', 2200);
      return;
    }

    closeAmountKeyboard();
    setContactsOpen(false);
    setTokenOptionsOpen((prev) => !prev);
  }, [closeAmountKeyboard, notice, visibleTokenChoices.length]);

  const handleChooseToken = useCallback(
    (asset: PortfolioAsset) => {
      if (asset.id === draft?.token.tokenId) {
        setTokenOptionsOpen(false);
        return;
      }

      setAmount('');
      setAmountInputMode('token');
      closeAmountKeyboard();
      setContactsOpen(false);
      setSelectedTokenId(asset.id);
    },
    [closeAmountKeyboard, draft?.token.tokenId]
  );

  const handleToggleWalletOptions = useCallback(() => {
    if (visibleWalletChoices.length <= 0) {
      notice.showNeutralNotice('No other signing wallets available.', 2200);
      return;
    }

    closeAmountKeyboard();
    setContactsOpen(false);
    setWalletOptionsOpen((prev) => !prev);
  }, [closeAmountKeyboard, notice, visibleWalletChoices.length]);

  const handleChooseWallet = useCallback(
    async (wallet: WalletSwitcherItem) => {
      try {
        setSwitchingWalletId(wallet.id);
        setAmount('');
        setAmountInputMode('token');
        closeAmountKeyboard();
        setContactsOpen(false);
        await setActiveWalletId(wallet.id);
        setPendingWalletSelectionId(wallet.id);
        await load();
      } catch (error) {
        console.error(error);
        notice.showErrorNotice('Failed to switch send wallet.', 2400);
      } finally {
        setSwitchingWalletId(null);
      }
    },
    [closeAmountKeyboard, load, notice, setPendingWalletSelectionId]
  );

  const handleSend = useCallback(async () => {
    if (!draft) return;
    if (tokenSelectionSyncPending) {
      notice.showNeutralNotice('Updating selected token. Try again in a moment.', 1800);
      return;
    }

    const toAddress = recipient.trim();
    const safeAmount = normalizedSendAmount;

    if (!isValidTronAddress(toAddress)) {
      notice.showErrorNotice('Enter a valid TRON address.', 2200);
      return;
    }

    if (!safeAmount) {
      notice.showErrorNotice(
        amountInputMode === 'usd' && selectedTokenPriceUsd <= 0
          ? 'USD conversion is unavailable for this token.'
          : 'Enter amount.',
        2200
      );
      return;
    }

    if (draft.wallet.kind === 'watch-only') {
      notice.showErrorNotice(
        'Watch-only wallet cannot sign or send transactions.',
        2600
      );
      return;
    }

    try {
      setSending(true);
      closeAmountKeyboard();
      setContactsOpen(false);
      router.push({
        pathname: '/send-confirm',
        params: {
          tokenId: normalizedSelectedTokenId || draft.token.tokenId,
          address: toAddress,
          amount: safeAmount,
          ...(contactName ? { contactName } : {}),
        },
      } as any);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : 'Failed to open transfer review.',
        3200
      );
    } finally {
      setSending(false);
    }
  }, [
    contactName,
    amountInputMode,
    draft,
    normalizedSendAmount,
    notice,
    recipient,
    router,
    selectedTokenPriceUsd,
    closeAmountKeyboard,
    normalizedSelectedTokenId,
    tokenSelectionSyncPending,
  ]);

  if (loading && !draft) {
    return <ScreenLoadingState />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScreenLoadingOverlay visible={refreshing || Boolean(switchingWalletId)} />
        <KeyboardView
          innerRef={(ref: any) => {
            scrollRef.current = ref;
          }}
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: navInsets.top, paddingBottom: contentBottomInset },
          ]}
          keyboardShouldPersistTaps="handled"
          enableAutomaticScroll={false}
          extraScrollHeight={0}
          onScrollBeginDrag={() => {
            closeAmountKeyboard();
            closeInlinePickers();
          }}
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
          <ScreenBrow label="SEND" variant="back" />
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : draft ? (
            <>
              <View style={styles.selectionBlock}>
                <SelectedWalletSwitcher
                  wallet={{
                    id: draft.wallet.id,
                    name: draft.wallet.name,
                    address: draft.wallet.address,
                    kind: draft.wallet.kind,
                    balanceDisplay: selectedWalletOption?.balanceDisplay ?? '$0.00',
                  }}
                  visibleWalletChoices={visibleWalletChoices}
                  walletOptionsOpen={walletOptionsOpen}
                  switchingWalletId={switchingWalletId}
                  onToggle={handleToggleWalletOptions}
                  onChooseWallet={(wallet) => {
                    void handleChooseWallet(wallet);
                  }}
                />
              </View>

              <View style={styles.selectionBlock}>
                <Text style={styles.selectionEyebrow}>SELECTED ASSET · TAP TO SWITCH</Text>

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.assetRowSelected}
                  onPress={handleToggleTokenOptions}
                >
                  <View style={styles.assetLeft}>
                    {selectedTokenAsset?.logo ? (
                      <Image
                        source={{ uri: selectedTokenAsset.logo }}
                        style={styles.assetLogo}
                        contentFit="contain"
                      />
                    ) : (
                      <View style={styles.assetFallbackLogo}>
                        <Text style={styles.assetFallbackText}>
                          {(
                            selectedTokenAsset?.symbol ||
                            draft.token.symbol ||
                            selectedTokenAsset?.name ||
                            draft.token.name ||
                            'T'
                          ).slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View style={styles.assetMeta}>
                      <Text style={styles.assetName}>
                        {selectedTokenAsset?.name || draft.token.name}
                      </Text>
                      <Text style={styles.assetAmount}>
                        {selectedTokenAsset?.symbol || draft.token.symbol}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.assetRight}>
                    <Text style={styles.assetValue}>
                      {selectedTokenAsset?.valueDisplay || '$0.00'}
                    </Text>
                    <Text style={styles.assetAction}>
                      {selectedTokenAsset?.amountDisplay || draft.token.balanceFormatted}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {tokenOptionsOpen ? (
                <View style={styles.tokenOptionsList}>
                  {visibleTokenChoices.map((asset) => (
                    <TouchableOpacity
                      key={asset.id}
                      activeOpacity={0.9}
                      style={styles.assetRow}
                      onPress={() => handleChooseToken(asset)}
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
                          <Text style={styles.assetAmount}>{asset.symbol}</Text>
                        </View>
                      </View>

                      <View style={styles.assetRight}>
                        <Text style={styles.assetValue}>{asset.valueDisplay}</Text>
                        <Text style={styles.assetAction}>{asset.amountDisplay}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <View style={styles.sectionBlock} onLayout={handleAmountSectionLayout}>
                <View style={styles.fieldHeaderRow}>
                  <Text style={styles.sectionFieldTitle}>RECIPIENT</Text>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleToggleContacts}
                    style={styles.addressBookButton}
                  >
                    <Text style={styles.addressBookButtonText}>
                      {contactsOpen ? 'CLOSE' : 'CONTACTS'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.inputShell, styles.inputShellRecipient, recipientShellState]}>
                  <TextInput
                    value={recipient}
                    onChangeText={(value) => setRecipient(sanitizeRecipientInput(value))}
                    placeholder="TRON address"
                    placeholderTextColor={colors.textDim}
                    style={[
                      styles.inputWithIcons,
                      styles.recipientInput,
                      { fontSize: recipientFontSize, lineHeight: recipientFontSize + 4 },
                    ]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    multiline={false}
                    numberOfLines={1}
                    keyboardType="default"
                    inputMode="text"
                    keyboardAppearance="dark"
                    selectionColor={colors.accent}
                    returnKeyType="done"
                    blurOnSubmit
                    onFocus={handleRecipientFocus}
                  />

                  <View style={styles.inputIconsRight}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={handlePasteRecipient}
                      style={styles.inputIconButton}
                    >
                      <PasteIcon width={16} height={16} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={handleOpenScan}
                      style={styles.inputIconButton}
                    >
                      <ScanIcon width={17} height={17} />
                    </TouchableOpacity>
                  </View>
                </View>

                {displayedContactLabel ? (
                  <Text style={styles.contactHint}>Contact: {displayedContactLabel}</Text>
                ) : null}

                {contactsOpen ? (
                  <View style={styles.contactsPanel}>
                    {hasInlineRecipients ? (
                      <ScrollView
                        style={[styles.contactsListScroll, { maxHeight: contactsListMaxHeight }]}
                        contentContainerStyle={styles.contactsListContent}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="always"
                        showsVerticalScrollIndicator={false}
                      >
                        {filteredRecentRecipients.length > 0 ? (
                          <View style={styles.contactsGroup}>
                            <Text style={styles.contactsGroupTitle}>RECENT</Text>
                            {filteredRecentRecipients.map((recipientItem) => {
                              const selected =
                                normalizeAddressMatch(recipientItem.address) ===
                                normalizeAddressMatch(recipientTrimmed);

                              return (
                                <TouchableOpacity
                                  key={recipientItem.id}
                                  activeOpacity={0.9}
                                  style={[
                                    styles.contactRow,
                                    selected && styles.contactRowSelected,
                                  ]}
                                  onPress={() => handleChooseRecentRecipient(recipientItem)}
                                >
                                  <View style={styles.contactRowText}>
                                    <Text style={styles.contactRowName}>{recipientItem.name}</Text>
                                    <Text style={styles.contactRowAddress}>
                                      {recipientItem.address}
                                    </Text>
                                  </View>

                                  {selected ? (
                                    <Text style={styles.contactRowTag}>SELECTED</Text>
                                  ) : (
                                    <OpenRightIcon width={16} height={16} />
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : null}

                        {visibleContacts.length > 0 ? (
                          <View style={styles.contactsGroup}>
                            <Text style={styles.contactsGroupTitle}>CONTACTS</Text>
                            {visibleContacts.map((contact) => {
                              const selected =
                                normalizeAddressMatch(contact.address) ===
                                normalizeAddressMatch(recipientTrimmed);

                              return (
                                <TouchableOpacity
                                  key={contact.id}
                                  activeOpacity={0.9}
                                  style={[
                                    styles.contactRow,
                                    selected && styles.contactRowSelected,
                                  ]}
                                  onPress={() => handleChooseContact(contact)}
                                >
                                  <View style={styles.contactRowText}>
                                    <Text style={styles.contactRowName}>{contact.name}</Text>
                                    <Text style={styles.contactRowAddress}>{contact.address}</Text>
                                  </View>

                                  {selected ? (
                                    <Text style={styles.contactRowTag}>SELECTED</Text>
                                  ) : (
                                    <OpenRightIcon width={16} height={16} />
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : null}
                      </ScrollView>
                    ) : (
                      <Text style={styles.contactsEmptyText}>
                        No recent recipients or contacts match this address.
                      </Text>
                    )}

                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.manageContactsButton}
                      onPress={handleOpenAddressBookManage}
                    >
                      <Text style={styles.manageContactsButtonText}>MANAGE CONTACTS</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              <View style={styles.sectionBlock}>
                <View style={styles.amountHeaderRow}>
                  <Text style={styles.sectionFieldTitle}>AMOUNT</Text>

                  <View style={styles.amountActions}>
                    <Text style={styles.amountConvertedText}>{convertedPreviewText}</Text>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={handleToggleAmountMode}
                      style={styles.amountSwapButton}
                    >
                      <SwapQuickIcon width={14} height={14} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={1}
                  onPress={openAmountKeyboard}
                  style={[styles.inputShell, styles.inputShellAmount]}
                >
                  <TextInput
                    value={amount}
                    onChangeText={(value) => {
                      const next = normalizeAmountInput(value);
                      if (next !== null) {
                        setAmount(next);
                      }
                    }}
                    placeholder={amountInputMode === 'token' ? '0' : '0.00'}
                    placeholderTextColor={colors.textDim}
                    style={[styles.inputWithIcons, styles.amountInput]}
                    autoCapitalize="none"
                    autoCorrect={false}
                    showSoftInputOnFocus={false}
                    onFocus={openAmountKeyboard}
                    selectionColor={colors.accent}
                  />

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleSetMax}
                    style={styles.inputMaxButton}
                  >
                    <Text style={styles.inputMaxButtonText}>MAX</Text>
                  </TouchableOpacity>

                  <Text style={styles.inputSuffixText}>{amountSuffixLabel}</Text>
                </TouchableOpacity>

                <Text style={styles.hint}>
                  {draft.token.tokenId === TRX_TOKEN_ID
                    ? 'Native TRX transfer.'
                    : 'TRC20 transfer. Network may consume energy or burn TRX if energy is insufficient.'}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                onPress={() => void handleSend()}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.sendButtonText}>CONFIRM TRANSFER</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{errorText || 'Unable to load send screen.'}</Text>
            </View>
          )}
        </KeyboardView>

        {amountKeyboardVisible ? (
          <Pressable style={styles.amountKeyboardBackdrop} onPress={closeAmountKeyboard} />
        ) : null}

        {amountKeyboardVisible ? (
          <View
            style={[
              styles.amountKeyboardDock,
              { paddingBottom: Math.max(insets.bottom, 8) + 8 },
            ]}
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

  loadingWrap: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorWrap: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorText: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },

  walletCard: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  walletCardClosed: {
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
  },

  walletCardOpen: {
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
  },

  walletCardText: {
    flex: 1,
    gap: 4,
  },

  selectionBlock: {
    marginBottom: 16,
  },

  sectionBlock: {
    marginBottom: 16,
  },

  selectionEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    marginBottom: 8,
  },

  walletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  walletName: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  walletBalance: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  activeBadge: {
    color: colors.green,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  walletAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  walletOptionsList: {
    gap: 10,
    marginTop: -6,
    marginBottom: 16,
  },

  walletOptionRow: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  walletOptionRowInactive: {
    borderColor: 'rgba(255,105,0,0.14)',
    backgroundColor: 'rgba(255,105,0,0.04)',
  },

  walletOptionText: {
    flex: 1,
    gap: 4,
  },

  optionBalance: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  optionAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  tokenOptionsList: {
    gap: 10,
    marginTop: -4,
    marginBottom: 16,
  },

  assetRowSelected: {
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

  assetRow: {
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
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  assetFallbackLogo: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,105,0,0.12)',
    borderWidth: 1,
    borderColor: colors.lineSoft,
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

  assetAction: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  fieldHeaderRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },

  sectionFieldTitle: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  addressBookButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  addressBookButtonText: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  inputShell: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 10,
  },

  inputShellRecipient: {
    backgroundColor: 'rgba(255,105,0,0.08)',
  },

  inputShellRecipientIdle: {
    borderColor: 'rgba(255,105,0,0.20)',
    backgroundColor: 'rgba(255,105,0,0.08)',
  },

  inputShellRecipientValid: {
    borderColor: 'rgba(24,224,58,0.24)',
    backgroundColor: 'rgba(24,224,58,0.08)',
  },

  inputShellRecipientInvalid: {
    borderColor: 'rgba(255,74,74,0.28)',
    backgroundColor: 'rgba(255,74,74,0.08)',
  },

  inputShellAmount: {
    borderColor: 'rgba(255,105,0,0.20)',
    backgroundColor: 'rgba(255,105,0,0.08)',
  },

  amountKeyboardBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
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

  inputWithIcons: {
    flex: 1,
    minHeight: 52,
    color: colors.white,
    fontFamily: 'Sora_600SemiBold',
    paddingRight: 12,
  },

  recipientInput: {
    paddingRight: 6,
  },

  amountInput: {
    fontSize: 16,
    lineHeight: 20,
  },

  inputIconsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },

  inputIconButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  contactHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    marginTop: 6,
  },

  contactsPanel: {
    marginTop: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.16)',
    backgroundColor: 'rgba(255,105,0,0.05)',
    overflow: 'hidden',
  },

  contactsListScroll: {
    maxHeight: 264,
  },

  contactsListContent: {
    flexGrow: 1,
  },

  contactsGroup: {
    gap: 0,
  },

  contactsGroupTitle: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.45,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },

  contactRow: {
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },

  contactRowSelected: {
    backgroundColor: 'rgba(255,105,0,0.10)',
  },

  contactRowText: {
    flex: 1,
    gap: 2,
  },

  contactRowName: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  contactRowAddress: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  contactRowTag: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  contactsEmptyText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },

  manageContactsButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14,
  },

  manageContactsButtonText: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  amountHeaderRow: {
    marginTop: 2,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  amountActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  amountConvertedText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  amountSwapButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputMaxButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 6,
  },

  inputMaxButtonText: {
    color: 'rgba(255,105,0,0.78)',
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.3,
  },

  inputSuffixText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    marginLeft: 8,
  },

  hint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
    marginTop: 8,
  },

  sendButton: {
    marginTop: 2,
    marginBottom: 8,
    minHeight: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  sendButtonDisabled: {
    opacity: 0.7,
  },

  sendButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },
});
