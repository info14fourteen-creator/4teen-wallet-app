import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { useNotice } from '../src/notice/notice-provider';
import {
  formatDirectBuyDate,
  formatDirectBuyPrice,
  loadDirectBuyContext,
  type DirectBuyContext,
} from '../src/services/direct-buy';
import {
  ProductActionRow,
  ProductHero,
  ProductRouteCard,
  ProductScreen,
  ProductSection,
} from '../src/ui/product-shell';
import ScreenLoadingState from '../src/ui/screen-loading-state';
import { colors } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { openInAppBrowser } from '../src/utils/open-in-app-browser';

export default function EarnScreen() {
  const router = useRouter();
  const notice = useNotice();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [context, setContext] = useState<DirectBuyContext | null>(null);
  const [errorText, setErrorText] = useState('');

  const refreshContext = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;

      if (!silent) {
        setLoading(true);
      }

      try {
        const nextContext = await loadDirectBuyContext();
        setContext(nextContext);
        setErrorText('');

        if (nextContext.switchedFromWatchOnly) {
          notice.showNeutralNotice(
            `Using signing wallet ${nextContext.wallet.name} for direct buy.`,
            2600
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to load earn context.';
        setContext(null);
        setErrorText(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [notice]
  );

  useFocusEffect(
    useCallback(() => {
      void refreshContext();
    }, [refreshContext])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void refreshContext({ silent: true });
  }, [refreshContext]);

  const buyFacts = useMemo(() => {
    if (!context) {
      return [];
    }

    return [
      {
        eyebrow: 'CURRENT PRICE',
        value: `${formatDirectBuyPrice(context.tokenPriceSun)} TRX`,
        body: '1 4TEEN at the current contract price.',
      },
      {
        eyebrow: 'NEXT UPDATE',
        value: formatDirectBuyDate(context.nextPriceUpdateAt),
        body: 'The contract reprices on the next update window.',
      },
      {
        eyebrow: 'LOCK',
        value: '14 DAYS',
        body: 'Every direct buy starts a fixed token lock.',
      },
      {
        eyebrow: 'FLOW',
        value: `${context.liquiditySharePercent} / ${context.ownerSharePercent} / ${context.airdropSharePercent}`,
        body: 'TRX routing split for liquidity, owner and airdrop.',
      },
    ];
  }, [context]);

  if (loading) {
    return <ScreenLoadingState label="Loading earn..." />;
  }

  return (
    <ProductScreen
      eyebrow="EARN"
      browVariant="plain"
      bottomInsetExtra={56}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <ProductHero
        eyebrow="EARN HUB"
        title="Buy 4TEEN, then move into reward flows."
        body="Direct buy, airdrop and ambassador flows stay inside the wallet shell."
      />

      <View style={styles.buyCard}>
        <Text style={ui.sectionEyebrow}>DIRECT BUY</Text>

        <View style={styles.buyHeaderRow}>
          <View style={styles.buyHeaderCopy}>
            <Text style={styles.walletName}>
              {context?.wallet.name || 'No signing wallet'}
            </Text>
            <Text style={styles.walletAddress}>
              {context
                ? context.wallet.address
                : 'Import or switch to a full-access wallet.'}
            </Text>
          </View>

          <View style={styles.balanceBadge}>
            <Text style={styles.balanceBadgeLabel}>TRX</Text>
            <Text style={styles.balanceBadgeValue}>{context?.trxBalanceDisplay || '0'}</Text>
          </View>
        </View>

        <View style={styles.metricGrid}>
          {buyFacts.map((fact) => (
            <View key={fact.eyebrow} style={styles.metricCard}>
              <Text style={ui.muted}>{fact.eyebrow}</Text>
              <Text style={styles.metricValue}>{fact.value}</Text>
              <Text style={styles.metricBody}>{fact.body}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.helperText}>
          Open the native buy flow and approve the contract call from the active wallet.
        </Text>

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {context ? (
          <ProductActionRow
            primaryLabel="OPEN BUY FLOW"
            onPrimaryPress={() => router.push('/buy')}
            secondaryLabel="LIVE SURFACE"
            onSecondaryPress={() => void openInAppBrowser(router, 'https://4teen.me/bt')}
          />
        ) : (
          <ProductActionRow
            primaryLabel="IMPORT WALLET"
            onPrimaryPress={() => router.push('/wallet-access')}
            secondaryLabel="WALLET MANAGER"
            onSecondaryPress={() => router.push('/wallet-manager')}
          />
        )}
      </View>

      <ProductSection eyebrow="REWARD FLOWS" title="After the buy, move into the reward surfaces">
        <ProductRouteCard
          eyebrow="AIRDROP"
          title="Distribution waves and Telegram flow"
          body="The airdrop path explains the public distribution layer, where the Telegram entry lives, and how the staged wave structure fits the protocol."
          value="LIVE"
          icon="gift-outline"
          primaryLabel="Open Airdrop"
          onPrimaryPress={() => router.push('/airdrop')}
          secondaryLabel="Live Surface"
          onSecondaryPress={() => void openInAppBrowser(router, 'https://4teen.me/ad')}
        />

        <ProductRouteCard
          eyebrow="AMBASSADOR"
          title="Registration and cabinet access"
          body="The ambassador path is for registration, slug reservation, cabinet entry, and referral-side reward participation."
          value="REG / CAB"
          icon="account-star-outline"
          primaryLabel="Open Ambassador"
          onPrimaryPress={() => router.push('/ambassador-program')}
          secondaryLabel="Live Surface"
          onSecondaryPress={() => void openInAppBrowser(router, 'https://4teen.me/a')}
        />
      </ProductSection>
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  buyCard: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 14,
  },

  buyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  buyHeaderCopy: {
    flex: 1,
    gap: 4,
  },

  walletName: {
    ...ui.titleSm,
  },

  walletAddress: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 16,
  },

  balanceBadge: {
    minWidth: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },

  balanceBadgeLabel: {
    ...ui.muted,
    color: colors.accent,
  },

  balanceBadgeValue: {
    color: colors.white,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: 'Sora_700Bold',
  },

  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  metricCard: {
    minWidth: '47%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },

  metricValue: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 23,
    fontFamily: 'Sora_700Bold',
  },

  metricBody: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
  },

  helperText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
  },

  errorText: {
    color: '#ff8c7a',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
});
