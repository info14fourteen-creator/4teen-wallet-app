import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ScreenA() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <Text style={styles.text}>SCREEN A</Text>

        <TouchableOpacity onPress={() => router.push('/ui-shell-test-b')}>
          <Text style={styles.link}>Go to B →</Text>
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
