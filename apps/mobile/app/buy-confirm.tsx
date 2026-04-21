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
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import NumericKeypad from '../src/ui/numeric-keypad';
import { useNavigationInsets } from '../src/ui/navigation';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import useChromeLoading from '../src/ui/use-chrome-loading';
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
import { BackspaceIcon, BioLoginIcon } from '../src/ui/ui-icons';
import { submitReferralAttribution } from '../src/services/referral';
import { waitForBuyerAmbassadorBinding } from '../src/services/ambassador';

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

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
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
  const [passcodeDigits, setPasscodeDigits] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const preserveNoticeOnExitRef = useRef(false);
  const burnWarningShownRef = useRef(false);

  useChromeLoading(loading || refreshing);

  const energyAvailable = review
    ? Math.max(0, review.resources.available.energyLimit - review.resources.available.energyUsed)
    : 0;
  const bandwidthAvailable = review
    ? Math.max(
        0,
        review.resources.available.bandwidthLimit - review.resources.available.bandwidthUsed
      )
    : 0;
  const energyBarPercent = review
    ? clampPercent(
        (review.resources.estimatedEnergy /
          Math.max(review.resources.estimatedEnergy, energyAvailable, 1)) *
          100
      )
    : 0;
  const bandwidthBarPercent = review
    ? clampPercent(
        (review.resources.estimatedBandwidth /
          Math.max(review.resources.estimatedBandwidth, bandwidthAvailable, 1)) *
          100
      )
    : 0;
  const hasNoEnergyAvailable = energyAvailable <= 0;
  const lockReleaseParts = review ? formatLockReleaseParts(review.lockReleaseAt) : null;
  const hasTrxForBurn = Boolean(review?.trxCoverage.canCoverBurn);

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
        `Not enough TRX for buy value and network burn. Top up at least ${formatTrxAmountFromSun(
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Direct buy failed.';
      setErrorText(message);
      notice.showErrorNotice(message, 3400);
    } finally {
      setSubmitting(false);
    }
  }, [notice, review, submitting, triggerWalletDataRefresh]);

  const requestBiometricUnlock = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Approve direct buy',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use passcode',
      });

      if (result.success) {
        await performBuy();
        return;
      }

      if (
        result.error === 'user_cancel' ||
        result.error === 'system_cancel' ||
        result.error === 'app_cancel'
      ) {
        return;
      }

      setPasscodeError('');
      setPasscodeDigits('');
      setPasscodeOpen(true);
    } catch {
      setPasscodeError('');
      setPasscodeDigits('');
      setPasscodeOpen(true);
    }
  }, [performBuy]);

  const handleApprove = useCallback(async () => {
    if (!review || submitting) return;

    if (!review.trxCoverage.canCoverBurn) {
      const message = `Top up at least ${formatTrxAmountFromSun(
        review.trxCoverage.missingTrxSun
      )} TRX to cover buy value and network burn.`;
      setErrorText(message);
      notice.showErrorNotice(message, 3400);
      return;
    }

    if (biometricsEnabled && biometricAvailable) {
      await requestBiometricUnlock();
      return;
    }

    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeOpen(true);
  }, [biometricAvailable, biometricsEnabled, notice, requestBiometricUnlock, review, submitting]);

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
    if (passcodeDigits.length !== 6 || submitting) return;

    let cancelled = false;

    const run = async () => {
      const valid = await verifyPasscode(passcodeDigits);

      if (cancelled) return;

      if (!valid) {
        setPasscodeDigits('');
        setPasscodeError('Wrong passcode.');
        return;
      }

      await performBuy();
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [passcodeDigits, performBuy, submitting]);

  if (loading) {
    return <ScreenLoadingState label="Loading buy confirmation..." />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
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
                    <ActivityIndicator color={colors.bg} />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {hasTrxForBurn ? 'BUY 4TEEN' : 'TOP UP TRX'}
                    </Text>
                  )}
                </TouchableOpacity>
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
                      {formatTrxAmountFromSun(review.resources.estimatedBurnSun)} TRX
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Fee Limit</Text>
                    <Text style={styles.detailValue}>
                      {formatTrxAmountFromSun(review.resources.recommendedFeeLimitSun)} TRX
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>TRX Available</Text>
                    <Text style={styles.detailValue}>{review.trxBalance.toFixed(6)} TRX</Text>
                  </View>
                </View>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionEyebrow}>NETWORK LOAD</Text>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Energy</Text>
                    <Text style={styles.detailValue}>
                      {formatResourceValue(review.resources.estimatedEnergy)} /{' '}
                      {formatResourceValue(
                        Math.max(
                          0,
                          review.resources.available.energyLimit -
                            review.resources.available.energyUsed
                        )
                      )}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Bandwidth</Text>
                    <Text style={styles.detailValue}>
                      {formatResourceValue(review.resources.estimatedBandwidth)} /{' '}
                      {formatResourceValue(
                        Math.max(
                          0,
                          review.resources.available.bandwidthLimit -
                            review.resources.available.bandwidthUsed
                        )
                      )}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Shortfall</Text>
                    <Text style={styles.detailValue}>
                      {formatResourceValue(review.resources.energyShortfall)} energy ·{' '}
                      {formatResourceValue(review.resources.bandwidthShortfall)} bandwidth
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
                        Energy {formatResourceValue(review.resources.estimatedEnergy)}/
                        {formatResourceValue(energyAvailable)}
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
                        <View
                          style={[styles.resourceBarUsed, { width: `${energyBarPercent}%` }]}
                        />
                      </View>
                    </View>

                    <View style={styles.resourceInlineCol}>
                      <Text style={styles.resourceInlineLabel}>
                        Bandwidth {formatResourceValue(review.resources.estimatedBandwidth)}/
                        {formatResourceValue(bandwidthAvailable)}
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
                      !review.trxCoverage.canCoverBurn ? styles.infoRowTextRisk : null,
                    ]}
                  >
                    {!review.trxCoverage.canCoverBurn
                      ? 'TRX is short for buy value and network burn. Top up before approving this transaction.'
                      : 'Resources are sufficient. This buy should execute without extra surprises.'}
                  </Text>
                </View>
              </View>

              {errorText ? (
                <View style={styles.errorCard}>
                  <Text style={styles.errorText}>{errorText}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.rejectButton}
                disabled={submitting}
                onPress={() => router.back()}
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
                  <Text style={ui.eyebrow}>Transaction Approval</Text>

                  <Text style={styles.authTitle}>
                    Confirm with <Text style={styles.authTitleAccent}>Passcode</Text>
                  </Text>

                  <Text style={styles.authLead}>
                    Authorize this direct buy with your 6-digit passcode
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
                    onDigitPress={handlePasscodeDigit}
                    onBackspacePress={handlePasscodeBackspace}
                    leftSlot={
                      biometricAvailable && biometricsEnabled ? (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => void requestBiometricUnlock()}
                        >
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
    backgroundColor: colors.bg,
  },

  content: {
    flexGrow: 1,
  },

  sectionBlock: {
    marginBottom: 14,
  },

  sectionEyebrow: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.6,
    marginBottom: 8,
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
    padding: 16,
  },

  detailRowFirst: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  detailRow: {
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
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
    flexShrink: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },

  detailValueAccent: {
    flexShrink: 1,
    color: colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },

  infoRow: {
    marginTop: 12,
    paddingHorizontal: 2,
  },

  infoRowText: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Sora_600SemiBold',
  },

  infoRowTextRisk: {
    color: colors.red,
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
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
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
    fontSize: 14,
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
