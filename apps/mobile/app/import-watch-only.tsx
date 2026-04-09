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
  importWalletFromWatchOnly,
  isValidTronAddress,
} from '../src/services/wallet/import';

export default function ImportWatchOnlyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ backTo?: string }>();
  const backTo = typeof params.backTo === 'string' ? params.backTo : '/import-wallet';

  const notice = useNotice();
  const [menuOpen, setMenuOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [walletName, setWalletName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const addressValid = useMemo(() => isValidTronAddress(address), [address]);
  const canSave = addressValid && walletName.trim().length > 0 && !submitting;

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setAddress(text.trim());
    }
  };

  const handleBack = () => {
    router.replace(backTo as any);
  };

  const handleSave = async () => {
    if (!canSave) return;

    try {
      setSubmitting(true);

      await importWalletFromWatchOnly({
        name: walletName.trim(),
        address: address.trim(),
      });

      notice.showSuccessNotice('Watch-only wallet saved.', 2400);
      router.replace('/home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save watch-only wallet.';
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
          <SubmenuHeader title="IMPORT WATCH-ONLY" onBack={handleBack} />

          <Text style={styles.title}>
            Add a <Text style={styles.titleAccent}>Watch-Only</Text> wallet
          </Text>

          <Text style={styles.lead}>
            Track balances, tokens and history without signing rights. We validate the
            TRON address and save it as a read-only wallet.
          </Text>

          <View style={styles.card}>
            <View style={styles.rowHeader}>
              <Text style={ui.sectionEyebrow}>TRON Address</Text>
              <Text
                style={[
                  styles.statusText,
                  address.length === 0
                    ? styles.statusIdle
                    : addressValid
                      ? styles.statusValid
                      : styles.statusBad,
                ]}
              >
                {address.length === 0 ? 'WAITING' : addressValid ? 'VALID' : 'INVALID'}
              </Text>
            </View>

            <View style={styles.addressRow}>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="T..."
                placeholderTextColor={colors.textDim}
                style={styles.textInputFlex}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
              />

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.utilityButton}
                onPress={handlePaste}
              >
                <Text style={styles.utilityButtonText}>Paste</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={ui.sectionEyebrow}>Wallet Name</Text>
            <TextInput
              value={walletName}
              onChangeText={setWalletName}
              placeholder="Watch wallet"
              placeholderTextColor={colors.textDim}
              style={styles.textInput}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Mode</Text>
            <Text style={styles.modeBadge}>VIEW ONLY</Text>
            <Text style={styles.cardBody}>
              This wallet type should not sign, send or expose private-key actions.
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryButton, !canSave && styles.primaryButtonDisabled]}
            disabled={!canSave}
            onPress={handleSave}
          >
            <Text style={[ui.buttonLabel, !canSave && styles.primaryButtonTextDisabled]}>
              {submitting ? 'Saving...' : 'Save Watch-Only Wallet'}
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
  statusBad: {
    color: colors.red,
  },
  addressRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  textInputFlex: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    color: colors.white,
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
  utilityButton: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  utilityButtonText: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  cardTitle: {
    ...ui.titleSm,
  },
  modeBadge: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.45,
  },
  cardBody: {
    ...ui.body,
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
