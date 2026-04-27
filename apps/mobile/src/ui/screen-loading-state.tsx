import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/tokens';
import { ui } from '../theme/ui';
import ThinOrangeLoader from './thin-orange-loader';

type ScreenLoadingStateProps = { label?: string };

export default function ScreenLoadingState({ label }: ScreenLoadingStateProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <ThinOrangeLoader size={22} strokeWidth={2} />
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: 12,
  },

  label: {
    ...ui.body,
    color: colors.textSoft,
  },
});
