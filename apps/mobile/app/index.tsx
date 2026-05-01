import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useI18n } from '../src/i18n';
import { colors, fontFamilies, spacing, typography } from '../src/theme/tokens';
import { hasPasscode } from '../src/security/local-auth';
import {
  buildWalletHomeVisibleTokensStorageKey,
  getActiveWallet,
  listWallets,
} from '../src/services/wallet/storage';
import { getWalletPortfolio } from '../src/services/wallet/portfolio';
import { getCustomTokenCatalog } from '../src/services/tron/api';

const INITIAL_PROGRESS = 4;
const STAGE_WEIGHTS = {
  passcode: 18,
  activeWallet: 18,
  wallets: 10,
  visibleTokens: 10,
  customCatalog: 12,
  portfolio: 20,
  routeDecision: 12,
  routeHandoff: 10,
} as const;

type BootStage = keyof typeof STAGE_WEIGHTS;

export default function BootScreen() {
  const router = useRouter();
  useI18n();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let mounted = true;
    const completedStages = new Set<BootStage>();
    let currentTarget = 0;

    const animate = (value: number, duration: number) =>
      new Promise<void>((resolve) => {
        Animated.timing(progressAnim, {
          toValue: value,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: false,
        }).start(() => resolve());
      });

    const setVal = async (value: number, duration: number) => {
      if (!mounted) return;
      currentTarget = value;
      setProgress(value);
      await animate(value, duration);
    };

    const completeStage = (stage: BootStage, duration = 90) => {
      if (!mounted || completedStages.has(stage)) return;

      completedStages.add(stage);
      const nextValue = Math.min(
        114,
        INITIAL_PROGRESS +
          Array.from(completedStages).reduce((sum, key) => sum + STAGE_WEIGHTS[key], 0)
      );

      if (nextValue <= currentTarget) return;

      currentTarget = nextValue;
      setProgress(nextValue);
      Animated.timing(progressAnim, {
        toValue: nextValue,
        duration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    };

    const run = async () => {
      await setVal(INITIAL_PROGRESS, 90);

      const passcodePromise = hasPasscode()
        .catch(() => false)
        .finally(() => completeStage('passcode'));
      const activeWalletPromise = getActiveWallet()
        .catch(() => null)
        .then((wallet) => {
          if (!wallet) {
            completeStage('visibleTokens', 70);
            completeStage('customCatalog', 70);
            completeStage('portfolio', 70);
          }

          return wallet;
        })
        .finally(() => completeStage('activeWallet'));
      const walletsPromise = listWallets()
        .catch(() => [])
        .finally(() => completeStage('wallets'));

      const warmupsPromise = (async () => {
        const activeWallet = await activeWalletPromise;

        await walletsPromise;

        if (!activeWallet) {
          return;
        }

        const visibleTokensPromise = AsyncStorage.getItem(
          buildWalletHomeVisibleTokensStorageKey(activeWallet.id)
        )
          .catch(() => null)
          .finally(() => completeStage('visibleTokens'));
        const customCatalogPromise = getCustomTokenCatalog(activeWallet.id)
          .catch(() => [])
          .finally(() => completeStage('customCatalog'));
        const portfolioPromise = getWalletPortfolio(activeWallet.address)
          .catch(() => null)
          .finally(() => completeStage('portfolio'));

        await Promise.allSettled([
          visibleTokensPromise,
          customCatalogPromise,
          portfolioPromise,
        ]);
      })();

      const [protectedApp, activeWallet] = await Promise.all([
        passcodePromise,
        activeWalletPromise,
      ]);
      completeStage('routeDecision', 100);

      if (!mounted) return;

      if (protectedApp) {
        completeStage('routeHandoff', 110);
        currentTarget = 114;
        setProgress(114);
        await animate(114, 110);
        router.replace('/unlock');
        return;
      }

      if (activeWallet) {
        await warmupsPromise;
      } else {
        await walletsPromise;
      }

      completeStage('routeHandoff', 110);
      currentTarget = 114;
      setProgress(114);
      await animate(114, 110);
      router.replace(activeWallet ? '/wallet' : '/wallet-access');
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [progressAnim, router]);

  const color = progress >= 100 ? colors.accent : colors.offWhite;

  const width = progressAnim.interpolate({
    inputRange: [0, 114],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.screen}>
      <View style={styles.center}>
        <Text style={[styles.percent, { color }]}>
          {progress}%
        </Text>

        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgBoot,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    width: '76%',
    alignItems: 'center',
  },
  percent: {
    fontSize: typography.bootPercent,
    fontFamily: fontFamilies.display,
    marginBottom: spacing[2],
    letterSpacing: 0,
  },
  track: {
    width: '100%',
    height: 2,
  },
  fill: {
    height: 2,
  },
});
