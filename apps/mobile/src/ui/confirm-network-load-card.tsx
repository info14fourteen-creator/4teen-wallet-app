import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../i18n';
import { colors, radius } from '../theme/tokens';
import {
  clampResourcePercent,
  formatResourceAmount,
  normalizeResourceAmount,
} from '../services/wallet/resources';

function ResourceBar({
  label,
  percent,
  risk = false,
  value,
}: {
  label: string;
  percent: number;
  risk?: boolean;
  value: string;
}) {
  return (
    <View style={styles.resourceInlineCol}>
      <View style={styles.resourceInlineHeader}>
        <Text style={[styles.resourceInlineLabel, risk ? styles.resourceInlineLabelRisk : null]}>
          {label}
        </Text>
        <Text style={[styles.resourceInlineValue, risk ? styles.resourceInlineValueRisk : null]}>
          {value}
        </Text>
      </View>
      <View style={[styles.resourceBarTrack, risk ? styles.resourceBarTrackRisk : null]}>
        <View style={[styles.resourceBarFill, risk ? styles.resourceBarFillRisk : null, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

export default function ConfirmNetworkLoadCard({
  estimatedEnergy,
  estimatedBandwidth,
  availableEnergy,
  availableBandwidth,
  energyShortfall,
  bandwidthShortfall,
  message,
  messageRisk = false,
}: {
  estimatedEnergy: number;
  estimatedBandwidth: number;
  availableEnergy: number;
  availableBandwidth: number;
  energyShortfall: number;
  bandwidthShortfall: number;
  message: string;
  messageRisk?: boolean;
}) {
  const { t } = useI18n();
  const normalizedEstimatedEnergy = normalizeResourceAmount(estimatedEnergy);
  const normalizedEstimatedBandwidth = normalizeResourceAmount(estimatedBandwidth);
  const normalizedAvailableEnergy = normalizeResourceAmount(availableEnergy);
  const normalizedAvailableBandwidth = normalizeResourceAmount(availableBandwidth);
  const normalizedEnergyShortfall = normalizeResourceAmount(energyShortfall);
  const normalizedBandwidthShortfall = normalizeResourceAmount(bandwidthShortfall);
  const hasShortfall = normalizedEnergyShortfall > 0 || normalizedBandwidthShortfall > 0;
  const energyCoveragePercent = clampResourcePercent(
    normalizedEstimatedEnergy <= 0
      ? 100
      : (Math.min(normalizedAvailableEnergy, normalizedEstimatedEnergy) / normalizedEstimatedEnergy) * 100
  );
  const bandwidthCoveragePercent = clampResourcePercent(
    normalizedEstimatedBandwidth <= 0
      ? 100
      : (Math.min(normalizedAvailableBandwidth, normalizedEstimatedBandwidth) / normalizedEstimatedBandwidth) * 100
  );
  const needLabel = [
    `${formatResourceAmount(normalizedEstimatedEnergy)} ${t('energy')}`,
    `${formatResourceAmount(normalizedEstimatedBandwidth)} ${t('bandwidth')}`,
  ].join(' · ');
  const availableLabel = [
    `${formatResourceAmount(normalizedAvailableEnergy)} ${t('energy')}`,
    `${formatResourceAmount(normalizedAvailableBandwidth)} ${t('bandwidth')}`,
  ].join(' · ');
  const missingLabel = hasShortfall
    ? [
        `${formatResourceAmount(normalizedEnergyShortfall)} ${t('energy')}`,
        `${formatResourceAmount(normalizedBandwidthShortfall)} ${t('bandwidth')}`,
      ].join(' · ')
    : t('Nothing');

  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionEyebrow}>{t('NETWORK RESOURCES')}</Text>

      <View style={styles.detailCard}>
        <View style={styles.detailRowFirst}>
          <Text style={styles.detailLabel}>{t('Need now')}</Text>
          <Text style={styles.detailValue}>{needLabel}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('Available now')}</Text>
          <Text style={styles.detailValue}>{availableLabel}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{t('Missing')}</Text>
          <Text style={[styles.detailValue, hasShortfall ? styles.detailValueRisk : null]}>
            {missingLabel}
          </Text>
        </View>

        <View style={styles.resourcesInlineRow}>
          <ResourceBar
            label={t('Energy coverage')}
            risk={normalizedEnergyShortfall > 0}
            percent={energyCoveragePercent}
            value={`${Math.round(energyCoveragePercent)}%`}
          />

          <ResourceBar
            label={t('Bandwidth coverage')}
            risk={normalizedBandwidthShortfall > 0}
            percent={bandwidthCoveragePercent}
            value={`${Math.round(bandwidthCoveragePercent)}%`}
          />
        </View>
      </View>

      <View style={[styles.infoRow, messageRisk ? styles.infoRowRisk : null]}>
        <Text style={[styles.infoRowText, messageRisk ? styles.infoRowTextRisk : null]}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionBlock: {
    marginTop: 16,
    gap: 8,
  },
  sectionEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.5,
  },
  detailCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    overflow: 'hidden',
  },
  detailRowFirst: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  detailRow: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  detailLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    flexShrink: 0,
  },
  detailValue: {
    flex: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
  },
  detailValueRisk: {
    color: colors.accent,
  },
  resourcesInlineRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  resourceInlineCol: {
    gap: 6,
  },
  resourceInlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  resourceInlineLabel: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  resourceInlineLabelRisk: {
    color: colors.red,
  },
  resourceInlineValue: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
  },
  resourceInlineValueRisk: {
    color: colors.accent,
  },
  resourceBarTrack: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  resourceBarTrackRisk: {
    backgroundColor: 'rgba(255,48,73,0.14)',
  },
  resourceBarFill: {
    height: '100%',
    backgroundColor: 'rgba(24,224,58,0.18)',
    borderRadius: radius.pill,
  },
  resourceBarFillRisk: {
    backgroundColor: colors.accent,
  },
  infoRow: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(24,224,58,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoRowRisk: {
    backgroundColor: 'rgba(255,105,0,0.06)',
  },
  infoRowText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },
  infoRowTextRisk: {
    color: colors.red,
  },
});
