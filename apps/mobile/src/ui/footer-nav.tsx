import { useEffect, useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import Svg, { Defs, Line, LinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme/tokens';
import { useWalletSession } from '../wallet/wallet-session';

import AirdropIcon from '../../assets/icons/footer/airdrop_footer.svg';
import BuyIcon from '../../assets/icons/footer/buy_footer.svg';
import SwapIcon from '../../assets/icons/footer/swap_footer.svg';
import AmbassadorIcon from '../../assets/icons/footer/ambassador_footer.svg';

export const FOOTER_NAV_HEIGHT = 96;
export const FOOTER_NAV_RESERVED_SPACE = 108;

const HIDDEN_ROUTES = new Set([
  '/',
  '/index',
  '/unlock',
  '/create-wallet',
  '/import-wallet',
  '/import-seed',
  '/import-private-key',
  '/import-watch-only',
  '/create-passcode',
  '/confirm-passcode',
  '/enable-biometrics',
]);

export default function FooterNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { hasWallet, footerTickerItems } = useWalletSession();

  const [barWidth, setBarWidth] = useState(0);
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    if (!footerTickerItems.length) return;
    const timer = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % footerTickerItems.length);
    }, 2600);
    return () => clearInterval(timer);
  }, [footerTickerItems]);

  const tickerItem = useMemo(() => {
    return footerTickerItems[tickerIndex % footerTickerItems.length] || null;
  }, [footerTickerItems, tickerIndex]);

  if (HIDDEN_ROUTES.has(pathname)) return null;

  const handleLayout = (event: LayoutChangeEvent) => {
    setBarWidth(event.nativeEvent.layout.width);
  };

  const circleRadius = 30;
  const lineY = 24; // немного выше поднял линии
  const linePadding = 18;

  const onCenterPress = () => {
    router.replace(hasWallet ? '/home' : '/create-wallet');
  };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.host, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        <View style={styles.shell} onLayout={handleLayout}>
          {barWidth > 0 && (
            <Svg style={styles.linesSvg} width={barWidth} height={FOOTER_NAV_HEIGHT}>
              <Defs>
                <LinearGradient id="fadeLeft" x1="100%" y1="0%" x2="0%" y2="0%">
                  <Stop offset="0%" stopColor={colors.accent} stopOpacity="0.95" />
                  <Stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id="fadeRight" x1="0%" y1="0%" x2="100%" y2="0%">
                  <Stop offset="0%" stopColor={colors.accent} stopOpacity="0.95" />
                  <Stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Line
                x1={barWidth / 2 - circleRadius}
                y1={lineY}
                x2={linePadding}
                y2={lineY}
                stroke="url(#fadeLeft)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <Line
                x1={barWidth / 2 + circleRadius}
                y1={lineY}
                x2={barWidth - linePadding}
                y2={lineY}
                stroke="url(#fadeRight)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </Svg>
          )}

          <View style={styles.row}>
            <FooterButton Icon={AirdropIcon} label="AIRDROP" />
            <FooterButton Icon={BuyIcon} label="BUY" />
            <TouchableOpacity activeOpacity={0.9} style={styles.centerButton} onPress={onCenterPress}>
              <View style={styles.circle}>
                {tickerItem?.logoUri ? (
                  <Image source={{ uri: tickerItem.logoUri }} style={styles.logo} />
                ) : (
                  <View style={[styles.dot, hasWallet ? styles.dotOnline : styles.dotOffline]} />
                )}
              </View>
              <Text style={styles.centerLabel}>
                {tickerItem?.balanceLabel || 'WALLET'}
              </Text>
            </TouchableOpacity>
            <FooterButton Icon={SwapIcon} label="SWAP" />
            <FooterButton Icon={AmbassadorIcon} label="AMBASSADOR" />
          </View>
        </View>
      </View>
    </View>
  );
}

function FooterButton({ Icon, label }: any) {
  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.button}>
      <Icon width={28} height={28} />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: FOOTER_NAV_RESERVED_SPACE,
    backgroundColor: colors.bg,
    justifyContent: 'flex-end',
  },
  shell: {
    height: FOOTER_NAV_HEIGHT,
    justifyContent: 'center',
    position: 'relative',
  },
  linesSvg: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 9,
    fontFamily: 'Sora_600SemiBold',
    color: colors.white,
    marginTop: 4,
    textAlign: 'center',
  },
  centerButton: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1.2,
    paddingHorizontal: 4,
  },
  circle: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 1.5, borderColor: colors.accent,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.bg,
  },
  dot: {
    width: 12, height: 12, borderRadius: 6,
  },
  dotOnline: {
    backgroundColor: colors.green,
    shadowColor: colors.green, shadowRadius: 10, shadowOpacity: 0.8,
  },
  dotOffline: {
    backgroundColor: colors.red,
    shadowColor: colors.red, shadowRadius: 10, shadowOpacity: 0.8,
  },
  logo: {
    width: 32, height: 32, resizeMode: 'contain',
  },
  centerLabel: {
    marginTop: 4, fontSize: 9,
    fontFamily: 'Sora_600SemiBold',
    color: colors.accent, textAlign: 'center',
  },
});
