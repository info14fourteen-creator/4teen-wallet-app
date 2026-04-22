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
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import NumericKeypad from '../src/ui/numeric-keypad';
import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import { BackspaceIcon, BioLoginIcon } from '../src/ui/ui-icons';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useNavigationInsets } from '../src/ui/navigation';
import { useNotice } from '../src/notice/notice-provider';
import { getBiometricsEnabled, verifyPasscode } from '../src/security/local-auth';
import { FOURTEEN_LOGO } from '../src/services/tron/api';
import {
  estimateAmbassadorWithdrawal,
  formatTrxFromSun,
  withdrawAmbassadorRewards,
  type AmbassadorWithdrawalReview,
} from '../src/services/ambassador';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useWalletSession } from '../src/wallet/wallet-session';

function formatResourceValue(value: number) {
  const safe = Math.max(0, Math.floor(Number(value) || 0));
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(safe);
}

function formatTrxAmountFromSun(value: number) {
  const trx = Math.max(0, Number(value || 0)) / 1_000_000;
  return trx.toFixed(trx >= 1 ? 3 : 6).replace(/\.?0+$/, '') || '0';
}

function shortAddress(address: string) {
  const safe = String(address || '').trim();
  if (safe.length <= 14) return safe || '—';
  return `${safe.slice(0, 6)}...${safe.slice(-6)}`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
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
  const preserveNoticeOnExitRef = useRef(false);
  const burnWarningShownRef = useRef(false);

  useChromeLoading(loading || refreshing);

  const energyAvailable = review
    ? Math.max(0, review.resources.available.energyLimit - review.resources.available.energyUsed)
    : 0;
  const bandwidthAvailable = review
    ? Math.max(0, review.resources.available.bandwidthLimit - review.resources.available.bandwidthUsed)
    : 0;
  const hasNoEnergyAvailable = energyAvailable <= 0;
  const hasResourceShortfall = Boolean(
    review &&
      (review.resources.energyShortfall > 0 || review.resources.bandwidthShortfall > 0)
  );
  const energyBarPercent = useMemo(() => {
    if (!review) return 0;
    const base = Math.max(review.resources.estimatedEnergy, energyAvailable, 1);
    return clampPercent((review.resources.estimatedEnergy / base) * 100);
  }, [energyAvailable, review]);
  const bandwidthBarPercent = useMemo(() => {
    if (!review) return 0;
    const base = Math.max(review.resources.estimatedBandwidth, bandwidthAvailable, 1);
    return clampPercent((review.resources.estimatedBandwidth / base) * 100);
  }, [bandwidthAvailable, review]);
  const hasTrxForBurn = Boolean(review?.trxCoverage.canCoverBurn);
  const isApproveDisabled = submitting || !review || !hasTrxForBurn;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');
      const nextReview = await estimateAmbassadorWithdrawal();
      setReview(nextReview);
    } catch (error) {
      console.error(error);
      setReview(null);
      setErrorText(
        error instanceof Error ? error.message : 'Failed to build ambassador withdrawal confirmation.'
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
        `Not enough TRX for network burn. Top up at least ${formatTrxAmountFromSun(
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

  const performWithdraw = useCallback(async () => {
    if (!review || submitting) return;

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
  }, [notice, review, router, submitting, triggerWalletDataRefresh]);

  const handlePasscodeSubmit = useCallback(async () => {
    if (submitting || passcodeDigits.length !== 6) return;

    try {
      const ok = await verifyPasscode(passcodeDigits);

      if (!ok) {
        setPasscodeError('Wrong passcode.');
        setPasscodeDigits('');
        return;
      }

      await performWithdraw();
    } catch (error) {
      console.error(error);
      setPasscodeError('Failed to verify passcode.');
      setPasscodeDigits('');
    }
  }, [passcodeDigits, performWithdraw, submitting]);

  useEffect(() => {
    if (passcodeOpen && passcodeDigits.length === 6) {
      void handlePasscodeSubmit();
    }
  }, [handlePasscodeSubmit, passcodeDigits, passcodeOpen]);

  const handleApprove = useCallback(async () => {
    if (!review || submitting || !review.trxCoverage.canCoverBurn) return;

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
  }, [biometricAvailable, biometricsEnabled, performWithdraw, review, submitting]);

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
                    {formatTrxAmountFromSun(review.resources.estimatedBurnSun)} TRX
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

              <View style={styles.detailCard}>
                <DetailRow label="Wallet" value={review.wallet.name} first />
                <DetailRow label="Controller" value={shortAddress(review.controllerAddress)} />
                <DetailRow label="Claimable" value={`${formatTrxFromSun(review.claimableRewardsSun)} TRX`} accent />
                <DetailRow label="Estimated Burn" value={`${formatTrxAmountFromSun(review.resources.estimatedBurnSun)} TRX`} accent={hasResourceShortfall} />
                <DetailRow label="Fee Cap" value={`${formatTrxAmountFromSun(review.resources.recommendedFeeLimitSun)} TRX`} />
                <DetailRow label="TRX Available" value={review.trxCoverage.trxBalanceDisplay} />
              </View>

              <View style={styles.detailCard}>
                <DetailRow label="Energy" value={formatResourceValue(review.resources.estimatedEnergy)} first />
                <DetailRow label="Bandwidth" value={formatResourceValue(review.resources.estimatedBandwidth)} />
                <DetailRow
                  label="Shortfall"
                  value={`${formatResourceValue(review.resources.energyShortfall)} energy · ${formatResourceValue(review.resources.bandwidthShortfall)} bandwidth`}
                  accent={hasResourceShortfall}
                />

                <View style={styles.resourcesInlineRow}>
                  <ResourceBar
                    label={`Energy ${formatResourceValue(review.resources.estimatedEnergy)}/${formatResourceValue(energyAvailable)}`}
                    risk={hasNoEnergyAvailable}
                    percent={energyBarPercent}
                  />
                  <ResourceBar
                    label={`Bandwidth ${formatResourceValue(review.resources.estimatedBandwidth)}/${formatResourceValue(bandwidthAvailable)}`}
                    percent={bandwidthBarPercent}
                  />
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text
                  style={[
                    styles.infoRowText,
                    (!review.trxCoverage.canCoverBurn || hasResourceShortfall) ? styles.infoRowTextRisk : null,
                  ]}
                >
                  {!review.trxCoverage.canCoverBurn
                    ? 'TRX is too low to cover the estimated network burn.'
                    : hasResourceShortfall
                      ? 'Resources are short. Network burn is included in the estimate above.'
                      : 'Resources are sufficient. This withdrawal should avoid extra burn.'}
                </Text>
              </View>

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
          onRequestClose={() => setPasscodeOpen(false)}
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

function ResourceBar({
  label,
  percent,
  risk = false,
}: {
  label: string;
  percent: number;
  risk?: boolean;
}) {
  return (
    <View style={styles.resourceInlineCol}>
      <Text style={[styles.resourceInlineLabel, risk ? styles.resourceInlineLabelRisk : null]}>{label}</Text>
      <View style={[styles.resourceBarTrack, risk ? styles.resourceBarTrackRisk : null]}>
        <View style={[styles.resourceBarAvailable, risk ? styles.resourceBarAvailableRisk : null]} />
        <View style={[styles.resourceBarUsed, { width: `${percent}%` }]} />
      </View>
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
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
  },
  secondaryButton: {
    marginTop: 14,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
  },

  detailCard: {
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
  },
  detailRowFirst: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailRow: {
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  detailLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
  },
  detailValue: {
    flexShrink: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },
  detailValueAccent: {
    flexShrink: 1,
    color: colors.accent,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },

  resourcesInlineRow: { borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingVertical: 14, gap: 12 },
  resourceInlineCol: { gap: 8 },
  resourceInlineLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
  },
  resourceInlineLabelRisk: { color: colors.red },
  resourceBarTrack: {
    height: 7,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  resourceBarTrackRisk: { backgroundColor: 'rgba(255,48,73,0.16)' },
  resourceBarAvailable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(21,224,56,0.22)',
  },
  resourceBarAvailableRisk: { backgroundColor: 'rgba(255,48,73,0.18)' },
  resourceBarUsed: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },

  infoRow: {
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 14,
  },
  infoRowText: { color: colors.textSoft, fontSize: 13, lineHeight: 20 },
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
    borderRadius: radius.md,
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
