import { StyleSheet, View } from 'react-native';

import { colors } from '../theme/tokens';
import ThinOrangeLoader from './thin-orange-loader';

type ScreenLoadingOverlayProps = {
  visible: boolean;
};

export default function ScreenLoadingOverlay({ visible }: ScreenLoadingOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.scrim} />
      <View style={styles.loaderWrap}>
        <ThinOrangeLoader size={24} strokeWidth={2.4} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },

  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },

  loaderWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.22)',
  },
});
