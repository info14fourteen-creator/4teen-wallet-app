import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../ui/app-header';
import MenuSheet from '../ui/menu-sheet';
import SubmenuHeader from '../ui/submenu-header';
import { colors, layout, radius } from '../theme/tokens';
import { ui } from '../theme/ui';

type StubScreenProps = {
  eyebrow: string;
  title?: string;
  body?: string;
};

export default function StubScreen({
  eyebrow,
  title,
  body = 'This screen is not wired yet.',
}: StubScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => {}} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 44 + Math.max(insets.bottom, 6) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <SubmenuHeader title={eyebrow} onBack={() => router.back()} />

          <View style={styles.stubCard}>
            {title ? <Text style={styles.stubTitle}>{title}</Text> : null}
            <Text style={styles.stubText}>{body}</Text>
          </View>
        </ScrollView>

        <MenuSheet open={false} onClose={() => {}} />
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
  },

  stubCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,105,0,0.05)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },

  stubTitle: {
    ...ui.titleSm,
  },

  stubText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
});
