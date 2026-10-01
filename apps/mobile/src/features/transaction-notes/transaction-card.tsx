import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../../i18n';
import { colors, fontFamilies, radius } from '../../theme/tokens';
import { NOTE_MAX_LENGTH, noteKey, normalizeNote, type NoteTarget } from './model';
import { saveNote } from './storage';
import { useNote } from './use-note';
import { NoteIcon } from './note-icon';

export type NoteTransaction = {
  target: NoteTarget;
  title: string;
  amount: string;
  tokenLabel: string;
  timeLabel: string;
  statusLabel: string;
  from?: string;
  to?: string;
  focusNote?: boolean;
};
type Props = { transaction: NoteTransaction; onClose: () => void; onOpenExplorer: () => void };

export function TransactionCard({ transaction, ...actions }: Omit<Props, 'transaction'> & { transaction: NoteTransaction | null }) {
  if (!transaction) return null;
  return <TransactionCardContent key={noteKey(transaction.target)} transaction={transaction} {...actions} />;
}

export function TransactionCardContent({ transaction, onClose, onOpenExplorer }: Props) {
  const { t } = useI18n();
  const note = useNote(transaction.target);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    if (note.status === 'ready' && baseline === null) {
      setBaseline(note.note);
      setDraft(note.note);
    }
  }, [baseline, note.note, note.status]);

  useEffect(() => {
    alive.current = true;
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        alive.current = false;
        Keyboard.dismiss();
        onClose();
      }
    });
    return () => { alive.current = false; listener.remove(); };
  }, [onClose]);

  const ready = note.status === 'ready' && baseline !== null;
  const cleanDraft = normalizeNote(draft);
  const dirty = baseline !== null && cleanDraft !== baseline;
  const count = Array.from(draft).length;

  function leave(action: () => void) {
    if (busy.current || !alive.current) return;
    if (!dirty) { action(); return; }
    Alert.alert(t('Discard changes?'), t('Your unsaved note will be discarded.'), [
      { text: t('Keep editing'), style: 'cancel' },
      { text: t('Discard'), style: 'destructive', onPress: () => { if (alive.current && !busy.current) action(); } },
    ]);
  }

  async function persist(value: string) {
    if (!ready || busy.current || !alive.current) return;
    busy.current = true;
    setSaving(true); setSaveError(false); setSaved(false);
    try {
      const result = await saveNote(transaction.target, value);
      if (alive.current) { setBaseline(result); setDraft(result); setSaved(true); }
    } catch {
      if (alive.current) setSaveError(true);
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }

  function remove() {
    if (!ready || busy.current) return;
    Alert.alert(t('Delete note?'), t('This only deletes your personal note, not the transaction.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Delete note'), style: 'destructive', onPress: () => persist('') },
    ]);
  }

  return (
    <Modal transparent animationType="fade" statusBarTranslucent visible onRequestClose={() => leave(onClose)}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.card} accessibilityViewIsModal>
            <View style={styles.header}>
              <Text style={styles.title} accessibilityRole="header">{t('Transaction details')}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('Close')} disabled={saving} onPress={() => leave(onClose)} style={styles.close}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
              <View style={styles.summary}>
                <Text style={styles.eyebrow}>{transaction.title}</Text>
                <Text style={styles.amount} selectable>{transaction.amount}</Text>
                <Text style={styles.token}>{transaction.tokenLabel}</Text>
                <Text style={styles.detail}>{transaction.statusLabel} · {transaction.timeLabel}</Text>
              </View>
              <View style={styles.noteSection}>
                <View style={styles.noteHeader}>
                  <NoteIcon filled={Boolean(baseline)} size={24} />
                  <View style={styles.noteHeading}>
                    <Text style={styles.noteTitle}>{t('Personal note')}</Text>
                    <Text style={styles.detail}>{t('Only on this device')}</Text>
                  </View>
                  <Text style={styles.counter}>{count} / {NOTE_MAX_LENGTH}</Text>
                </View>
                {note.status === 'error' ? (
                  <View>
                    <Text style={styles.error} accessibilityRole="alert">{t('Could not load your note. Try again.')}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('Retry')} onPress={note.retry} style={styles.secondary}><Text style={styles.buttonText}>{t('Retry')}</Text></Pressable>
                  </View>
                ) : !ready ? <ActivityIndicator color={colors.accent} accessibilityLabel={t('Loading note...')} /> : (
                  <>
                    <TextInput
                      accessibilityLabel={t('Personal note')}
                      value={draft}
                      onChangeText={value => { setDraft(Array.from(value).slice(0, NOTE_MAX_LENGTH).join('')); setSaveError(false); setSaved(false); }}
                      multiline
                      editable={!saving}
                      autoFocus={transaction.focusNote}
                      placeholder={t('What was this transfer for?')}
                      placeholderTextColor={colors.textDim}
                      style={styles.input}
                      textAlignVertical="top"
                      autoCorrect={false}
                      spellCheck={false}
                      autoComplete="off"
                      importantForAutofill="no"
                    />
                    {saveError && <Text style={styles.error} accessibilityRole="alert">{t('Could not save your note. Your changes are still here.')}</Text>}
                    {saved && <Text style={styles.saved} accessibilityLiveRegion="polite">{t('Note saved')}</Text>}
                    <Pressable accessibilityRole="button" accessibilityLabel={t('Save note')} disabled={!dirty || saving} style={[styles.primary, (!dirty || saving) && styles.disabled]} onPress={() => !cleanDraft && baseline ? remove() : persist(cleanDraft)}>
                      {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>{t('Save note')}</Text>}
                    </Pressable>
                    {Boolean(baseline) && <Pressable accessibilityRole="button" accessibilityLabel={t('Delete note')} disabled={saving} style={styles.secondary} onPress={remove}><Text style={styles.deleteText}>{t('Delete note')}</Text></Pressable>}
                  </>
                )}
                <Text style={styles.privacy}>{t('Private, encrypted on this device. Not sent to the recipient or blockchain. Your recovery phrase does not restore notes.')}</Text>
              </View>
              <View style={styles.metadata}>
                <Text style={styles.eyebrow}>TRON · MAINNET</Text>
                <Text style={styles.detail}>{t('Wallet Address')}</Text>
                <Text style={styles.address} selectable>{transaction.target.address}</Text>
                <Text style={styles.detail}>{t('Transaction ID')}</Text>
                <Text style={styles.address} selectable>{transaction.target.txHash}</Text>
                {transaction.from ? <><Text style={styles.detail}>{t('From')}</Text><Text style={styles.address} selectable>{transaction.from}</Text></> : null}
                {transaction.to ? <><Text style={styles.detail}>{t('To')}</Text><Text style={styles.address} selectable>{transaction.to}</Text></> : null}
                <Pressable accessibilityRole="link" accessibilityLabel={t('View on Tronscan')} disabled={saving} style={styles.secondary} onPress={() => leave(onOpenExplorer)}><Text style={styles.linkText}>{t('View on Tronscan')} ↗</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)' },
  keyboard: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
  card: { width: '100%', maxWidth: 560, maxHeight: '100%', backgroundColor: colors.graphite, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineStrong, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingStart: 20, paddingEnd: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  title: { flex: 1, color: colors.text, fontSize: 17, fontFamily: fontFamilies.display },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 32, color: colors.textSoft, lineHeight: 36 },
  content: { padding: 20, gap: 22 },
  summary: { gap: 6 },
  eyebrow: { color: colors.textDim, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  amount: { fontFamily: fontFamilies.display, fontSize: 28, color: colors.text },
  token: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  detail: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  noteSection: { gap: 12, backgroundColor: colors.surfaceSoft, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.lineSoft },
  noteHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  noteHeading: { flex: 1, minWidth: 100, gap: 2 },
  noteTitle: { fontSize: 16, color: colors.text, fontWeight: '600' },
  counter: { color: colors.textDim, fontSize: 12, fontVariant: ['tabular-nums'] },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 12, color: colors.text, fontSize: 16, lineHeight: 24, minHeight: 104, padding: 14, maxHeight: 200 },
  primary: { minWidth: 48, minHeight: 48, borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  secondary: { minWidth: 48, minHeight: 48, padding: 10, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  deleteText: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  error: { color: colors.red, fontSize: 13, lineHeight: 20 },
  saved: { color: colors.green, fontSize: 13 },
  privacy: { color: colors.textDim, fontSize: 11, lineHeight: 17 },
  metadata: { gap: 8 },
  address: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  linkText: { color: colors.accent, fontSize: 14, textAlign: 'center' },
});
