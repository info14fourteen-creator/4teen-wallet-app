import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import SubmenuHeader from '../src/ui/submenu-header';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

type ContactItem = {
  id: string;
  name: string;
  address: string;
};

const initialContacts: ContactItem[] = [
  {
    id: '1',
    name: 'Stan',
    address: 'TMLXiCW2ZAkvjmn79ZXa4vdHX5BE3n9x4A',
  },
  {
    id: '2',
    name: 'Treasury',
    address: 'TVKBLwg222skKnZ3F3boTiH35KC7nvYEuZ',
  },
];

function isValidTronAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());
}

export default function AddressBookScreen() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const addressValid = useMemo(() => isValidTronAddress(address), [address]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <AppHeader onMenuPress={() => setMenuOpen(true)} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SubmenuHeader title="ADDRESS BOOK" onBack={() => router.back()} />

          <View style={styles.block}>
            <ExpandableHeader
              label="Add Contact"
              open={addOpen}
              onPress={() => setAddOpen((prev) => !prev)}
            />

            {addOpen ? (
              <View style={styles.form}>
                <View style={styles.inputWrap}>
                  <Text style={ui.sectionEyebrow}>Name</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Contact name"
                    placeholderTextColor={colors.textDim}
                    style={styles.input}
                  />
                </View>

                <View style={styles.inputWrap}>
                  <Text style={ui.sectionEyebrow}>TRON Address</Text>

                  <View style={[styles.addressField, address.length > 0 && !addressValid ? styles.addressFieldInvalid : null]}>
                    <TextInput
                      value={address}
                      onChangeText={setAddress}
                      placeholder="T..."
                      placeholderTextColor={colors.textDim}
                      style={styles.addressInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />

                    <TouchableOpacity activeOpacity={0.85} style={styles.pasteButton}>
                      <Ionicons name="clipboard-outline" size={16} color={colors.accent} />
                      <Text style={styles.pasteText}>Paste</Text>
                    </TouchableOpacity>
                  </View>

                  {address.length > 0 ? (
                    <Text style={[styles.validation, addressValid ? styles.validationOk : styles.validationBad]}>
                      {addressValid ? 'Valid TRON address' : 'Invalid TRON address'}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.block}>
            <ExpandableHeader
              label="List of Contacts"
              open={listOpen}
              onPress={() => setListOpen((prev) => !prev)}
            />

            {listOpen ? (
              <View style={styles.contactList}>
                {initialContacts.map((contact) => (
                  <View key={contact.id} style={styles.contactCard}>
                    <View style={styles.contactText}>
                      <Text style={styles.contactName}>{contact.name.toUpperCase()}</Text>
                      <Text style={styles.contactAddress}>{contact.address}</Text>
                    </View>

                    <TouchableOpacity activeOpacity={0.9} style={styles.sendButton}>
                      <Text style={styles.sendButtonText}>Send</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>

        <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      </View>
    </SafeAreaView>
  );
}

function ExpandableHeader({
  label,
  open,
  onPress,
}: {
  label: string;
  open: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.headerRow} onPress={onPress}>
      <Text style={ui.actionLabel}>{label}</Text>
      <Text style={styles.chevron}>{open ? '⌄' : '›'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: APP_HEADER_TOP_PADDING,
  },

  headerSlot: { height: APP_HEADER_HEIGHT, justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingTop: 14, paddingBottom: spacing[7], gap: 18 },

  block: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 16,
    gap: 12,
  },

  headerRow: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  chevron: {
    color: colors.accent,
    fontSize: 24,
    lineHeight: 24,
  },

  form: {
    gap: 14,
  },

  inputWrap: {
    gap: 8,
  },

  input: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    color: colors.white,
  },

  addressField: {
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingLeft: 14,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  addressFieldInvalid: {
    borderColor: colors.red,
  },

  addressInput: {
    flex: 1,
    color: colors.white,
  },

  pasteButton: {
    minHeight: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  pasteText: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  validation: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  validationOk: {
    color: colors.green,
  },

  validationBad: {
    color: colors.red,
  },

  contactList: {
    gap: 12,
  },

  contactCard: {
    minHeight: 72,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  contactText: {
    flex: 1,
    gap: 4,
  },

  contactName: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_700Bold',
    letterSpacing: 0.35,
  },

  contactAddress: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  sendButton: {
    minHeight: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(255,105,0,0.08)',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sendButtonText: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
});
