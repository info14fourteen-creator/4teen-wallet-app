import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, radius } from '../theme/tokens';
import { ui } from '../theme/ui';
import { useBottomInset } from '../ui/use-bottom-inset';
import { useNavigationInsets } from './navigation';
import ScreenBrow from './screen-brow';

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
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const contentBottomInset = useBottomInset();

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
        >
          <ScreenBrow label={eyebrow} variant="back" />
          <View style={styles.stubCard}>
            {title ? <Text style={styles.stubTitle}>{title}</Text> : null}
            <Text style={styles.stubText}>{body}</Text>
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
    gap: 14,
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
