import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader from '../src/ui/app-header';
import {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header.constants';

import MenuSheet from '../src/ui/menu-sheet';
import NumericKeypad from '../src/ui/numeric-keypad';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { clearPasscodeDraft, getPasscodeDraft, savePasscode } from '../src/security/local-auth';
import BackspaceIcon from '../assets/icons/ui/backspace_btn.svg';

export default function ConfirmPasscodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const nextPath = typeof params.next === 'string' ? params.next : '/import-wallet';

  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const canContinue = useMemo(() => digits.length === 6, [digits]);

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

  const handleContinue = async () => {
    if (!canContinue) return;

    const original = getPasscodeDraft();

    if (!original || original.length !== 6) {
      setError('Passcode draft is missing. Start again.');
      return;
    }

    if (original !== digits) {
      setError('Passcodes do not match.');
      setDigits('');
      return;
    }

    await savePasscode(digits);
    clearPasscodeDraft();

    router.replace({
      pathname: '/enable-biometrics',
      params: {
        next: nextPath,
      },
    } as any);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} />
        </View>

        <View style={styles.content}>

          <Text style={styles.title}>
            Confirm your <Text style={styles.titleAccent}>passcode</Text>
          </Text>

          <Text style={styles.lead}>
            Enter the same 6 digits again. If they do not match, we reset the confirm step.
          </Text>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={ui.sectionEyebrow}>Confirm</Text>
              <Text style={styles.cardHeaderErrorText} numberOfLines={1}>
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
            onBackspacePress={handleBackspace}
            backspaceIcon={<BackspaceIcon width={22} height={22} />}
          />

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
            disabled={!canContinue}
            onPress={handleContinue}
          >
            <Text style={[ui.buttonLabel, !canContinue && styles.primaryButtonTextDisabled]}>
              Save Passcode
            </Text>
          </TouchableOpacity>
        </View>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
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
    paddingTop: APP_HEADER_TOP_PADDING,
  },

  headerSlot: {
    height: APP_HEADER_HEIGHT,
    justifyContent: 'center',
  },

  content: {
    flex: 1,
    paddingTop: 14,
    paddingBottom: spacing[7],
  },

  title: {
    marginTop: 8,
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
});
