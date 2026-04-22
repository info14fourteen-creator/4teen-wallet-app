import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';

import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import {
  getBiometricsEnabled,
  verifyPasscode,
} from '../src/security/local-auth';
import { useWalletSession } from '../src/wallet/wallet-session';
import { BackspaceIcon } from '../src/ui/ui-icons';
import NumericKeypad from '../src/ui/numeric-keypad';

export default function UnlockScreen() {
  const router = useRouter();
  const { triggerNavigationIntro } = useWalletSession();

  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeDigits, setPasscodeDigits] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricsLabel, setBiometricsLabel] = useState('Biometrics');
  const [biometricsLoaded, setBiometricsLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadBiometricsState = useCallback(async () => {
    try {
      const enabled = await getBiometricsEnabled();
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

      setBiometricsEnabled(enabled);
      setBiometricAvailable(enabled && compatible && enrolled);

      if (supported.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricsLabel('Face ID');
        return;
      }

      if (supported.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricsLabel('Fingerprint');
        return;
      }

      setBiometricsLabel('Biometrics');
    } catch (error) {
      console.error(error);
      setBiometricsEnabled(false);
      setBiometricAvailable(false);
      setBiometricsLabel('Biometrics');
    } finally {
      setBiometricsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadBiometricsState();
  }, [loadBiometricsState]);

  const handlePasscodeSubmit = useCallback(async () => {
    if (submitting || passcodeDigits.length !== 6) return;

    try {
      setSubmitting(true);
      const ok = await verifyPasscode(passcodeDigits);

      if (!ok) {
        setPasscodeError('Wrong passcode.');
        setPasscodeDigits('');
        return;
      }

      triggerNavigationIntro();
      router.replace('/wallet');
    } catch (error) {
      console.error(error);
      setPasscodeError('Failed to verify passcode.');
      setPasscodeDigits('');
    } finally {
      setSubmitting(false);
    }
  }, [passcodeDigits, router, submitting, triggerNavigationIntro]);

  useEffect(() => {
    if (passcodeOpen && passcodeDigits.length === 6) {
      void handlePasscodeSubmit();
    }
  }, [handlePasscodeSubmit, passcodeDigits.length, passcodeOpen]);

  const handleUnlockRequest = useCallback(async () => {
    if (submitting) return;

    if (biometricAvailable && biometricsEnabled) {
      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Wallet',
          fallbackLabel: 'Use Passcode',
          cancelLabel: 'Cancel',
        });

        if (result.success) {
          triggerNavigationIntro();
          router.replace('/wallet');
          return;
        }

      } catch (error) {
        console.error(error);
      }
    }

    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeOpen(true);
  }, [biometricAvailable, biometricsEnabled, router, submitting, triggerNavigationIntro]);

  useEffect(() => {
    if (!biometricsLoaded) return;
    if (passcodeOpen) return;

    void handleUnlockRequest();
  }, [biometricsLoaded, handleUnlockRequest, passcodeOpen]);

  const handleDigitPress = useCallback(
    (digit: string) => {
      if (submitting) return;
      setPasscodeError('');
      setPasscodeDigits((prev) => {
        if (prev.length >= 6) return prev;
        return `${prev}${digit}`;
      });
    },
    [submitting]
  );

  const handleBackspace = useCallback(() => {
    if (submitting) return;
    setPasscodeError('');
    setPasscodeDigits((prev) => prev.slice(0, -1));
  }, [submitting]);

  const canUseBiometrics = biometricAvailable && biometricsEnabled;

  const biometricMethodText =
    biometricsLabel === 'Face ID' ? 'face unlock' : biometricsLabel === 'Fingerprint' ? 'fingerprint' : 'biometrics';

  const leadText = `Authorize wallet access with your 6-digit passcode${
    canUseBiometrics ? ` or use ${biometricMethodText}.` : '.'
  }`;

  const backspaceIcon = <BackspaceIcon width={22} height={22} />;

  const dots = Array.from({ length: 6 }, (_, index) => (
    <View
      key={index}
      style={[styles.dot, passcodeDigits.length > index && styles.dotFilled]}
    />
  ));

  const renderPasscodeCard = (
    <View style={styles.authCard}>
      <View style={styles.authCardHeaderRow}>
        <Text style={ui.sectionEyebrow}>Unlock</Text>
        <Text style={styles.authCardErrorText} numberOfLines={1}>
          {passcodeError || ' '}
        </Text>
      </View>

      <View style={styles.dotsRow}>{dots}</View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.content}>
          <Text style={ui.eyebrow}>Wallet Approval</Text>

          <Text style={styles.title}>
            Confirm with <Text style={styles.titleAccent}>Passcode</Text>
          </Text>

          <Text style={styles.lead}>{leadText}</Text>

          {passcodeOpen ? (
            <>
              {renderPasscodeCard}

              <NumericKeypad
                onDigitPress={handleDigitPress}
                onBackspacePress={handleBackspace}
                backspaceIcon={backspaceIcon}
              />
            </>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000000',
  },

  screen: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: layout.screenPaddingX,
    justifyContent: 'center',
  },

  content: {
    paddingBottom: spacing[6],
  },

  title: {
    marginTop: 8,
    color: colors.white,
    fontSize: 34,
    lineHeight: 40,
    fontFamily: 'Sora_700Bold',
    maxWidth: '96%',
  },

  titleAccent: {
    color: colors.accent,
    fontFamily: 'Sora_700Bold',
  },

  lead: {
    ...ui.lead,
    marginTop: 14,
    marginBottom: 22,
  },

  authCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
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

});
