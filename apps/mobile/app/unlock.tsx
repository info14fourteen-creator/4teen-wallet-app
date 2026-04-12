import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';

import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import {
  getBiometricsEnabled,
  verifyPasscode,
} from '../src/security/local-auth';

import BioLoginIcon from '../assets/icons/ui/biologin_btn.svg';
import BackspaceIcon from '../assets/icons/ui/backspace_btn.svg';

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'BIO', '0', 'DELETE'] as const;

export default function UnlockScreen() {
  const router = useRouter();

  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricsLabel, setBiometricsLabel] = useState('Biometrics');
  const [submitting, setSubmitting] = useState(false);

  const full = useMemo(() => digits.length === 6, [digits]);

  const loadBiometricsState = useCallback(async () => {
    try {
      const enabled = await getBiometricsEnabled();
      setBiometricsEnabled(enabled);

      const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

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
      setBiometricsLabel('Biometrics');
    }
  }, []);

  useEffect(() => {
    void loadBiometricsState();
  }, [loadBiometricsState]);

  const handlePasscodeSubmit = useCallback(async () => {
    if (submitting || digits.length !== 6) return;

    try {
      setSubmitting(true);
      const ok = await verifyPasscode(digits);

      if (!ok) {
        setError('Wrong passcode.');
        setDigits('');
        return;
      }

      router.replace('/home');
    } catch (error) {
      console.error(error);
      setError('Failed to verify passcode.');
      setDigits('');
    } finally {
      setSubmitting(false);
    }
  }, [digits, router, submitting]);

  useEffect(() => {
    if (full) {
      void handlePasscodeSubmit();
    }
  }, [full, handlePasscodeSubmit]);

  const handleBiometricUnlock = useCallback(async () => {
    if (!biometricsEnabled || submitting) return;

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Wallet',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
      });

      if (!result.success) return;

      router.replace('/home');
    } catch (error) {
      console.error(error);
    }
  }, [biometricsEnabled, router, submitting]);

  const handleKeyPress = useCallback(
    (key: (typeof KEYPAD)[number]) => {
      if (submitting) return;

      setError('');

      if (key === 'DELETE') {
        setDigits((prev) => prev.slice(0, -1));
        return;
      }

      if (key === 'BIO') {
        void handleBiometricUnlock();
        return;
      }

      setDigits((prev) => {
        if (prev.length >= 6) return prev;
        return `${prev}${key}`;
      });
    },
    [handleBiometricUnlock, submitting]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.content}>
          <Text style={ui.eyebrow}>Wallet Locked</Text>

          <Text style={styles.title}>
            Unlock with <Text style={styles.titleAccent}>Passcode</Text>
          </Text>

          <Text style={styles.lead}>
            This app is protected. Enter your 6-digit passcode or use {biometricsLabel.toLowerCase()} if enabled.
          </Text>

          <View style={styles.card}>
            <Text style={ui.sectionEyebrow}>Unlock</Text>

            <View style={styles.dotsRow}>
              {Array.from({ length: 6 }, (_, index) => (
                <View
                  key={index}
                  style={[styles.dot, digits.length > index && styles.dotFilled]}
                />
              ))}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <View style={styles.keypad}>
            {KEYPAD.map((key, index) => {
              const disabledBio = key === 'BIO' && !biometricsEnabled;
              const disabled = disabledBio || submitting;

              return (
                <TouchableOpacity
                  key={`${key}-${index}`}
                  activeOpacity={0.9}
                  style={[styles.key, disabled && styles.keyDisabled]}
                  onPress={() => handleKeyPress(key)}
                  disabled={disabled}
                >
                  {key === 'BIO' ? (
                    <BioLoginIcon width={22} height={22} />
                  ) : key === 'DELETE' ? (
                    <BackspaceIcon width={22} height={22} />
                  ) : (
                    <Text style={styles.keyText}>{key}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
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

  card: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 20,
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

  errorText: {
    marginTop: 16,
    color: colors.red,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },

  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },

  key: {
    width: '30.5%',
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  keyDisabled: {
    opacity: 0.4,
  },

  keyText: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: 'Sora_700Bold',
  },
});
