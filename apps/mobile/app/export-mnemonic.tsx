import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenBrow from '../src/ui/screen-brow';
import InfoToggleIcon from '../src/ui/info-toggle-icon';
import NumericKeypad from '../src/ui/numeric-keypad';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useNavigationInsets } from '../src/ui/navigation';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { colors, layout, radius } from '../src/theme/tokens';
import { useNotice } from '../src/notice/notice-provider';
import { ui } from '../src/theme/ui';
import {
  getBiometricsEnabled,
  verifyPasscode,
} from '../src/security/local-auth';
import {
  canWalletExposeMnemonic,
  getActiveWallet,
  getWalletById,
  getWalletSecret,
  type WalletMeta,
} from '../src/services/wallet/storage';
import { useWalletSession } from '../src/wallet/wallet-session';
import { BackspaceIcon, BioLoginIcon } from '../src/ui/ui-icons';

type ExportState = {
  wallet: WalletMeta;
  words: string[];
};

const REVEAL_TIMEOUT_MS = 60_000;
const SCREEN_CAPTURE_GUARD_KEY = 'export-mnemonic-revealed';
const EXPORT_INFO_TITLE = 'How seed phrase export works';
const EXPORT_INFO_TEXT =
  'This screen reveals the recovery phrase stored locally for this wallet. The phrase is never sent to 4TEEN servers during export.\n\nBefore the words are shown, the app requires passcode or biometrics. While the phrase is visible, screenshots are blocked and it hides automatically after one minute or when the app leaves the foreground.\n\nAnyone with these words can control the wallet. Copy them only if you are storing the phrase offline and securely.';

function canExportMnemonic(wallet: WalletMeta, mnemonic: string) {
  if (!canWalletExposeMnemonic(wallet)) return false;
  if (!mnemonic.trim()) return false;
  return true;
}

function resolveBiometricPromptLabel(label: string) {
  if (label === 'Face ID') return 'face unlock';
  if (label === 'Fingerprint') return 'fingerprint';
  return 'biometrics';
}

export default function ExportMnemonicScreen() {
  const notice = useNotice();
  const params = useLocalSearchParams<{ walletId?: string }>();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();
  const { setChromeHidden } = useWalletSession();
  const authBiometricRequestedRef = useRef(false);
  const screenCaptureActiveRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [state, setState] = useState<ExportState | null>(null);
  const [errorText, setErrorText] = useState('');
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeDigits, setPasscodeDigits] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');

  useChromeLoading(loading);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');
      setRevealed(false);

      const requestedWalletId =
        typeof params.walletId === 'string' ? params.walletId.trim() : '';
      const wallet = requestedWalletId
        ? await getWalletById(requestedWalletId)
        : await getActiveWallet();

      if (!wallet) {
        throw new Error('No active wallet found.');
      }

      const secret = await getWalletSecret(wallet.id);
      const mnemonic = String(secret?.mnemonic || '').trim();
      const words = mnemonic.split(/\s+/).filter(Boolean);

      if (!canExportMnemonic(wallet, mnemonic) || !words.length) {
        throw new Error(
          'Seed phrase export is available only for wallets created in 4TEEN or restored from a seed phrase.'
        );
      }

      setState({
        wallet,
        words,
      });
    } catch (error) {
      console.error(error);
      setState(null);
      setErrorText(error instanceof Error ? error.message : 'Failed to load seed phrase.');
    } finally {
      setLoading(false);
    }
  }, [params.walletId]);

  const loadBiometricsState = useCallback(async () => {
    try {
      const enabled = await getBiometricsEnabled();
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

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
    return () => {
      setChromeHidden(false);
    };
  }, [setChromeHidden]);

  const lockScreenCapture = useCallback(async () => {
    if (!ScreenCapture.preventScreenCaptureAsync) {
      return false;
    }

    try {
      await ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_GUARD_KEY);
      screenCaptureActiveRef.current = true;
      return true;
    } catch {
      screenCaptureActiveRef.current = false;
      return false;
    }
  }, []);

  const unlockScreenCapture = useCallback(() => {
    if (!screenCaptureActiveRef.current) return;

    screenCaptureActiveRef.current = false;

    ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_GUARD_KEY).catch((error) => {
      console.error('Failed to unblock screen capture:', error);
    });
  }, []);

  const revealPhraseSecurely = useCallback(async () => {
    const locked = await lockScreenCapture();

    if (!locked) {
      setRevealed(false);
      notice.showErrorNotice(
        'Secure screen protection is not available in this build. Rebuild the app before exporting the seed phrase.',
        7000
      );
      return false;
    }

    setRevealed(true);
    notice.showSuccessNotice('Seed phrase unlocked.', 1800);
    return true;
  }, [lockScreenCapture, notice]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        setRevealed(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!revealed) {
      return undefined;
    }

    let active = true;

    const screenshotSubscription =
      ScreenCapture.addScreenshotListener?.(() => {
        if (!active) return;

        setRevealed(false);
        notice.showErrorNotice('Seed phrase hidden after screenshot attempt.', 3600);
      }) ?? null;

    const timeoutId = setTimeout(() => {
      if (!active) return;

      setRevealed(false);
      notice.showNeutralNotice('Seed phrase hidden after 60 seconds.', 3000);
    }, REVEAL_TIMEOUT_MS);

    return () => {
      active = false;
      clearTimeout(timeoutId);
      screenshotSubscription?.remove();
      unlockScreenCapture();
    };
  }, [notice, revealed, unlockScreenCapture]);

  const requestBiometricReveal = useCallback(async () => {
    if (!state || !biometricAvailable || revealed) return false;

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Reveal seed phrase',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use Passcode',
      });

      if (!result.success) return false;

      setPasscodeOpen(false);
      setPasscodeDigits('');
      setPasscodeError('');
      return await revealPhraseSecurely();
    } catch (error) {
      console.error(error);
      return false;
    }
  }, [biometricAvailable, revealPhraseSecurely, revealed, state]);

  const handleReveal = useCallback(() => {
    if (!state) return;

    authBiometricRequestedRef.current = false;
    setPasscodeDigits('');
    setPasscodeError('');
    setPasscodeOpen(true);
  }, [state]);

  useEffect(() => {
    if (!passcodeOpen || revealed || !biometricAvailable) return;
    if (authBiometricRequestedRef.current) return;

    authBiometricRequestedRef.current = true;
    void requestBiometricReveal();
  }, [biometricAvailable, passcodeOpen, requestBiometricReveal, revealed]);

  const handlePasscodeSubmit = useCallback(async () => {
    if (passcodeDigits.length !== 6) return;

    try {
      const ok = await verifyPasscode(passcodeDigits);
      if (!ok) {
        setPasscodeError('Wrong passcode.');
        setPasscodeDigits('');
        return;
      }

      setPasscodeOpen(false);
      setPasscodeDigits('');
      setPasscodeError('');
      await revealPhraseSecurely();
    } catch (error) {
      console.error(error);
      setPasscodeError('Failed to verify passcode.');
      setPasscodeDigits('');
    }
  }, [passcodeDigits, revealPhraseSecurely]);

  useEffect(() => {
    if (passcodeOpen && passcodeDigits.length === 6) {
      void handlePasscodeSubmit();
    }
  }, [handlePasscodeSubmit, passcodeDigits, passcodeOpen]);

  const handleCopy = useCallback(async () => {
    if (!state || !revealed) return;
    await Clipboard.setStringAsync(state.words.join(' '));
    notice.showSuccessNotice('Seed phrase copied. Keep it offline.', 2200);
  }, [notice, revealed, state]);

  const handleHide = useCallback(() => {
    setRevealed(false);
    notice.showNeutralNotice('Seed phrase hidden.', 1800);
  }, [notice]);

  const walletLabel = state?.wallet.name || 'Seed Phrase';
  const maskedWords = useMemo(() => {
    return state?.words.map(() => '••••') ?? [];
  }, [state]);

  if (loading) {
    return <ScreenLoadingState label="Loading seed phrase..." />;
  }

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['left', 'right']}>
        <View style={styles.screen}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              {
                paddingTop: navInsets.top,
                paddingBottom: contentBottomInset,
              },
            ]}
            showsVerticalScrollIndicator={false}
            bounces
          >
            <ScreenBrow
              label="EXPORT SEED PHRASE"
              variant="backLink"
              onLabelPress={() => setInfoExpanded((prev) => !prev)}
              labelAccessory={<InfoToggleIcon expanded={infoExpanded} />}
            />

            {infoExpanded ? (
              <View style={styles.infoPanel}>
                <Text style={styles.infoTitle}>{EXPORT_INFO_TITLE}</Text>
                <Text style={styles.infoText}>{EXPORT_INFO_TEXT}</Text>
              </View>
            ) : null}

            {errorText ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Unavailable</Text>
                <Text style={styles.errorBody}>{errorText}</Text>
              </View>
            ) : null}

            {state ? (
              <>
                <View style={styles.warningCard}>
                  <Text style={ui.sectionEyebrow}>Before you reveal</Text>
                  <Text style={styles.warningBody}>
                    Anyone with these words can move the funds. 4TEEN will never ask for them.
                    Write them down offline, verify every word, then hide the phrase.
                  </Text>
                </View>

                <View style={styles.wordsCard}>
                  <View style={styles.wordsHeader}>
                    <Text style={ui.sectionEyebrow}>Recovery Phrase</Text>
                    <Text style={styles.wordsCount}>{state.words.length} words</Text>
                  </View>

                  <View style={styles.walletRow}>
                    <Text style={styles.walletLabel}>Wallet</Text>
                    <Text style={styles.walletValue}>{walletLabel}</Text>
                  </View>

                  <View style={styles.wordsGrid}>
                    {(revealed ? state.words : maskedWords).map((word, index) => (
                      <View
                        key={`${index + 1}-${word}`}
                        style={styles.wordCell}
                      >
                        <Text style={styles.wordIndex}>{index + 1}</Text>
                        <Text style={styles.wordValue}>{word}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {revealed ? (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[styles.primaryButton, styles.actionButtonFlex]}
                      onPress={handleCopy}
                    >
                      <Text style={styles.primaryButtonText}>COPY PHRASE</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[styles.secondaryButton, styles.actionButtonFlex]}
                      onPress={handleHide}
                    >
                      <Text style={styles.secondaryButtonText}>HIDE</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity activeOpacity={0.9} style={styles.primaryButton} onPress={() => void handleReveal()}>
                    <Text style={styles.primaryButtonText}>REVEAL PHRASE</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : null}
          </ScrollView>
        </View>
      </SafeAreaView>

      <Modal
        visible={passcodeOpen}
        animationType="fade"
        presentationStyle="fullScreen"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => {
          setPasscodeOpen(false);
          setPasscodeDigits('');
          setPasscodeError('');
        }}
      >
        <SafeAreaView style={styles.authModalSafe} edges={['top', 'bottom']}>
          <View style={styles.authOverlay}>
            <View style={styles.authScreen}>
              <View style={styles.authContent}>
                <Text style={ui.eyebrow}>Seed Phrase Export</Text>

                <Text style={styles.authTitle}>
                  Confirm with <Text style={styles.authTitleAccent}>Passcode</Text>
                </Text>

                <Text style={styles.authLead}>
                  This unlocks the wallet root key locally. Confirm with your 6-digit passcode
                  {biometricAvailable
                    ? ` or ${resolveBiometricPromptLabel(biometricLabel)}`
                    : ''}
                  ; nothing is sent to 4TEEN servers.
                </Text>

                <View style={styles.authPasscodeCard}>
                  <View style={styles.authCardHeaderRow}>
                    <Text style={ui.sectionEyebrow}>Reveal Seed Phrase</Text>
                    <Text style={styles.authCardErrorText} numberOfLines={1}>
                      {passcodeError || ' '}
                    </Text>
                  </View>

                  <View style={styles.dotsRow}>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <View
                        key={index}
                        style={[styles.dot, passcodeDigits.length > index && styles.dotFilled]}
                      />
                    ))}
                  </View>
                </View>

                <NumericKeypad
                  onDigitPress={(digit: string) => {
                    setPasscodeError('');
                    setPasscodeDigits((prev) => (prev.length >= 6 ? prev : `${prev}${digit}`));
                  }}
                  onBackspacePress={() => {
                    setPasscodeError('');
                    setPasscodeDigits((prev) => prev.slice(0, -1));
                  }}
                  leftSlot={
                    biometricAvailable ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.specialKey}
                        onPress={() => void requestBiometricReveal()}
                      >
                        <BioLoginIcon width={22} height={22} />
                      </TouchableOpacity>
                    ) : null
                  }
                  backspaceIcon={<BackspaceIcon width={22} height={22} />}
                />

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.cancelButton}
                  onPress={() => {
                    setPasscodeOpen(false);
                    setPasscodeDigits('');
                    setPasscodeError('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
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
    gap: 0,
  },

  infoPanel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
    marginBottom: 16,
  },

  infoTitle: {
    ...ui.bodyStrong,
  },

  infoText: {
    ...ui.body,
    lineHeight: 25,
  },

  errorCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
    marginBottom: 14,
  },

  errorTitle: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
  },

  errorBody: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_400Regular',
  },

  warningCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
    marginBottom: 14,
  },

  warningBody: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: 'Sora_400Regular',
  },

  wordsCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
    marginBottom: 14,
  },

  wordsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  wordsCount: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
  },

  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.lineSoft,
    paddingVertical: 12,
  },

  walletLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
  },

  walletValue: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'right',
  },

  wordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  wordCell: {
    minHeight: 46,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(10,10,10,0.74)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '48%',
  },

  wordIndex: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    minWidth: 20,
  },

  wordValue: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
    flex: 1,
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },

  actionButtonFlex: {
    flex: 1,
  },

  primaryButton: {
    minHeight: 54,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  primaryButtonText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  secondaryButton: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  secondaryButtonText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
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
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPaddingX,
  },

  authContent: {
    paddingBottom: 18,
  },

  authPasscodeCard: {
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.md,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 16,
    paddingBottom: 16,
    marginBottom: 20,
  },

  authCardHeaderRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  authCardErrorText: {
    flex: 1,
    color: colors.red,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'right',
  },

  authTitle: {
    marginTop: 8,
    color: colors.white,
    fontSize: 34,
    lineHeight: 40,
    fontFamily: 'Sora_700Bold',
    maxWidth: '96%',
  },

  authTitleAccent: {
    color: colors.accent,
    fontFamily: 'Sora_700Bold',
  },

  authLead: {
    ...ui.lead,
    marginTop: 14,
    marginBottom: 22,
  },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginTop: 18,
    marginBottom: 6,
  },

  dot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
  },

  dotFilled: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  specialKey: {
    width: '100%',
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelButtonText: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
});
