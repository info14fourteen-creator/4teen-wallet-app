import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n, useLocaleLayout } from '../src/i18n';
import NumericKeypad from '../src/ui/numeric-keypad';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { setPasscodeDraft, verifyPasscode } from '../src/security/local-auth';
import { BackspaceIcon } from '../src/ui/ui-icons';
import { useNavigationInsets } from '../src/ui/navigation';
import ScreenBrow from '../src/ui/screen-brow';
import { useBottomInset } from '../src/ui/use-bottom-inset';

export default function CreatePasscodeScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const locale = useLocaleLayout();
  const params = useLocalSearchParams<{ next?: string; flow?: string }>();
  const nextPath = typeof params.next === 'string' ? params.next : '/import-wallet';
  const flow = typeof params.flow === 'string' ? params.flow : 'create-passcode';
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();

  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'verify-current' | 'create-new'>(
    flow === 'change-passcode' ? 'verify-current' : 'create-new'
  );

  const canContinue = useMemo(() => digits.length === 6, [digits]);
  const isChangeFlow = flow === 'change-passcode';
  const isVerifyCurrentStep = isChangeFlow && step === 'verify-current';

  const handleDigitPress = (digit: string) => {
    setError('');
    setDigits((prev) => {
      if (prev.length >= 6) return prev;
      return `${prev}${digit}`;
    });
  };

  const handleBackspace = () => {
    setError('');
    setDigits((prev) => prev.slice(0, -1));
  };

  const handleCancel = () => {
    router.replace(nextPath as any);
  };

  const handleContinue = async () => {
    if (!canContinue) return;

    if (isVerifyCurrentStep) {
      const ok = await verifyPasscode(digits);

      if (!ok) {
        setError(t('Wrong current passcode.'));
        setDigits('');
        return;
      }

      setDigits('');
      setError('');
      setStep('create-new');
      return;
    }

    setPasscodeDraft(digits);

    router.replace({
      pathname: '/confirm-passcode',
      params: {
        next: nextPath,
        flow,
      },
    } as any);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <Stack.Screen options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
      <View style={styles.screen}>
        <View style={[styles.content, { paddingTop: navInsets.top, paddingBottom: contentBottomInset }]}>
          <ScreenBrow label={isChangeFlow ? t('CHANGE PASSCODE') : t('CREATE PASSCODE')} rtl={locale.isRTL} />
          <Text style={[styles.title, locale.textStart]}>
            {isVerifyCurrentStep
              ? t('Confirm your current 6-digit passcode')
              : isChangeFlow
                ? t('Create a new 6-digit passcode')
                : t('Create a 6-digit passcode')}
          </Text>

          <Text style={[styles.lead, locale.textStart]}>
            {isVerifyCurrentStep
              ? t('Enter your current 6-digit passcode before setting a new one.')
              : isChangeFlow
              ? t('Set the new 6-digit passcode that will protect this app.')
              : t('Signing wallets should not be imported into an unprotected local shell. Set a passcode first, then continue.')}
          </Text>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={[ui.sectionEyebrow, locale.textStart]}>
                {isVerifyCurrentStep ? t('Current passcode') : t('Passcode')}
              </Text>
              <Text style={[styles.cardHeaderErrorText, locale.textStart]} numberOfLines={1}>
                {error || ' '}
              </Text>
            </View>

            <View style={styles.dotsRow}>
              {Array.from({ length: 6 }, (_, index) => (
                <View
                  key={index}
                  style={[styles.dot, digits.length > index && styles.dotFilled]}
                />
              ))}
            </View>
          </View>

          <NumericKeypad
            onDigitPress={handleDigitPress}
            onBackspacePress={digits.length === 0 ? handleCancel : handleBackspace}
            backspaceIcon={
              digits.length === 0 ? (
                <Text style={styles.cancelKeyText}>{t('CANCEL')}</Text>
              ) : (
                <BackspaceIcon width={22} height={22} />
              )
            }
          />

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
            disabled={!canContinue}
            onPress={() => void handleContinue()}
          >
            <Text style={[ui.buttonLabel, !canContinue && styles.primaryButtonTextDisabled]}>
              {isVerifyCurrentStep ? t('Verify Current Passcode') : t('Continue')}
            </Text>
          </TouchableOpacity>
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
  },

  content: {
    flex: 1,
    paddingBottom: spacing[7],
  },

  title: {
    marginTop: 0,
    color: colors.white,
    fontSize: 34,
    lineHeight: 40,
    fontFamily: 'Sora_700Bold',
    maxWidth: '96%',
    minHeight: 80,
  },

  titleAccent: {
    color: colors.accent,
    fontFamily: 'Sora_700Bold',
  },

  lead: {
    ...ui.lead,
    marginTop: 14,
    marginBottom: 22,
    minHeight: 56,
  },

  card: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 20,
  },

  cardHeaderRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  cardHeaderErrorText: {
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

  primaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 'auto',
  },

  primaryButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  primaryButtonTextDisabled: {
    color: colors.textDim,
  },

  cancelKeyText: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.8,
  },
});
