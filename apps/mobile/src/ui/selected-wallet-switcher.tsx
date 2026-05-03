import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useI18n, useLocaleLayout } from '../i18n';
import type { WalletMeta } from '../services/wallet/storage';
import { colors, radius } from '../theme/tokens';
import { OpenDownIcon, OpenLeftIcon, OpenRightIcon } from './ui-icons';

export type WalletSwitcherOption = {
  id: string;
  name: string;
  address: string;
  kind: WalletMeta['kind'];
  balanceDisplay?: string;
};

type SelectedWalletSwitcherProps = {
  wallet: WalletSwitcherOption | null;
  visibleWalletChoices: WalletSwitcherOption[];
  walletOptionsOpen: boolean;
  switchingWalletId: string | null;
  onToggle: () => void;
  onChooseWallet: (wallet: WalletSwitcherOption) => void;
  emptyTitle?: string;
  emptyBody?: string;
};

function WalletBalance({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  const locale = useLocaleLayout();
  const safe = String(value || '—').trim() || '—';
  const match = safe.match(/^([^\d-]+)\s*(.+)$/);
  const currency = match?.[1]?.trim() || '';
  const amount = match?.[2]?.trim() || safe;

  return (
    <View style={[styles.walletBalanceRow, locale.row]}>
      {currency ? (
        <Text
          style={[compact ? styles.walletOptionBalanceCurrency : styles.walletBalanceCurrency, locale.textStart]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
        >
          {currency}
        </Text>
      ) : null}
      <Text
        style={[compact ? styles.walletOptionBalance : styles.walletBalance, locale.textStart]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {amount}
      </Text>
    </View>
  );
}

export default function SelectedWalletSwitcher({
  wallet,
  visibleWalletChoices,
  walletOptionsOpen,
  switchingWalletId,
  onToggle,
  onChooseWallet,
  emptyTitle = 'No wallet selected',
  emptyBody = 'Create or import a wallet first.',
}: SelectedWalletSwitcherProps) {
  const { t } = useI18n();
  const locale = useLocaleLayout();
  const resolvedEmptyTitle = t(emptyTitle);
  const resolvedEmptyBody = t(emptyBody);

  return (
    <View style={styles.selectionBlock}>
      <View style={[styles.selectionHead, locale.rowBetween]}>
        <Text style={[styles.selectionEyebrow, locale.textStart]}>{t('ACTIVE WALLET')}</Text>
        <Text style={[styles.selectionHint, locale.textStart]}>{t('tap to switch')}</Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.walletCard, locale.rowBetween, walletOptionsOpen ? styles.walletCardOpen : styles.walletCardClosed]}
        onPress={onToggle}
      >
        <View style={[styles.walletCardText, locale.alignStart]}>
          <View style={[styles.walletTitleRow, locale.row]}>
          <Text style={[styles.walletName, locale.textStart]}>{wallet?.name || resolvedEmptyTitle}</Text>
          </View>

          <WalletBalance value={wallet?.balanceDisplay || t('$0.00')} />

          <Text style={[styles.walletAddress, locale.textStart]} numberOfLines={1}>
            {wallet?.address || resolvedEmptyBody}
          </Text>
        </View>

        {walletOptionsOpen ? (
          <OpenDownIcon width={22} height={22} />
        ) : (
          locale.isRTL ? <OpenLeftIcon width={18} height={18} /> : <OpenRightIcon width={18} height={18} />
        )}
      </TouchableOpacity>

      {walletOptionsOpen ? (
        <View style={styles.walletOptionsList}>
          {visibleWalletChoices.map((item) => {
            const switching = item.id === switchingWalletId;

            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.9}
                style={[styles.walletOptionRow, locale.rowBetween]}
                disabled={switching}
                onPress={() => onChooseWallet(item)}
              >
                <View style={[styles.walletOptionText, locale.alignStart]}>
                  <View style={[styles.walletTitleRow, locale.row]}>
                    <Text style={[styles.walletName, locale.textStart]}>{item.name}</Text>
                  </View>
                  <WalletBalance value={item.balanceDisplay || t('$0.00')} compact />
                  <Text style={[styles.optionAddress, locale.textStart]} numberOfLines={1}>
                    {item.address}
                  </Text>
                </View>

                {switching ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  locale.isRTL ? <OpenLeftIcon width={18} height={18} /> : <OpenRightIcon width={18} height={18} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  selectionBlock: {
    marginBottom: 16,
  },
  selectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  selectionEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },
  selectionHint: {
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  walletCard: {
    minHeight: 98,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  walletCardClosed: {
    borderColor: 'rgba(24,224,58,0.24)',
    backgroundColor: 'rgba(24,224,58,0.065)',
  },
  walletCardOpen: {
    borderColor: 'rgba(24,224,58,0.28)',
    backgroundColor: 'rgba(24,224,58,0.08)',
  },
  walletCardText: {
    flex: 1,
    gap: 6,
  },
  walletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  walletName: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },
  walletBalance: {
    color: colors.white,
    fontSize: 21,
    lineHeight: 26,
    fontFamily: 'Sora_700Bold',
  },
  walletBalanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  walletBalanceCurrency: {
    color: colors.accent,
    fontSize: 21,
    lineHeight: 26,
    fontFamily: 'Sora_700Bold',
  },
  walletAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  walletOptionsList: {
    gap: 8,
    marginTop: 10,
  },
  walletOptionRow: {
    minHeight: 96,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.14)',
    backgroundColor: 'rgba(255,105,0,0.04)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  walletOptionText: {
    flex: 1,
    gap: 6,
  },
  walletOptionBalance: {
    color: colors.white,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: 'Sora_700Bold',
  },
  walletOptionBalanceCurrency: {
    color: colors.accent,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: 'Sora_700Bold',
  },
  optionAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
});
