import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '../i18n';
import { colors, layout, radius } from '../theme/tokens';
import { ui } from '../theme/ui';
import { BackspaceIcon } from './ui-icons';
import NumericKeypad from './numeric-keypad';

type ApprovalAuthModalProps = {
  visible: boolean;
  eyebrow: string;
  actionLabel: string;
  passcodeError: string;
  digitsLength: number;
  canUseBiometrics: boolean;
  biometricLabel: string;
  passcodeEntryOpen: boolean;
  submitting: boolean;
  onRequestClose: () => void;
  onOpenPasscode: () => void;
  onClosePasscode: () => void;
  onDigitPress: (digit: string) => void;
  onBackspacePress: () => void;
  onBiometricPress?: () => void;
};

export default function ApprovalAuthModal({
  visible,
  eyebrow,
  actionLabel,
  passcodeError,
  digitsLength,
  canUseBiometrics,
  biometricLabel,
  passcodeEntryOpen,
  submitting,
  onRequestClose,
  onOpenPasscode,
  onClosePasscode,
  onDigitPress,
  onBackspacePress,
  onBiometricPress,
}: ApprovalAuthModalProps) {
  const { t } = useI18n();
  const dots = Array.from({ length: 6 }, (_, index) => (
    <View
      key={index}
      style={[styles.dot, digitsLength > index && styles.dotFilled]}
    />
  ));

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.overlay}>
          <View style={styles.screen}>
            <View style={styles.content}>
              <Text style={ui.eyebrow}>{eyebrow}</Text>

              <Text style={styles.title}>
                {t('Confirm with')} <Text style={styles.titleAccent}>{t('Passcode')}</Text>
              </Text>

              <Text style={styles.lead}>
                {passcodeEntryOpen
                  ? t('Authorize this {{action}} with your 6-digit passcode.', {
                      action: actionLabel,
                    })
                  : t('Choose how to authorize this {{action}}.', { action: actionLabel })}
              </Text>

              {passcodeEntryOpen ? (
                <>
                  <View style={styles.card}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={ui.sectionEyebrow}>{t('Approve')}</Text>
                      <Text style={styles.cardErrorText} numberOfLines={1}>
                        {passcodeError || ' '}
                      </Text>
                    </View>

                    <View style={styles.dotsRow}>{dots}</View>
                  </View>

                  <NumericKeypad
                    onDigitPress={onDigitPress}
                    onBackspacePress={onBackspacePress}
                    backspaceIcon={<BackspaceIcon width={22} height={22} />}
                  />

                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.secondaryTextButton}
                    onPress={onClosePasscode}
                    disabled={submitting}
                  >
                    <Text style={styles.secondaryTextButtonText}>
                      {canUseBiometrics ? t('BACK') : t('CANCEL')}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.actionStack}>
                  {canUseBiometrics ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={styles.primaryButton}
                      onPress={onBiometricPress}
                      disabled={submitting}
                    >
                      <Text style={styles.primaryButtonText}>
                        {t('USE')} {biometricLabel.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[styles.secondaryButton, !canUseBiometrics && styles.primaryButton]}
                    onPress={onOpenPasscode}
                    disabled={submitting}
                  >
                    <Text
                      style={[
                        styles.secondaryButtonText,
                        !canUseBiometrics && styles.primaryButtonText,
                      ]}
                    >
                      {t('ENTER PASSCODE')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.secondaryTextButton}
                    onPress={onRequestClose}
                    disabled={submitting}
                  >
                    <Text style={styles.secondaryTextButtonText}>{t('CANCEL')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  overlay: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  screen: {
    flex: 1,
    paddingHorizontal: layout.screenPaddingX,
    justifyContent: 'center',
  },

  content: {
    paddingBottom: 30,
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
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 16,
    paddingBottom: 16,
    marginBottom: 20,
  },

  cardHeaderRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  cardErrorText: {
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

  actionStack: {
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

  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  secondaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  secondaryButtonText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },

  secondaryTextButton: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryTextButtonText: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },
});
