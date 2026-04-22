import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  clampResourcePercent,
  formatResourceAmount,
  formatTrxFromSunAmount,
  getAvailableResource,
} from '../src/services/wallet/resources';
import {
  getBiometricsEnabled,
  verifyPasscode,
} from '../src/security/local-auth';
import { useWalletSession } from '../src/wallet/wallet-session';
import { BackspaceIcon, BioLoginIcon } from '../src/ui/ui-icons';

function shortAddress(address: string) {
  const safe = String(address || '').trim();
  if (safe.length <= 14) return safe || '—';
  return `${safe.slice(0, 6)}...${safe.slice(-6)}`;
}

export default function LiquidityConfirmScreen() {
  const router = useRouter();
  const notice = useNotice();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();
  const { setChromeHidden, triggerWalletDataRefresh } = useWalletSession();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<LiquidityExecutionReview | null>(null);
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
  const [pendingApprovalMode, setPendingApprovalMode] = useState<'execute' | 'rent'>('execute');
  const preserveNoticeOnExitRef = useRef(false);
  const burnWarningShownRef = useRef(false);

  useChromeLoading(loading || refreshing);

  const energyAvailable = review ? getAvailableResource(review.resources.available, 'energy') : 0;
  const bandwidthAvailable = review
    ? getAvailableResource(review.resources.available, 'bandwidth')
    : 0;
  const hasNoEnergyAvailable = energyAvailable <= 0;
  const hasResourceShortfall = Boolean(
    review &&
      (review.resources.energyShortfall > 0 || review.resources.bandwidthShortfall > 0)
  );
  const canRentResources = Boolean(
    review &&
      (review.resources.estimatedEnergy > 0 || review.resources.estimatedBandwidth > 0)
  );
  const energyBarPercent = useMemo(() => {
    if (!review) return 0;
    const base = Math.max(review.resources.estimatedEnergy, energyAvailable, 1);
    return clampResourcePercent((review.resources.estimatedEnergy / base) * 100);
  }, [energyAvailable, review]);
  const bandwidthBarPercent = useMemo(() => {
    if (!review) return 0;
    const base = Math.max(review.resources.estimatedBandwidth, bandwidthAvailable, 1);
    return clampResourcePercent((review.resources.estimatedBandwidth / base) * 100);
  }, [bandwidthAvailable, review]);
  const hasTrxForBurn = Boolean(review?.trxCoverage.canCoverBurn);
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
      console.error(error);
      setReview(null);
      setErrorText(
        error instanceof Error ? error.message : 'Failed to build liquidity confirmation.'
      );
    } finally {
      setLoading(false);
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
      notice.showNeutralNotice('Sending Energy rental payment...', 2500);
      await rentEnergyForPurpose({
        purpose: 'liquidity_execute',
        wallet: review.wallet.address,
        quote: energyQuote,
        onProgress: (progress) => notice.showNeutralNotice(progress.message, 2600),
      });
      clearWalletRuntimeCaches(review.wallet.address);
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice('Energy is live. Triggering liquidity...', 3000);
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

  const performLiquidityExecution = useCallback(async () => {
    if (!review || submitting) return;

    try {
      setSubmitting(true);
      const receipt = await executeLiquidityController({
        feeLimitSun: review.resources.recommendedFeeLimitSun,
      });

      setPasscodeOpen(false);
      setPasscodeDigits('');
      triggerWalletDataRefresh();
      preserveNoticeOnExitRef.current = true;
      notice.showSuccessNotice(`Liquidity trigger sent: ${shortLiquidityTx(receipt.txId)}`, 3000);
      router.replace('/liquidity-controller');
    } catch (error) {
      console.error(error);
      notice.showErrorNotice(
        error instanceof Error ? error.message : 'Liquidity execution failed.',
        3200
      );
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
          await performLiquidityExecution();
        }
        return;
      }

      await performLiquidityExecution();
    } catch (error) {
      console.error(error);
      setPasscodeError('Failed to verify passcode.');
      setPasscodeDigits('');
    }
  }, [
    energyRenting,
    passcodeDigits,
    pendingApprovalMode,
    performLiquidityExecution,
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
    setPendingApprovalMode('execute');

    if (biometricAvailable && biometricsEnabled) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm Liquidity',
          fallbackLabel: 'Use Passcode',
          cancelLabel: 'Cancel',
        });

        if (result.success) {
          await performLiquidityExecution();
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
    performLiquidityExecution,
    review,
    submitting,
  ]);

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
            await performLiquidityExecution();
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
    performLiquidityExecution,
    review,
    submitting,
  ]);

  const handleReject = useCallback(() => {
    if (submitting) return;
    preserveNoticeOnExitRef.current = true;
    notice.showNeutralNotice('Liquidity execution rejected by user.', 2200);
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
    return <ScreenLoadingState label="Building liquidity confirmation" />;
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
          <ScreenBrow label="LIQUIDITY" variant="back" />

          {errorText || !review ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>
                {errorText || 'Unable to build liquidity confirmation.'}
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
                      CONTRACT
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
                      ACTION
                    </Text>
                    <Text style={[styles.heroMetricValue, styles.heroMetricValueReceive]}>
                      Execute
                    </Text>
                    <Text style={styles.heroMetricToken}>daily liquidity</Text>
                  </View>
                </View>

                <View style={styles.heroMetaRow}>
                  <Text style={styles.heroMetaLabel}>Estimated burn</Text>
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
                  <Text style={styles.primaryButtonText}>
                    {hasTrxForBurn ? 'APPROVE & EXECUTE' : 'TOP UP TRX'}
                  </Text>
                )}
              </TouchableOpacity>

              <EnergyResaleCard
                quote={energyQuote}
                loading={energyQuoteLoading}
                processing={energyRenting}
                disabled={submitting}
                actionLabel="EXECUTE"
                estimatedBurnSun={review.resources.estimatedBurnSun}
                onRent={() => void handleRentEnergy()}
              />

              <View style={styles.detailCard}>
                <View style={styles.detailRowFirst}>
                  <Text style={styles.detailLabel}>Wallet</Text>
                  <Text style={styles.detailValue}>{review.wallet.name}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Controller</Text>
                  <Text style={styles.detailValue}>{shortAddress(review.controllerAddress)}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Bootstrapper</Text>
                  <Text style={styles.detailValue}>{shortAddress(review.bootstrapperAddress)}</Text>
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
                    {formatTrxFromSunAmount(review.resources.recommendedFeeLimitSun)} TRX
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>TRX Available</Text>
                  <Text style={styles.detailValue}>{review.trxCoverage.trxBalanceDisplay}</Text>
                </View>
              </View>

              <View style={styles.detailCard}>
                <View style={styles.detailRowFirst}>
                  <Text style={styles.detailLabel}>Energy</Text>
                  <Text style={styles.detailValue}>
                    {formatResourceAmount(review.resources.estimatedEnergy)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Bandwidth</Text>
                  <Text style={styles.detailValue}>
                    {formatResourceAmount(review.resources.estimatedBandwidth)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Shortfall</Text>
                  <Text style={styles.detailValue}>
                    {formatResourceAmount(review.resources.energyShortfall)} energy ·{' '}
                    {formatResourceAmount(review.resources.bandwidthShortfall)} bandwidth
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
                      Energy {formatResourceAmount(review.resources.estimatedEnergy)}/
                      {formatResourceAmount(energyAvailable)}
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
                      Bandwidth {formatResourceAmount(review.resources.estimatedBandwidth)}/
                      {formatResourceAmount(bandwidthAvailable)}
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
                    (!review.trxCoverage.canCoverBurn || hasResourceShortfall)
                      ? styles.infoRowTextRisk
                      : null,
                  ]}
                >
                  {!review.trxCoverage.canCoverBurn
                    ? 'TRX is too low to cover the estimated network burn.'
                    : hasResourceShortfall
                      ? 'Resources are short. Network burn is included in the estimate above.'
                      : 'Resources are sufficient. This execution should avoid extra burn.'}
                </Text>
              </View>

              <View style={styles.noticeCard}>
                <Text style={styles.noticeCardText}>
                  This calls the LiquidityBootstrapper. The contracts still enforce the daily
                  cadence, threshold, release percentage, and executor split.
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.secondaryButton}
                onPress={handleReject}
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
                  <Text style={ui.eyebrow}>LIQUIDITY</Text>

                  <Text style={styles.authTitle}>
                    Confirm with <Text style={styles.authTitleAccent}>Passcode</Text>
                  </Text>

                  <Text style={styles.authLead}>
                    Authorize this liquidity execution with your 6-digit passcode
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
    flex: 1,
    color: colors.accent,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
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

  authCancelButtonText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
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
});
