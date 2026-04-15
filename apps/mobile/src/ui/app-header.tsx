import { Pressable, TextInput, StyleSheet, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../theme/tokens';
import { useGlobalSearch } from '../search/search-provider';

import MenuIcon from '../../assets/icons/ui/menu.svg';
import SearchIcon from '../../assets/icons/ui/search.svg';
import ScanIcon from '../../assets/icons/ui/scan.svg';
import CloseIcon from '../../assets/icons/ui/close.svg';

export const APP_HEADER_HEIGHT = 52;
export const APP_HEADER_TOP_PADDING = 10;
export const APP_HEADER_SIDE_PADDING = 20;
export const APP_MENU_TOP_GAP = 10;

type AppHeaderProps = {
  onMenuPress?: () => void;
  showClose?: boolean;
  onClosePress?: () => void;
  onScanPress?: () => void;
  onSearchPress?: () => void;
};

export default function AppHeader({
  onMenuPress,
  showClose = false,
  onClosePress,
  onScanPress,
}: AppHeaderProps) {
  const { openSearch } = useGlobalSearch();

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.iconButton}
        onPress={showClose ? onClosePress : onMenuPress}
      >
        {showClose ? <CloseIcon width={22} height={22} /> : <MenuIcon width={24} height={24} />}
      </TouchableOpacity>

      <Pressable
        style={({ pressed }) => [styles.search, pressed && styles.searchPressed]}
        onPress={openSearch}
      >
        <TextInput
          editable={false}
          pointerEvents="none"
          placeholder="crypto, address, dapp..."
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />
        <SearchIcon width={16} height={16} />
      </Pressable>

      <TouchableOpacity activeOpacity={0.85} style={styles.iconButton} onPress={onScanPress}>
        <ScanIcon width={22} height={22} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: APP_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  search: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
  },

  searchPressed: {
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.06)',
  },

  input: {
    flex: 1,
    color: colors.white,
    paddingVertical: 0,
  },
});
