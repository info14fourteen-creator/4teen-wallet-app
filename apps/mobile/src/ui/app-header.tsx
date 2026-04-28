import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme/tokens';
import { useGlobalSearch } from '../search/search-provider';
import {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
  APP_HEADER_DROP_OFFSET,
  APP_HEADER_SIDE_PADDING,
} from './app-header.constants';
import { goBackOrReplace } from './safe-back';
import LottieIcon from './lottie-icon';
import { shouldRenderSharedNavigation } from './navigation-routes';
import { useWalletSession } from '../wallet/wallet-session';

const headerQrSource = require('../../assets/icons/header/header_qr.json');
const headerSearchSource = require('../../assets/icons/search/search_magnifier.json');

type AppHeaderProps = {
  onMenuPress?: () => void;
  showClose?: boolean;
  onClosePress?: () => void;
  onScanPress?: () => void;
  onSearchPress?: () => void;
  loadingProgress?: number;
  forceVisible?: boolean;
};

export function useAppHeaderInset(extra: number = 0) {
  const insets = useSafeAreaInsets();
  return Math.max(insets.top, APP_HEADER_TOP_PADDING) + APP_HEADER_DROP_OFFSET + APP_HEADER_HEIGHT + extra;
}

export default function AppHeader({
  onMenuPress,
  showClose = false,
  onClosePress,
  onScanPress,
  onSearchPress,
  loadingProgress,
  forceVisible = false,
}: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { openSearch } = useGlobalSearch();
  const { hasWallet } = useWalletSession();
  const [qrPlayToken, setQrPlayToken] = useState(0);
  const [searchPlayToken, setSearchPlayToken] = useState(0);
  const burgerProgress = useRef(new Animated.Value(showClose ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(burgerProgress, {
      toValue: showClose ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [burgerProgress, showClose]);

  if (!forceVisible && shouldRenderSharedNavigation(pathname, undefined, { hasWallet })) {
    return null;
  }

  const topInset = Math.max(insets.top, APP_HEADER_TOP_PADDING) + APP_HEADER_DROP_OFFSET;
  const totalHeight = topInset + APP_HEADER_HEIGHT;

  const handleLeftPress = () => {
    if (showClose) {
      onClosePress?.();
      return;
    }

    onMenuPress?.();
  };

  const handleScanPress = () => {
    setQrPlayToken((value) => value + 1);

    if (onScanPress) {
      onScanPress();
      return;
    }

    if (pathname === '/scan') {
      goBackOrReplace(router, { pathname, fallback: '/wallet' });
      return;
    }

    router.push('/scan');
  };

  const handleSearchPress = () => {
    setSearchPlayToken((value) => value + 1);

    if (onSearchPress) {
      onSearchPress();
      return;
    }

    openSearch();
  };

  const normalizedProgress =
    typeof loadingProgress === 'number'
      ? Math.max(0, Math.min(1, loadingProgress))
      : null;

  return (
    <View
      style={[
        styles.chrome,
        {
          height: totalHeight,
          minHeight: totalHeight,
          maxHeight: totalHeight,
        },
      ]}
    >
      <View style={[styles.topFill, { height: topInset }]} />

      <View style={styles.wrap}>
        <View style={styles.bar}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.sideButton}
            onPress={handleLeftPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={styles.iconBox}>
              <View style={styles.burgerWrap}>
                <Animated.View
                  style={[
                    styles.burgerLine,
                    styles.burgerLineTop,
                    {
                      backgroundColor: burgerProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [colors.white, colors.accent],
                      }),
                      transform: [
                        {
                          translateY: burgerProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 6],
                          }),
                        },
                        {
                          rotate: burgerProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '45deg'],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.burgerLine,
                    styles.burgerLineMiddle,
                    {
                      backgroundColor: burgerProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [colors.accent, colors.accent],
                      }),
                      opacity: burgerProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 0],
                      }),
                      transform: [
                        {
                          scaleX: burgerProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 0.45],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.burgerLine,
                    styles.burgerLineBottom,
                    {
                      backgroundColor: burgerProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [colors.white, colors.accent],
                      }),
                      transform: [
                        {
                          scaleX: burgerProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [14 / 18, 1],
                          }),
                        },
                        {
                          translateY: burgerProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -6],
                          }),
                        },
                        {
                          rotate: burgerProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '-45deg'],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              </View>
            </View>
          </TouchableOpacity>

          <Pressable
            onPress={handleSearchPress}
            style={({ pressed }) => [styles.searchButton, pressed && styles.searchButtonPressed]}
          >
            <View style={styles.searchLeft}>
              <LottieIcon
                source={headerSearchSource}
                size={17}
                staticFrame={119}
                playToken={searchPlayToken}
                frames={[0, 119]}
                speed={1.8}
              />
              <Text style={styles.searchText}>crypto, address, dapp...</Text>
            </View>
          </Pressable>

          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.sideButton}
            onPress={handleScanPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={styles.iconBox}>
              <LottieIcon
                source={headerQrSource}
                size={20}
                staticFrame={269}
                playToken={qrPlayToken}
                frames={[0, 269]}
                speed={2}
              />
            </View>
          </TouchableOpacity>
        </View>

        {normalizedProgress !== null ? (
          <View pointerEvents="none" style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${normalizedProgress * 100}%` }]} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    backgroundColor: colors.bg,
  },

  topFill: {
    backgroundColor: colors.bg,
  },

  wrap: {
    height: APP_HEADER_HEIGHT,
    minHeight: APP_HEADER_HEIGHT,
    maxHeight: APP_HEADER_HEIGHT,
    position: 'relative',
    backgroundColor: colors.bg,
  },

  bar: {
    height: APP_HEADER_HEIGHT,
    minHeight: APP_HEADER_HEIGHT,
    maxHeight: APP_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: APP_HEADER_SIDE_PADDING,
    backgroundColor: colors.bg,
  },

  sideButton: {
    width: 40,
    height: APP_HEADER_HEIGHT,
    minHeight: APP_HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  iconBox: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },

  burgerWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  burgerLine: {
    position: 'absolute',
    height: 2,
    borderRadius: 999,
  },

  burgerLineTop: {
    width: 18,
    top: 4,
  },

  burgerLineMiddle: {
    width: 18,
    top: 9,
  },

  burgerLineBottom: {
    width: 14,
    top: 14,
  },

  searchButton: {
    flex: 1,
    height: 42,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSoft,
  },

  searchButtonPressed: {
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.06)',
  },

  searchLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 8,
  },

  searchText: {
    flex: 1,
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  progressTrack: {
    position: 'absolute',
    left: APP_HEADER_SIDE_PADDING,
    right: APP_HEADER_SIDE_PADDING,
    bottom: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },

  progressFill: {
    height: 1,
    backgroundColor: colors.accent,
  },
});
