import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import SubmenuHeader from '../src/ui/submenu-header';
import { colors, layout } from '../src/theme/tokens';

export default function SwapScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        <SubmenuHeader title="SWAP" onBack={() => router.back()} />
        <View style={styles.body}>
          <Text style={styles.title}>Swap</Text>
          <Text style={styles.text}>This screen is a stub for now.</Text>
        </View>
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
    paddingTop: 12,
  },

  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  title: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'Sora_700Bold',
  },

  text: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },
});
