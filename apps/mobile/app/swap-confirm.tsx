import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingOverlay from '../src/ui/screen-loading-overlay';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import ApprovalAuthModal from '../src/ui/approval-auth-modal';
import EnergyResaleCard from '../src/ui/energy-resale-card';
import ConfirmNetworkLoadCard from '../src/ui/confirm-network-load-card';
import { useNavigationInsets } from '../src/ui/navigation';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { goBackOrReplace } from '../src/ui/safe-back';
import { colors, layout, radius } from '../src/theme/tokens';
import { useNotice } from '../src/notice/notice-provider';
import {
  TRX_TOKEN_ID,
  clearWalletRuntimeCaches,
  prependTokenHistoryCacheItem,
  prependWalletHistoryCacheItem,
} from '../src/services/tron/api';
import {
  clearFourteenSwapDraft,
  getFourteenSwapDraft,
} from '../src/services/swap/draft';
import {
  buildSwapReview,
  executeSwap,
  type FourteenSwapReview,
} from '../src/services/swap/sunio';
import {
  getBiometricsEnabled,
  verifyPasscode,
} from '../src/security/local-auth';
import { useWalletSession } from '../src/wallet/wallet-session';
import {
  getEnergyResaleQuote,
  rentEnergyForPurpose,
  type EnergyResaleQuote,
} from '../src/services/energy-resale';
import {
  formatTrxFromSunAmount,
  getAvailableResource,
  normalizeResourceAmount,
} from '../src/services/wallet/resources';

function decimalToRaw(amount: string, decimals: number) {
  const safe = String(amount || '').replace(',', '.').trim();

  if (!/^\d+(\.\d*)?$/.test(safe)) {
    return '0';
  }

  const [wholePart, fractionPart = ''] = safe.split('.');
  const paddedFraction = fractionPart.padEnd(decimals, '0').slice(0, decimals);
  const normalized = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, '');

  return normalized || '0';
}

function buildTronscanTxUrl(txHash: string) {
  return `https://tronscan.org/#/transaction/${txHash}`;
}

function formatCompactHeroAmount(value: string | number) {
  const safe = Math.max(0, Number(value || 0));

  if (!Number.isFinite(safe) || safe <= 0) {
    return '0.00';
  }

  if (safe >= 1_000_000_000) {
    return `${(safe / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}b`;
  }

  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}m`;
  }

  if (safe >= 1_000) {
    return `${(safe / 1_000).toFixed(2).replace(/\.?0+$/, '')}k`;
  }

  return safe.toFixed(2).replace(/\.?0+$/, '');
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('429');
}

function getSwapConfirmErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (isRateLimitError(error)) {
    return 'Rate limit reached while refreshing swap data. Pull to refresh in a few seconds.';
  }

  return message || 'Failed to build swap confirmation.';
}

export default function SwapConfirmScreen() {
  const router = useRouter();
  const notice = useNotice();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();
  const { triggerWalletDataRefresh, setChromeHidden } = useWalletSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<FourteenSwapReview | null>(null);
  const [errorText, setErrorText] = useState('');
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeEntryOpen, setPasscodeEntryOpen] = useState(false);
  const [passcodeDigits, setPasscodeDigits] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [energyQuote, setEnergyQuote] = useState<EnergyResaleQuote | null>(null);
  const [energyQuoteLoading, setEnergyQuoteLoading] = useState(false);
  const [energyRenting, setEnergyRenting] = useState(false);
  const [pendingApprovalMode, setPendingApprovalMode] = useState<'swap' | 'rent'>('swap');
  const routeChangedNoticeShownRef = useRef(false);
  const preserveNoticeOnExitRef = useRef(false);
  const canUseBiometrics = biometricAvailable && biometricsEnabled;

  useChromeLoading(loading || refreshing);

  const approvalAvailableEnergy = review?.resources.approval
    ? getAvailableResource(review.resources.approval.available, 'energy')
    : 0;
  const swapAvailableEnergy = review?.resources.swap
    ? getAvailableResource(review.resources.swap.available, 'energy')
    : 0;
  const approvalAvailableBandwidth = review?.resources.approval
    ? getAvailableResource(review.resources.approval.available, 'bandwidth')
    : 0;
  const swapAvailableBandwidth = review?.resources.swap
    ? getAvailableResource(review.resources.swap.available, 'bandwidth')
    : 0;
  const estimatedEnergy =
    normalizeResourceAmount(review?.resources.approval?.estimatedEnergy) +
    normalizeResourceAmount(review?.resources.swap?.estimatedEnergy);
  const estimatedBandwidth =
    normalizeResourceAmount(review?.resources.approval?.estimatedBandwidth) +
    normalizeResourceAmount(review?.resources.swap?.estimatedBandwidth);
  const totalAvailableEnergy = Math.max(approvalAvailableEnergy, swapAvailableEnergy);
  const totalAvailableBandwidth = Math.max(approvalAvailableBandwidth, swapAvailableBandwidth);
  const resourceEnergyShortfall =
    normalizeResourceAmount(review?.resources.approval?.energyShortfall) +
    normalizeResourceAmount(review?.resources.swap?.energyShortfall);
  const resourceBandwidthShortfall =
    normalizeResourceAmount(review?.resources.approval?.bandwidthShortfall) +
    normalizeResourceAmount(review?.resources.swap?.bandwidthShortfall);
  const hasResourceShortfall = resourceEnergyShortfall > 0 || resourceBandwidthShortfall > 0;
  const canRentResources = estimatedEnergy > 0 || estimatedBandwidth > 0;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');

      const draft = await getFourteenSwapDraft();

      if (!draft) {
        throw new Error('Swap request is missing. Go back and build the swap again.');
      }

      const nextReview = await buildSwapReview(draft);
      setReview(nextReview);
    } catch (error) {
      setReview(null);
      setErrorText(getSwapConfirmErrorText(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBiometricsState = useCallback(async () => {
    try {
      const enabled = await getBiometricsEnabled();
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

      setBiometricsEnabled(enabled);
      setBiometricAvailable(enabled && compatible && enrolled);

      if (supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricLabel('Face ID');
        return;
      }

      if (supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricLabel('Fingerprint');
        return;
      }

      setBiometricLabel('Biometrics');
    } catch (error) {
      console.error(error);
      setBiometricsEnabled(false);
      setBiometricAvailable(false);
      setBiometricLabel('Biometrics');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadBiometricsState();
  }, [loadBiometricsState]);

  useEffect(() => {
    if (!review?.routeChanged || routeChangedNoticeShownRef.current) return;
    routeChangedNoticeShownRef.current = true;
    notice.showNeutralNotice('Route updated before approval. Review the latest quote.', 2600);
  }, [notice, review?.routeChanged]);

  useEffect(() => {
    setChromeHidden(passcodeOpen);
  }, [passcodeOpen, setChromeHidden]);

  useEffect(() => {
    return () => {
      routeChangedNoticeShownRef.current = false;
      setChromeHidden(false);
      if (!preserveNoticeOnExitRef.current) {
        notice.hideNotice();
      }
      preserveNoticeOnExitRef.current = false;
    };
  }, [notice, setChromeHidden]);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    let cancelled = false;

    if (!review || !canRentResources || review.wallet.kind === 'watch-only') {
      setEnergyQuote(null);
      setEnergyQuoteLoading(false);
      return;
    }

    setEnergyQuoteLoading(true);
    getEnergyResaleQuote({
      purpose: 'swap',
      wallet: review.wallet.address,
      requiredEnergy: resourceEnergyShortfall || estimatedEnergy,
      requiredBandwidth: resourceBandwidthShortfall || estimatedBandwidth,
    }).then((quote) => {
      if (!cancelled) setEnergyQuote(quote);
    }).finally(() => {
      if (!cancelled) setEnergyQuoteLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    canRentResources,
    estimatedBandwidth,
    estimatedEnergy,
    resourceBandwidthShortfall,
    resourceEnergyShortfall,
    review,
  ]);

  const performRentEnergy = useCallback(async () => {
    if (!review || !energyQuote || energyRenting) return false;

    try {
      setEnergyRenting(true);
      notice.showNeutralNotice('Sending Energy rental payment...', 2500);
      await rentEnergyForPurpose({
        purpose: 'swap',
        wallet: review.wallet.address,
        quote: energyQuote,
        onProgress: (progress) => notice.showNeutralNotice(progress.message, 2600),
      });
      clearWalletRuntimeCaches(review.wallet.address);
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice('Energy is live. Starting swap...', 3000);
      await load();
      return true;
    } catch (error) {
      console.error(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : 'Energy rental failed.',
        4200
      );
      return false;
    } finally {
      setEnergyRenting(false);
      setPasscodeOpen(false);
      setPasscodeDigits('');
      setPasscodeError('');
    }
  }, [energyQuote, energyRenting, load, notice, review]);

  const performSwap = useCallback(async () => {
    if (!review || submitting) return;

    try {
      setSubmitting(true);

      const result = await executeSwap({
        route: review.route,
        amountIn: review.amountIn,
        slippage: review.slippage,
        sourceToken: review.inputToken,
        walletId: review.wallet.id,
        feeLimitSun: review.resources.swap?.recommendedFeeLimitSun,
        approvalFeeLimitSun: review.resources.approval?.recommendedFeeLimitSun,
        onProgress(progress) {
          if (
            progress.step === 'approval-submitted' ||
            progress.step === 'swap-submitted' ||
            progress.step === 'swap-confirmed'
          ) {
            notice.showNeutralNotice(progress.message, 2200);
          }
        },
      });

      const timestamp = Date.now();
      const explorerUrl = buildTronscanTxUrl(result.txid);
      const sourceAmountRaw = decimalToRaw(review.amountIn, review.inputToken.decimals);
      const sourceAmountFormatted = `-${review.amountIn}`;
      const outputAmountRaw = String(review.route.expectedOutRaw || '0');
      const outputAmountFormatted = `+ ${review.expectedOut}`;

      await prependWalletHistoryCacheItem(review.wallet.address, {
        id: `${review.inputToken.tokenId}:${result.txid}:SEND:${sourceAmountRaw}`,
        txHash: result.txid,
        type: 'OUT',
        displayType: 'SEND',
        amountRaw: sourceAmountRaw,
        amountFormatted: sourceAmountFormatted,
        timestamp,
        from: review.wallet.address,
        counterpartyLabel: review.route.providerName,
        isKnownContact: false,
        tronscanUrl: explorerUrl,
        tokenId: review.inputToken.tokenId,
        tokenName: review.inputToken.name || review.inputToken.symbol,
        tokenSymbol: review.inputToken.symbol,
        tokenLogo: review.inputToken.logo || undefined,
      });

      await prependTokenHistoryCacheItem(review.wallet.address, review.inputToken.tokenId, {
        id: `${result.txid}:source`,
        txHash: result.txid,
        type: 'OUT',
        displayType: 'SEND',
        amountRaw: sourceAmountRaw,
        amountFormatted: sourceAmountFormatted,
        timestamp,
        from: review.wallet.address,
        counterpartyLabel: review.route.providerName,
        isKnownContact: false,
        tronscanUrl: explorerUrl,
      });

      await prependWalletHistoryCacheItem(review.wallet.address, {
        id: `${review.outputToken.tokenId}:${result.txid}:RECEIVE:${outputAmountRaw}`,
        txHash: result.txid,
        type: 'IN',
        displayType: 'RECEIVE',
        amountRaw: outputAmountRaw,
        amountFormatted: outputAmountFormatted,
        timestamp,
        to: review.wallet.address,
        counterpartyLabel: review.route.providerName,
        isKnownContact: false,
        tronscanUrl: explorerUrl,
        tokenId: review.outputToken.tokenId,
        tokenName:
          review.outputToken.name ||
          (review.outputToken.tokenId === TRX_TOKEN_ID ? 'TRON' : review.outputToken.symbol),
        tokenSymbol: review.outputToken.symbol,
        tokenLogo: review.outputToken.logo || undefined,
      });

      await prependTokenHistoryCacheItem(review.wallet.address, review.outputToken.tokenId, {
        id: `${result.txid}:output`,
        txHash: result.txid,
        type: 'IN',
        displayType: 'RECEIVE',
        amountRaw: outputAmountRaw,
        amountFormatted: outputAmountFormatted,
        timestamp,
        to: review.wallet.address,
        counterpartyLabel: review.route.providerName,
        isKnownContact: false,
        tronscanUrl: explorerUrl,
      });

      await clearFourteenSwapDraft();
      clearWalletRuntimeCaches(review.wallet.address);
      triggerWalletDataRefresh();
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice(
        `Swap confirmed. ${review.outputToken.symbol} will appear in your wallet shortly.`,
        3000
      );
      router.replace('/wallet');
      setPasscodeEntryOpen(false);
      setPasscodeOpen(false);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice(error instanceof Error ? error.message : 'Swap failed.', 3200);
    } finally {
      setSubmitting(false);
    }
  }, [notice, review, router, submitting, triggerWalletDataRefresh]);

  const handlePasscodeSubmit = useCallback(async () => {
    if (submitting || energyRenting || passcodeDigits.length !== 6) return;

    try {
      const ok = await verifyPasscode(passcodeDigits);

      if (!ok) {
        setPasscodeError('Wrong passcode.');
        setPasscodeDigits('');
        return;
      }

      if (pendingApprovalMode === 'rent') {
        const rented = await performRentEnergy();
        if (rented) {
          await performSwap();
        }
        return;
      }

      await performSwap();
    } catch (error) {
      console.error(error);
      setPasscodeError('Failed to verify passcode.');
      setPasscodeDigits('');
    }
  }, [energyRenting, passcodeDigits, pendingApprovalMode, performRentEnergy, performSwap, submitting]);

  useEffect(() => {
    if (passcodeOpen && passcodeDigits.length === 6) {
      void handlePasscodeSubmit();
    }
  }, [handlePasscodeSubmit, passcodeDigits, passcodeOpen]);

  const handleApprove = useCallback(async () => {
    if (!review || submitting) return;
    setPendingApprovalMode('swap');
    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeEntryOpen(!canUseBiometrics);
    setPasscodeOpen(true);
  }, [canUseBiometrics, review, submitting]);

  const handleRentEnergy = useCallback(async () => {
    if (!review || !energyQuote || submitting || energyRenting) return;

    setPendingApprovalMode('rent');
    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeEntryOpen(!canUseBiometrics);
    setPasscodeOpen(true);
  }, [
    canUseBiometrics,
    energyQuote,
    energyRenting,
    review,
    submitting,
  ]);

  const handleReject = useCallback(async () => {
    if (submitting) return;
    preserveNoticeOnExitRef.current = true;
    await clearFourteenSwapDraft();
    notice.showNeutralNotice('Swap rejected by user.', 2200);
    goBackOrReplace(router, { fallback: '/swap' });
  }, [notice, router, submitting]);

  const handlePasscodeDigitPress = useCallback((digit: string) => {
    if (submitting) return;
    setPasscodeError('');
    setPasscodeDigits((prev) => (prev.length >= 6 ? prev : `${prev}${digit}`));
  }, [submitting]);

  const handlePasscodeBackspace = useCallback(() => {
    if (submitting) return;
    setPasscodeError('');
    setPasscodeDigits((prev) => prev.slice(0, -1));
  }, [submitting]);

  const closeApprovalAuth = useCallback(() => {
    setPasscodeOpen(false);
    setPasscodeEntryOpen(false);
    setPasscodeDigits('');
    setPasscodeError('');
  }, []);

  const openPasscodeEntry = useCallback(() => {
    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeEntryOpen(true);
  }, []);

  const closePasscodeEntry = useCallback(() => {
    if (canUseBiometrics) {
      setPasscodeDigits('');
      setPasscodeError('');
      setPasscodeEntryOpen(false);
      return;
    }

    closeApprovalAuth();
  }, [canUseBiometrics, closeApprovalAuth]);

  const handleBiometricApproval = useCallback(async () => {
    if (!canUseBiometrics) {
      openPasscodeEntry();
      return;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: pendingApprovalMode === 'rent' ? 'Confirm Energy Rental' : 'Confirm Swap',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
      });

      if (!result.success) {
        return;
      }

      if (pendingApprovalMode === 'rent') {
        const rented = await performRentEnergy();
        if (rented) {
          await performSwap();
        }
        return;
      }

      await performSwap();
    } catch (error) {
      console.error(error);
    }
  }, [canUseBiometrics, openPasscodeEntry, pendingApprovalMode, performRentEnergy, performSwap]);

  if (loading && !review) {
    return <ScreenLoadingState label="Loading swap confirmation..." />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScreenLoadingOverlay visible={refreshing} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: navInsets.top, paddingBottom: contentBottomInset + 22 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.bg}
            />
          }
        >
          <ScreenBrow label="SWAP" variant="back" />

          {errorText || !review ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{errorText || 'Unable to build swap review.'}</Text>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <Image
                  source={{ uri: review.outputToken.logo }}
                  style={styles.heroWatermark}
                  contentFit="contain"
                />

                <Text style={styles.heroWalletName}>{review.wallet.name}</Text>
                <Text style={styles.heroWalletAddress}>{review.wallet.address}</Text>

                <View style={styles.heroMetricRow}>
                  <View style={[styles.heroMetricCard, styles.heroMetricCardSpend]}>
                    <Text style={[styles.heroMetricLabel, styles.heroMetricLabelSpend]}>SPEND</Text>
                    <Text style={[styles.heroMetricValue, styles.heroMetricValueSpend]}>
                      {formatCompactHeroAmount(review.amountIn)}
                    </Text>
                    <View style={styles.heroMetricTokenRow}>
                      <Image
                        source={{ uri: review.inputToken.logo }}
                        style={styles.heroMetricTokenLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.heroMetricToken}>{review.inputToken.symbol}</Text>
                    </View>
                  </View>

                  <View style={[styles.heroMetricCard, styles.heroMetricCardReceive]}>
                    <Text style={[styles.heroMetricLabel, styles.heroMetricLabelReceive]}>RECEIVE</Text>
                    <Text style={[styles.heroMetricValue, styles.heroMetricValueReceive]}>
                      {formatCompactHeroAmount(review.expectedOut)}
                    </Text>
                    <View style={styles.heroMetricTokenRow}>
                      <Image
                        source={{ uri: review.outputToken.logo }}
                        style={styles.heroMetricTokenLogo}
                        contentFit="contain"
                      />
                      <Text style={styles.heroMetricToken}>{review.outputToken.symbol}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.heroMetaRow}>
                  <Text style={styles.heroMetaLabel}>Minimum out</Text>
                  <Text style={styles.heroMetaValue}>
                    {review.minReceived} {review.outputToken.symbol}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.primaryButton,
                  (submitting || review.wallet.kind === 'watch-only') && styles.primaryButtonDisabled,
                ]}
                onPress={() => void handleApprove()}
                disabled={submitting || review.wallet.kind === 'watch-only'}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>APPROVE & SWAP</Text>
                )}
              </TouchableOpacity>

              <EnergyResaleCard
                quote={energyQuote}
                loading={energyQuoteLoading}
                processing={energyRenting}
                disabled={submitting}
                showUnavailable={canRentResources}
                actionLabel="SWAP"
                estimatedBurnSun={review.resources.estimatedBurnSun}
                onRent={() => void handleRentEnergy()}
              />

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionEyebrow}>SWAP REVIEW</Text>
                <View style={styles.detailCard}>
                  <View style={styles.detailRowFirst}>
                    <Text style={styles.detailLabel}>From</Text>
                    <Text style={styles.detailValue}>{review.inputToken.symbol}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>To</Text>
                    <Text style={styles.detailValue}>{review.outputToken.symbol}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Route</Text>
                    <Text style={styles.detailValue}>{review.route.routeLabel}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Path</Text>
                    <Text style={styles.detailValue}>{review.route.symbols.join(' → ')}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Provider</Text>
                    <Text style={styles.detailValue}>{review.route.providerName}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Slippage</Text>
                    <Text style={styles.detailValue}>{review.slippage}%</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Approve</Text>
                    <Text
                      style={[
                        styles.detailValue,
                        review.approvalRequired ? styles.detailValueAccent : null,
                      ]}
                    >
                      {review.approvalRequired ? 'Required before swap' : 'Already approved'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Estimated Burn</Text>
                    <Text style={styles.detailValueAccent}>
                      {formatTrxFromSunAmount(review.resources.estimatedBurnSun)} TRX
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Fee Cap</Text>
                    <Text style={styles.detailValue}>
                      {formatTrxFromSunAmount(
                        Number(review.resources.swap?.recommendedFeeLimitSun || 0) +
                          Number(review.resources.approval?.recommendedFeeLimitSun || 0)
                      )}{' '}
                      TRX
                    </Text>
                  </View>
                </View>
              </View>

              <ConfirmNetworkLoadCard
                estimatedEnergy={estimatedEnergy}
                estimatedBandwidth={estimatedBandwidth}
                availableEnergy={totalAvailableEnergy}
                availableBandwidth={totalAvailableBandwidth}
                energyShortfall={resourceEnergyShortfall}
                bandwidthShortfall={resourceBandwidthShortfall}
                message={
                  hasResourceShortfall
                    ? 'You are short on resources. The burn estimate above already includes this gap.'
                    : 'You have enough resources for this action. Extra burn is unlikely.'
                }
                messageRisk={hasResourceShortfall}
              />

              {review.routeChanged ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.noticeCardText}>
                    Route changed before approval. You are looking at the latest live quote.
                  </Text>
                </View>
              ) : null}

              {review.wallet.kind === 'watch-only' ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.noticeCardText}>
                    Watch-only wallet cannot sign swap. Switch to a full-access wallet first.
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.secondaryButton}
                onPress={() => void handleReject()}
                disabled={submitting}
              >
                <Text style={styles.secondaryButtonText}>REJECT</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        <ApprovalAuthModal
          visible={passcodeOpen}
          eyebrow="SWAP"
          actionLabel={pendingApprovalMode === 'rent' ? 'Energy rental and swap' : 'swap'}
          passcodeError={passcodeError}
          digitsLength={passcodeDigits.length}
          canUseBiometrics={canUseBiometrics}
          biometricLabel={biometricLabel}
          passcodeEntryOpen={passcodeEntryOpen}
          submitting={submitting || energyRenting}
          onRequestClose={closeApprovalAuth}
          onOpenPasscode={openPasscodeEntry}
          onClosePasscode={closePasscodeEntry}
          onDigitPress={handlePasscodeDigitPress}
          onBackspacePress={handlePasscodeBackspace}
          onBiometricPress={() => void handleBiometricApproval()}
        />
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
    flexGrow: 1,
  },

  heroCard: {
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    padding: 16,
    overflow: 'hidden',
    position: 'relative',
    gap: 10,
  },

  heroWatermark: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 120,
    height: 120,
    opacity: 0.05,
  },

  heroWalletName: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Sora_700Bold',
  },

  heroWalletAddress: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  heroAmountRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },

  heroMetricRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },

  heroMetricCard: {
    flex: 1,
    minHeight: 96,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between',
    gap: 6,
  },

  heroMetricCardSpend: {
    borderColor: 'rgba(255,48,73,0.18)',
    backgroundColor: 'rgba(255,48,73,0.08)',
  },

  heroMetricCardReceive: {
    borderColor: 'rgba(24,224,58,0.18)',
    backgroundColor: 'rgba(24,224,58,0.08)',
  },

  heroMetricLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.5,
  },

  heroMetricLabelSpend: {
    color: colors.red,
  },

  heroMetricLabelReceive: {
    color: colors.green,
  },

  heroMetricValue: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: 'Sora_700Bold',
    color: colors.white,
  },

  heroMetricValueSpend: {
    color: colors.red,
  },

  heroMetricValueReceive: {
    color: colors.green,
  },

  heroMetricTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  heroMetricTokenLogo: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
  },

  heroMetricToken: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  heroMetaRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  heroMetaLabel: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.5,
  },

  heroMetaValue: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  detailCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    overflow: 'hidden',
  },

  detailRowFirst: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },

  detailRow: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },

  detailLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    flexShrink: 0,
  },

  detailValue: {
    flex: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },

  detailValueAccent: {
    color: colors.accent,
  },
  sectionBlock: {
    marginTop: 16,
    gap: 8,
  },
  sectionEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.5,
  },

  infoRow: {
    marginTop: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,105,0,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  infoRowText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },
  infoRowTextRisk: {
    color: colors.red,
  },

  noticeCard: {
    marginTop: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.06)',
    padding: 14,
  },

  noticeCardText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  actions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 12,
  },

  secondaryButton: {
    marginTop: 14,
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryButtonText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  primaryButton: {
    marginTop: 14,
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonDisabled: {
    backgroundColor: 'rgba(255,105,0,0.34)',
  },

  primaryButtonText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.7,
  },

  errorWrap: {
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,48,73,0.18)',
    backgroundColor: 'rgba(255,48,73,0.08)',
    padding: 16,
  },

  errorText: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  authModalSafe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  authOverlay: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  authScreen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPaddingX,
  },

  authContent: {
    gap: 18,
  },

  authTitle: {
    color: colors.white,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: 'Sora_700Bold',
  },

  authTitleAccent: {
    color: colors.accent,
  },

  authLead: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
  },

  authCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    padding: 16,
    gap: 14,
  },

  authCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  authCardErrorText: {
    flex: 1,
    textAlign: 'right',
    color: colors.red,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },

  dot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'transparent',
  },

  dotFilled: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  authCancelButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  resourcesInlineRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },

  resourceInlineCol: {
    gap: 6,
  },

  resourceInlineLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  resourceInlineLabelRisk: {
    color: colors.red,
  },

  resourceBarTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  resourceBarTrackRisk: {
    backgroundColor: 'rgba(255,48,73,0.14)',
  },

  resourceBarAvailable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24,224,58,0.18)',
  },
  resourceBarAvailableRisk: {
    backgroundColor: 'rgba(255,48,73,0.12)',
  },

  resourceBarUsed: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
    borderRadius: 999,
  },

  authCancelButtonText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },
});
