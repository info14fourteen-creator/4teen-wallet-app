import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState, type ErrorInfo } from 'react';
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
import { AppErrorBoundary } from '../src/errors/app-error-boundary';
import {
  emitRuntimeRecovery,
  getRuntimeRouteContext,
  pushRuntimePath,
  resolveRecoveryPath,
  subscribeRuntimeRecovery,
  updateRuntimeRouteContext,
} from '../src/errors/runtime-recovery';
import { reportAppRuntimeError } from '../src/services/app-runtime-errors';
import { NavigationChrome } from '../src/ui/navigation';
import { shouldRenderSharedNavigation } from '../src/ui/navigation-routes';
import { captureDeferredReferral, captureReferralFromUrl } from '../src/services/referral';
import { getAutoLockDelayMs, getAutoLockMode, hasPasscode } from '../src/security/local-auth';
import { subscribeLockOverlayRelease } from '../src/security/lock-overlay';
import { getActiveWallet } from '../src/services/wallet/storage';
import FourteenWalletLoader from '../src/ui/fourteen-wallet-loader';

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
  const { activeWalletKind, hasWallet } = useWalletSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [resumeShieldVisible, setResumeShieldVisible] = useState(false);
  const [appRecoveryVisible, setAppRecoveryVisible] = useState(false);
  const [boundaryResetKey, setBoundaryResetKey] = useState(0);
  const showSharedNavigation = shouldRenderSharedNavigation(pathname, rootSegment, { hasWallet });
  const backgroundedAtRef = useRef<number | null>(null);
  const protectedAppRef = useRef(false);
  const stablePathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStablePathTimer = useCallback(() => {
    if (stablePathTimerRef.current) {
      clearTimeout(stablePathTimerRef.current);
      stablePathTimerRef.current = null;
    }
  }, []);

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
    updateRuntimeRouteContext({
      currentPath: pathname,
      hasWallet,
      activeWalletKind,
    });
    pushRuntimePath(pathname);
  }, [activeWalletKind, hasWallet, pathname]);

  useEffect(() => {
    clearStablePathTimer();

    if (appRecoveryVisible) {
      return;
    }

    stablePathTimerRef.current = setTimeout(() => {
      updateRuntimeRouteContext({
        lastStablePath: pathname,
      });
    }, 450);

    return () => {
      clearStablePathTimer();
    };
  }, [appRecoveryVisible, clearStablePathTimer, pathname]);

  useEffect(() => {
    setMenuOpen(false);
    notice.hideNotice();
  }, [notice, pathname]);

  useEffect(() => {
    const unsubscribe = subscribeRuntimeRecovery((event) => {
      setMenuOpen(false);
      setResumeShieldVisible(false);
      setAppRecoveryVisible(true);

      const targetPath = resolveRecoveryPath({
        ...getRuntimeRouteContext(),
        currentPath: event.currentPath,
        lastStablePath: event.lastStablePath,
      });

      router.replace(targetPath as any);

      setTimeout(() => {
        setBoundaryResetKey((current) => current + 1);
        setAppRecoveryVisible(false);
      }, 220);
    });

    return unsubscribe;
  }, [router]);

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
    const errorUtils = (globalThis as any)?.ErrorUtils;
    const previousGlobalHandler =
      typeof errorUtils?.getGlobalHandler === 'function' ? errorUtils.getGlobalHandler() : null;
    const previousUnhandledRejection = (globalThis as any).onunhandledrejection;

    if (typeof errorUtils?.setGlobalHandler === 'function') {
      errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        const context = getRuntimeRouteContext();
        const fatal = Boolean(isFatal);
        const payload = {
          source: 'global' as const,
          fatal,
          title: `App runtime error on ${context.currentPath || 'unknown'}`,
          message: error?.message || 'Unknown runtime error',
          currentPath: context.currentPath,
          lastStablePath: context.lastStablePath,
          recentPaths: context.recentPaths,
          stack: error?.stack || null,
          details: {
            errorName: error?.name || 'Error',
            activeWalletKind: context.activeWalletKind,
            hasWallet: context.hasWallet,
          },
        };

        void reportAppRuntimeError(payload).catch(() => null);

        if (!__DEV__) {
          emitRuntimeRecovery({
            ...payload,
            name: error?.name || 'Error',
            triggeredAtIso: new Date().toISOString(),
          });
          return;
        }

        if (typeof previousGlobalHandler === 'function') {
          previousGlobalHandler(error, isFatal);
        }
      });
    }

    (globalThis as any).onunhandledrejection = (event: any) => {
      const reason = event?.reason;
      const context = getRuntimeRouteContext();
      const message =
        (reason instanceof Error ? reason.message : String(reason || 'Unhandled promise rejection')) ||
        'Unhandled promise rejection';

      void reportAppRuntimeError({
        source: 'unhandledrejection',
        fatal: false,
        title: `Unhandled promise rejection on ${context.currentPath || 'unknown'}`,
        message,
        currentPath: context.currentPath,
        lastStablePath: context.lastStablePath,
        recentPaths: context.recentPaths,
        stack: reason instanceof Error ? reason.stack : null,
        details: {
          activeWalletKind: context.activeWalletKind,
          hasWallet: context.hasWallet,
        },
      }).catch(() => null);

      if (typeof previousUnhandledRejection === 'function') {
        previousUnhandledRejection(event);
      }
    };

    return () => {
      if (typeof errorUtils?.setGlobalHandler === 'function' && previousGlobalHandler) {
        errorUtils.setGlobalHandler(previousGlobalHandler);
      }

      (globalThis as any).onunhandledrejection = previousUnhandledRejection;
    };
  }, []);

  const handleBoundaryError = useCallback((error: Error, info: ErrorInfo) => {
    const context = getRuntimeRouteContext();
    const payload = {
      source: 'boundary' as const,
      fatal: false,
      title: `Render error on ${context.currentPath || 'unknown'}`,
      message: error?.message || 'Unknown render error',
      currentPath: context.currentPath,
      lastStablePath: context.lastStablePath,
      recentPaths: context.recentPaths,
      stack: error?.stack || null,
      componentStack: info?.componentStack || null,
      details: {
        errorName: error?.name || 'Error',
        activeWalletKind: context.activeWalletKind,
        hasWallet: context.hasWallet,
      },
    };

    void reportAppRuntimeError(payload).catch(() => null);

    emitRuntimeRecovery({
      ...payload,
      name: error?.name || 'Error',
      triggeredAtIso: new Date().toISOString(),
    });
  }, []);

  const recoveryOverlay = (
    <View style={styles.appRecoveryOverlay}>
      <FourteenWalletLoader active size={54} />
    </View>
  );

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
      <AppErrorBoundary resetKey={boundaryResetKey} onError={handleBoundaryError} fallback={recoveryOverlay}>
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
        </>
      </AppErrorBoundary>
      {resumeShieldVisible ? <View pointerEvents="none" style={styles.resumeShield} /> : null}
      {appRecoveryVisible ? recoveryOverlay : null}
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
  appRecoveryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgb(10,10,10)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1400,
  },
});
