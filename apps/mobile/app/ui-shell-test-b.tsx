import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { ProductScreen } from '../src/ui/product-shell';
import { goBackOrReplace } from '../src/ui/safe-back';
import { colors, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

export default function ScreenB() {
  const router = useRouter();
  const pathname = usePathname();
  const { height } = useWindowDimensions();
  const compact = height < 760;

  return (
    <ProductScreen eyebrow="UI LAB" browVariant="back" bottomInsetExtra={compact ? spacing[3] : spacing[5]}>
      <View style={[styles.stage, compact ? styles.stageCompact : styles.stageRegular]}>
        <View style={styles.card}>
          <Text style={ui.eyebrow}>Shell Test</Text>
          <Text style={styles.title}>Screen B</Text>
          <Text style={styles.body}>
            This screen now respects the same header and footer chrome spacing as the rest of the app,
            so it does not collapse awkwardly on shorter displays.
          </Text>

          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.button}
            onPress={() => goBackOrReplace(router, { pathname, fallback: '/wallet' })}
          >
            <Text style={styles.buttonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  stage: {
    flexGrow: 1,
  },

  stageRegular: {
    justifyContent: 'center',
    minHeight: 460,
  },

  stageCompact: {
    justifyContent: 'flex-start',
    paddingTop: spacing[2],
    minHeight: 320,
  },

  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 10,
  },

  title: {
    color: colors.white,
    fontSize: 28,
    lineHeight: 32,
    fontFamily: 'Sora_700Bold',
  },

  body: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_400Regular',
  },

  button: {
    marginTop: 6,
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  buttonText: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
  },
});
