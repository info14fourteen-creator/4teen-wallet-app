import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import Svg, { Defs, Line, LinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme/tokens';
import { useNotice } from '../notice/notice-provider';
import { useWalletSession } from '../wallet/wallet-session';
import { ensureSigningWalletActive } from '../services/wallet/storage';
import { shouldHideFooterByRoute } from './navigation-routes';
import FourteenWalletLoader from './fourteen-wallet-loader.tsx';
import LottieIcon from './lottie-icon';

const footerHomeCoreSource = require('../../assets/icons/footer/footer_home_orange.json');
const footerHomeGridSource = require('../../assets/icons/footer/footer_home_red.json');
const footerEarnOrangeSource = require('../../assets/icons/footer/footer_earn_orange_v2.json');
const footerEarnGreenSource = require('../../assets/icons/footer/footer_earn_green_v2.json');
const footerBuySource = require('../../assets/icons/footer/footer_buy_press_v8.json');
const footerBuyIdleSource = require('../../assets/icons/footer/footer_buy_idle_v8.json');
const footerAirdropSource = require('../../assets/icons/footer/footer_airdrop_press_v7.json');
const footerAirdropIdleSource = require('../../assets/icons/footer/footer_airdrop_idle_v7.json');
const footerAmbassadorSource = require('../../assets/icons/footer/footer_ambassador_press_v7.json');
const footerAmbassadorIdleSource = require('../../assets/icons/footer/footer_ambassador_idle_v7.json');
const footerSendSource = require('../../assets/icons/footer/footer_send.json');
const footerSwapSource = require('../../assets/icons/footer/footer_swap.json');
const footerInfoSource = require('../../assets/icons/footer/footer_info.json');
const footerInfoIdleSource = require('../../assets/icons/footer/footer_info_idle.json');
const footerLiquiditySource = require('../../assets/icons/footer/footer_liquidity.json');
const footerLiquidityIdleSource = require('../../assets/icons/footer/footer_liquidity_idle.json');
const footerUnlockSource = require('../../assets/icons/footer/footer_unlock.json');
const footerUnlockIdleSource = require('../../assets/icons/footer/footer_unlock_idle.json');

export const FOOTER_NAV_HEIGHT = 78;
export const FOOTER_NAV_RESERVED_SPACE = 70;
export const FOOTER_NAV_BOTTOM_OFFSET = 18;
const HIDDEN_ROUTES = new Set([
  '/',
  '/index',
  '/unlock',
  '/create-passcode',
  '/confirm-passcode',
]);

type FooterNavProps = {
  forceVisible?: boolean;
  style?: ViewStyle;
};

type FooterItemProps = {
  label: string;
  active: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  activeIcon: keyof typeof MaterialCommunityIcons.glyphMap;
  activeColor: string;
  onPress: () => void;
  animatedSource?: object | number;
  animatedProgress?: number;
  animatedFrame?: number;
  activePressAnimation?: FooterPressAnimation | null;
  activePressPlayToken?: number;
  onPressAnimationFinish?: (isCancelled: boolean) => void;
};

type FooterMode = 'core' | 'home' | 'earn';

type FooterNavItemConfig = {
  label: string;
  active: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  activeIcon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  animatedSource?: object | number;
  animatedProgress?: number;
  animatedFrame?: number;
  pressAnimatedSource?: object | number;
  pressAnimationFrames?: [number, number];
  pressAnimationSpeed?: number;
};

type FirstFooterAnimation = {
  source: object | number;
  frames: [number, number];
  speed: number;
};

type FirstFooterStaticBridge = {
  source: object | number;
  progress?: number;
  frame?: number;
};

type EdgeFooterAnimation = {
  source: object | number;
  frames: [number, number];
  speed: number;
  colorFilters?: { keypath: string; color: string }[];
};

type LastFooterStaticBridge = {
  source: object | number;
  progress?: number;
  frame?: number;
  colorFilters?: { keypath: string; color: string }[];
};

type FooterPressAnimation = {
  label: string;
  source: object | number;
  frames: [number, number];
  speed: number;
};

function withAlpha(color: string, alpha: number) {
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
  }

  return color;
}

export default function FooterNav({ forceVisible = false, style }: FooterNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const notice = useNotice();
  const { hasWallet, activeWalletKind, footerTickerItems, chromeLoaderVisible } = useWalletSession();

  const [barWidth, setBarWidth] = useState(0);
  const [tickerIndex, setTickerIndex] = useState(0);
  const modeTransition = useRef(new Animated.Value(0)).current;
  const previousModeRef = useRef<FooterMode | null>(null);
  const [firstItemAnimation, setFirstItemAnimation] = useState<FirstFooterAnimation | null>(null);
  const [firstItemPlayToken, setFirstItemPlayToken] = useState(0);
  const [firstItemStaticBridge, setFirstItemStaticBridge] = useState<FirstFooterStaticBridge | null>(null);
  const firstAnimationCompletionRef = useRef<(() => void) | null>(null);
  const firstAnimationPendingClearRef = useRef(false);
  const firstAnimationStartedPathRef = useRef<string | null>(null);
  const [lastItemAnimation, setLastItemAnimation] = useState<EdgeFooterAnimation | null>(null);
  const [lastItemPlayToken, setLastItemPlayToken] = useState(0);
  const [lastItemStaticBridge, setLastItemStaticBridge] = useState<LastFooterStaticBridge | null>(null);
  const lastAnimationCompletionRef = useRef<(() => void) | null>(null);
  const lastAnimationPendingClearRef = useRef(false);
  const lastAnimationStartedPathRef = useRef<string | null>(null);
  const [footerPressAnimation, setFooterPressAnimation] = useState<FooterPressAnimation | null>(null);
  const [footerPressPlayToken, setFooterPressPlayToken] = useState(0);
  const footerPressCompletionRef = useRef<(() => void) | null>(null);
  const footerPressPendingClearRef = useRef(false);
  const footerPressStartedPathRef = useRef<string | null>(null);
  const tickerIdsSignature = useMemo(() => {
    return footerTickerItems.map((item) => item.id).join('|');
  }, [footerTickerItems]);

  useEffect(() => {
    setTickerIndex(0);
  }, [tickerIdsSignature]);

  useEffect(() => {
    if (!footerTickerItems.length) return;

    const timer = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % footerTickerItems.length);
    }, 2600);

    return () => clearInterval(timer);
  }, [footerTickerItems.length]);

  const tickerItem = useMemo(() => {
    return footerTickerItems[tickerIndex % footerTickerItems.length] || null;
  }, [footerTickerItems, tickerIndex]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setBarWidth(event.nativeEvent.layout.width);
  };

  const circleRadius = 29;
  const lineY = 26;
  const linePadding = 18;

  const isHomeRoute =
    pathname === '/home' ||
    pathname === '/buy-4teen' ||
    pathname === '/unlock-timeline' ||
    pathname === '/liquidity-controller' ||
    pathname === '/liquidity-confirm' ||
    pathname === '/earn';
  const isSendActive =
    pathname === '/send' || pathname === '/send-confirm' || pathname === '/address-book';
  const isWalletActive =
    pathname === '/wallet' ||
    pathname === '/select-wallet' ||
    pathname === '/wallets' ||
    pathname === '/wallet-manager' ||
    pathname === '/token-details' ||
    pathname === '/manage-crypto' ||
    pathname === '/add-custom-token' ||
    pathname === '/backup-private-key' ||
    pathname === '/multisig-transactions' ||
    pathname === '/connections';
  const isSwapActive = pathname === '/swap' || pathname === '/swap-confirm';
  const isEarnRoute =
    pathname === '/buy' ||
    pathname === '/buy-confirm' ||
    pathname === '/airdrop' ||
    pathname === '/ambassador-program';
  const footerModeFromPath: FooterMode = isEarnRoute ? 'earn' : isHomeRoute ? 'home' : 'core';
  const footerMode: FooterMode = footerModeFromPath;
  const footerModeMeta = useMemo(() => {
    if (footerMode === 'home') {
      return {
        label: 'HOME GRID',
        color: colors.red,
      };
    }

    if (footerMode === 'earn') {
      return {
        label: 'EARN GRID',
        color: colors.green,
      };
    }

    return {
      label: 'MAIN GRID',
      color: colors.white,
    };
  }, [footerMode]);
  const footerActiveColor =
    footerMode === 'home' ? colors.red : footerMode === 'earn' ? colors.green : colors.accent;

  const showFirstAnimation = useCallback((animation: FirstFooterAnimation) => {
    setFirstItemAnimation(animation);
    setFirstItemPlayToken((value) => value + 1);
  }, []);

  const showLastAnimation = useCallback((animation: EdgeFooterAnimation) => {
    setLastItemAnimation(animation);
    setLastItemPlayToken((value) => value + 1);
  }, []);

  const handleFirstAnimationFinish = useCallback(
    (isCancelled: boolean) => {
      if (isCancelled) {
        return;
      }

      const onComplete = firstAnimationCompletionRef.current;
      firstAnimationCompletionRef.current = null;
      requestAnimationFrame(() => {
        onComplete?.();
      });
    },
    []
  );

  const playFirstAnimationThen = (animation: FirstFooterAnimation, onComplete: () => void) => {
    firstAnimationPendingClearRef.current = true;
    firstAnimationStartedPathRef.current = pathname;
    firstAnimationCompletionRef.current = onComplete;
    showFirstAnimation(animation);
  };

  const handleLastAnimationFinish = useCallback((isCancelled: boolean) => {
    if (isCancelled) {
      return;
    }

    const onComplete = lastAnimationCompletionRef.current;
    lastAnimationCompletionRef.current = null;
    requestAnimationFrame(() => {
      onComplete?.();
    });
  }, []);

  const playLastAnimationThen = (animation: EdgeFooterAnimation, onComplete: () => void) => {
    lastAnimationPendingClearRef.current = true;
    lastAnimationStartedPathRef.current = pathname;
    lastAnimationCompletionRef.current = onComplete;
    showLastAnimation(animation);
  };

  const playFooterPressAnimationThen = (
    label: string,
    source: object | number,
    frames: [number, number],
    speed: number,
    onComplete: () => void
  ) => {
    footerPressPendingClearRef.current = true;
    footerPressStartedPathRef.current = pathname;
    footerPressCompletionRef.current = onComplete;
    setFooterPressAnimation({
      label,
      source,
      frames,
      speed,
    });
    setFooterPressPlayToken((value) => value + 1);
  };

  const handleFooterPressAnimationFinish = useCallback((isCancelled: boolean) => {
    if (isCancelled) {
      return;
    }
    const onComplete = footerPressCompletionRef.current;
    footerPressCompletionRef.current = null;
    requestAnimationFrame(() => {
      onComplete?.();
    });
  }, []);

  useEffect(() => {
    if (!firstAnimationPendingClearRef.current) {
      return;
    }
    if (firstAnimationStartedPathRef.current === pathname) {
      return;
    }
    firstAnimationPendingClearRef.current = false;
    firstAnimationStartedPathRef.current = null;
    setFirstItemAnimation(null);
    setFirstItemStaticBridge(null);
  }, [pathname]);

  useEffect(() => {
    if (!footerPressPendingClearRef.current) {
      return;
    }
    if (footerPressStartedPathRef.current === pathname) {
      return;
    }
    footerPressPendingClearRef.current = false;
    footerPressStartedPathRef.current = null;
    setFooterPressAnimation(null);
  }, [footerMode, pathname, footerPressAnimation?.label]);

  useEffect(() => {
    if (!lastAnimationPendingClearRef.current) {
      return;
    }
    if (lastAnimationStartedPathRef.current === pathname) {
      return;
    }
    lastAnimationPendingClearRef.current = false;
    lastAnimationStartedPathRef.current = null;
    setLastItemAnimation(null);
    setLastItemStaticBridge(null);
  }, [pathname]);

  useEffect(() => {
    if (previousModeRef.current === null) {
      previousModeRef.current = footerMode;
      return;
    }

    if (previousModeRef.current === footerMode) {
      return;
    }

    previousModeRef.current = footerMode;

    modeTransition.stopAnimation();
    modeTransition.setValue(0);

    Animated.timing(modeTransition, {
      toValue: 1,
      duration: 1220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      modeTransition.setValue(0);
    });
  }, [footerMode, modeTransition, showLastAnimation]);

  if (!forceVisible && (HIDDEN_ROUTES.has(pathname) || shouldHideFooterByRoute(pathname))) return null;

  const goHome = () => router.replace('/unlock-timeline' as any);
  const goHomeFromFooter = () => {
    playFirstAnimationThen(
      {
        source: footerHomeCoreSource,
        frames: [0, 89],
        speed: 1.5,
      },
      () => {
        setFirstItemAnimation(null);
        setFirstItemStaticBridge({
          source: footerHomeGridSource,
          frame: 89,
        });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            goHome();
          });
        });
      }
    );
  };
  const goSend = async () => {
    if (activeWalletKind === 'watch-only') {
      const signingWallet = await ensureSigningWalletActive();

      if (!signingWallet) {
        notice.showNeutralNotice(
          'Send requires a signing wallet. Import or switch to a full-access wallet first.',
          3200
        );
        return;
      }
    }

    router.push('/send');
  };
  const goWallet = () => router.replace(hasWallet ? '/wallet' : '/create-wallet');
  const goWalletFromFooter = () => {
    playFirstAnimationThen(
      {
        source: footerHomeGridSource,
        frames: [89, 0],
        speed: 1.5,
      },
      () => {
        setFirstItemStaticBridge({
          source: footerHomeCoreSource,
          frame: 0,
        });
        goWallet();
      }
    );
  };
  const guardedGoSwap = async () => {
    if (activeWalletKind === 'watch-only') {
      const signingWallet = await ensureSigningWalletActive();

      if (!signingWallet) {
        notice.showNeutralNotice(
          'Swap requires a signing wallet. Import or switch to a full-access wallet first.',
          3200
        );
        return;
      }
    }

    router.push('/swap' as any);
  };
  const goBuy = () => router.push('/buy' as any);
  const goAirdrop = () => router.push('/airdrop' as any);
  const goAmbassador = () => router.push('/ambassador-program' as any);
  const goUnlock = () => router.push('/unlock-timeline' as any);
  const goLiquidity = () => router.push('/liquidity-controller' as any);
  const goInfo = () => router.push('/earn' as any);
  const goEarnFromFooter = () => {
    playLastAnimationThen(
      {
        source: footerEarnOrangeSource,
        frames: [0, 29],
        speed: 1,
      },
      () => {
        setLastItemAnimation(null);
        setLastItemStaticBridge({
          source: footerEarnGreenSource,
          frame: 29,
        });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            goBuy();
          });
        });
      }
    );
  };
  const goMainFromEarnFooter = () => {
    playLastAnimationThen(
      {
        source: footerEarnGreenSource,
        frames: [29, 0],
        speed: 1,
      },
      () => {
        setLastItemAnimation(null);
        setLastItemStaticBridge({
          source: footerEarnOrangeSource,
          frame: 0,
        });
        goWallet();
      }
    );
  };

  const footerItems: [FooterNavItemConfig, FooterNavItemConfig, FooterNavItemConfig, FooterNavItemConfig] =
    footerMode === 'home'
        ? [
          {
            label: 'MAIN',
            active: false,
            icon: 'menu',
            activeIcon: 'menu',
            animatedSource: footerHomeGridSource,
            animatedFrame: 89,
            onPress: goWalletFromFooter,
          },
          {
            label: 'UNLOCK',
            active: pathname === '/unlock-timeline',
            icon: 'timeline-clock-outline',
            activeIcon: 'timeline-clock',
            animatedSource: footerUnlockIdleSource,
            animatedFrame: 129,
            pressAnimatedSource: footerUnlockSource,
            pressAnimationFrames: [0, 130],
            pressAnimationSpeed: 2,
            onPress: goUnlock,
          },
          {
            label: 'LIQUIDITY',
            active: pathname === '/liquidity-controller' || pathname === '/liquidity-confirm',
            icon: 'chart-timeline-variant',
            activeIcon: 'chart-timeline-variant-shimmer',
            animatedSource: footerLiquidityIdleSource,
            animatedFrame: 119,
            pressAnimatedSource: footerLiquiditySource,
            pressAnimationFrames: [0, 120],
            pressAnimationSpeed: 2,
            onPress: goLiquidity,
          },
          {
            label: 'INFO',
            active: pathname === '/earn',
            icon: 'information-outline',
            activeIcon: 'information',
            animatedSource: footerInfoIdleSource,
            animatedFrame: 89,
            pressAnimatedSource: footerInfoSource,
            pressAnimationFrames: [0, 90],
            pressAnimationSpeed: 2,
            onPress: goInfo,
          },
        ]
      : footerMode === 'earn'
        ? [
            {
              label: 'BUY',
              active: pathname === '/buy' || pathname === '/buy-confirm',
              icon: 'cart-outline',
              activeIcon: 'cart',
              animatedSource: pathname === '/buy' || pathname === '/buy-confirm' ? footerBuySource : footerBuyIdleSource,
              animatedFrame: pathname === '/buy' || pathname === '/buy-confirm' ? 89 : 149,
              pressAnimatedSource: footerBuySource,
              pressAnimationFrames: [0, 89],
              pressAnimationSpeed: 2,
              onPress: goBuy,
            },
            {
              label: 'AIRDROP',
              active: pathname === '/airdrop',
              icon: 'gift-outline',
              activeIcon: 'gift',
              animatedSource: pathname === '/airdrop' ? footerAirdropSource : footerAirdropIdleSource,
              animatedFrame: pathname === '/airdrop' ? 89 : 0,
              pressAnimatedSource: footerAirdropSource,
              pressAnimationFrames: [0, 89],
              pressAnimationSpeed: 2,
              onPress: goAirdrop,
            },
            {
              label: 'AMBASSADOR',
              active: pathname === '/ambassador-program',
              icon: 'account-star-outline',
              activeIcon: 'account-star',
              animatedSource: footerAmbassadorIdleSource,
              animatedFrame: 149,
              pressAnimatedSource: footerAmbassadorSource,
              pressAnimationFrames: [0, 150],
              pressAnimationSpeed: 2,
              onPress: goAmbassador,
            },
          {
            label: 'MAIN',
            active: false,
            icon: 'menu',
            activeIcon: 'menu',
            animatedSource: footerEarnGreenSource,
            animatedFrame: 29,
            onPress: goMainFromEarnFooter,
          },
          ]
        : [
            {
            label: 'HOME',
            active: false,
            icon: 'home-variant-outline',
            activeIcon: 'home-variant',
            animatedSource: footerHomeCoreSource,
            animatedProgress: 0,
            onPress: goHomeFromFooter,
          },
            {
              label: 'SEND',
              active: isSendActive,
              icon: 'arrow-top-right-thin',
              activeIcon: 'arrow-top-right',
              animatedSource: footerSendSource,
              animatedFrame: 119,
              pressAnimatedSource: footerSendSource,
              pressAnimationFrames: [0, 119],
              pressAnimationSpeed: 2,
              onPress: goSend,
            },
            {
              label: 'SWAP',
              active: isSwapActive,
              icon: 'swap-horizontal',
              activeIcon: 'swap-horizontal-bold',
              animatedSource: footerSwapSource,
              animatedFrame: 119,
              pressAnimatedSource: footerSwapSource,
              pressAnimationFrames: [0, 119],
              pressAnimationSpeed: 2,
              onPress: guardedGoSwap,
            },
            {
              label: 'EARN',
              active: false,
              icon: 'chart-line',
              activeIcon: 'chart-line-variant',
              animatedSource: footerEarnOrangeSource,
              animatedFrame: 0,
              onPress: goEarnFromFooter,
            },
          ];

  const halfBarWidth = Math.max(barWidth / 2, 160);
  const leftBeamTranslateX = modeTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -halfBarWidth + 20],
  });
  const rightBeamTranslateX = modeTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, halfBarWidth - 20],
  });
  const scanOpacity = modeTransition.interpolate({
    inputRange: [0, 0.08, 0.82, 1],
    outputRange: [0, 0.95, 0.95, 0],
  });
  const badgeOpacity = modeTransition.interpolate({
    inputRange: [0, 0.08, 0.9, 1],
    outputRange: [0, 1, 1, 0],
  });
  const badgeTranslateY = modeTransition.interpolate({
    inputRange: [0, 0.14, 1],
    outputRange: [10, 0, -8],
  });
  const circleScale = modeTransition.interpolate({
    inputRange: [0, 0.18, 0.6, 1],
    outputRange: [1, 1.08, 1.03, 1],
  });
  return (
    <View pointerEvents="box-none" style={[styles.root, style]}>
      <View
        pointerEvents="none"
        style={[
          styles.bottomScreenFill,
          { height: FOOTER_NAV_BOTTOM_OFFSET + Math.max(insets.bottom, 2) + 2 },
        ]}
      />
      <View style={[styles.host, { paddingBottom: Math.max(insets.bottom, 2) }]}>
        <View style={styles.shell} onLayout={handleLayout}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.modeBadge,
              {
                borderColor: withAlpha(footerModeMeta.color, 0.48),
                backgroundColor: withAlpha(footerModeMeta.color, 0.12),
                opacity: badgeOpacity,
                transform: [{ translateY: badgeTranslateY }],
              },
            ]}
          >
            <Text style={[styles.modeBadgeText, { color: footerModeMeta.color }]}>
              {footerModeMeta.label}
            </Text>
          </Animated.View>

          <View pointerEvents="none" style={[styles.baseFill, { top: lineY - 2, bottom: -20 }]} />
          <View
            pointerEvents="none"
            style={[
              styles.modeTrack,
              { backgroundColor: withAlpha(footerActiveColor, footerMode === 'core' ? 0.12 : 0.18) },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.modeBeam,
              styles.modeBeamLeft,
              {
                backgroundColor: footerActiveColor,
                opacity: scanOpacity,
                transform: [{ translateX: leftBeamTranslateX }],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.modeBeam,
              styles.modeBeamRight,
              {
                backgroundColor: footerActiveColor,
                opacity: scanOpacity,
                transform: [{ translateX: rightBeamTranslateX }],
              },
            ]}
          />

          {barWidth > 0 ? (
            <Svg style={styles.linesSvg} width={barWidth} height={FOOTER_NAV_HEIGHT}>
              <Defs>
                <LinearGradient id="fadeLeft" x1="100%" y1="0%" x2="0%" y2="0%">
                  <Stop offset="0%" stopColor={footerActiveColor} stopOpacity="0.95" />
                  <Stop offset="100%" stopColor={footerActiveColor} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id="fadeRight" x1="0%" y1="0%" x2="100%" y2="0%">
                  <Stop offset="0%" stopColor={footerActiveColor} stopOpacity="0.95" />
                  <Stop offset="100%" stopColor={footerActiveColor} stopOpacity="0" />
                </LinearGradient>
              </Defs>

              <Line
                x1={barWidth / 2 - circleRadius + 10}
                y1={lineY}
                x2={linePadding}
                y2={lineY}
                stroke="url(#fadeLeft)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <Line
                x1={barWidth / 2 + circleRadius - 10}
                y1={lineY}
                x2={barWidth - linePadding}
                y2={lineY}
                stroke="url(#fadeRight)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </Svg>
          ) : null}

          <View style={styles.row}>
            {footerMode === 'earn' ? (
              <FooterItem
                key={`footer-item-0-${footerMode}-${pathname}-${footerItems[0].label}`}
                label={footerItems[0].label}
                active={footerItems[0].active}
                icon={footerItems[0].icon}
                activeIcon={footerItems[0].activeIcon}
                activeColor={footerActiveColor}
                onPress={() => {
                  if (
                    footerItems[0].pressAnimatedSource &&
                    footerItems[0].pressAnimationFrames &&
                    footerItems[0].pressAnimationSpeed
                  ) {
                    playFooterPressAnimationThen(
                      footerItems[0].label,
                      footerItems[0].pressAnimatedSource,
                      footerItems[0].pressAnimationFrames,
                      footerItems[0].pressAnimationSpeed,
                      footerItems[0].onPress
                    );
                    return;
                  }

                  footerItems[0].onPress();
                }}
                animatedSource={footerItems[0].animatedSource}
                animatedProgress={footerItems[0].animatedProgress}
                animatedFrame={footerItems[0].animatedFrame}
                activePressAnimation={
                  footerPressAnimation?.label === footerItems[0].label ? footerPressAnimation : null
                }
                activePressPlayToken={footerPressPlayToken}
                onPressAnimationFinish={handleFooterPressAnimationFinish}
              />
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.button}
                onPress={footerItems[0].onPress}
              >
                {firstItemAnimation ? (
                  <LottieIcon
                    key={`first-animated-${firstItemPlayToken}`}
                    source={firstItemAnimation.source}
                    size={24}
                    playToken={firstItemPlayToken}
                    frames={firstItemAnimation.frames}
                    speed={firstItemAnimation.speed}
                    onAnimationFinish={handleFirstAnimationFinish}
                    style={styles.navIconLottie}
                  />
                ) : firstItemStaticBridge ? (
                  <LottieIcon
                    key={`first-bridge-${footerMode}-${typeof firstItemStaticBridge.frame === 'number' ? `f${firstItemStaticBridge.frame}` : `p${firstItemStaticBridge.progress ?? 0}`}`}
                    source={firstItemStaticBridge.source}
                    size={24}
                    progress={
                      typeof firstItemStaticBridge.frame === 'number'
                        ? undefined
                        : firstItemStaticBridge.progress
                    }
                    staticFrame={firstItemStaticBridge.frame}
                    style={styles.navIconLottie}
                  />
                ) : footerItems[0].animatedSource ? (
                  <LottieIcon
                    key={`first-static-${footerMode}-${typeof footerItems[0].animatedFrame === 'number' ? `f${footerItems[0].animatedFrame}` : `p${footerItems[0].animatedProgress ?? 0}`}`}
                    source={footerItems[0].animatedSource}
                    size={24}
                    progress={
                      typeof footerItems[0].animatedFrame === 'number'
                        ? undefined
                        : footerItems[0].animatedProgress
                    }
                    staticFrame={footerItems[0].animatedFrame}
                    style={styles.navIconLottie}
                  />
                ) : (
                  <MaterialCommunityIcons
                    name={footerItems[0].active ? footerItems[0].activeIcon : footerItems[0].icon}
                    size={22}
                    color={footerItems[0].active ? footerActiveColor : colors.white}
                    style={styles.navIcon}
                  />
                )}
                <Text style={[styles.label, footerItems[0].active && { color: footerActiveColor, opacity: 1 }]}>
                  {footerItems[0].label}
                </Text>
              </TouchableOpacity>
            )}

            <FooterItem
              key={`footer-item-1-${footerMode}-${pathname}-${footerItems[1].label}`}
              label={footerItems[1].label}
              active={footerItems[1].active}
              icon={footerItems[1].icon}
              activeIcon={footerItems[1].activeIcon}
              activeColor={footerActiveColor}
              onPress={() => {
                if (
                  footerItems[1].pressAnimatedSource &&
                  footerItems[1].pressAnimationFrames &&
                  footerItems[1].pressAnimationSpeed
                ) {
                  playFooterPressAnimationThen(
                    footerItems[1].label,
                    footerItems[1].pressAnimatedSource,
                    footerItems[1].pressAnimationFrames,
                    footerItems[1].pressAnimationSpeed,
                    footerItems[1].onPress
                  );
                  return;
                }

                footerItems[1].onPress();
              }}
              animatedSource={footerItems[1].animatedSource}
              animatedProgress={footerItems[1].animatedProgress}
              animatedFrame={footerItems[1].animatedFrame}
              activePressAnimation={
                footerPressAnimation?.label === footerItems[1].label ? footerPressAnimation : null
              }
              activePressPlayToken={footerPressPlayToken}
              onPressAnimationFinish={handleFooterPressAnimationFinish}
            />

            <TouchableOpacity activeOpacity={0.9} style={styles.centerButton} onPress={goWallet}>
              <Animated.View
                style={[
                  styles.circle,
                  { borderColor: footerActiveColor },
                  { transform: [{ scale: circleScale }] },
                ]}
              >
                {chromeLoaderVisible ? (
                  <FourteenWalletLoader active={chromeLoaderVisible} size={32} />
                ) : tickerItem?.logoUri ? (
                  <Image source={{ uri: tickerItem.logoUri }} style={styles.logo} />
                ) : (
                  <View style={[styles.dot, hasWallet ? styles.dotOnline : styles.dotOffline]} />
                )}
              </Animated.View>

              <Text
                style={[
                  styles.centerLabel,
                  isWalletActive && { color: footerActiveColor },
                ]}
              >
                {tickerItem?.balanceLabel || 'WALLET'}
              </Text>
            </TouchableOpacity>

            <FooterItem
              key={`footer-item-2-${footerMode}-${pathname}-${footerItems[2].label}`}
              label={footerItems[2].label}
              active={footerItems[2].active}
              icon={footerItems[2].icon}
              activeIcon={footerItems[2].activeIcon}
              activeColor={footerActiveColor}
              onPress={() => {
                if (
                  footerItems[2].pressAnimatedSource &&
                  footerItems[2].pressAnimationFrames &&
                  footerItems[2].pressAnimationSpeed
                ) {
                  playFooterPressAnimationThen(
                    footerItems[2].label,
                    footerItems[2].pressAnimatedSource,
                    footerItems[2].pressAnimationFrames,
                    footerItems[2].pressAnimationSpeed,
                    footerItems[2].onPress
                  );
                  return;
                }

                footerItems[2].onPress();
              }}
              animatedSource={footerItems[2].animatedSource}
              animatedProgress={footerItems[2].animatedProgress}
              animatedFrame={footerItems[2].animatedFrame}
              activePressAnimation={
                footerPressAnimation?.label === footerItems[2].label ? footerPressAnimation : null
              }
              activePressPlayToken={footerPressPlayToken}
              onPressAnimationFinish={handleFooterPressAnimationFinish}
            />

            {footerMode === 'home' ? (
              <FooterItem
                key={`footer-item-3-${footerMode}-${pathname}-${footerItems[3].label}`}
                label={footerItems[3].label}
                active={footerItems[3].active}
                icon={footerItems[3].icon}
                activeIcon={footerItems[3].activeIcon}
                activeColor={footerActiveColor}
                onPress={() => {
                  if (
                    footerItems[3].pressAnimatedSource &&
                    footerItems[3].pressAnimationFrames &&
                    footerItems[3].pressAnimationSpeed
                  ) {
                    playFooterPressAnimationThen(
                      footerItems[3].label,
                      footerItems[3].pressAnimatedSource,
                      footerItems[3].pressAnimationFrames,
                      footerItems[3].pressAnimationSpeed,
                      footerItems[3].onPress
                    );
                    return;
                  }

                  footerItems[3].onPress();
                }}
                animatedSource={footerItems[3].animatedSource}
                animatedProgress={footerItems[3].animatedProgress}
                animatedFrame={footerItems[3].animatedFrame}
                activePressAnimation={
                  footerPressAnimation?.label === footerItems[3].label ? footerPressAnimation : null
                }
                activePressPlayToken={footerPressPlayToken}
                onPressAnimationFinish={handleFooterPressAnimationFinish}
              />
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.button}
                onPress={footerItems[3].onPress}
              >
                {lastItemAnimation ? (
                  <LottieIcon
                    key={`last-animated-${lastItemPlayToken}`}
                    source={lastItemAnimation.source}
                    size={24}
                    playToken={lastItemPlayToken}
                    frames={lastItemAnimation.frames}
                    speed={lastItemAnimation.speed}
                    onAnimationFinish={handleLastAnimationFinish}
                    style={styles.navIconLottie}
                  />
                ) : lastItemStaticBridge ? (
                  <LottieIcon
                    key={`last-bridge-${footerMode}-${typeof lastItemStaticBridge.frame === 'number' ? `f${lastItemStaticBridge.frame}` : `p${lastItemStaticBridge.progress ?? 0}`}`}
                    source={lastItemStaticBridge.source}
                    size={24}
                    progress={
                      typeof lastItemStaticBridge.frame === 'number'
                        ? undefined
                        : lastItemStaticBridge.progress
                    }
                    staticFrame={lastItemStaticBridge.frame}
                    colorFilters={lastItemStaticBridge.colorFilters}
                    style={styles.navIconLottie}
                  />
                ) : footerItems[3].animatedSource ? (
                  <LottieIcon
                    key={`last-static-${footerMode}-${typeof footerItems[3].animatedFrame === 'number' ? `f${footerItems[3].animatedFrame}` : `p${footerItems[3].animatedProgress ?? 0}`}`}
                    source={footerItems[3].animatedSource}
                    size={24}
                    progress={
                      typeof footerItems[3].animatedFrame === 'number'
                        ? undefined
                        : footerItems[3].animatedProgress
                    }
                    staticFrame={footerItems[3].animatedFrame}
                    style={styles.navIconLottie}
                  />
                ) : (
                  <MaterialCommunityIcons
                    name={footerItems[3].active ? footerItems[3].activeIcon : footerItems[3].icon}
                    size={22}
                    color={footerItems[3].active ? footerActiveColor : colors.white}
                    style={styles.navIcon}
                  />
                )}
                <Text style={[styles.label, footerItems[3].active && { color: footerActiveColor, opacity: 1 }]}>
                  {footerItems[3].label}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function FooterItem({
  label,
  active,
  icon,
  activeIcon,
  activeColor,
  onPress,
  animatedSource,
  animatedProgress,
  animatedFrame,
  activePressAnimation,
  activePressPlayToken = 0,
  onPressAnimationFinish,
}: FooterItemProps) {
  const iconName = active ? activeIcon : icon;

  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.button} onPress={onPress}>
      {activePressAnimation ? (
        <LottieIcon
          key={`footer-press-${label}-${activePressPlayToken}`}
          source={activePressAnimation.source}
          size={24}
          playToken={activePressPlayToken}
          frames={activePressAnimation.frames}
          speed={activePressAnimation.speed}
          onAnimationFinish={onPressAnimationFinish}
          style={styles.navIconLottie}
        />
      ) : animatedSource ? (
        <LottieIcon
          key={`footer-idle-${label}-${active ? 'active' : 'idle'}-${typeof animatedFrame === 'number' ? animatedFrame : `p${animatedProgress ?? 0}`}`}
          source={animatedSource}
          size={24}
          progress={typeof animatedFrame === 'number' ? undefined : animatedProgress}
          staticFrame={animatedFrame}
          style={styles.navIconLottie}
        />
      ) : (
        <MaterialCommunityIcons
          name={iconName}
          size={22}
          color={active ? activeColor : colors.white}
          style={styles.navIcon}
        />
      )}
      <Text style={[styles.label, active && { color: activeColor, opacity: 1 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
  },

  bottomScreenFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    zIndex: 79,
  },

  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: FOOTER_NAV_BOTTOM_OFFSET,
    height: FOOTER_NAV_HEIGHT,
    justifyContent: 'center',
    zIndex: 80,
  },

  shell: {
    height: FOOTER_NAV_HEIGHT,
    justifyContent: 'center',
    position: 'relative',
  },

  modeBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: -22,
    minWidth: 108,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: radius.sm,
    zIndex: 4,
  },

  modeBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 1.2,
    textAlign: 'center',
  },

  baseFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },

  linesSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingBottom: 0,
  },

  modeTrack: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 24,
    height: 1,
    borderRadius: 999,
  },

  modeBeam: {
    position: 'absolute',
    top: 24,
    width: 96,
    height: 1,
    borderRadius: 999,
  },

  modeBeamLeft: {
    left: '50%',
    marginLeft: -96,
  },

  modeBeamRight: {
    left: '50%',
    marginLeft: 0,
  },

  button: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    paddingHorizontal: 2,
  },

  navIcon: {
    opacity: 0.96,
  },

  navIconLottie: {
    opacity: 0.96,
  },

  label: {
    fontSize: 9,
    lineHeight: 11,
    fontFamily: 'Sora_600SemiBold',
    color: colors.white,
    marginTop: 7,
    textAlign: 'center',
    opacity: 0.88,
  },

  centerButton: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1.2,
    paddingHorizontal: 4,
    marginTop: 4,
    position: 'relative',
  },

  circle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
    zIndex: 2,
  },

  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },

  dotOnline: {
    backgroundColor: colors.green,
    shadowColor: colors.green,
    shadowRadius: 10,
    shadowOpacity: 0.8,
  },

  dotOffline: {
    backgroundColor: colors.red,
    shadowColor: colors.red,
    shadowRadius: 10,
    shadowOpacity: 0.8,
  },

  logo: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
  },

  centerLabel: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'Sora_600SemiBold',
    color: colors.white,
    textAlign: 'center',
  },

});
