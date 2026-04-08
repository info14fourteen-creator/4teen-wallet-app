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

      <TouchableOpacity activeOpacity={0.85} style={styles.backRow} onPress={onBack}>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
