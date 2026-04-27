import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { ProductScreen } from '../src/ui/product-shell';
import { getBiometricsStatus, hasPasscode } from '../src/security/local-auth';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import SettingsRow from '../src/ui/settings-row';

type AuthStatus = {
  passcodeEnabled: boolean;
  biometricsEnabled: boolean;
  biometricsAvailable: boolean;
  biometricsLabel: string;
};

export default function AuthenticationMethodScreen() {
  const router = useRouter();

  const [status, setStatus] = useState<AuthStatus>({
    passcodeEnabled: false,
    biometricsEnabled: false,
    biometricsAvailable: false,
    biometricsLabel: 'Biometrics',
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadStatus = async () => {
        const [passcodeEnabled, biometrics] = await Promise.all([
          hasPasscode(),
          getBiometricsStatus(),
        ]);

        if (!cancelled) {
          setStatus({
            passcodeEnabled,
            biometricsEnabled: biometrics.enabled,
            biometricsAvailable: biometrics.available,
            biometricsLabel: biometrics.label,
          });
        }
      };

      void loadStatus();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <ProductScreen eyebrow="AUTHENTICATION METHOD" browVariant="back">
          <View style={styles.headerCard}>
            <Text style={styles.headerTitle}>App protection</Text>
            <Text style={styles.headerBody}>
              Manage the 6-digit passcode and biometric unlock flow used by this wallet.
            </Text>
          </View>

          <View style={styles.list}>
            <SettingsRow
              label="Passcode"
              value={status.passcodeEnabled ? 'Enabled' : 'Not set'}
              hint={status.passcodeEnabled ? 'Reset your app passcode' : 'Create a 6-digit passcode'}
              onPress={() =>
                router.push({
                  pathname: '/create-passcode',
                  params: {
                    next: '/settings',
                    flow: status.passcodeEnabled ? 'change-passcode' : 'create-passcode',
                  },
                } as any)
              }
            />

            <SettingsRow
              label={status.biometricsLabel}
              value={
                !status.passcodeEnabled
                  ? 'Passcode required first'
                  : status.biometricsEnabled
                    ? 'Enabled'
                    : status.biometricsAvailable
                      ? 'Disabled'
                      : 'Unavailable'
              }
              hint={
                !status.passcodeEnabled
                  ? 'Set a passcode before enabling biometric unlock'
                  : status.biometricsEnabled
                    ? `Turn ${status.biometricsLabel} unlock off`
                    : status.biometricsAvailable
                      ? `Turn on ${status.biometricsLabel}`
                      : `${status.biometricsLabel} is not ready on this device`
              }
              onPress={() =>
                status.passcodeEnabled
                  ? router.push({
                      pathname: '/enable-biometrics',
                      params: {
                        next: '/authentication-method',
                        flow: status.biometricsEnabled ? 'disable-biometrics' : 'enable-biometrics',
                      },
                    } as any)
                  : router.push({
                      pathname: '/create-passcode',
                      params: {
                        next: '/authentication-method',
                        flow: 'create-passcode',
                      },
                    } as any)
              }
            />
          </View>
    </ProductScreen>
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
  },

  content: {
    paddingBottom: 24,
  },

  headerCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 18,
  },

  headerTitle: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Sora_700Bold',
  },

  headerBody: {
    ...ui.body,
    marginTop: 10,
  },

  list: {
    gap: 12,
  },

});
