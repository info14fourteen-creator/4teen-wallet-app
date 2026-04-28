import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import KeyboardView from '../src/ui/KeyboardView';
import InfoToggleIcon from '../src/ui/info-toggle-icon';
import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingOverlay from '../src/ui/screen-loading-overlay';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import NumericKeypad from '../src/ui/numeric-keypad';
import SelectedWalletSwitcher, {
  type WalletSwitcherOption,
} from '../src/ui/selected-wallet-switcher';
import { useNavigationInsets } from '../src/ui/navigation';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useSwipeDownDismiss } from '../src/ui/use-swipe-down-dismiss';
import useChromeLoading from '../src/ui/use-chrome-loading';
import {
  FOOTER_NAV_BOTTOM_OFFSET,
  FOOTER_NAV_RESERVED_SPACE,
} from '../src/ui/footer-nav';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  DEFAULT_DIRECT_BUY_BURN_BUFFER_TRX,
  computeDirectBuySplit,
  computeEstimatedDirectBuyTokens,
  formatDirectBuyAmountValue,
  formatDirectBuyPrice,
  loadDirectBuyContext,
  parseDirectBuyAmount,
  type DirectBuyContext,
} from '../src/services/direct-buy';
import { saveDirectBuyDraft } from '../src/services/direct-buy-draft';
import { TRX_LOGO } from '../src/services/tron/api';
import {
  getAllWalletPortfolios,
} from '../src/services/wallet/portfolio';
import { setActiveWalletId, type WalletMeta } from '../src/services/wallet/storage';
import { useWalletSession } from '../src/wallet/wallet-session';
import { BackspaceIcon, CloseIcon } from '../src/ui/ui-icons';

const BUY_INFO_TITLE = 'How direct buy works';
const BUY_INFO_TEXT =
  'Use this screen to prepare a direct 4TEEN purchase with the selected signing wallet. Enter the TRX amount and the app shows the estimated 4TEEN you will receive before anything is signed.\n\nDirect buy is not a swap. FourteenToken mints 4TEEN by contract rules, locks the purchased batch for 14 days, and routes the incoming TRX across liquidity, controller-side accounting, and the airdrop rail.\n\nContinue opens the confirmation step. That is where the app builds the real transaction, checks resources, and only then asks for passcode or biometrics.';

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
  if (firstDot === -1) return filtered;

  const normalized = `${filtered.slice(0, firstDot + 1)}${filtered
    .slice(firstDot + 1)
    .replace(/\./g, '')}`;

  return normalized.startsWith('.') ? `0${normalized}` : normalized;
}

function formatInputNumber(value: number, maxFractionDigits = 6) {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(maxFractionDigits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatTokenAmount(value: number, maximumFractionDigits = 6) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0.00';
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: maximumFractionDigits,
  });
}

function formatCompactTrx(value: string | number) {
  const numeric =
    typeof value === 'number'
      ? value
      : Number(String(value || '0').replace(/,/g, '').trim());

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '0';
  }

  if (numeric >= 1_000_000_000) {
    return `${(numeric / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}b`;
  }

  if (numeric >= 1_000_000) {
    return `${(numeric / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}m`;
  }

  if (numeric >= 1_000) {
    return `${(numeric / 1_000).toFixed(2).replace(/\.?0+$/, '')}k`;
  }

  return numeric.toFixed(numeric >= 1 ? 3 : 6).replace(/\.?0+$/, '');
}

function applyAmountLimit(value: string, maxValue?: number) {
  const normalized = normalizeAmountInput(value);

  if (!normalized) return '';

  if (!Number.isFinite(maxValue) || Number(maxValue) <= 0) {
    return normalized;
  }

  const parsed = parseDirectBuyAmount(normalized);
  if (parsed <= 0) {
    return normalized;
  }

  if (parsed > Number(maxValue)) {
    return formatInputNumber(Number(maxValue), 6);
  }

  return normalized;
}

type WalletSwitcherItem = {
  id: string;
  name: string;
  address: string;
  kind: WalletMeta['kind'];
  balanceDisplay: string;
};

export default function BuyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ amount?: string | string[] }>();
  const notice = useNotice();
  const { setPendingWalletSelectionId } = useWalletSession();
  const insets = useSafeAreaInsets();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const scrollRef = useRef<any>(null);
  const initialAmount = resolveParam(params.amount).trim();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [context, setContext] = useState<DirectBuyContext | null>(null);
  const [walletChoices, setWalletChoices] = useState<WalletSwitcherItem[]>([]);
  const [walletOptionsOpen, setWalletOptionsOpen] = useState(false);
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);
  const [amount, setAmount] = useState(normalizeAmountInput(initialAmount));
  const [errorText, setErrorText] = useState('');
  const [amountKeyboardVisible, setAmountKeyboardVisible] = useState(false);
  const [amountSectionY, setAmountSectionY] = useState(0);
  const [infoExpanded, setInfoExpanded] = useState(false);

  useChromeLoading(loading || refreshing);

  const contentBottomInset = useBottomInset(amountKeyboardVisible ? 312 : 0);
  const amountBackspaceActsAsClose = amount === '' || amount === '0';
  const enteredAmount = useMemo(() => parseDirectBuyAmount(amount), [amount]);
  const estimatedTokens = useMemo(() => {
    return computeEstimatedDirectBuyTokens(
      enteredAmount,
      context?.tokenPriceSun ?? 0,
      context?.tokenDecimals ?? 6
    );
  }, [context?.tokenDecimals, context?.tokenPriceSun, enteredAmount]);
  const split = useMemo(() => computeDirectBuySplit(enteredAmount), [enteredAmount]);
  const exceedsBalance = Boolean(context) && enteredAmount > (context?.trxBalance ?? 0);
  const canContinue = Boolean(context) && enteredAmount > 0 && !exceedsBalance;

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;

    if (!silent) setLoading(true);

    try {
      const nextContext = await loadDirectBuyContext();
      const aggregate = await getAllWalletPortfolios({ force: Boolean(refreshing) });
      const signingWalletChoices = aggregate.items
        .filter((item) => item.wallet.kind !== 'watch-only')
        .map((item) => ({
          id: item.wallet.id,
          name: item.wallet.name,
          address: item.wallet.address,
          kind: item.wallet.kind,
          balanceDisplay:
            item.portfolio?.assets.find((asset) => asset.id === 'trx')?.amountDisplay || '0',
        }));
      setContext(nextContext);
      setWalletChoices(signingWalletChoices);
      setErrorText('');

      if (nextContext.switchedFromWatchOnly) {
        notice.showNeutralNotice(
          `Using signing wallet ${nextContext.wallet.name} for direct buy.`,
          2600
        );
      }
    } catch (error) {
      setContext(null);
      setWalletChoices([]);
      setErrorText(error instanceof Error ? error.message : 'Failed to load buy flow.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notice, refreshing]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const closeAmountKeyboard = useCallback(() => {
    setAmountKeyboardVisible(false);
  }, []);
  const amountKeyboardSwipeGesture = useSwipeDownDismiss(closeAmountKeyboard);

  const selectedWalletOption = walletChoices.find((wallet) => wallet.id === context?.wallet.id) ?? null;
  const visibleWalletChoices = walletChoices.filter((wallet) => wallet.id !== context?.wallet.id);

  const handleToggleWalletOptions = useCallback(() => {
    if (visibleWalletChoices.length <= 0) {
      notice.showNeutralNotice('No other signing wallets available.', 2200);
      return;
    }

    closeAmountKeyboard();
    setWalletOptionsOpen((prev) => !prev);
  }, [closeAmountKeyboard, notice, visibleWalletChoices.length]);

  const handleChooseWallet = useCallback(async (wallet: WalletSwitcherOption) => {
    try {
      setSwitchingWalletId(wallet.id);
      setWalletOptionsOpen(false);
      closeAmountKeyboard();
      setAmount('');
      await setActiveWalletId(wallet.id);
      setPendingWalletSelectionId(wallet.id);
      await load({ silent: true });
    } catch (error) {
      console.error(error);
      notice.showErrorNotice('Failed to switch buy wallet.', 2400);
    } finally {
      setSwitchingWalletId(null);
    }
  }, [closeAmountKeyboard, load, notice, setPendingWalletSelectionId]);

  const openAmountKeyboard = useCallback(() => {
    setWalletOptionsOpen(false);
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

  const handleAmountSectionLayout = useCallback((event: LayoutChangeEvent) => {
    setAmountSectionY(event.nativeEvent.layout.y);
  }, []);

  const handleAmountDigitPress = useCallback((digit: string) => {
    setAmount((current) => applyAmountLimit(`${current}${digit}`, context?.trxBalance));
  }, [context?.trxBalance]);

  const handleAmountDotPress = useCallback(() => {
    setAmount((current) => {
      const safe = String(current || '');
      if (safe.includes('.')) return safe;
      if (!safe) return '0.';
      return applyAmountLimit(`${safe}.`, context?.trxBalance);
    });
  }, [context?.trxBalance]);

  const handleAmountBackspace = useCallback(() => {
    if (amountBackspaceActsAsClose) {
      closeAmountKeyboard();
      return;
    }

    setAmount((current) => {
      const next = String(current || '').slice(0, -1);
      if (!next || next === '0') return '';
      return next;
    });
  }, [amountBackspaceActsAsClose, closeAmountKeyboard]);

  const handleContinue = useCallback(async () => {
    if (!context) {
      notice.showErrorNotice('Direct buy requires a full-access wallet.', 2600);
      return;
    }

    if (enteredAmount <= 0) {
      notice.showErrorNotice('Enter a valid TRX amount.', 2400);
      return;
    }

    if (enteredAmount > context.trxBalance) {
      notice.showErrorNotice('Insufficient TRX balance for this buy.', 2600);
      return;
    }

    try {
      const amountTrx = formatDirectBuyAmountValue(enteredAmount);

      await saveDirectBuyDraft({
        amountTrx,
        contractAddress: context.contractAddress,
      });
      closeAmountKeyboard();
      router.push({
        pathname: '/buy-confirm',
        params: {
          amountTrx,
          contractAddress: context.contractAddress,
        },
      });
    } catch (error) {
      notice.showErrorNotice(
        error instanceof Error ? error.message : 'Failed to open buy confirmation.',
        3000
      );
    }
  }, [closeAmountKeyboard, context, enteredAmount, notice, router]);

  const handleSelectMax = useCallback(() => {
    if (!context) return;
    const nextAmount = Math.max(0, context.trxBalance - DEFAULT_DIRECT_BUY_BURN_BUFFER_TRX);
    setAmount(formatInputNumber(nextAmount, 6));
  }, [context]);

  if (loading) {
    return <ScreenLoadingState label="Loading buy..." />;
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
          enableAutomaticScroll={false}
          extraScrollHeight={0}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load({ silent: true });
              }}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => {
            closeAmountKeyboard();
            setWalletOptionsOpen(false);
          }}
        >
          <ScreenBrow
            label="DIRECT BUY"
            variant="back"
            onLabelPress={() => setInfoExpanded((prev) => !prev)}
            labelAccessory={<InfoToggleIcon expanded={infoExpanded} />}
          />

          {infoExpanded ? (
            <View style={styles.infoPanel}>
              <Text style={styles.infoTitle}>{BUY_INFO_TITLE}</Text>
              <Text style={styles.infoText}>{BUY_INFO_TEXT}</Text>
            </View>
          ) : null}

          <View style={styles.sectionBlock}>
            <SelectedWalletSwitcher
              wallet={
                context
                  ? {
                      id: context.wallet.id,
                      name: selectedWalletOption?.name || context.wallet.name,
                      address: selectedWalletOption?.address || context.wallet.address,
                      kind: selectedWalletOption?.kind || context.wallet.kind,
                      balanceDisplay:
                        selectedWalletOption?.balanceDisplay || context.trxValueDisplay || '$0.00',
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
              emptyTitle="No signing wallet"
              emptyBody="Import or switch to a full-access wallet."
            />
          </View>

          <View style={styles.sectionBlock} onLayout={handleAmountSectionLayout}>
            <View style={styles.fieldHeaderRow}>
              <Text style={styles.sectionEyebrow}>BUY AMOUNT</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSelectMax}
                style={styles.maxButton}
              >
                <Text style={styles.maxButtonText}>MAX</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={1}
              onPress={openAmountKeyboard}
              style={[styles.inputShell, exceedsBalance ? styles.inputShellError : null]}
            >
              <TextInput
                value={amount}
                onChangeText={(value) =>
                  setAmount(applyAmountLimit(value, context?.trxBalance))
                }
                placeholder="0.00"
                placeholderTextColor={colors.textDim}
                style={styles.amountInput}
                autoCapitalize="none"
                autoCorrect={false}
                showSoftInputOnFocus={false}
                onFocus={openAmountKeyboard}
                selectionColor={colors.accent}
              />

              <View style={styles.inputSuffixWrap}>
                <Image source={{ uri: TRX_LOGO }} style={styles.inputTokenLogo} contentFit="contain" />
                <Text style={styles.inputSuffix}>TRX</Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.hintText}>
              Current price {context ? `${formatDirectBuyPrice(context.tokenPriceSun)} TRX` : '—'} per
              4TEEN. Direct buy locks received 4TEEN for 14 days.
            </Text>

            {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
            {exceedsBalance ? (
              <Text style={styles.errorText}>Entered amount is higher than available TRX.</Text>
              ) : null}
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionEyebrow}>YOU RECEIVE</Text>

            <View
              style={[
                styles.inputShell,
                styles.receiveShell,
                estimatedTokens > 0 ? styles.receiveShellActive : null,
              ]}
            >
              <Text
                style={[
                  styles.amountInput,
                  styles.receiveValue,
                  estimatedTokens > 0 ? styles.receiveValueActive : null,
                ]}
                numberOfLines={1}
              >
                {formatTokenAmount(estimatedTokens)}
              </Text>

              <Text
                style={[
                  styles.inputSuffix,
                  styles.receiveSuffix,
                  estimatedTokens > 0 ? styles.receiveValueActive : null,
                ]}
              >
                4TEEN
              </Text>
            </View>

            <View style={styles.splitSummary}>
              <View style={styles.splitSummaryItem}>
                <Text style={styles.splitSummaryLabel}>LIQUIDITY</Text>
                <Text style={[styles.splitSummaryText, styles.splitSummaryTextLiquidity]}>
                  {formatCompactTrx(split.liquidityShareTrx)} TRX
                </Text>
              </View>

              <View style={styles.splitSummaryItem}>
                <Text style={styles.splitSummaryLabel}>CONTROLLER</Text>
                <Text style={[styles.splitSummaryText, styles.splitSummaryTextController]}>
                  {formatCompactTrx(split.ownerShareTrx)} TRX
                </Text>
              </View>

              <View style={styles.splitSummaryItem}>
                <Text style={styles.splitSummaryLabel}>AIRDROP</Text>
                <Text style={[styles.splitSummaryText, styles.splitSummaryTextAirdrop]}>
                  {formatCompactTrx(split.airdropShareTrx)} TRX
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={!canContinue}
            onPress={handleContinue}
            style={[styles.continueButton, !canContinue ? styles.continueButtonDisabled : null]}
          >
            <Text
              style={[
                styles.continueButtonText,
                !canContinue ? styles.continueButtonTextDisabled : null,
              ]}
            >
              CONTINUE
            </Text>
          </TouchableOpacity>
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

  sectionBlock: {
    marginBottom: 16,
  },

  sectionEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    marginBottom: 8,
  },

  walletCard: {
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

  walletCardClosed: {
    marginBottom: 0,
  },

  walletCardOpen: {
    marginBottom: 10,
  },

  walletCardCopy: {
    flex: 1,
    minHeight: 58,
    gap: 6,
  },

  walletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  walletName: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 23,
    fontFamily: 'Sora_700Bold',
  },

  activeBadge: {
    color: colors.green,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  walletAccess: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  walletBalance: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  walletAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  walletCaretWrap: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  walletOptionsList: {
    gap: 10,
  },

  walletOptionCard: {
    minHeight: 70,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  walletOptionCopy: {
    flex: 1,
    gap: 4,
  },

  walletOptionName: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  walletOptionAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
  },

  walletOptionSide: {
    alignItems: 'flex-end',
    gap: 6,
  },

  walletOptionBalance: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },

  sectionFieldTitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  maxButton: {
    minHeight: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  maxButtonText: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.3,
  },

  inputShell: {
    minHeight: layout.fieldHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  inputShellError: {
    borderColor: colors.red,
  },

  receiveShell: {
    borderColor: colors.lineSoft,
  },

  receiveShellActive: {
    borderColor: 'rgba(24,224,58,0.28)',
    backgroundColor: 'rgba(24,224,58,0.08)',
  },

  amountInput: {
    flex: 1,
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
    paddingVertical: 0,
  },

  receiveValue: {
    color: colors.textSoft,
  },

  receiveValueActive: {
    color: colors.green,
  },

  inputSuffix: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  inputSuffixWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  inputTokenLogo: {
    width: 18,
    height: 18,
  },

  receiveSuffix: {
    color: colors.textSoft,
  },

  hintText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },

  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },

  previewCard: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },

  previewValue: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 23,
    fontFamily: 'Sora_700Bold',
  },

  previewBody: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },

  metaLabel: {
    ...ui.muted,
    color: colors.textSoft,
  },

  metaValue: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  splitSummary: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },

  splitSummaryItem: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },

  splitSummaryLabel: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    textAlign: 'center',
  },

  splitSummaryText: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },

  splitSummaryTextLiquidity: {
    color: colors.green,
  },

  splitSummaryTextController: {
    color: colors.accent,
  },

  splitSummaryTextAirdrop: {
    color: colors.white,
  },

  errorText: {
    color: '#ff8c7a',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
    marginTop: 8,
  },

  continueButton: {
    minHeight: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },

  continueButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },

  continueButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
  },

  continueButtonTextDisabled: {
    color: colors.textDim,
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
});
