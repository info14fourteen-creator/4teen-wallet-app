import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/tokens';
import { ui } from '../theme/ui';
import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
  APP_MENU_TOP_GAP,
} from './app-header';

import InfoIcon from '../../assets/icons/ui/info_btn.svg';
import SettingsIcon from '../../assets/icons/ui/setings_btn.svg';

type MenuSheetProps = {
  open: boolean;
  onClose: () => void;
};

export default function MenuSheet({ open, onClose }: MenuSheetProps) {
  const router = useRouter();

  if (!open) return null;

  const go = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as any), 120);
  };

  const stub = () => {
    onClose();
    setTimeout(() => router.push('/ui-lab' as any), 120);
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Pressable style={styles.overlay} onPress={onClose} />

      <View style={styles.headerMask} />

      <View style={styles.headerWrap}>
        <AppHeader showClose onClosePress={onClose} />
      </View>

      <View style={styles.sheet}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          <View style={styles.sectionBlock}>
            <Text style={ui.sectionEyebrow}>Wallet</Text>
            <MenuItem label="Home" onPress={() => go('/ui-lab')} />
            <MenuItem label="Create Wallet" onPress={stub} />
            <MenuItem label="Import Wallet" onPress={stub} />
            <MenuItem
              label="Settings"
              onPress={stub}
              leftIcon={<SettingsIcon width={18} height={18} />}
            />
          </View>

          <View style={styles.sectionBlock}>
            <Text style={ui.sectionEyebrow}>Ecosystem</Text>
            <MenuItem label="Direct Buy" onPress={stub} />
            <MenuItem label="Swap" onPress={stub} />
            <MenuItem label="Unlock Timeline" onPress={stub} />
            <MenuItem label="Liquidity" onPress={stub} />
            <MenuItem label="Ambassador" onPress={stub} />
            <MenuItem label="Airdrop" onPress={stub} />
          </View>

          <View style={styles.sectionBlock}>
            <Text style={ui.sectionEyebrow}>Info</Text>
            <MenuItem
              label="About Us"
              onPress={() => go('/about')}
              leftIcon={<InfoIcon width={18} height={18} />}
              showArrow
            />
            <MenuItem label="Terms of Service" onPress={() => go('/terms')} />
            <MenuItem label="4TEEN Whitepaper" onPress={() => go('/whitepaper')} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function MenuItem({
  label,
  onPress,
  leftIcon,
  showArrow = false,
}: {
  label: string;
  onPress: () => void;
  leftIcon?: React.ReactNode;
  showArrow?: boolean;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={styles.item} onPress={onPress}>
      <View style={styles.itemLeft}>
        {leftIcon ? <View style={styles.iconWrap}>{leftIcon}</View> : null}
        <Text style={ui.actionLabel}>{label}</Text>
      </View>

      {showArrow ? (
        <Ionicons name="chevron-forward" size={18} color={colors.accent} />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },

  headerMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: APP_HEADER_TOP_PADDING + APP_HEADER_HEIGHT + APP_MENU_TOP_GAP,
    backgroundColor: colors.bg,
    zIndex: 2,
  },

  headerWrap: {
    position: 'absolute',
    top: APP_HEADER_TOP_PADDING,
    left: 20,
    right: 20,
    height: APP_HEADER_HEIGHT,
    justifyContent: 'center',
    zIndex: 3,
    backgroundColor: colors.bg,
  },

  sheet: {
    position: 'absolute',
    top: APP_HEADER_TOP_PADDING + APP_HEADER_HEIGHT + APP_MENU_TOP_GAP,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    zIndex: 2,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    paddingBottom: spacing[7],
    gap: spacing[5],
  },

  sectionBlock: {
    gap: 10,
  },

  item: {
    minHeight: 46,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },

  iconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
