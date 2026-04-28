import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import KeyboardView from '../src/ui/KeyboardView';
import InfoToggleIcon from '../src/ui/info-toggle-icon';
import { useNavigationInsets } from '../src/ui/navigation';
import ScreenBrow from '../src/ui/screen-brow';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  importWalletFromWatchOnly,
  isValidTronAddress,
} from '../src/services/wallet/import';
import { ConfirmIcon, PasteIcon, ScanIcon } from '../src/ui/ui-icons';

const MAX_WALLET_NAME_LENGTH = 18;
const IMPORT_INFO_TITLE = 'How watch-only works';
const IMPORT_INFO_TEXT =
  'Paste or scan a TRON address to add this wallet in view-only mode. The address is validated locally on this device before the wallet is saved.\n\nA watch-only wallet can show balances, tokens, and activity, but it cannot sign transactions or expose private-key actions.\n\nThe wallet name is just a local label for this app. It helps you recognize the wallet and does not change anything on-chain.';

export default function ImportWatchOnlyScreen() {
  const router = useRouter();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const params = useLocalSearchParams<{ backTo?: string; address?: string | string[] }>();
  const scannedAddressParam = Array.isArray(params.address) ? params.address[0] : params.address;

  const notice = useNotice();
  const contentBottomInset = useBottomInset();
  const [address, setAddress] = useState('');
  const [walletName, setWalletName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);

  const walletNameRef = useRef<TextInput | null>(null);

  const normalizedAddress = address.trim();
  const walletNameTrimmed = walletName.trim();
  const addressValid = useMemo(() => isValidTronAddress(normalizedAddress), [normalizedAddress]);
  const showInvalidAddressHint = normalizedAddress.length > 0 && !addressValid;
  const addressFontSize = useMemo(() => {
    if (normalizedAddress.length > 32) return 11;
    if (normalizedAddress.length > 26) return 12;
    if (normalizedAddress.length > 20) return 13;
    return 14;
  }, [normalizedAddress.length]);

  const canSave =
    addressValid &&
    walletNameTrimmed.length > 0 &&
    walletNameTrimmed.length <= MAX_WALLET_NAME_LENGTH &&
    !submitting;

  useEffect(() => {
    if (!scannedAddressParam) return;
    setAddress(String(scannedAddressParam).trim());
  }, [scannedAddressParam]);

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setAddress(text.trim());
    }
  };

  const handleScanAddress = () => {
    router.push('/scan?mode=watch-only' as any);
  };

  const handleSave = async () => {
    if (!addressValid) {
      notice.showErrorNotice('Enter a valid TRON address.', 2600);
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

      await importWalletFromWatchOnly({
        name: walletNameTrimmed,
        address: normalizedAddress,
      });

      notice.showSuccessNotice('Watch-only wallet added.', 2400);
      router.replace('/wallet');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save watch-only wallet.';
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
            label="WATCH-ONLY WALLET"
            variant="backLink"
            onLabelPress={() => setInfoExpanded((prev) => !prev)}
            labelAccessory={<InfoToggleIcon expanded={infoExpanded} />}
          />

          {infoExpanded ? (
            <View style={styles.infoPanel}>
              <Text style={styles.infoTitle}>{IMPORT_INFO_TITLE}</Text>
              <Text style={styles.infoText}>{IMPORT_INFO_TEXT}</Text>
            </View>
          ) : null}

          <Text style={styles.title}>
            Add a <Text style={styles.titleAccent}>watch-only</Text> wallet
          </Text>

          <Text style={styles.noticeLine}>This wallet can view activity, but it cannot sign.</Text>

          <Text style={styles.blockEyebrow}>TRON Address</Text>

          <View style={[styles.addressField, normalizedAddress.length > 0 && styles.addressFieldActive]}>
            <TextInput
              value={address}
              onChangeText={(value) => setAddress(value.replace(/\s+/g, ''))}
              placeholder="T..."
              placeholderTextColor={colors.textDim}
              style={[
                styles.addressInput,
                { fontSize: addressFontSize, lineHeight: addressFontSize + 4 },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              keyboardAppearance="dark"
              selectionColor={colors.accent}
              returnKeyType="next"
              onSubmitEditing={() => walletNameRef.current?.focus()}
            />

            <View style={styles.addressActions}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.inlineUtilityButton}
                onPress={handleScanAddress}
              >
                <ScanIcon width={16} height={16} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.inlineUtilityButton}
                onPress={handlePaste}
              >
                <PasteIcon width={16} height={16} />
              </TouchableOpacity>
            </View>
          </View>

          {showInvalidAddressHint ? (
            <Text style={styles.invalidAddressHint}>Enter a valid TRON address.</Text>
          ) : null}

          <Text style={styles.walletNameEyebrow}>Wallet Name</Text>

          <View style={styles.nameField}>
            <TextInput
              ref={walletNameRef}
              value={walletName}
              onChangeText={(value) => setWalletName(value.slice(0, MAX_WALLET_NAME_LENGTH))}
              placeholder="Watch wallet"
              placeholderTextColor={colors.textDim}
              style={styles.nameInput}
              maxLength={MAX_WALLET_NAME_LENGTH}
              returnKeyType="done"
              onSubmitEditing={() => void handleSave()}
            />

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.nameConfirmButton, !canSave && styles.nameConfirmButtonDisabled]}
              onPress={() => void handleSave()}
            >
              <ConfirmIcon width={18} height={18} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryButton, !canSave && styles.primaryButtonDisabled]}
            disabled={!canSave}
            onPress={() => void handleSave()}
          >
            <Text style={[ui.buttonLabel, !canSave && styles.primaryButtonTextDisabled]}>
              {submitting ? 'Saving...' : 'Save Watch-Only Wallet'}
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

  invalidAddressHint: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    marginTop: 8,
    marginBottom: 16,
  },

  blockEyebrow: {
    ...ui.sectionEyebrow,
    marginBottom: 12,
  },

  addressField: {
    minHeight: layout.fieldHeight,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  addressFieldActive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  addressInput: {
    flex: 1,
    minHeight: layout.fieldHeight,
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    paddingVertical: 0,
    fontFamily: 'Sora_600SemiBold',
  },

  addressActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },

  inlineUtilityButton: {
    width: 28,
    height: 28,
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
