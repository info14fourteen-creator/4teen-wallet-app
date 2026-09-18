import * as Linking from 'expo-linking';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useI18n } from '../i18n';
import { getSunioSwapDisclosure } from '../services/swap/disclosure';
import { colors, radius } from '../theme/tokens';

export default function SunioDisclosureCard() {
  const { t } = useI18n();
  const disclosure = getSunioSwapDisclosure();

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <Text style={styles.eyebrow}>{t('THIRD-PARTY PROTOCOL')}</Text>
        <Text style={styles.provider}>{disclosure.providerName}</Text>
      </View>
      <Text style={styles.body}>{t(disclosure.providerRoleKey)}</Text>
      <Text style={styles.body}>{t(disclosure.custodyKey)}</Text>
      <Text style={styles.signature}>{t(disclosure.signatureKey)}</Text>
      <View style={styles.routerBlock}>
        <Text style={styles.routerLabel}>{t('SMART ROUTER')}</Text>
        <Text selectable style={styles.routerAddress}>{disclosure.routerAddress}</Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => void Linking.openURL(disclosure.routerExplorerUrl)}
        >
          <Text style={styles.link}>{t('View contract on Tronscan')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    padding: 14,
    gap: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,107,0,0.42)',
    backgroundColor: 'rgba(255,107,0,0.07)',
  },
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  eyebrow: {
    flex: 1,
    color: colors.accent,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.45,
  },
  provider: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },
  body: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  signature: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
  routerBlock: {
    paddingTop: 8,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  routerLabel: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },
  routerAddress: {
    color: colors.white,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  link: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Sora_700Bold',
  },
});
