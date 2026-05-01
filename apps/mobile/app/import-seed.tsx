import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../src/i18n';
import { useBottomInset } from '../src/ui/use-bottom-inset';
import KeyboardView from '../src/ui/KeyboardView';
import InfoToggleIcon from '../src/ui/info-toggle-icon';
import { useNavigationInsets } from '../src/ui/navigation';
import ScreenBrow from '../src/ui/screen-brow';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  getMnemonicSuggestions,
  importWalletFromMnemonic,
  normalizeMnemonicInput,
} from '../src/services/wallet/import';
import { ConfirmIcon } from '../src/ui/ui-icons';

const MAX_WALLET_NAME_LENGTH = 18;
const IMPORT_INFO_TITLE = 'How this import works';
const IMPORT_INFO_TEXT =
  'Enter the recovery phrase exactly as it was issued. You can paste the full phrase at once, even with numbering, separators, or line breaks, and the app maps the words into the correct slots locally on this device.\n\nChoose whether the backup has 12 or 24 words, fill every slot, and then name the wallet for local use inside this app.\n\nImport starts only after the phrase passes local validation. We never store your seed phrase on our servers.';

function buildWords(count: number) {
  return Array.from({ length: count }, () => '');
}

function maskWord(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return '•'.repeat(Math.max(4, Math.min(trimmed.length, 8)));
}

export default function ImportSeedScreen() {
  const router = useRouter();
  const navInsets = useNavigationInsets({ topExtra: 14 });

  const notice = useNotice();
  const { t } = useI18n();
  const contentBottomInset = useBottomInset();
  const [wordCount, setWordCount] = useState<12 | 24>(12);
  const [words, setWords] = useState<string[]>(buildWords(12));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [walletName, setWalletName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const walletNameRef = useRef<TextInput | null>(null);

  const filledCount = useMemo(
    () => words.filter((item) => item.trim().length > 0).length,
    [words]
  );

  const allFilled = filledCount === wordCount;
  const walletNameTrimmed = walletName.trim();

  const canContinue =
    allFilled &&
    walletNameTrimmed.length > 0 &&
    walletNameTrimmed.length <= MAX_WALLET_NAME_LENGTH &&
    !submitting;

  const activeValue =
    activeIndex !== null && activeIndex >= 0 && activeIndex < words.length
      ? words[activeIndex].trim().toLowerCase()
      : '';

  const suggestions = useMemo(() => getMnemonicSuggestions(activeValue), [activeValue]);

  const focusIndex = useCallback((index: number | null) => {
    if (index === null) return;

    requestAnimationFrame(() => {
      inputRefs.current[index]?.focus();
    });
  }, []);

  const focusWalletName = useCallback(() => {
    requestAnimationFrame(() => {
      walletNameRef.current?.focus();
    });
  }, []);

  const handleSwitch = useCallback(
    (nextCount: 12 | 24) => {
      if (nextCount === wordCount) return;

      setWordCount(nextCount);
      setWords(buildWords(nextCount));
      setActiveIndex(null);
      notice.hideNotice();
    },
    [notice, wordCount]
  );

  const spreadParsedWords = useCallback(
    (parsed: string[], startIndex = 0) => {
      if (parsed.length === 12 || parsed.length === 24) {
        const count = parsed.length as 12 | 24;
        const nextWords = buildWords(count).map((_, i) => parsed[i] ?? '');

        setWordCount(count);
        setWords(nextWords);
        setActiveIndex(null);
        notice.hideNotice();
        focusWalletName();
        return;
      }

      setWords((prev) => {
        const next = [...prev];
        let cursor = startIndex;

        for (const part of parsed) {
          if (cursor >= next.length) break;
          next[cursor] = part;
          cursor += 1;
        }

        const nextIndex = cursor < wordCount ? cursor : null;
        setActiveIndex(nextIndex);

        if (nextIndex === null) {
          focusWalletName();
        } else {
          focusIndex(nextIndex);
        }

        return next;
      });
    },
    [focusIndex, focusWalletName, notice, wordCount]
  );

  const applySuggestion = useCallback(
    (word: string) => {
      if (activeIndex === null) return;

      setWords((prev) => {
        const next = [...prev];
        next[activeIndex] = word;
        return next;
      });

      const nextIndex = activeIndex + 1 < wordCount ? activeIndex + 1 : null;
      setActiveIndex(nextIndex);

      if (nextIndex === null) {
        notice.hideNotice();
        focusWalletName();
        return;
      }

      focusIndex(nextIndex);
    },
    [activeIndex, focusIndex, focusWalletName, notice, wordCount]
  );

  useEffect(() => {
    if (activeIndex === null || suggestions.length === 0 || !activeValue) {
      notice.hideNotice();
      return;
    }

    notice.showAckNotice(
      t('Word {{index}} suggestions', { index: activeIndex + 1 }),
      suggestions.slice(0, 6).map((word) => ({
        label: word,
        onPress: () => applySuggestion(word),
      })),
      'neutral'
    );
  }, [activeIndex, activeValue, applySuggestion, notice, suggestions, t]);

  const updateWord = useCallback(
    (index: number, value: string) => {
      const raw = value.toLowerCase();

      if (raw.includes(' ') || /\d/.test(raw)) {
        const parsed = normalizeMnemonicInput(raw);

        if (parsed.length > 1) {
          spreadParsedWords(parsed, index);
          return;
        }

        if (parsed.length === 1) {
          setWords((prev) => {
            const next = [...prev];
            next[index] = parsed[0];
            return next;
          });
          return;
        }
      }

      setWords((prev) => {
        const next = [...prev];
        next[index] = raw.trimStart();
        return next;
      });
    },
    [spreadParsedWords]
  );

  const handlePastePhrase = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (!text) return;

    const parsed = normalizeMnemonicInput(text);

    if (parsed.length === 12 || parsed.length === 24) {
      const count = parsed.length as 12 | 24;
      const nextWords = buildWords(count).map((_, i) => parsed[i] ?? '');

      setWordCount(count);
      setWords(nextWords);
      setActiveIndex(null);
      notice.showSuccessNotice(t('Detected {{count}} recovery words.', { count }), 2200);
      focusWalletName();
      return;
    }

    if (parsed.length > 1) {
      spreadParsedWords(parsed, 0);
      notice.showSuccessNotice(t('Pasted {{count}} recovery words.', { count: parsed.length }), 2200);
    }
  }, [focusWalletName, notice, spreadParsedWords, t]);

  const handleImport = useCallback(async () => {
    if (!allFilled) {
      notice.showErrorNotice(t('Fill all recovery words: {{filled}}/{{total}}.', { filled: filledCount, total: wordCount }), 2600);
      return;
    }

    if (!walletNameTrimmed.length) {
      notice.showErrorNotice(t('Wallet name is required.'), 2600);
      focusWalletName();
      return;
    }

    if (walletNameTrimmed.length > MAX_WALLET_NAME_LENGTH) {
      notice.showErrorNotice(t('Wallet name must be {{count}} characters or less.', { count: MAX_WALLET_NAME_LENGTH }), 2600);
      focusWalletName();
      return;
    }

    if (submitting) return;

    try {
      setSubmitting(true);
      notice.hideNotice();
      Keyboard.dismiss();

      const mnemonic = words.map((item) => item.trim()).join(' ');

      await importWalletFromMnemonic({
        name: walletNameTrimmed,
        mnemonic,
      });

      notice.showSuccessNotice(t('Wallet imported from seed phrase.'), 2400);
      router.replace('/wallet');
    } catch (error) {
      console.warn('IMPORT FAILED', error);
      const message = error instanceof Error ? error.message : t('Failed to import wallet.');
      notice.showErrorNotice(message, 3200);
    } finally {
      setSubmitting(false);
    }
  }, [
    allFilled,
    filledCount,
    focusWalletName,
    notice,
    router,
    submitting,
    t,
    walletNameTrimmed,
    wordCount,
    words,
  ]);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.screen}>
        <KeyboardView
          contentContainerStyle={[
            styles.content,
            { paddingTop: navInsets.top, paddingBottom: contentBottomInset },
          ]}
          extraScrollHeight={56}
        >
          <ScreenBrow
            label={t('IMPORT BY SEED PHRASE')}
            variant="backLink"
            onLabelPress={() => setInfoExpanded((prev) => !prev)}
            labelAccessory={<InfoToggleIcon expanded={infoExpanded} />}
          />

          {infoExpanded ? (
            <View style={styles.infoPanel}>
              <Text style={styles.infoTitle}>{t(IMPORT_INFO_TITLE)}</Text>
              <Text style={styles.infoText}>{t(IMPORT_INFO_TEXT)}</Text>
            </View>
          ) : null}

          <Text style={styles.title}>
            <Text style={styles.titleAccent}>{t('Restore from a recovery phrase')}</Text>
          </Text>

          <Text style={styles.noticeLine}>{t('We never store your seed phrase on our servers.')}</Text>

          <View style={styles.switchRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.switchButton, wordCount === 12 && styles.switchButtonActive]}
              onPress={() => handleSwitch(12)}
            >
              <Text style={[styles.switchText, wordCount === 12 && styles.switchTextActive]}>
                {t('12 Words')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.switchButton, wordCount === 24 && styles.switchButtonActive]}
              onPress={() => handleSwitch(24)}
            >
              <Text style={[styles.switchText, wordCount === 24 && styles.switchTextActive]}>
                {t('24 Words')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.switchButton}
              onPress={() => void handlePastePhrase()}
            >
              <Text style={styles.switchTextActive}>{t('Paste Phrase')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.helperTextCentered}>
            {t('Filled: {{filled}}/{{total}}', { filled: filledCount, total: wordCount })}
          </Text>

          <Text style={styles.blockEyebrow}>{t('RECOVERY PHRASE')}</Text>

          <View style={styles.grid}>
            {words.map((value, index) => {
              const isActive = activeIndex === index;
              const hasValue = value.trim().length > 0;

              return (
                <View
                  key={index}
                  style={[styles.wordCell, isActive && styles.wordCellActive]}
                >
                  <Text style={styles.wordIndex}>{index + 1}</Text>

                  {isActive || !hasValue ? (
                    <TextInput
                      ref={(ref) => {
                        inputRefs.current[index] = ref;
                      }}
                      value={value}
                      onChangeText={(text) => updateWord(index, text)}
                      onFocus={() => setActiveIndex(index)}
                      onSubmitEditing={() => {
                        const nextIndex = index + 1 < wordCount ? index + 1 : null;
                        setActiveIndex(nextIndex);

                        if (nextIndex === null) {
                          focusWalletName();
                        } else {
                          focusIndex(nextIndex);
                        }
                      }}
                      placeholder=""
                      placeholderTextColor={colors.textDim}
                      style={styles.wordInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      returnKeyType={index + 1 < wordCount ? 'next' : 'done'}
                    />
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.maskedWordButton}
                      onPress={() => {
                        setActiveIndex(index);
                        focusIndex(index);
                      }}
                    >
                      <Text style={styles.maskedWordText}>{maskWord(value)}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          <Text style={styles.walletNameEyebrow}>{t('Wallet Name')}</Text>

          <View style={styles.nameField}>
            <TextInput
              ref={walletNameRef}
              value={walletName}
              onChangeText={(value) => setWalletName(value.slice(0, MAX_WALLET_NAME_LENGTH))}
              placeholder={t('Imported wallet')}
              placeholderTextColor={colors.textDim}
              style={styles.nameInput}
              maxLength={MAX_WALLET_NAME_LENGTH}
              returnKeyType="done"
              onSubmitEditing={() => void handleImport()}
            />

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.nameConfirmButton, !canContinue && styles.nameConfirmButtonDisabled]}
              onPress={() => void handleImport()}
            >
              <ConfirmIcon width={18} height={18} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
            onPress={() => void handleImport()}
          >
            <Text style={[ui.buttonLabel, !canContinue && styles.primaryButtonTextDisabled]}>
              {submitting ? t('Importing...') : t('Import Wallet')}
            </Text>
          </TouchableOpacity>
        </KeyboardView>
      </View>
    </SafeAreaView>
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

  content: {
    gap: 0,
  },

  title: {
    marginTop: 0,
    color: colors.white,
    fontSize: 34,
    lineHeight: 40,
    fontFamily: 'Sora_700Bold',
    maxWidth: '96%',
  },

  titleAccent: {
    color: colors.accent,
    fontFamily: 'Sora_700Bold',
  },

  infoPanel: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
    marginBottom: 16,
  },

  infoTitle: {
    ...ui.bodyStrong,
  },

  infoText: {
    ...ui.body,
    lineHeight: 25,
  },

  noticeLine: {
    ...ui.body,
    marginTop: 12,
    marginBottom: 18,
    color: colors.textDim,
  },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },

  switchButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  switchButtonActive: {
    backgroundColor: 'rgba(255,105,0,0.12)',
  },

  switchText: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },

  switchTextActive: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
  },

  helperTextCentered: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 16,
  },

  blockEyebrow: {
    ...ui.sectionEyebrow,
    marginBottom: 12,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  wordCell: {
    width: '47%',
    minHeight: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    gap: 4,
  },

  wordCellActive: {
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.05)',
  },

  wordIndex: {
    color: colors.accent,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Sora_600SemiBold',
  },

  wordInput: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    paddingVertical: 0,
    fontFamily: 'Sora_600SemiBold',
  },

  maskedWordButton: {
    minHeight: 18,
    justifyContent: 'center',
  },

  maskedWordText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
    letterSpacing: 1,
  },

  walletNameEyebrow: {
    ...ui.sectionEyebrow,
    marginTop: 22,
    marginBottom: 12,
  },

  nameField: {
    minHeight: layout.fieldHeight,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingLeft: 14,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  nameInput: {
    flex: 1,
    minHeight: layout.fieldHeight,
    color: colors.white,
    fontFamily: 'Sora_600SemiBold',
    paddingVertical: 0,
  },

  nameConfirmButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  nameConfirmButtonDisabled: {
    opacity: 0.35,
  },

  primaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: spacing[4],
  },

  primaryButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  primaryButtonTextDisabled: {
    color: colors.textDim,
  },
});
