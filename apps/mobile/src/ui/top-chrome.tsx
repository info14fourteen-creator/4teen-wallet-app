import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, fontFamilies, radius, spacing } from '../theme/tokens';
import { getCompactVersionDisplayString } from '../config/app-version';
import { openInAppBrowser } from '../utils/open-in-app-browser';

import LogoWhite from '../../assets/icons/ui/logo_white.svg';
import { CloseIcon, InfoIcon, MenuIcon, ScanIcon, SearchIcon } from './ui-icons';

import DiscordIcon from '../../assets/icons/ui/socials/discord_social.svg';
import FacebookIcon from '../../assets/icons/ui/socials/facebook_social.svg';
import GithubIcon from '../../assets/icons/ui/socials/github_social.svg';
import InstagramIcon from '../../assets/icons/ui/socials/instagram_social.svg';
import TelegramIcon from '../../assets/icons/ui/socials/telegram_social.svg';
import ThreadsIcon from '../../assets/icons/ui/socials/threads_social.svg';
import TiktokIcon from '../../assets/icons/ui/socials/tiktok_social.svg';
import WhatsappIcon from '../../assets/icons/ui/socials/whatsapp_social.svg';
import XIcon from '../../assets/icons/ui/socials/x_social.svg';
import YoutubeIcon from '../../assets/icons/ui/socials/youtube_social.svg';

export const TOP_CHROME_HEIGHT = 52;
export const TOP_CHROME_TOP_PADDING = 10;
export const TOP_CHROME_MENU_GAP = 10;
const SCREEN_SIDE_PADDING = 20;

type MenuView = 'main' | 'about' | 'terms' | 'whitepaper';

const socials = [
  { Icon: TelegramIcon, label: 'Telegram', url: 'https://t.me/fourteentoken' },
  { Icon: DiscordIcon, label: 'Discord', url: 'https://discord.gg/jWZF6KzPCB' },
  { Icon: XIcon, label: 'X', url: 'https://x.com/4teenDeFi' },
  { Icon: FacebookIcon, label: 'Facebook', url: 'https://facebook.com/Fourteentoken' },
  { Icon: InstagramIcon, label: 'Instagram', url: 'https://instagram.com/fourteentoken' },
  { Icon: ThreadsIcon, label: 'Threads', url: 'https://www.threads.com/@fourteentoken' },
  { Icon: TiktokIcon, label: 'TikTok', url: 'https://www.tiktok.com/@4teentoken' },
  { Icon: YoutubeIcon, label: 'YouTube', url: 'https://www.youtube.com/@4teentoken' },
  { Icon: WhatsappIcon, label: 'WhatsApp', url: 'https://wa.me/16462178070' },
  { Icon: GithubIcon, label: 'GitHub', url: 'https://github.com/info14fourteen-creator' },
];

function ChromeBar({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.bar}>
      <TouchableOpacity activeOpacity={0.85} style={styles.iconButton} onPress={onToggle}>
        {open ? <CloseIcon width={22} height={22} /> : <MenuIcon width={24} height={24} />}
      </TouchableOpacity>

      <View style={styles.search}>
        <TextInput
          editable={false}
          pointerEvents="none"
          placeholder="crypto, address, dapp..."
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />
        <SearchIcon width={16} height={16} />
      </View>

      <TouchableOpacity activeOpacity={0.85} style={styles.iconButton} onPress={() => {}}>
        <ScanIcon width={22} height={22} />
      </TouchableOpacity>
    </View>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function MenuItem({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={styles.menuItem} onPress={onPress}>
      <Text style={styles.menuItemText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SubHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.subHeader}>
      <TouchableOpacity activeOpacity={0.85} style={styles.backRow} onPress={onBack}>
        <Ionicons name="arrow-back" size={15} color={colors.accent} />
        <Text style={styles.backText}>back</Text>
      </TouchableOpacity>

      <Text style={styles.subEyebrow}>{title}</Text>
    </View>
  );
}

function AboutActionRow({
  label,
  onPress,
  icon = 'chevron-forward',
}: {
  label: string;
  onPress?: () => void;
  icon?: 'chevron-forward' | 'star';
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={styles.aboutActionRow} onPress={onPress}>
      <Text style={styles.aboutActionText}>{label}</Text>

      {icon === 'star' ? (
        <Ionicons name="star" size={18} color={colors.accent} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.accent} />
      )}
    </TouchableOpacity>
  );
}

function RateButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={styles.rateButton} onPress={onPress}>
      <Text style={styles.rateButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function TopChrome() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>('main');
  const [rateOpen, setRateOpen] = useState(false);

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const shellOpacity = useRef(new Animated.Value(0)).current;
  const shellTranslateY = useRef(new Animated.Value(-18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: open ? 1 : 0,
        duration: open ? 180 : 140,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(shellOpacity, {
        toValue: open ? 1 : 0,
        duration: open ? 180 : 140,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(shellTranslateY, {
        toValue: open ? 0 : -18,
        duration: open ? 220 : 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (!open) {
        setView('main');
        setRateOpen(false);
      }
    });
  }, [open, overlayOpacity, shellOpacity, shellTranslateY]);

  const closeAll = () => setOpen(false);
  const openAbout = () => setView('about');
  const goTerms = () => setView('terms');
  const goWhitepaper = () => setView('whitepaper');

  const handleVersionUpdate = () => {
    const isLatestVersion = true;
    if (isLatestVersion) {
      // заглушка под твою нотификацию
      return;
    }
    void openInAppBrowser(router, 'https://4teen.me');
  };

  return (
    <>
      <ChromeBar open={open} onToggle={() => setOpen((prev) => !prev)} />

      <Modal visible={open} transparent animationType="none" onRequestClose={closeAll}>
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
            <Pressable style={styles.overlayPressable} onPress={closeAll} />
          </Animated.View>

          <Animated.View
            style={[
              styles.menuShell,
              {
                opacity: shellOpacity,
                transform: [{ translateY: shellTranslateY }],
              },
            ]}
          >
            {view === 'main' && (
              <View style={styles.menuInner}>
                <ScrollView
                  style={styles.menuScroll}
                  contentContainerStyle={styles.menuScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <View style={styles.sectionBlock}>
                    <SectionTitle>wallet</SectionTitle>
                    <MenuItem label="Home" />
                    <MenuItem label="Create wallet" />
                    <MenuItem label="Import wallet" />
                    <MenuItem label="Settings" />
                  </View>

                  <View style={styles.sectionBlock}>
                    <SectionTitle>ecosystem</SectionTitle>
                    <MenuItem label="Direct buy" />
                    <MenuItem label="Swap" />
                    <MenuItem label="Unlock timeline" />
                    <MenuItem label="Liquidity" />
                    <MenuItem label="Ambassador" />
                    <MenuItem label="Airdrop" />
                  </View>

                  <View style={styles.menuBottomSpacer} />
                </ScrollView>

                <View style={styles.footer}>
                  <TouchableOpacity activeOpacity={0.85} style={styles.aboutButton} onPress={openAbout}>
                    <View style={styles.aboutLeft}>
                      <InfoIcon width={18} height={18} />
                      <Text style={styles.aboutEyebrow}>ABOUT US</Text>
                    </View>

                    <Ionicons name="chevron-forward" size={18} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {view === 'about' && (
              <ScrollView
                style={styles.menuScroll}
                contentContainerStyle={styles.aboutScrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <SubHeader title="ABOUT US" onBack={() => setView('main')} />

                <View style={styles.logoWrap}>
                  <LogoWhite width={92} height={92} />
                </View>

                <Text style={styles.versionText}>{getCompactVersionDisplayString()}</Text>

                <View style={styles.aboutCard}>
                  <AboutActionRow label="Version Update" onPress={handleVersionUpdate} />
                  <AboutActionRow label="Terms of Service" onPress={goTerms} />
                  <AboutActionRow label="4TEEN Whitepaper" onPress={goWhitepaper} />
                  <AboutActionRow label="Rate Us" icon="star" onPress={() => setRateOpen(true)} />
                </View>

                <Text style={styles.channelsTitle}>Official channels</Text>

                <View style={styles.socialCard}>
                  <View style={styles.socialGrid}>
                    {socials.map(({ Icon, label, url }) => (
                      <TouchableOpacity
                        key={label}
                        activeOpacity={0.85}
                        style={styles.socialItem}
                        onPress={() => void openInAppBrowser(router, url)}
                      >
                        <View style={styles.socialIconWrap}>
                          <Icon width={28} height={28} />
                        </View>
                        <Text style={styles.socialLabel}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.websiteButton}
                  onPress={() => void openInAppBrowser(router, 'https://4teen.me')}
                >
                  <Text style={styles.websiteButtonText}>Open 4TEEN Website</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {view === 'terms' && (
              <ScrollView
                style={styles.menuScroll}
                contentContainerStyle={styles.stubScrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <SubHeader title="TERMS OF SERVICE" onBack={() => setView('about')} />
                <Text style={styles.stubText}>Terms of Service placeholder</Text>
              </ScrollView>
            )}

            {view === 'whitepaper' && (
              <ScrollView
                style={styles.menuScroll}
                contentContainerStyle={styles.stubScrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <SubHeader title="4TEEN WHITEPAPER" onBack={() => setView('about')} />
                <Text style={styles.stubText}>4TEEN Whitepaper placeholder</Text>
              </ScrollView>
            )}
          </Animated.View>

          {rateOpen && (
            <View style={styles.rateModalWrap}>
              <View style={styles.rateModal}>
                <Text style={styles.rateTitle}>How do you like 4TEEN Wallet?</Text>
                <Text style={styles.rateLead}>
                  Your feedback helps shape the wallet while it is still actively evolving.
                </Text>

                <RateButton label="I like it!" onPress={() => setRateOpen(false)} />
                <RateButton label="I wanna feedback" onPress={() => setRateOpen(false)} />
                <RateButton label="Not this time" onPress={() => setRateOpen(false)} />
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: TOP_CHROME_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  search: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
  },

  input: {
    flex: 1,
    color: colors.white,
    paddingVertical: 0,
  },

  modalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  overlay: {
    position: 'absolute',
    top: TOP_CHROME_TOP_PADDING + TOP_CHROME_HEIGHT + TOP_CHROME_MENU_GAP,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },

  overlayPressable: {
    flex: 1,
  },

  menuShell: {
    position: 'absolute',
    top: TOP_CHROME_TOP_PADDING + TOP_CHROME_HEIGHT + TOP_CHROME_MENU_GAP,
    left: SCREEN_SIDE_PADDING,
    right: SCREEN_SIDE_PADDING,
    bottom: 0,
    backgroundColor: colors.bg,
  },

  menuInner: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  menuScroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  menuScrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    paddingBottom: spacing[4],
    gap: spacing[5],
  },

  sectionBlock: {
    gap: 10,
  },

  sectionTitle: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.displaySemi,
    textTransform: 'lowercase',
  },

  menuItem: {
    minHeight: 46,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginBottom: 8,
  },

  menuItemText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 18,
  },

  menuBottomSpacer: {
    height: 8,
  },

  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.accent,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[5],
    backgroundColor: colors.bg,
  },

  aboutButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  aboutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  aboutEyebrow: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.display,
  },

  subHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },

  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  backText: {
    color: colors.accent,
    fontSize: 15,
    lineHeight: 18,
  },

  subEyebrow: {
    color: colors.accent,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.display,
  },

  aboutScrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    paddingBottom: spacing[6],
    backgroundColor: colors.bg,
  },

  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  versionText: {
    color: colors.textSoft,
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 28,
  },

  aboutCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: 24,
    padding: 12,
  },

  aboutActionRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingHorizontal: 6,
  },

  aboutActionText: {
    color: colors.white,
    fontSize: 17,
    lineHeight: 22,
  },

  channelsTitle: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.displaySemi,
    textTransform: 'lowercase',
    marginBottom: 14,
  },

  socialCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 18,
    marginBottom: 26,
  },

  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 18,
    columnGap: 8,
  },

  socialItem: {
    width: '18%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },

  socialIconWrap: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  socialLabel: {
    color: colors.white,
    fontSize: 9,
    lineHeight: 11,
    textAlign: 'center',
  },

  websiteButton: {
    minHeight: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  websiteButtonText: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: fontFamilies.displaySemi,
  },

  stubScrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    paddingBottom: spacing[6],
    backgroundColor: colors.bg,
  },

  stubText: {
    color: colors.textSoft,
    fontSize: 16,
    lineHeight: 24,
  },

  rateModalWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },

  rateModal: {
    backgroundColor: colors.graphite,
    paddingTop: 26,
    paddingHorizontal: 22,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },

  rateTitle: {
    color: colors.white,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fontFamilies.display,
    textAlign: 'center',
    marginBottom: 14,
  },

  rateLead: {
    color: colors.textSoft,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 18,
  },

  rateButton: {
    minHeight: 58,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rateButtonText: {
    color: colors.accent,
    fontSize: 18,
    lineHeight: 22,
  },
});
