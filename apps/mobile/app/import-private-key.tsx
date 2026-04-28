import { useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import KeyboardView from '../src/ui/KeyboardView';
import InfoToggleIcon from '../src/ui/info-toggle-icon';
import LottieIcon from '../src/ui/lottie-icon';
import { useNavigationInsets } from '../src/ui/navigation';
import ScreenBrow from '../src/ui/screen-brow';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import { useI18n } from '../src/i18n';
import {
  importWalletFromPrivateKey,
  isValidPrivateKey,
  normalizePrivateKey,
} from '../src/services/wallet/import';
import { ConfirmIcon, PasteIcon } from '../src/ui/ui-icons';

const MAX_WALLET_NAME_LENGTH = 18;
const KEY_BOX_HEIGHT = 84;
const PRIVATE_KEY_VISIBILITY_SOURCE = require('../assets/icons/ui/import_private_key_visibility_toggle.json');
const IMPORT_INFO_TITLE = 'How this import works';
const IMPORT_INFO_TEXT =
  'Paste the raw private key exactly as issued. You can paste it from the clipboard into the key field, and the eye only shows or hides that text locally on this device.\n\nThe wallet name is just a local label for this app. It helps you recognize the imported wallet and does not change anything on-chain.\n\nImport starts only after the key passes local validation. We derive the TRON address here on device, and we never store your seed phrase or private key on our servers.';

export default function ImportPrivateKeyScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const navInsets = useNavigationInsets({ topExtra: 14 });

  const notice = useNotice();
  const contentBottomInset = useBottomInset();
  const [privateKey, setPrivateKey] = useState('');
  const [walletName, setWalletName] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [visibilityAnimating, setVisibilityAnimating] = useState(false);
  const [visibilityPlayToken, setVisibilityPlayToken] = useState(0);
  const [visibilityFrames, setVisibilityFrames] = useState<[number, number]>([0, 29]);

  const walletNameRef = useRef<TextInput | null>(null);

  const normalized = useMemo(() => normalizePrivateKey(privateKey), [privateKey]);
  const keyValid = useMemo(() => isValidPrivateKey(privateKey), [privateKey]);
  const walletNameTrimmed = walletName.trim();
  const privateKeyFontSize = useMemo(() => {
    if (normalized.length > 56) return 11;
    if (normalized.length > 44) return 12;
    if (normalized.length > 32) return 13;
    return 14;
  }, [normalized.length]);
  const maskedPrivateKey = useMemo(() => {
    if (!normalized.length) return '';
    return '•'.repeat(normalized.length);
  }, [normalized]);

  const canImport =
    keyValid &&
    walletNameTrimmed.length > 0 &&
    walletNameTrimmed.length <= MAX_WALLET_NAME_LENGTH &&
    !submitting;

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setPrivateKey(text.trim());
    }
  };

  const handleToggleVisibility = () => {
    setVisibilityAnimating(true);
    setVisibilityPlayToken((current) => current + 1);
    setVisibilityFrames(visible ? [29, 0] : [0, 29]);
    setVisible((prev) => !prev);
  };

  const handleImport = async () => {
    if (!keyValid) {
      notice.showErrorNotice(t('Enter a valid private key.'), 2600);
      return;
    }

    if (!walletNameTrimmed.length) {
      notice.showErrorNotice(t('Wallet name is required.'), 2600);
      walletNameRef.current?.focus();
      return;
    }

    if (walletNameTrimmed.length > MAX_WALLET_NAME_LENGTH) {
      notice.showErrorNotice(
        t('Wallet name must be {{count}} characters or less.', { count: MAX_WALLET_NAME_LENGTH }),
        2600
      );
      walletNameRef.current?.focus();
      return;
    }

    if (submitting) return;

    try {
      setSubmitting(true);
      Keyboard.dismiss();

      await importWalletFromPrivateKey({
        name: walletNameTrimmed,
        privateKey: normalized,
      });

      notice.showSuccessNotice(t('Private-key wallet imported.'), 2400);
      router.replace('/wallet');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Failed to import wallet.');
      notice.showErrorNotice(message, 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <KeyboardView
          contentContainerStyle={[
            styles.content,
            { paddingTop: navInsets.top, paddingBottom: contentBottomInset },
          ]}
          extraScrollHeight={56}
        >
          <ScreenBrow
            label={t('IMPORT PRIVATE KEY')}
            variant="backLink"
            onLabelPress={() => setInfoExpanded((prev) => !prev)}
            labelAccessory={<InfoToggleIcon expanded={infoExpanded} />}
          />

          {infoExpanded ? (
            <View style={styles.infoPanel}>
              <Text style={styles.infoTitle}>{IMPORT_INFO_TITLE}</Text>
              <Text style={styles.infoText}>{t(IMPORT_INFO_TEXT)}</Text>
            </View>
          ) : null}

          <Text style={styles.title}>
            {t('Restore from')} <Text style={styles.titleAccent}>{t('private key')}</Text>
          </Text>

          <Text style={styles.noticeLine}>{t('We never store your seed phrase or private key.')}</Text>

          <View style={styles.blockEyebrowRow}>
            <Text style={styles.blockEyebrow}>{t('Private Key')}</Text>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.blockEyebrowAction}
              onPress={handleToggleVisibility}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              {visibilityAnimating ? (
                <LottieIcon
                  key={`private-key-visibility-${visibilityPlayToken}`}
                  source={PRIVATE_KEY_VISIBILITY_SOURCE}
                  size={18}
                  playToken={visibilityPlayToken}
                  frames={visibilityFrames}
                  onAnimationFinish={() => {
                    setVisibilityAnimating(false);
                  }}
                />
              ) : (
                <LottieIcon
                  source={PRIVATE_KEY_VISIBILITY_SOURCE}
                  size={18}
                  staticFrame={visible ? 29 : 0}
                />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.keyBox}>
            <View style={styles.keyContentArea}>
              <TextInput
                value={normalized}
                onChangeText={(value) => setPrivateKey(value.replace(/\s+/g, ''))}
                placeholder={t('Paste private key')}
                placeholderTextColor={colors.textDim}
                style={[
                  styles.privateKeyInput,
                  !visible && styles.privateKeyInputHidden,
                  { fontSize: privateKeyFontSize, lineHeight: privateKeyFontSize + 4 },
                ]}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                keyboardAppearance="dark"
                selectionColor={colors.accent}
                caretHidden={!visible}
                multiline={false}
                numberOfLines={1}
                returnKeyType="next"
                onSubmitEditing={() => walletNameRef.current?.focus()}
              />
              {!visible && maskedPrivateKey ? (
                <Text
                  pointerEvents="none"
                  style={[
                    styles.privateKeyMask,
                    { fontSize: privateKeyFontSize, lineHeight: privateKeyFontSize + 4 },
                  ]}
                  numberOfLines={1}
                >
                  {maskedPrivateKey}
                </Text>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.keyPasteButton}
                onPress={handlePaste}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <PasteIcon width={16} height={16} />
              </TouchableOpacity>

            </View>
          </View>

          <Text style={styles.walletNameEyebrow}>{t('Wallet Name')}</Text>

          <View style={styles.nameField}>
            <TextInput
              ref={walletNameRef}
              value={walletName}
              onChangeText={(value) => setWalletName(value.slice(0, MAX_WALLET_NAME_LENGTH))}
              placeholder={t('Imported wallet')}
              placeholderTextColor={colors.textDim}
              style={styles.nameInput}
              maxLength={MAX_WALLET_NAME_LENGTH}
              returnKeyType="done"
              onSubmitEditing={() => void handleImport()}
            />

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.nameConfirmButton, !canImport && styles.nameConfirmButtonDisabled]}
              onPress={() => void handleImport()}
            >
              <ConfirmIcon width={18} height={18} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryButton, !canImport && styles.primaryButtonDisabled]}
            disabled={!canImport}
            onPress={() => void handleImport()}
          >
            <Text style={[ui.buttonLabel, !canImport && styles.primaryButtonTextDisabled]}>
              {submitting ? 'Importing...' : 'Import Wallet'}
            </Text>
          </TouchableOpacity>
        </KeyboardView>
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

  infoPanel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
    marginBottom: 16,
  },

  infoTitle: {
    ...ui.bodyStrong,
  },

  infoText: {
    ...ui.body,
    lineHeight: 25,
  },

  noticeLine: {
    ...ui.body,
    marginTop: 12,
    marginBottom: 18,
    color: colors.textDim,
  },

  blockEyebrowRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  blockEyebrow: {
    ...ui.sectionEyebrow,
    marginBottom: 0,
    flex: 1,
  },

  blockEyebrowAction: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  keyBox: {
    height: KEY_BOX_HEIGHT,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    position: 'relative',
  },

  keyContentArea: {
    flex: 1,
    justifyContent: 'flex-start',
    position: 'relative',
  },

  privateKeyInput: {
    width: '100%',
    color: colors.white,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
    paddingTop: 0,
    paddingBottom: 0,
    height: 24,
    paddingRight: 48,
  },

  privateKeyInputHidden: {
    color: 'transparent',
  },

  privateKeyMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 48,
    color: colors.white,
    fontFamily: 'Sora_600SemiBold',
    textAlignVertical: 'top',
  },

  keyPasteButton: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  walletNameEyebrow: {
    ...ui.sectionEyebrow,
    marginTop: 22,
    marginBottom: 12,
  },

  nameField: {
    minHeight: layout.fieldHeight,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  nameInput: {
    flex: 1,
    minHeight: layout.fieldHeight,
    color: colors.white,
    fontFamily: 'Sora_600SemiBold',
    paddingVertical: 0,
  },

  nameConfirmButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  nameConfirmButtonDisabled: {
    opacity: 0.35,
  },

  primaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: spacing[4],
  },

  primaryButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  primaryButtonTextDisabled: {
    color: colors.textDim,
  },
});
