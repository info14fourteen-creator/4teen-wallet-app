import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProductScreen } from '../src/ui/product-shell';

import ExpandChevron from '../src/ui/expand-chevron';
import { useI18n } from '../src/i18n';
import { colors, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import {
  getBuildDisplayString,
  getVersionDisplayString,
} from '../src/config/app-version';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import { useNotice } from '../src/notice/notice-provider';
import { submitAppFeedback } from '../src/services/feedback';
import { checkForAppUpdate } from '../src/services/app-release';

import LogoWhite from '../assets/icons/ui/logo_white.svg';

import DiscordIcon from '../assets/icons/ui/socials/discord_social.svg';
import FacebookIcon from '../assets/icons/ui/socials/facebook_social.svg';
import GithubIcon from '../assets/icons/ui/socials/github_social.svg';
import InstagramIcon from '../assets/icons/ui/socials/instagram_social.svg';
import TelegramIcon from '../assets/icons/ui/socials/telegram_social.svg';
import ThreadsIcon from '../assets/icons/ui/socials/threads_social.svg';
import TiktokIcon from '../assets/icons/ui/socials/tiktok_social.svg';
import WhatsappIcon from '../assets/icons/ui/socials/whatsapp_social.svg';
import XIcon from '../assets/icons/ui/socials/x_social.svg';
import YoutubeIcon from '../assets/icons/ui/socials/youtube_social.svg';

const socials = [
  { Icon: TelegramIcon, label: 'Telegram', url: 'https://t.me/fourteentoken' },
  { Icon: DiscordIcon, label: 'Discord', url: 'https://discord.gg/jWZF6KzPCB' },
  { Icon: XIcon, label: 'X', url: 'https://x.com/4teen_me' },
  { Icon: FacebookIcon, label: 'Facebook', url: 'https://facebook.com/Fourteentoken' },
  { Icon: InstagramIcon, label: 'Instagram', url: 'https://instagram.com/fourteentoken' },
  { Icon: ThreadsIcon, label: 'Threads', url: 'https://www.threads.com/@fourteentoken' },
  { Icon: TiktokIcon, label: 'TikTok', url: 'https://www.tiktok.com/@4teentoken' },
  { Icon: YoutubeIcon, label: 'YouTube', url: 'https://www.youtube.com/@4teentoken' },
  { Icon: WhatsappIcon, label: 'WhatsApp', url: 'https://wa.me/16462178070' },
  { Icon: GithubIcon, label: 'GitHub', url: 'https://github.com/info14fourteen-creator' },
];

export default function AboutScreen() {
  const router = useRouter();
  const notice = useNotice();
  const { t } = useI18n();

  const handleVersionUpdate = async () => {
    const release = await checkForAppUpdate().catch(() => null);

    if (!release) {
      void openInAppBrowser(router, 'https://4teen.me');
      return;
    }

    if (!release.hasUpdate && !release.isBelowMinimum) {
      notice.showUpdateNotice(t('You are using the latest internal alpha build.'), 5000);
      return;
    }

    notice.showAckNotice(
      t('A newer build is available.'),
      [
        {
          label: t('Open Website'),
          onPress: () => void openInAppBrowser(router, release.updateUrl),
        },
      ],
      'update'
    );
  };

  const handleRateUs = () => {
    notice.showAckNotice(
      t('How do you like 4TEEN Wallet?'),
      [
        {
          label: t('I Like It'),
          onPress: async () => {
            await submitAppFeedback({
              type: 'praise',
              title: 'This feels good',
              message: 'User tapped the positive feedback shortcut from the About screen.',
              sourceScreen: 'about',
              details: {
                trigger: 'about-rate-us',
              },
            }).catch(() => null);
            notice.showSuccessNotice(t('Nice. At least somebody is happy.'), 3500);
          },
        },
        {
          label: t('I Wanna Feedback'),
          onPress: () => router.push('/feedback?sourceScreen=about' as any),
        },
        {
          label: t('Not This Time'),
          onPress: () => notice.showNeutralNotice(t('Fair enough.'), 2500),
        },
      ],
      'neutral'
    );
  };

  return (
    <ProductScreen eyebrow={t('ABOUT US')}>
      <View style={styles.logoWrap}>
        <LogoWhite width={92} height={92} />
      </View>

      <View style={styles.versionRow}>
        <Text style={ui.versionLine}>
          {t('VERSION')} {getVersionDisplayString()}
        </Text>
        <Text style={styles.buildLine}>
          {t('BUILD')} {getBuildDisplayString()}
        </Text>
      </View>

      <View style={styles.card}>
        <ActionRow label={t('Version Update')} onPress={handleVersionUpdate} />
        <ActionRow label={t('Terms of Service')} onPress={() => router.push('/terms' as any)} />
        <ActionRow label={t('4TEEN Whitepaper')} onPress={() => router.push('/whitepaper' as any)} />
        <ActionRow label={t('Rate Us')} icon="star" onPress={handleRateUs} />
        <ActionRow label={t('Open 4TEEN Website')} icon="external" onPress={() => void openInAppBrowser(router, 'https://4teen.me')} isLast />
      </View>

      <Text style={ui.sectionEyebrow}>{t('Official Channels')}</Text>

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
              <Text style={ui.socialLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ProductScreen>
  );
}

function ActionRow({
  label,
  onPress,
  icon = 'chevron-forward',
  isLast = false,
}: {
  label: string;
  onPress: () => void;
  icon?: 'chevron-forward' | 'star' | 'external';
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.actionRow, isLast && styles.actionRowLast]}
      onPress={onPress}
    >
      <Text style={ui.actionLabel}>{label}</Text>

      {icon === 'star' ? (
        <Ionicons name="star" size={18} color={colors.accent} />
      ) : icon === 'external' ? (
        <Ionicons name="open-outline" size={18} color={colors.accent} />
      ) : (
        <ExpandChevron open={false} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  versionRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    gap: 4,
  },

  buildLine: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
  },

  card: {
    backgroundColor: 'rgba(255,105,0,0.075)',
    borderWidth: 1,
    borderColor: 'rgba(255,105,0,0.18)',
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  actionRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingHorizontal: 6,
  },

  actionRowLast: {
    borderBottomWidth: 0,
  },

  socialCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 18,
    marginTop: 12,
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
});
