import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';

import { useNavigationInsets } from '../src/ui/navigation';
import ScreenBrow from '../src/ui/screen-brow';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { getBiometricsStatus, setBiometricsEnabled } from '../src/security/local-auth';
import { useNotice } from '../src/notice/notice-provider';
import { useI18n } from '../src/i18n';

export default function EnableBiometricsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const params = useLocalSearchParams<{ next?: string; flow?: string }>();
  const nextPath = typeof params.next === 'string' ? params.next : '/import-wallet';
  const flow = typeof params.flow === 'string' ? params.flow : 'enable-biometrics';
  const notice = useNotice();

  const [supportedLabel, setSupportedLabel] = useState(t('Biometrics'));
  const [available, setAvailable] = useState(false);
  const [compatible, setCompatible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const contentBottomInset = useBottomInset();

  useEffect(() => {
    void loadSupport();
  }, []);

  const loadSupport = async () => {
    const status = await getBiometricsStatus();
    setCompatible(status.compatible);
    setAvailable(status.available);
    setEnabled(status.enabled);
    setSupportedLabel(status.label);
  };

  const handleEnable = async () => {
    if (flow === 'disable-biometrics' || enabled) {
      await setBiometricsEnabled(false);
      notice.showSuccessNotice(t('{{label}} disabled.', { label: supportedLabel }), 2200);
      router.replace(nextPath as any);
      return;
    }

    if (!available) {
      notice.showNeutralNotice(
        compatible
          ? t('{{label}} is not enrolled on this device.', { label: supportedLabel })
          : t('{{label}} is not available on this device.', { label: supportedLabel }),
        2600
      );
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('Enable {{label}}', { label: supportedLabel }),
      fallbackLabel: t('Use Passcode'),
      cancelLabel: t('Cancel'),
    });

    if (result.success) {
      await setBiometricsEnabled(true);
      notice.showSuccessNotice(t('{{label}} enabled.', { label: supportedLabel }), 2200);
      router.replace(nextPath as any);
    } else {
      notice.showNeutralNotice(t('{{label}} was not enabled.', { label: supportedLabel }), 2200);
    }
  };

  const handleSkip = async () => {
    if (enabled || flow === 'disable-biometrics') {
      router.replace(nextPath as any);
      return;
    }

    await setBiometricsEnabled(false);
    router.replace(nextPath as any);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <Stack.Screen options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
      <View style={styles.screen}>
        <View style={[styles.content, { paddingTop: navInsets.top, paddingBottom: contentBottomInset }]}>
          <ScreenBrow label={t('ENABLE BIOMETRICS')} />
          <Text style={styles.title}>
            <Text style={styles.titleAccent}>
              {enabled || flow === 'disable-biometrics'
                ? t('Disable {{label}}', { label: supportedLabel })
                : t('Enable {{label}}', { label: supportedLabel })}
            </Text>
          </Text>

          <Text style={styles.lead}>
            {enabled || flow === 'disable-biometrics'
              ? t('Turn biometric unlock off and keep passcode-only protection.')
              : t('Biometrics can unlock the app faster after passcode setup.')}
          </Text>

          <View style={styles.card}>
            <Text style={ui.sectionEyebrow}>{t('Status')}</Text>
            <Text style={styles.cardBody}>
              {enabled
                ? t('{{label}} is currently enabled for this wallet shell.', { label: supportedLabel })
                : available
                  ? t('{{label}} is available on this device.', { label: supportedLabel })
                  : compatible
                    ? t('{{label}} is supported, but not enrolled on this device yet.', { label: supportedLabel })
                    : t('{{label}} is not available on this device.', { label: supportedLabel })}
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity activeOpacity={0.9} style={styles.primaryButton} onPress={handleEnable}>
              <Text style={ui.buttonLabel}>
                {enabled || flow === 'disable-biometrics'
                  ? t('Disable {{label}}', { label: supportedLabel })
                  : available
                    ? t('Enable {{label}}', { label: supportedLabel })
                    : t('Continue Without Biometrics')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.9} style={styles.secondaryButton} onPress={handleSkip}>
              <Text style={ui.buttonLabel}>
                {enabled || flow === 'disable-biometrics' ? t('Keep It On') : t('Skip for Now')}
              </Text>
            </TouchableOpacity>
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
  },

  content: {
    flex: 1,
    gap: 0,
  },

  title: {
    marginTop: 0,
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
    marginBottom: 18,
  },

  cardBody: {
    ...ui.body,
    marginTop: 10,
  },

  actions: {
    marginTop: 'auto',
    gap: 12,
  },

  primaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  secondaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});
