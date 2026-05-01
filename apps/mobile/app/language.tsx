import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useNotice } from '../src/notice/notice-provider';
import {
  getCachedLanguage,
  getLanguage,
  getLanguageOptions,
  getLanguageLabel,
  useI18n,
  type AppLanguageCode,
} from '../src/i18n';
import { colors, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { ProductScreen } from '../src/ui/product-shell';
import { ToggleOffIcon, ToggleOnIcon } from '../src/ui/ui-icons';

export default function LanguageScreen() {
  const notice = useNotice();
  const { setLanguage, t } = useI18n();
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguageCode>(getCachedLanguage());
  const [saving, setSaving] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const load = async () => {
        const nextLanguage = await getLanguage();
        if (!cancelled) {
          setSelectedLanguage(nextLanguage);
        }
      };

      void load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const handleSelect = useCallback(
    async (nextLanguage: AppLanguageCode) => {
      if (saving || nextLanguage === selectedLanguage) return;

      try {
        setSaving(true);
        await setLanguage(nextLanguage);
        setSelectedLanguage(nextLanguage);
        notice.showSuccessNotice(
          t('App language set to {{language}}.', { language: getLanguageLabel(nextLanguage) }),
          2200
        );
      } catch (error) {
        console.warn(error);
        notice.showErrorNotice(t('Language update failed.'), 2200);
      } finally {
        setSaving(false);
      }
    },
    [notice, saving, selectedLanguage, setLanguage, t]
  );

  return (
    <ProductScreen
      eyebrow={t('LANGUAGE')}
      browVariant="back"
      headerInfo={{
        title: t('Choose app language'),
        text: t(
          'This switches the wallet interface language. Balances, token amounts, market data, and on-chain state stay the same.'
        ),
        expanded: infoExpanded,
        onToggle: () => setInfoExpanded((value) => !value),
      }}
    >
      <Text style={styles.sectionEyebrow}>{t('AVAILABLE LANGUAGES')}</Text>

      <View style={styles.list}>
        {getLanguageOptions().map((option) => {
          const selected = option.code === selectedLanguage;

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
                    style={styles.optionNative}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {option.nativeName}
                  </Text>
                  <Text
                    style={styles.optionEnglish}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {t(option.englishName)}
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
  optionNative: {
    ...ui.actionLabel,
    color: colors.text,
  },
  optionEnglish: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },
  toggleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
