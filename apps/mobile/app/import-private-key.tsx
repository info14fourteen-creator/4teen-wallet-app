import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import SubmenuHeader from '../src/ui/submenu-header';
import MenuSheet from '../src/ui/menu-sheet';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  importWalletFromPrivateKey,
  isValidPrivateKey,
  normalizePrivateKey,
} from '../src/services/wallet/import';

export default function ImportPrivateKeyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ backTo?: string }>();
  const backTo = typeof params.backTo === 'string' ? params.backTo : '/import-wallet';

  const notice = useNotice();
  const [menuOpen, setMenuOpen] = useState(false);
  const [privateKey, setPrivateKey] = useState('');
  const [walletName, setWalletName] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const normalized = useMemo(() => normalizePrivateKey(privateKey), [privateKey]);
  const keyValid = useMemo(() => isValidPrivateKey(privateKey), [privateKey]);
  const canImport = keyValid && walletName.trim().length > 0 && !submitting;

  const hiddenPreview =
    normalized.length > 0 ? '•'.repeat(Math.min(normalized.length, 64)) : '';

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setPrivateKey(text.trim());
    }
  };

  const handleBack = () => {
    router.replace(backTo as any);
  };

  const handleImport = async () => {
    if (!canImport) return;

    try {
      setSubmitting(true);

      await importWalletFromPrivateKey({
        name: walletName.trim(),
        privateKey: normalized,
      });

      notice.showSuccessNotice('Wallet imported from private key.', 2400);
      router.replace('/home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import wallet.';
      notice.showErrorNotice(message, 3000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <SubmenuHeader title="IMPORT BY PRIVATE KEY" onBack={handleBack} />

          <Text style={styles.title}>
            Restore from <Text style={styles.titleAccent}>Private Key</Text>
          </Text>

          <Text style={styles.lead}>
            Paste a raw private key to restore wallet access. We derive the TRON address locally and save the wallet after validation.
          </Text>

          <View style={styles.card}>
            <View style={styles.rowHeader}>
              <Text style={ui.sectionEyebrow}>Private Key</Text>
              <Text
                style={[
                  styles.statusText,
                  keyValid ? styles.statusValid : styles.statusIdle,
                ]}
              >
                {privateKey.length === 0 ? 'WAITING' : keyValid ? 'VALID FORMAT' : 'INVALID'}
              </Text>
            </View>

            {visible ? (
              <TextInput
                value={normalized}
                onChangeText={setPrivateKey}
                placeholder="Paste private key"
                placeholderTextColor={colors.textDim}
                style={styles.privateKeyInput}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
            ) : (
              <View style={styles.hiddenPreviewBox}>
                <Text style={styles.hiddenPreviewText}>
                  {hiddenPreview || 'Private key hidden'}
                </Text>
              </View>
            )}

            <View style={styles.utilityRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.utilityButton}
                onPress={handlePaste}
              >
                <Text style={styles.utilityButtonText}>Paste</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.utilityButton}
                onPress={() => setVisible((prev) => !prev)}
              >
                <Text style={styles.utilityButtonText}>{visible ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={ui.sectionEyebrow}>Wallet Name</Text>
            <TextInput
              value={walletName}
              onChangeText={setWalletName}
              placeholder="My imported wallet"
              placeholderTextColor={colors.textDim}
              style={styles.textInput}
            />
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryButton, !canImport && styles.primaryButtonDisabled]}
            disabled={!canImport}
            onPress={handleImport}
          >
            <Text style={[ui.buttonLabel, !canImport && styles.primaryButtonTextDisabled]}>
              {submitting ? 'Importing...' : 'Import Wallet'}
            </Text>
          </TouchableOpacity>
        </ScrollView>

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
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
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
    marginBottom: 16,
    gap: 10,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    letterSpacing: 0.25,
  },
  statusIdle: {
    color: colors.textDim,
  },
  statusValid: {
    color: colors.green,
  },
  privateKeyInput: {
    minHeight: 120,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.white,
    textAlignVertical: 'top',
  },
  hiddenPreviewBox: {
    minHeight: 120,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  hiddenPreviewText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },
  utilityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  utilityButton: {
    minHeight: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  utilityButtonText: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  textInput: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    color: colors.white,
  },
  primaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 6,
  },
  primaryButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  primaryButtonTextDisabled: {
    color: colors.textDim,
  },
});
