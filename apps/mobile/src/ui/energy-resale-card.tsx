import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, radius } from '../theme/tokens';
import type { EnergyResaleQuote } from '../services/energy-resale';
import {
  formatResourceAmount,
  formatTrxFromSunAmountFixed,
  normalizeResourceAmount,
  normalizeSunAmount,
} from '../services/wallet/resources';

function formatTrx(value: number | string | undefined) {
  const trx = Number(value || 0);

  if (!Number.isFinite(trx)) {
    return '0.00';
  }

  return Math.max(0, trx).toFixed(2);
}

function formatOptionalTrxFromSun(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || normalizeSunAmount(value) <= 0) {
    return '';
  }

  return formatTrxFromSunAmountFixed(value, 2);
}

export default function EnergyResaleCard({
  quote,
  loading,
  processing,
  disabled,
  actionLabel = 'APPROVE',
  estimatedBurnSun,
  onRent,
}: {
  quote: EnergyResaleQuote | null;
  loading?: boolean;
  processing?: boolean;
  disabled?: boolean;
  actionLabel?: string;
  estimatedBurnSun?: number;
  onRent: () => void;
}) {
  if (loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.eyebrow}>SAVE RESOURCES</Text>
        <Text style={styles.text}>Checking resource rental...</Text>
      </View>
    );
  }

  if (!quote) {
    return null;
  }

  const packageCount = Math.max(1, Math.floor(Number(quote.packageCount || 1)));
  const requiredEnergy = normalizeResourceAmount(quote.requiredEnergy);
  const requiredBandwidth = normalizeResourceAmount(quote.requiredBandwidth);
  const readyEnergy = normalizeResourceAmount(quote.readyEnergy || quote.energyQuantity);
  const readyBandwidth = normalizeResourceAmount(quote.readyBandwidth || quote.bandwidthQuantity);
  const burnTrx = formatOptionalTrxFromSun(estimatedBurnSun);
  const safeActionLabel = String(actionLabel || 'APPROVE').trim().toUpperCase();
  const buttonLabel = `RENT → APPROVE → ${safeActionLabel}`;
  const resourceLabel = [
    readyEnergy > 0 ? `${formatResourceAmount(readyEnergy)} Energy` : '',
    readyBandwidth > 0 ? `${formatResourceAmount(readyBandwidth)} Bandwidth` : '',
  ].filter(Boolean).join(' + ');
  const requiredResourceLabel = [
    requiredEnergy > 0 ? `${formatResourceAmount(requiredEnergy)} Energy` : '',
    requiredBandwidth > 0 ? `${formatResourceAmount(requiredBandwidth)} Bandwidth` : '',
  ].filter(Boolean).join(' + ');

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.eyebrow}>SAVE RESOURCES</Text>
          <Text style={styles.rentLabel}>VIA RENT</Text>
          <Text style={styles.rentAmount}>{formatTrx(quote.amountTrx)}</Text>
        </View>

        {burnTrx ? (
          <View style={styles.headerRight}>
            <Text style={styles.burnLabel}>ESTIMATED BURN</Text>
            <Text style={styles.burnAmount}>{burnTrx}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.text}>
        Rent {resourceLabel || 'resources'}
        {packageCount > 1 ? ` · ${packageCount} quick packs` : ''}. The app waits for delivery and
        refreshes this confirmation automatically.
      </Text>

      {requiredResourceLabel ? (
        <View style={styles.coversRow}>
          <Text style={styles.coversLabel}>COVERS</Text>
          <Text style={styles.coversValue} numberOfLines={1}>{requiredResourceLabel}</Text>
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
    alignItems: 'flex-start',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  eyebrow: {
    color: colors.green,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.8,
  },
  rentLabel: {
    marginTop: 6,
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.7,
  },
  rentAmount: {
    color: colors.green,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'Sora_700Bold',
  },
  burnLabel: {
    marginTop: 19,
    color: colors.textDim,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.5,
  },
  burnAmount: {
    color: colors.red,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'Sora_700Bold',
    textDecorationLine: 'line-through',
    textDecorationColor: colors.red,
  },
  text: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
  coversRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  coversLabel: {
    color: colors.text,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.2,
  },
  coversValue: {
    flex: 1,
    color: colors.text,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.2,
    textAlign: 'right',
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
