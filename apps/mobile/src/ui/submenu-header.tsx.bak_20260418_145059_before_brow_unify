import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';
import { ui } from '../theme/ui';

type SubmenuHeaderProps = {
  title: string;
  onBack: () => void;
};

export default function SubmenuHeader({
  title,
  onBack,
}: SubmenuHeaderProps) {
  return (
    <View style={styles.wrap}>
      <Text style={ui.sectionEyebrow}>{title}</Text>

      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.backRow}
        onPress={onBack}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="arrow-back" size={15} color={colors.accent} />
        <Text style={ui.submenuBackText}>back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },

  backRow: {
    minHeight: 36,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
