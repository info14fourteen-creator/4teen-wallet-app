import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ExpandChevron from '../src/ui/expand-chevron';
import ScreenBrow from '../src/ui/screen-brow';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useNavigationInsets } from '../src/ui/navigation';
import { getBiometricsEnabled, hasPasscode } from '../src/security/local-auth';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

type AuthStatus = {
  passcodeEnabled: boolean;
  biometricsEnabled: boolean;
};

export default function AuthenticationMethodScreen() {
  const router = useRouter();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();

  const [status, setStatus] = useState<AuthStatus>({
    passcodeEnabled: false,
    biometricsEnabled: false,
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadStatus = async () => {
        const [passcodeEnabled, biometricsEnabled] = await Promise.all([
          hasPasscode(),
          getBiometricsEnabled(),
        ]);

        if (!cancelled) {
          setStatus({ passcodeEnabled, biometricsEnabled });
        }
      };

      void loadStatus();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: navInsets.top, paddingBottom: contentBottomInset },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <ScreenBrow label="AUTHENTICATION METHOD" variant="back" />

          <View style={styles.headerCard}>
            <Text style={styles.headerTitle}>App protection</Text>
            <Text style={styles.headerBody}>
              Manage the 6-digit passcode and biometric unlock flow used by this wallet.
            </Text>
          </View>

          <View style={styles.list}>
            <SettingRow
              label="Passcode"
              value={status.passcodeEnabled ? 'Enabled' : 'Not set'}
              hint={status.passcodeEnabled ? 'Reset your app passcode' : 'Create a 6-digit passcode'}
              onPress={() => router.push('/create-passcode')}
            />

            <SettingRow
              label="Biometrics"
              value={
                !status.passcodeEnabled
                  ? 'Passcode required first'
                  : status.biometricsEnabled
                    ? 'Enabled'
                    : 'Disabled'
              }
              hint={
                !status.passcodeEnabled
                  ? 'Set a passcode before enabling Face ID or fingerprint'
                  : status.biometricsEnabled
                    ? 'Re-run biometric setup or turn it off'
                    : 'Turn on face unlock or fingerprint'
              }
              onPress={() =>
                status.passcodeEnabled
                  ? router.push({
                      pathname: '/enable-biometrics',
                      params: { next: '/authentication-method' },
                    } as any)
                  : router.push('/create-passcode')
              }
            />
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function SettingRow({
  label,
  value,
  hint,
  onPress,
}: {
  label: string;
  value: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.row} onPress={onPress}>
      <View style={styles.rowText}>
        <Text style={ui.actionLabel}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <ExpandChevron open={false} />
    </TouchableOpacity>
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

  row: {
    minHeight: 86,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  rowText: {
    flex: 1,
  },

  value: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_400Regular',
    marginTop: 4,
  },

  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_400Regular',
    marginTop: 6,
  },
});
