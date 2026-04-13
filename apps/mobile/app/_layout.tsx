import { Stack, useSegments } from 'expo-router';
import FooterNav from '../src/ui/footer-nav';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import 'react-native-reanimated';
import { NoticeProvider } from '../src/notice/notice-provider';
import { Buffer } from 'buffer';
import process from 'process';

void SplashScreen.preventAutoHideAsync();

if (!(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}

if (!(globalThis as any).process) {
  (globalThis as any).process = process;
}

function LayoutContent() {
  const segments = useSegments();
  const rootSegment = segments[0];
  const hideFooterNav = rootSegment === 'browser';

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: {
            backgroundColor: 'rgb(10,10,10)',
          },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ contentStyle: { backgroundColor: 'rgb(10,10,10)', paddingBottom: 0 } }}
        />
        <Stack.Screen name="browser" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ui-lab" />
        <Stack.Screen name="about" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="whitepaper" />
      </Stack>

      {!hideFooterNav ? <FooterNav /> : null}
      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
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
      <LayoutContent />
    </NoticeProvider>
  );
}
