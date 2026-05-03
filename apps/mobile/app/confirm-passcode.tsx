import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n, useLocaleLayout } from '../src/i18n';
import NumericKeypad from '../src/ui/numeric-keypad';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { clearPasscodeDraft, getPasscodeDraft, savePasscode } from '../src/security/local-auth';
import { BackspaceIcon } from '../src/ui/ui-icons';
import { useNotice } from '../src/notice/notice-provider';
import { useNavigationInsets } from '../src/ui/navigation';
import ScreenBrow from '../src/ui/screen-brow';
import { useBottomInset } from '../src/ui/use-bottom-inset';

export default function ConfirmPasscodeScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const locale = useLocaleLayout();
  const params = useLocalSearchParams<{ next?: string; flow?: string }>();
  const nextPath = typeof params.next === 'string' ? params.next : '/import-wallet';
  const flow = typeof params.flow === 'string' ? params.flow : 'create-passcode';
  const notice = useNotice();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();

  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');

  const canContinue = useMemo(() => digits.length === 6, [digits]);
  const isChangeFlow = flow === 'change-passcode';

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

    const original = getPasscodeDraft();

    if (!original || original.length !== 6) {
      setError(t('Passcode draft is missing. Start again.'));
      return;
    }

    if (original !== digits) {
      setError(t('Passcodes do not match.'));
      setDigits('');
      return;
    }

    await savePasscode(digits);
    clearPasscodeDraft();

    if (flow === 'change-passcode') {
      notice.showSuccessNotice(t('Passcode updated.'), 2200);
      router.replace(nextPath as any);
      return;
    }

    router.replace({
      pathname: '/enable-biometrics',
      params: {
        next: nextPath,
        flow: 'enable-biometrics',
      },
    } as any);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <Stack.Screen options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
      <View style={styles.screen}>
        <View style={[styles.content, { paddingTop: navInsets.top, paddingBottom: contentBottomInset }]}>
          <ScreenBrow label={isChangeFlow ? t('CHANGE PASSCODE') : t('CONFIRM PASSCODE')} rtl={locale.isRTL} />
          <Text style={[styles.title, locale.textStart]}>
            {isChangeFlow ? t('Confirm your new passcode') : t('Confirm your passcode')}
          </Text>

          <Text style={[styles.lead, locale.textStart]}>
            {isChangeFlow
              ? t('Enter the same new 6 digits again. If they do not match, the confirm step resets.')
              : t('Enter the same 6 digits again. If they do not match, we reset the confirm step.')}
          </Text>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={[ui.sectionEyebrow, locale.textStart]}>{t('Confirm')}</Text>
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
            onPress={handleContinue}
          >
            <Text style={[ui.buttonLabel, !canContinue && styles.primaryButtonTextDisabled]}>
              {t('Save Passcode')}
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
