import { Stack } from 'expo-router';
import { usePathname } from 'expo-router';
import FooterNav, { FOOTER_NAV_RESERVED_SPACE } from '../src/ui/footer-nav';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import 'react-native-reanimated';
import { NoticeProvider } from '../src/notice/notice-provider';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const pathname = usePathname();
  const [loaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <NoticeProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: {
            backgroundColor: 'rgb(10,10,10)',
          },
        }}
      >
<Stack.Screen name="index" options={{ contentStyle: { backgroundColor: "rgb(10,10,10)", paddingBottom: 0 } }} />
        <Stack.Screen name="ui-lab" />
        <Stack.Screen name="about" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="whitepaper" />
      </Stack>

          <FooterNav />
      <StatusBar style="light" />
    </NoticeProvider>
  );
}
