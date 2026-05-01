import { StyleSheet, Text, View } from 'react-native';

import { translateNow } from '../i18n';
import { colors, radius } from '../theme/tokens';
import { ui } from '../theme/ui';
import { ProductScreen } from './product-shell';

type StubScreenProps = {
  eyebrow: string;
  title?: string;
  body?: string;
};

export default function StubScreen({
  eyebrow,
  title,
  body = translateNow('This screen is not wired yet.'),
}: StubScreenProps) {
  return (
    <ProductScreen eyebrow={eyebrow}>
      <View style={styles.stubCard}>
        {title ? <Text style={styles.stubTitle}>{title}</Text> : null}
        <Text style={styles.stubText}>{body}</Text>
      </View>
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  stubCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,105,0,0.05)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },

  stubTitle: {
    ...ui.titleSm,
  },

  stubText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
});
