import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import { colors, layout, spacing } from '../src/theme/tokens';
import { useNotice } from '../src/notice/notice-provider';
import { getActiveWallet, type WalletMeta } from '../src/services/wallet/storage';
import { getWalletSnapshot, type Trc20Asset } from '../src/services/tron';

import OpenRightIcon from '../assets/icons/ui/open_right_btn.svg';

type AssetRow = {
  id: string;
  name: string;
  symbol: string;
  amountDisplay: string;
  valueDisplay: string;
  deltaDisplay: string;
  deltaTone: 'green' | 'red' | 'dim';
  logo?: string;
};

function formatWalletKind(kind: WalletMeta['kind']) {
  if (kind === 'mnemonic') return 'Seed Phrase';
  if (kind === 'private-key') return 'Private Key';
  return 'Watch-Only';
}

function formatUsd(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function formatTokenAmount(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

function formatDelta(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function normalizeDeltaTone(value?: number): 'green' | 'red' | 'dim' {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'dim';
  if (value > 0) return 'green';
  if (value < 0) return 'red';
  return 'dim';
}

function parseFormattedNumber(input: string) {
  return Number(input.replace(/,/g, '')) || 0;
}

function mapTrc20Asset(asset: Trc20Asset): AssetRow {
  const balanceNumber = parseFormattedNumber(asset.balanceFormatted);
  const valueInUsd =
    typeof asset.valueInUsd === 'number' && Number.isFinite(asset.valueInUsd)
      ? asset.valueInUsd
      : typeof asset.priceInUsd === 'number' && Number.isFinite(asset.priceInUsd)
        ? balanceNumber * asset.priceInUsd
        : 0;

  return {
    id: asset.tokenId,
    name: asset.tokenAbbr || asset.tokenName || 'TOKEN',
    symbol: asset.tokenAbbr || asset.tokenName || 'T',
    amountDisplay: asset.balanceFormatted,
    valueDisplay: valueInUsd > 0 ? formatUsd(valueInUsd) : '$0.00',
    deltaDisplay: formatDelta(asset.priceChange24h),
    deltaTone: normalizeDeltaTone(asset.priceChange24h),
    logo: asset.tokenLogo,
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const notice = useNotice();

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeWallet, setActiveWallet] = useState<WalletMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletBalanceUsd, setWalletBalanceUsd] = useState('$0.00');
  const [walletDelta24h, setWalletDelta24h] = useState('— 24h');
  const [trxBalanceDisplay, setTrxBalanceDisplay] = useState('0');
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [errorText, setErrorText] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');

      const wallet = await getActiveWallet();
      setActiveWallet(wallet);

      if (!wallet) {
        setWalletBalanceUsd('$0.00');
        setWalletDelta24h('— 24h');
        setTrxBalanceDisplay('0');
        setAssets([]);
        return;
      }

      const snapshot = await getWalletSnapshot(wallet.address);

      const trxAsset: AssetRow = {
        id: 'trx',
        name: 'TRX',
        symbol: 'TRX',
        amountDisplay: formatTokenAmount(snapshot.trx.balanceTrx),
        valueDisplay: formatUsd(snapshot.trx.valueInUsd || 0),
        deltaDisplay: formatDelta(snapshot.trx.priceChange24h),
        deltaTone: normalizeDeltaTone(snapshot.trx.priceChange24h),
      };

      const trc20Assets = snapshot.trc20Assets.map(mapTrc20Asset);

      const totalUsd =
        (snapshot.trx.valueInUsd || 0) +
        trc20Assets.reduce((sum, item) => {
          const parsed = Number(item.valueDisplay.replace(/[$,]/g, '')) || 0;
          return sum + parsed;
        }, 0);

      setWalletBalanceUsd(formatUsd(totalUsd));
      setWalletDelta24h(`${formatDelta(snapshot.trx.priceChange24h)} 24h`);
      setTrxBalanceDisplay(formatTokenAmount(snapshot.trx.balanceTrx));
      setAssets([trxAsset, ...trc20Assets]);
    } catch (error) {
      console.error(error);
      setAssets([]);
      setErrorText('Failed to load wallet data.');
      notice.showErrorNotice('Failed to load wallet data.', 2600);
    } finally {
      setLoading(false);
    }
  }, [notice]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const deltaStyle = useMemo(() => {
    if (walletDelta24h.startsWith('+')) return styles.deltaGreen;
    if (walletDelta24h.startsWith('-')) return styles.deltaRed;
    return styles.deltaDim;
  }, [walletDelta24h]);

  const stub = (label: string) => {
    notice.showNeutralNotice(`${label} is not wired yet.`, 2200);
  };

  const handleCopyAddress = async () => {
    if (!activeWallet) return;
    await Clipboard.setStringAsync(activeWallet.address);
    notice.showSuccessNotice('Wallet address copied.', 2200);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.walletAssetRow}
            onPress={() => router.push('/select-wallet')}
          >
            <Text style={styles.walletAssetEyebrow}>WALLET ASSET</Text>
            <OpenRightIcon width={18} height={18} />
          </TouchableOpacity>

          {activeWallet ? (
            <View style={styles.walletCard}>
              <Text style={styles.walletName}>{activeWallet.name}</Text>

              <View style={styles.addressRow}>
                <Text style={styles.walletAddress}>{activeWallet.address}</Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleCopyAddress}
                  style={styles.copyButton}
                >
                  <Ionicons name="copy-outline" size={17} color={colors.textDim} />
                </TouchableOpacity>
              </View>

              <Text style={styles.walletKind}>{formatWalletKind(activeWallet.kind)}</Text>

              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : (
                <>
                  <Text style={styles.balanceValue}>{walletBalanceUsd}</Text>
                  <Text style={[styles.balanceDelta, deltaStyle]}>{walletDelta24h}</Text>
                  <Text style={styles.trxHint}>TRX: {trxBalanceDisplay}</Text>
                </>
              )}
            </View>
          ) : (
            <View style={styles.emptyWalletCard}>
              <Text style={styles.emptyWalletTitle}>No wallet selected</Text>
              <Text style={styles.emptyWalletText}>
                Select a wallet to load balances, tokens and activity.
              </Text>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.primaryButton}
                onPress={() => router.push('/select-wallet')}
              >
                <Text style={styles.primaryButtonText}>Select Wallet</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.actionsRow}>
            <ActionButton icon="arrow-up-outline" label="Send" onPress={() => stub('Send')} />
            <ActionButton icon="arrow-down-outline" label="Receive" onPress={() => stub('Receive')} />
            <ActionButton icon="time-outline" label="History" onPress={() => stub('History')} />
            <ActionButton icon="grid-outline" label="More" onPress={() => stub('More')} />
          </View>

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          <View style={styles.assetList}>
            {assets.map((asset) => (
              <View key={asset.id} style={styles.assetRow}>
                <View style={styles.assetLeft}>
                  {asset.logo ? (
                    <Image
                      source={{ uri: asset.logo }}
                      style={styles.assetLogo}
                      contentFit="contain"
                    />
                  ) : (
                    <View style={styles.assetFallbackLogo}>
                      <Text style={styles.assetFallbackText}>
                        {asset.symbol.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.assetMeta}>
                    <Text style={styles.assetName}>{asset.name}</Text>
                    <Text style={styles.assetAmount}>{asset.amountDisplay}</Text>
                  </View>
                </View>

                <View style={styles.assetRight}>
                  <Text style={styles.assetValue}>{asset.valueDisplay}</Text>
                  <Text
                    style={[
                      styles.assetDelta,
                      asset.deltaTone === 'green'
                        ? styles.deltaGreen
                        : asset.deltaTone === 'red'
                          ? styles.deltaRed
                          : styles.deltaDim,
                    ]}
                  >
                    {asset.deltaDisplay}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.manageButton}
            onPress={() => stub('Manage Crypto')}
          >
            <Text style={styles.manageButtonText}>Manage Crypto</Text>
          </TouchableOpacity>
        </ScrollView>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      </View>
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.actionButton} onPress={onPress}>
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={22} color={colors.white} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
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
    backgroundColor: colors.bg,
  },

  content: {
    paddingTop: 14,
    paddingBottom: spacing[7],
  },

  walletAssetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },

  walletAssetEyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.45,
  },

  walletCard: {
    paddingVertical: 8,
    marginBottom: 22,
    gap: 6,
  },

  walletName: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: 'Sora_700Bold',
  },

  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  walletAddress: {
    flex: 1,
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
  },

  copyButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  walletKind: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
    marginTop: 4,
  },

  loadingWrap: {
    minHeight: 64,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: 6,
  },

  balanceValue: {
    color: colors.white,
    fontSize: 40,
    lineHeight: 44,
    fontFamily: 'Sora_700Bold',
    marginTop: 4,
  },

  balanceDelta: {
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
  },

  trxHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    marginTop: 2,
  },

  emptyWalletCard: {
    paddingVertical: 8,
    marginBottom: 22,
    gap: 10,
  },

  emptyWalletTitle: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: 'Sora_700Bold',
  },

  emptyWalletText: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
    maxWidth: '92%',
  },

  primaryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,105,0,0.10)',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  primaryButtonText: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 24,
  },

  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },

  actionIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionLabel: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  errorText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: 'Sora_600SemiBold',
    marginBottom: 18,
  },

  assetList: {
    gap: 18,
    marginBottom: 28,
  },

  assetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },

  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  assetLogo: {
    width: 28,
    height: 28,
    borderRadius: 999,
  },

  assetFallbackLogo: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  assetFallbackText: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
  },

  assetMeta: {
    gap: 2,
    flex: 1,
  },

  assetName: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: 'Sora_600SemiBold',
  },

  assetAmount: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  assetRight: {
    alignItems: 'flex-end',
    gap: 2,
  },

  assetValue: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: 'Sora_700Bold',
  },

  assetDelta: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  deltaGreen: {
    color: colors.green,
  },

  deltaRed: {
    color: colors.red,
  },

  deltaDim: {
    color: colors.textDim,
  },

  emptyAssetsBlock: {
    paddingVertical: 8,
    marginBottom: 28,
    gap: 8,
  },

  emptyAssetsTitle: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: 'Sora_600SemiBold',
  },

  emptyAssetsText: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
    maxWidth: '92%',
  },

  manageButton: {
    minHeight: 48,
    alignSelf: 'center',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  manageButtonText: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_600SemiBold',
  },
});
