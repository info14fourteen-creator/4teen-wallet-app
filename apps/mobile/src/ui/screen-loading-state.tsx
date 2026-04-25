import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../theme/tokens';
import ThinOrangeLoader from './thin-orange-loader';

type ScreenLoadingStateProps = {
  label?: string;
};

export default function ScreenLoadingState(_props: ScreenLoadingStateProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.loaderWrap}>
          <ThinOrangeLoader size={28} strokeWidth={2.6} />
        </View>
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
  },

  loaderWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.22)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
});
