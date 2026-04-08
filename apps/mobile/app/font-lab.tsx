import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

const SAMPLE_HEADING = '4TEEN Wallet Typography Sample';
const SAMPLE_TEXT =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ\n' +
  'abcdefghijklmnopqrstuvwxyz\n' +
  '0123456789\n' +
  '! ? . , : ; - _ / \\ | @ # $ % & * + = ~ ^ °\n' +
  '() [] {} <>\n' +
  'TRX USDT 4TEEN Sun.io JustMoney\n' +
  'Token price 1.14 TRX • Balance 12,345.6789';

export default function FontLabScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={ui.titleMd}>Font Lab</Text>
      <Text style={ui.body}>Heading and body samples only.</Text>

      <View style={styles.block}>
        <Text style={ui.eyebrow}>Eyebrow</Text>
        <Text style={ui.titleLg}>{SAMPLE_HEADING}</Text>
        <Text style={ui.body}>{SAMPLE_TEXT}</Text>
      </View>

      <View style={styles.block}>
        <Text style={ui.sectionEyebrow}>Section Eyebrow</Text>
        <Text style={ui.titleMd}>{SAMPLE_HEADING}</Text>
        <Text style={ui.lead}>{SAMPLE_TEXT}</Text>
      </View>

      <View style={styles.block}>
        <Text style={ui.muted}>Muted / Meta</Text>
        <Text style={ui.titleSm}>{SAMPLE_HEADING}</Text>
        <Text style={ui.versionLine}>VERSION 0.0.7-ALPHA.1</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[8],
    paddingBottom: spacing[8],
    gap: spacing[5],
  },
  block: {
    gap: spacing[2],
    paddingBottom: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
});
