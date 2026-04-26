import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../theme/tokens';
import { ui } from '../theme/ui';
import {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
  APP_HEADER_DROP_OFFSET,
} from './app-header.constants';
import ExpandChevron from './expand-chevron';
import { FOOTER_NAV_HEIGHT, FOOTER_NAV_BOTTOM_OFFSET } from './footer-nav';
import { shouldRenderSharedNavigation } from './navigation-routes';
import ScreenBrow from './screen-brow';

import { AddressIcon, InfoIcon, PreferencesIcon as SettingsIcon, WalletIcon } from './ui-icons';

type MenuSheetProps = {
  open: boolean;
  onClose: () => void;
  forceVisible?: boolean;
};

export default function MenuSheet({ open, onClose, forceVisible = false }: MenuSheetProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const shouldHide = !forceVisible && shouldRenderSharedNavigation(pathname);
  const [mounted, setMounted] = useState(open);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(-28)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(sheetOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!mounted) return;

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: -20,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 0,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [backdropOpacity, mounted, open, sheetOpacity, sheetTranslateY]);

  if (shouldHide) return null;
  if (!mounted) return null;

  const headerVisibleHeight =
    Math.max(insets.top, APP_HEADER_TOP_PADDING) + APP_HEADER_DROP_OFFSET + APP_HEADER_HEIGHT;
  const footerVisibleHeight =
    FOOTER_NAV_HEIGHT + FOOTER_NAV_BOTTOM_OFFSET + Math.max(insets.bottom, 2);

  const go = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as any), 120);
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.backdrop,
          {
            opacity: backdropOpacity,
          },
        ]}
      />

      <Pressable
        style={[
          styles.tapZone,
          {
            top: headerVisibleHeight,
            bottom: footerVisibleHeight,
          },
        ]}
        onPress={onClose}
      />

      <Animated.View
        style={[
          styles.sheet,
          {
            top: headerVisibleHeight,
            bottom: footerVisibleHeight,
            opacity: sheetOpacity,
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
      >
        <View style={styles.sheetContent}>
          <ScreenBrow label="CONTROL PANEL" />

          <View style={styles.menuBlock}>
            <MenuItem
              label="Wallet Management"
              onPress={() => go('/wallet-manager')}
              icon={<WalletIcon width={20} height={20} />}
            />

            <MenuItem
              label="Address Book"
              onPress={() => go('/address-book')}
              icon={<AddressIcon width={20} height={20} />}
            />

            <MenuItem
              label="Settings"
              onPress={() => go('/settings')}
              onLongPress={() => go('/ui-shell-lab')}
              icon={<SettingsIcon width={20} height={20} />}
            />

            <MenuItem
              label="About Us"
              onPress={() => go('/about')}
              icon={<InfoIcon width={20} height={20} />}
            />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function MenuItem({
  label,
  onPress,
  onLongPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  icon: ReactNode;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.item}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={600}
    >
      <View style={styles.itemLeft}>
        <View style={styles.iconWrap}>{icon}</View>
        <Text style={ui.actionLabel}>{label}</Text>
      </View>

      <ExpandChevron open={false} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 90,
  },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
  },

  tapZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 91,
  },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 92,
  },

  sheetContent: {
    paddingTop: 14,
    paddingHorizontal: spacing[4],
    backgroundColor: colors.bg,
  },

  menuBlock: {
    gap: 14,
  },

  item: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },

  iconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
