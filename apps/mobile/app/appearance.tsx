import { StyleSheet, Text, View } from 'react-native';

import { ProductHero, ProductScreen } from '../src/ui/product-shell';
import { colors } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

export default function AppearanceScreen() {
  return (
    <ProductScreen eyebrow="APPEARANCE">
      <ProductHero
        eyebrow="DARK SIDE ACTIVE"
        title="Stay with the Siths"
        body="Light mode is still under construction. The wallet remains on the dark side until the appearance system is rebuilt the right way."
      />

      <View style={styles.sectionList}>
        <View style={[styles.row, styles.pastRow]}>
          <Text style={[styles.rowLabel, styles.pastLabel]}>Past</Text>
          <Text style={styles.rowText}>The past cannot be changed.</Text>
        </View>
        <View style={[styles.row, styles.nowRow]}>
          <Text style={[styles.rowLabel, styles.nowLabel]}>Now</Text>
          <Text style={styles.rowText}>One stable dark theme across the whole wallet.</Text>
        </View>
        <View style={[styles.row, styles.futureRow]}>
          <Text style={[styles.rowLabel, styles.futureLabel]}>Future</Text>
          <Text style={styles.rowText}>The future is not here yet. Live now.</Text>
        </View>
      </View>
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  sectionList: {
    gap: 14,
  },

  row: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 6,
  },

  rowLabel: {
    ...ui.sectionEyebrow,
  },

  rowText: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Sora_600SemiBold',
  },

  pastRow: {
    backgroundColor: 'rgba(255,48,73,0.07)',
    borderColor: 'rgba(255,48,73,0.2)',
  },

  nowRow: {
    backgroundColor: 'rgba(21,224,56,0.07)',
    borderColor: 'rgba(21,224,56,0.2)',
  },

  futureRow: {
    backgroundColor: 'rgba(255,105,0,0.07)',
    borderColor: 'rgba(255,105,0,0.2)',
  },

  pastLabel: {
    color: colors.red,
  },

  nowLabel: {
    color: colors.green,
  },

  futureLabel: {
    color: colors.accent,
  },
});
