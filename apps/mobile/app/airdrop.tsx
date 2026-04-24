import { useCallback, useEffect, useState } from 'react';
import { Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  getActiveWalletTelegramAirdropOverview,
  startTelegramAirdropFlow,
  type TelegramAirdropOverview,
} from '../src/services/airdrop';
import type { WalletMeta } from '../src/services/wallet/storage';
import {
  ProductActionRow,
  ProductHero,
  ProductScreen,
  ProductSection,
  ProductSplitRows,
} from '../src/ui/product-shell';
import { colors, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';

function shortenAddress(address: string) {
  const safe = String(address || '').trim();
  if (safe.length <= 14) return safe || '—';
  return `${safe.slice(0, 6)}...${safe.slice(-6)}`;
}

function resolveHero(wallet: WalletMeta | null, overview: TelegramAirdropOverview | null) {
  if (!wallet) {
    return {
      title: 'Telegram airdrop starts from a wallet, not from a random chat.',
      body: 'Import or create a wallet first. The session is signed in-app, then Telegram only confirms the social side.',
    };
  }

  if (wallet.kind === 'watch-only') {
    return {
      title: 'Watch-only wallet cannot open Telegram airdrop flow.',
      body: 'Switch to a wallet with a private key or seed phrase. The app must sign a one-time session before Telegram opens.',
    };
  }

  if (overview?.claim?.status === 'sent') {
    return {
      title: 'Telegram claim already completed for this wallet.',
      body: 'The wallet-to-Telegram link is locked. This wallet cannot recycle the Telegram reward again.',
    };
  }

  if (overview?.claim?.status === 'queued') {
    return {
      title: 'Telegram claim is already queued.',
      body: 'Telegram proof is accepted. The backend is waiting for available resources on the airdrop control wallet.',
    };
  }

  return {
    title: 'Telegram airdrop now starts inside the wallet.',
    body: 'The wallet signs a one-time session first. Telegram only verifies the linked account and group/channel membership after that.',
  };
}

function buildStatusRows(wallet: WalletMeta | null, overview: TelegramAirdropOverview | null) {
  return [
    {
      eyebrow: 'Wallet',
      title: wallet ? shortenAddress(wallet.address) : 'Not connected',
      body: wallet
        ? wallet.kind === 'watch-only'
          ? 'Watch-only wallet cannot sign the Telegram session.'
          : `Active wallet: ${wallet.name}`
        : 'Create or import a wallet first.',
      accent: false,
    },
    {
      eyebrow: 'Telegram Link',
      title: overview?.link?.telegram_username
        ? `@${overview.link.telegram_username}`
        : overview?.link?.telegram_user_id
          ? 'Linked'
          : 'Not linked',
      body:
        overview?.guard.walletLinked || overview?.guard.telegramLinked
          ? 'Wallet and Telegram are now hard-bound one-to-one.'
          : 'No Telegram account is bound to this wallet yet.',
      accent: Boolean(overview?.guard.walletLinked || overview?.guard.telegramLinked),
    },
    {
      eyebrow: 'Claim',
      title:
        overview?.claim?.status === 'sent'
          ? 'Sent'
          : overview?.claim?.status === 'queued'
            ? 'Queued'
            : overview?.guard.walletBlockedByLegacyClaim || overview?.guard.telegramBlockedByLegacyClaim
              ? 'Legacy Claimed'
              : 'Ready',
      body:
        overview?.claim?.txid
          ? `TX: ${overview.claim.txid}`
          : overview?.claim?.failure_reason
            ? overview.claim.failure_reason
            : overview?.claim?.status === 'queued'
              ? 'Waiting for airdrop wallet resources.'
              : overview?.guard.walletBlockedByLegacyClaim || overview?.guard.telegramBlockedByLegacyClaim
                ? 'This wallet or Telegram account already claimed in the old bot flow.'
                : 'Start Telegram from this screen to bind and queue the claim.',
      accent:
        overview?.claim?.status === 'sent' ||
        overview?.claim?.status === 'queued' ||
        overview?.guard.walletBlockedByLegacyClaim ||
        overview?.guard.telegramBlockedByLegacyClaim,
    },
  ];
}

export default function AirdropScreen() {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletMeta | null>(null);
  const [overview, setOverview] = useState<TelegramAirdropOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [launchNote, setLaunchNote] = useState('');

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorText('');
      const snapshot = await getActiveWalletTelegramAirdropOverview();
      setWallet(snapshot.wallet);
      setOverview(snapshot.overview);
    } catch (error) {
      console.error(error);
      setErrorText(error instanceof Error ? error.message : 'Failed to load Telegram airdrop.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openTelegram = useCallback(async () => {
    try {
      setLaunching(true);
      setErrorText('');
      setLaunchNote('');

      const result = await startTelegramAirdropFlow();

      if (result.appUrl && (await Linking.canOpenURL(result.appUrl))) {
        await Linking.openURL(result.appUrl);
      } else if (result.httpsUrl) {
        await Linking.openURL(result.httpsUrl).catch(async () => {
          await openInAppBrowser(router, result.httpsUrl);
        });
      }

      setLaunchNote(
        `Telegram session is live for ${shortenAddress(result.wallet.address)}. If you returned immediately, open Telegram and press Start there.`
      );
      await load(true);
    } catch (error) {
      console.error(error);
      setErrorText(
        error instanceof Error ? error.message : 'Failed to start Telegram airdrop flow.'
      );
    } finally {
      setLaunching(false);
    }
  }, [load, router]);

  const hero = resolveHero(wallet, overview);
  const canOpenTelegram = Boolean(wallet && wallet.kind !== 'watch-only');

  return (
    <ProductScreen
      eyebrow="AIRDROP"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
    >
      <ProductHero
        eyebrow="WALLET-FIRST TELEGRAM FLOW"
        title={hero.title}
        body={hero.body}
      >
        <ProductActionRow
          primaryLabel={launching ? 'Opening Telegram...' : 'Open Telegram'}
          onPrimaryPress={() => {
            if (canOpenTelegram && !launching) {
              void openTelegram();
              return;
            }

            if (!wallet) {
              router.push('/wallets');
              return;
            }

            router.push('/wallets');
          }}
          secondaryLabel="Refresh"
          onSecondaryPress={() => void load(true)}
        />
      </ProductHero>

      <ProductSection eyebrow="ONE WALLET, ONE TELEGRAM" title="Hard binding is now enforced in the backend">
        <ProductSplitRows rows={buildStatusRows(wallet, overview)} />
      </ProductSection>

      <ProductSection eyebrow="FLOW" title="What happens after you tap Open Telegram">
        <ProductSplitRows
          rows={[
            {
              eyebrow: '1',
              title: 'Wallet signs session',
              body: 'The app creates a one-time session and signs it with the active wallet before Telegram opens.',
            },
            {
              eyebrow: '2',
              title: 'Telegram verifies account',
              body: 'Telegram now links to exactly one wallet and checks membership in both community surfaces.',
            },
            {
              eyebrow: '3',
              title: 'Backend queues claim',
              body: 'If the wallet or Telegram account already claimed, reward is blocked. Otherwise claim is queued or sent.',
            },
          ]}
        />
      </ProductSection>

      {errorText ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Airdrop Error</Text>
          <Text style={styles.noticeBody}>{errorText}</Text>
        </View>
      ) : null}

      {launchNote ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Telegram Session</Text>
          <Text style={styles.infoBody}>{launchNote}</Text>
        </View>
      ) : null}

      {!loading && !wallet ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>No Wallet</Text>
          <Text style={styles.infoBody}>
            This screen only works from a real wallet because Telegram entry is signed before the bot opens.
          </Text>
        </View>
      ) : null}
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  noticeCard: {
    marginTop: spacing[4],
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,48,73,0.28)',
    backgroundColor: 'rgba(255,48,73,0.1)',
    gap: 8,
  },
  noticeTitle: {
    ...ui.sectionEyebrow,
    color: colors.red,
  },
  noticeBody: {
    ...ui.body,
    color: colors.white,
  },
  infoCard: {
    marginTop: spacing[4],
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceSoft,
    gap: 8,
  },
  infoTitle: {
    ...ui.sectionEyebrow,
  },
  infoBody: {
    ...ui.body,
    color: colors.white,
  },
});
