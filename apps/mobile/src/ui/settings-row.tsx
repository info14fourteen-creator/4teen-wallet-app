import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import ExpandChevron from './expand-chevron';
import { colors, radius } from '../theme/tokens';
import { ui } from '../theme/ui';

type SettingsRowProps = {
  label: string;
  value?: string;
  hint?: string;
  onPress: () => void;
  icon?: ReactNode;
};

export default function SettingsRow({
  label,
  value,
  hint,
  onPress,
  icon,
}: SettingsRowProps) {
  const hasMeta = Boolean(value || hint);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.row, hasMeta ? styles.rowExpanded : null]}
      onPress={onPress}
    >
      <View style={styles.itemLeft}>
        {icon ? <View style={styles.iconWrap}>{icon}</View> : null}

        <View style={styles.rowText}>
          <Text style={ui.actionLabel}>{label}</Text>
          {value ? <Text style={styles.value}>{value}</Text> : null}
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
      </View>

      <ExpandChevron open={false} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  rowExpanded: {
    minHeight: 86,
    paddingVertical: 14,
    alignItems: 'center',
  },

  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  iconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rowText: {
    flex: 1,
  },

  value: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
    marginTop: 4,
  },

  hint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
    marginTop: 6,
  },
});
