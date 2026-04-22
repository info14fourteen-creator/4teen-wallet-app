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

  const packageCount = Math.max(1, Math.floor(Number(quote.packageCount || 1)));
  const requiredEnergy = Math.max(0, Math.floor(Number(quote.requiredEnergy || 0)));
  const requiredBandwidth = Math.max(0, Math.floor(Number(quote.requiredBandwidth || 0)));
  const readyEnergy = Math.max(0, Math.floor(Number(quote.readyEnergy || quote.energyQuantity || 0)));
  const readyBandwidth = Math.max(
    0,
    Math.floor(Number(quote.readyBandwidth || quote.bandwidthQuantity || 0))
  );
  const title = readyEnergy > 0 && readyBandwidth > 0
    ? 'Rent Resources'
    : readyBandwidth > 0
      ? 'Rent Bandwidth'
      : 'Rent Energy';
  const buttonLabel = readyEnergy > 0 && readyBandwidth > 0
    ? 'RENT RESOURCES'
    : readyBandwidth > 0
      ? 'RENT BANDWIDTH'
      : 'RENT ENERGY';
  const resourceLabel = [
    readyEnergy > 0 ? `${formatEnergy(readyEnergy)} Energy` : '',
    readyBandwidth > 0 ? `${formatEnergy(readyBandwidth)} Bandwidth` : '',
  ].filter(Boolean).join(' + ');

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>GASSTATION</Text>
          <Text style={styles.title}>{title}</Text>
        </View>

        <Text style={styles.amount}>{quote.amountTrx} TRX</Text>
      </View>

      <Text style={styles.text}>
        {resourceLabel || 'Resource'} rental
        {packageCount > 1 ? ` · ${packageCount} quick packs` : ''}. The app waits for delivery and
        refreshes this confirmation automatically.
      </Text>

      {requiredEnergy > 0 || requiredBandwidth > 0 ? (
        <View style={styles.requirementsRow}>
          {requiredEnergy > 0 ? (
            <Text style={styles.requirementText}>Needs {formatEnergy(requiredEnergy)} Energy</Text>
          ) : null}
          {requiredBandwidth > 0 ? (
            <Text style={styles.requirementText}>
              Needs {formatEnergy(requiredBandwidth)} Bandwidth
            </Text>
          ) : null}
        </View>
      ) : null}

      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.button, (disabled || processing) ? styles.buttonDisabled : null]}
        onPress={onRent}
        disabled={disabled || processing}
      >
        {processing ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>{buttonLabel}</Text>
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
  requirementsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  requirementText: {
    color: colors.text,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.2,
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
