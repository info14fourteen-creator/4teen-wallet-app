import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppState, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';
import { Buffer } from 'buffer';
import process from 'process';

import { NoticeProvider, useNotice } from '../src/notice/notice-provider';
import { I18nProvider } from '../src/i18n';
import { useWalletSession, WalletSessionProvider } from '../src/wallet/wallet-session';
import { SearchProvider } from '../src/search/search-provider';
import { NavigationChrome } from '../src/ui/navigation';
import { shouldRenderSharedNavigation } from '../src/ui/navigation-routes';
import { captureDeferredReferral, captureReferralFromUrl } from '../src/services/referral';
import { getAutoLockDelayMs, getAutoLockMode, hasPasscode } from '../src/security/local-auth';
import { subscribeLockOverlayRelease } from '../src/security/lock-overlay';
import { getActiveWallet } from '../src/services/wallet/storage';

void SplashScreen.preventAutoHideAsync().catch(() => null);

if (!(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}

if (!(globalThis as any).process) {
  (globalThis as any).process = process;
}

const WALLET_REQUIRED_ROUTES = new Set([
  '/wallet',
  '/wallets',
  '/wallet-manager',
  '/token-details',
  '/send',
  '/send-confirm',
  '/swap',
  '/swap-confirm',
  '/buy',
  '/buy-confirm',
  '/airdrop',
  '/ambassador-program',
  '/ambassador-confirm',
  '/ambassador-withdraw-confirm',
  '/unlock-timeline',
  '/liquidity-controller',
  '/liquidity-confirm',
  '/manage-crypto',
  '/add-custom-token',
  '/select-wallet',
  '/connections',
]);

function routeRequiresWallet(pathname: string) {
  return WALLET_REQUIRED_ROUTES.has(String(pathname || '').trim());
}

function LayoutContent() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const rootSegment = segments[0];
  const notice = useNotice();
  const { hasWallet } = useWalletSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [resumeShieldVisible, setResumeShieldVisible] = useState(false);
  const showSharedNavigation = shouldRenderSharedNavigation(pathname, rootSegment, { hasWallet });
  const backgroundedAtRef = useRef<number | null>(null);
  const protectedAppRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    void hasPasscode()
      .then((value) => {
        if (mounted) {
          protectedAppRef.current = value;
        }
      })
      .catch(() => {
        if (mounted) {
          protectedAppRef.current = false;
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return subscribeLockOverlayRelease(() => {
      setResumeShieldVisible(false);
    });
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    notice.hideNotice();
  }, [notice, pathname]);

  useEffect(() => {
    let cancelled = false;

    if (!routeRequiresWallet(pathname)) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const activeWallet = await getActiveWallet().catch(() => null);

      if (!cancelled && !activeWallet) {
        router.replace('/wallet-access');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasWallet, pathname, router]);

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
          protectedAppRef.current = protectedApp;

          if (!protectedApp) {
            setResumeShieldVisible(false);
            return;
          }

          const autoLockMode = await getAutoLockMode().catch(() => '1m' as const);
          const autoLockDelayMs = getAutoLockDelayMs(autoLockMode);

          if (autoLockDelayMs === null) {
            setResumeShieldVisible(false);
            return;
          }

          const elapsed = Date.now() - backgroundedAt;
          const isUnlockRoute = pathname === '/unlock';
          const isPasscodeSetupRoute = pathname === '/create-passcode' || pathname === '/confirm-passcode';
          const isScanRoute = pathname === '/scan';

          if (!isUnlockRoute && !isPasscodeSetupRoute && !isScanRoute && elapsed >= autoLockDelayMs) {
            router.replace('/unlock');
            return;
          }

          setResumeShieldVisible(false);
        })();

        return;
      }

      if (nextState === 'inactive' || nextState === 'background') {
        backgroundedAtRef.current = Date.now();

        if (protectedAppRef.current && pathname !== '/unlock') {
          setResumeShieldVisible(true);
        }
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
      {resumeShieldVisible ? <View pointerEvents="none" style={styles.resumeShield} /> : null}
      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
  });
  const splashHiddenRef = useRef(false);

  useEffect(() => {
    if (loaded && !splashHiddenRef.current) {
      splashHiddenRef.current = true;
      void SplashScreen.hideAsync().catch(() => null);
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

const styles = StyleSheet.create({
  resumeShield: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgb(10,10,10)',
    zIndex: 1000,
  },
});
