import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppState } from 'react-native';
import 'react-native-reanimated';
import { Buffer } from 'buffer';
import process from 'process';

import { NoticeProvider } from '../src/notice/notice-provider';
import { I18nProvider } from '../src/i18n';
import { useWalletSession, WalletSessionProvider } from '../src/wallet/wallet-session';
import { SearchProvider } from '../src/search/search-provider';
import { NavigationChrome } from '../src/ui/navigation';
import { shouldRenderSharedNavigation } from '../src/ui/navigation-routes';
import { captureDeferredReferral, captureReferralFromUrl } from '../src/services/referral';
import { getAutoLockDelayMs, getAutoLockMode, hasPasscode } from '../src/security/local-auth';

void SplashScreen.preventAutoHideAsync();

if (!(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}

if (!(globalThis as any).process) {
  (globalThis as any).process = process;
}

function LayoutContent() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const rootSegment = segments[0];
  const { hasWallet } = useWalletSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const showSharedNavigation = shouldRenderSharedNavigation(pathname, rootSegment, { hasWallet });
  const backgroundedAtRef = useRef<number | null>(null);

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

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;

        if (!backgroundedAt) {
          return;
        }

        void (async () => {
          const protectedApp = await hasPasscode().catch(() => false);

          if (!protectedApp) {
            return;
          }

          const autoLockMode = await getAutoLockMode().catch(() => '1m' as const);
          const autoLockDelayMs = getAutoLockDelayMs(autoLockMode);

          if (autoLockDelayMs === null) {
            return;
          }

          const elapsed = Date.now() - backgroundedAt;
          const isUnlockRoute = pathname === '/unlock';
          const isPasscodeSetupRoute = pathname === '/create-passcode' || pathname === '/confirm-passcode';
          const isScanRoute = pathname === '/scan';

          if (!isUnlockRoute && !isPasscodeSetupRoute && !isScanRoute && elapsed >= autoLockDelayMs) {
            router.replace('/unlock');
          }
        })();

        return;
      }

      if (nextState === 'background') {
        backgroundedAtRef.current = Date.now();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [pathname, router]);

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
      <I18nProvider>
        <NoticeProvider>
          <WalletSessionProvider>
            <SearchProvider>
              <LayoutContent />
            </SearchProvider>
          </WalletSessionProvider>
        </NoticeProvider>
      </I18nProvider>
    </GestureHandlerRootView>
  );
}
