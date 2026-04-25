import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { WalletMeta } from '../services/wallet/storage';
import { colors, radius } from '../theme/tokens';
import { OpenDownIcon, OpenRightIcon } from './ui-icons';

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

function formatWalletAccessLabel(kind: WalletMeta['kind']) {
  if (kind === 'mnemonic') return 'SEED PHRASE';
  if (kind === 'private-key') return 'PRIVATE KEY';
  return 'WATCH ONLY';
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
  return (
    <View style={styles.selectionBlock}>
      <Text style={styles.selectionEyebrow}>SELECTED WALLET · TAP TO SWITCH</Text>

      <TouchableOpacity
        activeOpacity={0.9}
        style={[styles.walletCard, walletOptionsOpen ? styles.walletCardOpen : styles.walletCardClosed]}
        onPress={onToggle}
      >
        <View style={styles.walletCardText}>
          <View style={styles.walletTitleRow}>
            <Text style={styles.walletName}>{wallet?.name || emptyTitle}</Text>
            {wallet ? <Text style={styles.activeBadge}>SELECTED</Text> : null}
          </View>

          <Text style={styles.walletBalance}>
            Balance: {wallet?.balanceDisplay || '$0.00'}
          </Text>
          <Text style={styles.walletBalance}>
            Access: {wallet ? formatWalletAccessLabel(wallet.kind) : 'NOT CONNECTED'}
          </Text>
          <Text style={styles.walletAddress} numberOfLines={1}>
            {wallet?.address || emptyBody}
          </Text>
        </View>

        {walletOptionsOpen ? (
          <OpenDownIcon width={22} height={22} />
        ) : (
          <OpenRightIcon width={18} height={18} />
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
                style={styles.walletOptionRow}
                disabled={switching}
                onPress={() => onChooseWallet(item)}
              >
                <View style={styles.walletOptionText}>
                  <Text style={styles.walletName}>{item.name}</Text>
                  <Text style={styles.optionBalance}>Balance: {item.balanceDisplay || '$0.00'}</Text>
                  <Text style={styles.optionBalance}>
                    Access: {formatWalletAccessLabel(item.kind)}
                  </Text>
                  <Text style={styles.optionAddress} numberOfLines={1}>
                    {item.address}
                  </Text>
                </View>

                {switching ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <OpenRightIcon width={18} height={18} />
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
  selectionEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  walletCard: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  walletCardClosed: {
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
  },
  walletCardOpen: {
    borderColor: 'rgba(24,224,58,0.22)',
    backgroundColor: 'rgba(24,224,58,0.06)',
  },
  walletCardText: {
    flex: 1,
    gap: 4,
  },
  walletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  walletName: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },
  walletBalance: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  activeBadge: {
    color: colors.green,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },
  walletAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  walletOptionsList: {
    gap: 10,
    marginTop: 10,
  },
  walletOptionRow: {
    minHeight: 86,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.14)',
    backgroundColor: 'rgba(255,105,0,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  walletOptionText: {
    flex: 1,
    gap: 4,
  },
  optionBalance: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  optionAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
});
