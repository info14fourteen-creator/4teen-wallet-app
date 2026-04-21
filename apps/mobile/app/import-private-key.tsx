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
import { useNavigationInsets } from '../src/ui/navigation';
import ScreenBrow from '../src/ui/screen-brow';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  importWalletFromPrivateKey,
  isValidPrivateKey,
  normalizePrivateKey,
} from '../src/services/wallet/import';
import { ConfirmIcon, PasteIcon } from '../src/ui/ui-icons';

const MAX_WALLET_NAME_LENGTH = 18;
const KEY_BOX_HEIGHT = 152;

export default function ImportPrivateKeyScreen() {
  const router = useRouter();
  const navInsets = useNavigationInsets({ topExtra: 14 });

  const notice = useNotice();
  const contentBottomInset = useBottomInset();
  const [privateKey, setPrivateKey] = useState('');
  const [walletName, setWalletName] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const canImport =
    keyValid &&
    walletNameTrimmed.length > 0 &&
    walletNameTrimmed.length <= MAX_WALLET_NAME_LENGTH &&
    !submitting;

  const hiddenStatusText =
    privateKey.length === 0 ? 'Private key hidden' : `Private key hidden • ${normalized.length} chars`;

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setPrivateKey(text.trim());
    }
  };

  const handleImport = async () => {
    if (!keyValid) {
      notice.showErrorNotice('Enter a valid private key.', 2600);
      return;
    }

    if (!walletNameTrimmed.length) {
      notice.showErrorNotice('Wallet name is required.', 2600);
      walletNameRef.current?.focus();
      return;
    }

    if (walletNameTrimmed.length > MAX_WALLET_NAME_LENGTH) {
      notice.showErrorNotice(
        `Wallet name must be ${MAX_WALLET_NAME_LENGTH} characters or less.`,
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

      notice.showSuccessNotice('Private-key wallet imported.', 2400);
      router.replace('/wallet');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import wallet.';
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
          <ScreenBrow label="IMPORT PRIVATE KEY" variant="back" />

          <Text style={styles.title}>
            Restore from <Text style={styles.titleAccent}>private key</Text>
          </Text>

          <Text style={styles.lead}>
            Paste the raw private key exactly as issued. The key is validated locally on device,
            the TRON address is derived locally, and the wallet is imported only after validation.
          </Text>

          <View style={styles.switchRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.switchButton}
              onPress={handlePaste}
            >
              <Text style={styles.switchTextActive}>Paste Key</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.switchButton, visible && styles.switchButtonActive]}
              onPress={() => setVisible((prev) => !prev)}
            >
              <Text style={[styles.switchText, visible && styles.switchTextActive]}>
                {visible ? 'Hide Key' : 'Show Key'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.helperTextCentered}>
            {privateKey.length === 0
              ? 'Waiting for private key input.'
              : keyValid
                ? 'Valid private key format detected.'
                : 'Invalid private key format.'}
          </Text>

          <Text style={styles.blockEyebrow}>Private Key</Text>

          <View style={[styles.keyBox, visible && styles.keyBoxActive]}>
            <View style={styles.keyContentArea}>
              {visible ? (
                <TextInput
                  value={normalized}
                  onChangeText={(value) => setPrivateKey(value.replace(/\s+/g, ''))}
                  placeholder="Paste private key"
                  placeholderTextColor={colors.textDim}
                  style={[
                    styles.privateKeyInput,
                    { fontSize: privateKeyFontSize, lineHeight: privateKeyFontSize + 4 },
                  ]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  keyboardAppearance="dark"
                  selectionColor={colors.accent}
                  multiline={false}
                  numberOfLines={1}
                  returnKeyType="next"
                  onSubmitEditing={() => walletNameRef.current?.focus()}
                />
              ) : (
                <View style={styles.hiddenStateArea}>
                  <Text style={styles.hiddenSpacerText}>{' '}</Text>
                </View>
              )}
            </View>

            <View style={styles.keyUtilityRow}>
              <Text style={styles.keyUtilityText}>
                {visible ? 'Private key visible' : hiddenStatusText}
              </Text>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.inlineUtilityButton}
                onPress={handlePaste}
              >
                <PasteIcon width={16} height={16} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.walletNameEyebrow}>Wallet Name</Text>

          <View style={styles.nameField}>
            <TextInput
              ref={walletNameRef}
              value={walletName}
              onChangeText={(value) => setWalletName(value.slice(0, MAX_WALLET_NAME_LENGTH))}
              placeholder="Imported wallet"
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

  lead: {
    ...ui.lead,
    marginTop: 14,
    marginBottom: 22,
  },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },

  switchButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    
    
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  switchButtonActive: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.12)',
  },

  switchText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },

  switchTextActive: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },

  helperTextCentered: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 16,
  },

  blockEyebrow: {
    ...ui.sectionEyebrow,
    marginBottom: 12,
  },

  keyBox: {
    height: KEY_BOX_HEIGHT,
    borderRadius: radius.sm,
    
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
  },

  keyBoxActive: {
    
    backgroundColor: 'rgba(255,105,0,0.05)',
  },

  keyContentArea: {
    flex: 1,
  },

  privateKeyInput: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
    paddingVertical: 0,
  },

  hiddenStateArea: {
    flex: 1,
    justifyContent: 'flex-start',
  },

  hiddenSpacerText: {
    color: 'transparent',
    fontSize: 14,
    lineHeight: 20,
  },

  keyUtilityRow: {
    minHeight: 28,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  keyUtilityText: {
    flex: 1,
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  inlineUtilityButton: {
    minHeight: 28,
    borderRadius: 999,
    
    
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.12)',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inlineUtilityButtonText: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
  },

  walletNameEyebrow: {
    ...ui.sectionEyebrow,
    marginTop: 22,
    marginBottom: 12,
  },

  nameField: {
    minHeight: 52,
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
    minHeight: 52,
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
