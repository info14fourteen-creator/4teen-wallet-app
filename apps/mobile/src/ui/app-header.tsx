import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { shouldRenderSharedNavigation } from './navigation-routes';

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

  if (!forceVisible && shouldRenderSharedNavigation(pathname)) {
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
    if (onScanPress) {
      onScanPress();
      return;
    }

    if (pathname === '/scan') {
      router.back();
      return;
    }

    router.push('/scan');
  };

  const handleSearchPress = () => {
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
              <MaterialCommunityIcons
                name={showClose ? 'close' : 'menu'}
                size={showClose ? 22 : 22}
                color={colors.white}
              />
            </View>
          </TouchableOpacity>

          <Pressable
            onPress={handleSearchPress}
            style={({ pressed }) => [styles.searchButton, pressed && styles.searchButtonPressed]}
          >
            <View style={styles.searchLeft}>
              <MaterialCommunityIcons name="magnify" size={17} color={colors.textDim} />
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
              <MaterialCommunityIcons name="qrcode-scan" size={20} color={colors.white} />
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
