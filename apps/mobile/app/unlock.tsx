import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';

import { translateNow, useI18n } from '../src/i18n';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import {
  getBiometricsStatus,
  verifyPasscode,
} from '../src/security/local-auth';
import { releaseLockOverlay } from '../src/security/lock-overlay';
import { useWalletSession } from '../src/wallet/wallet-session';
import { BackspaceIcon } from '../src/ui/ui-icons';
import LottieIcon from '../src/ui/lottie-icon';
import NumericKeypad from '../src/ui/numeric-keypad';

const UNLOCK_BIOMETRIC_FINGERPRINT_SOURCE = require('../assets/icons/ui/unlock_biometric_fingerprint.json');
const UNLOCK_BIOMETRIC_FACEID_SOURCE = require('../assets/icons/ui/unlock_biometric_faceid.json');

function UnlockBiometricLoopButton({
  disabled,
  onPress,
}: {
  disabled: boolean;
  onPress: () => void;
}) {
  const [activeIcon, setActiveIcon] = useState<'fingerprint' | 'faceid'>('fingerprint');
  const [playToken, setPlayToken] = useState(1);

  useEffect(() => {
    setActiveIcon('fingerprint');
    setPlayToken(1);
  }, []);

  const handleAnimationFinish = useCallback((isCancelled: boolean) => {
    if (isCancelled) {
      return;
    }

    setActiveIcon((current) => (current === 'fingerprint' ? 'faceid' : 'fingerprint'));
    setPlayToken((current) => current + 1);
  }, []);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={styles.specialKey}
      onPress={onPress}
      disabled={disabled}
    >
      <LottieIcon
        key={activeIcon}
        source={
          activeIcon === 'fingerprint'
            ? UNLOCK_BIOMETRIC_FINGERPRINT_SOURCE
            : UNLOCK_BIOMETRIC_FACEID_SOURCE
        }
        size={24}
        playToken={playToken}
        onAnimationFinish={handleAnimationFinish}
      />
    </TouchableOpacity>
  );
}

export default function UnlockScreen() {
  const router = useRouter();
  const { triggerNavigationIntro } = useWalletSession();
  const { t } = useI18n();
  const initialUnlockRequestedRef = useRef(false);

  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeDigits, setPasscodeDigits] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricsLabel, setBiometricsLabel] = useState(translateNow('Biometrics'));
  const [biometricsLoaded, setBiometricsLoaded] = useState(false);
  const [autoUnlockPending, setAutoUnlockPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadBiometricsState = useCallback(async () => {
    try {
      const status = await getBiometricsStatus();
      setBiometricsEnabled(status.enabled);
      setBiometricAvailable(status.available);
      setBiometricsLabel(status.label);
    } catch (error) {
      console.error(error);
      setBiometricsEnabled(false);
      setBiometricAvailable(false);
      setBiometricsLabel(translateNow('Biometrics'));
    } finally {
      setBiometricsLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      initialUnlockRequestedRef.current = false;
      setPasscodeDigits('');
      setPasscodeError('');
      setPasscodeOpen(false);
      setBiometricsLoaded(false);
      setAutoUnlockPending(true);
      void loadBiometricsState();
    }, [loadBiometricsState])
  );

  const handlePasscodeSubmit = useCallback(async () => {
    if (submitting || passcodeDigits.length !== 6) return;

    try {
      setSubmitting(true);
      const ok = await verifyPasscode(passcodeDigits);

      if (!ok) {
        setPasscodeError(t('Wrong passcode.'));
        setPasscodeDigits('');
        return;
      }

      triggerNavigationIntro();
      router.replace('/wallet');
    } catch (error) {
      console.error(error);
      setPasscodeError(t('Failed to verify passcode.'));
      setPasscodeDigits('');
    } finally {
      setSubmitting(false);
    }
  }, [passcodeDigits, router, submitting, t, triggerNavigationIntro]);

  useEffect(() => {
    if (passcodeOpen && passcodeDigits.length === 6) {
      void handlePasscodeSubmit();
    }
  }, [handlePasscodeSubmit, passcodeDigits.length, passcodeOpen]);

  const requestBiometricUnlock = useCallback(async (openPasscodeOnFallback = false) => {
    if (submitting) return;

    if (!biometricAvailable || !biometricsEnabled) {
      setAutoUnlockPending(false);
      if (openPasscodeOnFallback) {
        setPasscodeError('');
        setPasscodeDigits('');
        setPasscodeOpen(true);
      }
      return;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('Unlock Wallet'),
        fallbackLabel: t('Use Passcode'),
        cancelLabel: t('Cancel'),
      });

      if (result.success) {
        triggerNavigationIntro();
        router.replace('/wallet');
        return;
      }
    } catch (error) {
      console.error(error);
    }

    if (openPasscodeOnFallback) {
      setPasscodeError('');
      setPasscodeDigits('');
      setPasscodeOpen(true);
    }
    setAutoUnlockPending(false);
  }, [biometricAvailable, biometricsEnabled, router, submitting, t, triggerNavigationIntro]);

  useEffect(() => {
    if (!biometricsLoaded || initialUnlockRequestedRef.current) return;

    initialUnlockRequestedRef.current = true;
    if (biometricAvailable && biometricsEnabled) {
      setAutoUnlockPending(true);
      void requestBiometricUnlock(true);
      return;
    }

    setAutoUnlockPending(false);
    setPasscodeOpen(true);
  }, [biometricAvailable, biometricsEnabled, biometricsLoaded, requestBiometricUnlock]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      releaseLockOverlay();
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

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

  const handlePasscodeCancel = useCallback(() => {
    if (submitting) return;
    setPasscodeOpen(false);
    setPasscodeDigits('');
    setPasscodeError('');
  }, [submitting]);

  const handleOpenPasscode = useCallback(() => {
    if (submitting) return;
    setPasscodeError('');
    setPasscodeDigits('');
    setPasscodeOpen(true);
  }, [submitting]);

  const canUseBiometrics = biometricAvailable && biometricsEnabled;

  const biometricMethodText =
    biometricsLabel === t('Face ID')
      ? t('face unlock')
      : biometricsLabel === t('Fingerprint')
        ? t('fingerprint')
        : t('biometrics');

  const leadText = canUseBiometrics
    ? t('Authorize wallet access with your 6-digit passcode or use {{method}}.', {
        method: biometricMethodText,
      })
    : t('Authorize wallet access with your 6-digit passcode.');

  const backspaceIcon = <BackspaceIcon width={22} height={22} />;
  const bioSlot = canUseBiometrics ? (
    <UnlockBiometricLoopButton
      disabled={submitting}
      onPress={() => void requestBiometricUnlock(false)}
    />
  ) : null;

  const dots = Array.from({ length: 6 }, (_, index) => (
    <View
      key={index}
      style={[styles.dot, passcodeDigits.length > index && styles.dotFilled]}
    />
  ));

  const renderPasscodeCard = (
    <View style={styles.authCard}>
      <View style={styles.authCardHeaderRow}>
        <Text style={ui.sectionEyebrow}>{t('Unlock')}</Text>
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
          <Text style={ui.eyebrow}>{t('Wallet Approval')}</Text>

          <Text style={styles.title}>{t('Unlock with Passcode')}</Text>

          <Text style={styles.lead}>{leadText}</Text>

          {passcodeOpen ? (
            <>
              {renderPasscodeCard}

              <NumericKeypad
                onDigitPress={handleDigitPress}
                onBackspacePress={handleBackspace}
                leftSlot={bioSlot}
                backspaceIcon={backspaceIcon}
              />

              {canUseBiometrics ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.authCancelButton}
                  onPress={handlePasscodeCancel}
                  disabled={submitting}
                >
                  <Text style={styles.authCancelButtonText}>{t('CANCEL')}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : biometricsLoaded && !autoUnlockPending ? (
            <View style={styles.actionStack}>
              {canUseBiometrics ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.unlockButton}
                  onPress={() => void requestBiometricUnlock(true)}
                  disabled={submitting}
                >
                  <Text style={styles.unlockButtonText}>
                    {`${t('USE')} ${biometricsLabel.toUpperCase()}`}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.passcodeButton, !canUseBiometrics && styles.passcodeButtonPrimary]}
                onPress={handleOpenPasscode}
                disabled={submitting}
              >
                <Text
                  style={[
                    styles.passcodeButtonText,
                    !canUseBiometrics && styles.passcodeButtonTextPrimary,
                  ]}
                >
                  {t('ENTER PASSCODE')}
                </Text>
              </TouchableOpacity>
            </View>
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

  specialKey: {
    width: '100%',
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionStack: {
    gap: 12,
  },

  unlockButton: {
    minHeight: 54,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  unlockButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  passcodeButton: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  passcodeButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },

  passcodeButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  passcodeButtonTextPrimary: {
    color: colors.white,
  },

  authCancelButton: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  authCancelButtonText: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },
});
