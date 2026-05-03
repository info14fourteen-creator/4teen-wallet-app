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
import { getRandomBytesAsync } from 'expo-crypto';
import { entropyToMnemonic, wordlists } from 'bip39';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  createWalletFromGeneratedMnemonic,
  getMnemonicSuggestions,
  normalizeMnemonicInput,
} from '../src/services/wallet/import';
import { ConfirmIcon } from '../src/ui/ui-icons';
import { hasPasscode } from '../src/security/local-auth';

const MAX_WALLET_NAME_LENGTH = 18;
const CREATE_WALLET_INFO_TITLE = 'How wallet creation works';
const CREATE_WALLET_INFO_TEXT =
  'This flow creates a new seed-based wallet on this device. First you choose a 12-word or 24-word recovery phrase and set a local wallet name.\n\nThe app then generates the phrase, asks you to back it up offline, and checks a few requested words before the wallet is finally saved.\n\nThe recovery phrase is the real backup. Anyone with it can fully control the wallet, and 4TEEN does not store it on our servers.';

type CreateStage = 'setup' | 'reveal' | 'verify';

function buildWords(count: number) {
  return Array.from({ length: count }, () => '');
}

function maskWord(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return '•'.repeat(Math.max(4, Math.min(trimmed.length, 8)));
}

function pickVerificationIndexes(wordCount: 12 | 24) {
  const picked = new Set<number>();

  while (picked.size < 3) {
    picked.add(Math.floor(Math.random() * wordCount));
  }

  return Array.from(picked).sort((a, b) => a - b);
}

function resolveInitialWordCount(raw: string | string[] | undefined): 12 | 24 {
  const safe = typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0] || '') : '';
  return safe === '24' ? 24 : 12;
}

function resolveInitialWalletName(raw: string | string[] | undefined) {
  const safe = typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0] || '') : '';
  return decodeURIComponent(safe || '').slice(0, MAX_WALLET_NAME_LENGTH);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default function CreateWalletScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ wordCount?: string; walletName?: string }>();
  const navInsets = useNavigationInsets({ topExtra: 14 });
  const notice = useNotice();
  const { t } = useI18n();
  const contentBottomInset = useBottomInset();
  const [stage, setStage] = useState<CreateStage>('setup');
  const [wordCount, setWordCount] = useState<12 | 24>(() => resolveInitialWordCount(params.wordCount));
  const [walletName, setWalletName] = useState(() => resolveInitialWalletName(params.walletName));
  const [generatedWords, setGeneratedWords] = useState<string[]>([]);
  const [verifyIndexes, setVerifyIndexes] = useState<number[]>([]);
  const [verifyWords, setVerifyWords] = useState<string[]>(buildWords(3));
  const [activeVerifyIndex, setActiveVerifyIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);

  const verifyInputRefs = useRef<(TextInput | null)[]>([]);
  const walletNameRef = useRef<TextInput | null>(null);

  const walletNameTrimmed = walletName.trim();
  const canGenerate =
    walletNameTrimmed.length > 0 &&
    walletNameTrimmed.length <= MAX_WALLET_NAME_LENGTH &&
    !submitting;

  const generatedMnemonic = useMemo(() => generatedWords.join(' '), [generatedWords]);

  const activeVerifyValue =
    activeVerifyIndex !== null && activeVerifyIndex >= 0 && activeVerifyIndex < verifyWords.length
      ? verifyWords[activeVerifyIndex].trim().toLowerCase()
      : '';

  const verifySuggestions = useMemo(
    () => getMnemonicSuggestions(activeVerifyValue),
    [activeVerifyValue]
  );

  const canFinish =
    stage === 'verify' &&
    verifyIndexes.length === 3 &&
    verifyWords.every((item) => item.trim().length > 0) &&
    !submitting;

  const focusVerifyIndex = useCallback((index: number | null) => {
    if (index === null) return;

    requestAnimationFrame(() => {
      verifyInputRefs.current[index]?.focus();
    });
  }, []);

  const focusWalletName = useCallback(() => {
    requestAnimationFrame(() => {
      walletNameRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    if (stage !== 'verify' || activeVerifyIndex === null || verifySuggestions.length === 0 || !activeVerifyValue) {
      notice.hideNotice();
      return;
    }

    notice.showAckNotice(
      t('Word {{index}} suggestions', { index: verifyIndexes[activeVerifyIndex] + 1 }),
      verifySuggestions.slice(0, 6).map((word) => ({
        label: word,
        onPress: () => {
          setVerifyWords((prev) => {
            const next = [...prev];
            next[activeVerifyIndex] = word;
            return next;
          });

          const nextIndex = activeVerifyIndex + 1 < verifyWords.length ? activeVerifyIndex + 1 : null;
          setActiveVerifyIndex(nextIndex);

          if (nextIndex !== null) {
            focusVerifyIndex(nextIndex);
          } else {
            Keyboard.dismiss();
            notice.hideNotice();
          }
        },
      })),
      'neutral'
    );
  }, [
    activeVerifyIndex,
    activeVerifyValue,
    focusVerifyIndex,
    notice,
    t,
    verifyIndexes,
    verifySuggestions,
    verifyWords.length,
    stage,
  ]);

  const handleGenerate = useCallback(async () => {
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

    const passcodeReady = await hasPasscode();

    if (!passcodeReady) {
      router.push({
        pathname: '/create-passcode',
        params: {
          next: `/create-wallet?wordCount=${wordCount}&walletName=${encodeURIComponent(walletNameTrimmed)}`,
          flow: 'create-passcode',
        },
      } as any);
      return;
    }

    const entropyBytes = await getRandomBytesAsync(wordCount === 24 ? 32 : 16);
    const mnemonic = entropyToMnemonic(bytesToHex(entropyBytes), wordlists.english);
    const words = normalizeMnemonicInput(mnemonic);

    setGeneratedWords(words);
    setVerifyIndexes(pickVerificationIndexes(wordCount));
    setVerifyWords(buildWords(3));
    setActiveVerifyIndex(null);
    setStage('reveal');
    notice.hideNotice();
  }, [focusWalletName, notice, router, t, walletNameTrimmed, wordCount]);

  const handleCopyPhrase = useCallback(async () => {
    if (!generatedMnemonic) return;
    await Clipboard.setStringAsync(generatedMnemonic);
    notice.showSuccessNotice(t('Copied {{count}}-word phrase.', { count: wordCount }), 2200);
  }, [generatedMnemonic, notice, t, wordCount]);

  const handleStartVerify = useCallback(() => {
    if (!generatedWords.length) return;
    setVerifyWords(buildWords(3));
    setActiveVerifyIndex(0);
    setStage('verify');
    focusVerifyIndex(0);
    notice.hideNotice();
  }, [focusVerifyIndex, generatedWords.length, notice]);

  const handleVerifyWordChange = useCallback((index: number, value: string) => {
    const raw = value.toLowerCase();
    const parsed = normalizeMnemonicInput(raw);

    setVerifyWords((prev) => {
      const next = [...prev];
      next[index] = parsed[0] ?? raw.trimStart();
      return next;
    });
  }, []);

  const handleCreateWallet = useCallback(async () => {
    if (!canFinish || !generatedMnemonic) return;

    const mismatchIndex = verifyIndexes.findIndex((wordIndex, localIndex) => {
      return generatedWords[wordIndex] !== verifyWords[localIndex].trim().toLowerCase();
    });

    if (mismatchIndex !== -1) {
      notice.showErrorNotice(t('Word {{index}} does not match the generated phrase.', { index: verifyIndexes[mismatchIndex] + 1 }), 3000);
      setVerifyWords((prev) => {
        const next = [...prev];
        next[mismatchIndex] = '';
        return next;
      });
      setActiveVerifyIndex(mismatchIndex);
      focusVerifyIndex(mismatchIndex);
      return;
    }

    try {
      setSubmitting(true);
      notice.hideNotice();
      Keyboard.dismiss();

      await createWalletFromGeneratedMnemonic({
        name: walletNameTrimmed,
        mnemonic: generatedMnemonic,
      });

      notice.showSuccessNotice(t('Seed wallet created.'), 2400);
      router.replace('/wallet');
    } catch (error) {
      console.warn('CREATE WALLET FAILED', error);
      const message = error instanceof Error ? error.message : t('Failed to create wallet.');
      notice.showErrorNotice(message, 3200);
    } finally {
      setSubmitting(false);
    }
  }, [
    canFinish,
    focusVerifyIndex,
    generatedMnemonic,
    generatedWords,
    notice,
    router,
    t,
    verifyIndexes,
    verifyWords,
    walletNameTrimmed,
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
            label={t('CREATE WALLET')}
            variant="backLink"
            onLabelPress={() => setInfoExpanded((prev) => !prev)}
            labelAccessory={<InfoToggleIcon expanded={infoExpanded} />}
          />

          {infoExpanded ? (
            <View style={styles.infoPanel}>
              <Text style={styles.infoTitle}>{t(CREATE_WALLET_INFO_TITLE)}</Text>
              <Text style={styles.infoText}>{t(CREATE_WALLET_INFO_TEXT)}</Text>
            </View>
          ) : null}

          {stage === 'setup' ? (
            <>
              <Text style={styles.title}>
                <Text style={styles.titleAccent}>{t('Create a new wallet from a recovery phrase')}</Text>
              </Text>

              <Text style={styles.noticeLine}>
                {t('Create the wallet here, then back up the generated phrase before saving it.')}
              </Text>

              <View style={styles.switchRow}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.switchButton, wordCount === 12 && styles.switchButtonActive]}
                  onPress={() => setWordCount(12)}
                >
                  <Text style={[styles.switchText, wordCount === 12 && styles.switchTextActive]}>
                    {t('12 Words')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.switchButton, wordCount === 24 && styles.switchButtonActive]}
                  onPress={() => setWordCount(24)}
                >
                  <Text style={[styles.switchText, wordCount === 24 && styles.switchTextActive]}>
                    {t('24 Words')}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.helperTextCentered}>
                {wordCount === 12
                  ? t('12 words is faster to back up. 24 words adds more entropy.')
                  : t('24 words gives the longest recovery phrase this app supports.')}
              </Text>

              <Text style={styles.walletNameEyebrow}>{t('Wallet Name')}</Text>

              <View style={styles.nameField}>
                <TextInput
                  ref={walletNameRef}
                  value={walletName}
                  onChangeText={(value) => setWalletName(value.slice(0, MAX_WALLET_NAME_LENGTH))}
                  placeholder={t('Main wallet')}
                  placeholderTextColor={colors.textDim}
                  style={styles.nameInput}
                  maxLength={MAX_WALLET_NAME_LENGTH}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleGenerate()}
                />

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.nameConfirmButton, !canGenerate && styles.nameConfirmButtonDisabled]}
                  onPress={() => void handleGenerate()}
                >
                  <ConfirmIcon width={18} height={18} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.primaryButton, !canGenerate && styles.primaryButtonDisabled]}
                onPress={() => void handleGenerate()}
              >
                <Text style={[ui.buttonLabel, !canGenerate && styles.primaryButtonTextDisabled]}>
                  {t('GENERATE PHRASE')}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}

          {stage === 'reveal' ? (
            <>
              <Text style={styles.title}>
                <Text style={styles.titleAccent}>{t('Back up your recovery phrase')}</Text>
              </Text>

              <Text style={styles.noticeLine}>
                {t('Write these {{count}} words down in order and store them offline.', { count: wordCount })}
              </Text>

              <Text style={styles.helperTextCentered}>
                {t('Showing {{shown}}/{{total}} generated recovery words', {
                  shown: generatedWords.length,
                  total: wordCount,
                })}
              </Text>

              <Text style={styles.blockEyebrow}>{t('RECOVERY PHRASE')}</Text>

              <View style={styles.grid}>
                {generatedWords.map((value, index) => (
                  <View key={index} style={styles.wordCell}>
                    <Text style={styles.wordIndex}>{index + 1}</Text>
                    <Text style={styles.generatedWordText}>{value}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.secondaryButton}
                onPress={() => void handleCopyPhrase()}
              >
                <Text style={ui.buttonLabel}>{t('COPY PHRASE')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.primaryButton}
                onPress={handleStartVerify}
              >
                <Text style={ui.buttonLabel}>{t('I BACKED IT UP')}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {stage === 'verify' ? (
            <>
              <Text style={styles.title}>
                <Text style={styles.titleAccent}>{t('Verify 3 words')}</Text>
              </Text>

              <Text style={styles.noticeLine}>
                {t('Enter the requested words exactly as they appeared in the backup phrase.')}
              </Text>

              <Text style={styles.helperTextCentered}>
                {t('Verify only the requested words. The full {{count}}-word phrase is not retyped here.', {
                  count: wordCount,
                })}
              </Text>

              <Text style={styles.blockEyebrow}>{t('Verification')}</Text>

              <View style={styles.grid}>
                {verifyIndexes.map((wordIndex, index) => {
                  const value = verifyWords[index] || '';
                  const isActive = activeVerifyIndex === index;
                  const hasValue = value.trim().length > 0;

                  return (
                    <View key={wordIndex} style={[styles.wordCell, isActive && styles.wordCellActive]}>
                      <Text style={styles.wordIndex}>{wordIndex + 1}</Text>

                      {isActive || !hasValue ? (
                        <TextInput
                          ref={(ref) => {
                            verifyInputRefs.current[index] = ref;
                          }}
                          value={value}
                          onChangeText={(text) => handleVerifyWordChange(index, text)}
                          onFocus={() => setActiveVerifyIndex(index)}
                          onSubmitEditing={() => {
                            const nextIndex = index + 1 < verifyIndexes.length ? index + 1 : null;
                            setActiveVerifyIndex(nextIndex);

                            if (nextIndex !== null) {
                              focusVerifyIndex(nextIndex);
                            } else {
                              Keyboard.dismiss();
                            }
                          }}
                          placeholder=""
                          placeholderTextColor={colors.textDim}
                          style={styles.wordInput}
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="off"
                          returnKeyType={index + 1 < verifyIndexes.length ? 'next' : 'done'}
                        />
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={styles.maskedWordButton}
                          onPress={() => {
                            setActiveVerifyIndex(index);
                            focusVerifyIndex(index);
                          }}
                        >
                          <Text style={styles.maskedWordText}>{maskWord(value)}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.secondaryButton}
                onPress={() => {
                  setStage('reveal');
                  setActiveVerifyIndex(null);
                  notice.hideNotice();
                }}
              >
                <Text style={ui.buttonLabel}>{t('BACK TO PHRASE')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.primaryButton, !canFinish && styles.primaryButtonDisabled]}
                onPress={() => void handleCreateWallet()}
              >
                <Text style={[ui.buttonLabel, !canFinish && styles.primaryButtonTextDisabled]}>
                  {submitting ? t('CREATING WALLET...') : t('CREATE WALLET')}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
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

  generatedWordText: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
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

  secondaryButton: {
    minHeight: layout.buttonHeight,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineStrong,
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
