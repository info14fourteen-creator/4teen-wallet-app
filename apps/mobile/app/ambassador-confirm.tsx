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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  buildAmbassadorSlugHash,
  checkAmbassadorSlugAvailability,
  confirmAmbassadorRegistrationEnergy,
  getAmbassadorRegistrationEnergyQuote,
  isValidAmbassadorSlug,
  normalizeAmbassadorSlug,
  registerAmbassador,
  type AmbassadorRegistrationEnergyQuote,
} from '../src/services/ambassador';
import { clearWalletRuntimeCaches, TRX_TOKEN_ID } from '../src/services/tron/api';
import { sendAssetTransfer } from '../src/services/wallet/send';
import EnergyResaleCard from '../src/ui/energy-resale-card';
import { getActiveWallet, type WalletMeta } from '../src/services/wallet/storage';
import type { EnergyResaleQuote } from '../src/services/energy-resale';
import { getBiometricsEnabled, verifyPasscode } from '../src/security/local-auth';
import { useNotice } from '../src/notice/notice-provider';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import NumericKeypad from '../src/ui/numeric-keypad';
import ScreenBrow from '../src/ui/screen-brow';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useNavigationInsets } from '../src/ui/navigation';
import { BackspaceIcon, BioLoginIcon } from '../src/ui/ui-icons';
import { useWalletSession } from '../src/wallet/wallet-session';

const REGISTRATION_CONTROLLER_ADDRESS = 'TF8yhohRfMxsdVRr7fFrYLh5fxK8sAFkeZ';
const ZERO_META_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

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

function shortenMiddle(value: string, start = 12, end = 10) {
  const text = String(value || '').trim();
  if (!text || text.length <= start + end + 3) return text || '—';
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function formatWalletAccessLabel(kind: WalletMeta['kind']) {
  if (kind === 'mnemonic') return 'SEED PHRASE';
  if (kind === 'private-key') return 'PRIVATE KEY';
  return 'WATCH ONLY';
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
  const [pendingApprovalMode, setPendingApprovalMode] =
    useState<RegistrationApprovalMode>('burn');
  const [wallet, setWallet] = useState<WalletMeta | null>(null);
  const [energyQuote, setEnergyQuote] = useState<AmbassadorRegistrationEnergyQuote | null>(null);
  const [slugAvailable, setSlugAvailable] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [energyRentalText, setEnergyRentalText] = useState('');
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeDigits, setPasscodeDigits] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const preserveNoticeOnExitRef = useRef(false);

  useChromeLoading(loading || refreshing);

  const slugHash = useMemo(
    () => (requestedSlug ? buildAmbassadorSlugHash(requestedSlug) : ''),
    [requestedSlug]
  );
  const isApproveDisabled =
    submitting ||
    !wallet ||
    wallet.kind === 'watch-only' ||
    !slugAvailable ||
    !isValidAmbassadorSlug(requestedSlug);
  const isRentApproveDisabled = isApproveDisabled || !energyQuote;
  const energyResaleQuote = useMemo<EnergyResaleQuote | null>(() => {
    if (!energyQuote) return null;

    return {
      purpose: 'ambassador_registration',
      mode: energyQuote.mode || 'api',
      wallet: energyQuote.wallet || wallet?.address || null,
      paymentAddress: energyQuote.paymentAddress,
      amountSun: energyQuote.amountSun,
      amountTrx: energyQuote.amountTrx,
      energyQuantity: energyQuote.energyQuantity,
      readyEnergy: energyQuote.readyEnergy,
      requiredEnergy: energyQuote.energyQuantity,
      packageCount: 1,
      label: 'Ambassador registration',
    };
  }, [energyQuote, wallet?.address]);

  const load = useCallback(async () => {
    try {
      setErrorText('');
      setLoading(true);

      if (!isValidAmbassadorSlug(requestedSlug)) {
        throw new Error('Ambassador slug is invalid. Go back and enter a valid slug.');
      }

      const activeWallet = await getActiveWallet();

      if (!activeWallet) {
        throw new Error('No active wallet selected.');
      }

      if (activeWallet.kind === 'watch-only') {
        throw new Error('Watch-only wallet cannot register as ambassador.');
      }

      await checkAmbassadorSlugAvailability(requestedSlug);
      const quote = await getAmbassadorRegistrationEnergyQuote({
        wallet: activeWallet.address,
        slug: requestedSlug,
      }).catch((quoteError) => {
        console.error('Failed to load ambassador energy quote:', quoteError);
        return null;
      });

      setWallet(activeWallet);
      setEnergyQuote(quote);
      setEnergyRentalText(
        quote
          ? ''
          : 'Energy rental quote is temporarily unavailable. You can still register by burning your own TRX.'
      );
      setSlugAvailable(true);
    } catch (error) {
      console.error(error);
      setWallet(null);
      setEnergyQuote(null);
      setSlugAvailable(false);
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
    return () => {
      setChromeHidden(false);
      if (!preserveNoticeOnExitRef.current) {
        notice.hideNotice();
      }
      preserveNoticeOnExitRef.current = false;
    };
  }, [notice, setChromeHidden]);

  const handleRefresh = useCallback(async () => {
    if (submitting) return;

    setRefreshing(true);
    await load();
  }, [load, submitting]);

  const handleReject = useCallback(() => {
    if (submitting) return;

    preserveNoticeOnExitRef.current = true;
    notice.showNeutralNotice('Ambassador registration rejected by user.', 2200);
    router.back();
  }, [notice, router, submitting]);

  const performRegistration = useCallback(async (mode: RegistrationApprovalMode) => {
    if (submitting || isApproveDisabled) return;

    try {
      setSubmitting(true);

      if (mode === 'rent') {
        if (!wallet || !energyQuote) {
          throw new Error('Energy rental quote is unavailable.');
        }

        const isResaleRental = String(energyQuote.mode || '').toLowerCase() === 'resale';

        setEnergyRentalText(
          isResaleRental
            ? `Sending ${energyQuote.amountTrx} TRX to GasStation resale package. Waiting for ${energyQuote.energyQuantity.toLocaleString('en-US')} Energy distribution.`
            : `Sending ${energyQuote.amountTrx} TRX rental payment, then requesting ${energyQuote.energyQuantity.toLocaleString('en-US')} Energy.`
        );
        const payment = await sendAssetTransfer({
          tokenId: TRX_TOKEN_ID,
          toAddress: energyQuote.paymentAddress,
          amount: energyQuote.amountTrx,
        });

        setEnergyRentalText(
          isResaleRental
            ? 'Payment confirmed. Waiting for GasStation automatic Energy distribution...'
            : 'Payment confirmed. Requesting Energy sublease from GasStation...'
        );
        await confirmAmbassadorRegistrationEnergy({
          wallet: wallet.address,
          slug: requestedSlug,
          paymentTxId: payment.txId,
        });
        clearWalletRuntimeCaches(wallet.address);
        setEnergyRentalText('Energy is available. Sending ambassador registration...');
      }

      const receipt = await registerAmbassador(requestedSlug);

      setPasscodeOpen(false);
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
  }, [
    energyQuote,
    isApproveDisabled,
    notice,
    requestedSlug,
    router,
    submitting,
    triggerWalletDataRefresh,
    wallet,
  ]);

  const handlePasscodeSubmit = useCallback(async () => {
    if (submitting || passcodeDigits.length !== 6) return;

    try {
      const ok = await verifyPasscode(passcodeDigits);

      if (!ok) {
        setPasscodeError('Wrong passcode.');
        setPasscodeDigits('');
        return;
      }

      await performRegistration(pendingApprovalMode);
    } catch (error) {
      console.error(error);
      setPasscodeError('Failed to verify passcode.');
      setPasscodeDigits('');
    }
  }, [passcodeDigits, pendingApprovalMode, performRegistration, submitting]);

  useEffect(() => {
    if (passcodeOpen && passcodeDigits.length === 6) {
      void handlePasscodeSubmit();
    }
  }, [handlePasscodeSubmit, passcodeDigits, passcodeOpen]);

  const handleApprove = useCallback(async (mode: RegistrationApprovalMode) => {
    if (submitting) return;
    if (mode === 'burn' && isApproveDisabled) return;
    if (mode === 'rent' && isRentApproveDisabled) return;

    setPendingApprovalMode(mode);

    if (biometricAvailable && biometricsEnabled) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm Ambassador Registration',
          fallbackLabel: 'Use Passcode',
          cancelLabel: 'Cancel',
        });

        if (result.success) {
          await performRegistration(mode);
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
    isApproveDisabled,
    isRentApproveDisabled,
    performRegistration,
    submitting,
  ]);

  const handlePasscodeDigitPress = useCallback((digit: string) => {
    if (submitting) return;
    setPasscodeError('');
    setPasscodeDigits((prev) => {
      if (prev.length >= 6) return prev;
      return `${prev}${digit}`;
    });
  }, [submitting]);

  const handlePasscodeBackspace = useCallback(() => {
    if (submitting) return;
    setPasscodeError('');
    setPasscodeDigits((prev) => prev.slice(0, -1));
  }, [submitting]);

  if (loading && !wallet && !errorText) {
    return <ScreenLoadingState label="Building ambassador confirmation" />;
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
          <ScreenBrow label="CONFIRM" variant="back" />

          {errorText || !wallet ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>
                {errorText || 'Ambassador confirmation is unavailable.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                  <View style={styles.heroWalletBlock}>
                    <Text style={styles.heroWalletName}>{wallet.name}</Text>
                    <Text style={styles.heroFromLabel}>WALLET</Text>
                    <Text style={styles.heroFromAddress}>{wallet.address}</Text>
                  </View>
                </View>

                <View style={styles.heroSlugBlock}>
                  <Text style={styles.heroSlugLabel}>AMBASSADOR SLUG</Text>
                  <Text style={styles.heroSlug}>{requestedSlug}</Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.primaryButton, isApproveDisabled && styles.primaryButtonDisabled]}
                onPress={() => void handleApprove('burn')}
                disabled={isApproveDisabled}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>BURN OWN TRX & REGISTER</Text>
                )}
              </TouchableOpacity>

              <EnergyResaleCard
                quote={energyResaleQuote}
                processing={submitting && pendingApprovalMode === 'rent'}
                disabled={isRentApproveDisabled}
                actionLabel="REGISTER"
                onRent={() => void handleApprove('rent')}
              />

              <View style={styles.detailCard}>
                <DetailRow label="Access" value={formatWalletAccessLabel(wallet.kind)} />
                <DetailRow label="Action" value="registerAsAmbassador" />
                <DetailRow label="Controller" value={shortenAddress(REGISTRATION_CONTROLLER_ADDRESS)} />
                <DetailRow label="Slug Hash" value={shortenMiddle(slugHash)} accent />
                <DetailRow label="Meta Hash" value={shortenMiddle(ZERO_META_HASH)} />
                <DetailRow label="Slug Check" value={slugAvailable ? 'Available' : 'Unavailable'} accent={slugAvailable} />
                <DetailRow label="Resource Note" value="~98K Energy / ~345 Bandwidth" accent />
                {energyQuote ? (
                  <>
                    <DetailRow
                      label="Rental Mode"
                      value={String(energyQuote.mode || 'api').toUpperCase()}
                      accent
                    />
                    <DetailRow label="Rental Energy" value={`${energyQuote.energyQuantity.toLocaleString('en-US')} Energy`} accent />
                    <DetailRow label="Rental Payment" value={`${energyQuote.amountTrx} TRX`} accent />
                    <DetailRow label="Rental Receiver" value={shortenAddress(energyQuote.paymentAddress)} />
                  </>
                ) : null}
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoRowText}>
                  This is an on-chain registration. The wallet signs the controller call first,
                  then the backend completes the slug mapping after the transaction is accepted.
                </Text>
              </View>

              {energyRentalText ? (
                <View style={styles.energyRentalStatusCard}>
                  <Text style={styles.energyRentalStatusText}>{energyRentalText}</Text>
                </View>
              ) : null}

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
                  <Text style={ui.eyebrow}>AMBASSADOR</Text>

                  <Text style={styles.authTitle}>
                    Confirm with <Text style={styles.authTitleAccent}>Passcode</Text>
                  </Text>

                  <Text style={styles.authLead}>
                    Authorize {pendingApprovalMode === 'rent' ? 'Energy rental and ambassador registration' : 'ambassador registration'} with your 6-digit passcode
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
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => void handleApprove(pendingApprovalMode)}
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

function DetailRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, accent ? styles.detailValueAccent : null]} numberOfLines={2}>
        {value}
      </Text>
    </View>
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
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 22,
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  heroWalletBlock: {
    flex: 1,
    gap: 4,
  },
  heroWalletName: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 23,
    fontFamily: 'Sora_700Bold',
  },
  heroFromLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },
  heroFromAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
  },
  heroSlugBlock: {
    gap: 7,
  },
  heroSlugLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.5,
  },
  heroSlug: {
    color: colors.green,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: 'Sora_700Bold',
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    ...ui.actionLabel,
    color: colors.white,
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
    color: colors.textSoft,
  },
  energyRentButton: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(24,224,58,0.28)',
    backgroundColor: 'rgba(24,224,58,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 16,
  },
  energyRentButtonText: {
    ...ui.actionLabel,
    color: colors.white,
  },
  energyRentalStatusCard: {
    marginTop: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  energyRentalStatusText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  detailCard: {
    marginTop: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    overflow: 'hidden',
  },
  detailRow: {
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
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
