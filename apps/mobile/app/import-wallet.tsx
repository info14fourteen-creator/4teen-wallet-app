import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import ExpandChevron from '../src/ui/expand-chevron';
import { useI18n } from '../src/i18n';
import { colors, layout, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { hasPasscode } from '../src/security/local-auth';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import { useNavigationInsets } from '../src/ui/navigation';
import ScreenBrow from '../src/ui/screen-brow';

const options = [
  {
    id: 'seed',
    title: 'Import by Seed Phrase',
    body: 'Recover full wallet control from a 12-word or 24-word phrase. Best path when you are restoring real self-custody access.',
    path: '/import-seed',
    requiresPasscode: true,
  },
  {
    id: 'private-key',
    title: 'Import by Private Key',
    body: 'Import a raw private key and restore direct signing control. Fast, powerful, and absolutely not something to paste carelessly.',
    path: '/import-private-key',
    requiresPasscode: true,
  },
  {
    id: 'watch-only',
    title: 'Import by Watch-Only Address',
    body: 'Track balances, tokens, and history from any TRON address without exposing keys or granting signing rights.',
    path: '/import-watch-only',
    requiresPasscode: false,
  },
];

export default function ImportWalletScreen() {
  const router = useRouter();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();
  const { t } = useI18n();

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
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingTop: navInsets.top, paddingBottom: contentBottomInset },
          ]}
          showsVerticalScrollIndicator={false}
          bounces
        >
          <ScreenBrow label={t('IMPORT WALLET')} variant="back" />
          <Text style={[styles.title, styles.titleAccent]}>{t('Reconnect your wallet access')}</Text>

          <Text style={styles.lead}>
            {t(
              'Pick the recovery path that matches what you actually control. Seed phrase and private key restore signing power. Watch-only is strictly for tracking, not for moving funds.'
            )}
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
                  <Text style={ui.actionLabel}>{t(option.title)}</Text>
                  <Text style={styles.optionBody}>{t(option.body)}</Text>
                </View>

                <ExpandChevron open={false} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
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

  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    gap: 0,
  },

  title: {
    marginTop: 0,
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
    minHeight: 94,
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
