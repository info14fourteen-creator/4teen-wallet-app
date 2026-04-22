import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, radius } from '../theme/tokens';
import type { EnergyResaleQuote } from '../services/energy-resale';

function formatEnergy(value: number) {
  const safe = Math.max(0, Math.floor(Number(value) || 0));

  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(1).replace(/\.0$/, '')}k`;

  return String(safe);
}

export default function EnergyResaleCard({
  quote,
  loading,
  processing,
  disabled,
  onRent,
}: {
  quote: EnergyResaleQuote | null;
  loading?: boolean;
  processing?: boolean;
  disabled?: boolean;
  onRent: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>GASSTATION</Text>
        <Text style={styles.text}>Checking Energy package...</Text>
      </View>
    );
  }

  if (!quote) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>GASSTATION</Text>
          <Text style={styles.title}>Rent Energy</Text>
        </View>

        <Text style={styles.amount}>{quote.amountTrx} TRX</Text>
      </View>

      <Text style={styles.text}>
        {formatEnergy(quote.energyQuantity)} Energy package. The app waits for delivery and
        refreshes this confirmation automatically.
      </Text>

      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.button, (disabled || processing) ? styles.buttonDisabled : null]}
        onPress={onRent}
        disabled={disabled || processing}
      >
        {processing ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>RENT ENERGY</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(24,224,58,0.26)',
    backgroundColor: 'rgba(24,224,58,0.07)',
    padding: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    color: colors.green,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.8,
  },
  title: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },
  amount: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },
  text: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
  button: {
    minHeight: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.7,
  },
});
