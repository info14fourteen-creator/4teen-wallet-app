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
import { setBiometricsEnabled } from '../src/security/local-auth';

export default function EnableBiometricsScreen() {
  const router = useRouter();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const params = useLocalSearchParams<{ next?: string }>();
  const nextPath = typeof params.next === 'string' ? params.next : '/import-wallet';

  const [supportedLabel, setSupportedLabel] = useState('Biometrics');
  const [available, setAvailable] = useState(false);
  const contentBottomInset = useBottomInset();

  useEffect(() => {
    void loadSupport();
  }, []);

  const loadSupport = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    setAvailable(compatible && enrolled);

    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      setSupportedLabel('Face ID');
      return;
    }

    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      setSupportedLabel('Fingerprint');
      return;
    }

    setSupportedLabel('Biometrics');
  };

  const handleEnable = async () => {
    if (!available) {
      await setBiometricsEnabled(false);
      router.replace(nextPath as any);
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Enable ${supportedLabel}`,
      fallbackLabel: 'Use Passcode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: true,
    });

    await setBiometricsEnabled(result.success);
    router.replace(nextPath as any);
  };

  const handleSkip = async () => {
    await setBiometricsEnabled(false);
    router.replace(nextPath as any);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <Stack.Screen options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
      <View style={styles.screen}>
        <View style={[styles.content, { paddingTop: navInsets.top, paddingBottom: contentBottomInset }]}>
          <ScreenBrow label="ENABLE BIOMETRICS" />
          <Text style={styles.title}>
            Enable <Text style={styles.titleAccent}>{supportedLabel}</Text>
          </Text>

          <Text style={styles.lead}>
            Biometrics can unlock the app faster after passcode setup.
          </Text>

          <View style={styles.card}>
            <Text style={ui.sectionEyebrow}>Status</Text>
            <Text style={styles.cardBody}>
              {available
                ? `${supportedLabel} is available on this device.`
                : 'Biometric authentication is not available or not enrolled on this device.'}
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity activeOpacity={0.9} style={styles.primaryButton} onPress={handleEnable}>
              <Text style={ui.buttonLabel}>
                {available ? `Enable ${supportedLabel}` : 'Continue Without Biometrics'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.9} style={styles.secondaryButton} onPress={handleSkip}>
              <Text style={ui.buttonLabel}>Skip for Now</Text>
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
