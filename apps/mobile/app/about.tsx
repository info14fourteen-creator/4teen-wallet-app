import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import LottieIcon from '../src/ui/lottie-icon';
import { useNotice } from '../src/notice/notice-provider';
import { submitAppFeedback } from '../src/services/feedback';
import { checkForAppUpdate } from '../src/services/app-release';

import LogoWhite from '../assets/icons/ui/logo_white.svg';

const TELEGRAM_SOCIAL_HOVER_SOURCE = require('../assets/icons/ui/socials/lottie/telegram_social_hover.json');
const DISCORD_SOCIAL_HOVER_SOURCE = require('../assets/icons/ui/socials/lottie/discord_social_hover.json');
const X_SOCIAL_HOVER_SOURCE = require('../assets/icons/ui/socials/lottie/x_social_hover.json');
const FACEBOOK_SOCIAL_HOVER_SOURCE = require('../assets/icons/ui/socials/lottie/facebook_social_hover.json');
const INSTAGRAM_SOCIAL_HOVER_SOURCE = require('../assets/icons/ui/socials/lottie/instagram_social_hover.json');
const THREADS_SOCIAL_HOVER_SOURCE = require('../assets/icons/ui/socials/lottie/threads_social_hover.json');
const TIKTOK_SOCIAL_HOVER_SOURCE = require('../assets/icons/ui/socials/lottie/tiktok_social_hover.json');
const YOUTUBE_SOCIAL_HOVER_SOURCE = require('../assets/icons/ui/socials/lottie/youtube_social_hover.json');
const WHATSAPP_SOCIAL_HOVER_SOURCE = require('../assets/icons/ui/socials/lottie/whatsapp_social_hover.json');
const GITHUB_SOCIAL_HOVER_SOURCE = require('../assets/icons/ui/socials/lottie/github_social_hover.json');

const socials = [
  { source: TELEGRAM_SOCIAL_HOVER_SOURCE, label: 'Telegram', url: 'https://t.me/fourteentoken', durationMs: 1500 },
  { source: DISCORD_SOCIAL_HOVER_SOURCE, label: 'Discord', url: 'https://discord.gg/jWZF6KzPCB', durationMs: 1500 },
  { source: X_SOCIAL_HOVER_SOURCE, label: 'X', url: 'https://x.com/4teen_me', durationMs: 1000 },
  { source: FACEBOOK_SOCIAL_HOVER_SOURCE, label: 'Facebook', url: 'https://facebook.com/Fourteentoken', durationMs: 1500 },
  { source: INSTAGRAM_SOCIAL_HOVER_SOURCE, label: 'Instagram', url: 'https://instagram.com/fourteentoken', durationMs: 1500 },
  { source: THREADS_SOCIAL_HOVER_SOURCE, label: 'Threads', url: 'https://www.threads.com/@fourteentoken', durationMs: 2000 },
  { source: TIKTOK_SOCIAL_HOVER_SOURCE, label: 'TikTok', url: 'https://www.tiktok.com/@4teentoken', durationMs: 1500 },
  { source: YOUTUBE_SOCIAL_HOVER_SOURCE, label: 'YouTube', url: 'https://www.youtube.com/@4teentoken', durationMs: 500 },
  { source: WHATSAPP_SOCIAL_HOVER_SOURCE, label: 'WhatsApp', url: 'https://wa.me/16462178070', durationMs: 1500 },
  { source: GITHUB_SOCIAL_HOVER_SOURCE, label: 'GitHub', url: 'https://github.com/info14fourteen-creator', durationMs: 1500 },
];

const SOCIAL_NAVIGATION_FALLBACK_BUFFER_MS = 120;

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
          {socials.map(({ source, label, url, durationMs }) => (
            <SocialLinkButton
              key={label}
              label={label}
              source={source}
              url={url}
              durationMs={durationMs}
              onOpen={async (nextUrl) => {
                await openInAppBrowser(router, nextUrl);
              }}
            />
          ))}
        </View>
      </View>
    </ProductScreen>
  );
}

function SocialLinkButton({
  label,
  source,
  url,
  durationMs,
  onOpen,
}: {
  label: string;
  source: object | number;
  url: string;
  durationMs: number;
  onOpen: (url: string) => Promise<void>;
}) {
  const [playToken, setPlayToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFallbackTimer = useCallback(() => {
    if (!fallbackTimerRef.current) return;
    clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearFallbackTimer();
    };
  }, [clearFallbackTimer]);

  const finishPress = useCallback(async () => {
    if (!busyRef.current) return;

    busyRef.current = false;
    clearFallbackTimer();

    try {
      await onOpen(url);
    } finally {
      if (mountedRef.current) {
        setBusy(false);
      }
    }
  }, [clearFallbackTimer, onOpen, url]);

  const handlePress = useCallback(() => {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setPlayToken((current) => current + 1);
    clearFallbackTimer();
    fallbackTimerRef.current = setTimeout(() => {
      void finishPress();
    }, durationMs + SOCIAL_NAVIGATION_FALLBACK_BUFFER_MS);
  }, [clearFallbackTimer, durationMs, finishPress]);

  const handleAnimationFinish = useCallback((isCancelled: boolean) => {
    if (isCancelled) return;
    void finishPress();
  }, [finishPress]);

  return (
    <TouchableOpacity
      activeOpacity={busy ? 1 : 0.85}
      disabled={busy}
      style={[styles.socialItem, busy && styles.socialItemBusy]}
      onPress={handlePress}
    >
      <View style={styles.socialIconWrap}>
        <LottieIcon
          source={source}
          size={30}
          staticFrame={0}
          playToken={playToken}
          onAnimationFinish={handleAnimationFinish}
        />
      </View>
      <Text style={ui.socialLabel}>{label}</Text>
    </TouchableOpacity>
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

  socialItemBusy: {
    opacity: 0.96,
  },

  socialIconWrap: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
