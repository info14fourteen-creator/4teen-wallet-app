import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { ProductScreen } from '../src/ui/product-shell';
import {
  type AutoLockMode,
  disableWalletProtection,
  getAutoLockMode,
  getAutoLockModeLabel,
  getBiometricsStatus,
  hasPasscode,
  setAutoLockMode,
} from '../src/security/local-auth';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import SettingsRow from '../src/ui/settings-row';

type AuthStatus = {
  passcodeEnabled: boolean;
  biometricsEnabled: boolean;
  biometricsAvailable: boolean;
  biometricsLabel: string;
  autoLockMode: AutoLockMode;
};

const AUTO_LOCK_OPTIONS: { mode: AutoLockMode; title: string; body: string }[] = [
  {
    mode: '15s',
    title: 'After 15 seconds',
    body: 'Relock quickly after the app leaves the foreground.',
  },
  {
    mode: '1m',
    title: 'After 1 minute',
    body: 'Balanced default for normal switching between apps.',
  },
  {
    mode: '5m',
    title: 'After 5 minutes',
    body: 'Gives more breathing room before asking again.',
  },
  {
    mode: 'never',
    title: 'Never',
    body: 'Do not relock during the same app session. Cold start still respects wallet protection.',
  },
];

export default function AuthenticationMethodScreen() {
  const router = useRouter();
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [autoLockExpanded, setAutoLockExpanded] = useState(false);
  const [disableExpanded, setDisableExpanded] = useState(false);
  const [disablingProtection, setDisablingProtection] = useState(false);
  const [status, setStatus] = useState<AuthStatus>({
    passcodeEnabled: false,
    biometricsEnabled: false,
    biometricsAvailable: false,
    biometricsLabel: 'Biometrics',
    autoLockMode: 'disabled',
  });

  const loadStatus = useCallback(async () => {
    const [passcodeEnabled, biometrics, autoLockMode] = await Promise.all([
      hasPasscode(),
      getBiometricsStatus(),
      getAutoLockMode(),
    ]);

    setStatus({
      passcodeEnabled,
      biometricsEnabled: biometrics.enabled,
      biometricsAvailable: biometrics.available,
      biometricsLabel: biometrics.label,
      autoLockMode: passcodeEnabled ? autoLockMode : 'disabled',
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadStatus();
    }, [loadStatus])
  );

  const authSummary = useMemo(() => {
    if (!status.passcodeEnabled) {
      return 'Off';
    }

    return status.biometricsEnabled ? 'Passcode + Biometrics' : 'Passcode';
  }, [status.biometricsEnabled, status.passcodeEnabled]);

  const handleDisableProtection = useCallback(async () => {
    if (disablingProtection) return;

    try {
      setDisablingProtection(true);
      await disableWalletProtection();
      setDisableExpanded(false);
      setAutoLockExpanded(false);
      await loadStatus();
    } catch (error) {
      console.error(error);
    } finally {
      setDisablingProtection(false);
    }
  }, [disablingProtection, loadStatus]);

  return (
    <ProductScreen
      eyebrow="AUTHENTICATION METHOD"
      browVariant="back"
      headerInfo={{
        title: 'How wallet protection works',
        text:
          'Wallet protection has three layers. Passcode is the hard gate. Biometrics are only a faster approval method on top of that passcode. Auto-lock decides when the app should ask again after you leave it. Use a short timer for stricter security, use Never if you want fewer prompts during the same open session, or turn protection off completely if you explicitly do not want unlock checks at all.',
        expanded: infoExpanded,
        onToggle: () => setInfoExpanded((value) => !value),
      }}
    >
      <View style={styles.list}>
        <SettingsRow
          label="Wallet Lock"
          value={authSummary}
          hint={
            status.passcodeEnabled
              ? 'Change your passcode or turn app protection off.'
              : 'Create a 6-digit passcode to protect wallet access.'
          }
          expanded={disableExpanded}
          onPress={() => {
            if (!status.passcodeEnabled) {
              router.push({
                pathname: '/create-passcode',
                params: {
                  next: '/authentication-method',
                  flow: 'create-passcode',
                },
              } as any);
              return;
            }

            setDisableExpanded((value) => !value);
          }}
        />

        {status.passcodeEnabled && disableExpanded ? (
          <View style={styles.inlineCard}>
            <Text style={styles.inlineTitle}>Turn wallet protection off</Text>
            <Text style={styles.inlineBody}>
              Disabling protection removes the passcode gate and turns biometric unlock off too.
              The app will open straight into wallet screens until you create a new passcode again.
            </Text>

            <Pressable
              style={[styles.inlineButton, styles.inlineDangerButton, disablingProtection && styles.inlineButtonDisabled]}
              onPress={() => void handleDisableProtection()}
              disabled={disablingProtection}
            >
              <Text style={styles.inlineDangerButtonText}>
                {disablingProtection ? 'Turning Off…' : 'Turn Off Protection'}
              </Text>
            </Pressable>
          </View>
        ) : null}

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
              ? 'Set a passcode before enabling biometric unlock.'
              : status.biometricsEnabled
                ? `Turn ${status.biometricsLabel} unlock off.`
                : status.biometricsAvailable
                  ? `Turn on ${status.biometricsLabel} as a faster approval method.`
                  : `${status.biometricsLabel} is not ready on this device.`
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

        <SettingsRow
          label="Auto-Lock"
          value={getAutoLockModeLabel(status.autoLockMode)}
          hint={
            status.passcodeEnabled
              ? 'Choose how quickly wallet protection returns after leaving the app.'
              : 'Auto-lock becomes available after you enable passcode protection.'
          }
          expanded={autoLockExpanded}
          onPress={() => {
            if (!status.passcodeEnabled) {
              router.push({
                pathname: '/create-passcode',
                params: {
                  next: '/authentication-method',
                  flow: 'create-passcode',
                },
              } as any);
              return;
            }

            setAutoLockExpanded((value) => !value);
          }}
        />

        {status.passcodeEnabled && autoLockExpanded ? (
          <View style={styles.optionList}>
            {AUTO_LOCK_OPTIONS.map((option) => {
              const selected = status.autoLockMode === option.mode;

              return (
                <Pressable
                  key={option.mode}
                  style={[styles.optionRow, selected && styles.optionRowSelected]}
                  onPress={async () => {
                    await setAutoLockMode(option.mode);
                    setStatus((current) => ({ ...current, autoLockMode: option.mode }));
                  }}
                >
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionBody}>{option.body}</Text>
                  </View>

                  <View style={[styles.radio, selected && styles.radioActive]}>
                    {selected ? <View style={styles.radioInner} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },

  inlineCard: {
    marginTop: -2,
    marginBottom: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  inlineTitle: {
    ...ui.titleSm,
  },

  inlineBody: {
    ...ui.body,
    marginTop: 8,
  },

  inlineButton: {
    minHeight: layout.buttonHeight,
    marginTop: 16,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  inlineDangerButton: {
    backgroundColor: colors.red,
  },

  inlineButtonDisabled: {
    opacity: 0.55,
  },

  inlineDangerButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  optionList: {
    gap: 10,
    marginTop: -2,
    marginBottom: 4,
  },

  optionRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },

  optionRowSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255,105,0,0.10)',
  },

  optionText: {
    flex: 1,
  },

  optionTitle: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },

  optionBody: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
    marginTop: 6,
  },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },

  radioActive: {
    borderColor: colors.accent,
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
});
