import { StyleSheet, View } from 'react-native';

import ThinOrangeLoader from './thin-orange-loader';

type InlineRefreshLoaderProps = {
  visible: boolean;
};

export default function InlineRefreshLoader({ visible }: InlineRefreshLoaderProps) {
  if (!visible) return null;

  return (
    <View style={styles.wrap}>
      <ThinOrangeLoader size={18} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 8,
  },
});
