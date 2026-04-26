import { StyleSheet, View } from 'react-native';

import ThinOrangeLoader from './thin-orange-loader';

type ScreenLoadingOverlayProps = {
  visible: boolean;
};

export default function ScreenLoadingOverlay({ visible }: ScreenLoadingOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <ThinOrangeLoader size={28} strokeWidth={2.4} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.76)',
  },
});
