import { useEffect, useMemo, useRef } from 'react';
import { Animated, AppState, Easing, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme/tokens';
import { useWalletSession } from '../wallet/wallet-session';
import AppHeader from './app-header';
import FooterNav from './footer-nav';
import MenuSheet from './menu-sheet';
import {
  NAV_HEADER_HEIGHT,
  NAV_HEADER_TOP_PADDING,
  NAV_HEADER_DROP_OFFSET,
  NAV_FOOTER_RESERVED_SPACE,
  NAV_FOOTER_BOTTOM_OFFSET,
} from './navigation.constants';

export function getNavigationHeaderInset(topInset: number, extra: number = 0) {
  return Math.max(topInset, NAV_HEADER_TOP_PADDING) + NAV_HEADER_DROP_OFFSET + NAV_HEADER_HEIGHT + extra;
}

export function getNavigationBottomInset(bottomInset: number, extra: number = 0) {
  return NAV_FOOTER_RESERVED_SPACE + NAV_FOOTER_BOTTOM_OFFSET + Math.max(bottomInset, 6) + extra;
}

export function useNavigationInsets(options?: {
  topExtra?: number;
  bottomExtra?: number;
}) {
  const insets = useSafeAreaInsets();
  const topExtra = options?.topExtra ?? 0;
  const bottomExtra = options?.bottomExtra ?? 0;

  return useMemo(() => {
    return {
      top: getNavigationHeaderInset(insets.top, topExtra),
      bottom: getNavigationBottomInset(insets.bottom, bottomExtra),
    };
  }, [bottomExtra, insets.bottom, insets.top, topExtra]);
}

type NavigationChromeProps = {
  menuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  forceFooterVisible?: boolean;
  loadingProgress?: number;
  onScanPress?: () => void;
  onSearchPress?: () => void;
};

export function NavigationChrome({
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  forceFooterVisible = false,
  loadingProgress,
  onScanPress,
  onSearchPress,
}: NavigationChromeProps) {
  const { navigationIntroKey, chromeHidden } = useWalletSession();
  const headerIntro = useRef(new Animated.Value(0)).current;
  const footerIntro = useRef(new Animated.Value(0)).current;
  const chromeHideProgress = useRef(new Animated.Value(0)).current;
  const introAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (navigationIntroKey === 0) {
      headerIntro.setValue(0);
      footerIntro.setValue(0);
      return;
    }

    introAnimationRef.current?.stop();
    headerIntro.setValue(-64);
    footerIntro.setValue(72);

    introAnimationRef.current = Animated.parallel([
      Animated.timing(headerIntro, {
        toValue: 0,
        duration: 760,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(footerIntro, {
        toValue: 0,
        duration: 760,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]);

    introAnimationRef.current.start(({ finished }) => {
      if (finished) {
        headerIntro.setValue(0);
        footerIntro.setValue(0);
      }
    });

    return () => {
      introAnimationRef.current?.stop();
    };
  }, [footerIntro, headerIntro, navigationIntroKey]);

  useEffect(() => {
    Animated.timing(chromeHideProgress, {
      toValue: chromeHidden ? 1 : 0,
      duration: chromeHidden ? 220 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [chromeHidden, chromeHideProgress]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        introAnimationRef.current?.stop();
        headerIntro.setValue(0);
        footerIntro.setValue(0);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [footerIntro, headerIntro]);

  return (
    <>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.headerLayer,
          {
            opacity: chromeHideProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
            transform: [
              { translateY: headerIntro },
              {
                translateY: chromeHideProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -96],
                }),
              },
            ],
          },
        ]}
      >
        <AppHeader
          onMenuPress={onOpenMenu}
          showClose={menuOpen}
          onClosePress={onCloseMenu}
          onScanPress={onScanPress}
          onSearchPress={onSearchPress}
          loadingProgress={loadingProgress}
          forceVisible
        />
      </Animated.View>

      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.footerLayer,
          {
            opacity: chromeHideProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
            transform: [
              { translateY: footerIntro },
              {
                translateY: chromeHideProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 120],
                }),
              },
            ],
          },
        ]}
      >
        <FooterNav forceVisible={forceFooterVisible} />
      </Animated.View>

      <MenuSheet open={menuOpen} onClose={onCloseMenu} forceVisible />
    </>
  );
}

const styles = StyleSheet.create({
  headerLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: colors.bg,
  },

  footerLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: 'transparent',
  },
});
