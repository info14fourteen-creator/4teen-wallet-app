import { useEffect, useMemo, useRef, useState } from 'react';
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

import { colors } from '../theme/tokens';
import { useNotice } from '../notice/notice-provider';
import { useWalletSession } from '../wallet/wallet-session';
import { ensureSigningWalletActive } from '../services/wallet/storage';
import { shouldHideFooterByRoute } from './navigation-routes';
import FourteenWalletLoader from './fourteen-wallet-loader.tsx';

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
};

type FooterMode = 'core' | 'home' | 'earn';

type FooterNavItemConfig = {
  label: string;
  active: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  activeIcon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
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
  const footerMode: FooterMode = isEarnRoute ? 'earn' : isHomeRoute ? 'home' : 'core';
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
  }, [footerMode, modeTransition]);

  if (!forceVisible && (HIDDEN_ROUTES.has(pathname) || shouldHideFooterByRoute(pathname))) return null;

  const goHome = () => router.push('/unlock-timeline' as any);
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

  const footerItems: [FooterNavItemConfig, FooterNavItemConfig, FooterNavItemConfig, FooterNavItemConfig] =
    footerMode === 'home'
      ? [
          {
            label: 'MAIN',
            active: false,
            icon: 'menu',
            activeIcon: 'menu',
            onPress: goWallet,
          },
          {
            label: 'UNLOCK',
            active: pathname === '/unlock-timeline',
            icon: 'timeline-clock-outline',
            activeIcon: 'timeline-clock',
            onPress: goUnlock,
          },
          {
            label: 'LIQUIDITY',
            active: pathname === '/liquidity-controller' || pathname === '/liquidity-confirm',
            icon: 'chart-timeline-variant',
            activeIcon: 'chart-timeline-variant-shimmer',
            onPress: goLiquidity,
          },
          {
            label: 'INFO',
            active: pathname === '/earn',
            icon: 'information-outline',
            activeIcon: 'information',
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
              onPress: goBuy,
            },
            {
              label: 'AIRDROP',
              active: pathname === '/airdrop',
              icon: 'gift-outline',
              activeIcon: 'gift',
              onPress: goAirdrop,
            },
            {
              label: 'AMBASSADOR',
              active: pathname === '/ambassador-program',
              icon: 'account-star-outline',
              activeIcon: 'account-star',
              onPress: goAmbassador,
            },
            {
              label: 'MAIN',
              active: false,
              icon: 'menu',
              activeIcon: 'menu',
              onPress: goWallet,
            },
          ]
        : [
            {
              label: 'HOME',
              active: false,
              icon: 'home-variant-outline',
              activeIcon: 'home-variant',
              onPress: goHome,
            },
            {
              label: 'SEND',
              active: isSendActive,
              icon: 'arrow-top-right-thin',
              activeIcon: 'arrow-top-right',
              onPress: goSend,
            },
            {
              label: 'SWAP',
              active: isSwapActive,
              icon: 'swap-horizontal',
              activeIcon: 'swap-horizontal-bold',
              onPress: guardedGoSwap,
            },
            {
              label: 'EARN',
              active: false,
              icon: 'chart-line',
              activeIcon: 'chart-line-variant',
              onPress: goBuy,
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
            <FooterItem
              label={footerItems[0].label}
              active={footerItems[0].active}
              icon={footerItems[0].icon}
              activeIcon={footerItems[0].activeIcon}
              activeColor={footerActiveColor}
              onPress={footerItems[0].onPress}
            />

            <FooterItem
              label={footerItems[1].label}
              active={footerItems[1].active}
              icon={footerItems[1].icon}
              activeIcon={footerItems[1].activeIcon}
              activeColor={footerActiveColor}
              onPress={footerItems[1].onPress}
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
              label={footerItems[2].label}
              active={footerItems[2].active}
              icon={footerItems[2].icon}
              activeIcon={footerItems[2].activeIcon}
              activeColor={footerActiveColor}
              onPress={footerItems[2].onPress}
            />

            <FooterItem
              label={footerItems[3].label}
              active={footerItems[3].active}
              icon={footerItems[3].icon}
              activeIcon={footerItems[3].activeIcon}
              activeColor={footerActiveColor}
              onPress={footerItems[3].onPress}
            />
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
}: FooterItemProps) {
  const iconName = active ? activeIcon : icon;

  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.button} onPress={onPress}>
      <MaterialCommunityIcons
        name={iconName}
        size={22}
        color={active ? activeColor : colors.white}
        style={styles.navIcon}
      />
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
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 999,
    zIndex: 4,
  },

  modeBadgeText: {
    fontSize: 9,
    lineHeight: 11,
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
