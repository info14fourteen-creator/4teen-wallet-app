import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import ExpandChevron from '../src/ui/expand-chevron';
import { getCachedLanguageLabel, useI18n } from '../src/i18n';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import { clearAllAppCaches } from '../src/services/app-cache';
import { ProductScreen } from '../src/ui/product-shell';
import { useWalletSession } from '../src/wallet/wallet-session';
import {
  getAutoLockMode,
  getAutoLockModeLabel,
  getBiometricsEnabled,
  hasPasscode,
} from '../src/security/local-auth';
import { getCachedDisplayCurrency, getDisplayCurrency } from '../src/settings/display-currency';
import SettingsRow from '../src/ui/settings-row';

const CLEAR_HOLD_MS = 3500;
const CLEAR_DISPLAY_MAX = 114;

export default function SettingsScreen() {
  const router = useRouter();
  const notice = useNotice();
  const { triggerWalletDataRefresh } = useWalletSession();
  const { t } = useI18n();

  const [clearingCache, setClearingCache] = useState(false);
  const [clearActive, setClearActive] = useState(false);
  const [clearProgress, setClearProgress] = useState(0);
  const [authValue, setAuthValue] = useState('Not set');
  const [currencyValue, setCurrencyValue] = useState(getCachedDisplayCurrency());
  const [languageValue, setLanguageValue] = useState(getCachedLanguageLabel());

  const clearStartedAtRef = useRef<number | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearCompletedRef = useRef(false);

  const clearHoldTimer = useCallback(() => {
    if (clearTimerRef.current) {
      clearInterval(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const resetClearState = useCallback(() => {
    clearHoldTimer();
    clearStartedAtRef.current = null;
    clearCompletedRef.current = false;
    setClearActive(false);
    setClearProgress(0);
  }, [clearHoldTimer]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
    };
  }, [clearHoldTimer]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadAuthValue = async () => {
        const [passcodeEnabled, biometricsEnabled, autoLockMode, displayCurrency, languageLabel] = await Promise.all([
          hasPasscode(),
          getBiometricsEnabled(),
          getAutoLockMode(),
          getDisplayCurrency(),
          Promise.resolve(getCachedLanguageLabel()),
        ]);

        if (cancelled) return;

        setCurrencyValue(displayCurrency);
        setLanguageValue(languageLabel);

        if (!passcodeEnabled) {
          setAuthValue(t('Off'));
          return;
        }

        const lockLabel = getAutoLockModeLabel(autoLockMode);
        setAuthValue(
          biometricsEnabled
            ? `${t('Passcode + Biometrics')} • ${lockLabel}`
            : `${t('Passcode')} • ${lockLabel}`
        );
      };

      void loadAuthValue();

      return () => {
        cancelled = true;
      };
    }, [t])
  );

  const handleClearCacheConfirmed = useCallback(async () => {
    if (clearingCache) {
      resetClearState();
      return;
    }

    try {
      setClearingCache(true);
      await clearAllAppCaches();
      triggerWalletDataRefresh();
      notice.showSuccessNotice(t('All temporary cache cleared.'), 2400);
    } catch (error) {
      console.error(error);
      notice.showErrorNotice(t('Cache clear failed.'), 2200);
    } finally {
      setClearingCache(false);
      resetClearState();
    }
  }, [clearingCache, notice, resetClearState, t, triggerWalletDataRefresh]);

  const handleClearPress = useCallback(() => {
    if (clearingCache) return;
    notice.showNeutralNotice(t('Press and hold to clear cache.'), 2200);
  }, [clearingCache, notice, t]);

  const handleClearPressIn = useCallback(() => {
    if (clearingCache) return;

    clearHoldTimer();
    clearCompletedRef.current = false;
    clearStartedAtRef.current = Date.now();
    setClearActive(true);
    setClearProgress(0);

    clearTimerRef.current = setInterval(() => {
      const startedAt = clearStartedAtRef.current;
      if (!startedAt) return;

      const elapsed = Date.now() - startedAt;
      const fraction = Math.max(0, Math.min(1, elapsed / CLEAR_HOLD_MS));
      const displayProgress = Math.round(fraction * CLEAR_DISPLAY_MAX);

      setClearProgress(displayProgress);

      if (fraction >= 1 && !clearCompletedRef.current) {
        clearCompletedRef.current = true;
        clearHoldTimer();
        void handleClearCacheConfirmed();
      }
    }, 50);
  }, [clearHoldTimer, clearingCache, handleClearCacheConfirmed]);

  const handleClearPressOut = useCallback(() => {
    if (clearCompletedRef.current || clearingCache) {
      return;
    }

    resetClearState();
  }, [clearingCache, resetClearState]);

  const clearFillWidth = `${Math.min(100, (clearProgress / CLEAR_DISPLAY_MAX) * 100)}%`;

  return (
    <ProductScreen eyebrow={t('SETTINGS')} browVariant="back">
          <View style={styles.list}>
            <SettingsRow label={t('Language')} value={languageValue} onPress={() => router.push('/language')} />
            <SettingsRow label={t('Currency')} value={currencyValue} onPress={() => router.push('/currency')} />
            <SettingsRow
              label={t('Authentication Method')}
              value={authValue}
              onPress={() => router.push('/authentication-method')}
            />
            <SettingsRow
              label={t('Appearance')}
              value={t('Dark Side Only')}
              onPress={() => router.push('/appearance')}
            />

            <ClearCacheHoldRow
              active={clearActive}
              clearing={clearingCache}
              progress={clearProgress}
              fillWidth={clearFillWidth}
              onPress={handleClearPress}
              onPressIn={handleClearPressIn}
              onPressOut={handleClearPressOut}
            />
          </View>
    </ProductScreen>
  );
}

function ClearCacheHoldRow({
  active,
  clearing,
  progress,
  fillWidth,
  onPress,
  onPressIn,
  onPressOut,
}: {
  active: boolean;
  clearing: boolean;
  progress: number;
  fillWidth: string;
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  const { t } = useI18n();

  return (
    <Pressable
      style={styles.clearCacheRow}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={clearing}
    >
      <>
        {active && !clearing ? (
          <View style={[styles.clearHoldFill, { width: fillWidth as any }]} />
        ) : null}

        <View style={styles.clearCacheRowTop}>
          <View style={styles.clearCacheText}>
            <Text style={ui.actionLabel}>{t('Clear cache')}</Text>
            <Text style={styles.helperText}>
              {t(
                'Clears market, portfolio, history, ambassador, unlock, liquidity, asset wallet, direct-buy, and resource-pricing cache. Wallets, passcode, address book, drafts, referrals, and token settings stay untouched.'
              )}
            </Text>
          </View>

          {clearing ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : active ? (
            <Text style={styles.clearProgressText}>{progress}%</Text>
          ) : (
            <ExpandChevron open={false} />
          )}
        </View>
      </>
    </Pressable>
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
  },

  scroll: {
    flex: 1,
  },

  content: {
    paddingBottom: spacing[7],
  },

  list: {
    gap: 12,
  },

  clearCacheRow: {
    minHeight: 86,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    position: 'relative',
    overflow: 'hidden',
  },

  clearCacheRowTop: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  clearCacheText: {
    flex: 1,
  },

  helperText: {
    marginTop: 6,
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  clearHoldFill: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 1,
    backgroundColor: colors.accent,
    opacity: 0.95,
    borderRadius: radius.pill,
  },

  clearProgressText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
  },
});
