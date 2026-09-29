import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { reloadAppAsync } from 'expo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useI18n, useLocaleLayout } from '../src/i18n';
import { ProductScreen } from '../src/ui/product-shell';
import { colors, radius } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';
import { hasPasscode } from '../src/security/local-auth';
import { deleteWalletData, listWalletsForDeletion, WalletDeletionError } from '../src/privacy/delete-wallet-data';
import { isLocalDeletionInProgress } from '../src/privacy/deletion-barrier';
import type { WalletMeta } from '../src/services/wallet/storage';

export default function DeleteWalletScreen() {
  const { t } = useI18n();
  const locale = useLocaleLayout();
  const router = useRouter();
  const params = useLocalSearchParams<{ walletId?: string }>();
  const [wallets, setWallets] = useState<WalletMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [needsPasscode, setNeedsPasscode] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const selected = wallets.find(w => w.id === selectedId);
  const confirming = all || Boolean(selected);
  const frozen = busy || finished || isLocalDeletionInProgress();
  usePreventRemove(frozen, () => {});

  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.all([listWalletsForDeletion(), hasPasscode()]).then(([list, protectedApp]) => {
      if (!active) return;
      setWallets(list);
      setNeedsPasscode(protectedApp);
      if (typeof params.walletId === 'string' && list.some(w => w.id === params.walletId)) setSelectedId(params.walletId);
      setLoading(false);
    }).catch(() => { if (active) { setLoadFailed(true); setError(t('Deletion could not be completed. Keep your backup and try again.')); setLoading(false); } });
    return () => { active = false; };
  }, [params.walletId, t]));

  const finish = async () => {
    try { await reloadAppAsync(); }
    catch { setError(t('Data was deleted. Close and reopen the app to finish.')); }
  };

  const confirm = async () => {
    if (submitting.current || !acknowledged || !confirming || (needsPasscode && passcode.length !== 6)) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await deleteWalletData({ walletId: selectedId ?? undefined, allWallets: all, backupAcknowledged: acknowledged, passcode });
      setPasscode('');
      setFinished(true);
    } catch (failure) {
      if (failure instanceof WalletDeletionError && failure.code === 'passcode') {
        setPasscode('');
        setError(t('Wrong passcode.'));
      } else setError(t('Deletion could not be completed. Keep your backup and try again.'));
    } finally { submitting.current = false; setBusy(false); }
  };

  const back = () => {
    if (frozen) return;
    if (confirming) { setSelectedId(null); setAll(false); setAcknowledged(false); setPasscode(''); setError(''); }
    else router.back();
  };

  return (
    <ProductScreen eyebrow={t('Delete wallet and data')} onBackPress={back} keyboardAware>
      <View style={styles.content}>
        <View style={styles.icon}><MaterialCommunityIcons name={finished ? 'check-circle-outline' : 'delete-outline'} size={32} color={finished ? colors.green : colors.red} /></View>
        <Text style={[styles.title, locale.textStart]}>{t(finished ? 'Deletion complete' : confirming ? 'Confirm deletion' : 'Your wallets, your control')}</Text>
        {finished ? <>
          <Text style={[styles.body, locale.textStart]}>{t(all ? 'All saved wallets, keys and local wallet data have been deleted from this device.' : 'This wallet, its keys and associated local data have been deleted. Other wallets are unchanged.')}</Text>
          <Text style={[styles.body, locale.textStart]}>{t('Blockchain addresses, balances and transactions cannot be erased. This does not send or burn funds.')}</Text>
          <Pressable accessibilityRole="button" onPress={() => void finish()} style={styles.primary}><Text style={styles.button}>{t('Done')}</Text></Pressable>
        </> : loading ? <ActivityIndicator color={colors.accent} /> : loadFailed ? null : confirming ? <>
          <View style={styles.card}>
            {(all ? wallets : selected ? [selected] : []).map(wallet => <View key={wallet.id} style={styles.wallet}>
              <Text style={[ui.actionLabel, locale.textStart]}>{wallet.name}</Text>
              <Text selectable style={styles.address}>{wallet.address}</Text>
            </View>)}
          </View>
          <Text style={[styles.body, locale.textStart]}>{t(all ? 'Deletes all saved wallets, keys, contacts, drafts, preferences and passcode from this device.' : 'Deletes this wallet, its keys, saved token settings and associated local records. Other wallets, app security and unrelated contacts are kept.')}</Text>
          <Text style={[styles.warning, locale.textStart]}>{t('Blockchain addresses, balances and transactions cannot be erased. This does not send or burn funds.')}</Text>
          <Text style={[styles.warning, locale.textStart]}>{t('Without a recovery phrase or private key backup, you may permanently lose access to your funds. 4TEEN cannot restore your keys.')}</Text>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acknowledged, disabled: frozen }} disabled={frozen} style={[styles.check, locale.row]} onPress={() => setAcknowledged(v => !v)}>
            <MaterialCommunityIcons name={acknowledged ? 'checkbox-marked' : 'checkbox-blank-outline'} size={26} color={acknowledged ? colors.accent : colors.textSoft} />
            <Text style={[styles.checkText, locale.textStart]}>{t('I have saved any required recovery phrase or private key and understand that deletion cannot be undone.')}</Text>
          </Pressable>
          {needsPasscode ? <View style={styles.field}>
            <Text style={[styles.body, locale.textStart]}>{t('Confirm with Passcode')}</Text>
            <TextInput accessibilityLabel={t('Passcode')} style={styles.input} value={passcode} onChangeText={value => setPasscode(value.replace(/\D/g, '').slice(0, 6))} secureTextEntry keyboardType="number-pad" maxLength={6} autoCorrect={false} editable={!busy} />
          </View> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !acknowledged || (needsPasscode && passcode.length !== 6) }} disabled={busy || !acknowledged || (needsPasscode && passcode.length !== 6)} onPress={() => void confirm()} style={[styles.danger, (busy || !acknowledged || (needsPasscode && passcode.length !== 6)) && styles.disabled]}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.button}>{t(all ? 'Delete all wallets and wallet data' : 'Delete this wallet')}</Text>}
          </Pressable>
          {!frozen ? <Pressable accessibilityRole="button" onPress={back} style={styles.secondary}><Text style={styles.button}>{t('Cancel')}</Text></Pressable> : null}
        </> : <>
          <Text style={[styles.body, locale.textStart]}>{t('4TEEN creates local wallets, not a server account. Delete one wallet or all saved wallets and local wallet data.')}</Text>
          {wallets.map(wallet => <Pressable key={wallet.id} accessibilityRole="button" accessibilityLabel={`${t('Delete this wallet')}: ${wallet.name}`} onPress={() => { setSelectedId(wallet.id); setAcknowledged(false); setError(''); }} style={[styles.row, locale.row]}>
            <View style={styles.rowText}><Text style={[ui.actionLabel, locale.textStart]}>{wallet.name}</Text><Text style={styles.address}>{wallet.address}</Text></View>
            <MaterialCommunityIcons name="delete-outline" size={24} color={colors.red} />
          </Pressable>)}
          <Pressable accessibilityRole="button" onPress={() => { setAll(true); setAcknowledged(false); setError(''); }} style={styles.secondary}><Text style={[styles.button, { color: colors.red }]}>{t('Delete all wallets and wallet data')}</Text></Pressable>
        </>}
        {error ? <Text accessibilityRole="alert" style={styles.warning}>{error}</Text> : null}
      </View>
    </ProductScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingBottom: 24 },
  icon: { alignSelf: 'flex-start', padding: 14, backgroundColor: colors.surfaceSoft, borderRadius: radius.md },
  title: { color: colors.text, fontSize: 24, lineHeight: 32, fontFamily: 'Sora_600SemiBold' },
  body: { color: colors.textSoft, fontSize: 14, lineHeight: 22 },
  warning: { color: colors.red, fontSize: 14, lineHeight: 22 },
  card: { padding: 16, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: radius.md, gap: 14 },
  wallet: { gap: 8 },
  address: { color: colors.textDim, fontSize: 12, lineHeight: 19 },
  row: { minHeight: 76, padding: 16, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: radius.md, alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 8 },
  check: { minHeight: 64, gap: 12, alignItems: 'center' },
  checkText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 22 },
  field: { gap: 10 },
  input: { minHeight: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineSoft, color: colors.text, fontSize: 22, paddingHorizontal: 16 },
  primary: { minHeight: 56, borderRadius: radius.md, backgroundColor: colors.accent, padding: 16, alignItems: 'center', justifyContent: 'center' },
  danger: { minHeight: 56, borderRadius: radius.md, backgroundColor: colors.red, padding: 16, alignItems: 'center', justifyContent: 'center' },
  secondary: { minHeight: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineSoft, padding: 16, alignItems: 'center', justifyContent: 'center' },
  button: { color: colors.white, fontSize: 15, lineHeight: 22, fontFamily: 'Sora_600SemiBold', textAlign: 'center' },
  disabled: { opacity: 0.4 },
});
