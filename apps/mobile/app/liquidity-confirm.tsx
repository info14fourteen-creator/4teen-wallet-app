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
import { useI18n } from '../src/i18n';
import { useNavigationInsets } from '../src/ui/navigation';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { goBackOrReplace } from '../src/ui/safe-back';
import { colors, layout, radius } from '../src/theme/tokens';
import { useNotice } from '../src/notice/notice-provider';
import { clearWalletRuntimeCaches, FOURTEEN_LOGO } from '../src/services/tron/api';
import {
  executeLiquidityController,
  estimateLiquidityControllerExecution,
  shortLiquidityTx,
  type LiquidityExecutionReview,
} from '../src/services/liquidity-controller';
import {
  getEnergyResaleQuote,
  rentEnergyForPurpose,
  type EnergyResaleQuote,
} from '../src/services/energy-resale';
import {
  formatTrxFromSunAmount,
  getAvailableResource,
} from '../src/services/wallet/resources';
import {
  getBiometricsEnabled,
  verifyPasscode,
} from '../src/security/local-auth';
import { useWalletSession } from '../src/wallet/wallet-session';

function shortAddress(address: string) {
  const safe = String(address || '').trim();
  if (safe.length <= 14) return safe || '—';
  return `${safe.slice(0, 6)}...${safe.slice(-6)}`;
}

export default function LiquidityConfirmScreen() {
  const router = useRouter();
  const notice = useNotice();
  const { t } = useI18n();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();
  const { setChromeHidden, triggerWalletDataRefresh } = useWalletSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<LiquidityExecutionReview | null>(null);
  const [errorText, setErrorText] = useState('');
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeEntryOpen, setPasscodeEntryOpen] = useState(false);
  const [passcodeDigits, setPasscodeDigits] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [biometricLabel, setBiometricLabel] = useState(t('Biometrics'));
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [energyQuote, setEnergyQuote] = useState<EnergyResaleQuote | null>(null);
  const [energyQuoteLoading, setEnergyQuoteLoading] = useState(false);
  const [energyRenting, setEnergyRenting] = useState(false);
  const [pendingApprovalMode, setPendingApprovalMode] = useState<'execute' | 'rent'>('execute');
  const preserveNoticeOnExitRef = useRef(false);
  const canUseBiometrics = biometricAvailable && biometricsEnabled;
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
  const approvalProcessing = !passcodeOpen && (submitting || energyRenting);
  const isApproveDisabled = submitting || !review || !hasTrxForBurn;

  useEffect(() => {
    let cancelled = false;

    if (!review || !canRentResources || review.wallet.kind === 'watch-only') {
      setEnergyQuote(null);
      setEnergyQuoteLoading(false);
      return;
    }

    setEnergyQuoteLoading(true);
    getEnergyResaleQuote({
      purpose: 'liquidity_execute',
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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');
      const nextReview = await estimateLiquidityControllerExecution();
      setReview(nextReview);
    } catch (error) {
      console.warn(error);
      setReview(null);
      setErrorText(
        error instanceof Error ? error.message : t('Failed to build liquidity confirmation.')
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  const loadBiometricsState = useCallback(async () => {
    try {
      const enabled = await getBiometricsEnabled();
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

      setBiometricsEnabled(enabled);
      setBiometricAvailable(enabled && compatible && enrolled);

      if (supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricLabel(t('Face ID'));
        return;
      }

      if (supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricLabel(t('Fingerprint'));
        return;
      }

      setBiometricLabel(t('Biometrics'));
    } catch (error) {
      console.warn(error);
      setBiometricsEnabled(false);
      setBiometricAvailable(false);
      setBiometricLabel(t('Biometrics'));
    }
  }, [t]);

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
        t('Not enough TRX for network burn. Top up at least {{amount}} TRX first.', {
          amount: formatTrxFromSunAmount(review.trxCoverage.missingTrxSun),
        }),
        3200
      );
      return;
    }

    burnWarningShownRef.current = false;
    notice.hideNotice();
  }, [notice, review, t]);

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

  const performRentEnergy = useCallback(async () => {
    if (!review || !energyQuote || energyRenting) return false;

    try {
      setEnergyRenting(true);
      notice.showNeutralNotice(t('Sending Energy rental payment...'), 2500);
      await rentEnergyForPurpose({
        purpose: 'liquidity_execute',
        wallet: review.wallet.address,
        quote: energyQuote,
        onProgress: (progress) => notice.showNeutralNotice(progress.message, 2600),
      });
      clearWalletRuntimeCaches(review.wallet.address);
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice(t('Energy is live. Triggering liquidity...'), 3000);
      await load();
      return true;
    } catch (error) {
      console.warn(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : t('Energy rental failed.'),
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
  }, [energyQuote, energyRenting, load, notice, review, t]);

  const performLiquidityExecution = useCallback(async () => {
    if (!review || submitting) return;

    try {
      setSubmitting(true);
      const receipt = await executeLiquidityController({
        feeLimitSun: review.resources.recommendedFeeLimitSun,
      });

      setPasscodeOpen(false);
      setPasscodeEntryOpen(false);
      setPasscodeDigits('');
      triggerWalletDataRefresh();
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice(
        t('Liquidity trigger sent: {{tx}}', { tx: shortLiquidityTx(receipt.txId) }),
        3000
      );
      router.replace('/liquidity-controller');
    } catch (error) {
      console.warn(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : t('Liquidity execution failed.'),
        3200
      );
    } finally {
      setSubmitting(false);
    }
  }, [notice, review, router, submitting, triggerWalletDataRefresh, t]);

  const handlePasscodeSubmit = useCallback(async () => {
    if (submitting || energyRenting || passcodeDigits.length !== 6) return;

    try {
      const ok = await verifyPasscode(passcodeDigits);

      if (!ok) {
        setPasscodeError(t('Wrong passcode.'));
        setPasscodeDigits('');
        return;
      }

      setPasscodeOpen(false);
      setPasscodeEntryOpen(false);
      setPasscodeDigits('');
      setPasscodeError('');

      if (pendingApprovalMode === 'rent') {
        const rented = await performRentEnergy();
        if (rented) {
          await performLiquidityExecution();
        }
        return;
      }

      await performLiquidityExecution();
    } catch (error) {
      console.warn(error);
      setPasscodeError(t('Failed to verify passcode.'));
      setPasscodeDigits('');
    }
  }, [
    energyRenting,
    passcodeDigits,
    pendingApprovalMode,
    performLiquidityExecution,
    performRentEnergy,
    submitting,
    t,
  ]);

  useEffect(() => {
    if (passcodeOpen && passcodeDigits.length === 6) {
      void handlePasscodeSubmit();
    }
  }, [handlePasscodeSubmit, passcodeDigits, passcodeOpen]);

  const handleReject = useCallback(() => {
    if (submitting) return;
    preserveNoticeOnExitRef.current = true;
    notice.showNeutralNotice(t('Liquidity execution rejected by user.'), 2200);
    goBackOrReplace(router, { fallback: '/liquidity-controller' });
  }, [notice, router, submitting, t]);

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
    setPasscodeOpen(true);
    setPasscodeEntryOpen(true);
  }, []);

  const closePasscodeEntry = useCallback(() => {
    closeApprovalAuth();
  }, [closeApprovalAuth]);

  const handleBiometricApproval = useCallback(async (mode: 'execute' | 'rent' = pendingApprovalMode) => {
    if (!canUseBiometrics) {
      openPasscodeEntry();
      return;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: mode === 'rent' ? t('Confirm Energy Rental') : t('Confirm Liquidity'),
        fallbackLabel: t('Use Passcode'),
        cancelLabel: t('Cancel'),
      });

      if (!result.success) {
        if (result.error === 'user_fallback') {
          openPasscodeEntry();
        }
        return;
      }

      setPasscodeOpen(false);
      setPasscodeEntryOpen(false);
      setPasscodeDigits('');
      setPasscodeError('');

      if (mode === 'rent') {
        const rented = await performRentEnergy();
        if (rented) {
          await performLiquidityExecution();
        }
        return;
      }

      await performLiquidityExecution();
    } catch (error) {
      console.warn(error);
    }
  }, [canUseBiometrics, openPasscodeEntry, pendingApprovalMode, performLiquidityExecution, performRentEnergy, t]);

  const openApprovalAuth = useCallback((mode: 'execute' | 'rent', preferPasscode = false) => {
    setPendingApprovalMode(mode);
    setPasscodeError('');
    setPasscodeDigits('');

    if (preferPasscode || !canUseBiometrics) {
      setPasscodeEntryOpen(true);
      setPasscodeOpen(true);
      return;
    }

    void handleBiometricApproval(mode);
  }, [canUseBiometrics, handleBiometricApproval]);

  const handleApprove = useCallback(async () => {
    if (!review || submitting || !review.trxCoverage.canCoverBurn) return;
    openApprovalAuth('execute');
  }, [openApprovalAuth, review, submitting]);

  const handleRentEnergy = useCallback(async () => {
    if (!review || !energyQuote || submitting || energyRenting) return;

    openApprovalAuth('rent');
  }, [energyQuote, energyRenting, openApprovalAuth, review, submitting]);

  if (loading && !review) {
    return <ScreenLoadingState label={t('Building liquidity confirmation')} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScreenLoadingOverlay visible={refreshing || approvalProcessing} />
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
          <ScreenBrow label={t('LIQUIDITY')} variant="back" />

          {errorText || !review ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>
                {errorText || t('Unable to build liquidity confirmation.')}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <Image
                  source={{ uri: FOURTEEN_LOGO }}
                  style={styles.heroWatermark}
                  contentFit="contain"
                />

                <Text style={styles.heroWalletName}>{review.wallet.name}</Text>
                <Text style={styles.heroWalletAddress}>{review.wallet.address}</Text>

                <View style={styles.heroMetricRow}>
                  <View style={[styles.heroMetricCard, styles.heroMetricCardSpend]}>
                    <Text style={[styles.heroMetricLabel, styles.heroMetricLabelSpend]}>
                      {t('CONTRACT')}
                    </Text>
                    <Text style={[styles.heroMetricValue, styles.heroMetricValueSpend]}>
                      Bootstrap
                    </Text>
                    <Text style={styles.heroMetricToken}>
                      {shortAddress(review.bootstrapperAddress)}
                    </Text>
                  </View>

                  <View style={[styles.heroMetricCard, styles.heroMetricCardReceive]}>
                    <Text style={[styles.heroMetricLabel, styles.heroMetricLabelReceive]}>
                      {t('ACTION')}
                    </Text>
                    <Text style={[styles.heroMetricValue, styles.heroMetricValueReceive]}>
                      {t('Execute')}
                    </Text>
                    <Text style={styles.heroMetricToken}>{t('daily liquidity')}</Text>
                  </View>
                </View>

                <View style={styles.heroMetaRow}>
                  <Text style={styles.heroMetaLabel}>{t('Estimated burn')}</Text>
                  <Text
                    style={[
                      styles.heroMetaValue,
                      hasResourceShortfall ? styles.heroMetaValueRisk : null,
                    ]}
                  >
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
                  <Text
                    style={styles.primaryButtonText}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {hasTrxForBurn ? t('APPROVE & EXECUTE') : t('TOP UP TRX')}
                  </Text>
                )}
              </TouchableOpacity>

              <EnergyResaleCard
                quote={energyQuote}
                loading={energyQuoteLoading}
                processing={energyRenting}
                disabled={submitting}
                showUnavailable={canRentResources}
                actionLabel={t('EXECUTE')}
                estimatedBurnSun={review.resources.estimatedBurnSun}
                onRent={() => void handleRentEnergy()}
              />

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionEyebrow}>{t('EXECUTION REVIEW')}</Text>
                <View style={styles.detailCard}>
                  <View style={styles.detailRowFirst}>
                    <Text style={styles.detailLabel}>{t('Wallet')}</Text>
                    <Text style={styles.detailValue}>{review.wallet.name}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('Controller')}</Text>
                    <Text style={styles.detailValue}>{shortAddress(review.controllerAddress)}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('Bootstrapper')}</Text>
                    <Text style={styles.detailValue}>{shortAddress(review.bootstrapperAddress)}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('Estimated Burn')}</Text>
                    <Text style={styles.detailValueAccent}>
                      {formatTrxFromSunAmount(review.resources.estimatedBurnSun)} TRX
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('Fee Cap')}</Text>
                    <Text style={styles.detailValue}>
                      {formatTrxFromSunAmount(review.resources.recommendedFeeLimitSun)} TRX
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('TRX Available')}</Text>
                    <Text style={styles.detailValue}>{review.trxCoverage.trxBalanceDisplay}</Text>
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
                    ? t('Not enough TRX to cover the estimated burn.')
                    : hasResourceShortfall
                      ? t('You are short on resources. The burn estimate above already includes this gap.')
                      : t('You have enough resources for this action. Extra burn is unlikely.')
                }
                messageRisk={!review.trxCoverage.canCoverBurn || hasResourceShortfall}
              />

              <View style={styles.noticeCard}>
                <Text style={styles.noticeCardText}>
                  {t('This calls the LiquidityBootstrapper. The contracts still enforce the daily cadence, threshold, release percentage, and executor split.')}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.secondaryButton}
                onPress={handleReject}
                disabled={submitting}
              >
                <Text
                  style={styles.secondaryButtonText}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('REJECT')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        <ApprovalAuthModal
          visible={passcodeOpen}
          eyebrow={t('LIQUIDITY')}
          actionLabel={
            pendingApprovalMode === 'rent'
              ? t('Energy rental and liquidity execution')
              : t('liquidity execution')
          }
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
    marginTop: 0,
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
    borderColor: 'rgba(255,105,0,0.22)',
    backgroundColor: 'rgba(255,105,0,0.08)',
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
    color: colors.accent,
  },

  heroMetricLabelReceive: {
    color: colors.green,
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

  heroMetricValue: {
    fontSize: 20,
    lineHeight: 25,
    fontFamily: 'Sora_700Bold',
    color: colors.white,
  },

  heroMetricValueSpend: {
    color: colors.accent,
  },

  heroMetricValueReceive: {
    color: colors.green,
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

  heroMetaValueRisk: {
    color: colors.red,
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
    textAlign: 'center',
    alignSelf: 'stretch',
    flexShrink: 1,
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
    textAlign: 'center',
    alignSelf: 'stretch',
    flexShrink: 1,
  },

  errorWrap: {
    marginTop: 0,
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

  authCancelButtonText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
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
});
