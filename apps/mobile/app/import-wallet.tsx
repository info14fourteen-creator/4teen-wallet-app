import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import SubmenuHeader from '../src/ui/submenu-header';
import MenuSheet from '../src/ui/menu-sheet';
import ExpandChevron from '../src/ui/expand-chevron';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { hasPasscode } from '../src/security/local-auth';

const options = [
  {
    id: 'seed',
    title: 'Import by Seed Phrase',
    body: 'Restore a wallet from a 12-word or 24-word recovery phrase.',
    path: '/import-seed',
    requiresPasscode: true,
  },
  {
    id: 'private-key',
    title: 'Import by Private Key',
    body: 'Restore a wallet by importing a raw private key.',
    path: '/import-private-key',
    requiresPasscode: true,
  },
  {
    id: 'watch-only',
    title: 'Import by Watch-Only Address',
    body: 'Track a TRON wallet without signing or sending transactions.',
    path: '/import-watch-only',
    requiresPasscode: false,
  },
];

export default function ImportWalletScreen() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleOptionPress = async (path: string, requiresPasscode: boolean) => {
    if (!requiresPasscode) {
      router.push({
        pathname: path as any,
        params: { backTo: '/import-wallet' },
      });
      return;
    }

    const ready = await hasPasscode();

    if (ready) {
      router.push({
        pathname: path as any,
        params: { backTo: '/import-wallet' },
      });
      return;
    }

    router.push({
      pathname: '/create-passcode',
      params: {
        next: path,
      },
    } as any);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} />
        </View>

        <View style={styles.content}>
          <SubmenuHeader title="IMPORT WALLET" onBack={() => router.back()} />

          <Text style={styles.title}>
            Choose how you want to <Text style={styles.titleAccent}>restore</Text> access
          </Text>

          <Text style={styles.lead}>
            Signing wallet import should be protected. Watch-only mode can stay lighter
            because it does not carry secret material.
          </Text>

          <View style={styles.optionList}>
            {options.map((option) => (
              <TouchableOpacity
                key={option.id}
                activeOpacity={0.9}
                style={styles.optionCard}
                onPress={() => handleOptionPress(option.path, option.requiresPasscode)}
              >
                <View style={styles.optionText}>
                  <Text style={ui.actionLabel}>{option.title}</Text>
                  <Text style={styles.optionBody}>{option.body}</Text>
                </View>

                <ExpandChevron open={false} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

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

  content: {
    flex: 1,
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

  optionList: {
    gap: 14,
  },

  optionCard: {
    minHeight: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  optionText: {
    flex: 1,
    gap: 8,
  },

  optionBody: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Sora_600SemiBold',
  },
});
