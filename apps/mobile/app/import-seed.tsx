import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import SubmenuHeader from '../src/ui/submenu-header';
import MenuSheet from '../src/ui/menu-sheet';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { useNotice } from '../src/notice/notice-provider';
import {
  getMnemonicSuggestions,
  importWalletFromMnemonic,
  normalizeMnemonicInput,
} from '../src/services/wallet/import';

const MAX_WALLET_NAME_LENGTH = 18;

function buildWords(count: number) {
  return Array.from({ length: count }, () => '');
}

export default function ImportSeedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ backTo?: string }>();
  const backTo = typeof params.backTo === 'string' ? params.backTo : '/import-wallet';

  const notice = useNotice();

  const [menuOpen, setMenuOpen] = useState(false);
  const [wordCount, setWordCount] = useState<12 | 24>(12);
  const [words, setWords] = useState<string[]>(buildWords(12));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [walletName, setWalletName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);

  const filledCount = useMemo(
    () => words.filter((item) => item.trim().length > 0).length,
    [words]
  );

  const allFilled = filledCount === wordCount;
  const canContinue =
    allFilled &&
    walletName.trim().length > 0 &&
    walletName.trim().length <= MAX_WALLET_NAME_LENGTH &&
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
        focusIndex(nextIndex);

        return next;
      });
    },
    [focusIndex, notice, wordCount]
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
        return;
      }

      focusIndex(nextIndex);
    },
    [activeIndex, focusIndex, notice, wordCount]
  );

  useEffect(() => {
    if (activeIndex === null || suggestions.length === 0 || !activeValue) {
      notice.hideNotice();
      return;
    }

    notice.showAckNotice(
      `Word ${activeIndex + 1} suggestions`,
      suggestions.slice(0, 6).map((word) => ({
        label: word,
        onPress: () => applySuggestion(word),
      })),
      'neutral'
    );

    return () => {
      notice.hideNotice();
    };
  }, [activeIndex, activeValue, applySuggestion, notice, suggestions]);

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
      notice.hideNotice();
      return;
    }

    if (parsed.length > 1) {
      spreadParsedWords(parsed, 0);
    }
  }, [notice, spreadParsedWords]);

  const handleBack = useCallback(() => {
    notice.hideNotice();
    router.replace(backTo as any);
  }, [backTo, notice, router]);

  const handleImport = useCallback(async () => {
    if (!canContinue) return;

    try {
      setSubmitting(true);
      notice.hideNotice();

      const mnemonic = words.map((item) => item.trim()).join(' ');

      await importWalletFromMnemonic({
        name: walletName.trim(),
        mnemonic,
      });

      notice.showSuccessNotice('Wallet imported from seed phrase.', 2400);
      router.replace('/home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import wallet.';
      notice.showErrorNotice(message, 3000);
    } finally {
      setSubmitting(false);
    }
  }, [canContinue, notice, router, walletName, words]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SubmenuHeader title="IMPORT BY SEED PHRASE" onBack={handleBack} />

          <Text style={styles.title}>
            Restore from <Text style={styles.titleAccent}>Seed Phrase</Text>
          </Text>

          <Text style={styles.lead}>
            Paste the full recovery phrase from clipboard in the correct order, or enter it word by word.
            If you paste all 12 or 24 words, even with numbering, we automatically clean it and place each word into the correct field.
          </Text>

          <View style={styles.card}>
            <View style={styles.switchRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.switchButton, wordCount === 12 && styles.switchButtonActive]}
                onPress={() => handleSwitch(12)}
              >
                <Text style={[styles.switchText, wordCount === 12 && styles.switchTextActive]}>
                  12 Words
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.switchButton, wordCount === 24 && styles.switchButtonActive]}
                onPress={() => handleSwitch(24)}
              >
                <Text style={[styles.switchText, wordCount === 24 && styles.switchTextActive]}>
                  24 Words
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.switchButton}
                onPress={() => void handlePastePhrase()}
              >
                <Text style={styles.switchTextActive}>Paste Phrase</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.helperText}>
              Filled: {filledCount}/{wordCount}
            </Text>

            <View style={styles.grid}>
              {words.map((value, index) => (
                <View
                  key={index}
                  style={[
                    styles.wordCell,
                    activeIndex === index && styles.wordCellActive,
                  ]}
                >
                  <Text style={styles.wordIndex}>{index + 1}</Text>
                  <TextInput
                    ref={(ref) => {
                      inputRefs.current[index] = ref;
                    }}
                    value={value}
                    onChangeText={(text) => updateWord(index, text)}
                    onFocus={() => setActiveIndex(index)}
                    placeholder=""
                    placeholderTextColor={colors.textDim}
                    style={styles.wordInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                  />
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={ui.sectionEyebrow}>Wallet Name</Text>
            <TextInput
              value={walletName}
              onChangeText={(value) => setWalletName(value.slice(0, MAX_WALLET_NAME_LENGTH))}
              placeholder="My imported wallet"
              placeholderTextColor={colors.textDim}
              style={styles.nameInput}
              maxLength={MAX_WALLET_NAME_LENGTH}
            />
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
            disabled={!canContinue}
            onPress={() => void handleImport()}
          >
            <Text style={[ui.buttonLabel, !canContinue && styles.primaryButtonTextDisabled]}>
              {submitting ? 'Importing...' : 'Import Wallet'}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
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
    paddingTop: APP_HEADER_TOP_PADDING,
  },

  headerSlot: {
    height: APP_HEADER_HEIGHT,
    justifyContent: 'center',
  },

  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  content: {
    paddingTop: 14,
    paddingBottom: spacing[7],
  },

  title: {
    marginTop: 8,
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

  lead: {
    ...ui.lead,
    marginTop: 14,
    marginBottom: 22,
  },

  card: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 16,
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

  helperText: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    marginTop: 14,
    marginBottom: 14,
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
  },

  nameInput: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    color: colors.white,
  },

  primaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 6,
  },

  primaryButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  primaryButtonTextDisabled: {
    color: colors.textDim,
  },
});
