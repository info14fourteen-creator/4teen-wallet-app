import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBackOrReplace } from '../src/ui/safe-back';

export default function ScreenB() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <Text style={styles.text}>SCREEN B</Text>

        <TouchableOpacity onPress={() => goBackOrReplace(router, { pathname, fallback: '/wallet' })}>
          <Text style={styles.link}>← Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'black' },
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  text: { color: 'white', fontSize: 20 },
  link: { color: 'orange', fontSize: 16 },
});
