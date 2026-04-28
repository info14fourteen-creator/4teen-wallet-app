import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useI18n } from '../src/i18n';
import { useNotice } from '../src/notice/notice-provider';
import { clearAllAppCaches } from '../src/services/app-cache';
import {
  getCachedDisplayCurrency,
  getDisplayCurrency,
  getDisplayCurrencyOptions,
  setDisplayCurrency,
  type DisplayCurrencyCode,
} from '../src/settings/display-currency';
import { colors, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { ProductScreen } from '../src/ui/product-shell';
import { ToggleOffIcon, ToggleOnIcon } from '../src/ui/ui-icons';
import { useWalletSession } from '../src/wallet/wallet-session';

export default function CurrencyScreen() {
  const notice = useNotice();
  const { triggerWalletDataRefresh } = useWalletSession();
  const { t } = useI18n();
  const [selectedCurrency, setSelectedCurrency] = useState<DisplayCurrencyCode>(
    getCachedDisplayCurrency()
  );
  const [saving, setSaving] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const load = async () => {
        const currency = await getDisplayCurrency();
        if (!cancelled) {
          setSelectedCurrency(currency);
        }
      };

      void load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const handleSelect = useCallback(
    async (currency: DisplayCurrencyCode) => {
      if (saving || currency === selectedCurrency) return;

      try {
        setSaving(true);
        await setDisplayCurrency(currency);
        await clearAllAppCaches();
        triggerWalletDataRefresh();
        setSelectedCurrency(currency);
        notice.showSuccessNotice(t('Display currency set to {{currency}}.', { currency }), 2200);
      } catch (error) {
        console.error(error);
        notice.showErrorNotice(t('Currency update failed.'), 2200);
      } finally {
        setSaving(false);
      }
    },
    [notice, saving, selectedCurrency, t, triggerWalletDataRefresh]
  );

  return (
    <ProductScreen
      eyebrow={t('CURRENCY')}
      browVariant="back"
      headerInfo={{
        title: t('How display currency works'),
        text: t(
          'This screen changes only the converted market view of the app. Token amounts, raw balances, and blockchain state stay the same.\n\nAfter you switch currency, the app refreshes market caches so wallet balances, token values, liquidity figures, and other price-based surfaces stay aligned to one display currency.'
        ),
        expanded: infoExpanded,
        onToggle: () => setInfoExpanded((value) => !value),
      }}
    >
      <Text style={styles.sectionEyebrow}>{t('AVAILABLE CURRENCIES')}</Text>

      <View style={styles.list}>
        {getDisplayCurrencyOptions().map((option) => {
          const selected = option.code === selectedCurrency;

          return (
            <Pressable
              key={option.code}
              style={[styles.optionCard, selected && styles.optionCardSelected]}
              onPress={() => void handleSelect(option.code)}
              disabled={saving}
            >
              <View style={styles.optionRow}>
                <View style={styles.optionText}>
                  <Text
                    style={styles.optionCodeLine}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    ({option.symbol}) {option.code}
                  </Text>
                  <Text
                    style={styles.optionTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {t(option.title)}
                  </Text>
                </View>

                <View style={styles.toggleWrap}>
                  {selected ? (
                    <ToggleOnIcon width={64} height={36} />
                  ) : (
                    <ToggleOffIcon width={64} height={36} />
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  sectionEyebrow: {
    ...ui.sectionEyebrow,
    marginBottom: 10,
  },
  list: {
    gap: 12,
  },
  optionCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceSoft,
  },
  optionCardSelected: {
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionText: {
    flex: 1,
    gap: 4,
  },
  optionCodeLine: {
    ...ui.actionLabel,
    color: colors.textDim,
  },
  optionTitle: {
    ...ui.helper,
    color: colors.text,
  },
  toggleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
