import { Stack, usePathname, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { Buffer } from 'buffer';
import process from 'process';

import { NoticeProvider } from '../src/notice/notice-provider';
import { WalletSessionProvider } from '../src/wallet/wallet-session';
import { SearchProvider } from '../src/search/search-provider';
import { NavigationChrome } from '../src/ui/navigation';
import { shouldRenderSharedNavigation } from '../src/ui/navigation-routes';
import { captureDeferredReferral, captureReferralFromUrl } from '../src/services/referral';

void SplashScreen.preventAutoHideAsync();

if (!(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}

if (!(globalThis as any).process) {
  (globalThis as any).process = process;
}

function LayoutContent() {
  const pathname = usePathname();
  const segments = useSegments();
  const rootSegment = segments[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const showSharedNavigation = shouldRenderSharedNavigation(pathname, rootSegment);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let mounted = true;

    const syncInitialReferral = async () => {
      const initialUrl = await Linking.getInitialURL().catch(() => null);

      if (mounted && initialUrl) {
        await captureReferralFromUrl(initialUrl).catch(() => null);
      }

      if (!mounted) return;
      await captureDeferredReferral().catch(() => null);
    };

    void syncInitialReferral();

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void captureReferralFromUrl(url).catch(() => null);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          animationMatchesGesture: true,
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
        <Stack.Screen name="scan" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ui-lab" />
        <Stack.Screen name="wallet-access" />
        <Stack.Screen name="wallet-manager" />
        <Stack.Screen name="about" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="whitepaper" />
      </Stack>

      {showSharedNavigation ? (
        <NavigationChrome
          menuOpen={menuOpen}
          onOpenMenu={() => setMenuOpen(true)}
          onCloseMenu={() => setMenuOpen(false)}
        />
      ) : null}
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NoticeProvider>
        <WalletSessionProvider>
          <SearchProvider>
            <LayoutContent />
          </SearchProvider>
        </WalletSessionProvider>
      </NoticeProvider>
    </GestureHandlerRootView>
  );
}
