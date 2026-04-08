import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import SubmenuHeader from '../src/ui/submenu-header';
import ExpandChevron from '../src/ui/expand-chevron';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

import AddWalletIcon from '../assets/icons/ui/add_wallet_btn.svg';

type WalletItem = {
  id: string;
  name: string;
  balance: string;
  created: string;
};

const wallets: WalletItem[] = [
  {
    id: 'wallet-1',
    name: 'Wallet 1',
    balance: '$8,240.22',
    created: 'Apr 08, 2026',
  },
  {
    id: 'wallet-2',
    name: 'Wallet 2',
    balance: '$6,112.08',
    created: 'Apr 03, 2026',
  },
];

export default function WalletsScreen() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedWalletId, setExpandedWalletId] = useState<string | null>(null);

  const deltaPositive = true;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SubmenuHeader title="WALLET MANAGEMENT" onBack={() => router.back()} />

          <View style={styles.summaryCard}>
            <Text style={ui.eyebrow}>Total Assets</Text>
            <Text style={styles.summaryValue}>$14,352.30</Text>
            <Text style={[styles.delta, deltaPositive ? styles.deltaPositive : styles.deltaNegative]}>
              +$2,020 (+12.38%) 24h
            </Text>
          </View>

          <View style={styles.block}>
            <Text style={ui.sectionEyebrow}>Wallets</Text>

            {wallets.map((wallet) => {
              const expanded = expandedWalletId === wallet.id;

              return (
                <View key={wallet.id} style={styles.walletGroup}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.walletRow}
                    onPress={() =>
                      setExpandedWalletId((prev) => (prev === wallet.id ? null : wallet.id))
                    }
                  >
                    <View style={styles.walletText}>
                      <Text style={ui.actionLabel}>{wallet.name}</Text>
                      <Text style={styles.meta}>Balance: {wallet.balance}</Text>
                      <Text style={styles.meta}>Create Date: {wallet.created}</Text>
                    </View>

                    <ExpandChevron open={expanded} />
                  </TouchableOpacity>

                  {expanded ? (
                    <View style={styles.moreBlock}>
                      <Text style={ui.sectionEyebrow}>More</Text>

                      <StubRow label="Wallet Name" />
                      <StubRow label="Back Up Private Key" />
                      <StubRow label="Multisig Transactions" />
                      <StubRow label="Connections" />
                    </View>
                  ) : null}
                </View>
              );
            })}

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.addWalletRow}
              onPress={() => router.push('/ui-lab')}
            >
              <Text style={ui.actionLabel}>Add Wallet</Text>
              <AddWalletIcon width={20} height={20} />
            </TouchableOpacity>
          </View>
        </ScrollView>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      </View>
    </SafeAreaView>
  );
}

function StubRow({ label }: { label: string }) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.stubRow}>
      <Text style={ui.actionLabel}>{label}</Text>
      <ExpandChevron open={false} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: APP_HEADER_TOP_PADDING,
  },

  headerSlot: {
    height: APP_HEADER_HEIGHT,
    justifyContent: 'center',
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingTop: 14,
    paddingBottom: spacing[7],
  },

  summaryCard: {
    backgroundColor: 'rgba(255,105,0,0.06)',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 18,
    gap: 8,
  },

  summaryValue: {
    color: colors.white,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: 'Sora_700Bold',
  },

  delta: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  deltaPositive: {
    color: colors.green,
  },

  deltaNegative: {
    color: colors.red,
  },

  block: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 18,
    gap: 12,
  },

  walletGroup: {
    gap: 10,
  },

  walletRow: {
    minHeight: 72,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  walletText: {
    flex: 1,
    gap: 4,
  },

  meta: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  moreBlock: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
    gap: 10,
  },

  addWalletRow: {
    minHeight: 54,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  stubRow: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
