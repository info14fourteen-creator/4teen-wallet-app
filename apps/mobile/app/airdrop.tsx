import type { ComponentType } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  AIRDROP_SOCIAL_URLS,
  getActiveWalletTelegramAirdropOverview,
  getWalletAirdropOnChainSnapshot,
  type AirdropVaultOnChainSnapshot,
  startTelegramAirdropFlow,
  type TelegramAirdropOverview,
} from '../src/services/airdrop';
import { getCachedWalletPortfolio } from '../src/services/wallet/portfolio';
import { listWallets, setActiveWalletId, type WalletMeta } from '../src/services/wallet/storage';
import { useNotice } from '../src/notice/notice-provider';
import {
  ProductScreen,
} from '../src/ui/product-shell';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import SelectedWalletSwitcher from '../src/ui/selected-wallet-switcher';
import { colors, radius, spacing } from '../src/theme/tokens';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import useChromeLoading from '../src/ui/use-chrome-loading';
import { useWalletSession } from '../src/wallet/wallet-session';

import FacebookIcon from '../assets/icons/ui/socials/facebook_social.svg';
import InstagramIcon from '../assets/icons/ui/socials/instagram_social.svg';
import TelegramIcon from '../assets/icons/ui/socials/telegram_social.svg';
import XIcon from '../assets/icons/ui/socials/x_social.svg';
import YoutubeIcon from '../assets/icons/ui/socials/youtube_social.svg';

const AIRDROP_INFO_TITLE = 'Social distribution state';
const AIRDROP_INFO_TEXT =
  'This page tracks social airdrop eligibility per wallet, not generic token transfers. Right now the live flow is Telegram: the app signs a wallet session, opens the bot, and then checks whether the reward is available, queued, blocked by a legacy claim, or already received.\n\nThe Telegram card merges three layers: local wallet state, current bot session state, and on-chain claim status. That is why the status may read available, verify now, session live, queued, or received.\n\nThe other social cards are placeholders for rollout state. They can show already-claimed on-chain rewards if any exist, but the live social claim flow is not open there yet.';

type SocialCardTone = 'green' | 'orange' | 'red';

type SocialCardItem = {
  key: string;
  title: string;
  status: string;
  amount: string;
  when: string;
  tone: SocialCardTone;
  actionLabel: string;
  actionable: boolean;
  explorerUrl?: string | null;
  socialUrl?: string | null;
  Icon: ComponentType<{ width?: number; height?: number }>;
};

type WalletSwitcherItem = {
  id: string;
  name: string;
  address: string;
  kind: WalletMeta['kind'];
  balanceDisplay: string;
};

function shortenAddress(address: string) {
  const safe = String(address || '').trim();
  if (safe.length <= 14) return safe || '—';
  return `${safe.slice(0, 6)}...${safe.slice(-6)}`;
}

function formatSocialDate(value?: string | null) {
  const safe = String(value || '').trim();

  if (!safe) {
    return 'Not received yet';
  }

  const date = new Date(safe);

  if (!Number.isFinite(date.getTime())) {
    return 'Not received yet';
  }

  return date.toLocaleString();
}

function formatCardAmount(value: string) {
  const raw = String(value || '')
    .replace(/\s*4TEEN$/i, '')
    .replace(/,/g, '')
    .trim();

  if (!raw) {
    return '0';
  }

  if (raw.toLowerCase() === 'tba') {
    return 'TBA';
  }

  if (raw.toLowerCase() === 'claimed') {
    return 'Claimed';
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return '0';
  }

  return parsed.toLocaleString('en-US', {
    minimumFractionDigits: parsed >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function buildTelegramCard(
  wallet: WalletMeta | null,
  overview: TelegramAirdropOverview | null,
  onChain: AirdropVaultOnChainSnapshot | null
): SocialCardItem {
  const telegramClaim = onChain?.platforms.telegram ?? null;

  if (!wallet) {
    return {
      key: 'telegram',
      title: 'Telegram',
      status: 'NEEDS WALLET',
      amount: '0',
      when: 'Connect a wallet first',
      tone: 'orange',
      actionLabel: 'OPEN WALLETS',
      actionable: true,
      socialUrl: AIRDROP_SOCIAL_URLS.telegram,
      Icon: TelegramIcon,
    };
  }

  if (wallet.kind === 'watch-only') {
    return {
      key: 'telegram',
      title: 'Telegram',
      status: 'WATCH-ONLY',
      amount: '0',
      when: 'Switch to a signing wallet',
      tone: 'orange',
      actionLabel: 'SWITCH WALLET',
      actionable: true,
      socialUrl: AIRDROP_SOCIAL_URLS.telegram,
      Icon: TelegramIcon,
    };
  }

  if (telegramClaim?.claimed) {
    return {
      key: 'telegram',
      title: 'Telegram',
      status: 'RECEIVED',
      amount: formatCardAmount(telegramClaim.amountDisplay),
      when: telegramClaim.claimedAtLabel,
      tone: 'green',
      actionLabel: 'VIEW TX',
      actionable: true,
      explorerUrl: telegramClaim.explorerUrl,
      socialUrl: AIRDROP_SOCIAL_URLS.telegram,
      Icon: TelegramIcon,
    };
  }

  if (overview?.claim?.status === 'sent') {
    return {
      key: 'telegram',
      title: 'Telegram',
      status: 'RECEIVED',
      amount: formatCardAmount(overview.claim.reward_amount || '0'),
      when: formatSocialDate(overview.claim.sent_at),
      tone: 'green',
      actionLabel: overview.claim.txid ? 'VIEW TX' : 'OPEN TELEGRAM',
      actionable: true,
      explorerUrl: overview.claim.txid
        ? `https://tronscan.org/#/transaction/${overview.claim.txid}`
        : null,
      socialUrl: AIRDROP_SOCIAL_URLS.telegram,
      Icon: TelegramIcon,
    };
  }

  if (overview?.claim?.status === 'queued') {
    return {
      key: 'telegram',
      title: 'Telegram',
      status: 'QUEUED',
      amount: formatCardAmount(overview.claim.reward_amount || '0'),
      when: formatSocialDate(overview.claim.queued_at),
      tone: 'orange',
      actionLabel: 'OPEN TELEGRAM',
      actionable: true,
      socialUrl: AIRDROP_SOCIAL_URLS.telegram,
      Icon: TelegramIcon,
    };
  }

  if (overview?.guard.walletBlockedByLegacyClaim || overview?.guard.telegramBlockedByLegacyClaim) {
    return {
      key: 'telegram',
      title: 'Telegram',
      status: 'LEGACY USED',
      amount: '0',
      when: 'Already consumed in old bot flow',
      tone: 'green',
      actionLabel: 'OPEN TELEGRAM',
      actionable: true,
      socialUrl: AIRDROP_SOCIAL_URLS.telegram,
      Icon: TelegramIcon,
    };
  }

  if (overview?.session?.status === 'wallet_verified') {
    return {
      key: 'telegram',
      title: 'Telegram',
      status: 'SESSION LIVE',
      amount: '0',
      when: 'Open Telegram, press Start, then Verify',
      tone: 'orange',
      actionLabel: 'OPEN TELEGRAM',
      actionable: true,
      socialUrl: AIRDROP_SOCIAL_URLS.telegram,
      Icon: TelegramIcon,
    };
  }

  if (overview?.session?.status === 'awaiting_membership') {
    return {
      key: 'telegram',
      title: 'Telegram',
      status: 'VERIFY NOW',
      amount: '0',
      when: 'Join group and channel, then press Verify',
      tone: 'orange',
      actionLabel: 'OPEN TELEGRAM',
      actionable: true,
      socialUrl: AIRDROP_SOCIAL_URLS.telegram,
      Icon: TelegramIcon,
    };
  }

  return {
    key: 'telegram',
    title: 'Telegram',
    status: 'AVAILABLE',
    amount: '0',
    when: 'Not received yet',
    tone: 'orange',
    actionLabel: 'CONNECT NOW',
    actionable: true,
    socialUrl: AIRDROP_SOCIAL_URLS.telegram,
    Icon: TelegramIcon,
  };
}

function buildSocialCards(
  wallet: WalletMeta | null,
  overview: TelegramAirdropOverview | null,
  onChain: AirdropVaultOnChainSnapshot | null
): SocialCardItem[] {
  const buildStaticPlatformCard = (
    key: 'instagram' | 'x' | 'facebook' | 'youtube',
    title: string,
    Icon: ComponentType<{ width?: number; height?: number }>
  ): SocialCardItem => {
    const claim = onChain?.platforms[key] ?? null;

    if (claim?.claimed) {
      return {
        key,
        title,
        status: 'RECEIVED',
        amount: formatCardAmount(claim.amountDisplay),
        when: claim.claimedAtLabel,
        tone: 'green',
        actionLabel: claim.explorerUrl ? 'VIEW TX' : 'CLAIMED',
        actionable: Boolean(claim.explorerUrl),
        explorerUrl: claim.explorerUrl,
        socialUrl: AIRDROP_SOCIAL_URLS[key],
        Icon,
      };
    }

    return {
      key,
      title,
      status: 'NOT LIVE',
      amount: 'TBA',
      when: 'Rollout pending',
      tone: 'red',
      actionLabel: `OPEN ${title.toUpperCase()}`,
      actionable: true,
      socialUrl: AIRDROP_SOCIAL_URLS[key],
      Icon,
    };
  };

  const cards = [
    buildStaticPlatformCard('instagram', 'Instagram', InstagramIcon),
    buildStaticPlatformCard('x', 'X', XIcon),
    buildTelegramCard(wallet, overview, onChain),
    buildStaticPlatformCard('facebook', 'Facebook', FacebookIcon),
    buildStaticPlatformCard('youtube', 'YouTube', YoutubeIcon),
  ];

  return cards.sort((a, b) => {
    const rank = (item: SocialCardItem) => {
      if (item.key === 'telegram') return 0;
      if (item.tone === 'green') return 1;
      if (item.tone === 'orange') return 2;
      return 3;
    };

    return rank(a) - rank(b);
  });
}

export default function AirdropScreen() {
  const router = useRouter();
  const notice = useNotice();
  const { setPendingWalletSelectionId } = useWalletSession();
  const [wallet, setWallet] = useState<WalletMeta | null>(null);
  const [overview, setOverview] = useState<TelegramAirdropOverview | null>(null);
  const [onChain, setOnChain] = useState<AirdropVaultOnChainSnapshot | null>(null);
  const [walletChoices, setWalletChoices] = useState<WalletSwitcherItem[]>([]);
  const [walletOptionsOpen, setWalletOptionsOpen] = useState(false);
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const statusNoticeKeyRef = useRef('');
  const statusNoticePrimedRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  useChromeLoading((loading && !walletChoices.length) || refreshing || Boolean(switchingWalletId));

  const load = useCallback(async (refresh = false) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [snapshot, wallets] = await Promise.all([
        getActiveWalletTelegramAirdropOverview(),
        listWallets(),
      ]);

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      const signingWallets = wallets.filter((item) => item.kind !== 'watch-only');

      if (snapshot.wallet?.kind === 'watch-only' && signingWallets[0]) {
        await setActiveWalletId(signingWallets[0].id);
        setPendingWalletSelectionId(signingWallets[0].id);

        if (loadRequestIdRef.current === requestId) {
          void load(refresh);
        }
        return;
      }

      const resolvedWallet =
        snapshot.wallet?.kind === 'watch-only' ? null : snapshot.wallet;

      setWallet(resolvedWallet);
      setOverview(snapshot.overview);
      setOnChain((current) =>
        current && current.walletAddress === resolvedWallet?.address ? current : null
      );
      setWalletChoices(
        await Promise.all(
          signingWallets.map(async (item) => {
            const cachedPortfolio = await getCachedWalletPortfolio(item.address, {
              allowStale: true,
            }).catch(() => null);

            return {
              id: item.id,
              name: item.name,
              address: item.address,
              kind: item.kind,
              balanceDisplay: cachedPortfolio?.totalBalanceDisplay ?? '—',
            };
          })
        )
      );

      if (!resolvedWallet?.address) {
        setOnChain(null);
        return;
      }

      const nextOnChain = await getWalletAirdropOnChainSnapshot(resolvedWallet.address, {
        force: refresh,
      });

      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      setOnChain(nextOnChain);
    } catch (error) {
      console.error(error);

      if (loadRequestIdRef.current === requestId) {
        setOverview(null);
        setOnChain(null);
      }

      notice.showErrorNotice(
        error instanceof Error
          ? error.message
          : refresh
            ? 'Failed to refresh Telegram airdrop.'
            : 'Failed to load Telegram airdrop.',
        2600
      );
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false);
      }
      if (loadRequestIdRef.current === requestId) {
        setRefreshing(false);
      }
    }
  }, [notice, setPendingWalletSelectionId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    statusNoticePrimedRef.current = false;
    statusNoticeKeyRef.current = '';
  }, [wallet?.id]);

  useEffect(() => {
    if (!overview) return;

    const statusKey = [
      overview.claim?.status || '',
      overview.claim?.txid || '',
      overview.link?.telegram_user_id || '',
      overview.guard.walletBlockedByLegacyClaim ? 'legacy-wallet' : '',
      overview.guard.telegramBlockedByLegacyClaim ? 'legacy-telegram' : '',
    ].join('|');

    if (!statusNoticePrimedRef.current) {
      statusNoticePrimedRef.current = true;
      statusNoticeKeyRef.current = statusKey;
      return;
    }

    if (statusNoticeKeyRef.current === statusKey) {
      return;
    }

    statusNoticeKeyRef.current = statusKey;

    if (overview.claim?.status === 'sent') {
      notice.showSuccessNotice('Telegram airdrop was already received for this wallet.', 3200);
      return;
    }

    if (overview.claim?.status === 'queued') {
      notice.showUpdateNotice('Telegram proof accepted. Claim is queued for send.', 3200);
      return;
    }

    if (overview.guard.walletBlockedByLegacyClaim || overview.guard.telegramBlockedByLegacyClaim) {
      notice.showNeutralNotice('Telegram airdrop was already consumed in the legacy bot flow.', 3400);
      return;
    }

    if (overview.link?.telegram_user_id) {
      notice.showUpdateNotice('Telegram account is linked to this wallet.', 2600);
    }
  }, [notice, overview]);

  const openTelegram = useCallback(async () => {
    try {
      if (!wallet) {
        notice.showNeutralNotice('Create or import a full-access wallet first.', 2400);
        router.push('/wallets');
        return;
      }

      if (wallet.kind === 'watch-only') {
        notice.showNeutralNotice('Telegram airdrop requires a full-access wallet.', 2600);
        router.push('/wallets');
        return;
      }

      setLaunching(true);
      notice.showNeutralNotice('Preparing signed Telegram session...', 2200);

      const result = await startTelegramAirdropFlow();
      notice.showSuccessNotice('Wallet session signed. Opening Telegram...', 2400);

      if (result.appUrl) {
        await Linking.openURL(result.appUrl);
      } else if (result.httpsUrl) {
        await Linking.openURL(result.httpsUrl);
      } else {
        throw new Error('Telegram launch link is unavailable.');
      }

      notice.showUpdateNotice(
        `Telegram opened for ${shortenAddress(result.wallet.address)}. Press Start, then Verify in the bot.`,
        4200
      );
      await load(true);
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : 'Failed to start Telegram airdrop flow.';
      notice.showErrorNotice(message, 3000);
    } finally {
      setLaunching(false);
    }
  }, [load, notice, router, wallet]);

  const socialCards = useMemo(() => buildSocialCards(wallet, overview, onChain), [onChain, overview, wallet]);
  const canOpenTelegram = Boolean(wallet && wallet.kind !== 'watch-only');
  const selectedWalletOption = useMemo(
    () => walletChoices.find((item) => item.id === wallet?.id) ?? null,
    [wallet?.id, walletChoices]
  );
  const visibleWalletChoices = useMemo(
    () => walletChoices.filter((item) => item.id !== wallet?.id),
    [wallet?.id, walletChoices]
  );

  const handleToggleWalletOptions = useCallback(() => {
    if (!walletChoices.length) {
      notice.showNeutralNotice('No full-access wallets available.', 2200);
      return;
    }

    if (visibleWalletChoices.length === 0) {
      notice.showNeutralNotice('No other full-access wallets available.', 2200);
      return;
    }

    setWalletOptionsOpen((value) => !value);
  }, [notice, visibleWalletChoices.length, walletChoices.length]);

  const handleWalletSwitch = useCallback(
    async (walletId: string) => {
      try {
        setSwitchingWalletId(walletId);
        await setActiveWalletId(walletId);
        setPendingWalletSelectionId(walletId);
        setWalletOptionsOpen(false);
        await load(true);
      } catch (error) {
        console.error(error);
        notice.showErrorNotice('Failed to switch active wallet.', 2400);
      } finally {
        setSwitchingWalletId(null);
      }
    },
    [load, notice, setPendingWalletSelectionId]
  );

  if (loading && !walletChoices.length) {
    return <ScreenLoadingState label="Loading airdrop..." />;
  }

  return (
    <ProductScreen
      eyebrow="AIRDROP"
      loadingOverlayVisible={refreshing || Boolean(switchingWalletId) || launching}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      headerInfo={{
        title: AIRDROP_INFO_TITLE,
        text: AIRDROP_INFO_TEXT,
        expanded: infoExpanded,
        onToggle: () => setInfoExpanded((prev) => !prev),
      }}
    >
      <SelectedWalletSwitcher
        wallet={
          wallet
            ? {
                id: wallet.id,
                name: wallet.name,
                address: wallet.address,
                kind: wallet.kind,
                balanceDisplay: selectedWalletOption?.balanceDisplay ?? '—',
              }
            : null
        }
        visibleWalletChoices={visibleWalletChoices}
        walletOptionsOpen={walletOptionsOpen}
        switchingWalletId={switchingWalletId}
        onToggle={handleToggleWalletOptions}
        onChooseWallet={(nextWallet) => {
          void handleWalletSwitch(nextWallet.id);
        }}
        emptyBody="Create or import a wallet first."
      />

      <View style={styles.socialGrid}>
        {socialCards.map((card) => (
          <SocialDropCard
            key={card.key}
            card={card}
            canOpenTelegram={canOpenTelegram}
            launching={launching}
            onTelegramPress={() => {
              void openTelegram();
            }}
            onWalletPress={() => {
              router.push('/wallets');
            }}
            onSocialPress={(url) => {
              void openInAppBrowser(router, url);
            }}
            onExplorerPress={(url) => {
              void openInAppBrowser(router, url);
            }}
          />
        ))}
      </View>
    </ProductScreen>
  );
}

function SocialDropCard({
  card,
  canOpenTelegram,
  launching,
  onTelegramPress,
  onWalletPress,
  onSocialPress,
  onExplorerPress,
}: {
  card: SocialCardItem;
  canOpenTelegram: boolean;
  launching: boolean;
  onTelegramPress: () => void;
  onWalletPress: () => void;
  onSocialPress: (url: string) => void;
  onExplorerPress: (url: string) => void;
}) {
  const toneStyles = card.tone === 'green'
    ? {
        card: styles.socialCardGreen,
        pill: styles.socialStatusPillGreen,
        pillText: styles.socialStatusGreen,
        button: styles.socialActionButtonGreen,
      }
    : card.tone === 'red'
      ? {
          card: styles.socialCardRed,
          pill: styles.socialStatusPillRed,
          pillText: styles.socialStatusRed,
          button: styles.socialActionButtonRed,
        }
      : {
          card: styles.socialCardOrange,
          pill: styles.socialStatusPillOrange,
          pillText: styles.socialStatusOrange,
          button: styles.socialActionButtonOrange,
        };

  const isTelegram = card.key === 'telegram';

  return (
    <View style={[styles.socialCard, toneStyles.card]}>
      <View style={styles.socialIconGhost}>
        <card.Icon width={78} height={78} />
      </View>

      <View style={styles.socialHeader}>
        <card.Icon width={54} height={54} />

        <View style={styles.socialHeaderCopy}>
          <Text style={styles.socialKicker}>SOCIAL AIRDROP</Text>
          <Text style={styles.socialTitle}>{card.title}</Text>
        </View>

        <View style={[styles.socialStatusPill, toneStyles.pill]}>
          <Text style={[styles.socialStatus, toneStyles.pillText]}>{card.status}</Text>
        </View>
      </View>

      <View style={styles.socialMetaGrid}>
        <View style={styles.socialMetaCard}>
          <Text style={styles.socialMetaLabel}>Amount</Text>
          <Text style={styles.socialAmount}>
            {card.amount === 'TBA' || card.amount === 'Claimed'
              ? card.amount
              : `${card.amount} 4TEEN`}
          </Text>
        </View>

        <View style={styles.socialMetaCard}>
          <Text style={styles.socialMetaLabel}>Received</Text>
          <Text style={styles.socialWhen}>{card.when}</Text>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={card.actionable ? 0.88 : 1}
        onPress={() => {
          if (card.explorerUrl) {
            onExplorerPress(card.explorerUrl);
            return;
          }

          if (isTelegram) {
            if (canOpenTelegram && !launching) {
              onTelegramPress();
              return;
            }

            onWalletPress();
            return;
          }

          if (card.socialUrl) {
            onSocialPress(card.socialUrl);
          }
        }}
        style={[styles.socialActionButton, toneStyles.button]}
      >
        <Text style={styles.socialActionLabel}>{card.actionLabel}</Text>
      </TouchableOpacity>
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
  socialGrid: {
    gap: 14,
  },
  socialCard: {
    width: '100%',
    minHeight: 194,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: 'hidden',
    position: 'relative',
    gap: 12,
  },
  socialCardGreen: {
    backgroundColor: 'rgba(24,224,58,0.06)',
    borderColor: 'rgba(24,224,58,0.18)',
  },
  socialCardOrange: {
    backgroundColor: 'rgba(255,105,0,0.06)',
    borderColor: 'rgba(255,105,0,0.18)',
  },
  socialCardRed: {
    backgroundColor: 'rgba(255,48,73,0.06)',
    borderColor: 'rgba(255,48,73,0.18)',
  },
  socialIconGhost: {
    position: 'absolute',
    right: -8,
    bottom: -10,
    opacity: 0.1,
  },
  socialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  socialHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  socialKicker: {
    color: colors.textDim,
    fontSize: 10,
    lineHeight: 12,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.5,
  },
  socialTitle: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },
  socialStatusPill: {
    minHeight: 30,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  socialStatusPillGreen: {
    backgroundColor: 'rgba(24,224,58,0.12)',
    borderColor: 'rgba(24,224,58,0.22)',
  },
  socialStatusPillOrange: {
    backgroundColor: 'rgba(255,105,0,0.12)',
    borderColor: 'rgba(255,105,0,0.22)',
  },
  socialStatusPillRed: {
    backgroundColor: 'rgba(255,48,73,0.12)',
    borderColor: 'rgba(255,48,73,0.22)',
  },
  socialStatus: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },
  socialStatusGreen: {
    color: colors.green,
  },
  socialStatusOrange: {
    color: colors.accent,
  },
  socialStatusRed: {
    color: colors.red,
  },
  socialMetaGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  socialMetaCard: {
    flex: 1,
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    justifyContent: 'center',
  },
  socialMetaLabel: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
  },
  socialAmount: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Sora_700Bold',
  },
  socialWhen: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
  socialActionButton: {
    marginTop: 'auto',
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: 10,
  },
  socialActionButtonGreen: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  socialActionButtonOrange: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  socialActionButtonRed: {
    backgroundColor: 'rgba(255,48,73,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,48,73,0.2)',
  },
  socialActionLabel: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.4,
  },
});
