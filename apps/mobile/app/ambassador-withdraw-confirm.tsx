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
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import NumericKeypad from '../src/ui/numeric-keypad';
import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import EnergyResaleCard from '../src/ui/energy-resale-card';
import ConfirmNetworkLoadCard from '../src/ui/confirm-network-load-card';
import { BackspaceIcon, BioLoginIcon } from '../src/ui/ui-icons';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useNavigationInsets } from '../src/ui/navigation';
import { useNotice } from '../src/notice/notice-provider';
import { getBiometricsEnabled, verifyPasscode } from '../src/security/local-auth';
import { clearWalletRuntimeCaches, FOURTEEN_LOGO } from '../src/services/tron/api';
import {
  estimateAmbassadorWithdrawal,
  formatTrxFromSun,
  withdrawAmbassadorRewards,
  type AmbassadorWithdrawalReview,
} from '../src/services/ambassador';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useWalletSession } from '../src/wallet/wallet-session';
import {
  getEnergyResaleQuote,
  rentEnergyForPurpose,
  type EnergyResaleQuote,
} from '../src/services/energy-resale';
import {
  formatTrxFromSunAmount,
  getAvailableResource,
} from '../src/services/wallet/resources';

function shortAddress(address: string) {
  const safe = String(address || '').trim();
  if (safe.length <= 14) return safe || '—';
  return `${safe.slice(0, 6)}...${safe.slice(-6)}`;
}

export default function AmbassadorWithdrawConfirmScreen() {
  const router = useRouter();
  const notice = useNotice();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();
  const { setChromeHidden, triggerWalletDataRefresh } = useWalletSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<AmbassadorWithdrawalReview | null>(null);
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
  const [pendingApprovalMode, setPendingApprovalMode] = useState<'withdraw' | 'rent'>('withdraw');
  const preserveNoticeOnExitRef = useRef(false);
  const burnWarningShownRef = useRef(false);

  useChromeLoading(loading || refreshing);

  const energyAvailable = review ? getAvailableResource(review.resources.available, 'energy') : 0;
  const bandwidthAvailable = review
    ? getAvailableResource(review.resources.available, 'bandwidth')
    : 0;
  const hasResourceShortfall = Boolean(
    review &&
      (review.resources.energyShortfall > 0 || review.resources.bandwidthShortfall > 0)
  );
  const canRentResources = Boolean(
    review &&
      (review.resources.estimatedEnergy > 0 || review.resources.estimatedBandwidth > 0)
  );
  const hasTrxForBurn = Boolean(review?.trxCoverage.canCoverBurn);
  const isApproveDisabled = submitting || !review || !hasTrxForBurn;

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      setErrorText('');
      const nextReview = await estimateAmbassadorWithdrawal();
      setReview(nextReview);
      return nextReview;
    } catch (error) {
      console.error(error);
      setReview(null);
      setErrorText(
        error instanceof Error ? error.message : 'Failed to build ambassador withdrawal confirmation.'
      );
      return null;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
      setRefreshing(false);
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
    void loadBiometricsState();
  }, [load, loadBiometricsState]);

  useEffect(() => {
    setChromeHidden(passcodeOpen);
  }, [passcodeOpen, setChromeHidden]);

  useEffect(() => {
    if (!review) return;

    if (!review.trxCoverage.canCoverBurn) {
      if (burnWarningShownRef.current) return;
      burnWarningShownRef.current = true;
      notice.showErrorNotice(
        `Not enough TRX for network burn. Top up at least ${formatTrxFromSunAmount(
          review.trxCoverage.missingTrxSun
        )} TRX first.`,
        3200
      );
      return;
    }

    burnWarningShownRef.current = false;
    notice.hideNotice();
  }, [notice, review]);

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
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
      purpose: 'ambassador_withdraw',
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
        purpose: 'ambassador_withdraw',
        wallet: review.wallet.address,
        quote: energyQuote,
        onProgress: (progress) => notice.showNeutralNotice(progress.message, 2600),
      });
      clearWalletRuntimeCaches(review.wallet.address);
      const refreshedReview = await load({ silent: true });

      if (
        refreshedReview &&
        (refreshedReview.resources.energyShortfall > 0 ||
          refreshedReview.resources.bandwidthShortfall > 0)
      ) {
        throw new Error(
          'Energy rental is confirmed, but wallet resources are still syncing. Pull to refresh in a few seconds and try again.'
        );
      }

      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice('Energy is live. Sending withdrawal...', 3000);
      return refreshedReview || review;
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

  const performWithdraw = useCallback(async (reviewOverride?: typeof review | null) => {
    const currentReview = reviewOverride || (await load({ silent: true })) || review;

    if (!currentReview || submitting) return;

    try {
      setSubmitting(true);
      const receipt = await withdrawAmbassadorRewards();

      setPasscodeOpen(false);
      setPasscodeDigits('');
      triggerWalletDataRefresh();
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice(`Withdrawal sent: ${receipt.txId.slice(0, 10)}...`, 3000);
      router.replace('/ambassador-program');
    } catch (error) {
      console.error(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : 'Ambassador withdrawal failed.',
        3400
      );
    } finally {
      setSubmitting(false);
    }
  }, [load, notice, review, router, submitting, triggerWalletDataRefresh]);

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
          await performWithdraw(rented);
        }
        return;
      }

      await performWithdraw();
    } catch (error) {
      console.error(error);
      setPasscodeError('Failed to verify passcode.');
      setPasscodeDigits('');
    }
  }, [energyRenting, passcodeDigits, pendingApprovalMode, performRentEnergy, performWithdraw, submitting]);

  useEffect(() => {
    if (passcodeOpen && passcodeDigits.length === 6) {
      void handlePasscodeSubmit();
    }
  }, [handlePasscodeSubmit, passcodeDigits, passcodeOpen]);

  const handleApprove = useCallback(async () => {
    if (!review || submitting || !review.trxCoverage.canCoverBurn) return;
    setPendingApprovalMode('withdraw');

    if (biometricAvailable && biometricsEnabled) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm Ambassador Withdrawal',
          fallbackLabel: 'Use Passcode',
          cancelLabel: 'Cancel',
        });

        if (result.success) {
          await performWithdraw();
          return;
        }

      } catch (error) {
        console.error(error);
      }
    }

    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeOpen(true);
  }, [biometricAvailable, biometricsEnabled, performWithdraw, review, submitting]);

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
          const rented = await performRentEnergy();
          if (rented) {
            await performWithdraw(rented);
          }
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
    performWithdraw,
    review,
    submitting,
  ]);

  const handleReject = useCallback(() => {
    if (submitting) return;
    preserveNoticeOnExitRef.current = true;
    notice.showNeutralNotice('Ambassador withdrawal rejected by user.', 2200);
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
    return <ScreenLoadingState label="Building ambassador withdrawal confirmation" />;
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
          <ScreenBrow label="AMBASSADOR" variant="back" />

          {errorText || !review ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>
                {errorText || 'Unable to build ambassador withdrawal confirmation.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <Image source={{ uri: FOURTEEN_LOGO }} style={styles.heroWatermark} contentFit="contain" />
                <Text style={styles.heroWalletName}>{review.wallet.name}</Text>
                <Text style={styles.heroWalletAddress}>{review.wallet.address}</Text>

                <View style={styles.heroMetricRow}>
                  <View style={[styles.heroMetricCard, styles.heroMetricCardSpend]}>
                    <Text style={[styles.heroMetricLabel, styles.heroMetricLabelSpend]}>CLAIMABLE</Text>
                    <Text style={[styles.heroMetricValue, styles.heroMetricValueSpend]}>
                      {formatTrxFromSun(review.claimableRewardsSun)}
                    </Text>
                    <Text style={styles.heroMetricToken}>TRX reward</Text>
                  </View>

                  <View style={[styles.heroMetricCard, styles.heroMetricCardReceive]}>
                    <Text style={[styles.heroMetricLabel, styles.heroMetricLabelReceive]}>ACTION</Text>
                    <Text style={[styles.heroMetricValue, styles.heroMetricValueReceive]}>Withdraw</Text>
                    <Text style={styles.heroMetricToken}>to ambassador wallet</Text>
                  </View>
                </View>

                <View style={styles.heroMetaRow}>
                  <Text style={styles.heroMetaLabel}>Estimated burn</Text>
                  <Text style={[styles.heroMetaValue, hasResourceShortfall ? styles.heroMetaValueRisk : null]}>
                    {formatTrxFromSunAmount(review.resources.estimatedBurnSun)} TRX
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.primaryButton, isApproveDisabled && styles.primaryButtonDisabled]}
                onPress={() => void handleApprove()}
                disabled={isApproveDisabled}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {hasTrxForBurn ? 'APPROVE & WITHDRAW' : 'TOP UP TRX'}
                  </Text>
                )}
              </TouchableOpacity>

              <EnergyResaleCard
                quote={energyQuote}
                loading={energyQuoteLoading}
                processing={energyRenting}
                disabled={submitting}
                showUnavailable={canRentResources}
                actionLabel="WITHDRAW"
                estimatedBurnSun={review.resources.estimatedBurnSun}
                onRent={() => void handleRentEnergy()}
              />

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionEyebrow}>WITHDRAW REVIEW</Text>
                <View style={styles.detailCard}>
                  <DetailRow label="Wallet" value={review.wallet.name} first />
                  <DetailRow label="Controller" value={shortAddress(review.controllerAddress)} />
                  <DetailRow label="Claimable" value={`${formatTrxFromSun(review.claimableRewardsSun)} TRX`} accent />
                  <DetailRow label="Estimated Burn" value={`${formatTrxFromSunAmount(review.resources.estimatedBurnSun)} TRX`} accent={hasResourceShortfall} />
                  <DetailRow label="Fee Cap" value={`${formatTrxFromSunAmount(review.resources.recommendedFeeLimitSun)} TRX`} />
                  <DetailRow label="TRX Available" value={review.trxCoverage.trxBalanceDisplay} />
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
                    ? 'Not enough TRX to cover the estimated burn.'
                    : hasResourceShortfall
                      ? 'You are short on resources. The burn estimate above already includes this gap.'
                      : 'You have enough resources for this action. Extra burn is unlikely.'
                }
                messageRisk={!review.trxCoverage.canCoverBurn || hasResourceShortfall}
              />

              <View style={styles.noticeCard}>
                <Text style={styles.noticeCardText}>
                  This calls withdrawRewards() on FourteenController. The contract sends only the current claimable TRX reward to the connected ambassador wallet.
                </Text>
              </View>

              <TouchableOpacity activeOpacity={0.9} style={styles.secondaryButton} onPress={handleReject} disabled={submitting}>
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
          onRequestClose={() => {
            setPasscodeOpen(false);
            setPasscodeDigits('');
            setPasscodeError('');
          }}
          statusBarTranslucent
        >
          <SafeAreaView style={styles.authModalSafe} edges={['top', 'bottom']}>
            <View style={styles.authOverlay}>
              <View style={styles.authScreen}>
                <View style={styles.authContent}>
                  <Text style={ui.eyebrow}>AMBASSADOR</Text>
                  <Text style={styles.authTitle}>
                    Confirm with <Text style={styles.authTitleAccent}>Passcode</Text>
                  </Text>
                  <Text style={styles.authLead}>
                    Authorize this reward withdrawal with your 6-digit passcode
                    {biometricAvailable && biometricsEnabled
                      ? ` or ${biometricLabel === 'Face ID' ? 'face unlock' : 'fingerprint'}`
                      : ''}.
                  </Text>

                  <View style={styles.authCard}>
                    <View style={styles.authCardHeaderRow}>
                      <Text style={ui.sectionEyebrow}>Approve</Text>
                      <Text style={styles.authCardErrorText} numberOfLines={1}>{passcodeError || ' '}</Text>
                    </View>
                    <View style={styles.dotsRow}>
                      {Array.from({ length: 6 }, (_, index) => (
                        <View key={index} style={[styles.dot, passcodeDigits.length > index && styles.dotFilled]} />
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
                    onPress={() => {
                      setPasscodeOpen(false);
                      setPasscodeDigits('');
                      setPasscodeError('');
                    }}
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

function DetailRow({
  label,
  value,
  first = false,
  accent = false,
}: {
  label: string;
  value: string;
  first?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={first ? styles.detailRowFirst : styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={accent ? styles.detailValueAccent : styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: layout.screenPaddingX },
  scroll: { flex: 1 },
  content: { flexGrow: 1 },

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
  heroMetricRow: { marginTop: 10, flexDirection: 'row', gap: 10 },
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
  },
  heroMetricCardSpend: { backgroundColor: 'rgba(255,255,255,0.96)' },
  heroMetricCardReceive: { borderColor: 'rgba(21,224,56,0.28)' },
  heroMetricLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.3,
  },
  heroMetricLabelSpend: { color: colors.graphite },
  heroMetricLabelReceive: { color: colors.green },
  heroMetricValue: { fontSize: 22, lineHeight: 27, fontFamily: 'Sora_700Bold' },
  heroMetricValueSpend: { color: colors.graphite },
  heroMetricValueReceive: { color: colors.white },
  heroMetricToken: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
  },
  heroMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroMetaLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  heroMetaValue: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },
  heroMetaValueRisk: { color: colors.red },

  primaryButton: {
    marginTop: 14,
    minHeight: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.7,
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
  secondaryButton: {
    marginTop: 14,
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.7,
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
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
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
  detailLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    flexShrink: 0,
  },

  resourcesInlineRow: {
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  resourceInlineCol: { gap: 6 },
  resourceInlineLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  resourceInlineLabelRisk: { color: colors.red },
  resourceBarTrack: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
  },
  resourceBarTrackRisk: { backgroundColor: 'rgba(255,48,73,0.14)' },
  resourceBarAvailable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24,224,58,0.18)',
  },
  resourceBarAvailableRisk: { backgroundColor: 'rgba(255,48,73,0.12)' },
  resourceBarUsed: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
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
  infoRowText: { color: colors.textSoft, fontSize: 13, lineHeight: 20, fontFamily: 'Sora_600SemiBold' },
  infoRowTextRisk: { color: colors.red },
  noticeCard: {
    marginTop: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  noticeCardText: { color: colors.textDim, fontSize: 12, lineHeight: 20 },
  errorWrap: {
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,48,73,0.28)',
    backgroundColor: 'rgba(255,48,73,0.08)',
    padding: 14,
  },
  errorText: { color: colors.red, fontSize: 14, lineHeight: 20 },

  authModalSafe: { flex: 1, backgroundColor: colors.bg },
  authOverlay: { flex: 1, backgroundColor: colors.bg },
  authScreen: { flex: 1, paddingHorizontal: layout.screenPaddingX, justifyContent: 'center' },
  authContent: { gap: 18 },
  authTitle: {
    color: colors.white,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: 'Sora_700Bold',
  },
  authTitleAccent: { color: colors.accent },
  authLead: { color: colors.textSoft, fontSize: 15, lineHeight: 24 },
  authCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    padding: 16,
    gap: 14,
  },
  authCardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  authCardErrorText: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  dotFilled: { borderColor: colors.accent, backgroundColor: colors.accent },
  authCancelButton: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authCancelButtonText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },
});
