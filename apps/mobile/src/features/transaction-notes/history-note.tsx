import { Pressable, StyleSheet, Text } from 'react-native';
import { useI18n } from '../../i18n';
import { colors } from '../../theme/tokens';
import { noteKey, type NoteTarget } from './model';
import { NoteIcon } from './note-icon';
import { useNote } from './use-note';

export function getNoteTarget(address: string | undefined, txHash: string): NoteTarget | null {
  const target: NoteTarget = { network: 'tron-mainnet', address: address || '', txHash };
  try { noteKey(target); return target; } catch { return null; }
}

export function HistoryNote({ target, onPress }: { target: NoteTarget; onPress: () => void }) {
  const { t } = useI18n();
  const note = useNote(target);
  const hasNote = note.status === 'ready' && Boolean(note.note);
  const label = hasNote ? t('Edit note') : t('Add note');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={note.status === 'error' ? t('Personal note') : label}
      onPress={onPress}
      style={styles.action}
    >
      <NoteIcon filled={hasNote} />
      <Text style={[styles.text, hasNote && styles.preview]} numberOfLines={2}>
        {hasNote ? note.note : note.status === 'error' ? t('Could not load your note. Try again.') : t('Personal note')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { minWidth: 48, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft, marginTop: 8 },
  text: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 19 },
  preview: { color: colors.textSoft },
});
