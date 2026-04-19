import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import Svg, { Defs, Line, LinearGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme/tokens';
import { useNotice } from '../notice/notice-provider';
import { useWalletSession } from '../wallet/wallet-session';
import { shouldHideFooterByRoute } from './navigation-routes';
import FourteenWalletLoader from './fourteen-wallet-loader.tsx';

import HomeIcon from '../../assets/icons/ui/home_footer_menu_btn.svg';
import HomeIconActive from '../../assets/icons/ui/home_footer_menu_btn_onclick.svg';
import SendIcon from '../../assets/icons/ui/send_footer_menu_btn.svg';
import SendIconActive from '../../assets/icons/ui/send_footer_menu_btn_onclick.svg';
import SwapIcon from '../../assets/icons/ui/swap_footer_menu_btn.svg';
import SwapIconActive from '../../assets/icons/ui/swap_footer_menu_btn_onclick.svg';
import EarnIcon from '../../assets/icons/ui/earn_footer_menu_btn.svg';
import EarnIconActive from '../../assets/icons/ui/earn_footer_menu_btn_onclick.svg';

export const FOOTER_NAV_HEIGHT = 78;
export const FOOTER_NAV_RESERVED_SPACE = 70;
export const FOOTER_NAV_BOTTOM_OFFSET = 18;

const HIDDEN_ROUTES = new Set([
  '/',
  '/index',
  '/unlock',
  '/create-passcode',
  '/confirm-passcode',
]);

type FooterNavProps = {
  forceVisible?: boolean;
  style?: ViewStyle;
};

type FooterItemProps = {
  label: string;
  active: boolean;
  Icon: any;
  ActiveIcon: any;
  onPress: () => void;
};

export default function FooterNav({ forceVisible = false, style }: FooterNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const notice = useNotice();
  const { hasWallet, activeWalletKind, footerTickerItems, chromeLoaderVisible } = useWalletSession();

  const [barWidth, setBarWidth] = useState(0);
  const [tickerIndex, setTickerIndex] = useState(0);
  const tickerIdsSignature = useMemo(() => {
    return footerTickerItems.map((item) => item.id).join('|');
  }, [footerTickerItems]);

  useEffect(() => {
    setTickerIndex(0);
  }, [tickerIdsSignature]);

  useEffect(() => {
    if (!footerTickerItems.length) return;

    const timer = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % footerTickerItems.length);
    }, 2600);

    return () => clearInterval(timer);
  }, [footerTickerItems.length]);

  const tickerItem = useMemo(() => {
    return footerTickerItems[tickerIndex % footerTickerItems.length] || null;
  }, [footerTickerItems, tickerIndex]);

  if (!forceVisible && (HIDDEN_ROUTES.has(pathname) || shouldHideFooterByRoute(pathname))) return null;

  const handleLayout = (event: LayoutChangeEvent) => {
    setBarWidth(event.nativeEvent.layout.width);
  };

  const circleRadius = 29;
  const lineY = 26;
  const linePadding = 18;

  const isHomeActive = pathname === '/home';
  const isSendActive =
    pathname === '/send' || pathname === '/send-confirm' || pathname === '/address-book';
  const isWalletActive =
    pathname === '/wallet' ||
    pathname === '/select-wallet' ||
    pathname === '/wallets' ||
    pathname === '/token-details' ||
    pathname === '/manage-crypto' ||
    pathname === '/add-custom-token' ||
    pathname === '/backup-private-key' ||
    pathname === '/multisig-transactions' ||
    pathname === '/connections';
  const isSwapActive = pathname === '/swap';
  const isEarnActive = pathname === '/earn' || pathname === '/buy' || pathname === '/airdrop' || pathname === '/ambassador';

  const goHome = () => router.replace('/home');
  const goSend = () => {
    if (activeWalletKind === 'watch-only') {
      notice.showNeutralNotice(
        'Watch-only wallet cannot open send flow. Switch to a signing wallet first.',
        2600
      );
      return;
    }

    router.push('/send');
  };
  const goWallet = () => router.replace(hasWallet ? '/wallet' : '/create-wallet');
  const goSwap = () => router.push('/swap' as any);
  const goEarn = () => router.push('/earn' as any);

  return (
    <View pointerEvents="box-none" style={[styles.root, style]}>
      <View
        pointerEvents="none"
        style={[
          styles.bottomScreenFill,
          { height: FOOTER_NAV_BOTTOM_OFFSET + Math.max(insets.bottom, 2) + 2 },
        ]}
      />
      <View style={[styles.host, { paddingBottom: Math.max(insets.bottom, 2) }]}>
        <View style={styles.shell} onLayout={handleLayout}>
          <View pointerEvents="none" style={[styles.baseFill, { top: lineY - 2, bottom: -20 }]} />

          {barWidth > 0 ? (
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
                x1={barWidth / 2 - circleRadius + 10}
                y1={lineY}
                x2={linePadding}
                y2={lineY}
                stroke="url(#fadeLeft)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <Line
                x1={barWidth / 2 + circleRadius - 10}
                y1={lineY}
                x2={barWidth - linePadding}
                y2={lineY}
                stroke="url(#fadeRight)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </Svg>
          ) : null}

          <View style={styles.row}>
            <FooterItem
              label="HOME"
              active={isHomeActive}
              Icon={HomeIcon}
              ActiveIcon={HomeIconActive}
              onPress={goHome}
            />

            <FooterItem
              label="SEND"
              active={isSendActive}
              Icon={SendIcon}
              ActiveIcon={SendIconActive}
              onPress={goSend}
            />

            <TouchableOpacity activeOpacity={0.9} style={styles.centerButton} onPress={goWallet}>
              <View style={[styles.circle, isWalletActive && styles.circleActive]}>
                {chromeLoaderVisible ? (
                  <FourteenWalletLoader active={chromeLoaderVisible} size={32} />
                ) : tickerItem?.logoUri ? (
                  <Image source={{ uri: tickerItem.logoUri }} style={styles.logo} />
                ) : (
                  <View style={[styles.dot, hasWallet ? styles.dotOnline : styles.dotOffline]} />
                )}
              </View>

              <Text style={[styles.centerLabel, isWalletActive && styles.centerLabelActive]}>
                {tickerItem?.balanceLabel || 'WALLET'}
              </Text>
            </TouchableOpacity>

            <FooterItem
              label="SWAP"
              active={isSwapActive}
              Icon={SwapIcon}
              ActiveIcon={SwapIconActive}
              onPress={goSwap}
            />

            <FooterItem
              label="EARN"
              active={isEarnActive}
              Icon={EarnIcon}
              ActiveIcon={EarnIconActive}
              onPress={goEarn}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function FooterItem({
  label,
  active,
  Icon,
  ActiveIcon,
  onPress,
}: FooterItemProps) {
  const CurrentIcon = active ? ActiveIcon : Icon;

  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.button} onPress={onPress}>
      <CurrentIcon width={24} height={24} />
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
  },

  bottomScreenFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    zIndex: 79,
  },

  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: FOOTER_NAV_BOTTOM_OFFSET,
    height: FOOTER_NAV_HEIGHT,
    justifyContent: 'center',
    zIndex: 80,
  },

  shell: {
    height: FOOTER_NAV_HEIGHT,
    justifyContent: 'center',
    position: 'relative',
  },

  baseFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },

  linesSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingBottom: 0,
  },

  button: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
    paddingHorizontal: 2,
  },

  label: {
    fontSize: 9,
    lineHeight: 11,
    fontFamily: 'Sora_600SemiBold',
    color: colors.white,
    marginTop: 7,
    textAlign: 'center',
    opacity: 0.88,
  },

  labelActive: {
    color: colors.accent,
    opacity: 1,
  },

  centerButton: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1.2,
    paddingHorizontal: 4,
    marginTop: 4,
  },

  circle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },

  circleActive: {
    borderColor: colors.accent,
  },

  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },

  dotOnline: {
    backgroundColor: colors.green,
    shadowColor: colors.green,
    shadowRadius: 10,
    shadowOpacity: 0.8,
  },

  dotOffline: {
    backgroundColor: colors.red,
    shadowColor: colors.red,
    shadowRadius: 10,
    shadowOpacity: 0.8,
  },

  logo: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
  },

  centerLabel: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 13,
    fontFamily: 'Sora_600SemiBold',
    color: colors.white,
    textAlign: 'center',
  },

  centerLabelActive: {
    color: colors.accent,
  },
});
