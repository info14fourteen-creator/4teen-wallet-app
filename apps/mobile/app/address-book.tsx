import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import AppHeader, {
  APP_HEADER_HEIGHT,
  APP_HEADER_TOP_PADDING,
} from '../src/ui/app-header';
import MenuSheet from '../src/ui/menu-sheet';
import SubmenuHeader from '../src/ui/submenu-header';
import ExpandChevron from '../src/ui/expand-chevron';
import { colors, layout, radius, spacing } from '../src/theme/tokens';
import { ui } from '../src/theme/ui';

type ContactItem = {
  id: string;
  name: string;
  address: string;
};

const STORAGE_KEY = 'fourteen_wallet_address_book_v3';

const defaultContacts: ContactItem[] = [];

function isValidTronAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());
}

export default function AddressBookScreen() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contacts, setContacts] = useState<ContactItem[]>(defaultContacts);
  const [loaded, setLoaded] = useState(false);

  const addressValid = useMemo(() => isValidTronAddress(address), [address]);
  const canSave = name.trim().length > 0 && addressValid;

  useEffect(() => {
    void loadContacts();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    void persistContacts(contacts);
  }, [contacts, loaded]);

  const loadContacts = async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);

      if (!raw) {
        setContacts(defaultContacts);
        return;
      }

      const parsed = JSON.parse(raw) as ContactItem[];

      if (Array.isArray(parsed) && parsed.length > 0) {
        setContacts(parsed);
      } else {
        setContacts(defaultContacts);
      }
    } catch (error) {
      console.error('Failed to load address book', error);
      setContacts(defaultContacts);
    } finally {
      setLoaded(true);
    }
  };

  const persistContacts = async (nextContacts: ContactItem[]) => {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(nextContacts));
    } catch (error) {
      console.error('Failed to save address book', error);
    }
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setAddress(text.trim());
    }
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();

    if (!trimmedName) {
      Alert.alert('Name required', 'Enter a contact name first.');
      return;
    }

    if (!isValidTronAddress(trimmedAddress)) {
      Alert.alert('Invalid address', 'Enter a valid TRON address.');
      return;
    }

    const exists = contacts.some(
      (item) => item.address.toLowerCase() === trimmedAddress.toLowerCase()
    );

    if (exists) {
      Alert.alert('Duplicate contact', 'This TRON address is already saved.');
      return;
    }

    const next: ContactItem = {
      id: `${Date.now()}`,
      name: trimmedName,
      address: trimmedAddress,
    };

    setContacts((prev) => [next, ...prev]);
    setName('');
    setAddress('');
    setListOpen(true);
    setAddOpen(false);
  };

  const handleCopy = async (value: string) => {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', 'Address copied to clipboard.');
  };

  const handleDelete = (id: string) => {
    const next = contacts.filter((item) => item.id !== id);
    setContacts(next.length > 0 ? next : []);
  };

  const handleSend = (contact: ContactItem) => {
    Alert.alert('Send Crypto', `Send flow for ${contact.name} will be connected next.`);
  };

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
        >
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
                  <View style={styles.fieldHeaderRow}>
                    <Text style={ui.sectionEyebrow}>TRON Address</Text>
                    <Text
                      style={[
                        styles.headerValidation,
                        address.length === 0
                          ? styles.headerValidationIdle
                          : addressValid
                            ? styles.headerValidationOk
                            : styles.headerValidationBad,
                      ]}
                    >
                      {address.length === 0
                        ? 'WAITING'
                        : addressValid
                          ? 'VALID'
                          : 'INVALID'}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.addressField,
                      address.length > 0 && !addressValid ? styles.addressFieldInvalid : null,
                    ]}
                  >
                    <TextInput
                      value={address}
                      onChangeText={setAddress}
                      placeholder="T..."
                      placeholderTextColor={colors.textDim}
                      style={styles.addressInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />

                    <TouchableOpacity activeOpacity={0.85} style={styles.pasteIconButton} onPress={handlePaste}>
                      <Ionicons name="clipboard-outline" size={18} color={colors.accent} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.nameSaveRow}>
                  <View style={styles.nameInputWrap}>
                    <Text style={ui.sectionEyebrow}>Name</Text>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="Contact name"
                      placeholderTextColor={colors.textDim}
                      style={styles.input}
                    />
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
                    onPress={handleSave}
                    disabled={!canSave}
                  >
                    <Text
                      style={[
                        styles.saveButtonText,
                        !canSave && styles.saveButtonTextDisabled,
                      ]}
                    >
                      Save
                    </Text>
                  </TouchableOpacity>
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
                {contacts.map((contact) => (
                  <View key={contact.id} style={styles.contactCard}>
                    <Text style={styles.contactName}>{contact.name.toUpperCase()}</Text>
                    <Text
                      style={styles.contactAddress}
                      numberOfLines={1}
                      ellipsizeMode="middle"
                    >
                      {contact.address}
                    </Text>

                    <View style={styles.contactActions}>
                      <TouchableOpacity activeOpacity={0.85} onPress={() => handleCopy(contact.address)} style={styles.actionSlot}>
                        <Text style={styles.copyAction}>Copy Address</Text>
                      </TouchableOpacity>

                      <TouchableOpacity activeOpacity={0.85} onPress={() => handleSend(contact)} style={styles.actionSlot}>
                        <Text style={styles.sendAction}>Send Crypto</Text>
                      </TouchableOpacity>

                      <TouchableOpacity activeOpacity={0.85} onPress={() => handleDelete(contact.id)} style={styles.actionSlot}>
                        <Text style={styles.deleteAction}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {contacts.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No saved contacts yet.</Text>
                  </View>
                ) : null}
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
      <ExpandChevron open={open} />
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

  form: {
    gap: 14,
  },

  inputWrap: {
    gap: 8,
  },

  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerValidation: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
    letterSpacing: 0.3,
  },

  headerValidationIdle: {
    color: colors.textDim,
  },

  headerValidationOk: {
    color: colors.green,
  },

  headerValidationBad: {
    color: colors.red,
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
    paddingRight: 10,
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

  pasteIconButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  nameSaveRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },

  nameInputWrap: {
    flex: 1,
    gap: 8,
  },

  saveButton: {
    minWidth: 74,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,105,0,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },

  saveButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: colors.lineSoft,
  },

  saveButtonText: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Sora_600SemiBold',
  },

  saveButtonTextDisabled: {
    color: colors.textDim,
  },

  contactList: {
    gap: 12,
  },

  contactCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
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

  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },

  actionSlot: {
    flex: 1,
    alignItems: 'center',
  },

  copyAction: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  sendAction: {
    color: colors.green,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  deleteAction: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },

  emptyState: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: 'Sora_600SemiBold',
  },
});
