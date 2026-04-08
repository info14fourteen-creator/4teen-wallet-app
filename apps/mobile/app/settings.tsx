import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import SubmenuHeader from '../src/ui/submenu-header';
import ExpandChevron from '../src/ui/expand-chevron';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

export default function SettingsScreen() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SubmenuHeader title="SETTINGS" onBack={() => router.back()} />

          <View style={styles.block}>
            <SettingRow label="Language" value="English" />
            <SettingRow label="Currency" value="USD" />
            <SettingRow label="Authentication Method" value="Not set" />
            <SettingRow label="Appearance" value="Dark" />
          </View>
        </ScrollView>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      </View>
    </SafeAreaView>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.row}>
      <View style={styles.rowText}>
        <Text style={ui.actionLabel}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      <ExpandChevron open={false} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: APP_HEADER_TOP_PADDING,
  },
  headerSlot: { height: APP_HEADER_HEIGHT, justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingTop: 14, paddingBottom: spacing[7] },

  block: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 16,
    gap: 12,
  },

  row: {
    minHeight: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  rowText: {
    flex: 1,
    gap: 4,
  },

  value: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
});
