import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ScreenB() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <Text style={styles.text}>SCREEN B</Text>

        <TouchableOpacity onPress={() => router.back()}>
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
