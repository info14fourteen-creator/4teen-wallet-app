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
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  buildDirectBuyReview,
  executeDirectBuy,
  formatDirectBuyDate,
  formatDirectBuyPrice,
  parseDirectBuyAmount,
  type DirectBuyReceipt,
  type DirectBuyReview,
} from '../src/services/direct-buy';
import {
  clearDirectBuyDraft,
  getDirectBuyDraft,
} from '../src/services/direct-buy-draft';
import { getBiometricsEnabled, verifyPasscode } from '../src/security/local-auth';
import { useWalletSession } from '../src/wallet/wallet-session';
import { clearWalletRuntimeCaches, FOURTEEN_LOGO, TRX_LOGO } from '../src/services/tron/api';
import { submitReferralAttribution } from '../src/services/referral';
import { waitForBuyerAmbassadorBinding } from '../src/services/ambassador';
import {
  getEnergyResaleQuote,
  rentEnergyForPurpose,
  type EnergyResaleQuote,
} from '../src/services/energy-resale';
import {
  formatTrxFromSunAmount,
  getAvailableResource,
} from '../src/services/wallet/resources';

function resolveParam(value: string | string[] | undefined) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return String(value[0] || '');
  return '';
}

function formatTokenAmount(value: number, maximumFractionDigits = 6) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0.00';
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });
}

function formatCompactHeroAmount(value: number) {
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

  if (safe >= 1) {
    return safe.toFixed(2).replace(/\.?0+$/, '');
  }

  return safe.toFixed(2).replace(/\.?0+$/, '');
}

function formatLockReleaseParts(unixSeconds: number) {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return {
      primary: '—',
      secondary: 'YEAR',
    };
  }

  const date = new Date(unixSeconds * 1000);
  const primary = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
  const secondary = date.toLocaleDateString('en-GB', {
    year: 'numeric',
  });

  return {
    primary,
    secondary,
  };
}

export default function BuyConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    amountTrx?: string | string[];
    contractAddress?: string | string[];
  }>();
  const notice = useNotice();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();
  const { triggerWalletDataRefresh, setChromeHidden } = useWalletSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<DirectBuyReview | null>(null);
  const [receipt, setReceipt] = useState<DirectBuyReceipt | null>(null);
  const [attributionStatus, setAttributionStatus] = useState<{
    state: 'submitted' | 'skipped-no-referral' | 'pending-error';
    slug?: string | null;
    message?: string;
  } | null>(null);
  const [controllerBindingStatus, setControllerBindingStatus] = useState<{
    state: 'bound' | 'not-bound-yet' | 'pending-error';
    ambassadorWallet?: string | null;
    message?: string;
  } | null>(null);
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
  const [pendingApprovalMode, setPendingApprovalMode] = useState<'buy' | 'rent'>('buy');
  const preserveNoticeOnExitRef = useRef(false);
  const burnWarningShownRef = useRef(false);

  useChromeLoading(loading || refreshing);

  const energyAvailable = review ? getAvailableResource(review.resources.available, 'energy') : 0;
  const bandwidthAvailable = review
    ? getAvailableResource(review.resources.available, 'bandwidth')
    : 0;
  const lockReleaseParts = review ? formatLockReleaseParts(review.lockReleaseAt) : null;
  const hasTrxForBurn = Boolean(review?.trxCoverage.canCoverBurn);
  const canRentResources = Boolean(
    review &&
      (review.resources.estimatedEnergy > 0 || review.resources.estimatedBandwidth > 0)
  );
  const hasResourceShortfall = Boolean(
    review &&
      (review.resources.energyShortfall > 0 || review.resources.bandwidthShortfall > 0)
  );
  const canUseBiometrics = biometricAvailable && biometricsEnabled;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');

      const routeAmountTrx = resolveParam(params.amountTrx).trim();
      const routeContractAddress = resolveParam(params.contractAddress).trim();
      const storedDraft = await getDirectBuyDraft();
      const hasValidRouteAmount = parseDirectBuyAmount(routeAmountTrx) > 0;
      const hasValidStoredAmount = parseDirectBuyAmount(String(storedDraft?.amountTrx || '')) > 0;
      const draft = hasValidRouteAmount
        ? {
            amountTrx: routeAmountTrx,
            contractAddress:
              routeContractAddress || storedDraft?.contractAddress || undefined,
          }
        : hasValidStoredAmount
          ? storedDraft
          : null;

      if (!draft) {
        throw new Error('Buy request is missing. Go back and build it again.');
      }

      const nextReview = await buildDirectBuyReview({
        trxAmount: draft.amountTrx,
        contractAddress: draft.contractAddress,
      });
      setReview(nextReview);
    } catch (error) {
      setReview(null);
      setErrorText(error instanceof Error ? error.message : 'Failed to build buy confirmation.');
    } finally {
      setLoading(false);
    }
  }, [params.amountTrx, params.contractAddress]);

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
    } catch {
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
    setChromeHidden(passcodeOpen);
  }, [passcodeOpen, setChromeHidden]);

  useEffect(() => {
    return () => {
      burnWarningShownRef.current = false;
      setChromeHidden(false);
      if (!preserveNoticeOnExitRef.current) {
        notice.hideNotice();
      }
      preserveNoticeOnExitRef.current = false;
    };
  }, [notice, setChromeHidden]);

  useEffect(() => {
    if (!review) return;

    if (!review.trxCoverage.canCoverBurn) {
      if (burnWarningShownRef.current) return;

      burnWarningShownRef.current = true;
      notice.showErrorNotice(
        `Not enough TRX for buy value and network burn. Top up at least ${formatTrxFromSunAmount(
          review.trxCoverage.missingTrxSun
        )} TRX first.`,
        3400
      );
      return;
    }

    burnWarningShownRef.current = false;
    notice.hideNotice();
  }, [notice, review]);

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
      purpose: 'direct_buy',
      wallet: review.wallet.address,
      requiredEnergy: review.resources.energyShortfall || review.resources.estimatedEnergy,
      requiredBandwidth:
        review.resources.bandwidthShortfall || review.resources.estimatedBandwidth,
    }).then((quote) => {
      if (!cancelled) setEnergyQuote(quote);
    }).finally(() => {
      if (!cancelled) setEnergyQuoteLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [canRentResources, review]);

  const performRentEnergy = useCallback(async () => {
    if (!review || !energyQuote || energyRenting) return false;

    try {
      setEnergyRenting(true);
      notice.showNeutralNotice('Sending Energy rental payment...', 2500);
      await rentEnergyForPurpose({
        purpose: 'direct_buy',
        wallet: review.wallet.address,
        quote: energyQuote,
        onProgress: (progress) => notice.showNeutralNotice(progress.message, 2600),
      });
      clearWalletRuntimeCaches(review.wallet.address);
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice('Energy is live. Sending buy transaction...', 3000);
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

  const performBuy = useCallback(async () => {
    if (!review || submitting) return;

    try {
      setSubmitting(true);

      const nextReceipt = await executeDirectBuy({
        trxAmount: review.amountTrx,
        contractAddress: review.contractAddress,
        feeLimitSun: review.resources.recommendedFeeLimitSun,
      });

      try {
        const attribution = await submitReferralAttribution({
          txHash: nextReceipt.txId,
          buyerWallet: nextReceipt.wallet.address,
        });
        setAttributionStatus({
          state: attribution.status,
          slug: attribution.referralSlug,
        });
      } catch (error) {
        setAttributionStatus({
          state: 'pending-error',
          message: error instanceof Error ? error.message : 'Referral sync is pending.',
        });
        notice.showNeutralNotice(
          error instanceof Error
            ? `Buy sent, but referral sync is pending: ${error.message}`
            : 'Buy sent, but referral sync is pending.',
          3200
        );
      }

      try {
        const binding = await waitForBuyerAmbassadorBinding({
          buyerWallet: nextReceipt.wallet.address,
        });
        setControllerBindingStatus({
          state: binding.status,
          ambassadorWallet: binding.ambassadorWallet,
        });
      } catch (error) {
        setControllerBindingStatus({
          state: 'pending-error',
          message:
            error instanceof Error
              ? error.message
              : 'Controller confirmation is still pending.',
        });
      }

      await clearDirectBuyDraft();
      await clearWalletRuntimeCaches(review.wallet.address);
      triggerWalletDataRefresh();
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice('Direct buy transaction sent.', 3200);
      setReceipt(nextReceipt);
      setPasscodeOpen(false);
      setPasscodeEntryOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Direct buy failed.';
      setErrorText(message);
      notice.showErrorNotice(message, 3400);
    } finally {
      setSubmitting(false);
    }
  }, [notice, review, submitting, triggerWalletDataRefresh]);

  const closeApprovalAuth = useCallback(() => {
    setPasscodeOpen(false);
    setPasscodeEntryOpen(false);
    setPasscodeDigits('');
    setPasscodeError('');
  }, []);

  const openApprovalAuth = useCallback((preferPasscode = false) => {
    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeEntryOpen(preferPasscode || !canUseBiometrics);
    setPasscodeOpen(true);
  }, [canUseBiometrics]);

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
        promptMessage:
          pendingApprovalMode === 'rent' ? 'Confirm Energy Rental' : 'Approve direct buy',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use Passcode',
      });

      if (result.success) {
        if (pendingApprovalMode === 'rent') {
          const rented = await performRentEnergy();
          if (rented) {
            await performBuy();
          }
        } else {
          await performBuy();
        }
      }
    } catch {
    }
  }, [canUseBiometrics, openPasscodeEntry, pendingApprovalMode, performBuy, performRentEnergy]);

  const handleApprove = useCallback(async () => {
    if (!review || submitting) return;
    setPendingApprovalMode('buy');

    if (!review.trxCoverage.canCoverBurn) {
      const message = `Top up at least ${formatTrxFromSunAmount(
        review.trxCoverage.missingTrxSun
      )} TRX to cover buy value and network burn.`;
      setErrorText(message);
      notice.showErrorNotice(message, 3400);
      return;
    }

    openApprovalAuth();
  }, [notice, openApprovalAuth, review, submitting]);

  const handleRentEnergy = useCallback(async () => {
    if (!review || !energyQuote || submitting || energyRenting) return;

    setPendingApprovalMode('rent');

    openApprovalAuth();
  }, [
    energyQuote,
    energyRenting,
    openApprovalAuth,
    review,
    submitting,
  ]);

  const handlePasscodeDigit = useCallback((digit: string) => {
    setPasscodeDigits((current) => {
      if (current.length >= 6) return current;
      return `${current}${digit}`;
    });
    setPasscodeError('');
  }, []);

  const handlePasscodeBackspace = useCallback(() => {
    setPasscodeDigits((current) => current.slice(0, -1));
    setPasscodeError('');
  }, []);

  useEffect(() => {
    if (passcodeDigits.length !== 6 || submitting || energyRenting) return;

    let cancelled = false;

    const run = async () => {
      const valid = await verifyPasscode(passcodeDigits);

      if (cancelled) return;

      if (!valid) {
        setPasscodeDigits('');
        setPasscodeError('Wrong passcode.');
        return;
      }

      if (pendingApprovalMode === 'rent') {
        const rented = await performRentEnergy();
        if (rented) {
          await performBuy();
        }
        return;
      }

      await performBuy();
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [energyRenting, passcodeDigits, pendingApprovalMode, performBuy, performRentEnergy, submitting]);

  if (loading) {
    return <ScreenLoadingState label="Loading buy confirmation..." />;
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ScreenBrow label="BUY" variant="back" />

          {receipt ? (
            <View style={styles.successBlock}>
              <Text style={ui.sectionEyebrow}>BUY SENT</Text>
              <Text style={styles.successTitle}>
                {formatTokenAmount(receipt.estimatedTokens)} 4TEEN started a new lock.
              </Text>
              <Text style={styles.successBody}>
                Unlock target: {formatDirectBuyDate(receipt.lockReleaseAt)}.
              </Text>
              {attributionStatus ? (
                <Text style={styles.successMeta}>
                  {attributionStatus.state === 'submitted'
                    ? `Referral synced${attributionStatus.slug ? `: ${attributionStatus.slug}` : '.'}`
                    : attributionStatus.state === 'skipped-no-referral'
                      ? 'No referral attached to this buy.'
                      : attributionStatus.message || 'Referral sync is pending.'}
                </Text>
              ) : null}
              {controllerBindingStatus ? (
                <Text style={styles.successMeta}>
                  {controllerBindingStatus.state === 'bound'
                    ? `Controller linked this buyer to ambassador ${controllerBindingStatus.ambassadorWallet}.`
                    : controllerBindingStatus.state === 'not-bound-yet'
                      ? 'Controller has not linked this buyer to an ambassador yet.'
                      : controllerBindingStatus.message || 'Controller confirmation is pending.'}
                </Text>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.primaryButton}
                onPress={() => router.push('/unlock-timeline')}
              >
                <Text style={styles.primaryButtonText}>OPEN UNLOCK TIMELINE</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.secondaryButton}
                onPress={() => router.push('/earn')}
              >
                <Text style={styles.secondaryButtonText}>BACK TO EARN</Text>
              </TouchableOpacity>
            </View>
          ) : review ? (
            <>
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionEyebrow}>SELECTED WALLET</Text>
                <View style={styles.heroCard}>
                  <Image
                    source={{ uri: FOURTEEN_LOGO }}
                    style={styles.heroWatermark}
                    contentFit="contain"
                  />

                  <View style={styles.heroTopRow}>
                    <View style={styles.heroWalletBlock}>
                      <View style={styles.heroWalletTitleRow}>
                        <Text style={styles.heroWalletName}>{review.wallet.name}</Text>
                        <Text style={styles.heroActiveBadge}>SELECTED</Text>
                      </View>
                      <Text style={styles.heroWalletMeta}>
                        {review.trxValueDisplay} <Text style={styles.heroWalletMetaDot}>•</Text>{' '}
                        {review.trxBalanceDisplay} TRX
                      </Text>
                      <Text style={styles.heroFromAddress}>{review.wallet.address}</Text>
                    </View>
                  </View>

                  <View style={styles.heroMetricGrid}>
                    <View style={[styles.heroMetricCard, styles.heroMetricCardSpend]}>
                      <Text style={[styles.heroMetricLabel, styles.heroMetricLabelSpend]}>SPEND</Text>
                      <Text style={[styles.heroMetricValue, styles.heroMetricValueSpend]}>
                        {formatCompactHeroAmount(review.amountTrxValue)}
                      </Text>
                      <View style={styles.heroMetricTokenRow}>
                        <Image
                          source={{ uri: TRX_LOGO }}
                          style={styles.heroTokenLogo}
                          contentFit="contain"
                        />
                        <Text style={styles.heroMetricToken}>TRX</Text>
                      </View>
                    </View>

                    <View style={[styles.heroMetricCard, styles.heroMetricCardReceive]}>
                      <Text style={[styles.heroMetricLabel, styles.heroMetricLabelReceive]}>RECEIVE</Text>
                      <Text style={[styles.heroMetricValue, styles.heroMetricValueReceive]}>
                        {formatCompactHeroAmount(review.estimatedTokens)}
                      </Text>
                      <View style={styles.heroMetricTokenRow}>
                        <Image
                          source={{ uri: FOURTEEN_LOGO }}
                          style={styles.heroTokenLogo}
                          contentFit="contain"
                        />
                        <Text style={styles.heroMetricToken}>4TEEN</Text>
                      </View>
                    </View>

                    <View style={styles.heroMetricCard}>
                      <Text style={styles.heroMetricLabel}>BURN EST.</Text>
                      <Text style={styles.heroMetricValue}>
                        {formatCompactHeroAmount(review.resources.estimatedBurnSun / 1_000_000)}
                      </Text>
                      <Text style={styles.heroMetricToken}>TRX</Text>
                    </View>

                    <View style={styles.heroMetricCard}>
                      <Text style={styles.heroMetricLabel}>LOCK RELEASE</Text>
                      <Text style={styles.heroMetricValue}>{lockReleaseParts?.primary || '—'}</Text>
                      <Text style={styles.heroMetricToken}>
                        {lockReleaseParts?.secondary || 'YEAR'}
                      </Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[
                    styles.primaryButton,
                    styles.heroPrimaryButton,
                    submitting ? styles.primaryButtonDisabled : null,
                  ]}
                  disabled={submitting}
                  onPress={() => void handleApprove()}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {hasTrxForBurn ? 'BUY 4TEEN' : 'TOP UP TRX'}
                    </Text>
                  )}
                </TouchableOpacity>

                <EnergyResaleCard
                  quote={energyQuote}
                  loading={energyQuoteLoading}
                  processing={energyRenting}
                  disabled={submitting}
                  showUnavailable={canRentResources}
                  actionLabel="BUY"
                  estimatedBurnSun={review.resources.estimatedBurnSun}
                  onRent={() => void handleRentEnergy()}
                />
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionEyebrow}>BUY REVIEW</Text>
                <View style={styles.detailCard}>
                  <View style={styles.detailRowFirst}>
                    <Text style={styles.detailLabel}>Estimated Receive</Text>
                    <Text style={styles.detailValueAccent}>
                      {formatTokenAmount(review.estimatedTokens)} 4TEEN
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Buy Value</Text>
                    <Text style={styles.detailValue}>{review.amountTrx} TRX</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Current Price</Text>
                    <Text style={styles.detailValue}>
                      {formatDirectBuyPrice(review.tokenPriceSun)} TRX
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Lock Release</Text>
                    <Text style={styles.detailValue}>
                      {formatDirectBuyDate(review.lockReleaseAt)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Estimated Burn</Text>
                    <Text style={styles.detailValueAccent}>
                      {formatTrxFromSunAmount(review.resources.estimatedBurnSun)} TRX
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Fee Limit</Text>
                    <Text style={styles.detailValue}>
                      {formatTrxFromSunAmount(review.resources.recommendedFeeLimitSun)} TRX
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>TRX Available</Text>
                    <Text style={styles.detailValue}>{review.trxBalance.toFixed(6)} TRX</Text>
                  </View>
                </View>
              </View>

              <ConfirmNetworkLoadCard
                estimatedEnergy={review.resources.estimatedEnergy}
                estimatedBandwidth={review.resources.estimatedBandwidth}
                availableEnergy={energyAvailable}
                availableBandwidth={bandwidthAvailable}
                energyShortfall={review.resources.energyShortfall}
                bandwidthShortfall={review.resources.bandwidthShortfall}
                message={
                  !review.trxCoverage.canCoverBurn
                    ? 'Not enough TRX to cover the buy and the estimated burn.'
                    : hasResourceShortfall
                      ? 'You are short on resources. The burn estimate above already includes this gap.'
                      : 'You have enough resources for this action. Extra burn is unlikely.'
                }
                messageRisk={!review.trxCoverage.canCoverBurn || hasResourceShortfall}
              />

              {errorText ? (
                <View style={styles.errorCard}>
                  <Text style={styles.errorText}>{errorText}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.rejectButton}
                disabled={submitting}
                onPress={() => goBackOrReplace(router, { fallback: '/buy' })}
              >
                <Text style={styles.rejectButtonText}>REJECT</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{errorText || 'Buy confirmation is unavailable.'}</Text>
            </View>
          )}
        </ScrollView>

        <ApprovalAuthModal
          visible={passcodeOpen}
          eyebrow="Transaction Approval"
          actionLabel={pendingApprovalMode === 'rent' ? 'Energy rental and direct buy' : 'direct buy'}
          passcodeError={passcodeError}
          digitsLength={passcodeDigits.length}
          canUseBiometrics={canUseBiometrics}
          biometricLabel={biometricLabel}
          passcodeEntryOpen={passcodeEntryOpen}
          submitting={submitting || energyRenting}
          onRequestClose={closeApprovalAuth}
          onOpenPasscode={openPasscodeEntry}
          onClosePasscode={closePasscodeEntry}
          onDigitPress={handlePasscodeDigit}
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
    backgroundColor: colors.bg,
  },

  content: {
    flexGrow: 1,
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

  heroCard: {
    marginTop: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'transparent',
    padding: 16,
    overflow: 'hidden',
    position: 'relative',
  },

  heroWatermark: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 120,
    height: 120,
    opacity: 0.05,
  },

  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  heroWalletBlock: {
    flex: 1,
  },

  heroWalletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },

  heroWalletName: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Sora_700Bold',
  },

  heroActiveBadge: {
    color: colors.green,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  heroWalletMeta: {
    marginTop: 6,
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  heroWalletMetaDot: {
    color: colors.textSoft,
  },

  heroFromAddress: {
    marginTop: 4,
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  heroAmountRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  heroTokenLogo: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
  },

  heroTransferMeta: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  heroAddressCol: {
    flex: 1,
  },

  heroAddressLabel: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.6,
  },

  heroRecipientName: {
    marginTop: 8,
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  heroMetricGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  heroMetricCard: {
    width: '47%',
    minHeight: 88,
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
    color: colors.textDim,
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
    color: colors.white,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: 'Sora_700Bold',
  },

  heroMetricValueSpend: {
    color: colors.red,
  },

  heroMetricValueReceive: {
    color: colors.green,
  },

  heroMetricValueDate: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },

  heroMetricTokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  heroMetricToken: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },

  detailRow: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    flex: 1,
    color: colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
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

  primaryButton: {
    minHeight: 54,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  heroPrimaryButton: {
    marginTop: 14,
  },

  primaryButtonDisabled: {
    opacity: 0.65,
  },

  primaryButtonText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.7,
  },

  rejectButton: {
    marginTop: 18,
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  rejectButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  secondaryButton: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  secondaryButtonText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  successBlock: {
    gap: 10,
    paddingBottom: 12,
  },

  successTitle: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'Sora_700Bold',
  },

  successBody: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  successMeta: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
  },

  errorCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,120,120,0.18)',
    backgroundColor: 'rgba(255,120,120,0.06)',
    padding: 18,
    marginBottom: 12,
  },

  errorText: {
    color: '#ff8c7a',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  authModalSafe: {
    flex: 1,
    backgroundColor: '#000000',
  },

  authOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    backgroundColor: '#000000',
  },

  authScreen: {
    flex: 1,
    justifyContent: 'flex-start',
    backgroundColor: '#000000',
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 10,
  },

  authContent: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 18,
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
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 320,
  },

  authCard: {
    marginTop: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },

  authCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },

  authCardErrorText: {
    flex: 1,
    textAlign: 'right',
    color: colors.red,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    minHeight: 14,
  },

  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
  },

  dotFilled: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },

  authCancelButton: {
    minHeight: 44,
    marginTop: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  authCancelButtonText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
});
