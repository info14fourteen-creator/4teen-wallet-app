import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { openInAppBrowser } from '../src/utils/open-in-app-browser';
import {
  ProductActionRow,
  ProductBulletList,
  ProductHero,
  ProductScreen,
  ProductSection,
  ProductStatGrid,
} from '../src/ui/product-shell';
import { colors } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import {
  clearStoredReferral,
  formatReferralExpiry,
  formatReferralSourceLabel,
  getStoredReferral,
  type StoredReferralRecord,
} from '../src/services/referral';
import { useNotice } from '../src/notice/notice-provider';

export default function AmbassadorProgramScreen() {
  const router = useRouter();
  const notice = useNotice();
  const [referral, setReferral] = useState<StoredReferralRecord | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadReferral = async () => {
        const nextReferral = await getStoredReferral();
        if (!cancelled) {
          setReferral(nextReferral);
        }
      };

      void loadReferral();

      return () => {
        cancelled = true;
      };
    }, [])
  );

  const handleClearReferral = useCallback(async () => {
    await clearStoredReferral();
    setReferral(null);
    notice.showSuccessNotice('Referral cleared.', 2200);
  }, [notice]);

  return (
    <ProductScreen eyebrow="AMBASSADOR PROGRAM">
      <ProductHero
        eyebrow="COMMUNITY GROWTH"
        title="Register, reserve a slug, and use the cabinet when you are live."
        body="The ambassador system is not one page. There is a registration surface, a cabinet surface, and protected attribution logic behind them. This screen keeps that structure understandable."
      >
        <ProductActionRow
          primaryLabel="Open Registration"
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me/a/reg')}
          secondaryLabel="Open Cabinet"
          onSecondaryPress={() => void openInAppBrowser(router, 'https://4teen.me/a/cab')}
        />
      </ProductHero>

      <ProductStatGrid
        items={[
          {
            eyebrow: 'Step one',
            value: 'Slug',
            body: 'Registration reserves the ambassador identity and referral handle.',
          },
          {
            eyebrow: 'Step two',
            value: 'Cabinet',
            body: 'The cabinet is the operational dashboard for stats and reward-side actions.',
          },
          {
            eyebrow: 'Resource note',
            value: '~98K Energy',
            body: 'Registration is a real contract action and may require resources.',
          },
          {
            eyebrow: 'Referral model',
            value: 'Tracked',
            body: 'Attribution and settlement are separated into their own backend-backed layer.',
          },
        ]}
      />

      <ProductSection eyebrow="REGISTRATION" title="What happens when someone becomes ambassador">
        <ProductBulletList
          items={[
            'A referral slug is checked for availability before the contract call is sent.',
            'Wallet signs a live registration transaction instead of filling a fake web form.',
            'Backend completes the protected mapping layer after the on-chain step succeeds.',
          ]}
        />
      </ProductSection>

      <ProductSection eyebrow="REFERRAL STATE" title="What this device currently remembers">
        <View style={styles.referralCard}>
          <View style={styles.referralRowFirst}>
            <Text style={styles.referralLabel}>Stored slug</Text>
            <Text style={[styles.referralValue, referral ? styles.referralValueAccent : null]}>
              {referral?.slug || 'NONE'}
            </Text>
          </View>
          <View style={styles.referralRow}>
            <Text style={styles.referralLabel}>Source</Text>
            <Text style={styles.referralValue}>
              {referral ? formatReferralSourceLabel(referral.source) : '—'}
            </Text>
          </View>
          <View style={styles.referralRow}>
            <Text style={styles.referralLabel}>Expires</Text>
            <Text style={styles.referralValue}>
              {referral ? formatReferralExpiry(referral.expiresAt) : '—'}
            </Text>
          </View>
        </View>

        {referral ? (
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.clearButton}
            onPress={() => void handleClearReferral()}
          >
            <Text style={styles.clearButtonText}>CLEAR REFERRAL</Text>
          </TouchableOpacity>
        ) : null}
      </ProductSection>

      <ProductSection eyebrow="CABINET" title="What the cabinet is for">
        <ProductBulletList
          items={[
            'Open personal ambassador dashboard instead of mixing stats into the wallet core.',
            'Review purchases, activity, pending reward-side actions, and profile state.',
            'Keep the ambassador workflow separate from send, swap, and portfolio screens.',
          ]}
        />
        <ProductActionRow
          primaryLabel="Open Cabinet"
          onPrimaryPress={() => void openInAppBrowser(router, 'https://4teen.me/a/cab')}
          secondaryLabel="Back to Earn"
          onSecondaryPress={() => router.push('/earn')}
        />
      </ProductSection>
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  referralCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
    padding: 16,
  },
  referralRowFirst: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  referralRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  referralLabel: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
  referralValue: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    textAlign: 'right',
    flexShrink: 1,
  },
  referralValueAccent: {
    color: colors.green,
  },
  clearButton: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  clearButtonText: {
    ...ui.actionLabel,
    color: colors.white,
  },
});
