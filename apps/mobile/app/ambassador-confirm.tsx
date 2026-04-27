import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import ApprovalAuthModal from '../src/ui/approval-auth-modal';
import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingOverlay from '../src/ui/screen-loading-overlay';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import EnergyResaleCard from '../src/ui/energy-resale-card';
import ConfirmNetworkLoadCard from '../src/ui/confirm-network-load-card';
import { SendIcon } from '../src/ui/ui-icons';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { goBackOrReplace } from '../src/ui/safe-back';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useNavigationInsets } from '../src/ui/navigation';
import { useNotice } from '../src/notice/notice-provider';
import { getBiometricsEnabled, verifyPasscode } from '../src/security/local-auth';
import { clearWalletRuntimeCaches, FOURTEEN_LOGO } from '../src/services/tron/api';
import {
  estimateAmbassadorRegistration,
  isValidAmbassadorSlug,
  normalizeAmbassadorSlug,
  registerAmbassadorWithOptions,
  type AmbassadorRegistrationReview,
} from '../src/services/ambassador';
import {
  getEnergyResaleQuote,
  rentEnergyForPurpose,
  type EnergyResaleQuote,
} from '../src/services/energy-resale';
import {
  formatTrxFromSunAmount,
  getAvailableResource,
} from '../src/services/wallet/resources';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import { useWalletSession } from '../src/wallet/wallet-session';

type RegistrationApprovalMode = 'burn' | 'rent';

function resolveParam(value: string | string[] | undefined) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return String(value[0] || '');
  return '';
}

function shortenAddress(address: string) {
  const safe = String(address || '').trim();
  if (safe.length <= 14) return safe || '—';
  return `${safe.slice(0, 6)}...${safe.slice(-6)}`;
}

export default function AmbassadorConfirmScreen() {
  const router = useRouter();
  const notice = useNotice();
  const { setChromeHidden, triggerWalletDataRefresh } = useWalletSession();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();
  const params = useLocalSearchParams<{ slug?: string | string[] }>();

  const requestedSlug = useMemo(
    () => normalizeAmbassadorSlug(resolveParam(params.slug)),
    [params.slug]
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<AmbassadorRegistrationReview | null>(null);
  const [errorText, setErrorText] = useState('');
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeEntryOpen, setPasscodeEntryOpen] = useState(false);
  const [passcodeDigits, setPasscodeDigits] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [energyQuote, setEnergyQuote] = useState<EnergyResaleQuote | null>(null);
  const [energyQuoteLoading, setEnergyQuoteLoading] = useState(false);
  const [energyRenting, setEnergyRenting] = useState(false);
  const [pendingApprovalMode, setPendingApprovalMode] =
    useState<RegistrationApprovalMode>('burn');
  const burnWarningShownRef = useRef(false);
  const canUseBiometrics = biometricAvailable && biometricsEnabled;
  const preserveNoticeOnExitRef = useRef(false);

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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');

      if (!isValidAmbassadorSlug(requestedSlug)) {
        throw new Error('Ambassador slug is invalid. Go back and enter a valid slug.');
      }

      const nextReview = await estimateAmbassadorRegistration(requestedSlug);
      setReview(nextReview);
    } catch (error) {
      console.error(error);
      setReview(null);
      setEnergyQuote(null);
      setErrorText(
        error instanceof Error ? error.message : 'Failed to build ambassador confirmation.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestedSlug]);

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
    let cancelled = false;

    if (!review || !canRentResources || review.wallet.kind === 'watch-only') {
      setEnergyQuote(null);
      setEnergyQuoteLoading(false);
      return;
    }

    setEnergyQuoteLoading(true);
    getEnergyResaleQuote({
      purpose: 'ambassador_registration',
      wallet: review.wallet.address,
      requiredEnergy: review.resources.energyShortfall || review.resources.estimatedEnergy,
      requiredBandwidth:
        review.resources.bandwidthShortfall || review.resources.estimatedBandwidth,
      metadata: {
        slug: requestedSlug,
      },
    })
      .then((quote) => {
        if (!cancelled) setEnergyQuote(quote);
      })
      .finally(() => {
        if (!cancelled) setEnergyQuoteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canRentResources, requestedSlug, review]);

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
    if (submitting || energyRenting) return;

    setRefreshing(true);
    await load();
  }, [energyRenting, load, submitting]);

  const handleReject = useCallback(() => {
    if (submitting || energyRenting) return;

    preserveNoticeOnExitRef.current = true;
    notice.showNeutralNotice('Ambassador registration rejected by user.', 2200);
    goBackOrReplace(router, { fallback: '/ambassador-program' });
  }, [energyRenting, notice, router, submitting]);

  const performRentEnergy = useCallback(async () => {
    if (!review || !energyQuote || energyRenting) return false;

    try {
      setEnergyRenting(true);
      notice.showNeutralNotice('Sending Energy rental payment...', 2500);
      await rentEnergyForPurpose({
        purpose: 'ambassador_registration',
        wallet: review.wallet.address,
        quote: energyQuote,
        metadata: {
          slug: requestedSlug,
        },
        onProgress: (progress) => notice.showNeutralNotice(progress.message, 2600),
      });
      clearWalletRuntimeCaches(review.wallet.address);
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice('Energy is live. Sending ambassador registration...', 3000);
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
      setPasscodeEntryOpen(false);
      setPasscodeDigits('');
      setPasscodeError('');
    }
  }, [energyQuote, energyRenting, load, notice, requestedSlug, review]);

  const performRegistration = useCallback(async () => {
    if (!review || submitting) return;

    try {
      setSubmitting(true);

      const receipt = await registerAmbassadorWithOptions(requestedSlug, {
        feeLimitSun: review.resources.recommendedFeeLimitSun,
      });

      setPasscodeOpen(false);
      setPasscodeEntryOpen(false);
      setPasscodeDigits('');
      setPasscodeError('');
      triggerWalletDataRefresh();
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice(`Ambassador registered: ${receipt.slug}`, 3000);
      router.replace('/ambassador-program');
    } catch (error) {
      console.error(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : 'Ambassador registration failed.',
        3400
      );
    } finally {
      setSubmitting(false);
    }
  }, [notice, requestedSlug, review, router, submitting, triggerWalletDataRefresh]);

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
          await performRegistration();
        }
        return;
      }

      await performRegistration();
    } catch (error) {
      console.error(error);
      setPasscodeError('Failed to verify passcode.');
      setPasscodeDigits('');
    }
  }, [
    energyRenting,
    passcodeDigits,
    pendingApprovalMode,
    performRegistration,
    performRentEnergy,
    submitting,
  ]);

  useEffect(() => {
    if (passcodeOpen && passcodeDigits.length === 6) {
      void handlePasscodeSubmit();
    }
  }, [handlePasscodeSubmit, passcodeDigits, passcodeOpen]);

  const handleApprove = useCallback(async () => {
    if (!review || submitting || !review.trxCoverage.canCoverBurn) return;

    setPendingApprovalMode('burn');
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

  const controllerUrl = review
    ? `https://tronscan.org/#/contract/${review.controllerAddress}`
    : 'https://tronscan.org/#/';

  const handlePasscodeDigitPress = useCallback((digit: string) => {
    if (submitting || energyRenting) return;
    setPasscodeError('');
    setPasscodeDigits((prev) => (prev.length >= 6 ? prev : `${prev}${digit}`));
  }, [energyRenting, submitting]);

  const handlePasscodeBackspace = useCallback(() => {
    if (submitting || energyRenting) return;
    setPasscodeError('');
    setPasscodeDigits((prev) => prev.slice(0, -1));
  }, [energyRenting, submitting]);

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
        promptMessage:
          pendingApprovalMode === 'rent' ? 'Confirm Energy Rental' : 'Confirm Ambassador Registration',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
      });

      if (!result.success) {
        return;
      }

      if (pendingApprovalMode === 'rent') {
        const rented = await performRentEnergy();
        if (rented) {
          await performRegistration();
        }
        return;
      }

      await performRegistration();
    } catch (error) {
      console.error(error);
    }
  }, [canUseBiometrics, openPasscodeEntry, pendingApprovalMode, performRegistration, performRentEnergy]);

  if (loading && !review && !errorText) {
    return <ScreenLoadingState label="Building ambassador confirmation" />;
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
          <ScreenBrow label="AMBASSADOR" variant="back" />

          {errorText || !review ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>
                {errorText || 'Ambassador confirmation is unavailable.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <Image source={{ uri: FOURTEEN_LOGO }} style={styles.heroWatermark} contentFit="contain" />
                <Text style={styles.heroWalletName}>{review.wallet.name}</Text>
                <Text style={styles.heroWalletAddress}>{review.wallet.address}</Text>

                <View style={styles.heroSlugBlock}>
                  <Text style={styles.heroSlugLabel}>SLUG</Text>
                  <Text style={styles.heroSlugValue}>{requestedSlug}</Text>
                  <Text style={styles.heroSlugHint}>This slug becomes permanent after registration.</Text>
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
                {submitting && pendingApprovalMode === 'burn' ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {hasTrxForBurn ? 'APPROVE & REGISTER' : 'TOP UP TRX'}
                  </Text>
                )}
              </TouchableOpacity>

              <EnergyResaleCard
                quote={energyQuote}
                loading={energyQuoteLoading}
                processing={energyRenting}
                disabled={submitting || energyRenting}
                showUnavailable={canRentResources}
                actionLabel="REGISTER"
                estimatedBurnSun={review.resources.estimatedBurnSun}
                onRent={() => void handleRentEnergy()}
              />

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionEyebrow}>REGISTRATION REVIEW</Text>
                <View style={styles.detailCard}>
                  <DetailRow label="Wallet" value={review.wallet.name} first />
                  <DetailRow label="Slug" value={requestedSlug} />
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.linkRow}
                    onPress={() => void openInAppBrowser(router, controllerUrl)}
                  >
                    <Text style={styles.detailLabel}>Controller</Text>
                    <View style={styles.linkRowValueWrap}>
                      <Text style={styles.linkRowValue}>{shortenAddress(review.controllerAddress)}</Text>
                      <SendIcon width={16} height={16} color={colors.textSoft} />
                    </View>
                  </TouchableOpacity>
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
                  This sends your ambassador registration to FourteenController. After the
                  transaction is accepted, the backend completes slug mapping for the same wallet
                  and referral link.
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.secondaryButton}
                onPress={handleReject}
                disabled={submitting || energyRenting}
              >
                <Text style={styles.secondaryButtonText}>REJECT</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        <ApprovalAuthModal
          visible={passcodeOpen}
          eyebrow="AMBASSADOR"
          actionLabel={pendingApprovalMode === 'rent' ? 'Energy rental and ambassador registration' : 'ambassador registration'}
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
  heroSlugBlock: {
    marginTop: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  heroSlugLabel: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.5,
  },
  heroSlugValue: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Sora_700Bold',
  },
  heroSlugHint: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 16,
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
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    ...ui.actionLabel,
    color: colors.white,
  },

  detailCard: {
    marginTop: 16,
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
  detailLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    flexShrink: 0,
  },
  detailValue: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
    flex: 1,
  },
  detailValueAccent: {
    color: colors.green,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
    flex: 1,
  },
  linkRow: {
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
  linkRowValueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  linkRowValue: {
    flexShrink: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
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
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.accent,
    borderRadius: 999,
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
  },
  infoRowTextRisk: {
    color: colors.red,
  },
  noticeCard: {
    marginTop: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeCardText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  errorCard: {
    marginTop: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,48,73,0.28)',
    backgroundColor: 'rgba(255,48,73,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
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
    paddingHorizontal: layout.screenPaddingX,
    justifyContent: 'center',
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
    color: colors.green,
  },
  authLead: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  authCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 18,
  },
  authCardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  authCardErrorText: {
    flex: 1,
    textAlign: 'right',
    color: colors.red,
    fontSize: 12,
    lineHeight: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  dotFilled: {
    backgroundColor: colors.accent,
  },
  authCancelButton: {
    minHeight: 50,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authCancelButtonText: {
    ...ui.actionLabel,
    color: colors.textDim,
  },
});
