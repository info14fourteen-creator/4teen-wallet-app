import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenBrow from '../src/ui/screen-brow';
import NumericKeypad from '../src/ui/numeric-keypad';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useNavigationInsets } from '../src/ui/navigation';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { colors, layout, radius } from '../src/theme/tokens';
import { useNotice } from '../src/notice/notice-provider';
import {
  getBiometricsEnabled,
  verifyPasscode,
} from '../src/security/local-auth';
import {
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

  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [state, setState] = useState<ExportState | null>(null);
  const [errorText, setErrorText] = useState('');
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeDigits, setPasscodeDigits] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');

  useChromeLoading(loading);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');

      const requestedWalletId =
        typeof params.walletId === 'string' ? params.walletId.trim() : '';
      const wallet = requestedWalletId
        ? await getWalletById(requestedWalletId)
        : await getActiveWallet();

      if (!wallet) {
        throw new Error('No active wallet found.');
      }

      if (wallet.kind !== 'mnemonic') {
        throw new Error('This wallet has no seed phrase to export.');
      }

      const secret = await getWalletSecret(wallet.id);
      const mnemonic = String(secret?.mnemonic || '').trim();
      const words = mnemonic.split(/\s+/).filter(Boolean);

      if (!words.length) {
        throw new Error('Seed phrase is missing for this wallet.');
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

  const handleReveal = useCallback(async () => {
    if (!state) return;

    try {
      if (biometricAvailable) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Reveal seed phrase',
          cancelLabel: 'Cancel',
          fallbackLabel: 'Use passcode',
          disableDeviceFallback: true,
        });

        if (result.success) {
          setRevealed(true);
          notice.showSuccessNotice('Seed phrase unlocked.', 1800);
          return;
        }
      }

      setPasscodeDigits('');
      setPasscodeError('');
      setPasscodeOpen(true);
    } catch (error) {
      console.error(error);
      setPasscodeDigits('');
      setPasscodeError('');
      setPasscodeOpen(true);
    }
  }, [biometricAvailable, notice, state]);

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
      setRevealed(true);
      notice.showSuccessNotice('Seed phrase unlocked.', 1800);
    } catch (error) {
      console.error(error);
      setPasscodeError('Failed to verify passcode.');
      setPasscodeDigits('');
    }
  }, [notice, passcodeDigits]);

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

  const walletLabel = state?.wallet.name || 'Seed Phrase';
  const wordColumns = state?.words.length === 24 ? 2 : 2;
  const maskedWords = useMemo(() => {
    return state?.words.map(() => '••••') ?? [];
  }, [state]);

  if (loading) {
    return <ScreenLoadingState />;
  }

  return (
    <>
      <SafeAreaView style={styles.screen}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: navInsets.top,
              paddingBottom: Math.max(contentBottomInset, 28),
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <ScreenBrow label="EXPORT SEED PHRASE" variant="back" />

          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>Wallet</Text>
            <Text style={styles.heroTitle}>{walletLabel}</Text>
            <Text style={styles.heroBody}>
              This phrase gives full control over the wallet. Reveal it only in private and never
              share screenshots or cloud copies.
            </Text>
          </View>

          {errorText ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Unavailable</Text>
              <Text style={styles.errorBody}>{errorText}</Text>
            </View>
          ) : null}

          {state ? (
            <>
              <View style={styles.warningCard}>
                <Text style={styles.warningEyebrow}>Warning</Text>
                <Text style={styles.warningBody}>
                  Anyone with this phrase can drain the wallet. Store it offline and verify every
                  word before leaving this screen.
                </Text>
              </View>

              <View style={styles.wordsCard}>
                <View style={styles.wordsHeader}>
                  <Text style={styles.wordsTitle}>Seed Phrase</Text>
                  <Text style={styles.wordsCount}>{state.words.length} words</Text>
                </View>

                <View style={styles.wordsGrid}>
                  {(revealed ? state.words : maskedWords).map((word, index) => (
                    <View
                      key={`${index + 1}-${word}`}
                      style={[
                        styles.wordCell,
                        wordColumns === 2 ? styles.wordCellHalf : styles.wordCellFull,
                      ]}
                    >
                      <Text style={styles.wordIndex}>{index + 1}</Text>
                      <Text style={styles.wordValue}>{word}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {revealed ? (
                <TouchableOpacity activeOpacity={0.9} style={styles.primaryButton} onPress={handleCopy}>
                  <Text style={styles.primaryButtonText}>Copy Seed Phrase</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity activeOpacity={0.9} style={styles.primaryButton} onPress={() => void handleReveal()}>
                  <Text style={styles.primaryButtonText}>Reveal Seed Phrase</Text>
                </TouchableOpacity>
              )}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={passcodeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPasscodeOpen(false);
          setPasscodeDigits('');
          setPasscodeError('');
        }}
      >
        <View style={styles.authOverlay}>
          <View style={styles.authCard}>
            <View style={styles.authHeaderRow}>
              <Text style={styles.authTitle}>Unlock</Text>
              <Text style={styles.authError}>{passcodeError || ' '}</Text>
            </View>

            <Text style={styles.authBody}>
              Authorize seed phrase export with your 6-digit passcode
              {biometricAvailable
                ? ` or ${resolveBiometricPromptLabel(biometricLabel)}`
                : ''}
              .
            </Text>

            <View style={styles.dotsRow}>
              {Array.from({ length: 6 }).map((_, index) => (
                <View key={index} style={[styles.dot, passcodeDigits.length > index && styles.dotFilled]} />
              ))}
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
                    onPress={() => void handleReveal()}
                  >
                    <BioLoginIcon width={22} height={22} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.specialSpacer} />
                )
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
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    paddingHorizontal: layout.screenPaddingX,
    gap: 14,
  },

  heroCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.22)',
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },

  heroEyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
  },

  heroTitle: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'Sora_700Bold',
  },

  heroBody: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Sora_400Regular',
  },

  errorCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
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
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
  },

  warningEyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
  },

  warningBody: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
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
  },

  wordsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  wordsTitle: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },

  wordsCount: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
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
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  wordCellHalf: {
    width: '48%',
  },

  wordCellFull: {
    width: '100%',
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

  authOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPaddingX,
  },

  authCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 16,
  },

  authHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },

  authTitle: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: 'Sora_700Bold',
  },

  authError: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'right',
    minHeight: 16,
  },

  authBody: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Sora_400Regular',
  },

  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'transparent',
  },

  dotFilled: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  specialKey: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },

  specialSpacer: {
    width: 52,
    height: 52,
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
