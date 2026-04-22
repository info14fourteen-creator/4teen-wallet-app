import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import ScreenLoadingState from '../src/ui/screen-loading-state';
import EnergyResaleCard from '../src/ui/energy-resale-card';
import NumericKeypad from '../src/ui/numeric-keypad';
import { useNavigationInsets } from '../src/ui/navigation';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
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

import { BackspaceIcon, BioLoginIcon } from '../src/ui/ui-icons';

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

function formatResourceValue(value: number) {
  const safe = Math.max(0, Math.floor(Number(value) || 0));

  if (safe >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  }

  if (safe >= 1_000) {
    return `${(safe / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }

  return String(safe);
}

function formatTrxAmountFromSun(value: number) {
  const trx = Math.max(0, Number(value || 0)) / 1_000_000;
  return trx.toFixed(trx >= 1 ? 3 : 6).replace(/\.?0+$/, '');
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

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
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

  useChromeLoading(loading || refreshing);

  const approvalAvailableEnergy = review?.resources.approval
    ? Math.max(
        0,
        review.resources.approval.available.energyLimit -
          review.resources.approval.available.energyUsed
      )
    : 0;
  const swapAvailableEnergy = review?.resources.swap
    ? Math.max(0, review.resources.swap.available.energyLimit - review.resources.swap.available.energyUsed)
    : 0;
  const approvalAvailableBandwidth = review?.resources.approval
    ? Math.max(
        0,
        review.resources.approval.available.bandwidthLimit -
          review.resources.approval.available.bandwidthUsed
      )
    : 0;
  const swapAvailableBandwidth = review?.resources.swap
    ? Math.max(
        0,
        review.resources.swap.available.bandwidthLimit - review.resources.swap.available.bandwidthUsed
      )
    : 0;
  const estimatedEnergy =
    Number(review?.resources.approval?.estimatedEnergy || 0) +
    Number(review?.resources.swap?.estimatedEnergy || 0);
  const estimatedBandwidth =
    Number(review?.resources.approval?.estimatedBandwidth || 0) +
    Number(review?.resources.swap?.estimatedBandwidth || 0);
  const totalAvailableEnergy = Math.max(approvalAvailableEnergy, swapAvailableEnergy);
  const totalAvailableBandwidth = Math.max(approvalAvailableBandwidth, swapAvailableBandwidth);
  const hasNoEnergyAvailable = totalAvailableEnergy <= 0;
  const resourceEnergyShortfall =
    Number(review?.resources.approval?.energyShortfall || 0) +
    Number(review?.resources.swap?.energyShortfall || 0);
  const resourceBandwidthShortfall =
    Number(review?.resources.approval?.bandwidthShortfall || 0) +
    Number(review?.resources.swap?.bandwidthShortfall || 0);
  const hasResourceShortfall = resourceEnergyShortfall > 0 || resourceBandwidthShortfall > 0;
  const canRentResources = estimatedEnergy > 0 || estimatedBandwidth > 0;
  const energyBarPercent = clampPercent(
    (estimatedEnergy / Math.max(estimatedEnergy, totalAvailableEnergy, 1)) * 100
  );
  const bandwidthBarPercent = clampPercent(
    (estimatedBandwidth / Math.max(estimatedBandwidth, totalAvailableBandwidth, 1)) * 100
  );

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
    if (!review || !energyQuote || energyRenting) return;

    try {
      setEnergyRenting(true);
      notice.showNeutralNotice('Sending Energy rental payment...', 2500);
      await rentEnergyForPurpose({
        purpose: 'swap',
        wallet: review.wallet.address,
        quote: energyQuote,
      });
      clearWalletRuntimeCaches(review.wallet.address);
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice('Energy is live. Refreshing confirmation...', 3000);
      await load();
    } catch (error) {
      console.error(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : 'Energy rental failed.',
        4200
      );
    } finally {
      setEnergyRenting(false);
    }
    setPasscodeOpen(false);
    setPasscodeDigits('');
    setPasscodeError('');
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
        await performRentEnergy();
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

    if (biometricAvailable && biometricsEnabled) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm Swap',
          fallbackLabel: 'Use Passcode',
          cancelLabel: 'Cancel',
        });

        if (result.success) {
          await performSwap();
          return;
        }

        if (
          result.error === 'user_cancel' ||
          result.error === 'system_cancel' ||
          result.error === 'app_cancel'
        ) {
          return;
        }
      } catch (error) {
        console.error(error);
      }
    }

    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeOpen(true);
  }, [biometricAvailable, biometricsEnabled, performSwap, review, submitting]);

  const handleRentEnergy = useCallback(async () => {
    if (!review || !energyQuote || submitting || energyRenting) return;

    setPendingApprovalMode('rent');

    if (biometricAvailable && biometricsEnabled) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm Energy Rental',
          fallbackLabel: 'Use Passcode',
          cancelLabel: 'Cancel',
        });

        if (result.success) {
          await performRentEnergy();
          return;
        }

        if (
          result.error === 'user_cancel' ||
          result.error === 'system_cancel' ||
          result.error === 'app_cancel'
        ) {
          return;
        }
      } catch (error) {
        console.error(error);
      }
    }

    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeOpen(true);
  }, [
    biometricAvailable,
    biometricsEnabled,
    energyQuote,
    energyRenting,
    performRentEnergy,
    review,
    submitting,
  ]);

  const handleReject = useCallback(async () => {
    if (submitting) return;
    preserveNoticeOnExitRef.current = true;
    await clearFourteenSwapDraft();
    notice.showNeutralNotice('Swap rejected by user.', 2200);
    router.back();
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

  if (loading && !review) {
    return <ScreenLoadingState />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
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
                actionLabel="SWAP"
                estimatedBurnSun={review.resources.estimatedBurnSun}
                onRent={() => void handleRentEnergy()}
              />

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
                    {formatTrxAmountFromSun(review.resources.estimatedBurnSun)} TRX
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Fee Cap</Text>
                  <Text style={styles.detailValue}>
                    {formatTrxAmountFromSun(
                      Number(review.resources.swap?.recommendedFeeLimitSun || 0) +
                        Number(review.resources.approval?.recommendedFeeLimitSun || 0)
                    )}{' '}
                    TRX
                  </Text>
                </View>
              </View>

              <View style={styles.detailCard}>
                <View style={styles.detailRowFirst}>
                  <Text style={styles.detailLabel}>Energy</Text>
                  <Text style={styles.detailValue}>{formatResourceValue(estimatedEnergy)}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Bandwidth</Text>
                  <Text style={styles.detailValue}>{formatResourceValue(estimatedBandwidth)}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Shortfall</Text>
                  <Text style={styles.detailValue}>
                    {formatResourceValue(resourceEnergyShortfall)} energy ·{' '}
                    {formatResourceValue(resourceBandwidthShortfall)} bandwidth
                  </Text>
                </View>

                <View style={styles.resourcesInlineRow}>
                  <View style={styles.resourceInlineCol}>
                    <Text
                      style={[
                        styles.resourceInlineLabel,
                        hasNoEnergyAvailable ? styles.resourceInlineLabelRisk : null,
                      ]}
                    >
                      Energy {formatResourceValue(estimatedEnergy)}/
                      {formatResourceValue(totalAvailableEnergy)}
                    </Text>
                    <View
                      style={[
                        styles.resourceBarTrack,
                        hasNoEnergyAvailable ? styles.resourceBarTrackRisk : null,
                      ]}
                    >
                      <View
                        style={[
                          styles.resourceBarAvailable,
                          hasNoEnergyAvailable ? styles.resourceBarAvailableRisk : null,
                        ]}
                      />
                      <View style={[styles.resourceBarUsed, { width: `${energyBarPercent}%` }]} />
                    </View>
                  </View>

                  <View style={styles.resourceInlineCol}>
                    <Text style={styles.resourceInlineLabel}>
                      Bandwidth {formatResourceValue(estimatedBandwidth)}/
                      {formatResourceValue(totalAvailableBandwidth)}
                    </Text>
                    <View style={styles.resourceBarTrack}>
                      <View style={styles.resourceBarAvailable} />
                      <View
                        style={[styles.resourceBarUsed, { width: `${bandwidthBarPercent}%` }]}
                      />
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text
                  style={[
                    styles.infoRowText,
                    hasResourceShortfall ? styles.infoRowTextRisk : null,
                  ]}
                >
                  {hasResourceShortfall
                    ? 'Resources are short. Network burn is included in the estimate above.'
                    : review.approvalRequired
                      ? 'This flow will first approve 4TEEN, then submit the swap.'
                      : 'Approval is already live. The wallet should go straight to the swap.'}
                </Text>
              </View>

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

        <Modal
          visible={passcodeOpen}
          animationType="fade"
          presentationStyle="fullScreen"
          transparent={false}
          onRequestClose={() => setPasscodeOpen(false)}
          statusBarTranslucent
        >
          <SafeAreaView style={styles.authModalSafe} edges={['top', 'bottom']}>
            <View style={styles.authOverlay}>
              <View style={styles.authScreen}>
                <View style={styles.authContent}>
                  <Text style={ui.eyebrow}>SWAP</Text>

                  <Text style={styles.authTitle}>
                    Confirm with <Text style={styles.authTitleAccent}>Passcode</Text>
                  </Text>

                  <Text style={styles.authLead}>
                    Authorize this swap with your 6-digit passcode
                    {biometricAvailable && biometricsEnabled
                      ? ` or ${biometricLabel === 'Face ID' ? 'face unlock' : 'fingerprint'}`
                      : ''}.
                  </Text>

                  <View style={styles.authCard}>
                    <View style={styles.authCardHeaderRow}>
                      <Text style={ui.sectionEyebrow}>Approve</Text>
                      <Text style={styles.authCardErrorText} numberOfLines={1}>
                        {passcodeError || ' '}
                      </Text>
                    </View>

                    <View style={styles.dotsRow}>
                      {Array.from({ length: 6 }, (_, index) => (
                        <View
                          key={index}
                          style={[styles.dot, passcodeDigits.length > index && styles.dotFilled]}
                        />
                      ))}
                    </View>
                  </View>

                  <NumericKeypad
                    onDigitPress={handlePasscodeDigitPress}
                    onBackspacePress={handlePasscodeBackspace}
                    leftSlot={
                      biometricAvailable && biometricsEnabled ? (
                        <TouchableOpacity activeOpacity={0.9} onPress={() => void handleApprove()}>
                          <BioLoginIcon width={22} height={22} />
                        </TouchableOpacity>
                      ) : null
                    }
                    backspaceIcon={<BackspaceIcon width={22} height={22} />}
                  />

                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.authCancelButton}
                    onPress={() => setPasscodeOpen(false)}
                    disabled={submitting}
                  >
                    <Text style={styles.authCancelButtonText}>CANCEL</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
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
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    padding: 16,
  },

  detailRowFirst: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  detailRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  detailLabel: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
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

  infoRow: {
    marginTop: 12,
  },

  infoRowText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
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
    marginTop: 18,
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
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  primaryButton: {
    marginTop: 18,
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
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
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
    marginTop: 14,
    flexDirection: 'row',
    gap: 12,
  },

  resourceInlineCol: {
    flex: 1,
    gap: 8,
  },

  resourceInlineLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },
  resourceInlineLabelRisk: {
    color: colors.red,
  },

  resourceBarTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(24,224,58,0.14)',
  },
  resourceBarTrackRisk: {
    backgroundColor: 'rgba(255,48,73,0.14)',
  },

  resourceBarAvailable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.green,
    opacity: 0.9,
  },
  resourceBarAvailableRisk: {
    backgroundColor: colors.red,
  },

  resourceBarUsed: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.red,
  },

  authCancelButtonText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },
});
